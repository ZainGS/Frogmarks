import { inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { FrogFileService } from 'app/shared/services/illustrate/frog-file.service';
import { IllustrationPersistenceService } from './illustration-persistence.service';
import { IllustrationService } from 'app/shared/services/illustrate/illustration.service';
import { LayerEffectsService } from './layer-effects.service';
import { NotifyService } from 'app/shared/services/notify/notify.service';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';
import { FrogImportResult } from 'app/shared/services/illustrate/frog-file.service';
import { Illustration } from 'app/illustrate/models/illustration.model';
import { firstValueFrom } from 'rxjs';
import { OnionSkinConfig, LoopMode } from 'app/shared/services/raster/raster-animation.service';
import { DitherConfig } from 'app/boards/models/brush-preset.model';

import { ArtboardService } from './artboard.service';
import {
  buildFrogmarksStateFile, FROGMARKS_STATE_FILE, FROGMARKS_THUMBNAIL_FILE, FrogmarksPackageError, NOT_A_PROJECT_MESSAGE,
  readFrogmarksPackage, type FrogmarksEditorState,
} from 'app/shared/services/illustrate/frogmarks-package';
/** Exactly the editor state the project-file actions read and write. Typed against the editor so a rename breaks here at compile time. */
export type ProjectFileHost = Pick<IllustrationComponent, 'shapeManager' | 'doc' | '_disableAllViewerTools' | 'setAnimationEnabled' |
  'canvas' | 'closeContextMenu' |
  'markLoaded' | 'refreshRasterLayers' | 'scene3dRefreshMeshes'
>;

/**
 * Project files and sharing: .frogmarks save / restore (with the compare modal), .frogcart export, .frog export /
 * import (applyFrogImport), publish / unpublish + the share dialog, and viewer-mode boot. Component-scoped (provided
 * by IllustrationComponent). Bodies moved verbatim from illustration.component (refactor-plan 2.8 step B).
 */
@Injectable()
export class ProjectFileService implements OnDestroy {
  private host!: ProjectFileHost;
  constructor(private artboard: ArtboardService, private animationService: RasterAnimationService, private frogFileService: FrogFileService, private fx: LayerEffectsService, private illustrationService: IllustrationService, private notifyService: NotifyService, private persist: IllustrationPersistenceService) {}
  bind(host: ProjectFileHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }
  /** Zone audit item 3: unpackProject restores a whole document (a city's build, stream pump, tile workers, tickers) —
   *  run OUTSIDE the zone so the timers / worker messages it starts don't each run an app change detection. The awaits
   *  resume in the zone (callers are in it), so the UI updates after them are change-detected as before. */
  private readonly ngZone = inject(NgZone);

  ngOnDestroy(): void {
  }

  viewerTitle = '';

  isPublishing = false;

  showPublishShareDialog = false;

  publishShareViewUrl = '';

  publishShareEmbedCode = '';

  exportCartTitle = '';

  exportCartAuthor = '';

  exportCartDescription = '';

  exportCartBusy = false;

  exportCartSounds: string[] = [];

  async exportModalFrogcart(): Promise<void> {
    if (this.exportCartBusy) return;
    this.exportCartBusy = true;
    try {
      const sm = this.shapeManager;
      const blob: Blob | undefined = await sm.exportFrogcart({
        title:       this.exportCartTitle || 'Untitled',
        author:      this.exportCartAuthor || undefined,
        description: this.exportCartDescription || undefined,
      });
      if (!blob) { this.exportCartBusy = false; return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(this.exportCartTitle || 'scene').replace(/[^a-z0-9_\-]/gi, '_')}.frogcart`;
      a.click();
      URL.revokeObjectURL(url);
      this.host.doc.closeExportModal();
    } catch (e) {
      console.error('[Export] frogcart failed', e);
    }
    this.exportCartBusy = false;
  }

  async exportFrogFile(): Promise<void> {
    try {
      await this.frogFileService.exportFrogFile(
        this.host.doc.illustrationTitle ?? this.persist.illustration?.name ?? 'Untitled',
        this.host.canvas
      );
      this.notifyService.success('Illustration exported!');
    } catch (e) {
      console.error('[FrogFile] export failed', e);
      this.notifyService.error('Export failed. See console for details.');
    }
  }

  async importFrogFile(): Promise<void> {
    try {
      const result = await this.frogFileService.importFrogFile();
      if (!result) return;
      await this.applyFrogImport(result);
      this.notifyService.success(`"${result.manifest.name}" imported!`);
    } catch (e: any) {
      if (e?.message === 'No file selected') return; // user cancelled
      console.error('[FrogFile] import failed', e);
      this.notifyService.error('Import failed. See console for details.');
    }
  }

  /** Apply a parsed .frog import result to the engine. Used by both manual import and dashboard pending import. */
  async applyFrogImport(result: FrogImportResult): Promise<void> {
    const { manifest, sceneGraph, layerPixelData } = result;

    // 1. Apply scene graph
    if (sceneGraph) {
      await this.shapeManager.setSceneGraphJSON(sceneGraph);
    }

    // 2. Import pixel data
    if (layerPixelData.length > 0 && this.shapeManager?.importRasterLayersFromDataURLs) {
      const importPayload = layerPixelData.map(lp => ({
        id: lp.layerId,
        celId: lp.celId,
        name: lp.name,
        imageData: lp.imageDataUrl,
        blendMode: lp.blendMode,
        opacity: lp.opacity,
        visible: lp.visible,
        locked: lp.locked,
        clipped: lp.clipped,
        lockTransparency: lp.lockTransparency,
      }));
      try {
        // Clear the auto-created "Background" layer before importing saved layers
        this.shapeManager?.rasterLayerManager?.clearAllLayers();
        await this.shapeManager.importRasterLayersFromDataURLs(importPayload);
      } catch (e) {
        console.warn('[FrogFile] importRasterLayersFromDataURLs failed', e);
      }
    }

    // 3. Apply layer properties
    const sm = this.shapeManager;
    for (const layer of manifest.layers) {
      if (sm?.setRasterLayerBlendMode) sm.setRasterLayerBlendMode(layer.layerId, layer.blendMode as any);
      if (sm?.setRasterLayerOpacity) sm.setRasterLayerOpacity(layer.layerId, layer.opacity);
      if (sm?.setRasterLayerVisibility) sm.setRasterLayerVisibility(layer.layerId, layer.visible);
      if (sm?.setRasterLayerLockTransparency) sm.setRasterLayerLockTransparency(layer.layerId, layer.lockTransparency);
      if (sm?.setRasterLayerClipping) sm.setRasterLayerClipping(layer.layerId, layer.clipped);
      if (layer.ditherConfig && sm?.setLayerDitherConfig) {
        sm.setLayerDitherConfig(layer.layerId, layer.ditherConfig as any);
        this.fx.layerDitherConfigs.set(layer.layerId, { ...layer.ditherConfig } as DitherConfig);
      }
      if (layer.frameLinkAnimation && sm?.setLayerFrameLinkAnimation) {
        sm.setLayerFrameLinkAnimation(layer.layerId, layer.frameLinkAnimation as any);
      }
    }

    // 4. Restore animation state
    if (manifest.animation?.enabled) {
      const anim = manifest.animation;
      this.host.setAnimationEnabled(true);
      this.animationService.setFrameCount(anim.frameCount);
      this.animationService.setFps(anim.fps);
      this.animationService.setLoopMode(anim.loopMode as LoopMode);
      this.animationService.setPlayRange(anim.playRangeStart, anim.playRangeEnd);
      if (anim.onionSkin) {
        this.animationService.setOnionSkin(anim.onionSkin as OnionSkinConfig);
      }
      for (const layer of manifest.layers) {
        if (layer.animated) {
          this.animationService.setLayerAnimated(layer.layerId, true);
          for (const cel of layer.cels) {
            this.animationService.addCelAtFrame(layer.layerId, cel.frame);
          }
        }
      }
      this.animationService.refreshTimeline();
    }

    // 5. Restore document size
    this.artboard.applyDocumentSize(manifest.documentSize ?? null);

    // 6. Update UI
    this.host.doc.illustrationTitle = manifest.name;
    this.host.refreshRasterLayers();

    // 6. Restore dither config from frog import (if present)
    if (result.ditherConfig) {
      this.fx._applyDitherConfig(result.ditherConfig);
    }

    // After a full restore, treat all layers as needing re-upload
    this.persist._invalidateUploadedLayers();
  }

  async _initViewerMode(uid: string): Promise<void> {
    try {
      const viewDto = await firstValueFrom(this.illustrationService.getPublicView(uid));
      this.viewerTitle = viewDto.name;

      const response = await fetch(viewDto.bundleUrl);
      if (!response.ok) throw new Error(`Bundle fetch failed: ${response.status}`);
      const bundle = await response.blob();

      await this.ngZone.runOutsideAngular(() => this.shapeManager.unpackProject(bundle));
      this.host._disableAllViewerTools();
      // Safety fallback: if unpackProject doesn't fire onSceneGraphChanged, unblock the loader
      requestAnimationFrame(() => this.host.markLoaded('sceneApplied'));
    } catch (e) {
      console.error('[Viewer] failed to load bundle', e);
      this.notifyService.error('Could not load this illustration.');
      requestAnimationFrame(() => this.host.markLoaded('sceneApplied'));
    }
    this.host.markLoaded('illustration');
  }

  async publishIllustration(): Promise<void> {
    if (!this.persist.illustration?.id || this.isPublishing) return;
    this.isPublishing = true;
    this.host.closeContextMenu();
    try {
      const sm = this.shapeManager;
      if (!sm?.packProject) throw new Error('packProject not available');
      const bundle: Blob = await sm.packProject();
      await new Promise<void>((resolve, reject) => {
        this.illustrationService.publishIllustration(
          this.persist.illustration!.id!,
          bundle,
          this.host.doc.illustrationTitle || this.persist.illustration!.name
        ).subscribe({
          next: (res: any) => {
            const updated = res?.resultObject ?? res;
            if (updated?.isPublic !== undefined) {
              this.persist.illustration!.isPublic = updated.isPublic;
              this.persist.illustration!.publishedVersion = updated.publishedVersion;
              this.persist.illustration!.publishedAt = updated.publishedAt;
            }
            const uid = this.persist.illustration!.uuid ?? updated?.uuid ?? '';
            const origin = window.location.origin;
            this.publishShareViewUrl = `${origin}/view/${uid}`;
            this.publishShareEmbedCode =
              `<script src="${origin}/salsa-viewer.js"><\/script>\n` +
              `<salsa-viewer src="${this.publishShareViewUrl}"></salsa-viewer>`;
            this.showPublishShareDialog = true;
            resolve();
          },
          error: (err: any) => reject(err),
        });
      });
    } catch (e: any) {
      this.notifyService.error(e?.message?.includes('packProject') ? 'Could not pack illustration for publishing.' : 'Publish failed. Please try again.');
    } finally {
      this.isPublishing = false;
    }
  }

  unpublishIllustration(): void {
    if (!this.persist.illustration?.id) return;
    this.illustrationService.unpublishIllustration(this.persist.illustration.id).subscribe({
      next: () => {
        this.persist.illustration!.isPublic = false;
        this.notifyService.success('Illustration is now private.');
      },
      error: () => this.notifyService.error('Unpublish failed.')
    });
    this.host.closeContextMenu();
  }

  closePublishShareDialog(): void {
    this.showPublishShareDialog = false;
  }

  copyPublishUrl(): void {
    void navigator.clipboard.writeText(this.publishShareViewUrl).then(() => {
      this.notifyService.success('Link copied!');
    });
  }

  copyEmbedCode(): void {
    void navigator.clipboard.writeText(this.publishShareEmbedCode).then(() => {
      this.notifyService.success('Embed code copied!');
    });
  }

  frogmarksSaving = false;

  frogmarksRestoreModal: {
    currentThumbnailUrl: string;
    currentDate: string;
    fileThumbnailUrl: string;
    fileDate: string;
  } | null = null;

  _pendingRestoreFile: File | null = null;

  _pendingRestoreFileUuid: string | null = null;

  _pendingRestoreEditorState: FrogmarksEditorState | null = null;

  async frogmarksSave(): Promise<void> {
    if (this.frogmarksSaving) return;
    this.frogmarksSaving = true;
    try {
      const sm = this.shapeManager;

      const { default: JSZip } = await import('jszip');
      const salsaBlob: Blob = await sm.packProject();
      const zip = await JSZip.loadAsync(salsaBlob);

      const name = this.host.doc.illustrationTitle || this.persist.illustration?.name || 'Untitled';
      // The editor-owned settings (canvas look, dither, animation, host-owned 3D …) go in too, so an import restores
      // them (readFrogmarksPackage / restoreProjectPackage). Non-fatal: the package alone still restores the content.
      const editorState = await this.persist._buildFullState().catch((e) => { console.warn('[frogmarksSave] editor state', e); return null; });
      zip.file(FROGMARKS_STATE_FILE, JSON.stringify(buildFrogmarksStateFile({
        name,
        uuid: this.persist.illustrationUid,
        illustrationId: this.persist.illustration?.id ?? null,
        teamId: this.persist.illustration?.teamId ?? null,
        deviceName: localStorage.getItem('frogmarks-device-name') ?? null,
        editorState,
      }), null, 2));

      try {
        const thumbBlob = await this.shapeManager.captureThumbnailBlob(300);
        if (thumbBlob) zip.file(FROGMARKS_THUMBNAIL_FILE, thumbBlob);
      } catch { /* non-fatal */ }

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const safeName = name.replace(/[^a-z0-9_\-]/gi, '_');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.frogmarks`;
      a.click();
      URL.revokeObjectURL(url);
      this.host.doc.startExportReminder();
    } catch (e) {
      console.error('[frogmarksSave]', e);
      this.notifyService.error('Could not save project. Please try again.');
    } finally {
      this.frogmarksSaving = false;
    }
  }

  async frogmarksLoad(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (!file) return;
    try {
      const info = await readFrogmarksPackage(file, { thumbnail: true });
      if (info.kind !== 'frogmarks') throw new FrogmarksPackageError('not-a-project', NOT_A_PROJECT_MESSAGE);
      const meta = info.state;

      const fileUuid: string | null = meta?.uuid ?? null;
      const fileName: string = info.name;

      if (fileUuid && this.persist.illustrationUid && fileUuid !== this.persist.illustrationUid) {
        // Different illustration — simple confirm
        const ok = window.confirm(
          `"${fileName}" is from a different illustration.\n\nThis will replace the current content of "${this.persist.illustration?.name ?? 'this illustration'}". Continue?`
        );
        if (!ok) return;
        await this._doFrogmarksRestore(file, fileUuid, meta?.editorState ?? null);
      } else {
        // Same illustration (or no UUID in file) — show thumbnail comparison modal
        const fileThumbBlob = info.thumbnail;
        const fileThumbnailUrl = fileThumbBlob ? URL.createObjectURL(fileThumbBlob) : '';
        const fileDate = meta?.packedAt
          ? new Date(meta.packedAt).toLocaleString()
          : 'Unknown date';

        const currentThumbBlob = await this.shapeManager.captureThumbnailBlob(300).catch(() => null);
        const currentThumbnailUrl = currentThumbBlob ? URL.createObjectURL(currentThumbBlob) : '';
        const currentDate = new Date().toLocaleString();

        this._pendingRestoreFile = file;
        this._pendingRestoreFileUuid = fileUuid;
        this._pendingRestoreEditorState = meta?.editorState ?? null;
        this.frogmarksRestoreModal = { currentThumbnailUrl, currentDate, fileThumbnailUrl, fileDate };
      }
    } catch (e) {
      console.error('[frogmarksLoad]', e);
      this.notifyService.error(e instanceof FrogmarksPackageError
        ? e.message
        : 'Could not load project. The file may be corrupted or from a newer version of Frogmarks.');
    }
  }

  async confirmFrogmarksRestore(): Promise<void> {
    const file = this._pendingRestoreFile;
    const uuid = this._pendingRestoreFileUuid;
    const editorState = this._pendingRestoreEditorState;
    this._closeFrogmarksRestoreModal();
    if (file) await this._doFrogmarksRestore(file, uuid, editorState);
  }

  cancelFrogmarksRestore(): void {
    this._closeFrogmarksRestoreModal();
  }

  _closeFrogmarksRestoreModal(): void {
    if (this.frogmarksRestoreModal) {
      URL.revokeObjectURL(this.frogmarksRestoreModal.currentThumbnailUrl);
      URL.revokeObjectURL(this.frogmarksRestoreModal.fileThumbnailUrl);
    }
    this.frogmarksRestoreModal = null;
    this._pendingRestoreFile = null;
    this._pendingRestoreFileUuid = null;
    this._pendingRestoreEditorState = null;
  }

  async _doFrogmarksRestore(file: File, _fileUuid: string | null, editorState: FrogmarksEditorState | null = null): Promise<void> {
    try {
      // The one restore (shared with the Shell's Import): unpack, keep saving to THIS document, bring the editor in
      // line (raster layers, dither, timeline, 3D panels and mirrors) and apply the file's editor settings.
      await this.persist.restoreProjectPackage(file, editorState);
      // Write it now (saveNow was a phantom — saveDocument is the real flush), then the metadata save
      if (!this.persist._isSaveBlocked()) await this.shapeManager.persist?.saveDocument();
      this.persist.sceneChanged$.next('__restore_' + Date.now());
      this.persist._checkSaveBlocked();
      if (!this.persist.saveBlockedReason) this.notifyService.success('Project loaded successfully.');
    } catch (e) {
      console.error('[frogmarksLoad]', e);
      this.persist._checkSaveBlocked();
      this.notifyService.error('Could not load project. The file may be corrupted or from a newer version of Frogmarks.');
    }
  }
}
