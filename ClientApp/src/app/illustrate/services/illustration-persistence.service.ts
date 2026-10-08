import { Injectable, NgZone, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { gunzipFromBase64, gunzipFromBinary, gzipToBlob } from '../utils/gzip-utils';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { FrogFileService } from 'app/shared/services/illustrate/frog-file.service';
import { IllustrationService } from 'app/shared/services/illustrate/illustration.service';
import { LayerEffectsService } from './layer-effects.service';
import { LocalIllustrationService } from 'app/shared/services/illustrate/local-illustration.service';
import { NotifyService } from 'app/shared/services/notify/notify.service';
import { OpfsMetadataService } from 'app/shared/services/illustrate/opfs-metadata.service';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';
import { RasterAutoSaveService } from 'app/shared/services/raster/raster-autosave.service';
import { RasterBrushService } from 'app/shared/services/raster/raster-brush.service';
import { Scene3dSettingsService } from './scene3d-settings.service';
import { SceneAnimationService } from './scene-animation.service';
import { IllustrationStateDto, LayerStateDto } from 'app/shared/services/illustrate/illustration.service';
import { Illustration } from 'app/illustrate/models/illustration.model';
import { auditTime, debounceTime, distinctUntilChanged, firstValueFrom, map, Subject, Subscription } from 'rxjs';
import { hexToRgba01 } from '../utils/color-utils';
import { OnionSkinConfig, LoopMode } from 'app/shared/services/raster/raster-animation.service';
import { AutoSaveState } from 'app/shared/services/raster/raster-autosave.service';
import { DitherConfig } from 'app/boards/models/brush-preset.model';

import { CanvasAppearanceService } from './canvas-appearance.service';
import { ArtboardService } from './artboard.service';
import { EditorStateService } from './editor-state.service';
import { startBlankEngineDocument } from '../utils/blank-engine-document';
import { SaveStatus, saveStatusOf } from './save-status';
import { takePendingProjectImport, type PendingProjectImport } from 'app/shared/services/illustrate/pending-project-import';
import { cloudSceneGraphJSON, toVectorSceneGraphJSON } from '../utils/cloud-scene-graph';
import { celExporter, CloudUploadVersions, contentVersionsDiffer, hasContentVersionApi, readContentVersions, type RasterContentVersions } from '../utils/cloud-pixel-versions';

/** How often a cloud document checks the engine's raster content versions for edits no other event announced
 *  (a fill, undo, paste, transform, filter, … — see _pollPixelChanges). Only a number compare while nothing changed. */
const PIXEL_POLL_MS = 5000;
/** Exactly the editor state persistence reads and writes (canvas settings, layer tree, document size, 3D host
 *  state, loading lifecycle). Typed against the editor so a rename breaks here at compile time. */
export type PersistenceHost = Pick<IllustrationComponent, 'shapeManager' | 'doc' | '_scene3dReconstructGroups' | 'setAnimationEnabled' |
  'applyFrogImport' | 'canvas' |
  'garpCanDesigns' | 'isLoading' |
  'markLoaded' | 'refreshRasterLayers' | 'resetSceneState' | 'scene3dAllGroupBuckets' | 'scene3dRefreshMeshes' | 'selectedAutoSaveInterval' | 'uiPanel'
>;

/**
 * Document persistence: load (local / OPFS / cloud), save (meta + pixel / mesh / texture-library uploads, the
 * quick OPFS meta flush), dirty tracking, thumbnails, save-blocked state and the autosave wiring. Component-scoped
 * (provided by IllustrationComponent). Bodies moved verbatim from illustration.component (refactor-plan 2.8 step A);
 * the async order of load / save is unchanged.
 */
@Injectable()
export class IllustrationPersistenceService implements OnDestroy {
  private host!: PersistenceHost;
  constructor(private editorState: EditorStateService, private artboard: ArtboardService, private canvasLook: CanvasAppearanceService, private anim: SceneAnimationService, private animationService: RasterAnimationService, private autoSaveService: RasterAutoSaveService, private frogFileService: FrogFileService, private fx: LayerEffectsService, private illustrationService: IllustrationService, private localIllustrationService: LocalIllustrationService, private notifyService: NotifyService, private opfsMetadataService: OpfsMetadataService, private s3: Scene3dSettingsService, private ngZone?: NgZone, private rasterBrush?: RasterBrushService) {}
  bind(host: PersistenceHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  /** The editor instance (and this service) is reused across a document switch — drop the previous document's
   *  subscriptions and per-document bookkeeping so nothing carries over (dirty / uploaded layer sets, tex-lib flag,
   *  save-blocked banner, empty-state, thumbnail cache; the autosave-state subscription used to leak per document). */
  _resetForNewDocument(): void {
    this.autoSaveSubscription?.unsubscribe();
    this._metaFlushSub?.unsubscribe();
    this.thumbnailSaveSubscription?.unsubscribe();
    this._autoSaveStateSub?.unsubscribe(); this._autoSaveStateSub = null;
    this._pendingChangeSub?.unsubscribe(); this._pendingChangeSub = null;
    this._pendingChange = false;
    this._serverRevision = null;
    this._cloudConflict = false;
    this._dirtyLayerIds.clear();
    this._uploadedLayerIds.clear();
    this._cloudVersions.clear();
    this._stopPixelPoll();
    this.rasterStrokeActive = false;
    this._cloudWarningShown = false;
    this._texLibDirty = false;
    this._uploadAllMeshes = false;
    this._saveQueued = false;
    this._saveWhenLoaded = false;
    this.fx.layerDitherConfigs.clear();       // repopulated from the engine on load
    this.fx.layerFrameLinkConfigs.clear();    // read lazily from the engine
    this.noCloudEmptyState = false;
    this.saveBlockedReason = null;
    this.saveBlockedAreas = [];
    this.saveBlockedByNewerVersion = false;
    this.lastSavedThumbnailJSON = '';
    this.lastThumbnailTime = 0;
    this._rasterEditedSinceThumbnail = false;
    this.autoSaveState = 'idle';
  }

  /**
   * Before a document loads: unbind the autosave from the previous document and give the engine (and the app-wide
   * animation state) a BLANK document. The ShapeManager outlives every document, so without this a document with
   * nothing saved yet (New Illustration, a new Shell project) opened on top of the previous one's layers, shapes, 3D,
   * characters, city and settings — and its first save wrote them in as its own. The editor calls this right after
   * the renderer boots, before it subscribes to the engine (the reset's scene-changed event is not "loaded").
   * @param localUuid the local-only document's uuid (its Salsa id is `local-<uuid>`); null for a cloud document,
   *                  whose id is bound once it is resolved (until then nothing can be saved).
   */
  async startBlankDocument(sm: ShapeManager, localUuid: string | null): Promise<void> {
    this.autoSaveService.disable();              // nothing may save into the previous document from here on
    this.animationService.resetForNewDocument();
    await startBlankEngineDocument(sm, localUuid ? 'local-' + localUuid : undefined);
    // Brush presets are per-document: the reset dropped the previous document's custom brushes — the list follows
    this.rasterBrush?.refreshPresets();
  }

  private _autoSaveStateSub: { unsubscribe(): void } | null = null;

  ngOnDestroy(): void {
    this._stopPixelPoll();
    this._autoSaveStateSub?.unsubscribe();
    this.autoSaveSubscription?.unsubscribe();
    this._metaFlushSub?.unsubscribe();
    this.thumbnailSaveSubscription?.unsubscribe();
  }

  autoSaveState: AutoSaveState = 'idle';

  illustrationUid: string | null = null;

  illustration: Illustration | null = null;

  autoSaveSubscription!: Subscription;

  thumbnailSaveSubscription!: Subscription;

  // Fix 1: concurrent save guard
  _saveRunning = false;

  _saveQueued = false;

  // Opt 1: texture library dirty flag — skip re-uploading when only geometry/transforms changed
  _texLibDirty = false;

  // Fix 3: per-layer dirty tracking — only upload layers that had strokes since last save
  _dirtyLayerIds = new Set<string>();

  _uploadedLayerIds = new Set<string>();

  /** A change is waiting in the autosave debounce (set by sceneChanged$, cleared when a save starts). */
  _pendingChange = false;
  private _pendingChangeSub: Subscription | null = null;
  /** The running save, so a flush can wait for it. */
  private _saveInFlight: Promise<void> | null = null;

  /**
   * Save the CURRENT document now: wait for a running save, write a change still waiting in the 2 s autosave
   * debounce, and let Salsa save its pixel layers. Call before switching documents or leaving the editor — a pending
   * change used to be dropped (audit Phase 2.3). Never throws.
   */
  async flushPendingSave(): Promise<void> {
    if (!this.illustration || this.host.isLoading) return;
    try {
      if (this._saveInFlight) await this._saveInFlight.catch(() => {});
      // …or a pixel edit no event announced yet (a fill / undo / paste … since the last upload: content versions)
      if (this._pendingChange || this._saveQueued || this._pixelsChangedSinceUpload()) {
        this._saveQueued = false;
        await this.saveIllustrationV2();
      }
      if (this._saveInFlight) await this._saveInFlight.catch(() => {});
      if (!this._isSaveBlocked()) await this.autoSaveService.saveNow();
    } catch (e) {
      console.warn('[Save] flush before leaving the document failed', e);
    }
  }

  /** Something still unsaved (for the tab-close warning). */
  get hasUnsavedChanges(): boolean {
    return this._pendingChange || this._saveRunning || this._saveQueued;
  }

  /** Server revision of the loaded / last saved state (audit Phase 2.5). Sent as baseRevision with each cloud save;
   *  null = unknown (the server then skips the check). */
  _serverRevision: number | null = null;
  /** Another tab / device saved this document since it was loaded here: cloud saves pause until reload. */
  _cloudConflict = false;

  /** loadState + remember the revision it reports. */
  async _fetchServerState(id: number): Promise<any> {
    const res = await firstValueFrom(this.illustrationService.loadState(id));
    const rev = res?.resultObject?.revision;
    if (typeof rev === 'number') this._serverRevision = rev;
    return res;
  }

  private _onCloudConflict(): void {
    if (this._cloudConflict) return;
    this._cloudConflict = true;
    this.notifyService.error('This illustration was saved from another tab or device. Saving here is paused so it ' +
      "doesn't overwrite that — reload to get the latest.");
  }

  /** Snapshot sequence for OPFS metadata writes (see OpfsMetadataService.write). */
  private _metaSeq = 0;
  private _lastLocalSaveFailNotice = 0;

  /** A local-only save could not be written to browser storage (quota / permission / storage evicted). At most one
   *  notice a minute — autosave retries on the next change. */
  private _notifyLocalSaveFailed(): void {
    const now = Date.now();
    if (now - this._lastLocalSaveFailNotice < 60_000) return;
    this._lastLocalSaveFailNotice = now;
    this.notifyService.error("Could not save to this browser's storage. Your latest changes are not saved yet — check free disk space.");
  }

  /** Write current non-pixel settings (dither, bgColor, etc.) to OPFS metadata fast,
   *  without waiting for the 2s cloud-save debounce. Ensures a quick refresh doesn't lose changes. */
  async _quickFlushOpfsMeta(): Promise<void> {
    if (!this.illustration || (this.syncMode !== 2 && !this.illustration.id) || this.host.isLoading) return;
    if (this._isSaveBlocked()) return;
    try {
      // Full payload: a meta written without the 3D host state (cuts, can designs, buckets) and then preferred on a
      // quick refresh used to lose them for good.
      const seq = ++this._metaSeq;   // taken before the build: an older snapshot can't overwrite a newer one
      const state = await this._buildFullState();
      const key = this.syncMode === 2
        ? 'local-' + (this.illustration.uuid ?? '')
        : this.illustration.id!.toString();
      (state as any).backendSynced = false;
      void this.opfsMetadataService.write(key, state, seq);   // serialized per document in OpfsMetadataService
    } catch (e) {
      console.warn('[QuickFlush] OPFS meta write failed', e);
    }
  }

  sceneChanged$ = new Subject<string>();

  _metaFlush$ = new Subject<void>();

  _metaFlushSub?: Subscription;

  // Sync mode for current illustration: 0=CloudSync, 1=NoCloud, 2=LocalOnly
  syncMode = 0;

  isLocalMode = false;

  noCloudEmptyState = false;

  /** The document in the URL could not be opened (UI review d27 / d30): 'local' = not in this browser's storage,
   *  'cloud' = the server has no such document or could not be reached. Nothing is bound, so nothing would save: the
   *  editor shows a "Document not found" screen instead of an editable page that silently drops the work. */
  documentMissing: 'local' | 'cloud' | null = null;

  /** The top bar's save status (save-status.ts). */
  get saveStatus(): SaveStatus {
    return saveStatusOf({
      autoSave: this.autoSaveState,
      pending: this.hasUnsavedChanges,
      loading: !!this.host?.isLoading,
      missing: this.documentMissing !== null || (!this.illustration && !this.host?.isLoading),
      paused: !!this.saveBlockedReason || this._cloudConflict,
      syncMode: this.syncMode,
    });
  }

  // (kept for future websocket flow; renamed)
  saveIllustrationIfChanged() {
    if (!this.illustration) return;
    void this.saveIllustrationV2();
  }

  /** Resolve a pixelDataUrl to an absolute URL. Relative paths (from local blob storage) need the API server origin prepended. */
  resolvePixelDataUrl(url: string): string {
    if (!url) return url;
    // Already absolute (Azure SAS URLs or full URLs)
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    // Relative path — prepend the API base URL
    const apiOrigin = this.illustrationService.apiUrl.replace(/\/+$/, '');
    return `${apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  // Convert a Blob to a data URL (base64). Returns a Promise<string> like 'data:image/webp;base64,...'
  blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  /** The full metadata payload every save path writes: engine scene payload + dither (global / per-layer), document
   *  size, canvas colours + paper grain, the 3D settings snapshot (incl. host-owned camera cuts / can designs) and
   *  groups + frame-link buckets. (The local-only and quick-flush paths used to write a subset and lost the rest.) */
  async _buildFullState(): Promise<IllustrationStateDto> {
    const { state } = await this.frogFileService.buildStatePayload(this.host.doc.illustrationTitle);

    // Attach dither config (held locally on the component)
    state.ditherConfig = { ...this.fx.ditherConfig };

    // Override per-layer dither from the component's authoritative map.
    // buildStatePayload reads from the engine, but the engine getter may return undefined
    // for layers whose dither was set via the optional-chaining set path. The component
    // map is always kept in sync by the handlers and is the ground truth.
    for (const layer of state.layers) {
      const cfg = this.fx.layerDitherConfigs.get(layer.layerId);
      if (cfg !== undefined) layer.ditherConfig = { ...cfg } as any;
    }

    // Attach document size (null = infinite canvas)
    state.documentSize = this.shapeManager.getDocumentSize() ?? null;

    // Attach canvas and global UI settings not covered by the Salsa scene graph
    state.bgColor = this.canvasLook.bgColor;
    state.dotColor = this.canvasLook.dotColor;
    state.paperGrain = { type: this.canvasLook.paperGrainType, scale: this.canvasLook.paperGrainScale, strength: this.canvasLook.paperGrainStrength };
    state.scene3dGlobalSettings = {
      cameraMode: this.editorState.scene3dCameraMode,
      illustrationProjection: this.editorState.scene3dIllustrationProjection,
      fov: this.editorState.scene3dFOV,
      shadowsEnabled: this.s3.scene3dShadowsEnabled,
      shadowMapSize: this.s3.scene3dShadowMapSize,
      shadowExtent: this.s3.scene3dShadowExtent,
      shadowBias: this.s3.scene3dShadowBias,
      shadowStrength: this.s3.scene3dShadowStrength,
      shadowQuality: this.s3.scene3dShadowQuality,
      ssaoEnabled: this.s3.scene3dSSAOEnabled,
      ssaoRadius: this.s3.scene3dSSAORadius, ssaoIntensity: this.s3.scene3dSSAOIntensity,
      ssaoPower: this.s3.scene3dSSAOPower, ssaoBias: this.s3.scene3dSSAOBias,
      ssaoResolutionScale: this.s3.scene3dSSAOResolutionScale, ssaoSamples: this.s3.scene3dSSAOSamples,
      lightAzimuth: this.s3.scene3dLightAzimuth, lightElevation: this.s3.scene3dLightElevation,
      lightIntensity: this.s3.scene3dLightIntensity, keyLightColor: this.s3.scene3dKeyLightColorHex,
      ambientR: this.s3.scene3dAmbientR, ambientG: this.s3.scene3dAmbientG, ambientB: this.s3.scene3dAmbientB,
      ambientIntensity: this.s3.scene3dAmbientIntensity, ambientColor: this.s3.scene3dAmbientColorHex,
      ps1Jitter: this.s3.scene3dPS1Jitter, ps1Snap: this.s3.scene3dPS1Snap,
      ps1Affine: this.s3.scene3dPS1Affine, ps1ColorDepth: this.s3.scene3dPS1ColorDepth,
      frustumCulling: this.s3.scene3dFrustumCulling,
      animSyncWithTimeline: this.anim.scene3dAnimSyncWithTimeline,
      animStartFrame: this.anim.scene3dAnimStartFrame,
      animEndFrame: this.anim.scene3dAnimEndFrame,
      animFps: this.anim.scene3dAnimFps,
      animLoop: this.anim.scene3dAnimLoop,
      snapMode: this.s3.scene3dSnapMode,
      snapGridSize: this.s3.scene3dSnapGridSize,
      snapAngleDeg: this.s3.scene3dSnapAngleDeg,
      snapScaleStep: this.s3.scene3dSnapScaleStep,
      gridVisible: this.s3.scene3dGridVisible,
      gridOpacity: this.s3.scene3dGridOpacity,
      gridColor: [...this.s3.scene3dGridColor] as [number, number, number],
      // Post-processing
      bloomEnabled: this.s3.scene3dBloomEnabled, bloomThreshold: this.s3.scene3dBloomThreshold, bloomIntensity: this.s3.scene3dBloomIntensity,
      colorGradeEnabled: this.s3.scene3dColorGradeEnabled, colorGradeBrightness: this.s3.scene3dColorGradeBrightness,
      colorGradeContrast: this.s3.scene3dColorGradeContrast, colorGradeSaturation: this.s3.scene3dColorGradeSaturation,
      colorGradeTint: this.s3.scene3dColorGradeTint,
      vignetteEnabled: this.s3.scene3dVignetteEnabled, vignetteIntensity: this.s3.scene3dVignetteIntensity,
      vignetteRadius: this.s3.scene3dVignetteRadius, vignetteSoftness: this.s3.scene3dVignetteSoftness,
      filmEnabled: this.s3.scene3dFilmEnabled, filmGrain: this.s3.scene3dFilmGrain, filmGrainSize: this.s3.scene3dFilmGrainSize,
      filmAberration: this.s3.scene3dFilmAberration, filmHalation: this.s3.scene3dFilmHalation, filmHalationTint: this.s3.scene3dFilmHalationTint,
      garpCanDesigns: this.host.garpCanDesigns,
      // Fog
      fogMode: this.s3.scene3dFogMode, fogColor: this.s3.scene3dFogColor,
      fogNear: this.s3.scene3dFogNear, fogFar: this.s3.scene3dFogFar, fogDensity: this.s3.scene3dFogDensity,
      fogHardEdge: this.s3.scene3dFogHardEdge,
      fogHorizon: {
        buildingsOnly: this.s3.scene3dFogBuildingsOnly, includeAttachments: this.s3.scene3dFogIncludeAttachments,
        fadeM: this.s3.scene3dFogFadeM, fadeStyle: this.s3.scene3dFogFadeStyle, silhouetteOutlines: this.s3.scene3dFogSilhouetteOutlines,
      },
      // Background
      bgMode: this.s3.scene3dBgMode, bgColor1: this.s3.scene3dBgColor1, bgColor2: this.s3.scene3dBgColor2,
      // Visual quality
      enhancedVisuals: this.s3.scene3dEnhancedVisuals, glassQuality: this.s3.scene3dGlassQuality,
      aerialPerspective: this.s3.scene3dAerialPerspective, textureFilter: this.s3.scene3dTextureFilter,
      // Wind
      windDirDeg: this.s3.sceneWindDirDeg, windStrength: this.s3.sceneWindStrength, windSpeed: this.s3.sceneWindSpeed,
      // IBL intensity (image itself is not serializable — user must re-upload; intensity is preserved)
      iblIntensity: this.s3.scene3dIblIntensity,
      // PS1 extended
      ps1LoRes: this.s3.scene3dPS1LoRes, ps1ResW: this.s3.scene3dPS1ResW, ps1ResH: this.s3.scene3dPS1ResH,
      ps1Dither: this.s3.scene3dPS1Dither, ps1DitherStrength: this.s3.scene3dPS1DitherStrength,
      ps1UVQuantize: this.s3.scene3dPS1UVQuantize, ps1UVSteps: this.s3.scene3dPS1UVSteps,
      // Cinematic cuts (host owns persistence)
      cameraCuts: this.anim.scene3dCameraCuts.length ? this.anim.scene3dCameraCuts : undefined,
    };

    // Groups + frame-link buckets (host-owned; every mode — they used to be written in cloud mode only)
    const hierarchy: any[] = this.shapeManager.getScene3DHierarchy() ?? [];
    const groupsMeta = hierarchy
      .filter((n: any) => n.type === '3DMeshGroup')
      .map((g: any) => ({ name: g.name as string, children: ((g.children ?? []) as any[]).map((c: any) => c.id as string).filter(Boolean) }));
    state.scene3dGroups = groupsMeta.length ? groupsMeta : undefined;
    const bucketKeys = Object.keys(this.host.scene3dAllGroupBuckets).filter(k => this.host.scene3dAllGroupBuckets[k]?.length);
    state.scene3dFrameLinkBuckets = bucketKeys.length
      ? Object.fromEntries(bucketKeys.map(k => [k, this.host.scene3dAllGroupBuckets[k]]))
      : undefined;
    return state;
  }

  /** Build the full v2 state payload from current engine + animation state, save it, then upload dirty pixel data. */
  async saveIllustrationV2(): Promise<void> {
    // Local-only documents have no SQL id (they are keyed by uuid) — this guard used to skip every local save.
    if (!this.illustration || (this.syncMode !== 2 && !this.illustration.id)) return;
    if (this.host.isLoading) return; // suppress saves triggered by the load/restore sequence
    // Salsa paused saving after a partial restore: writing now would overwrite the good copy (OPFS / server) with the
    // half-loaded scene. Changes stay dirty and go out once the user picks "keep what loaded" (audit Phase 2.2).
    if (this._isSaveBlocked()) { this._saveQueued = false; this._checkSaveBlocked(); return; }

    // Fix 1: concurrent save guard — queue at most one pending save
    if (this._saveRunning) { this._saveQueued = true; return; }
    this._saveRunning = true;
    this._pendingChange = false;   // this save covers every change so far; later ones set it again

    try {
      this._saveInFlight = this._doSaveIllustrationV2();
      await this._saveInFlight;
    } finally {
      this._saveInFlight = null;
      this._saveRunning = false;
      if (this._saveQueued) {
        this._saveQueued = false;
        void this.saveIllustrationV2();
      }
    }
  }

  async _doSaveIllustrationV2(): Promise<void> {
    // The document this save belongs to, captured once: everything below runs after awaits, and `this.illustration`
    // must not be re-read there (audit Phase 2.3 — a switch mid-save could write document A's data onto B).
    const ill = this.illustration!;
    // Local-only: save full scene state to OPFS, update IndexedDB metadata
    if (this.syncMode === 2) {
      const seq = ++this._metaSeq;
      const state = await this._buildFullState();
      state.savedAt = Date.now();
      const opfsKey = 'local-' + (ill.uuid ?? '');
      // For a local-only document this write IS the save: await it and tell the user when it fails (it used to be
      // fire-and-forget, failures only reached the console — audit Phase 2.4).
      if (!await this.opfsMetadataService.write(opfsKey, state, seq)) this._notifyLocalSaveFailed();
      if (ill.uuid) {
        const docSize = this.shapeManager.getDocumentSize() as { w: number; h: number } | null | undefined;
        const docAspect = docSize?.w && docSize?.h ? docSize.w / docSize.h : undefined;
        await this.localIllustrationService.update({
          uuid: ill.uuid,
          name: this.host.doc.illustrationTitle ?? ill.name ?? 'Untitled',
          ...(docAspect !== undefined ? { documentAspect: docAspect } : {}),
        }).catch(e => console.warn('[save] local index update failed (the document itself was saved)', e));
      }
      return;
    }

    const seq = ++this._metaSeq;
    const state = await this._buildFullState();

    const sm3d = this.shapeManager;
    const illId = ill.id!;

    if (this.syncMode === 0) {
      // Cloud-sync only: upload blobs to Azure

      // Always keep the full mesh ID list in state so the load path knows which blobs exist
      const allNodes: any[] = sm3d.getScene3DNodeStates() ?? [];
      const allMeshIds = allNodes.map((n: any) => n.id ?? n.nodeId).filter(Boolean) as string[];
      state.meshIds = allMeshIds.length > 0 ? allMeshIds : undefined;

      // Opt 2+3: per-mesh dirty upload using getMeshState3D — avoids serializing the full scene
      // (after forceFullUpload: every mesh)
      const fullUpload = this._uploadAllMeshes;
      const dirtyMeshIds: string[] = fullUpload ? allMeshIds : (sm3d.getDirtyMeshIds3D() ?? []);

      if (dirtyMeshIds.length > 0) {
        // getMeshState3D(id) serializes only that mesh — O(1 mesh) instead of O(all meshes)
        // Only meshes that uploaded (or had nothing to upload) are cleared — a failed one stays dirty and retries next save
        const meshUploadTasks = dirtyMeshIds.map(async (id): Promise<string | null> => {
          try {
            const meshState = sm3d.getMeshState3D(id);
            if (!meshState) return id;
            const blob = await gzipToBlob(meshState);
            await firstValueFrom(this.illustrationService.uploadMeshBlob(illId, id, blob));
            return id;
          } catch (e) { console.warn(`[V2 Save] mesh upload failed for ${id}`, e); return null; }
        });
        const uploadedMeshIds = (await Promise.all(meshUploadTasks)).filter((id): id is string => id !== null);
        if (uploadedMeshIds.length) sm3d.clearDirtyMeshState3D(uploadedMeshIds);
        if (fullUpload && uploadedMeshIds.length === dirtyMeshIds.length) this._uploadAllMeshes = false;
      } else if (fullUpload) {
        this._uploadAllMeshes = false;
      }

      // Opt 1: only re-upload texture library when textures changed
      if (this._texLibDirty) {
        // Cleared before the upload starts (a change during it re-dirties), restored if the upload fails
        this._texLibDirty = false;
        try {
          const texLib = sm3d.scene3d?.getTextureLibraryData();
          if (texLib) {
            const blob = await gzipToBlob(texLib);
            await firstValueFrom(this.illustrationService.uploadTextureLibraryBlob(illId, blob));
          }
        } catch (e) { console.warn('[V2 Save] texture library upload failed', e); this._texLibDirty = true; }
      }
    }
    // No-cloud: meshIds stays undefined so the load path never tries to fetch blobs

    // Stamp savedAt so OPFS and DB share the same timestamp for freshness comparison
    state.savedAt = Date.now();

    // Step 1: Save state metadata to DB (no pixel/blob URLs in no-cloud mode)
    if (this._cloudConflict) return;   // paused: would overwrite the newer copy saved elsewhere
    if (this._serverRevision !== null) state.baseRevision = this._serverRevision;
    try {
      const res = await firstValueFrom(this.illustrationService.saveState(illId, this._serverStatePayload(state)));
      const rev = res?.resultObject?.revision;
      if (typeof rev === 'number') this._serverRevision = rev;
      const warning = res?.resultObject?.warning;
      if (warning) this._onCloudWarning(String(warning));
      state.revision = this._serverRevision ?? undefined;   // cached with the OPFS copy below
      delete state.baseRevision;
    } catch (e: any) {
      if (e?.status === 409) { this._onCloudConflict(); return; }
      console.error('[V2 Save] state save failed', e);
      return;
    }

    // Sync documentAspect back to the illustration model if it changed
    if (state.documentSize) {
      const newAspect = state.documentSize.w / state.documentSize.h;
      if (ill.documentAspect !== newAspect) {
        ill.documentAspect = newAspect;
        this.illustrationService.updateIllustration(ill).subscribe({ error: e => console.warn('[V2 Save] documentAspect update failed', e) });
      }
    }

    // Step 2: Write metadata to OPFS — scene graph, animation config, canvas settings
    (state as any).backendSynced = true;
    await this.opfsMetadataService.write(illId.toString(), state, seq);   // local cache of the server copy

    // Step 3: Upload pixel data for dirty layers only (cloud-sync only)
    if (this.syncMode === 0) {
      await this.uploadPixelData(state.layers, illId);
    }
  }

  /** Upload pixel data for layers whose pixels changed since their last successful upload. */
  /** @param illId  the document the calling save captured (not re-read from this.illustration).
   *
   *  Dirtiness (mobile-parity 7.3c): a layer / cel goes up when it was not uploaded yet this session, or when its Salsa
   *  CONTENT VERSION moved since its last upload — every pixel writer reports to it (fills, undo / redo, paste,
   *  transforms, text stamps, moves, clears, filters, merges, duplicates …), and a write with no known target moves
   *  them all. The stroke-based `_dirtyLayerIds` still counts too (union = conservative). On an older Salsa dist (no
   *  versions) only `_dirtyLayerIds` applies, as before, plus what the editor marks on undo / redo / scene changes. */
  async uploadPixelData(layers: LayerStateDto[], illId: number): Promise<void> {
    const sm = this.shapeManager;
    const texSize = sm?.getRasterTextureSize() ?? { w: this.host.canvas?.width ?? 1024, h: this.host.canvas?.height ?? 768 };

    // Fix 3: snapshot dirty set before upload so concurrent strokes during upload are preserved
    const dirtySnapshot = new Set(this._dirtyLayerIds);
    // Versions read BEFORE any export: a write that lands during the upload leaves a newer version → uploaded next save
    const versions = readContentVersions(sm);
    const exportCel = versions ? celExporter(sm) : null;

    const failed = new Set<string>();   // layers whose upload failed stay dirty and retry on the next save
    const uploadLayer = async (layer: LayerStateDto): Promise<number> => {
      // No pixels: vector / ephemera layers, folders, the 3D divider (they used to "fail" — export gives null — and retry
      // on every save). With versions, the engine lists exactly the paint layers.
      if (layer.type && layer.type !== 'layer') return 0;
      if (versions && !(layer.layerId in versions.layers)) return 0;

      const alreadyUploaded = this._uploadedLayerIds.has(layer.layerId);

      if (layer.animated && versions && exportCel) {
        // Per cel, from each cel's OWN texture, only the cels whose content changed since their last upload
        const counts = await Promise.all(layer.cels.map(async (cel) => {
          if (!this._cloudVersions.celChanged(versions, cel.celId)) return 0;
          const ver = versions.cels[cel.celId];
          if (ver === 'none') { this._cloudVersions.recordCel(cel.celId, ver); return 0; }   // blank cel: no pixels
          try {
            const blob = await exportCel(cel.celId);
            if (!blob) { console.warn(`[V2 Save] no blob for cel ${cel.celId}`); failed.add(layer.layerId); return 0; }
            await firstValueFrom(this.illustrationService.uploadCelPixelData(illId, cel.celId, blob, texSize.w, texSize.h, 'webp'));
            this._cloudVersions.recordCel(cel.celId, ver);
            return 1;
          } catch (e) { console.warn(`[V2 Save] cel upload failed for ${cel.celId}`, e); failed.add(layer.layerId); return 0; }
        }));
        return counts.reduce((a, b) => a + b, 0);
      }

      const isDirty = dirtySnapshot.has(layer.layerId) || (!!versions && this._cloudVersions.layerChanged(versions, layer.layerId));
      if (alreadyUploaded && !isDirty) return 0;

      if (layer.animated) {
        // Older Salsa dist (no per-cel export): unchanged behaviour
        const counts = await Promise.all(layer.cels.map(async (cel) => {
          try {
            let blob: Blob | null = null;
            // (getCelPixelDataBlob was a phantom — this fallback was always the real path)
            if (sm?.exportRasterLayerToBlob) {
              blob = await sm.exportRasterLayerToBlob(layer.layerId, 'image/webp');
            }
            if (!blob) { console.warn(`[V2 Save] no blob for cel ${cel.celId}`); failed.add(layer.layerId); return 0; }
            await firstValueFrom(this.illustrationService.uploadCelPixelData(illId, cel.celId, blob, texSize.w, texSize.h, 'webp'));
            return 1;
          } catch (e) { console.warn(`[V2 Save] cel upload failed for ${cel.celId}`, e); failed.add(layer.layerId); return 0; }
        }));
        return counts.reduce((a, b) => a + b, 0);
      } else {
        const ver = versions?.layers[layer.layerId];
        try {
          const blob: Blob | null = sm?.exportRasterLayerToBlob
            ? await sm.exportRasterLayerToBlob(layer.layerId, 'image/webp')
            : null;
          if (!blob) { console.warn(`[V2 Save] exportRasterLayerToBlob returned null for ${layer.layerId}`); failed.add(layer.layerId); return 0; }
          await firstValueFrom(this.illustrationService.uploadLayerPixelData(illId, layer.layerId, blob, texSize.w, texSize.h, 'webp'));
          this._cloudVersions.recordLayer(layer.layerId, ver);
          return 1;
        } catch (e) { console.warn(`[V2 Save] layer upload failed for ${layer.layerId}`, e); failed.add(layer.layerId); return 0; }
      }
    };

    await Promise.all(layers.map(uploadLayer));

    // Mark uploaded layers clean (only remove IDs from the snapshot, preserving any added during upload)
    for (const id of dirtySnapshot) {
      if (failed.has(id)) continue;
      this._dirtyLayerIds.delete(id);
      this._uploadedLayerIds.add(id);
    }
    // Register any newly seen layers as uploaded (first save after load, all layers are clean)
    for (const layer of layers) {
      if (failed.has(layer.layerId)) { this._dirtyLayerIds.add(layer.layerId); continue; }
      this._uploadedLayerIds.add(layer.layerId);
    }

  }

  /** The next cloud save uploads EVERY mesh, layer and the texture library (switching a browser-only document to
   *  cloud: only blobs dirty since load used to go up, while the saved state lists all meshes). Clears itself once
   *  the mesh uploads all succeed. */
  forceFullUpload(): void {
    this._invalidateUploadedLayers();
    this._texLibDirty = true;
    this._uploadAllMeshes = true;
  }
  private _uploadAllMeshes = false;

  /** Call after a restore/import to mark all layers as needing re-upload. */
  _invalidateUploadedLayers(): void {
    this._uploadedLayerIds.clear();
    this._dirtyLayerIds.clear();
    this._cloudVersions.clear();
  }

  /** Load the current document. Picks the source — local-only OPFS, this device's OPFS copy when it is at least as
   *  fresh as the server, else the server — and hands off to that path. Each path ends by marking 'sceneApplied'. */
  async loadIllustrationV2(): Promise<void> {
    // One load only, whichever branch below runs (a later reload of this document must look at OPFS again).
    const nothingSavedYet = this._nothingSavedYet;
    this._nothingSavedYet = false;
    // ── Pending .frog import (from dashboard) — for the document opened right after it was set ──
    // (Checked before the local-only branch: a local-only import used to be skipped and stay pending, and was then
    // imported into whichever cloud document opened next — e.g. a New Illustration.)
    if (this.frogFileService.pendingImport && (this.syncMode === 2 || this.illustration?.id)) {
      const pending = this.frogFileService.pendingImport;
      this.frogFileService.pendingImport = null; // consume it
      this._releaseShellForEditor();   // (the Shell's .frog import opens a document with the Shell scene still up)
      await this.host.applyFrogImport(pending);
      this._saveWhenLoaded = true;     // the imported content is saved without waiting for an edit
      requestAnimationFrame(() => this.host.markLoaded('sceneApplied'));
      return;
    }
    // ── A .frogmarks the Shell imported into this NEW local document (pending-project-import.ts) ──
    const pkg = this.syncMode === 2 ? takePendingProjectImport(this.illustration?.uuid) : null;
    if (pkg) return this._loadFromPendingPackage(pkg);

    // Local-only: OPFS is the only source — no SQL state, no blob downloads
    if (this.syncMode === 2) return this._loadLocalOnly(nothingSavedYet);

    if (!this.illustration?.id) {
      requestAnimationFrame(() => this.host.markLoaded('sceneApplied'));
      return;
    }

    console.time('[V2 Load] total');

    // ══════════════════════════════════════════════════════════
    //  Determine freshest source: OPFS (local) vs Backend (remote)
    //  Three probes run in parallel; the lightweight savedAt endpoint
    //  lets us skip a full loadState() when both OPFS caches are fresh.
    // ══════════════════════════════════════════════════════════
    const docId = this.illustration.id.toString();

    const [opfsDocs, opfsMeta, savedAtRes] = await Promise.all([
      this.autoSaveService.listDocuments().catch(() => [] as any[]),
      this.opfsMetadataService.read(docId),
      firstValueFrom(this.illustrationService.getStateSavedAt(this.illustration.id)).catch(() => null),
    ]);

    const opfsDoc = opfsDocs.find((d: any) => d.docId === docId);
    let opfsSavedAt = 0;
    if (opfsDoc) {
      const raw = opfsDoc.savedAt;
      opfsSavedAt = typeof raw === 'number' ? raw : (raw ? new Date(raw).getTime() : 0);
      if (isNaN(opfsSavedAt)) opfsSavedAt = 0;
    }
    const backendSavedAt = savedAtRes?.savedAt ?? 0;

    // Use OPFS pixels when they exist and are at least as fresh as the server.
    // The metadata file is a bonus — if it's missing (e.g. first load after migration)
    // we still take the OPFS pixel path and just skip restoring extended settings until
    // the user does a save, which will populate both the DB and the metadata file.
    const useOpfs = opfsSavedAt > 0 && opfsSavedAt >= backendSavedAt;

    // If the OPFS path won't be used, we need the full backend state — fetch it now
    let stateRes: any = null;
    if (!useOpfs) {
      try {
        stateRes = await this._fetchServerState(this.illustration.id);
      } catch (e) {
        console.warn('[V2 Load] loadState failed', e);
      }
    }

    if (useOpfs && await this._loadFromOpfs(docId, opfsMeta)) return;

    // ══════════════════════════════════════════════════════════
    //  Backend Path — fetch state + pixel data from server
    // ══════════════════════════════════════════════════════════

    // No-cloud: OPFS is the only source — no blob downloads exist on the server.
    // If OPFS had no data on this device, surface an empty-state prompt so the
    // user knows they need to import a .frogmarks file to restore their work.
    if (this.syncMode === 1) {
      this.noCloudEmptyState = true;
      requestAnimationFrame(() => this.host.markLoaded('sceneApplied'));
      return;
    }

    // OPFS was chosen but loadDocument() failed — need the full state now
    if (useOpfs && !stateRes) {
      try {
        stateRes = await this._fetchServerState(this.illustration.id);
      } catch (e) {
        console.warn('[V2 Load] loadState fallback failed', e);
      }
    }

    const state: IllustrationStateDto | null = stateRes?.resultObject ?? null;
    if (state && state.version >= 2 && state.layers?.length > 0) {
      await this._loadFromBackend(state, opfsMeta);
      return;
    }

    // V2 block was skipped (new illustration with no layers yet).
    // resetSceneState() cleared the engine background; re-apply the component's current
    // bgColor so the engine matches and getBackgroundColor() doesn't overwrite it with white.
    this.canvasLook.onBgColorSelected(state?.bgColor ?? this.canvasLook.bgColor);
    requestAnimationFrame(() => this.host.markLoaded('sceneApplied'));
  }

  /** Set by initWithIllustration, consumed by the load it starts: a brand-new local document with nothing saved. */
  private _nothingSavedYet = false;

  /** Local-only document: Salsa's own OPFS document + our OPFS metadata (keyed by uuid). */
  private async _loadLocalOnly(nothingSavedYet = false): Promise<void> {
    const opfsDocId = 'local-' + (this.illustration?.uuid ?? '');
    if (nothingSavedYet) {
      // Created a moment ago: there is no OPFS document to find, so the engine stays on the blank document that
      // startBlankDocument gave it — exactly where a failed lookup ends up, minus the lookup. (Salsa's loadDocument
      // also releases the Shell scene / resumes the editor renderer before it looks; keep that part.)
      this._releaseShellForEditor();
      requestAnimationFrame(() => {
        this.artboard.fitArtboard();
        this.host.markLoaded('sceneApplied');
      });
      return;
    }
    try {
      this.animationService.beginBulkRestore();
      const result = await this.autoSaveService.loadDocument(opfsDocId).finally(() => {
        this.animationService.endBulkRestore();
      });
      if (result?.success) {
        this._afterEngineDocumentLoaded();
        const opfsMeta = await this.opfsMetadataService.read(opfsDocId);
        if (opfsMeta?.sceneGraph) {
          try {
            // ★ 2026-09-29: Salsa's loadDocument above ALREADY restored the scene graph + all 3D from its own
            //   document. Re-applying this copy WIPED the scene root and rebuilt it from a snapshot written at a
            //   different time (stale materials — e.g. character styles reverting — and skinned characters as
            //   empty placeholders). Only fall back to it when Salsa restored nothing; otherwise build the layer
            //   tree from the live scene (lightweight structure JSON, no geometry).
            const live = JSON.parse(this.shapeManager.getSceneStructureJSON() ?? '{}');
            const salsaRestored = (live?.root?.children?.length ?? 0) > 0;
            if (!salsaRestored) await this.shapeManager.setSceneGraphJSON(opfsMeta.sceneGraph);
          } catch (e) {
            console.warn('[V2 Load] local-only sceneGraph restore failed', e);
          }
        }
        if (opfsMeta) await this._applyEditorMeta(opfsMeta);
      }
    } catch (e) {
      console.warn('[V2 Load] local-only OPFS load failed', e);
    }
    requestAnimationFrame(() => {
      this.artboard.fitArtboard();
      this.host.markLoaded('sceneApplied');
    });
  }

  /** The editor-owned settings of a document whose engine part Salsa has just restored (a local-only load, a
   *  .frogmarks restore): animation, document size, canvas look, dither, per-layer meta, host-owned 3D, frame-link
   *  buckets. The engine's own 3D settings are not re-applied (it restored them). */
  private async _applyEditorMeta(meta: Partial<IllustrationStateDto>): Promise<void> {
    const m = meta as IllustrationStateDto;
    await this._syncAnimationStateFromBackend(m);
    this.artboard.applyDocumentSize(m.documentSize ?? null);
    this.artboard.updateOverlay();
    this._applyCanvasMeta(m);
    // Global + per-layer dither / frame link live only in our metadata (not in Salsa's document) — the
    // local-only load used to skip them.
    if (m.ditherConfig) this.fx._applyDitherConfig(m.ditherConfig);
    this._applyLayerMeta(m.layers);
    // Host-owned 3D state only — the engine already restored its own settings
    if (m.scene3dGlobalSettings) this._applyHostOwned3D(m.scene3dGlobalSettings);
    this.host.scene3dAllGroupBuckets = m.scene3dFrameLinkBuckets ?? {};
  }

  /** Salsa's loadDocument releases the Shell scene (or resumes a suspended editor renderer) before it loads. Every
   *  load that does not go through it (a document with nothing saved yet, an import) must do the same. */
  private _releaseShellForEditor(): void {
    const sm = this.shapeManager;
    if (sm.shell?.isSceneActive) sm.shell.destroyScene();
    else if (sm.webgpuRenderer?.isSuspended) sm.webgpuRenderer.resumeRendering();
  }

  /**
   * Replace the open document's content with a .frogmarks package (ShapeManager.unpackProject — the engine's one
   * restore path) and bring the editor in line with it: raster layers + per-layer dither, the timeline, 3D panels,
   * PS1 / environment / player mirrors, and the editor-owned settings the file carries (`editorState`; files saved
   * before 2026-10-08 have none). Saves keep going to THIS document. Used by File › Open .frogmarks (replace) and by
   * the Shell's Import (a new local document). Throws when the engine restore fails (Salsa then blocks saving).
   */
  async restoreProjectPackage(file: Blob, editorState: Partial<IllustrationStateDto> | null): Promise<void> {
    const sm = this.shapeManager;
    this.animationService.beginBulkRestore();
    const unpack = () => sm.unpackProject(file);
    await (this.ngZone ? this.ngZone.runOutsideAngular(unpack) : unpack()).finally(() => this.animationService.endBulkRestore());
    // The restore keeps the engine's document id; pin it to the key this document saves under (`local-<uuid>` /
    // the server id) — the editor's restore used to set the bare uuid, which no load ever reads.
    const key = this._docKey();
    if (key) sm.setCurrentDocId(key, this.host.doc.illustrationTitle || this.illustration?.name || undefined);
    this.noCloudEmptyState = false;
    this.animationService.refreshTimeline();
    this.host.scene3dRefreshMeshes();
    this._afterEngineDocumentLoaded();
    this.s3._syncScene3dPS1FromEngine();
    this.s3._syncEnvironmentStyleFromEngine();
    this.anim.syncPlayerFromEngine();
    if (editorState) await this._applyEditorMeta(editorState);
    else this.artboard.applyDocumentSize((sm.getDocumentSize() as { w: number; h: number } | null | undefined) ?? null);
    // Everything restored must reach the cloud copy too (not just layers dirty since load)
    if (this.syncMode === 0) this.forceFullUpload(); else this._invalidateUploadedLayers();
    this._checkSaveBlocked();
  }

  /** The key this document's saves go to: `local-<uuid>` (local-only) or the server id ('' when none yet). */
  private _docKey(): string {
    if (!this.illustration) return '';
    return this.syncMode === 2 ? 'local-' + (this.illustration.uuid ?? '') : this.illustration.id?.toString() ?? '';
  }

  /** The load of a new local document the Shell imported a .frogmarks into. */
  private async _loadFromPendingPackage(pkg: PendingProjectImport): Promise<void> {
    this._releaseShellForEditor();
    try {
      await this.restoreProjectPackage(pkg.file, pkg.editorState);
      this._saveWhenLoaded = true;
    } catch (e) {
      console.error('[import] .frogmarks restore failed', e);
      this._checkSaveBlocked();
      this.notifyService.error('Could not import the project. The file may be damaged.');
    }
    requestAnimationFrame(() => {
      this.artboard.fitArtboard();
      this.host.markLoaded('sceneApplied');
    });
  }

  /** Set by an import during the load: save the document once the load has finished (initWithIllustration). */
  private _saveWhenLoaded = false;

  /** After an import: write the document (Frogmarks metadata + Salsa's pixels / 3D + thumbnail) as soon as the load is
   *  over — saves are held while loading, and nothing else would save it before the first edit. */
  private async _saveImportedDocument(ill: Illustration): Promise<void> {
    for (let waited = 0; this.host.isLoading && this.illustration === ill && waited < 120_000; waited += 100) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (this.illustration !== ill || this.host.isLoading || this._isSaveBlocked()) return;
    await this.saveIllustrationV2();
    if (this.illustration !== ill || this._isSaveBlocked()) return;
    await this.autoSaveService.saveNow();
    if (this.illustration === ill && !ill.isCustomThumbnail) this.saveThumbnailIfChanged();
  }

  /** This device's OPFS copy (Salsa's document + our metadata, or the server state when the metadata file is
   *  missing). False when Salsa's loadDocument failed — the caller falls back to the server. */
  private async _loadFromOpfs(docId: string, opfsMeta: IllustrationStateDto | null): Promise<boolean> {
    // A fresh OPFS copy carries the server revision it was saved as (a stale one would not have been chosen)
    if (typeof opfsMeta?.revision === 'number') this._serverRevision = opfsMeta.revision;
    try {
      // Suppress timeline refreshes fired by Salsa's internal sceneGraphChanged events
      // during restore — each layer add fires an event, causing redundant full-layer scans.
      // endBulkRestore() fires exactly one refreshTimeline() after loadDocument() returns.
      this.animationService.beginBulkRestore();
      const result = await this.autoSaveService.loadDocument(docId).finally(() => {
        this.animationService.endBulkRestore();
      });
      if (!result.success) {
        console.warn('[V2 Load] loadDocument() returned false despite listing — falling through to backend');
        return false;
      }
      this._afterEngineDocumentLoaded();

      // If OPFS metadata file exists use it directly; otherwise fall back to backend
      // state for extended metadata (bgColor, ditherConfig, 3D nodes, etc.).
      // This handles pre-migration illustrations that have OPFS pixels but no meta file.
      let effectiveMeta: IllustrationStateDto | null = opfsMeta;
      if (!effectiveMeta) {
        try {
          const r = await this._fetchServerState(this.illustration!.id);
          effectiveMeta = r?.resultObject ?? null;
        } catch (e) {
          console.warn('[V2 Load] Could not fetch backend state for extended metadata', e);
        }
      }

      await this._syncAnimationStateFromBackend(effectiveMeta);
      const sm = this.shapeManager;
      const opfsDocSize = sm.getDocumentSize() as { w: number; h: number } | null | undefined;
      this.artboard.applyDocumentSize(effectiveMeta?.documentSize ?? opfsDocSize ?? null);
      this.artboard.updateOverlay();
      if (effectiveMeta) {
        this._applyCanvasMeta(effectiveMeta);
        if (effectiveMeta.ditherConfig) this.fx._applyDitherConfig(effectiveMeta.ditherConfig);
        if (effectiveMeta.scene3dGlobalSettings) {
          this._applyScene3dGlobalSettings(effectiveMeta.scene3dGlobalSettings);
        }
        // Per-layer metadata — dither config and frame link animation are not stored
        // in Salsa OPFS pixels, so apply them from the saved state.
        this._applyLayerMeta(effectiveMeta.layers);
      } else {
        // No metadata at all — read bgColor from the engine to keep UI in sync.
        this.canvasLook.getBackgroundColor();
      }
      console.timeLog('[V2 Load] total', 'raster-layers-restored (OPFS)');
      if ((result as any).scene3dRestored) {
        // Salsa's loadDocument() already restored 3D from OPFS — just refresh the hierarchy UI
        console.timeLog('[V2 Load] total', 'scene3d-restored-by-salsa');
        this.host.scene3dRefreshMeshes?.();
      } else if (effectiveMeta?.meshIds?.length) {
        // Per-mesh blobs — fetch fresh SAS URLs first
        let urls: string[] = [];
        try {
          const urlRes = await firstValueFrom(this.illustrationService.getMeshReadUrls(this.illustration!.id, effectiveMeta.meshIds));
          const sasMap: Record<string, string> = urlRes?.resultObject ?? {};
          urls = effectiveMeta.meshIds.map((id: string) => sasMap[id]).filter(Boolean);
        } catch (e) {
          console.warn('[V2 Load] Failed to restore 3D node state from OPFS meta (per-mesh)', e);
        }
        if (urls.length || effectiveMeta.texLibSasUrl) await this._restoreSaved3D(effectiveMeta, urls);
      } else if (effectiveMeta?.scene3dNodesGzip) {
        await this._restoreSaved3D(effectiveMeta, null);
      }
      this._finishLoad(true);
      return true;
    } catch (e) {
      console.warn('[V2 Load] loadDocument() threw — falling through to backend', e);
      return false;
    }
  }

  /** The server's state: scene graph, layer / cel pixels, layer properties, animation, settings (preferring this
   *  device's OPFS metadata when it holds changes not yet synced), 3D nodes. */
  private async _loadFromBackend(state: IllustrationStateDto, opfsMeta: IllustrationStateDto | null): Promise<void> {
    // 1. Apply the vector scene graph (stored by the server since mobile-parity 7.3c; null on older documents). Only its
    //    2D part — the 3D comes from the mesh blobs below (a copy saved by an older client may hold 3D nodes too).
    const vectorScene = toVectorSceneGraphJSON(state.sceneGraph);
    if (vectorScene) {
      await this.shapeManager.setSceneGraphJSON(vectorScene);
    }

    // 2. Download pixel data for all layers/cels in parallel
    console.timeLog('[V2 Load] total', 'scene-graph-applied');
    const importPayload = (await Promise.all(state.layers.map(l => this._downloadLayerPixels(l)))).flat();
    console.timeLog('[V2 Load] total', 'raster-layers-fetched');

    // 3. Import raster layers into engine
    if (importPayload.length > 0 && this.shapeManager?.importRasterLayersFromDataURLs) {
      try {
        // Clear the auto-created "Background" layer before importing saved layers
        this.shapeManager?.rasterLayerManager?.clearAllLayers();
        await this._importLayerStack(state.layers, importPayload);
      } catch (e) {
        console.warn('[V2 Load] importRasterLayersFromDataURLs failed', e);
      }
    }

    // 4. Apply layer properties
    const sm = this.shapeManager;
    for (const layer of state.layers) {
      if (sm?.setRasterLayerBlendMode) sm.setRasterLayerBlendMode(layer.layerId, layer.blendMode as any);
      if (sm?.setRasterLayerOpacity) sm.setRasterLayerOpacity(layer.layerId, layer.opacity);
      if (sm?.setRasterLayerVisibility) sm.setRasterLayerVisibility(layer.layerId, layer.visible);
      if (sm?.setRasterLayerLockTransparency) sm.setRasterLayerLockTransparency(layer.layerId, layer.lockTransparency);
      if (sm?.setRasterLayerClipping) sm.setRasterLayerClipping(layer.layerId, layer.clipped);
    }
    this._applyLayerMeta(state.layers);

    // 5. Restore animation state
    this._restoreAnimation(state);

    this.host.refreshRasterLayers();
    console.timeLog('[V2 Load] total', 'raster-layers-restored');

    // If OPFS metadata has local changes not yet synced to backend (backendSynced === false),
    // prefer it for non-pixel settings so a quick refresh doesn't lose them.
    const settingsMeta: any = ((opfsMeta as any)?.backendSynced === false) ? opfsMeta : state;

    // Per-layer settings override when OPFS meta is ahead of backend state
    if (settingsMeta !== state) this._applyLayerMeta(settingsMeta.layers);

    // 6. Restore dither config
    if (settingsMeta.ditherConfig) {
      this.fx._applyDitherConfig(settingsMeta.ditherConfig);
    }

    // 7. Restore document size (bounded artboard vs infinite canvas)
    this.artboard.applyDocumentSize(settingsMeta.documentSize ?? state.documentSize ?? null);

    // 7b. Restore canvas / global UI settings
    this._applyCanvasMeta(settingsMeta);
    if (settingsMeta.scene3dGlobalSettings) {
      this._applyScene3dGlobalSettings(settingsMeta.scene3dGlobalSettings);
    }

    // 8. Restore 3D mesh state
    if (state.meshSasUrls && Object.keys(state.meshSasUrls).length > 0) {
      await this._restoreSaved3D(state, Object.values(state.meshSasUrls));
    } else if (state.scene3dNodesGzip) {
      await this._restoreSaved3D(state, null);
    }
    this._finishLoad(false);
  }

  /**
   * Rebuild the layer stack from the server state: the paint layers from their pixels (as before), and — for states
   * saved with layer types (2026-10-07+) — the vector / ephemera layers at their saved place, with their ids, so the
   * restored scene graph's shapes are back on their own layer (and gated by it) instead of on a layer that no longer
   * exists. Folders and the 3D divider are not rebuilt (as before). Older states: every pixel entry in one import.
   */
  private async _importLayerStack(layers: LayerStateDto[], importPayload: any[]): Promise<void> {
    const sm = this.shapeManager;
    const rlm = sm?.rasterLayerManager as unknown as { addVectorLayerWithId?: (id: string, name: string, opts?: { visible?: boolean; systemOwner?: string; packageOwnerId?: string }) => void } | undefined;
    const isVector = (l: LayerStateDto) => l.type === 'vector' || l.type === 'ephemera';
    if (!layers.some(isVector) || typeof rlm?.addVectorLayerWithId !== 'function') {
      await sm.importRasterLayersFromDataURLs(importPayload);
      return;
    }
    const byLayer = new Map<string, any[]>();
    for (const entry of importPayload) {
      const list = byLayer.get(entry.id) ?? [];
      list.push(entry);
      byLayer.set(entry.id, list);
    }
    for (const layer of [...layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      if (isVector(layer)) {
        rlm.addVectorLayerWithId(layer.layerId, layer.name, { visible: layer.visible, systemOwner: layer.systemOwner, packageOwnerId: layer.packageOwnerId });
        continue;
      }
      const entries = byLayer.get(layer.layerId);
      if (entries?.length) await sm.importRasterLayersFromDataURLs(entries);
    }
  }

  /** Steps after Salsa restored its own document: raster layer list, a valid selected layer, per-layer dither. */
  private _afterEngineDocumentLoaded(): void {
    this.host.refreshRasterLayers();
    const stillExists = this.editorState.rasterLayers.some(l => l.id === this.editorState.selectedRasterLayerId);
    if (!stillExists) this.editorState.selectedRasterLayerId = this.editorState.rasterLayers[0]?.id ?? null;
    this.fx._syncLayerDitherConfigsFromEngine();
    this.rasterBrush?.refreshPresets();   // this document's own brush presets (brushes.json), not the previous one's
  }

  /** Background / dot colour / paper grain from saved metadata. */
  private _applyCanvasMeta(meta: IllustrationStateDto): void {
    if (meta.bgColor) this.canvasLook.onBgColorSelected(meta.bgColor);
    if (meta.dotColor) this.canvasLook.onDotColorSelected(meta.dotColor);
    if (meta.paperGrain) {
      this.canvasLook.paperGrainType = (meta.paperGrain.type as any) ?? 'none';
      this.canvasLook.paperGrainScale = meta.paperGrain.scale ?? 1.0;
      this.canvasLook.paperGrainStrength = meta.paperGrain.strength ?? 0.3;
      this.canvasLook.applyPaperGrain();
    }
  }

  /** Per-layer dither + frame-link animation from saved metadata (Salsa's pixels don't carry them). */
  private _applyLayerMeta(layers: LayerStateDto[] | undefined): void {
    const sm = this.shapeManager;
    for (const layer of layers ?? []) {
      if (layer.ditherConfig && sm?.setLayerDitherConfig) {
        sm.setLayerDitherConfig(layer.layerId, layer.ditherConfig as any);
        this.fx.layerDitherConfigs.set(layer.layerId, { ...layer.ditherConfig } as DitherConfig);
      }
      if (layer.frameLinkAnimation && sm?.setLayerFrameLinkAnimation) {
        sm.setLayerFrameLinkAnimation(layer.layerId, layer.frameLinkAnimation as any);
      }
    }
  }

  /** Download one layer's pixels (or each cel's) as import entries for importRasterLayersFromDataURLs. */
  private async _downloadLayerPixels(layer: LayerStateDto): Promise<any[]> {
    const illId = this.illustration!.id;
    if (layer.animated && layer.cels.length > 0) {
      const celResults = await Promise.all(layer.cels.map(async (cel) => {
        const celUrl = cel.pixelDataUrl || `/api/illustration/${illId}/cel/${cel.celId}`;
        try {
          const resp = await fetch(this.resolvePixelDataUrl(celUrl));
          if (!resp.ok) { console.warn(`[V2 Load] cel ${cel.celId} fetch returned ${resp.status}`); return null; }
          const blob = await resp.blob();
          if (!blob.size) { console.warn(`[V2 Load] cel ${cel.celId} returned empty blob`); return null; }
          return {
            id: layer.layerId, celId: cel.celId, name: layer.name,
            imageData: await this.blobToDataUrl(blob),
            width: cel.width, height: cel.height,
            blendMode: layer.blendMode, opacity: layer.opacity,
            visible: layer.visible, locked: layer.locked,
            clipped: layer.clipped, lockTransparency: layer.lockTransparency,
          };
        } catch (e) { console.warn(`[V2 Load] failed to download cel ${cel.celId}`, e); return null; }
      }));
      return celResults.filter(Boolean);
    }
    const layerUrl = layer.pixelDataUrl || `/api/illustration/${illId}/layer/${layer.layerId}`;
    try {
      const resp = await fetch(this.resolvePixelDataUrl(layerUrl));
      if (!resp.ok) { console.warn(`[V2 Load] layer ${layer.layerId} fetch returned ${resp.status}`); return []; }
      const blob = await resp.blob();
      if (!blob.size) { console.warn(`[V2 Load] layer ${layer.layerId} returned empty blob`); return []; }
      return [{
        id: layer.layerId, name: layer.name,
        imageData: await this.blobToDataUrl(blob),
        blendMode: layer.blendMode, opacity: layer.opacity,
        visible: layer.visible, locked: layer.locked,
        clipped: layer.clipped, lockTransparency: layer.lockTransparency,
      }];
    } catch (e) { console.warn(`[V2 Load] failed to download layer ${layer.layerId}`, e); return []; }
  }

  /** Timeline settings + animated layers / cels from the server state. */
  private _restoreAnimation(state: IllustrationStateDto): void {
    if (!state.animation?.enabled) return;
    const anim = state.animation;
    this.host.setAnimationEnabled(true);
    this.animationService.setFrameCount(anim.frameCount);
    this.animationService.setFps(anim.fps);
    this.animationService.setLoopMode(anim.loopMode as LoopMode);
    this.animationService.setPlayRange(anim.playRangeStart, anim.playRangeEnd);
    if (anim.onionSkin) {
      this.animationService.setOnionSkin(anim.onionSkin as OnionSkinConfig);
    }
    // Restore animated flag per layer + cels
    for (const layer of state.layers) {
      if (layer.animated) {
        this.animationService.setLayerAnimated(layer.layerId, true);
        for (const cel of layer.cels) {
          this.animationService.addCelAtFrame(layer.layerId, cel.frame);
        }
      }
    }
    this.animationService.refreshTimeline();
  }

  /** 3D nodes written by a cloud save — per-mesh blobs (`meshUrls`) or the legacy monolithic gzip — plus groups,
   *  frame-link buckets and the texture library. */
  private async _restoreSaved3D(meta: IllustrationStateDto, meshUrls: string[] | null): Promise<void> {
    const sm = this.shapeManager;
    try {
      console.timeLog('[V2 Load] total', 'scene3d-restore-start');
      let nodes3d: any[];
      let texLib: unknown = null;
      if (meshUrls) {
        const blobs = await Promise.all(meshUrls.map(async url => gunzipFromBinary(await fetch(url).then(r => r.arrayBuffer()))));
        nodes3d = blobs.filter(Boolean);
        if (meta.texLibSasUrl) texLib = await gunzipFromBinary(await fetch(meta.texLibSasUrl).then(r => r.arrayBuffer()));
      } else {
        nodes3d = await gunzipFromBase64(meta.scene3dNodesGzip!) as any[];
        if (meta.textureLibrary3dGzip) texLib = await gunzipFromBase64(meta.textureLibrary3dGzip);
      }
      if (nodes3d.length) {
        await sm.restoreScene3DNodes(nodes3d, {});
        this.host._scene3dReconstructGroups(sm, meta.scene3dGroups ?? []);
      }
      this.host.scene3dAllGroupBuckets = meta.scene3dFrameLinkBuckets ?? {};
      if (texLib) {
        await sm.scene3d?.restoreTextureLibraryData(texLib as any);
        console.timeLog('[V2 Load] total', 'texture-lib-restored');
      }
      this.host.scene3dRefreshMeshes?.();
      this.host.uiPanel?.uiRefreshLayers();
      console.timeLog('[V2 Load] total', 'scene3d-restore-done');
    } catch (e) {
      console.warn('[V2 Load] Failed to restore 3D node state', e);
    }
  }

  /** Common tail of the OPFS / server loads: procedural restore, snap + grid settings, loaded. */
  private _finishLoad(fitArtboard: boolean): void {
    // H3: OUTSIDE the zone — a restored city starts its ticker / stream pump / tile workers here, and anything it starts
    // in the zone runs an app change detection per tick / worker message for the whole session. (Optional: specs
    // construct this service without an NgZone.)
    if (this.ngZone) this.ngZone.runOutsideAngular(() => this.shapeManager.restoreProceduralFromSave3D());
    else this.shapeManager.restoreProceduralFromSave3D();
    this.s3._scene3dLoadSnapSettings();
    this.s3._loadScene3dGrid();
    // Post-Processing › Bloom derives its mode from both passes: re-read the engine's particle bloom (particleBloom)
    // for this document (Whole scene came back through scene3dBloomEnabled above).
    try { this.s3.scene3dSyncBloomGlow(); } catch { /* no 3D renderer */ }
    console.timeEnd('[V2 Load] total');
    requestAnimationFrame(() => {
      if (fitArtboard) this.artboard.fitArtboard();
      this.host.markLoaded('sceneApplied');
    });
  }

  /**
   * After loadDocument() restores from OPFS, sync the animation/timeline UI state
   * from the backend metadata so the UI reflects the saved settings.
   * Pass the already-fetched state to avoid a redundant loadState() HTTP call.
   */
  async _syncAnimationStateFromBackend(preloadedState?: IllustrationStateDto | null): Promise<void> {
    if (!this.illustration) return;
    try {
      let state: IllustrationStateDto | null = preloadedState ?? null;
      if (!state) {
        if (!this.illustration.id) return;   // local-only: the caller passes the OPFS meta
        const stateRes = await this._fetchServerState(this.illustration.id);
        state = stateRes?.resultObject ?? null;
      }
      if (!state?.animation) return;

      const anim = state.animation;
      if (anim.enabled) {
        this.host.setAnimationEnabled(true);
        this.animationService.setFrameCount(anim.frameCount);
        this.animationService.setFps(anim.fps);
        this.animationService.setLoopMode(anim.loopMode as LoopMode);
        this.animationService.setPlayRange(anim.playRangeStart, anim.playRangeEnd);
        if (anim.onionSkin) {
          this.animationService.setOnionSkin(anim.onionSkin as OnionSkinConfig);
        }
        this.animationService.refreshTimeline();
      }


    } catch (e) {
      console.warn('[V2 Load] _syncAnimationStateFromBackend failed (non-fatal)', e);
    }
  }

  _applyScene3dGlobalSettings(s: NonNullable<IllustrationStateDto['scene3dGlobalSettings']>): void {
    const sm = this.shapeManager;
    const s3d = sm.scene3d;
    if (s.cameraMode !== undefined) { this.editorState.scene3dCameraMode = s.cameraMode as any; s3d?.setCameraMode(s.cameraMode as any); }
    if (s.illustrationProjection !== undefined) {
      this.editorState.scene3dIllustrationProjection = s.illustrationProjection as any;
      sm.setIllustrationProjection3D(s.illustrationProjection as any);
    }
    if (s.fov !== undefined) { this.editorState.scene3dFOV = s.fov; s3d?.setFOV(s.fov); }
    if (s.shadowsEnabled !== undefined) {
      this.s3.scene3dShadowsEnabled = s.shadowsEnabled;
      this.s3.scene3dShadowMapSize = s.shadowMapSize ?? this.s3.scene3dShadowMapSize;
      this.s3.scene3dShadowExtent = s.shadowExtent ?? this.s3.scene3dShadowExtent;
      this.s3.scene3dShadowBias = s.shadowBias ?? this.s3.scene3dShadowBias;
      this.s3.scene3dShadowStrength = s.shadowStrength ?? this.s3.scene3dShadowStrength;
      if (s.shadowsEnabled) {
        s3d?.enableShadows(this.s3.scene3dShadowMapSize, this.s3.scene3dShadowExtent, this.s3.scene3dShadowBias);
        s3d?.setShadowStrength3D(this.s3.scene3dShadowStrength);
        const sq = (s as any).shadowQuality;   // Salsa P14 shadow quality preset (absent / 'custom' = as set above)
        if (typeof sq === 'string' && sq !== 'custom') { this.s3.scene3dShadowQuality = sq; this.shapeManager.setShadowQualityPreset3D((sq as any)); }
      } else {
        s3d?.disableShadows();
      }
    }
    if (s.ssaoEnabled !== undefined) {
      this.s3.scene3dSSAOEnabled         = s.ssaoEnabled;
      this.s3.scene3dSSAORadius          = s.ssaoRadius          ?? this.s3.scene3dSSAORadius;
      this.s3.scene3dSSAOIntensity       = s.ssaoIntensity       ?? this.s3.scene3dSSAOIntensity;
      this.s3.scene3dSSAOPower           = s.ssaoPower           ?? this.s3.scene3dSSAOPower;
      this.s3.scene3dSSAOBias            = s.ssaoBias            ?? this.s3.scene3dSSAOBias;
      this.s3.scene3dSSAOResolutionScale = s.ssaoResolutionScale ?? this.s3.scene3dSSAOResolutionScale;
      this.s3.scene3dSSAOSamples         = s.ssaoSamples         ?? this.s3.scene3dSSAOSamples;
      s3d?.setSSAO3D(s.ssaoEnabled, {
        radius: this.s3.scene3dSSAORadius, intensity: this.s3.scene3dSSAOIntensity,
        power: this.s3.scene3dSSAOPower, bias: this.s3.scene3dSSAOBias,
        resolutionScale: this.s3.scene3dSSAOResolutionScale, samples: this.s3.scene3dSSAOSamples,
      });
    }
    if (s.lightAzimuth !== undefined || s.lightElevation !== undefined || s.lightIntensity !== undefined
        || s.lightDirX !== undefined) {
      this.s3.scene3dLightIntensity = s.lightIntensity ?? this.s3.scene3dLightIntensity;
      if (s.keyLightColor) this.s3.scene3dKeyLightColorHex = s.keyLightColor;
      this.s3.scene3dAmbientR = s.ambientR ?? this.s3.scene3dAmbientR;
      this.s3.scene3dAmbientG = s.ambientG ?? this.s3.scene3dAmbientG;
      this.s3.scene3dAmbientB = s.ambientB ?? this.s3.scene3dAmbientB;
      this.s3.scene3dAmbientIntensity = s.ambientIntensity ?? this.s3.scene3dAmbientIntensity;
      if (s.ambientColor) {
        this.s3.scene3dAmbientColorHex = s.ambientColor;
      } else {
        // back-compat: derive hex from the RGB floats for docs saved before ambientColor existed
        const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
        this.s3.scene3dAmbientColorHex = `#${toHex(this.s3.scene3dAmbientR)}${toHex(this.s3.scene3dAmbientG)}${toHex(this.s3.scene3dAmbientB)}`;
      }
      if (s.lightAzimuth !== undefined || s.lightElevation !== undefined) {
        this.s3.scene3dLightAzimuth = s.lightAzimuth ?? this.s3.scene3dLightAzimuth;
        this.s3.scene3dLightElevation = s.lightElevation ?? this.s3.scene3dLightElevation;
        sm.setLightAngles3D(this.s3.scene3dLightAzimuth, this.s3.scene3dLightElevation);
        sm.setLightIntensity3D(this.s3.scene3dLightIntensity);
        const kc = hexToRgba01(this.s3.scene3dKeyLightColorHex);
        sm.setLightColor3D(kc[0], kc[1], kc[2]);
      } else if (s.lightDirX !== undefined) {
        s3d?.setDirectionalLight(s.lightDirX, s.lightDirY, s.lightDirZ, 1, 1, 1, this.s3.scene3dLightIntensity);
      }
      s3d?.setAmbientLight(
        this.s3.scene3dAmbientR, this.s3.scene3dAmbientG, this.s3.scene3dAmbientB, this.s3.scene3dAmbientIntensity);
    }
    if (s.ps1Jitter !== undefined || s.ps1Snap !== undefined) {
      this.s3.scene3dPS1Jitter         = s.ps1Jitter         ?? this.s3.scene3dPS1Jitter;
      this.s3.scene3dPS1Snap           = s.ps1Snap           ?? this.s3.scene3dPS1Snap;
      this.s3.scene3dPS1Affine         = s.ps1Affine         ?? this.s3.scene3dPS1Affine;
      this.s3.scene3dPS1ColorDepth     = s.ps1ColorDepth     ?? this.s3.scene3dPS1ColorDepth;
      this.s3.scene3dPS1LoRes          = s.ps1LoRes          ?? this.s3.scene3dPS1LoRes;
      this.s3.scene3dPS1ResW           = s.ps1ResW           ?? this.s3.scene3dPS1ResW;
      this.s3.scene3dPS1ResH           = s.ps1ResH           ?? this.s3.scene3dPS1ResH;
      this.s3.scene3dPS1Dither         = s.ps1Dither         ?? this.s3.scene3dPS1Dither;
      this.s3.scene3dPS1DitherStrength = s.ps1DitherStrength ?? this.s3.scene3dPS1DitherStrength;
      this.s3.scene3dPS1UVQuantize     = s.ps1UVQuantize     ?? this.s3.scene3dPS1UVQuantize;
      this.s3.scene3dPS1UVSteps        = s.ps1UVSteps        ?? this.s3.scene3dPS1UVSteps;
      this.s3.scene3dApplyPS1();
    }
    if (s.frustumCulling !== undefined) this.s3.scene3dSetFrustumCulling(s.frustumCulling);
    if (s.animSyncWithTimeline !== undefined) this.anim.scene3dAnimSyncWithTimeline = s.animSyncWithTimeline;
    if (s.animStartFrame !== undefined) this.anim.scene3dAnimStartFrame = s.animStartFrame;
    if (s.animEndFrame !== undefined) this.anim.scene3dAnimEndFrame = s.animEndFrame;
    if (s.animFps !== undefined) this.anim.scene3dAnimFps = s.animFps;
    if (s.animLoop !== undefined) this.anim.scene3dAnimLoop = s.animLoop;
    this.anim.scene3dApplyAnimationConfig();
    // Snap settings
    if (s.snapMode !== undefined) {
      this.s3.scene3dSnapMode = s.snapMode as any;
      this.shapeManager.snapMode3D = s.snapMode as any;
    }
    if (s.snapGridSize !== undefined || s.snapAngleDeg !== undefined || s.snapScaleStep !== undefined) {
      if (s.snapGridSize !== undefined) this.s3.scene3dSnapGridSize = s.snapGridSize;
      if (s.snapAngleDeg !== undefined) this.s3.scene3dSnapAngleDeg = s.snapAngleDeg;
      if (s.snapScaleStep !== undefined) this.s3.scene3dSnapScaleStep = s.snapScaleStep;
      const smSnap = this.shapeManager;
      smSnap.snapGridSize3D  = this.s3.scene3dSnapGridSize;
      smSnap.snapAngle3D     = this.s3.scene3dSnapAngleDeg * Math.PI / 180;
      smSnap.snapScaleStep3D = this.s3.scene3dSnapScaleStep;
    }
    // Ground grid
    if (s.gridVisible !== undefined || s.gridOpacity !== undefined || s.gridColor !== undefined) {
      if (s.gridVisible !== undefined) this.s3.scene3dGridVisible = s.gridVisible;
      if (s.gridOpacity !== undefined) this.s3.scene3dGridOpacity = s.gridOpacity;
      if (s.gridColor !== undefined) this.s3.scene3dGridColor = [...s.gridColor] as [number, number, number];
      this.s3.applyScene3dGrid();
    }
    // Post-processing
    if (s.bloomEnabled !== undefined || s.colorGradeEnabled !== undefined || s.vignetteEnabled !== undefined) {
      this.s3.scene3dBloomEnabled         = s.bloomEnabled         ?? this.s3.scene3dBloomEnabled;
      this.s3.scene3dBloomThreshold       = s.bloomThreshold       ?? this.s3.scene3dBloomThreshold;
      this.s3.scene3dBloomIntensity       = s.bloomIntensity       ?? this.s3.scene3dBloomIntensity;
      this.s3.scene3dColorGradeEnabled    = s.colorGradeEnabled    ?? this.s3.scene3dColorGradeEnabled;
      this.s3.scene3dColorGradeBrightness = s.colorGradeBrightness ?? this.s3.scene3dColorGradeBrightness;
      this.s3.scene3dColorGradeContrast   = s.colorGradeContrast   ?? this.s3.scene3dColorGradeContrast;
      this.s3.scene3dColorGradeSaturation = s.colorGradeSaturation ?? this.s3.scene3dColorGradeSaturation;
      if (s.colorGradeTint)            this.s3.scene3dColorGradeTint = s.colorGradeTint;
      this.s3.scene3dVignetteEnabled      = s.vignetteEnabled      ?? this.s3.scene3dVignetteEnabled;
      this.s3.scene3dVignetteIntensity    = s.vignetteIntensity    ?? this.s3.scene3dVignetteIntensity;
      this.s3.scene3dVignetteRadius       = s.vignetteRadius       ?? this.s3.scene3dVignetteRadius;
      this.s3.scene3dVignetteSoftness     = s.vignetteSoftness     ?? this.s3.scene3dVignetteSoftness;
      if (s.filmEnabled !== undefined) {
        this.s3.scene3dFilmEnabled    = s.filmEnabled;
        this.s3.scene3dFilmGrain      = s.filmGrain      ?? this.s3.scene3dFilmGrain;
        this.s3.scene3dFilmGrainSize  = s.filmGrainSize  ?? this.s3.scene3dFilmGrainSize;
        this.s3.scene3dFilmAberration = s.filmAberration ?? this.s3.scene3dFilmAberration;
        this.s3.scene3dFilmHalation   = s.filmHalation   ?? this.s3.scene3dFilmHalation;
        if (s.filmHalationTint) this.s3.scene3dFilmHalationTint = s.filmHalationTint;
      } else {
        // Older snapshot without film — adopt whatever the engine restored so the re-apply doesn't clobber it
        const f = this.shapeManager.getPostProcessing3D()?.film;
        if (f) {
          this.s3.scene3dFilmEnabled = f.enabled; this.s3.scene3dFilmGrain = f.grain; this.s3.scene3dFilmGrainSize = f.grainSize;
          this.s3.scene3dFilmAberration = f.aberration; this.s3.scene3dFilmHalation = f.halation;
          if (f.halationTint) this.s3.scene3dFilmHalationTint = '#' + f.halationTint.map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join('');
        }
      }
      this.s3.scene3dApplyPostProcessing();
    }
    // Fog (hard edge FIRST, so the restored fog isn't replaced by the city's)
    if (s.fogHardEdge !== undefined) { this.s3.scene3dFogHardEdge = !!s.fogHardEdge; this.shapeManager.setFogHardEdge3D(this.s3.scene3dFogHardEdge); }
    // Fog horizon AFTER the hard edge (it only acts while the hard edge is on); absent (older saves) = the defaults.
    if (s.fogHorizon !== undefined || s.fogMode !== undefined) {
      const h = s.fogHorizon ?? {};
      this.s3.scene3dFogBuildingsOnly = h.buildingsOnly === true;
      this.s3.scene3dFogIncludeAttachments = h.includeAttachments === true;
      this.s3.scene3dFogFadeM = typeof h.fadeM === 'number' && isFinite(h.fadeM) ? h.fadeM : 15;
      this.s3.scene3dFogFadeStyle = h.fadeStyle === 'dither-coarse' ? 'dither-coarse' : 'dither';
      this.s3.scene3dFogSilhouetteOutlines = h.silhouetteOutlines !== false;
      this.s3.scene3dApplyFogHorizon();
    }
    if (s.fogMode !== undefined) {
      this.s3.scene3dFogMode    = s.fogMode as any;
      this.s3.scene3dFogColor   = s.fogColor   ?? this.s3.scene3dFogColor;
      this.s3.scene3dFogNear    = s.fogNear    ?? this.s3.scene3dFogNear;
      this.s3.scene3dFogFar     = s.fogFar     ?? this.s3.scene3dFogFar;
      this.s3.scene3dFogDensity = s.fogDensity ?? this.s3.scene3dFogDensity;
      this.s3.scene3dApplyFog();
    }
    // Background
    if (s.bgMode !== undefined) {
      this.s3.scene3dBgMode   = s.bgMode as any;
      this.s3.scene3dBgColor1 = s.bgColor1 ?? this.s3.scene3dBgColor1;
      this.s3.scene3dBgColor2 = s.bgColor2 ?? this.s3.scene3dBgColor2;
      this.s3.scene3dApplySceneBg();
    }
    // Visual quality / texture
    if (s.enhancedVisuals !== undefined) this.s3.scene3dSetEnhancedVisuals(s.enhancedVisuals);
    if (s.glassQuality !== undefined) this.s3.scene3dSetGlassQuality(s.glassQuality);
    if (s.aerialPerspective !== undefined) this.s3.scene3dSetAerialPerspective(s.aerialPerspective);
    if (s.textureFilter !== undefined) this.s3.scene3dSetTextureFilter(s.textureFilter as any);
    // Wind
    if (s.windDirDeg !== undefined || s.windStrength !== undefined || s.windSpeed !== undefined) {
      this.s3.sceneWindDirDeg   = s.windDirDeg   ?? this.s3.sceneWindDirDeg;
      this.s3.sceneWindStrength = s.windStrength  ?? this.s3.sceneWindStrength;
      this.s3.sceneWindSpeed    = s.windSpeed     ?? this.s3.sceneWindSpeed;
      this.s3.scene3dApplyWind();
    }
    // IBL intensity (UI state only — image must be re-uploaded)
    if (s.iblIntensity !== undefined) this.s3.scene3dIblIntensity = s.iblIntensity;
    this._applyHostOwned3D(s);
  }

  /** The 3D state Frogmarks persists itself (the engine doesn't): camera cuts and can-design source images.
   *  (Can designs used to be restored only inside the post-processing block, so a doc without post settings lost them.) */
  _applyHostOwned3D(s: NonNullable<IllustrationStateDto['scene3dGlobalSettings']>): void {
    if (s.garpCanDesigns) this.host.garpCanDesigns = { ...s.garpCanDesigns };
    if (s.cameraCuts?.length) {
      const sm = this.shapeManager;
      sm.setCameraCuts3D(s.cameraCuts);
      this.anim.scene3dCameraCuts = s.cameraCuts;
      this.anim.scene3dRefreshCameraNodes();
    }
  }

  // Helper: convert Blob -> HTMLCanvasElement by drawing the image into a canvas
  async blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
    const img = await (self as any).createImageBitmap(blob).catch(() => null);
    if (!img) throw new Error('createImageBitmap failed');
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  lastThumbnailTime = 0;

  lastSavedThumbnailJSON = '';

  saveThumbnailIfChanged() {
    void this.saveThumbnailIfChangedNow();
  }

  /** saveThumbnailIfChanged, awaitable: before leaving a document the capture must finish while it is still on screen
   *  (New Illustration used to start it and navigate at once). */
  async saveThumbnailIfChangedNow(): Promise<void> {
    const current = this.shapeManager.getSceneGraphJSON();
    const now = Date.now();
    // The scene-graph JSON carries no pixels, so raster-only edits are tracked separately (they never refreshed it)
    if (current !== this.lastSavedThumbnailJSON || this._rasterEditedSinceThumbnail) {
      this._rasterEditedSinceThumbnail = false;
      this.lastSavedThumbnailJSON = current;
      this.lastThumbnailTime = now;
      await this.saveThumbnail();
    }
  }

  /** A raster stroke ended on `layerId` (if known): re-upload that layer on the next save, refresh the thumbnail.
   *  Also used for the other raster edits the editor hears about (undo / redo, a taken-back stroke). */
  noteRasterStroke(layerId: string | null): void {
    if (layerId) this._dirtyLayerIds.add(layerId);
    this._rasterEditedSinceThumbnail = true;
  }

  /** Re-upload `layerId` on the next cloud save (no thumbnail refresh). The old-dist fallback marks the selected layer on
   *  every scene-graph change (mobile-parity 7.3c): without content versions that is the only hint a tool edited it. */
  markLayerDirty(layerId: string | null): void {
    if (layerId) this._dirtyLayerIds.add(layerId);
  }

  /** The engine reports per-layer content versions (Salsa sm.getRasterContentVersions): cloud dirtiness comes from them.
   *  A typeof check only (read on every scene-graph change). */
  get hasContentVersions(): boolean {
    return hasContentVersionApi(this.shapeManager);
  }

  /** A raster stroke is in progress (set by the editor from Salsa's stroke start / end / cancel): the pixel poll waits
   *  for it to end (the stroke end saves) instead of saving mid-stroke. */
  rasterStrokeActive = false;

  /** Content versions of each layer / cel as of its last cloud upload. */
  private readonly _cloudVersions = new CloudUploadVersions();
  private _pixelPoll: ReturnType<typeof setInterval> | null = null;
  private _pixelPollSeq = -1;
  private _pixelPollBaseline: RasterContentVersions | null = null;
  private _cloudWarningShown = false;

  /** The state the server gets: the cloud keeps only the vector scene graph (3D lives in the mesh blobs; see
   *  cloud-scene-graph.ts); a No-Cloud document sends none (its content stays on this device). The local metadata copy
   *  keeps the full `state`. */
  _serverStatePayload(state: IllustrationStateDto): IllustrationStateDto {
    return { ...state, sceneGraph: this.syncMode === 0 ? cloudSceneGraphJSON(this.shapeManager, state.sceneGraph) : null };
  }

  /** The server stored the save but not all of it (the scene graph over the storage quota): say so once per document. */
  private _onCloudWarning(message: string): void {
    console.warn('[V2 Save]', message);
    if (this._cloudWarningShown) return;
    this._cloudWarningShown = true;
    this.notifyService.error(message);
  }

  /** Raster pixels changed since they were last uploaded (content versions; false on an old Salsa dist / non-cloud doc). */
  _pixelsChangedSinceUpload(): boolean {
    if (this.syncMode !== 0) return false;
    const v = readContentVersions(this.shapeManager);
    if (!v) return false;
    return this._cloudVersions.anyChanged(v) || (!!this._pixelPollBaseline && contentVersionsDiffer(this._pixelPollBaseline, v));
  }

  /** Cloud documents: every PIXEL_POLL_MS, compare the engine's content versions with the last check and tick the
   *  autosave when a layer / cel changed. Many raster edits (fill, undo / redo, paste, transform, text stamp, move,
   *  filter, merge, …) raise no event the editor hears, so before this they reached the server only with the next
   *  stroke. Outside the zone; no-op on an old Salsa dist. */
  private _startPixelPoll(): void {
    this._stopPixelPoll();
    if (this.syncMode !== 0 || !this.hasContentVersions) return;
    const start = () => setInterval(() => this._pollPixelChanges(), PIXEL_POLL_MS);
    this._pixelPoll = this.ngZone ? this.ngZone.runOutsideAngular(start) : start();
  }

  private _stopPixelPoll(): void {
    if (this._pixelPoll !== null) clearInterval(this._pixelPoll);
    this._pixelPoll = null;
    this._pixelPollSeq = -1;
    this._pixelPollBaseline = null;
  }

  /** One poll tick (public for specs). */
  _pollPixelChanges(): void {
    if (!this.illustration || this.host.isLoading || this.syncMode !== 0) return;
    const v = readContentVersions(this.shapeManager);
    if (!v || v.seq === this._pixelPollSeq) return;
    if (this.rasterStrokeActive) return;   // look again after the stroke (its end saves anyway)
    this._pixelPollSeq = v.seq;
    const base = this._pixelPollBaseline;
    this._pixelPollBaseline = v;
    if (base && contentVersionsDiffer(base, v)) this._inZone(() => this.sceneChanged$.next('__pixels_' + v.seq));
  }
  private _rasterEditedSinceThumbnail = false;

  async saveThumbnail() {
    if (this._isSaveBlocked()) return;   // don't replace the good thumbnail with a half-loaded scene
    // Resolve the target BEFORE the capture await — "New" / a doc switch can change it meanwhile, which used to
    // upload the old canvas as the next document's thumbnail.
    const uid = this.illustrationUid;
    const mode = this.syncMode;
    const localUuid = this.illustration?.uuid;
    if (!uid) return;
    const sm = this.shapeManager;
    let blob: Blob;
    if (sm.captureDocumentBoundsToBlob) {
      blob = await sm.captureDocumentBoundsToBlob('jpeg', 512);
    } else {
      blob = await this.shapeManager.captureThumbnailBlob(300);
    }

    if (mode === 2) {
      // Local-only: store thumbnail as a data URL in IndexedDB
      const reader = new FileReader();
      reader.onload = () => {
        if (localUuid) {
          this.localIllustrationService.updateThumbnail(localUuid, reader.result as string).catch(e => console.warn('[save] thumbnail update failed', e));
        }
      };
      reader.readAsDataURL(blob);
    } else {
      this.illustrationService.uploadThumbnail(uid, blob).subscribe();
    }
  }

  /**
   * @param opts.nothingSavedYet the document was created a moment ago in this session and handed over in memory (the
   *        Shell's New Project, see fresh-local-document.ts): the local-only load skips probing OPFS for a saved copy.
   */
  async initWithIllustration(illustration: Illustration, opts: { nothingSavedYet?: boolean } = {}): Promise<void> {
    this._resetForNewDocument();
    this._nothingSavedYet = opts.nothingSavedYet === true;
    this.illustration = illustration;
    this.host.doc.illustrationTitle = illustration.name ?? 'Untitled';
    this.syncMode = illustration.syncMode ?? (this.isLocalMode ? 2 : 0);

    this.host.resetSceneState();
    await this.loadIllustrationV2();

    this._pendingChangeSub = this.sceneChanged$.subscribe(() => { this._pendingChange = true; });
    // sceneChanged$ may be ticked from outside the zone (engine callbacks, debounce timers moved out of it — zone audit
    // H7), and then the audit timers run outside too: the saves re-enter, their status / prompts are bound.
    this.autoSaveSubscription = this.sceneChanged$
      .pipe(auditTime(2000), distinctUntilChanged())
      .subscribe(() => this._inZone(async () => {
        if (!this.illustration) return;
        try {
          await this.saveIllustrationV2();
        } catch (e) {
          console.warn('[V2 Save] autosave failed', e);
        }
      }));

    // Fast OPFS metadata flush — persists non-pixel settings (dither, bgColor, etc.)
    // within ~400ms so a quick refresh doesn't lose them before the 2s cloud save fires.
    this._metaFlushSub = this._metaFlush$
      .pipe(debounceTime(100))
      .subscribe(() => void this._quickFlushOpfsMeta());

    // For local-only use the UUID as the OPFS doc key (no numeric SQL id)
    const opfsDocId = this.syncMode === 2
      ? 'local-' + (this.illustration.uuid ?? '')
      : this.illustration.id?.toString() ?? '';

    if (opfsDocId) {
      this.autoSaveService.enable(
        opfsDocId,
        this.illustration.name ?? 'Untitled',
        // BRUSH-6 (salsa docs/specs/mobile-parity.md §3): 100 ms autosaved (read back EVERY layer) after nearly
        // every stroke while painting — a hitch per stroke on tablets. 1.5 s waits for a pause instead.
        { intervalMs: this.host.selectedAutoSaveInterval, strokeDebounceMs: 1500 }
      );
      this._autoSaveStateSub = this.autoSaveService.state$.subscribe(s => this.autoSaveState = s);
    }
    // An import (Shell .frogmarks / .frog) restored the content during the load: save it once the load is over
    if (this._saveWhenLoaded) {
      this._saveWhenLoaded = false;
      void this._saveImportedDocument(illustration).catch(e => console.warn('[import] first save failed', e));
    }

    this.thumbnailSaveSubscription = this.sceneChanged$
      .pipe(auditTime(5000))
      .subscribe(() => this._inZone(() => {
        if (!this.illustration?.isCustomThumbnail) {
          this.saveThumbnailIfChanged();
        }
      }));

    // A Duplicate (DocumentActionsService) was copied on this device's storage; the server has none of it yet. Its
    // first cloud save uploads EVERY layer, mesh and the texture library (not just what changed since this load).
    const nav = (typeof window !== 'undefined' ? window.history.state : null) as { duplicateOf?: string; illustration?: { uuid?: string } } | null;
    if (this.syncMode === 0 && nav?.duplicateOf && nav.illustration?.uuid === illustration.uuid) {
      this.forceFullUpload();
      this.sceneChanged$.next('__duplicate_' + Date.now());
    }

    this._startPixelPoll();
    this._checkSaveBlocked();
    this.host.markLoaded('illustration');
  }

  /** Run fn in Angular's zone (directly when already in it, or when there is no NgZone — specs). */
  private _inZone<T>(fn: () => T): T {
    if (!this.ngZone || NgZone.isInAngularZone()) return fn();
    return this.ngZone.run(fn);
  }

  saveBlockedReason: string | null = null;

  saveBlockedAreas: string[] = [];

  /** True when the doc was saved by a newer Salsa — resuming would overwrite newer data. */
  saveBlockedByNewerVersion = false;

  _checkSaveBlocked(): void {
    const sm = this.shapeManager;
    const reason = sm.getSaveBlockedReason() ?? null;
    this.saveBlockedReason = reason;
    if (!reason) { this.saveBlockedAreas = []; this.saveBlockedByNewerVersion = false; return; }
    this.saveBlockedByNewerVersion = /newer version/i.test(reason);
    const issues = sm.getLastRestoreIssues() ?? [];
    this.saveBlockedAreas = [...new Set(issues.map(i => i.area))];
  }

  saveBlockedKeepWhatLoaded(): void {
    this.shapeManager.clearSaveBlock();
    this._checkSaveBlocked();
    this.notifyService.success('Saving resumed.');
    void this.saveIllustrationV2();   // edits made while paused were held back — write them now
  }

  /** Salsa's save block (set after a partial restore). Every Frogmarks write path checks it — Salsa only guards its own. */
  _isSaveBlocked(): boolean {
    return !!this.shapeManager?.getSaveBlockedReason();
  }

  saveBlockedReload(): void {
    window.location.reload();
  }
}
