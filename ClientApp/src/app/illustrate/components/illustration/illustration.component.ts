import { Component, OnInit, OnDestroy, ViewChild, HostListener, ElementRef, NgZone, inject, isDevMode } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ResultType } from '../../../shared/models/error-result.model';

import { IllustrationService } from 'app/shared/services/illustrate/illustration.service';
import { LocalIllustrationService } from 'app/shared/services/illustrate/local-illustration.service';
import { takeFreshLocalDocument } from 'app/shared/services/illustrate/fresh-local-document';
import { logCreateTimeline, perfMark } from 'app/shared/utilities/perf-marks';
import { FrogImportResult } from 'app/shared/services/illustrate/frog-file.service';

import { Illustration } from 'app/illustrate/models/illustration.model';

import ShapeManager from '@zaings/salsa/shape-manager';
import WorldManager from '@zaings/salsa/world-manager';
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering, SceneAuthoringAPI } from '@zaings/salsa';

import { ShapeType } from '../../../shared/enums/shape-type';
import { distinctUntilChanged, filter, firstValueFrom, map, Subscription } from 'rxjs';
import { ColorPickerComponent } from 'app/shared/components/color-picker/color-picker.component';

import { NotifyService } from 'app/shared/services/notify/notify.service';
import { SkinsPanelComponent } from '../skins-panel/skins-panel.component';
import { UiSystemPanelComponent } from '../ui-system-panel/ui-system-panel.component';
import { WorldPanelComponent } from '../world-panel/world-panel.component';
import { PackageCreatorService } from '../../services/package-creator.service';
import { Scene3dSettingsService } from '../../services/scene3d-settings.service';
import { EditorStateService } from '../../services/editor-state.service';
import { DocumentActionsService } from '../../services/document-actions.service';
import { SceneStatsService } from '../../services/scene-stats.service';
import { CharacterEditService } from '../../services/character-edit.service';
import { ProceduralPanelsService } from '../../services/procedural-panels.service';
import { DrawingOptionsService } from '../../services/drawing-options.service';
import { MediaImportService } from '../../services/media-import.service';
import { ArtboardService } from '../../services/artboard.service';
import { CanvasAppearanceService } from '../../services/canvas-appearance.service';
import { EngineStatusService } from '../../services/engine-status.service';
import { MeshEditService } from '../../services/mesh-edit.service';
import { ViewportHudService } from '../../services/viewport-hud.service';
import { RibbonService } from '../../services/ribbon.service';
import { UvEditorService } from '../../services/uv-editor.service';
import { SceneOutlinerService } from '../../services/scene-outliner.service';
import { ArrayToolService } from '../../services/array-tool.service';
import { DecalService } from '../../services/decal.service';
import { CreatorService } from '../../services/creator.service';
import { StorageSettingsService } from '../../services/storage-settings.service';
import { SceneAddService } from '../../services/scene-add.service';
import { ProjectFileService } from '../../services/project-file.service';
import { ditherReveal } from '../../utils/dither-reveal';
import { rasterLayerSignature } from '../../utils/raster-layer-signature';
import { FrameCoalescer } from '../../../shared/utilities/frame-coalescer';
import { activeContextPill, canRouteDuplicate, cheatsheetColumns, ContextPillButton, ContextPillSpec, dispatchKey, MOD_KEYMAP, MODE_ACTIONS, routeDelete, TOOL3D_ACTIONS,
  routeDuplicate, routeUndo, TOOL_KEYMAP } from './editor-keymap';
import { hotkeyNeedsZone } from './hotkey-zone-gate';
import { TouchUiService } from '../../services/touch-ui.service';
import { ToolSubpanelCollapse } from '../../utils/tool-subpanel-collapse';
import { aiToolEnabled } from '../../utils/ai-tool-flag';
import { SidePanelService } from '../../services/side-panel.service';
import { applyStoredExperiments } from '../../services/experimental-settings.service';
import { toggleAppFullscreen } from '../../../shared/utilities/app-fullscreen';
import { AppUpdateService } from '../../../shared/services/pwa/app-update.service';
import type { OutlinerAction } from '../scene-outliner/scene-outliner.component';
import { IllustrationPersistenceService } from '../../services/illustration-persistence.service';
import { FillWandService } from '../../services/fill-wand.service';
import { RasterTextService } from '../../services/raster-text.service';
import { PanelLayoutService } from '../../services/panel-layout.service';
import { SceneAnimationService } from '../../services/scene-animation.service';
import { LayerEffectsService } from '../../services/layer-effects.service';
import { CharacterPanelComponent, CharacterGenerated } from '../character-panel/character-panel.component';
import { ArrayGroupPanelComponent } from '../array-group-panel/array-group-panel.component';
import { ClothInspectorComponent } from '../cloth-inspector/cloth-inspector.component';
import { VectorLayerPanelComponent } from '../vector-layer-panel/vector-layer-panel.component';
import { MeshBlendShapesSectionComponent } from '../mesh-blend-shapes-section/mesh-blend-shapes-section.component';
import { AddMeshAction } from '../add-mesh-menu/add-mesh-menu.component';
import { MeshMaterialSectionComponent } from '../mesh-material-section/mesh-material-section.component';
import { MeshFrameLinkSectionComponent } from '../mesh-frame-link-section/mesh-frame-link-section.component';
import { MeshHtmlTextureSectionComponent } from '../mesh-html-texture-section/mesh-html-texture-section.component';
import { MeshTextureSectionComponent } from '../mesh-texture-section/mesh-texture-section.component';
import { MeshTransformSectionComponent } from '../mesh-transform-section/mesh-transform-section.component';
import { MeshBehaviorSectionComponent } from '../mesh-behavior-section/mesh-behavior-section.component';
import { MeshOutlineSectionComponent } from '../mesh-outline-section/mesh-outline-section.component';
import { BalloonOptionsComponent } from '../balloon-options/balloon-options.component';
import { LiveTextOptionsComponent } from '../live-text-options/live-text-options.component';
import { ClothBuilderInit, ClothBuilderResult, applyClothBuilderResult, clothBuilderInitFor } from '../cloth-builder/cloth-builder.component';
import { RasterBrushService } from 'app/shared/services/raster/raster-brush.service';
import { RasterSelectionService } from 'app/shared/services/raster/raster-selection.service';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';
import { RasterAutoSaveService } from 'app/shared/services/raster/raster-autosave.service';
import { HiddenUiWake } from '../../utils/hidden-ui-wake';
import { releaseViewGizmo, syncViewGizmoHidden, ViewGizmoEngine } from './view-gizmo-host';
import {
  SelectionTool, CanvasGrainType, CanvasGrainOption, CANVAS_GRAIN_OPTIONS, ArrowheadStyle,
  ARROWHEAD_OPTIONS,
} from 'app/boards/models/brush-preset.model';

/** The engine events the editor coalesces to one change detection per frame (H5). */
type EngineEventKind = 'selection' | 'shapeSelection' | 'scene';

/** Salsa API newer than the dist Frogmarks type-checks against (feature-detected). */
type EngineDeleteKeyApi = { setDeleteKeyHandler?: (fn: (() => void) | null) => void };
type EngineDuplicateKeyApi = { setDuplicateKeyHandler?: (fn: (() => void) | null) => void };

/** The keyboard event being dispatched right now (window.event), for an engine key hook that isn't handed it. */
function currentKeyEvent(): KeyboardEvent | null {
  const ev = (globalThis as { event?: Event }).event;
  return typeof KeyboardEvent !== 'undefined' && ev instanceof KeyboardEvent ? ev : null;
}

/**
 * The Illustration editor shell: engine boot, selection, tool switching, canvas pointer routing, view modes and
 * menus. Feature state lives in the component-scoped services below and in child views — see
 * src/app/illustrate/ARCHITECTURE.md for the map (which service owns what, and the patterns to follow).
 */
@Component({
  selector: 'app-illustration',
  standalone: false,
  templateUrl: './illustration.component.html',
  styleUrl: './illustration.component.scss',
  providers: [
    // document
    IllustrationPersistenceService, ProjectFileService, StorageSettingsService,
    // 3D scene
    Scene3dSettingsService, SceneAnimationService, SceneAddService, SceneOutlinerService, RibbonService, UvEditorService,
    ViewportHudService, MeshEditService, CreatorService, DecalService, ArrayToolService, PackageCreatorService,
    // 2D tools + layer effects
    LayerEffectsService, PanelLayoutService, RasterTextService, FillWandService,
    // editor (added by the extractor below this line)
    EngineStatusService,
    CanvasAppearanceService,
    ArtboardService,
    MediaImportService,
    DrawingOptionsService,
    ProceduralPanelsService,
    CharacterEditService,
    SceneStatsService,
    DocumentActionsService,
    EditorStateService,
  ],
})
export class IllustrationComponent implements OnInit, OnDestroy {

  private routeSub?: Subscription;
  private _sceneGraphChangedSub: any = null;
  private _rasterLayersSub: any = null;
  private _rasterActiveLayerSub: any = null;
  private _currentFrameSub: any = null;
  private _scene3dViewportSub: any = null;
  private _viewStateSub: any = null;
  private _playStateSub: any = null;
  // ── Engine status pill (Salsa performance P2/P3) ──

  // ── GPU device-lost banner (Salsa docs/ui/device-recovery.md) ──
  private _cameraCutsSub: any = null;
  private _scene3dResizeObserver: ResizeObserver | null = null;

  @ViewChild('worldPanel') worldPanel?: WorldPanelComponent;
  @ViewChild('charPanel') charPanel?: CharacterPanelComponent;
  @ViewChild('arrayPanel') arrayPanel?: ArrayGroupPanelComponent;
  @ViewChild('clothInspector') clothInspector?: ClothInspectorComponent;
  @ViewChild('vectorPanel') vectorPanel?: VectorLayerPanelComponent;
  @ViewChild('blendSection') blendSection?: MeshBlendShapesSectionComponent;
  @ViewChild('toolOptionsPanel') toolOptionsPanelRef?: ElementRef<HTMLElement>;
  @ViewChild('materialSection') materialSection?: MeshMaterialSectionComponent;
  @ViewChild('frameLinkSection') frameLinkSection?: MeshFrameLinkSectionComponent;
  @ViewChild('htmlTextureSection') htmlTextureSection?: MeshHtmlTextureSectionComponent;
  @ViewChild('textureSection') textureSection?: MeshTextureSectionComponent;
  @ViewChild('transformSection') transformSection?: MeshTransformSectionComponent;
  @ViewChild('behaviorSection') behaviorSection?: MeshBehaviorSectionComponent;
  @ViewChild('outlineSection') outlineSection?: MeshOutlineSectionComponent;
  @ViewChild('balloonOptions') balloonOptions?: BalloonOptionsComponent;
  @ViewChild('liveTextOptions') liveTextOptions?: LiveTextOptionsComponent;
  @ViewChild('uiPanel') uiPanel?: UiSystemPanelComponent;
  @ViewChild('skinsPanel') skinsPanel?: SkinsPanelComponent;
  @ViewChild('webgpuCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  /** The 3D rotation-drag degree label (the HUD service writes it directly while dragging, M2). */
  @ViewChild('angleLabel') angleLabelRef?: ElementRef<HTMLDivElement>;
  @ViewChild('handleCanvas') handleCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('uvCanvas') uvCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('pkgDielinePane')  pkgDiePaneRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('pkgDielineGuide') pkgDieGuideRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('titleInput') titleInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('imageFileInput') imageFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imageFileInputLayer') imageFileInputLayer!: ElementRef<HTMLInputElement>;
  @ViewChild('bgColorPicker') bgColorPickerRef!: ColorPickerComponent;
  @ViewChild('dotColorPicker') dotColorPickerRef!: ColorPickerComponent;
  @ViewChild('shapeColorPicker') shapeColorPickerRef!: ColorPickerComponent;

  // Keeping the shell ref name for now; rename in template if you prefer
  @ViewChild('boardShell', { static: true }) boardShellRef!: ElementRef<HTMLDivElement>;
  @ViewChild('frogmarksLoadInput') frogmarksLoadInputRef?: ElementRef<HTMLInputElement>;

  /** File › Open .frogmarks (the hidden picker lives in the editor's template). */
  openFrogmarksPicker(): void { this.frogmarksLoadInputRef?.nativeElement.click(); }

  // Close on any document click, scroll, resize, or Escape
  @HostListener('document:click') onDocClick() { this.closeAllMenus(); }
  /** Window scroll / resize close the context menu. Listened OUTSIDE the zone (registered in ngOnInit): Android's URL
   *  bar fires resizes constantly and each in-zone event re-checked the whole editor; re-enter only to close a menu. */
  private readonly _onWinScrollOrResize = (): void => {
    if (this.contextMenu.visible) this.ngZone.run(() => this.closeContextMenu());
  };
  @HostListener('document:keydown.escape') onEsc() {
    if (this.scene3dViewIsPlaying) return; // Esc releases pointer-lock; Play Mode handles it
    this.charPanel?.charms.scene3dEndPlacePick();
    this.closeContextMenu();
  }

  /** Document keydown / keyup (the snap badge + the 3D keyboard transform). Listened OUTSIDE the zone (registered in
   *  ngOnInit; zone audit item 2): as @HostListeners every key — each WASD auto-repeat in Play too — ran an app change
   *  detection. Enter only when the badge or the transform HUD can change. Still document-level, so it runs before the
   *  window hotkeys (which skip a key the transform claimed: defaultPrevented). */
  private readonly _onDocKeyDownOutsideZone = (e: KeyboardEvent): void => {
    if (this.shapeManager?.isPlaying3D) return;
    if (e.repeat && (e.key === 'Control' || !/^[\d.\-]$/.test(e.key))) return;
    if (e.key !== 'Control' && !(this.editorState.scene3dPanelVisible && this.editorState.scene3dSelectedMeshId)) return;
    this.ngZone.run(() => this.onCtrlSnapKeyDown(e));
  };
  private readonly _onDocKeyUpOutsideZone = (e: KeyboardEvent): void => {
    if (e.key === 'Control') this.ngZone.run(() => this.onCtrlSnapKeyUp(e));
  };
  onCtrlSnapKeyDown(e: KeyboardEvent) {
    if (this.shapeManager?.isPlaying3D) return;   // Play owns the keyboard (Ctrl = sneak, not the snap indicator)
    // Held Ctrl: the badge is already on (each repeat re-entered the zone). Held transform keys: G / R / S / X / Y / Z /
    // Enter / Esc act once (a repeat restarted the transform or flipped the axis); digits keep repeating like typing.
    if (e.repeat && (e.key === 'Control' || !/^[\d.\-]$/.test(e.key))) return;
    if (e.key === 'Control') this.hud.snapKeyDown();
    if (this.editorState.scene3dPanelVisible && this.editorState.scene3dSelectedMeshId) this.hud.handleTransformKey(e);
  }
  onCtrlSnapKeyUp(e: KeyboardEvent) {
    if (e.key === 'Control') this.hud.snapKeyUp();
  }

  // State flags
  uiHidden = false;
  isFullscreen = false;
  /** Raster animation mode — read from the engine, the single source of truth (audit Phase 5.2: the editor kept its own
   *  copy and five call sites had to update both). Change it with setAnimationEnabled(). */
  get animationEnabled(): boolean { return !!this.shapeManager?.isAnimationEnabled(); }
  setAnimationEnabled(on: boolean): void { this.animationService.setAnimationEnabled(on); }

  // ── Auto-save state ───────────────────────────────────────────
  selectedAutoSaveInterval = 30_000;
  showEditMenu = false;
  showFileMenu = false;
  showAnimationMenu = false;
  showViewMenu = false;
  scene3dShowAddMeshMenu = false;

  toggleAnimationMode(): void {
    this.setAnimationEnabled(!this.animationEnabled);
    this.closeContextMenu();
    this._markStateDirty();
  }

  toggleUI(force?: boolean) {
    this.uiHidden = typeof force === 'boolean' ? force : !this.uiHidden;
    this._syncViewGizmoHidden();   // the 3D nav gizmo is editor chrome too (it lives on document.body, not in the template)
    // No keyboard on a tablet (UI-1): a floating "Show UI" button brings the UI back. It shows for a few seconds after
    // hiding, then fades; a tap on the canvas fades it back in (that tap only wakes it, it doesn't paint: HiddenUiWake).
    // The X key still toggles on any device.
    if (this.uiHidden) {
      this.notifyService.success(this.touchUi.coarse ? 'Tap the canvas, then "Show UI", to bring the UI back' : 'Press X (or tap the canvas, then "Show UI") to bring the UI back');
      this.closeContextMenu();
      this.ngZone.runOutsideAngular(() => this._hiddenUiWake.attach());   // window pointermove: no change detection per move
      this.revealShowUiButton();
    } else {
      this._hiddenUiWake.detach();
      clearTimeout(this._showUiBtnTimer);
      this.showUiBtnVisible = false;
    }
  }

  /** The floating "Show UI" button (only rendered while the UI is hidden) is faded in. */
  showUiBtnVisible = false;
  private _showUiBtnTimer?: ReturnType<typeof setTimeout>;
  static readonly SHOW_UI_BTN_MS = 3000;
  private readonly _hiddenUiWake = new HiddenUiWake(window, {
    isButtonShowing: () => this.showUiBtnVisible,
    passThrough: () => this.scene3dViewIsPlaying,   // Play: a touch drives the camera; never eat it
    onWake: () => this.ngZone.run(() => this.revealShowUiButton()),
  });

  /** Fade the "Show UI" button in and (re)start its ~3 s fade-out timer. */
  revealShowUiButton(): void {
    this.showUiBtnVisible = true;
    clearTimeout(this._showUiBtnTimer);
    this._showUiBtnTimer = setTimeout(() => { this.showUiBtnVisible = false; }, IllustrationComponent.SHOW_UI_BTN_MS);
  }

  /** View › Side Panel: show / hide the right panel column (remembered per machine, SidePanelService). Replaces the
   *  old "Toggle Layer Tree", which hid only the panel's contents and left the empty 280 px column catching touches. */
  toggleSidePanel(): void {
    this.sidePanel.toggle();
    this.closeContextMenu();
  }

  /** View › Toggle Full Screen (F): the whole app, so the rail, sub-panels, timeline and overlays stay visible (it used
   *  to fullscreen .board-shell, and everything outside that element disappeared). */
  async toggleFullscreen() {
    await toggleAppFullscreen();
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    const sm = this.shapeManager;
    const dirtyMeshIds: string[] = sm?.getDirtyMeshIds3D() ?? [];
    // Warn for unsaved 3D changes (cloud-sync/no-cloud) or if a save is still in-flight
    const hasUnsaved = dirtyMeshIds.length > 0 || this.persist.hasUnsavedChanges;   // incl. a change still in the 2 s debounce
    if (hasUnsaved) {
      event.preventDefault();
    }
  }

  /** App update (salsa/docs/ui/pwa.md): an update never reloads while this document has unsaved changes; the menubar's
   *  "Update ready" saves it first through this guard. Registered for the editor's whole life (a reused, detached
   *  editor still holds its document). */
  private readonly _appUpdate = inject(AppUpdateService);
  private _unregisterUpdateGuard: (() => void) | null = null;

  @HostListener('document:fullscreenchange') onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
  }
  @HostListener('document:webkitfullscreenchange') onFullscreenChangeWebkit() {
    this.isFullscreen = !!(document as any).webkitFullscreenElement;
  }

  // ---- renamed core state ----
  canvas!: HTMLCanvasElement;
  private selectionChangedSubscription!: { unsubscribe: () => void };
  private selectionToolSubscription!: { unsubscribe: () => void };

  contextMenu = { visible: false, x: 0, y: 0 };
  closeContextMenu() { if (this.contextMenu.visible) this.contextMenu.visible = false; }

  private rasterStrokeSubscription?: Subscription;
  /** Stroke start / cancel (mobile-parity 7.3c): the cloud pixel poll waits for a stroke; a taken-back stroke re-uploads. */
  private _rasterStrokeStartSub: { unsubscribe(): void } | null = null;
  private _rasterStrokeCancelSub: { unsubscribe(): void } | null = null;

  controlPanelActiveTool = '';
  shapeManager!: ShapeManager;
  worldManager!: WorldManager;
  authoringApi: SceneAuthoringAPI | null = null;
  isCommentPanelActive = false;

  cursorSelected = true;
  panHandSelected = false;

  // ── Artboard overlay ────────────────────────────────────────

  // Info tooltip (fixed-position, escapes overflow:hidden)
  infoTooltipVisible = false;
  infoTooltipText = '';
  infoTooltipX = 0;
  infoTooltipY = 0;

  readonly infoTips = {
    gridVisibility:  'Toggles the ground grid overlay.\nPurely visual — does not affect snapping.',
    snapMode:        'What Ctrl-drag snaps to.\n\nNone — free movement, no snapping.\nGrid — snaps position / rotation / scale to the increments below.\nVertex — snaps the dragged pivot onto the nearest vertex of another mesh. Great for exact part-to-part alignment.',
    snapGridSize:    'Cell size: distance between snap points in 3D world units.\nMove operations snap to multiples of this value.',
    snapRotate:      'Rotate step: rotation snaps to this angle increment\n(e.g. 15° → snaps to 0°, 15°, 30°…).',
    snapScaleStep:   'Scale snaps to this factor\n(e.g. 0.25 → snaps to 0.25×, 0.5×, 0.75×, 1×…).\n1 = whole multiples only. Smaller = finer control.',
  };

  showInfoTooltip(event: MouseEvent, text: string): void {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.infoTooltipText = text;
    this.infoTooltipX = rect.left - 256; // 240px tooltip + 16px gap, appears to the left
    this.infoTooltipY = rect.top;
    this.infoTooltipVisible = true;
  }

  hideInfoTooltip(): void {
    this.infoTooltipVisible = false;
  }

  mathRound(v: number): number { return Math.round(v); }

  // ═══════════════════════════════════════════════════════════
  //  Image Import — file picker, clipboard paste, drag-and-drop
  // ═══════════════════════════════════════════════════════════

  // ── Panel Layout tool ──────────────────────────────────────

  // ── Paper grain ────────────────────────────────────────────

  // ══════════════════════════════════════════════════════════
  //  3D Scene
  // ══════════════════════════════════════════════════════════

  /** Whether a 3D scene exists in the layer stack */
  get has3DScene(): boolean {
    return this.editorState.rasterLayers.some((l: any) => l.type === '3d-scene' || l.type === '3d-divider');
  }

  authoringPanelOpen = false;
  /** The AI Scene Authoring rail button + sub-panel are offered (WIP: off unless SHOW_AI_TOOL / the dev override). */
  readonly showAiTool = aiToolEnabled();

  /** Right-panel tab: 'scene' = layers + outliner/mesh, 'global' = global scene settings, 'ui' = UI system */
  rightPanelTab: 'scene' | 'global' | 'ui' = 'scene';

  // ── Theme ──────────────────────────────────────────────────────
  retroThemeActive = localStorage.getItem('fm-theme') === 'retro-chrome';

  toggleRetroTheme(): void {
    this.retroThemeActive = !this.retroThemeActive;
    if (this.retroThemeActive) {
      document.body.classList.add('theme-retro-chrome');
      localStorage.setItem('fm-theme', 'retro-chrome');
    } else {
      document.body.classList.remove('theme-retro-chrome');
      localStorage.removeItem('fm-theme');
    }
  }

  // Sidebar tool-swap animation state
  tools2dVisible = true;
  tools2dExiting = false;
  tools3dVisible = false;
  tools3dExiting = false;
  private _toolsSwapTimer: ReturnType<typeof setTimeout> | null = null;

  scene3dGizmoMode: 'move' | 'rotate' | 'scale' | null = 'move';
  scene3dGizmoOrientation: 'world' | 'local' = 'world';
  scene3dOrbitEnabled = false;

  scene3d2DPanelsActive = true;
  scene3dViewFly = false;
  scene3dViewIsPlaying = false;
  scene3dViewArtboardFrame = true;
  scene3dPlayCameraMode: 'first' | 'third' = 'first';

  // CD Jewel-Case Designer
  cdDesignerActive = false;
  cdKitRootId: string | null = null;
  cdTrayClear = false;

  // ── UI System ────────────────────────────────────────────
  uiSelectedShapeId: string | null = null;
  private _uiEventOff: (() => void) | null = null;
  private _uiSelectionOff: (() => void) | null = null;
  private _pathEditedOff: (() => void) | null = null;
  isPathEditActive = false;

  cityBuilding = false;
  cityBuildReason: 'load' | 'edit' = 'load';
  private _cityBuildSub: { unsubscribe(): void } | null = null;
  // Bucket state — persisted per group ID in the illustration save
  scene3dAllGroupBuckets: Record<string, string[][]> = {};

  // ── Vector / Ephemera state ────────────────────────────────
  activeVectorLayerId: string | null = null;
  showEphemeraPanel = false;

  onVectorLayerSelected(id: string | null): void {
    this.activeVectorLayerId = id;
    this.shapeManager?.setActiveVectorLayer(id);
    if (!id) {
      this.showEphemeraPanel = false;
    } else {
      // Deactivate 2D brush/drawing tools — they don't apply to vector layers
      const t = this.controlPanelActiveTool;
      if (t.startsWith('drawing:') || t.startsWith('raster:') || t === 'fill') {
        this.setActiveTool('');
      }
      this.vectorPanel?.refreshVectorShapes();   // a newly shown panel loads itself on its first ngOnChanges
    }
  }

  openEphemeraPanel(): void {
    this.showEphemeraPanel = !this.showEphemeraPanel;
    if (this.showEphemeraPanel) this.setActiveTool('');
  }

  closeEphemeraPanel(): void {
    this.showEphemeraPanel = false;
  }

  // Ribbon mesh
  // ── Armature state ─────────────────────────────────────────
  scene3dArmaturePanelOpen = false;

  openArmaturePanel(): void {
    this._exitAllScene3dModes();
    this.scene3dArmaturePanelOpen = true;
    this.arrayTool.scene3dDeactivateArrayTool();
    this.scene3dGizmoMode = null;
    const sm = this.shapeManager;
    sm.scene3d?.setGizmoMode(null);
    sm.setGizmoMode3D(null);
  }

  /** <app-armature-panel> is *ngIf'd on the flag; its ngOnDestroy exits bone placement / overlay / bg and stops clips. */
  closeArmaturePanel(): void {
    this.scene3dArmaturePanelOpen = false;
  }

  /** True while any exclusive 3D sub-mode is active. */
  get scene3dInSubMode(): boolean {
    return this.meshEdit.scene3dIsEditingMesh
      || this.scene3dArmaturePanelOpen
      || this.gpPanelVisible
      || this.uv.uvEditorOpen
      || this.uv.scene3dClothingPaintActive !== null
      || this.scene3dWorldPanelOpen;
  }

  _exitAllScene3dModes(): void {
    if (this.meshEdit.scene3dIsEditingMesh) this.meshEdit.exitMeshEditMode();
    if (this.scene3dArmaturePanelOpen) this.closeArmaturePanel();
    if (this.gpPanelVisible) this.closeGpPanel();
    if (this.uv.uvEditorOpen) this.uv.closeUVEditor();
    if (this.uv.scene3dClothingPaintActive) this.uv.scene3dToggleClothingPaint(this.uv.scene3dClothingPaintActive);
    // Real closes (a flag-only close left hair simulation / eye-draw on, and the city in city mode)
    if (this.character.scene3dEditCharPanelOpen) this.character.scene3dToggleEditCharPanel();
    if (this.scene3dGizmoMode !== null) {
      this.scene3dGizmoMode = null;
      this.shapeManager.setGizmoMode3D(null);
    }
    if (this.arrayTool.scene3dArrayToolActive) { this.arrayTool.scene3dDeactivateArrayTool(); }
    if (this.scene3dWorldPanelOpen) this.closeWorldPanel();
    this.pkg.exitQuietly();
  }

  // ── Array Tool (Repeat) ─────────────────────────────────────
  // Array Group panel state
  scene3dIsArrayGroup = false;
  // Phase 5: linked arrays badge (shown on source mesh)
  scene3dLinkedArrayCount = 0;

  // Selection-driven package mode
  scene3dSelectedIsPackage = false;
  pkgSelectedId: string | null = null;
  // Selection-driven particle emitter panel
  selectedParticleEmitterId: string | null = null;

  // ── World / City Tool ──────────────────────────────────────────────────────
  scene3dWorldPanelOpen = false;
  scene3dCityContainerId: string | null = null;
  private _gizmoPosTimer: any = null;

  // ── Instance groups (UV texture sharing) ───────────────────────
  // groupId → Set<meshId>; rebuilt each session from import/duplicate history
  private _instanceGroups = new Map<string, Set<string>>();
  // meshId → groupId (reverse lookup)
  private _meshGroupId = new Map<string, string>();

  _instanceGroupRegister(groupId: string, meshIds: string[]): void {
    if (!this._instanceGroups.has(groupId)) this._instanceGroups.set(groupId, new Set());
    const group = this._instanceGroups.get(groupId)!;
    for (const id of meshIds) { group.add(id); this._meshGroupId.set(id, groupId); }
  }

  private _instanceGroupRemove(meshId: string): void {
    const groupId = this._meshGroupId.get(meshId);
    if (!groupId) return;
    this._meshGroupId.delete(meshId);
    const group = this._instanceGroups.get(groupId);
    if (group) { group.delete(meshId); if (group.size === 0) this._instanceGroups.delete(groupId); }
  }

  // ── Ephemera overlay (reinit path) ─────────────────────────────
  private _ephemeraOverlay: HTMLCanvasElement | null = null;
  private _ephemeraOverlayObserver: ResizeObserver | null = null;

  // ── Cloth state ────────────────────────────────────────────
  scene3dIsCloth = false;
  clothBuilderVisible = false;
  clothBuilderInit: ClothBuilderInit = clothBuilderInitFor(null);

  // ── Scene dirty marks (persistence) ──────────────────────────
  private _scene3dDirtySeq = 0;

  scene3dMarkDirty(): void {
    this.persist.sceneChanged$.next('__3d_' + ++this._scene3dDirtySeq);
  }

  scene3dMarkTexLibDirty(): void {
    this.persist._texLibDirty = true;
    this.persist.sceneChanged$.next('__3d_' + ++this._scene3dDirtySeq);
  }

  _markStateDirty(): void {
    this.persist.sceneChanged$.next('__state_' + Date.now());
    this.persist._metaFlush$.next();
  }

  get scene3dSelectedIsSprite(): boolean { return this.editorState.scene3dSelectedMeshType === 'sprite'; }

  scriptApiRefOpen = false;
  scriptApiRefText = '';

  scene3dOpenScriptApiRef(): void {
    if (!this.scriptApiRefText) {
      this.scriptApiRefText = this.shapeManager.getScriptContextTypes3D() ?? 'API reference unavailable.';
    }
    this.scriptApiRefOpen = true;
  }

  get is3DContextActive(): boolean {
    return this.editorState.scene3dPanelVisible || !!this.editorState.scene3dSelectedMeshId;
  }

  get canUndo3D(): boolean {
    return !!this.shapeManager.canUndo3D;
  }

  get canRedo3D(): boolean {
    return !!this.shapeManager.canRedo3D;
  }

  get undoDescription3D(): string {
    return this.shapeManager.undoDescription3D ?? 'Nothing to undo';
  }

  get redoDescription3D(): string {
    return this.shapeManager.redoDescription3D ?? 'Nothing to redo';
  }

  /** Persistence applies a pending .frog import through the editor (ProjectFileService already injects persistence). */
  applyFrogImport(result: FrogImportResult): Promise<void> { return this.files.applyFrogImport(result); }

  get canUndo2DShapes(): boolean {
    return !!this.shapeManager.canUndo2DShapes;
  }

  get canRedo2DShapes(): boolean {
    return !!this.shapeManager.canRedo2DShapes;
  }

  shape2DUndo(): void {
    this.shapeManager.undo2DShapes();
  }

  shape2DRedo(): void {
    this.shapeManager.redo2DShapes();
  }

  /** Called by layer panel's (scene3dSelected) event */
  /** The 3D scene layer was selected (true) or left (false): grid overrides, toolbar swap, and entering / leaving the
   *  3D editing context. */
  onScene3dSelected(selected: boolean): void {
    this.editorState.scene3dPanelVisible = selected;
    const sm = this.shapeManager;
    sm.canvasGridVisibleOverride  = !selected;
    sm.sceneGridVisible3DOverride =  selected;
    this._swapToolbars(selected);
    if (selected) this._enter3dContext(); else this._leave3dContext();
  }

  /** Animated toolbar swap: the outgoing set exits first, then the other enters. */
  private _swapToolbars(to3d: boolean): void {
    if (this._toolsSwapTimer) { clearTimeout(this._toolsSwapTimer); this._toolsSwapTimer = null; }
    if (to3d) {
      this.tools3dExiting = false;
      this.tools2dExiting = true;
      this._toolsSwapTimer = setTimeout(() => {
        this.tools2dVisible = false;
        this.tools2dExiting = false;
        this.tools3dVisible = true;
      }, 300);
    } else {
      this.tools3dExiting = true;
      this._toolsSwapTimer = setTimeout(() => {
        this.tools3dVisible = false;
        this.tools3dExiting = false;
        this.tools2dVisible = true;
      }, 200);
    }
  }

  /** Entering 3D: load scene settings, refresh meshes / outliner / runtime state, attach keyframes + transform controls,
   *  keep the illustration camera in sync with pan / zoom / resize, start the gizmo readout. */
  private _enter3dContext(): void {
    this.s3._scene3dLoadSnapSettings();
    this.s3._loadScene3dGrid();
    this.s3.scene3dLoadSkyPresets();
    this.editorState.selectedRasterLayerId = null;
    this.scene3dRefreshMeshes();
    this.outliner.scene3dRefreshHierarchy();
    this.scene3dRefreshRuntimeState();
    this.anim.scene3dEnsureAnimationPlayer();
    if (!this.scene3dCreatorTypesList.length) this.scene3dRefreshCreatorTypes();
    this.shapeManager.scene3d?.enableTransformControls();

    const sm = this.shapeManager;

    // attachKeyframesToTimeline3D connects the 3D engine to the raster timeline
    // internally — it handles applyAllKeyframesAtFrame on every frame tick itself. (Idempotent; it was also called a
    // second time here through sm.scene3d, which could leave two retry subscriptions before the timeline existed.)
    // Deliberately NOT detached in _leave3dContext: the 3D scene layer still renders (and animates) while a 2D layer
    // is selected, and the per-frame pass is a cheap no-op for meshes without keyframes / Frame Link.
    sm.attachKeyframesToTimeline3D();

    // Disable all tools except cursor/pan while 3D viewport is active.
    this.selectCursor('cursor');

    // Apply the stored illustration projection (default: orthographic).
    sm.setIllustrationProjection3D(this.editorState.scene3dIllustrationProjection);
    this.scene3dSyncIllustrationCamera();

    // Keep camera in sync on every pan/zoom
    const is = sm.interactionService;
    if (is?.onViewportChanged) {
      this._scene3dViewportSub = is.onViewportChanged.subscribe(() => {
        this.scene3dSyncIllustrationCamera();
      });
    }

    // Keep camera in sync on canvas resize
    if (this.canvas) {
      this._scene3dResizeObserver = new ResizeObserver(() => {
        this.scene3dSyncIllustrationCamera();
        this.shapeManager.repositionUIForms();
      });
      this._scene3dResizeObserver.observe(this.canvas);
    }
    this.hud.startGizmoLoop();
  }

  /** Leaving 3D: detach pointer handling, exit sub-modes, drop the camera-sync listeners, stop the gizmo readout. */
  private _leave3dContext(): void {
    const sm = this.shapeManager;
    // Detach 3D pointer handling so meshes are no longer hoverable/selectable
    // while a raster/vector layer is active (the engine never detaches on its own).
    sm.disableTransformControls3D();
    sm.setHoveredMesh3D(null);
    this._exitAllScene3dModes();
    this._scene3dViewportSub?.unsubscribe?.();
    this._scene3dViewportSub = null;
    this._scene3dResizeObserver?.disconnect();
    this._scene3dResizeObserver = null;
    this.hud.stopGizmoLoop();
  }

  scene3dSyncIllustrationCamera(): void {
    const sm = this.shapeManager;
    const is = sm.interactionService;
    if (!is || !this.canvas) return;
    sm.syncIllustrationCamera3D(
      is.getPanOffset().x, is.getPanOffset().y,
      is.getZoomFactor(),
      this.canvas.width, this.canvas.height
    );
  }

  scene3dSetIllustrationProjection(mode: 'perspective' | 'orthographic'): void {
    this.editorState.scene3dIllustrationProjection = mode;
    this.shapeManager.setIllustrationProjection3D(mode);
    this._markStateDirty();
  }

  // ── View mode: target × cameraMode ───────────────────────────────────────

  private applyViewUI3D(rules: any): void {
    this.scene3d2DPanelsActive = rules.twoDToolsActive ?? true;
    const state: any = this.shapeManager.getViewState3D() ?? {};
    this.editorState.scene3dViewTarget = state.target ?? 'illustration';
    this.editorState.scene3dViewCameraMode = state.cameraMode ?? 'ortho2D';
    this.scene3dViewArtboardFrame = state.showArtboardFrame ?? true;
    this.scene3dViewFly = this.shapeManager.isFlyEnabled3D ?? false;
    // Activate full 3D context (panel + toolbar) when in Scene target or 3D Free camera
    if ((this.editorState.scene3dViewTarget === 'scene' || this.editorState.scene3dViewCameraMode === 'free3D') && this.has3DScene) {
      if (!this.editorState.scene3dPanelVisible) {
        this.onScene3dSelected(true);
      } else {
        // Already active (e.g. scene reloaded while in Scene mode) — refresh outliner
        this.scene3dRefreshMeshes();
        this.outliner.scene3dRefreshHierarchy();
      }
    }
    // Camera mode gates the artboard size label (2D views only)
    this.artboard.updateOverlay();
  }

  scene3dSetViewTarget(t: 'illustration' | 'scene'): void {
    this.shapeManager.setTarget3D(t);
    this.editorState.scene3dViewTarget = t;
    if (t === 'scene' && this.has3DScene && !this.editorState.scene3dPanelVisible) {
      this.onScene3dSelected(true);
    }
  }

  scene3dSetViewCameraMode(m: 'ortho2D' | 'perspective2D' | 'free3D'): void {
    this.shapeManager.setCameraMode3D(m);
    this.editorState.scene3dViewCameraMode = m;
    if (m === 'free3D' && this.has3DScene && !this.editorState.scene3dPanelVisible) {
      this.onScene3dSelected(true);
    }
  }

  scene3dSetArtboardFrame(on: boolean): void {
    this.scene3dViewArtboardFrame = on;
    this.shapeManager.setArtboardFrameVisible3D(on);
  }

  scene3dSetFly(on: boolean): void {
    this.scene3dViewFly = on;
    this.shapeManager.setFlyEnabled3D(on);
  }

  scene3dTogglePlay(): void {
    const sm = this.shapeManager;
    // H1: enter / exit OUTSIDE the zone — the game loop and the mouse-look / keyboard listeners Play installs must not
    // run app change detection per frame / per key. The UI follows through onPlayStateChanged3D (enters the zone).
    if (sm.isPlaying3D) {
      this.ngZone.runOutsideAngular(() => sm.exitPlayMode3D());
    } else {
      // Touch (mobile-parity TOUCH-4): no pointer-lock mouse-look (it doesn't work on Android); the Play touch
      // overlay's right-half drag feeds lookYaw / lookPitch instead.
      const opts = { config: { cameraMode: this.scene3dPlayCameraMode }, ...(this.touchUi.coarse ? { mouseLook: false } : {}) };
      this.ngZone.runOutsideAngular(() => sm.enterPlayMode3D(opts));
    }
  }

  // ── Edit menu routing + the touch Apply / Cancel pill (mobile-parity TOUCH-10, replaced the floating action bar) ──

  /** Edit › Undo / Redo: routed per context like Ctrl+Z (was raster-only). */
  editUndo(): void { routeUndo(this, false); }
  editRedo(): void { routeUndo(this, true); }
  /** Edit › Duplicate: routed like Ctrl+D (editor-keymap routeDuplicate); disabled when nothing is selected. */
  editDuplicate(): void { routeDuplicate(this); }
  get canEditDuplicate(): boolean { return canRouteDuplicate(this); }
  /** Edit › Delete: 2D shapes / pixel selection like the Delete key, 3D items through the outliner's delete path. */
  editDelete(): void { routeDelete(this); }

  /** The touch pill for the current modal state (null = none). Shown only under (pointer: coarse), outside Play. */
  get contextPill(): ContextPillSpec | null { return activeContextPill(this); }
  runContextPill(spec: ContextPillSpec, which: 'apply' | 'cancel'): void {
    // Re-check: the mode may have ended between render and tap (a late tap must not act on a newer mode)
    if (activeContextPill(this) !== spec) return;
    spec[which]?.run(this);
  }
  /** A pill tool button (Multi / Snap / Frame / Grab / Rotate / Scale / X / Y / Z — the 3D modifier keys, TOUCH-10). */
  runContextPillButton(spec: ContextPillSpec, btn: ContextPillButton): void {
    if (activeContextPill(this) !== spec || !spec.buttons?.includes(btn)) return;
    btn.run(this);
  }
  /** The pill's number field: the typed amount of the 3D keyboard transform (the digits the keys would send). */
  runContextPillNumeric(spec: ContextPillSpec, text: string): void {
    if (activeContextPill(this) !== spec || !spec.numeric) return;
    TOOL3D_ACTIONS.setValue(this, text);
  }

  /** Brush list auto-close on touch: <app-brush-options> picked a brush; tapping the tool again reopens the panel. */
  readonly toolSubpanel = new ToolSubpanelCollapse(() => this.touchUi.coarse);
  onToolBrushPicked(): void { this.toolSubpanel.onBrushPicked(); }

  /** Edit › Delete in the 3D view: every selected item, each through the outliner ✕'s routing (decal / package / CD
   *  kit / group or array group / mesh incl. a character body). The city container is skipped (World › Clear). */
  scene3dDeleteSelected(): void {
    const es = this.editorState;
    const ids = new Set<string>(es.scene3dSelectedMeshIds);
    if (es.scene3dSelectedMeshId) ids.add(es.scene3dSelectedMeshId);
    if (this.scene3dCityContainerId) ids.delete(this.scene3dCityContainerId);
    if (ids.size === 0) return;
    const sm = this.shapeManager;
    for (const id of ids) {
      if (this.outliner.scene3dDecalIds.has(id)) this.decal.scene3dOutlinerDeleteDecal(id);
      else if (this.outliner.scene3dPackageIds.has(id)) this.scene3dDeletePackage(id);
      else if (this.outliner.scene3dCDKitIds.has(id)) this.scene3dOutlinerDeleteCDKit(id);
      else if (sm.isArrayGroup3D(id) || sm.scene3d?.getMeshGroup(id)) this.scene3dDeleteGroup(id);
      else this.scene3dDeleteMesh(id);
    }
    es.scene3dSelectedMeshIds.clear();
    this.clearMeshSelection();
    this.scene3dRefreshMeshes();
    this.scene3dMarkDirty();
  }

  // ── CD Jewel-Case Designer ─────────────────────────────────

  cdAddKit(): void {
    const sm = this.shapeManager;
    const result = sm.createCDKit3D(0, 0, 0, { clearTray: this.cdTrayClear });
    if (!result?.rootId) return;
    this.cdKitRootId = result.rootId;
    sm.enterCDDesigner3D(result.rootId);
    this.sidePanel.show();   // the designer panel (and its Exit) lives in the side panel column
    this.cdDesignerActive = true;   // <app-cd-designer-panel> resets its view state for the new kit
  }

  cdExitDesigner(): void {
    this.shapeManager.exitCDDesigner3D();
    this.cdDesignerActive = false;
    this.cdKitRootId = null;
  }

  // ── UI System ── contents live in <app-ui-system-panel> (refactor-plan Phase 2.3)

  private _handleUIEvent(e: any): void {
    if (e.type === 'stateChange') {
      this.uiPanel?.onStateChange(e.toState);
    }
  }

  scene3dRefreshRuntimeState(): void {
    const sm = this.shapeManager;
    const s3d = sm.scene3d;
    if (!s3d) return;

    this.scene3dOrbitEnabled = !!s3d.getOrbitController()?.enabled;
    const cam = s3d.getCamera();
    if (cam) {
      this.editorState.scene3dCameraMode = (cam.mode as any) ?? 'perspective';
      this.editorState.scene3dFOV = Math.round(((cam.fov ?? (Math.PI / 3)) * 180) / Math.PI);
    }

    this.s3.scene3dShadowsEnabled = !!(s3d.shadowsEnabled ?? sm.shadowsEnabled3D ?? false);
    this.s3.scene3dFrustumCulling = (s3d.frustumCulling ?? sm.frustumCulling3D ?? true) !== false;
    const ao = s3d.ssao3D;
    if (ao) {
      this.s3.scene3dSSAOEnabled         = ao.enabled         ?? false;
      this.s3.scene3dSSAORadius          = ao.radius          ?? this.s3.scene3dSSAORadius;
      this.s3.scene3dSSAOIntensity       = ao.intensity       ?? this.s3.scene3dSSAOIntensity;
      this.s3.scene3dSSAOPower           = ao.power           ?? this.s3.scene3dSSAOPower;
      this.s3.scene3dSSAOBias            = ao.bias            ?? this.s3.scene3dSSAOBias;
      this.s3.scene3dSSAOResolutionScale = ao.resolutionScale ?? this.s3.scene3dSSAOResolutionScale;
      this.s3.scene3dSSAOSamples         = ao.samples         ?? this.s3.scene3dSSAOSamples;
    }
  }

  scene3dRefreshMeshes(): void {
    if (this.scene3dWorldPanelOpen) return;
    const s3d = this.shapeManager.scene3d;
    if (!s3d) return;
    this.editorState.scene3dMeshes = s3d.getAllMeshes() ?? [];
    // If selected mesh was removed, clear selection
    if (this.editorState.scene3dSelectedMeshId && !this.editorState.scene3dMeshes.some((m: any) => (m.id ?? m.nodeId) === this.editorState.scene3dSelectedMeshId)) {
      this.clearMeshSelection();
    }
    this.outliner._reindexNodeKinds();
    this.outliner._refreshScriptIds();
    this.outliner.scene3dRefreshHierarchy();
    this.scene3dRefreshKeyframeTracks();
  }

  _suppressLayerTreeRebuild = false;

  scene3dSelectedIsDecal   = false;

  // GARP Skins panel (contents live in <app-skins-panel>; the parent owns visibility + the saved can designs)
  garpPanelOpen = false;
  /** Vending can designs per skin — Salsa stores only the packed sheet, so the source PNGs live here (and in the doc). */
  garpCanDesigns: Record<string, string[]> = {};

  /** Dynamic list from sm.creatorTypes3D() — used in Add Mesh menu */
  scene3dCreatorTypesList: { typeId: string; label: string }[] = [];

  scene3dSelectMeshMulti(id: string, event: MouseEvent): void {
    if (event.shiftKey) {
      const ids = new Set(this.editorState.scene3dSelectedMeshIds);
      if (ids.has(id)) {
        ids.delete(id);
      } else {
        ids.add(id);
      }
      this.editorState.scene3dSelectedMeshIds = ids;
    } else {
      this.editorState.scene3dSelectedMeshIds = new Set([id]);
      this.scene3dSelectMesh(id);
    }
  }

  scene3dRunBoolean(op: 'union' | 'subtract' | 'intersect'): void {
    const ids = [...this.editorState.scene3dSelectedMeshIds];
    if (ids.length !== 2) return;
    const sm = this.shapeManager;
    sm.beginSceneGraphBatch3D();
    const result = sm.booleanMesh3D(ids[0], ids[1], op, { keepOperands: false });
    sm.endSceneGraphBatch3D();
    this.editorState.scene3dSelectedMeshIds = new Set();
    this.scene3dRefreshMeshes();
    if (result) {
      // booleanMesh3D returns the id string itself — `.id` on it was undefined,
      // so post-boolean selection/merge never actually ran
      const resultId = result;
      this.editorState.scene3dSelectedMeshIds = new Set([resultId]);
      this.scene3dSelectMesh(resultId);
      sm.mergeByDistance3D(resultId, 0.001);
    }
  }

  // ── Building Creator ────────────────────────────────────────────────────────

  // ── Foliage Creator ─────────────────────────────────────────────────────────

  // ── Creator Panel (generic — vending / bike-rack / bollard / …) ─────────────

  scene3dRefreshCreatorTypes(): void {
    this.scene3dCreatorTypesList = this.shapeManager.creatorTypes3D() ?? [];
  }

  get scene3dSelectedIsCreator(): boolean {
    return !!(this.editorState.scene3dSelectedMeshId && this.shapeManager.isCreator3D(this.editorState.scene3dSelectedMeshId));
  }

  // ── Block Creator ─────────────────────────────────────────────────────────

  // -- Sketch style paper amount (scene-wide): 1 = paper + colour wash, 0 = full colour + hatching
  scene3dSketchPaper = 0.75;

  scene3dSketchPaperChanged(): void {
    this.shapeManager.setSketchPaper3D(this.scene3dSketchPaper);
    this.scene3dMarkDirty();
  }

  /** <app-add-mesh-menu> picked an entry that belongs to another area of the editor. */
  onAddMeshAction(a: AddMeshAction): void {
    if (typeof a === 'object') { this.creator.scene3dOpenCreator(a.creator); return; }
    switch (a) {
      case 'group': this.scene3dAddGroup(); break;
      case 'ribbon': this.ribbon.scene3dAddRibbon(); break;
      case 'cloth': this.scene3dOpenClothBuilder(); break;
      case 'building': void this.procedural.scene3dAddBuilding(); break;
      case 'foliage': void this.procedural.scene3dAddFoliage(); break;
      case 'block': void this.procedural.scene3dCreateBlock(); break;
      case 'package': this.scene3dAddPackage(); break;
      case 'camera': this.anim.scene3dAddCamera(); break;
      case 'cdKit': this.cdAddKit(); break;
    }
  }

  /** <app-array-group-panel> baked the array into plain meshes: drop the array state and re-read the outliner and
   *  the selection (both kept showing the array). */
  onArrayBaked(): void {
    this.scene3dIsArrayGroup = false;
    this.scene3dRefreshMeshes();
    if (this.editorState.scene3dSelectedMeshId) this.scene3dSelectMesh(this.editorState.scene3dSelectedMeshId);
    this.scene3dMarkDirty();
  }

  scene3dSelectMesh(id: string): void {
    this.outliner.scene3dRenamingId = null;
    this.ribbon.hideHandles();
    if (this.meshEdit.scene3dIsEditingMesh && id !== this.editorState.scene3dSelectedMeshId) {
      this.meshEdit.exitMeshEditMode();
    }
    // Same rule for the UV editor / UV paint (viewport picks are off while it's open, so this is the outliner or
    // another explicit select): a different object leaves it fully — orbit, focus background, paint input.
    if ((this.uv.uvEditorOpen || this.uv.scene3dClothingPaintActive) && id !== this.editorState.scene3dSelectedMeshId) {
      this.uv.closeUVEditor();
    }
    this.editorState.scene3dSelectedMeshId = id;
    this._resetMeshSelectionFlags();
    const s3d = this.shapeManager.scene3d;
    if (!s3d) return;
    // City container thin-wrapper — O(1) path, no child iteration or mesh data loading
    if (this.scene3dCityContainerId && id === this.scene3dCityContainerId) {
      // (A former call to WorldManager.syncSelectionFromOutliner — which doesn't exist — threw here: `?.` guarded
      // `world`, not the call.)
      return;
    }
    this.shapeManager.setSelectedNode(id);
    // Detect array group before normal mesh loading — array groups use a separate panel
    if (this.shapeManager.isArrayGroup3D(id)) {
      this.scene3dIsArrayGroup = true;
      this.editorState.scene3dSelectedIsGroup = true;
      this.arrayPanel?.sync(id);   // a newly shown panel syncs itself on its first ngOnChanges
      return;
    }
    this.editorState.scene3dSelectedIsGroup = !!s3d.getMeshGroup(id);
    // Phase 5: count how many array groups reference this mesh as their source
    const linkedGroups = this.shapeManager.getArrayGroupsForSource3D(id) ?? [];
    this.scene3dLinkedArrayCount = linkedGroups.length;
    const mesh = s3d.getMesh(id);
    if (mesh) {
      this._loadMeshInspector(id, mesh);
    } else if (this.editorState.scene3dSelectedIsGroup) {
      this.frameLinkSection?.load(id);
    }
    this.procedural._syncProceduralPanels(id);
    this._syncDecalAndPackageSelection(id);
    this.character._syncCharacterSelection(id);
    this.scene3dRefreshKeyframeTracks();
  }

  /** The one way to drop the 3D mesh selection (audit Phase 5.1): the id, the per-mesh flags and the engine's own
   *  selection. Deleting the selected item used to clear only the id (in five places), leaving the flags stale and the
   *  engine pointing at a deleted node. */
  clearMeshSelection(): void {
    this.editorState.scene3dSelectedMeshId = null;
    this._resetMeshSelectionFlags();
    this.shapeManager?.setSelectedNode(null);
    // setSelectedNode(null) finds no node and leaves the engine's selected-node set alone: a deleted mesh stayed in
    // it, so the next Delete key "deleted" it again (a 2D undo step that could re-attach it). Drop it for real.
    if (this.shapeManager?.interactionService?.selectedNodes?.size) this.shapeManager.clearSelectedNodes();
  }

  /** Reset per-mesh state so switching between mesh types clears the flags. */
  private _resetMeshSelectionFlags(): void {
    this.editorState.scene3dSelectedMeshType = '';
    this.editorState.scene3dSelectedIsGroup = false;
    this.procedural.scene3dSelectedIsBuilding = false;
    this.scene3dSelectedIsPackage = false;
    this.pkgSelectedId = null;
    this.scene3dIsArrayGroup = false;
    this.scene3dLinkedArrayCount = 0;
    this.scene3dIsCloth = false;
    this.ribbon.resetForSelection();
  }

  /** Selected a mesh: load every inspector section (sections not yet shown load themselves on their first ngOnChanges). */
  private _loadMeshInspector(id: string, mesh: { meshPrimitive?: string }): void {
    this.editorState.scene3dSelectedMeshType = (mesh.meshPrimitive ?? '').toLowerCase();
    this.transformSection?.load(id);   // a newly shown section loads itself on its first ngOnChanges
    this.materialSection?.load(id);   // a newly shown section loads itself on its first ngOnChanges
    this.textureSection?.load(id);
    this.outlineSection?.load(id);   // a newly shown section loads itself on its first ngOnChanges
    this.behaviorSection?.load(id);
    this.scene3dSketchPaper = this.shapeManager.getSketchPaper3D() ?? 0.75;
    this.blendSection?.load(id);   // a newly shown section loads itself on its first ngOnChanges
    this.frameLinkSection?.load(id);   // a newly shown section loads itself on its first ngOnChanges
    this.ribbon.syncFromMesh(id);
    // Load HTML texture state (including bg so quality-change re-apply preserves color)
    this.htmlTextureSection?.load(id);

    // Cloth detection — use API-based set populated in scene3dRefreshMeshes
    const isClothMesh = this.outliner.scene3dClothIds.has(id);
    this.scene3dIsCloth = isClothMesh;
    if (isClothMesh) {
      this.clothInspector?.load(id);   // a newly shown inspector loads itself on its first ngOnChanges
    }
  }

  /** Decal / package flags and the ids their panels edit. */
  private _syncDecalAndPackageSelection(id: string): void {
    this.scene3dSelectedIsDecal = this.outliner.scene3dDecalIds.has(id) || !!this.shapeManager.isDecal3D(id);
    this.decal.scene3dSelectedDecalId = this.scene3dSelectedIsDecal ? id : null;
    // NOTE: no engine getter for decal size/rotation exists (getDecalParams3D was a
    // phantom API — the sliders never synced back). TODO: ask Salsa for a getter.
    const _pkgNodeId = this.shapeManager.packaging?.isPackageNode(id);
    this.scene3dSelectedIsPackage = !!_pkgNodeId;
    if (_pkgNodeId) this.pkgSelectedId = _pkgNodeId;
  }

  scene3dOpenClothBuilder(meshId?: string): void {
    this.clothBuilderInit = clothBuilderInitFor(this.shapeManager, meshId);
    this.clothBuilderVisible = true;
  }

  onClothPreviewReady(meshId: string): void {
    const sm = this.shapeManager;
    // (Former focusOnMesh3D/lookAtMesh3D/zoomToNode3D chain was entirely fictional —
    // frameMesh3D is the real engine API.)
    sm.frameMesh3D(meshId);
  }

  onClothBuilderCreated(result: ClothBuilderResult): void {
    if (!this.shapeManager.scene3d) return;
    applyClothBuilderResult(this.shapeManager, result);
    this.clothBuilderVisible = false;
    this.scene3dRefreshMeshes();
    this.clothInspector?.load();   // a rebuilt mesh keeps its id, so the inspector's ngOnChanges won't fire
    this.scene3dMarkDirty();
  }

  onClothBuilderCancelled(): void {
    this.clothBuilderVisible = false;
    this.scene3dRefreshMeshes();
  }

  // ── 3D canvas pointer routing (knife, UV stamp, ribbon handles -> RibbonService, picking) ──
  scene3dCanvasPointerDown(event: PointerEvent): void {
    if (!this.editorState.scene3dPanelVisible) return;
    // mobile-parity 7.3b P5: a second finger is always a camera gesture (pinch / two-finger orbit) — never a pick. It
    // also takes back what the first finger started here: a pending tap-select and a half-drawn knife cut (TOUCH-5).
    if (event.pointerType === 'touch' && event.isPrimary === false) {
      this._touchTap = null;
      this.meshEdit.knifeAbortForGesture();
      return;
    }
    // Plain LEFT click only (2026-09-29). Middle = pan, right = look / pan, Alt+left = orbit — none of them may pick,
    // select, or clear the selection (they did: every orbit / pan start selected the mesh under the cursor, or
    // deselected on empty space). Also covers the knife start, UV stamp and ribbon-handle grab below.
    if (event.button !== 0 || event.altKey) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const sm = this.shapeManager;

    // 0. Mesh edit mode — Salsa's MeshEditPointerController owns face/vertex/edge picking (knife start captured here)
    if (this.meshEdit.knifePointerDown(event, canvas)) return;

    // 0b. UV Paint stamp mode — bake a decal into the mesh texture at the clicked surface point.
    if (this.uv.uvEditorOpen && this.uv.uvStampActive && this.editorState.scene3dSelectedMeshId) {
      const source = this.decal._buildDecalSource();
      if (source) {
        void sm.stampDecalAtScreen3D(
          this.editorState.scene3dSelectedMeshId, source,
          event.clientX, event.clientY, canvas.getBoundingClientRect(),
          { size: this.uv.uvStampSize, rotation: this.uv.uvStampRotationRad }
        );
      }
      return;
    }

    // 0c. mobile-parity 7.3b P5: UV paint / the UV editor owns left presses on the 3D view — Salsa's surface input
    // paints the mesh (and, for a finger, lets the press through so the orbit controller can pinch). No full-scene
    // pick here: it cost a raycast of every mesh per press and selected / deselected under the brush.
    if (this.uv.uvEditorOpen || sm.isUVPaintActive3D?.()) return;

    // 1. Try ribbon handle hit first (only when a ribbon with visible handles is selected)
    if (this.ribbon.tryBeginHandleDrag(event, canvas)) return;

    // 2. Fall through to viewport picking — click anywhere on canvas to select a mesh. A FINGER picks on a TAP (released
    // within TOUCH_TAP_SLOP_PX, no second finger — TOUCH-6), so the first finger of a pinch / two-finger orbit never
    // selects or deselects; and never on a press a 3D tool claimed (an armature joint, a bone placement — TOUCH-9).
    if (event.pointerType === 'touch') {
      const claimed = (sm as unknown as { isPointerEventClaimed3D?(e: object): boolean }).isPointerEventClaimed3D;
      if (typeof claimed === 'function' && claimed.call(sm, event)) return;
      this._touchTap = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    this._scene3dPickAt(event.clientX, event.clientY, canvas);
  }

  /** A finger press waiting for its release to select (TOUCH-6): dropped by a 2nd finger, movement or pointercancel. */
  private _touchTap: { id: number; x: number; y: number } | null = null;
  private static readonly TOUCH_TAP_SLOP_PX = 8;

  /** Viewport pick at a client point: select the mesh there, or clear the selection (and the character panel). */
  private _scene3dPickAt(clientX: number, clientY: number, canvas: HTMLCanvasElement): void {
    const sm = this.shapeManager;
    const picked = sm.pickFromClient3D(clientX, clientY, canvas.getBoundingClientRect());
    const pickedId = picked?.meshId ?? null;
    if (pickedId) {
      this.scene3dSelectMesh(pickedId);
    } else {
      // Clicked empty space — clear mesh selection and close char panel if open
      if (this.editorState.scene3dSelectedMeshId) this.clearMeshSelection();
      if (this.character.scene3dEditCharPanelOpen) {
        const prevId = this.character.scene3dEditCharBodyId;
        this.character.scene3dEditCharPanelOpen = false;
        this.character.scene3dSelectedIsCharacter = false;
        this.character.scene3dEditCharBodyId = null;
        if (prevId) sm.setHairSimulation3D(prevId, false);   // <app-character-panel> resets to its menu (id -> null)
      }
    }
  }

  /** Salsa step 2 (engine-roadmap): the 3D canvas pointermove is registered OUTSIDE Angular's zone (it was a template
   *  binding, so every mouse move ran a full change detection of this component). The handler's own template state
   *  is the ribbon-handle list (scene3dRibbonControlPoints); the landmark hover and the knife preview draw engine-side
   *  / on the handle canvas. The zone is re-entered (one change detection) only when:
   *   - the handler replaced scene3dRibbonControlPoints (a ribbon handle drag), or
   *   - a button is held outside Play (a drag: pan / orbit / gizmo / marquee / paint): engine callbacks that update
   *     bound panels during a drag (viewport-changed -> the artboard overlay, gizmo drags) don't enter the zone
   *     themselves and relied on this per-move change detection, so drags keep it.
   *  Plain hover moves and Play (mouse look) run no change detection.
   *  mobile-parity BRUSH-2: the re-entry is coalesced to ONE change detection per animation frame (a pen / fast mouse
   *  fires several moves a frame), and a RASTER STROKE (brush / airbrush / eraser / drawing pen) skips it entirely:
   *  the stroke draws engine-side and binds nothing per move; the canvas (pointerup) binding runs one change
   *  detection when the stroke ends. */
  private _canvasPointerMoveOutsideZone = (event: PointerEvent): void => {
    const tap = this._touchTap;
    if (tap && event.pointerId === tap.id
        && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > IllustrationComponent.TOUCH_TAP_SLOP_PX) this._touchTap = null;
    const pts = this.ribbon.scene3dRibbonControlPoints;
    this.scene3dCanvasPointerMove(event);
    if (this.ribbon.scene3dRibbonControlPoints !== pts) { this._scheduleZoneTick(); return; }
    if (event.buttons !== 0 && !this.scene3dViewIsPlaying && !this._isRasterStrokeTool() && !this._dragSkipsZoneTick(event)) this._scheduleZoneTick();
  };
  /** mobile-parity 7.3b P6: drags that bind nothing per move skip the per-frame change detection too — UV paint (the
   *  stroke draws engine-side) and a touch camera gesture (pinch / two-finger orbit). The pointerup binding still
   *  runs one change detection when the drag ends. */
  private _dragSkipsZoneTick(event: PointerEvent): boolean {
    const sm = this.shapeManager;
    if (!sm) return false;
    if (sm.isUVPaintActive3D?.()) return true;
    // TOUCH-9/10 perf: Edit Mesh and the armature bind nothing per move — vertex / joint / gizmo / IK drags draw
    // engine-side, the knife preview draws on the handle canvas, and the panels refresh through their own zone entries
    // (the mesh-edit selection callback, the armature panel's frame-coalesced scene-graph listener).
    if (this.meshEdit.scene3dIsEditingMesh || this.scene3dArmaturePanelOpen) return true;
    if (event.pointerType !== 'touch') return false;
    const orbit = sm.getOrbitController?.();
    return !!orbit && (orbit.isTouchGesturing || orbit.activeTouchCount >= 2);
  }
  private _canvasPointerMoveEl: HTMLCanvasElement | null = null;
  private _zoneTickRaf = 0;
  /** One change detection on the next animation frame (coalesces the per-move re-entries). Called outside the zone,
   *  so the rAF callback is outside too and enters the zone exactly once. */
  private _scheduleZoneTick(): void {
    // A pending engine-event flush (H5) or artboard-overlay update already runs this frame's change detection
    if (this._zoneTickRaf || this._engineEvents.pending || this.artboard.overlayUpdatePending) return;
    this._zoneTickRaf = requestAnimationFrame(() => {
      this._zoneTickRaf = 0;
      this.ngZone.run(() => { /* change detection for the state the moves changed */ });
    });
  }
  /** The active tool paints raster strokes (BRUSH-2: no change detection per pointer move while one is held). */
  private _isRasterStrokeTool(): boolean {
    const t = this.controlPanelActiveTool;
    return t === 'raster:brush' || t === 'raster:airbrush' || t === 'raster:eraser' || (typeof t === 'string' && t.startsWith('drawing:'));
  }

  scene3dCanvasPointerMove(event: PointerEvent): void {
    if (this.scene3dViewIsPlaying) return;   // Play: no editor hover picking (landmark cards, ribbon handles) — saves a raycast per mouse move
    if (this.scene3dWorldPanelOpen) {
      const canvas = this.canvasRef?.nativeElement;
      if (canvas) {
        this.shapeManager.world?.hoverLandmarkAtScreen(
          event.clientX, event.clientY, canvas.getBoundingClientRect()
        );
      }
    }
    if (this.meshEdit.knifePointerMove(event)) return;
    this.ribbon.moveHandleDrag(event);
  }

  scene3dCanvasPointerLeave(): void {
    if (this.scene3dWorldPanelOpen) {
      this.shapeManager.world?.clearLandmarkHover();
    }
  }

  scene3dCanvasPointerUp(event: PointerEvent): void {
    if (this.meshEdit.knifePointerUp(event)) return;
    this.ribbon.endHandleDrag();
    const tap = this._touchTap;
    if (tap && event.pointerId === tap.id) {
      this._touchTap = null;
      const canvas = this.canvasRef?.nativeElement;
      if (canvas && this.editorState.scene3dPanelVisible
          && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= IllustrationComponent.TOUCH_TAP_SLOP_PX) {
        this._scene3dPickAt(event.clientX, event.clientY, canvas);
      }
    }
  }

  /** The browser took the pointer (a system gesture, a palm reject): nothing it started may stay half-done. */
  scene3dCanvasPointerCancel(event: PointerEvent): void {
    if (this._touchTap?.id === event.pointerId) this._touchTap = null;
    this.meshEdit.knifePointerCancel(event);
    this.ribbon.endHandleDrag();
  }

  // ── Phase Bucket helpers ────────────────────────────────────────────────────

  /** <app-scene-outliner> asks for an editor-owned action. */
  onOutlinerAction(a: OutlinerAction): void {
    switch (a.kind) {
      case 'select': this.scene3dSelectMeshMulti(a.id, a.event); break;
      case 'deleteMesh': this.scene3dDeleteMesh(a.id); break;
      case 'deleteGroup': this.scene3dDeleteGroup(a.id); break;
      case 'deletePackage': this.scene3dDeletePackage(a.id); break;
      case 'deleteCDKit': this.scene3dOutlinerDeleteCDKit(a.id); break;
      case 'duplicate': this.scene3dDuplicateMesh(a.id); break;
      case 'editCloth': this.scene3dOpenClothBuilder(a.id); break;
      case 'move': this.scene3dMoveMesh(a.id, a.dir); break;
    }
  }

  scene3dDeleteMesh(id: string): void {
    const sm = this.shapeManager;
    // Deleting the mesh the UV editor / UV paint is on: leave it first (its engine session would otherwise outlive the
    // mesh and keep the orbit + focus background up).
    if ((this.uv.uvEditorOpen || this.uv.scene3dClothingPaintActive)
        && (id === this.editorState.scene3dSelectedMeshId || id === this.uv.uvPaintTargetId || id === this.character.scene3dEditCharBodyId)) {
      this.uv.closeUVEditor();
    }
    if (this.outliner.scene3dCharacterBodyIds.has(id)) {
      // deleteProceduralBody3D removes body + all parts + skeleton + clears rig maps atomically
      sm.deleteProceduralBody3D(id);
      if (this.character.scene3dEditCharBodyId === id) {
        this.character.scene3dEditCharBodyId = null;
        this.character.scene3dEditCharPanelOpen = false;
      }
    } else {
      this._instanceGroupRemove(id);
      // The full engine teardown (also frees the mesh's UV-paint texture; packages / CD kits are routed before here)
      sm.deleteMesh3D(id);
    }
    this.scene3dRefreshMeshes();
    if (this.editorState.scene3dSelectedMeshId === id) {
      this.editorState.scene3dSelectedMeshId = this.editorState.scene3dMeshes[0]?.id ?? this.editorState.scene3dMeshes[0]?.nodeId ?? null;
    }
    this.scene3dMarkDirty();
  }

  scene3dDuplicateMesh(id: string): void {
    const sm = this.shapeManager;
    const copy = sm.duplicateMesh3D(id);
    if (copy) {
      const copyId = copy.id;
      const existingGroupId = this._meshGroupId.get(id);
      if (existingGroupId) {
        this._instanceGroupRegister(existingGroupId, [copyId]);
      } else {
        this._instanceGroupRegister(crypto.randomUUID(), [id, copyId]);
      }
      this.scene3dRefreshMeshes();
      this.scene3dSelectMesh(copyId);
      this.scene3dMarkDirty();
    }
  }

  scene3dMoveMesh(id: string, direction: 'up' | 'down'): void {
    const sm = this.shapeManager;
    // TODO: moveLayerUp3D/moveLayerDown3D never existed in the engine — these
    // outliner arrows have always been no-ops. Needs a Salsa reorder API.
    console.warn('Mesh reorder not supported by engine yet', id, direction);
    setTimeout(() => this.outliner.scene3dRefreshHierarchy(), 50);
    this.scene3dMarkDirty();
  }

  _scene3dReconstructGroups(sm: ShapeManager, groups: Array<{ name: string; children: string[] }>): void {
    for (const g of groups) {
      if (!g.children?.length) continue;
      const group = sm.scene3d?.createMeshGroup(g.name ?? 'Group');
      const groupId: string | undefined = group?.id;
      if (!groupId) continue;
      for (const childId of g.children) {
        sm.scene3d?.addMeshToGroup(childId, groupId);
      }
    }
  }

  scene3dDeleteGroup(groupId: string): void {
    // A virtual "Character" group's id is the body mesh, not a real group —
    // route it to the atomic character delete (body + parts + skeleton).
    if (this.outliner.scene3dCharacterBodyIds.has(groupId)) { this.scene3dDeleteMesh(groupId); return; }
    this.shapeManager.deleteMeshGroup3D(groupId);
    this.scene3dRefreshMeshes();
  }

  scene3dAddGroup(): void {
    this.shapeManager.scene3d?.createMeshGroup('Group');
    this.scene3dRefreshMeshes();
  }

// ── Canvas Grid ────────────────────────────────────────────

  scene3dSetGizmoMode(mode: 'move' | 'rotate' | 'scale'): void {
    this.arrayTool.scene3dDeactivateArrayTool();
    const next = this.scene3dGizmoMode === mode ? null : mode;
    this.scene3dGizmoMode = next;
    const sm = this.shapeManager;
    sm.scene3d?.setGizmoMode(next);
    sm.setGizmoMode3D(next);
  }

  scene3dToggleGizmoOrientation(): void {
    this.scene3dGizmoOrientation = this.scene3dGizmoOrientation === 'world' ? 'local' : 'world';
    this.shapeManager.setGizmoOrientation3D(this.scene3dGizmoOrientation);
  }

  // ── World / City Tool ──────────────────────────────────────────────────────
  openWorldPanel(): void {
    this._exitAllScene3dModes();
    this.scene3dWorldPanelOpen = true;
    this.worldPanel?.onOpen();   // enter city mode (resume or fresh), regions, grade keys, look, perf readout
    this._updateGizmoPosition();
  }

  /** <app-world-panel> regenerated meshes: rebuild the mesh list past the world-panel early-return. */
  onWorldRefreshMeshes(): void {
    this.scene3dWorldPanelOpen = false;
    this.scene3dRefreshMeshes();
    this.scene3dWorldPanelOpen = true;
  }

  /** <app-world-panel> cleared the city. */
  onWorldCleared(): void {
    this.scene3dWorldPanelOpen = false;
    this.scene3dRefreshMeshes();
  }

  closeWorldPanel(): void {
    this.scene3dWorldPanelOpen = false;
    this.shapeManager.world?.exitCityMode();
    this._updateGizmoPosition();
  }

  // ── Package Creator ──────────────────────────────────────────────────────────

  scene3dDeletePackage(id: string): void {
    const sm = this.shapeManager;
    if (this.pkg.pkgCreatorId === id && this.pkg.scene3dPkgCreatorOpen) this.pkg.closePkgCreator();
    sm.scene3d?.deleteMesh(id);
    this.outliner.scene3dPackageIds.delete(id);
    if (this.editorState.scene3dSelectedMeshId === id) this.clearMeshSelection();
    this.scene3dRefreshMeshes();
    this.scene3dMarkDirty();
  }

  scene3dOutlinerDeleteCDKit(id: string): void {
    const sm = this.shapeManager;
    if (this.cdKitRootId === id) {
      sm.exitCDDesigner3D();
      this.cdDesignerActive = false;
      this.cdKitRootId = null;
    }
    sm.deleteCDKit3D(id);
    this.outliner.scene3dCDKitIds.delete(id);
    if (this.editorState.scene3dSelectedMeshId === id) this.clearMeshSelection();
    this.scene3dRefreshMeshes();
    this.scene3dMarkDirty();
  }

  scene3dAddPackage(): void {
    const sm = this.shapeManager;
    if (!sm.packaging) return;
    const params: any = { width: this.pkg.pkgWidth, height: this.pkg.pkgHeight, depth: this.pkg.pkgDepth, bleed: this.pkg.pkgBleed };
    this.pkg._applyStyleParams(params);
    const st = sm.packaging.addPackage(params, this.pkg.pkgStyle as any);
    if (st?.id) {
      this.scene3dRefreshMeshes();
      this.scene3dSelectMesh(st.id);
    }
  }

// ── Package layer stack (§0e) ────────────────────────────────────────────

/** 3D free camera: frame everything visible (Salsa polish round 3 T7 — sm.frameScene3D; in City mode it frames the city). */
  scene3dFrameScene(): void { this.shapeManager.frameScene3D(); }

  scene3dEditArraySource(): void {
    if (!this.editorState.scene3dSelectedMeshId) return;
    const sm = this.shapeManager;
    const sourceId = sm.getArraySourceId(this.editorState.scene3dSelectedMeshId);
    if (!sourceId) return;
    this.meshEdit.editMesh(sourceId);
  }

  scene3dSetFOV(v: number): void {
    this.editorState.scene3dFOV = +v;
    this.shapeManager.scene3d?.setFOV(+v);
    this.scene3dMarkDirty();
  }

  scene3dUndo(): void {
    const sm = this.shapeManager;
    if (sm.canUndo3D) {
      sm.undo3D();
      this.scene3dRefreshMeshes();
      this.uiPanel?.uiRefreshLayers();
    }
  }

  scene3dRedo(): void {
    const sm = this.shapeManager;
    if (sm.canRedo3D) {
      sm.redo3D();
      this.scene3dRefreshMeshes();
      this.uiPanel?.uiRefreshLayers();
    }
  }

  scene3dRefreshKeyframeTracks(): void {
    const entry = this.anim.buildKeyframeTracks(this.editorState.scene3dSelectedMeshId, this.editorState.scene3dMeshes);
    // Keep single-selected-mesh state in sync for anything that still reads it.
    if (this.editorState.scene3dSelectedMeshId) {
      if (!this.editorState.scene3dSelectedMeshName && entry) this.editorState.scene3dSelectedMeshName = entry.name;
    } else {
      this.editorState.scene3dSelectedMeshName = '';
    }
    this.blendSection?.refreshKeyframes();
  }

  // ── Arrowheads ──────────────────────────────────────────

  // ── Raster Text tool ─────────────────────────────────────

  private rgbaToHex(rgba: { r: number; g: number; b: number; a: number }): string {
    const toHex = (v: number) => {
      const scaled = Math.round(v * 255);
      const hex = scaled.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;
  }

  private onMouseMove!: (e: MouseEvent) => void;
  private onClick!: (e: MouseEvent) => void;
  private onDblClick!: (e: MouseEvent) => void;
  private onKeyDown!: (e: KeyboardEvent) => void;
  private onDocMousedown!: (e: MouseEvent) => void;
  private onPaste!: (e: ClipboardEvent) => void;

  isViewerMode = false;

  // ── Grease Pencil ──────────────────────────────────────────────
  gpPanelVisible = false;

  openGpPanel(): void  { this._exitAllScene3dModes(); this.gpPanelVisible = true; }

  closeGpPanel(): void {
    this.gpPanelVisible = false;
    // Panel's ngOnDestroy handles draw mode / face-select cleanup; belt-and-suspenders here.
    const sm = this.shapeManager;
    sm.exitGpDrawMode3D();
    sm.exitGpFaceSelectMode3D();
    sm.clearGpDrawPlane3D();
  }

  // ── Export Modal ──────────────────────────────────────────────

  constructor(
    public editorState: EditorStateService,
    public doc: DocumentActionsService,
    public stats: SceneStatsService,
    public character: CharacterEditService,
    public procedural: ProceduralPanelsService,
    public draw: DrawingOptionsService,
    public imports: MediaImportService,
    public artboard: ArtboardService,
    public canvasLook: CanvasAppearanceService,
    public engineStatus: EngineStatusService,
    public meshEdit: MeshEditService,
    public hud: ViewportHudService,
    public ribbon: RibbonService,
    public uv: UvEditorService,
    public outliner: SceneOutlinerService,
    public arrayTool: ArrayToolService,
    public decal: DecalService,
    public creator: CreatorService,
    public storage: StorageSettingsService,
    public add: SceneAddService,
    public files: ProjectFileService,
    public persist: IllustrationPersistenceService,
    public fw: FillWandService,
    public rt: RasterTextService,
    public pl: PanelLayoutService,
    public fx: LayerEffectsService,
    public anim: SceneAnimationService,
    public s3: Scene3dSettingsService,
    public pkg: PackageCreatorService,
    private route: ActivatedRoute,
    private illustrationService: IllustrationService,
    private notifyService: NotifyService,
    public rasterBrushService: RasterBrushService,
    public rasterSelectionService: RasterSelectionService,
    public animationService: RasterAnimationService,
    public autoSaveService: RasterAutoSaveService,
    private ngZone: NgZone,
    private localIllustrationService: LocalIllustrationService,
    /** Touch-first device, primary pointer coarse: the touch-only UI, mobile-parity TOUCH-4 / TOUCH-10 / UI-1. */
    public touchUi: TouchUiService,
    /** View › Side Panel visibility: the right panel column, remembered per machine. */
    public sidePanel: SidePanelService,
  ) { perfMark('editor:ctor'); }

  ngOnInit() {
    this._unregisterUpdateGuard = this._appUpdate.registerDocumentGuard({
      hasUnsavedChanges: () => this.persist.hasUnsavedChanges,
      flushPendingSave: () => this.persist.flushPendingSave(),
    });
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('scroll', this._onWinScrollOrResize, { passive: true });
      window.addEventListener('resize', this._onWinScrollOrResize);
      document.addEventListener('keydown', this._onDocKeyDownOutsideZone);
      document.addEventListener('keyup', this._onDocKeyUpOutsideZone);
    });
    this.editorState.bind(this);
    this.doc.bind(this);
    this.stats.bind(this);
    this.character.bind(this);
    this.procedural.bind(this);
    this.draw.bind(this);
    this.imports.bind(this);
    this.artboard.bind(this);
    this.canvasLook.bind(this);
    this.engineStatus.bind(this);
    this.meshEdit.bind(this);
    this.hud.bind(this);
    this.ribbon.bind(this);
    this.uv.bind(this);
    this.outliner.bind(this);
    this.arrayTool.bind(this);
    this.decal.bind(this);
    this.creator.bind(this);
    this.storage.bind(this);
    this.add.bind(this);
    this.files.bind(this);
    this.persist.bind(this);
    this.fw.bind({
      shapeManager: () => this.shapeManager,
    });
    this.rt.bind({
      shapeManager: () => this.shapeManager,
    });
    this.pl.bind({
      shapeManager: () => this.shapeManager,
    });
    this.fx.bind({
      shapeManager: () => this.shapeManager,
      markStateDirty: () => this._markStateDirty(),
      penColor: () => this.draw.selectedPenColor,
      ensureAnimationMode: () => { if (!this.animationEnabled) this.toggleAnimationMode(); },
    });
    this.anim.bind({
      shapeManager: () => this.shapeManager,
      markDirty: () => this.scene3dMarkDirty(),
      selectedMeshId: () => this.editorState.scene3dSelectedMeshId,
      refreshKeyframeTracks: () => this.scene3dRefreshKeyframeTracks(),
    });
    this.s3.bind({
      shapeManager: () => this.shapeManager,
      markDirty: () => this.scene3dMarkDirty(),
      syncCityStyleFromEngine: () => this.worldPanel?.syncCityStyleFromEngine(),
    });
    this.pkg.bind({
      shapeManager: () => this.shapeManager,
      exitAllScene3dModes: () => this._exitAllScene3dModes(),
      updateGizmoPosition: () => this._updateGizmoPosition(),
      onVectorLayerSelected: (id) => this.onVectorLayerSelected(id),
      dielinePaneCanvas: () => this.pkgDiePaneRef?.nativeElement,
      dielineGuideCanvas: () => this.pkgDieGuideRef?.nativeElement,
    });
    if (this.retroThemeActive) document.body.classList.add('theme-retro-chrome');
    // React whenever /illustrate/:id changes
    this.routeSub = this.route.paramMap
      .pipe(
        map(p => p.get('id')),
        filter((id): id is string => !!id),
        distinctUntilChanged()
      )
      .subscribe((illustrationUid) => this._queueDocumentLoad(illustrationUid));
  }

  /** Document loads run one at a time (they used to overlap on a quick switch and write into the same engine), and a
   *  load that a newer switch has already replaced is skipped. Each one first flushes the previous document's pending
   *  save (audit Phase 2.3). */
  private _loadChain: Promise<void> = Promise.resolve();
  private _latestRequestedUid: string | null = null;
  private _queueDocumentLoad(illustrationUid: string): void {
    this._latestRequestedUid = illustrationUid;
    this._loadChain = this._loadChain.catch(() => {}).then(async () => {
      if (this._latestRequestedUid !== illustrationUid) return;   // superseded before it started
      await this.persist.flushPendingSave();                       // the previous document's last changes
      if (this._latestRequestedUid !== illustrationUid) return;
      await this.initForIllustration(illustrationUid);
    });
  }

  /** Route guard (canDeactivate): leaving the editor saves the pending change first instead of dropping it. */
  async flushBeforeLeave(): Promise<boolean> {
    // Bounded: a slow network must not trap the user in the editor (the save keeps running in the background)
    await Promise.race([this.persist.flushPendingSave(), new Promise(r => setTimeout(r, 5000))]);
    return true;
  }

  private async initForIllustration(illustrationUid: string) {
    this.isLoading = true;
    // A doc switch reuses this instance: without this reset the first markLoaded() of the new document ended the
    // loading phase at once (save suppression off, after-load steps run against a half-loaded document).
    this.loadingState = { renderer: false, illustration: false, sceneApplied: false };
    this.persist.illustrationUid = illustrationUid;
    this.persist.isLocalMode  = this.route.snapshot.data?.['local']   === true;
    this.isViewerMode = this.route.snapshot.data?.['viewer']  === true;
    this.persist.syncMode = this.persist.isLocalMode ? 2 : 0;

    // cleanup
    this.persist.autoSaveSubscription?.unsubscribe();
    this.persist._metaFlushSub?.unsubscribe();
    this.persist.thumbnailSaveSubscription?.unsubscribe();
    this.selectionChangedSubscription?.unsubscribe();
    this.rasterStrokeSubscription?.unsubscribe();
    this._rasterStrokeStartSub?.unsubscribe(); this._rasterStrokeCancelSub?.unsubscribe();
    this._rasterStrokeStartSub = this._rasterStrokeCancelSub = null;
    this.resetSceneState();
    this.persist.lastSavedThumbnailJSON = '';
    this.persist.lastThumbnailTime = 0;

    // WebGPU bootstrap — run outside Angular's zone so Salsa's canvas.addEventListener
    // calls don't get Zone.js-wrapped and trigger CD on every pointer event.
    // afterRendererBoot is explicitly re-entered into the zone because the await
    // continuation resumes in the outer (non-Angular) zone context.
    // Between boot and afterRendererBoot: the engine outlives every document, so each one starts from a BLANK engine
    // document (else a new / unsaved document opened on the previous one's content). Before afterRendererBoot
    // subscribes, so the reset's scene-changed event isn't taken as this document's load.
    const startBlank = () => this.ngZone.runOutsideAngular(() =>
      this.persist.startBlankDocument(ShapeManager.getInstance(), this.persist.isLocalMode ? illustrationUid : null));
    if (!isRendererLive) {
      await this.ngZone.runOutsideAngular(() => startWebGPURendering('webgpuCanvas'));
      perfMark('reinit-done');
      await startBlank();
      perfMark('blank-done');
      this.ngZone.run(() => this.afterRendererBoot(false));
    } else {
      await this.ngZone.runOutsideAngular(() => reinitializeWebGPURendering('webgpuCanvas'));
      perfMark('reinit-done');
      await startBlank();
      perfMark('blank-done');
      this.ngZone.run(() => this.afterRendererBoot(true));
    }

    this.canvas = this.canvasRef.nativeElement;
    this.shapeManager.setStrokeWidth(this.draw.strokeWidth);

    this.persist.illustrationUid = this.route.snapshot.paramMap.get('id');

    if (this.persist.illustrationUid) {
      const navState = (window.history.state as any);
      const stateIllustration = navState?.illustration;
      if (navState?.isNew) this._focusTitleOnLoad = true;
      if (navState?.startAnimation) this._startAnimationOnLoad = true;

      if (this.isViewerMode) {
        await this.files._initViewerMode(this.persist.illustrationUid);
      } else if (this.persist.isLocalMode) {
        // Local-only: resolve from IndexedDB, not the API. A document the Shell created a moment ago is handed over
        // in memory (one-shot, see fresh-local-document.ts): no read-back, and nothing saved to look for.
        const fresh = takeFreshLocalDocument(this.persist.illustrationUid);
        const fromState = fresh ?? (stateIllustration?.syncMode === 2 && stateIllustration?.uuid === this.persist.illustrationUid
          ? stateIllustration
          : await this.localIllustrationService.getByUuid(this.persist.illustrationUid));
        if (fromState) {
          await this.persist.initWithIllustration(fromState as any, { nothingSavedYet: !!fresh });
        } else {
          this.notifyService.error('Local illustration not found');
          this.markLoaded('illustration');
          requestAnimationFrame(() => this.markLoaded('sceneApplied'));
        }
      } else if (stateIllustration?.id && stateIllustration?.uuid === this.persist.illustrationUid) {
        // If we navigated here from the dashboard the illustration object is already in
        // router state — use it directly and skip the API round-trip.
        await this.persist.initWithIllustration(stateIllustration);
      } else {
        // Awaited (was a fire-and-forget subscribe) so the load queue really waits for this document
        const res: any = await firstValueFrom(this.illustrationService.getIllustrationByUid(this.persist.illustrationUid)).catch(() => null);
        if (res?.resultType === ResultType.Success) {
          await this.persist.initWithIllustration(res.resultObject);
        }
      }

      // Initialize SDF & stamp defaults
      if (this.shapeManager) {
        this.draw.setSDFTextColor(this.draw.selectedSDFTextColor);
        this.draw.setSDFTextOutlineColor(this.draw.selectedSDFTextOutlineColor);
        this.draw.setSDFTextFontSize(this.draw.selectedSDFTextFontSize);
        this.draw.setSDFTextFont(this.draw.selectedSDFTextFont);
        this.draw.setSDFTextThreshold(this.draw.selectedSDFTextThreshold);
        this.draw.setSDFTextSmoothing(this.draw.selectedSDFTextSmoothing);
        this.draw.setSDFTextOutlineWidth(this.draw.selectedSDFTextOutlineWidth);

        this.draw.setStamp(this.draw.selectedStamp);
        this.draw.setStampColor(this.draw.selectedStampColor);
        this.draw.setStampSize(this.draw.selectedStampSize);
      }
    } else {
      this.markLoaded('illustration');
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
    }

    this._installInputListeners();

    this.canvasLook.getBackgroundColor();
    this.canvasLook.getDotColor();

    this.draw.setShapeColor('#9B59B6');
    this.draw.setHighlightColor('#DAB6FC');
    this.draw.setPenColor('#9B59B6');
  }

  /** Document / window / canvas input listeners: preview-shape follow + brush cursor (outside the zone), tool clicks,
   *  live-text double-click, hotkeys, colour-picker dismiss, image paste. */
  private _installInputListeners(): void {
    // (a doc switch re-runs this on the same instance — drop the previous set first)
    this._removeInputListeners();
    // A document POINTERmove (was mousemove): the brush ring + preview shape follow a pen and a finger too.
    this.onMouseMove = (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      // BRUSH-2: the brush ring moves by a direct style write, outside the zone (it entered the zone, i.e. ran a
      // whole-editor change detection, on every move of every raster tool). The [style.transform] binding only
      // places it when the ring is created.
      if (this.showBrushCursor) {
        this.brushCursorX = event.clientX;
        this.brushCursorY = event.clientY;
        const ring = this.brushCursorRingRef?.nativeElement;
        if (ring) ring.style.transform = this.brushCursorTransform;
      }
      // H6: engine-only (moves the preview shape + schedules a render; no events, no bound state) — no zone entry
      if (this.draw.selectedShapeType) this.shapeManager.updatePreviewShapePosition(event);
    };
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('pointermove', this.onMouseMove);
      // Salsa step 2: the 3D canvas pointermove (was the template's (pointermove) binding), see _canvasPointerMoveOutsideZone.
      const cv = this.canvasRef?.nativeElement ?? null;
      if (cv && this._canvasPointerMoveEl !== cv) {
        this._canvasPointerMoveEl?.removeEventListener('pointermove', this._canvasPointerMoveOutsideZone);
        this._canvasPointerMoveEl?.removeEventListener('pointerup', this._flushEngineEventsOnPointerUp);
        cv.addEventListener('pointermove', this._canvasPointerMoveOutsideZone);
        // After the engine's pointerup listener (it attached at boot): the drag's last coalesced events apply now (H5)
        cv.addEventListener('pointerup', this._flushEngineEventsOnPointerUp);
        this._canvasPointerMoveEl = cv;
      }
    });

    this.onClick = (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      if (this.draw.selectedShapeType) {
        this.shapeManager.confirmPreviewShape();
        this.shapeManager.setPreviewShape(this.draw.selectedShapeType, event);
      }
      // Speech Balloon tool — place balloon at click position
      if (this.controlPanelActiveTool === 'balloon') {
        const worldPos = this.shapeManager.interactionService?.toWorldCoords(event);
        if (worldPos) this.balloonOptions?.placeBalloon(worldPos.x, worldPos.y);
      }
      // Live Text tool — canvas interactions are driven by setRectDrawCallback;
      // document click only handles ending editing when clicking outside the canvas.
      if (this.controlPanelActiveTool === 'live-text' && this.liveTextOptions?.liveTextIsEditing && event.target !== this.canvas) {
        this.liveTextOptions.endLiveTextEditing();
      }
      // Flood Fill tool — fill at click position
      if (this.controlPanelActiveTool === 'fill') {
        void this.onCanvasClickForFill(event);
      }
    };
    document.addEventListener('click', this.onClick);

    // Double-click on canvas: enter edit mode on selected LiveTextNode
    this.onDblClick = (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      const selectedIds = this._getSelectedShapeIds();
      if (selectedIds.length !== 1) return;
      const nodeId = selectedIds[0];
      const sm = this.shapeManager;
      const liveNode = sm.getLiveTextNode(nodeId);
      if (liveNode && !this.liveTextOptions?.liveTextIsEditing) {
        // Switch to the live-text tool through setActiveTool (the previous tool's engine mode must turn off and the
        // rect-draw callback must be installed — a direct controlPanelActiveTool write skipped both).
        if (this.controlPanelActiveTool !== 'live-text') this.setActiveTool('live-text');
        this.liveTextOptions?.beginEditAt(nodeId, event.clientX, event.clientY);
        event.preventDefault();
      }
    };
    this.canvas!.addEventListener('dblclick', this.onDblClick);

    // Outside the zone (zone audit item 2): enter it only for a key handleHotkeys could act on (hotkey-zone-gate)
    this.onKeyDown = this._onKeyDownOutsideZone;
    this.ngZone.runOutsideAngular(() => window.addEventListener('keydown', this.onKeyDown));
    this._setEngineDeleteRoute(true);

    this.onDocMousedown = this.canvasLook.handleBgColorPickerClick.bind(this.canvasLook);
    document.addEventListener('mousedown', this.onDocMousedown);

    this.onPaste = this.imports.handlePasteImage.bind(this.imports);
    document.addEventListener('paste', this.onPaste);
  }

  /** Hide Salsa's 3D nav gizmo with the rest of the chrome: Toggle UI and the read-only viewer. */
  private _syncViewGizmoHidden(): void {
    syncViewGizmoHidden(this.shapeManager as unknown as ViewGizmoEngine, this.uiHidden || this.isViewerMode);
  }

  _updateGizmoPosition(delayMs = 320): void {
    clearTimeout(this._gizmoPosTimer);
    this._gizmoPosTimer = setTimeout(() => {
      const panelOpen = this.scene3dWorldPanelOpen || this.arrayTool.scene3dArrayToolActive || this.character.scene3dEditCharPanelOpen || this.procedural.scene3dEditBuildingPanelOpen || this.procedural.scene3dEditFoliagePanelOpen || this.procedural.scene3dEditBlockPanelOpen || this.pkg.scene3dPkgCreatorOpen || this.creator.scene3dCreatorPanelOpen;
      this.shapeManager?.setViewGizmoPosition3D({
        corner: 'top-left',
        offsetX: panelOpen ? 355 : 100,
        offsetY: 52,
      });
    }, delayMs);
  }

  /** Releases every engine / editor-service subscription afterRendererBoot makes. Runs before each boot (a doc
   *  switch re-boots on the same instance) and on destroy, so handlers never stack or outlive the editor. */
  /** First scene-graph change after a boot = the document is applied (thumbnail + loader). */
  private _sceneAppliedOnceSub: { unsubscribe(): void } | null = null;
  private _teardownEngineSubs(): void {
    this.engineStatus.teardown();
    this._engineEvents.cancel();
    this._pendingSelectionIds = this._pendingShapeSelectionIds = null;
    this._layerSignature = null;
    for (const sub of [this._sceneAppliedOnceSub, this._cityBuildSub, this.selectionChangedSubscription, this.selectionToolSubscription,
                       this._sceneGraphChangedSub, this._rasterLayersSub, this._rasterActiveLayerSub, this._currentFrameSub,
                       this._viewStateSub, this._playStateSub, this._cameraCutsSub, this.rasterStrokeSubscription,
                       this._rasterStrokeStartSub, this._rasterStrokeCancelSub]) {
      sub?.unsubscribe?.();
    }
    this._rasterStrokeStartSub = this._rasterStrokeCancelSub = null;
    this._sceneAppliedOnceSub = this._cityBuildSub = this.selectionChangedSubscription = this.selectionToolSubscription = null;
    this._sceneGraphChangedSub = this._rasterLayersSub = this._rasterActiveLayerSub = this._currentFrameSub = null;
    this._viewStateSub = this._playStateSub = this._cameraCutsSub = this.rasterStrokeSubscription = null;
    this._uiEventOff?.(); this._uiSelectionOff?.(); this._pathEditedOff?.();
    this._uiEventOff = this._uiSelectionOff = this._pathEditedOff = null;
  }

  /** Removes the document / window / canvas input listeners initForIllustration installs (it re-installs them per doc). */
  private _removeInputListeners(): void {
    if (this.onMouseMove) document.removeEventListener('pointermove', this.onMouseMove);
    if (this._zoneTickRaf) { cancelAnimationFrame(this._zoneTickRaf); this._zoneTickRaf = 0; }
    this._canvasPointerMoveEl?.removeEventListener('pointermove', this._canvasPointerMoveOutsideZone);
    this._canvasPointerMoveEl?.removeEventListener('pointerup', this._flushEngineEventsOnPointerUp); this._canvasPointerMoveEl = null;
    if (this.onClick) document.removeEventListener('click', this.onClick);
    if (this.onDblClick) this.canvas?.removeEventListener('dblclick', this.onDblClick);
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this._setEngineDeleteRoute(false);
    if (this.onDocMousedown) document.removeEventListener('mousedown', this.onDocMousedown);
    if (this.onPaste) document.removeEventListener('paste', this.onPaste);
  }

  /** The engine claims Delete / Backspace first when something is selected (its own window listener, registered at
   *  boot); route that through Edit › Delete too, so the key and the menu do exactly the same thing (mobile-parity
   *  7.2: the key unlinked a 3D mesh raw). Off = the engine's default 2D delete, for the next route. */
  private _setEngineDeleteRoute(on: boolean): void {
    this._setEngineDuplicateRoute(on);   // Ctrl+D gets the same treatment (Edit › Duplicate)
    const sm = this.shapeManager;
    if (!sm) return;
    const fn = on ? () => this.ngZone.run(() => this.editDelete()) : null;
    const api = sm as unknown as EngineDeleteKeyApi;
    if (typeof api.setDeleteKeyHandler === 'function') { api.setDeleteKeyHandler(fn); return; }
    // Older Salsa dist: the renderer hook ShapeManager wires to deleteSelectedShapes
    const r = sm.webgpuRenderer;
    if (typeof r?.setDeleteSelectedHandler === 'function') r.setDeleteSelectedHandler(fn ?? (() => sm.deleteSelectedShapes()));
  }

  /** The engine claims Ctrl+D first when 2D / 3D nodes are selected (3D meshes sit in its 2D selection too) and only
   *  knows the 2D duplicate; route it through Edit › Duplicate, so a selected mesh goes through the 3D duplicate (3D
   *  undo, characters, instance group, outliner) and the key and the menu do exactly the same thing (mobile-parity 7.2,
   *  the Delete route's twin). Off = the engine's default 2D duplicate, for the next route. */
  private _setEngineDuplicateRoute(on: boolean): void {
    const sm = this.shapeManager;
    if (!sm) return;
    const fn = on ? () => this.ngZone.run(() => this.editDuplicate()) : null;
    const api = sm as unknown as EngineDuplicateKeyApi;
    if (typeof api.setDuplicateKeyHandler === 'function') { api.setDuplicateKeyHandler(fn); return; }
    // Older Salsa dist: the renderer hook ShapeManager wires to duplicateSelectedShapes. That engine also ran it on every
    // auto-repeat of a held Ctrl+D; the newer one skips them itself — here, skip them by the event being dispatched.
    const r = sm.webgpuRenderer;
    if (typeof r?.setDuplicateSelectedHandler !== 'function') return;
    const onceFn = fn && (() => { if (!(currentKeyEvent()?.repeat)) fn(); });
    r.setDuplicateSelectedHandler(onceFn ?? (() => { sm.duplicateSelectedShapes(); }));
  }

  private afterRendererBoot(isReinit = false) {
    this._teardownEngineSubs();
    // Prefer getting WorldManager first so we can extract any renderer/device it holds
    this.worldManager = WorldManager.getInstance();

    // startWebGPURendering has already constructed the singleton by now; getInstance() with no args returns it.
    // (A former renderer-argument path passed a renderer where getInstance expects a ShapeFactory — it only worked
    // because the argument is ignored once the instance exists.)
    this.shapeManager = ShapeManager.getInstance();
    // Experimental menu: re-apply the per-machine switches Salsa keeps for the session only (Fast compositing).
    applyStoredExperiments(this.shapeManager);

    // On reinit (shell→illustration nav) startWebGPURendering's overlay is bound to the
    // old destroyed canvas. Recreate it against the live canvas so ephemera renders.
    // Must run after shapeManager is assigned above.
    if (isReinit) this._setupEphemeraOverlay();

    this.authoringApi = new SceneAuthoringAPI(this.shapeManager);

    if (isDevMode()) {
      (window as any).salsa = this.authoringApi;
    }

    this.draw.loadPolygonPresets();
    this.markLoaded('renderer');

    // Must run before any render frame — enables the preRenderCallback that syncs
    // the 2D illustration camera to the 3D orthographic projection each frame.
    this.shapeManager.enableAutoSyncIllustrationCamera3D();
    this._updateGizmoPosition(0);
    this._syncViewGizmoHidden();

    this._sceneAppliedOnceSub = this.shapeManager.interactionService.onSceneGraphChanged
      .subscribe(() => {
        this.ngZone.run(() => {
          this.markLoaded('sceneApplied');
          this._sceneAppliedOnceSub?.unsubscribe(); this._sceneAppliedOnceSub = null;
          if (!this.isViewerMode && !this.persist.illustration?.isCustomThumbnail) {
            void this.persist.saveThumbnail();
          }
        });
      });

    this._cityBuildSub = this.shapeManager.world?.onCityBuildStateChange?.subscribe(
      ({ building, reason }: { building: boolean; reason: 'load' | 'edit' }) => {
        this.ngZone.run(() => {
          this.cityBuilding = building;
          this.cityBuildReason = reason;
        });
      }
    ) ?? null;

    // H5 (zone audit): selection / scene-graph / shape-selection events fire per pointer move during a 2D drag or a
    // marquee (box-select emits 1+N per move). Each one only records what changed; ONE flush per frame applies them in
    // ONE change detection (_engineEvents). An event raised from Angular code (in the zone: a panel click, undo, a
    // load) is still applied synchronously, as before, so code right after the engine call sees the new state.
    this.selectionChangedSubscription = this.shapeManager.interactionService.onSelectionChanged.subscribe((ids: string[]) => {
      this._pendingSelectionIds = ids;
      this._markEngineEvent('selection');
    });

    // Sync controlPanelActiveTool when the selection toolbar component changes the tool
    this.selectionToolSubscription = this.rasterSelectionService.tool$.subscribe((tool: string) => this._onSelectionToolChanged(tool));

    this._sceneGraphChangedSub = this.shapeManager.interactionService.onSceneGraphChanged.subscribe(() => this._markEngineEvent('scene'));

    this._rasterLayersSub = this.rasterBrushService.layers$.subscribe(layers => this._onRasterLayers(layers));

    // Keep selectedRasterLayerId in sync with the raster-layers panel
    this._rasterActiveLayerSub = this.rasterBrushService.activeLayerId$.subscribe(id => {
      this.editorState.selectedRasterLayerId = id;
    });

    // Keep current animation frame in sync for menu helpers
    this._currentFrameSub = this.animationService.currentFrame$.subscribe(f => {
      this._currentAnimFrame = f;
    });

    // View state — drives camera mode bar + 2D panel visibility
    this._viewStateSub = this.shapeManager.onViewStateChanged3D?.subscribe(() => {
      this.ngZone.run(() => this.applyViewUI3D(this.shapeManager.getViewRules3D() ?? {}));
    });
    this.applyViewUI3D(this.shapeManager.getViewRules3D() ?? {});
    this.engineStatus.subscribe();
    this._playStateSub = this.shapeManager.onPlayStateChanged3D?.subscribe(() => this.ngZone.run(() => this._onPlayStateChanged()));
    this._cameraCutsSub = this.shapeManager.onCameraCutsChanged3D?.subscribe(() => {
      this.ngZone.run(() => this.anim.scene3dRefreshCuts());
    });
    // Only state changes are handled: shape hovers / variable changes (per move, per tick) don't enter the zone.
    this._uiEventOff = this.shapeManager.onUIEvent((e: any) => {
      if (e?.type !== 'stateChange') return;
      this.ngZone.run(() => this._handleUIEvent(e));
    }) ?? null;
    this._uiSelectionOff = this.shapeManager.onShapeSelectionChanged((ids: string[]) => {
      this._pendingShapeSelectionIds = ids;
      this._markEngineEvent('shapeSelection');
    }) ?? null;
    // Fires per node drag; only the on / off state is bound, so enter the zone only when it flips.
    this._pathEditedOff = (this.shapeManager.onPathEdited((path: any) => {
      const active = path != null;
      if (active === this.isPathEditActive) return;
      if (NgZone.isInAngularZone()) this.isPathEditActive = active;
      else this.ngZone.run(() => { this.isPathEditActive = active; });
    }) as any) ?? null;

    // Subscribe to raster stroke end to trigger auto-save (raster drawing bypasses scene graph events)
    try {
      // Fires from the engine's (zoneless) pointerup: enter the zone, the recent-colour strip is bound. Once per stroke.
      const rasterSub = this.shapeManager.onRasterStrokeEnd(() => this.ngZone.run(() => this._onRasterStrokeEnd()));
      if (rasterSub) this.rasterStrokeSubscription = rasterSub as any;
    } catch (e) {
      console.warn('Failed to subscribe to raster stroke end', e);
    }
    this._subscribeRasterStrokeStartCancel();

    this._configureEngineForIllustration();
  }

  /** H5: engine events recorded since the last flush; applied once per frame (or at once when raised in the zone). */
  private readonly _engineEvents = new FrameCoalescer<EngineEventKind>(dirty => this.ngZone.run(() => this._flushEngineEvents(dirty)));
  /** The latest ids of the coalesced selection events (only the last set of a burst matters). */
  private _pendingSelectionIds: string[] | null = null;
  private _pendingShapeSelectionIds: string[] | null = null;
  /** rasterLayerSignature() when the layer list was last refreshed (null = refresh on the next scene-graph change). */
  private _layerSignature: string | null = null;

  private _markEngineEvent(kind: EngineEventKind): void {
    this._engineEvents.mark(kind);
    if (NgZone.isInAngularZone()) this._engineEvents.flushNow();
  }

  /** Canvas pointerup, registered after the engine's own listener: apply the drag's last events in this task. */
  private readonly _flushEngineEventsOnPointerUp = (): void => {
    if (this._engineEvents.pending) this.ngZone.run(() => this._engineEvents.flushNow());
  };

  /** Selection first (the scene-graph handler re-reads inspectors for the selected item), then the scene graph. */
  private _flushEngineEvents(dirty: ReadonlySet<EngineEventKind>): void {
    if (dirty.has('selection') && this._pendingSelectionIds) {
      const ids = this._pendingSelectionIds;
      this._pendingSelectionIds = null;
      this._onEngineSelectionChanged(ids);
    }
    if (dirty.has('shapeSelection') && this._pendingShapeSelectionIds) {
      const ids = this._pendingShapeSelectionIds;
      this._pendingShapeSelectionIds = null;
      this._onShapeSelectionChanged(ids);
    }
    if (dirty.has('scene')) this._onSceneGraphChanged();
  }

  /** Engine selection changed: layer-panel selection, 2D sidebars (colour / balloon / live text), 3D type flags,
   *  particle emitter. */
  private _onEngineSelectionChanged(selectedIds: string[]): void {
    this.editorState.selectedLayerIds = new Set(selectedIds);
    this.editorState.selectedNode = this.getNodeById(this.editorState.selectedLayerIds.values().next().value as string);

    if (selectedIds.length === 1) {
      const nodeColor = this.rgbaToHex(this.shapeManager.getNodeFillColor(selectedIds[0]));
      this.draw.shapeColor = '#' + nodeColor;
      this.draw.shapeHexInputDraft = nodeColor;

      // Sync balloon sidebar when an existing speech balloon is selected
      this.balloonOptions?._syncBalloonSidebar(selectedIds[0]);

      // Sync live text sidebar when an existing LiveTextNode is selected
      this.liveTextOptions?._syncLiveTextSidebar(selectedIds[0]);
    }

    // 3D type-flag detection — covers viewport clicks (which don't go through scene3dSelectMesh).
    // Same id space as scene3dSelectMesh; isPackageNode resolves root/panel/pivot ids.
    // Loop rather than just [0] so multi-select finds whichever element is typed.
    const sm3d = this.shapeManager;
    let pkgFound = false, charFound = false;
    for (const sid of selectedIds) {
      if (!pkgFound) {
        const pkgId = sm3d.packaging?.isPackageNode(sid);
        if (pkgId) {
          this.scene3dSelectedIsPackage = true;
          this.pkgSelectedId = pkgId;
          pkgFound = true;
        }
      }
      if (!charFound && sm3d.isProceduralBody3D(sid)) {
        this.character.scene3dSelectedIsCharacter = true;
        charFound = true;
      }
      if (pkgFound && charFound) break;
    }
    if (!pkgFound) { this.scene3dSelectedIsPackage = false; this.pkgSelectedId = null; }
    if (!charFound) { this.character.scene3dSelectedIsCharacter = false; }

    // Keep the 3D multi-selection (outliner highlight + boolean bar) in step with viewport picks — it only followed
    // outliner clicks, so a boolean could run on a stale pair.
    const s3dSel = sm3d.scene3d;
    if (s3dSel) this.editorState.scene3dSelectedMeshIds = new Set(selectedIds.filter(id => !!s3dSel.getMesh(id)));

    // Particle emitter selection
    const firstId = selectedIds[0] ?? null;
    if (firstId && sm3d.getParticleEmitter3D(firstId)) {
      this.selectedParticleEmitterId = firstId;
    } else {
      this.selectedParticleEmitterId = null;
    }
  }

  /** The selection toolbar switched selection tools — follow it. */
  private _onSelectionToolChanged(tool: string): void {
    if (this.controlPanelActiveTool.startsWith('select:')) {
      const newTool = `select:${tool}`;
      if (this.controlPanelActiveTool !== newTool) {
        this.controlPanelActiveTool = newTool;
        this.activeSelectionTool = tool as any;
        this.shapeManager.enableRasterSelection(tool as any);
        if (tool === 'magic-wand') this.fw._syncMagicWandOptions();
      }
    }
  }

  /** Scene graph changed: layer tree + autosave tick, array / blend / decal / array-tool syncs, camera nodes,
   *  vector outliner. */
  private _onSceneGraphChanged(): void {
    if (this.scene3dWorldPanelOpen) return;
    if (this.controlPanelActiveTool.startsWith('drawing') || this.controlPanelActiveTool.startsWith('shape')) {
      this.draw.addRecentColor(this.draw.selectedPenColor);
    }
    if (!this._suppressLayerTreeRebuild) {
      // A move / rotate / scale changes no layer: refresh the Layers panel + timeline only when what they show changed
      const sig = rasterLayerSignature(this.shapeManager);
      if (sig !== this._layerSignature) {
        this._layerSignature = sig;
        this.refreshRasterLayers();
      }
      // Older Salsa dist (no raster content versions): a tool may have written the selected layer without a stroke
      // (fill, paste, transform, text stamp …) — re-upload it with this save, to be safe (mobile-parity 7.3c)
      if (!this.persist.hasContentVersions) this.persist.markLayerDirty(this.editorState.selectedRasterLayerId);
      this.persist.sceneChanged$.next('__scene_' + Date.now());
    }

    // Array panel: re-sync params when gizmo drags update an active array group
    if (this.scene3dIsArrayGroup && this.editorState.scene3dSelectedMeshId) {
      this.arrayPanel?.sync(this.editorState.scene3dSelectedMeshId);
    }

    // Blend shapes: keep weights in sync when mesh is selected
    if (this.editorState.scene3dSelectedMeshId && !this.scene3dIsArrayGroup) this.blendSection?.syncWeights();

    // Array tool: sync count drift from scroll wheel; sync radial params if in radial mode
    if (this.arrayTool.scene3dArrayToolActive) {
      const liveCount = this.shapeManager.getArrayToolCount();
      if (typeof liveCount === 'number') this.arrayTool.scene3dArrayToolCount = liveCount;
      if (this.arrayTool.scene3dArrayToolMode === 'radial') this.arrayTool._scene3dSyncRadialToolStrip();
    }

    // Decal tool: refresh Id set when ghost mode places a new decal
    if (this.decal.scene3dDecalToolActive) {
      this.scene3dRefreshMeshes();
    }

    // Array tool: detect post-commit — ArrayToolController internally creates & selects an ArrayGroup3D
    if (this.arrayTool.scene3dArrayToolActive) {
      const sm = this.shapeManager;
      // (getSelectedNode3D/getSelectedMeshId3D were phantoms — unified selection is the real source)
      const selectedId: string | null = sm.getSelectedShapeIds()?.[0] ?? null;
      if (selectedId && sm.isArrayGroup3D(selectedId)) {
        this.arrayTool.scene3dArrayToolActive = false;
        sm.disableArrayTool();
        this.scene3dRefreshMeshes();
        this.scene3dSelectMesh(selectedId);
      }
    }

    // Transform inspector: re-read after gizmo drags / undo (it used to show the select-time values, so editing one
    // axis sent stale values for the others and the mesh snapped back)
    this.transformSection?.load();

    // Sync camera node list whenever the scene graph changes
    this.anim.scene3dRefreshCameraNodes();

    // Vector outliner: refresh when a shape is committed (e.g. freeform polygon)
    this.vectorPanel?.refreshVectorShapes();
  }

  private _onRasterLayers(layers: any): void {
    // Whoever refreshed the list (a panel action, a load, the scene-graph handler), the panels now show the engine's
    // current layers: that is the state the next scene-graph change compares against.
    this._layerSignature = rasterLayerSignature(this.shapeManager);
    this._applyRasterLayers(layers);
  }

  /** New layer list: keep a paintable raster layer selected, and re-apply the 3D view rules when the 3D scene layer
   *  first appears (layers$ often emits after the initial applyViewUI3D call, so has3DScene was false then — and on a
   *  doc load / reload the saved Scene / 3D Free view must activate the 3D panel + outliner). */
  private _applyRasterLayers(layers: any): void {
    const hadScene = this.has3DScene;
    this.editorState.rasterLayers = Array.isArray(layers) ? layers : [];
    const selectedIsRaster = this.editorState.rasterLayers.some((layer: any) => layer.id === this.editorState.selectedRasterLayerId && layer.type === 'layer');
    if (!selectedIsRaster) {
      this.editorState.selectedRasterLayerId = this.editorState.rasterLayers.find((layer: any) => layer.type === 'layer')?.id ?? null;
    }
    if (!hadScene && this.has3DScene) {
      this.applyViewUI3D(this.shapeManager.getViewRules3D() ?? {});
    }
  }

  private _onPlayStateChanged(): void {
    this.scene3dViewIsPlaying = this.shapeManager.isPlaying3D ?? false;
    this.editorState.playing = this.scene3dViewIsPlaying;   // child panels (layers, timeline) skip their hotkeys during Play
  }

  private _onShapeSelectionChanged(ids: string[]): void {
    this.uiSelectedShapeId = ids[0] ?? null;
    this.vectorPanel?.refreshVectorShapes();
  }

  /** Stroke start (no zone: only a flag) and stroke cancel (TOUCH-5: a second finger / the pen took the stroke back). A
   *  cancelled stroke that had BEGUN painting restored its pixels; a cloud upload that read the layer mid-stroke would
   *  keep the taken-back pixels on the server, so the layer goes up again (mobile-parity 7.3c). Typeof-guarded. */
  private _subscribeRasterStrokeStartCancel(): void {
    const sm = this.shapeManager as unknown as {
      onRasterStrokeStart?: (fn: (v: any) => void) => { unsubscribe(): void } | undefined;
      onRasterStrokeCancel?: (fn: (v: { began?: boolean } | undefined) => void) => { unsubscribe(): void } | undefined;
    };
    try {
      if (typeof sm.onRasterStrokeStart === 'function') {
        this._rasterStrokeStartSub = sm.onRasterStrokeStart(() => { this.persist.rasterStrokeActive = true; }) ?? null;
      }
      if (typeof sm.onRasterStrokeCancel === 'function') {
        this._rasterStrokeCancelSub = sm.onRasterStrokeCancel((ev) => {
          this.persist.rasterStrokeActive = false;
          if (ev?.began) this.ngZone.run(() => this._noteRasterHistoryEdit('__cancel_'));
        }) ?? null;
      }
    } catch (e) {
      console.warn('Failed to subscribe to raster stroke start / cancel', e);
    }
  }

  /** A raster edit the editor itself triggered (undo / redo, a taken-back stroke): re-upload the engine's selected layer
   *  (the one Salsa's per-layer history acted on) and tick the autosave. */
  private _noteRasterHistoryEdit(tag: string): void {
    if (!this.persist.illustration) return;
    const engineLayer = this.shapeManager?.rasterLayerManager?.getSelectedLayerId?.() ?? this.editorState.selectedRasterLayerId;
    this.persist.noteRasterStroke(engineLayer ?? null);
    this.persist.sceneChanged$.next(tag + Date.now());
  }

  /** A raster stroke ended (raster drawing bypasses scene-graph events): dirty the layer, recent colour, autosave tick. */
  private _onRasterStrokeEnd(): void {
    this.persist.rasterStrokeActive = false;
    if (!this.persist.illustration) return;
    // Mark the painted layer dirty (uploadPixelData re-uploads only it) and the thumbnail stale
    this.persist.noteRasterStroke(this.editorState.selectedRasterLayerId);
    this.draw.addRecentColor(this.draw.rasterBrushColor);
    // Notify OPFS auto-save service of stroke end
    this.autoSaveService.notifyStrokeEnd();
    if (this.pkg.scene3dPkgCreatorOpen) {
      this.shapeManager.syncLiveTextures3D();
    }
    // Autosave / thumbnail tick. Its subscribers only need a distinct value — this used to serialize the whole scene
    // WITH raster data on every stroke just to produce one.
    this.persist.sceneChanged$.next('__stroke_' + Date.now());
  }

  /** One-time engine setup for the illustration workflow: canvas colours, illustration mode, document size from
   *  the New Illustration query params, fixed background pattern, raster mode with the tool off. */
  private _configureEngineForIllustration(): void {
    this.canvasLook.onDotColorSelected('#191919');
    this.canvasLook.onBgColorSelected('#191919');

    this.shapeManager.setIllustrationMode(true);

    // Apply document size from query params (set by the New Illustration dialog).
    // For brand-new illustrations there is no saved state yet, so query params are
    // the only source. For existing illustrations, loadIllustrationV2 will call
    // _applyDocumentSize again with the persisted value — that's fine, it's idempotent.
    const qp = this.route.snapshot.queryParamMap;
    const docW = Number(qp.get('docW'));
    const docH = Number(qp.get('docH'));
    this.artboard.setupOverlay();
    if (docW > 0 && docH > 0) {
      this.artboard.applyDocumentSize({ w: docW, h: docH });
    } else {
      // Do NOT call clearDocumentSize here — that call creates the rasterWorldQuadVB with
      // illustrationMode=false before setDocumentSize can flip it to true, and the VB is
      // never rebuilt on mode change (Salsa only builds it once per setSize call).
      // Instead, let setDocumentSize (called later in loadIllustrationV2) create the VB
      // for the first time with illustrationMode=true already set.
      this.shapeManager.setIllustrationBounds(1, 1.417);
    }

    this.shapeManager.setBackgroundPatternFixed(true);
    // Force renderer into raster mode for illustration workflows, but keep the raster tool disabled until the Pen is selected.
    try {
      // enable renderer raster mode (affects renderer), then leave tool state off
      this.shapeManager.enableRasterDrawing();
      this.shapeManager.disableRasterTool();
      this.shapeManager.setRasterBrushSize(this.draw.rasterBrushSize);
      this.shapeManager.setRasterBrushColor(this.draw.rasterBrushColor);
      this.showRasterControls = true;
      // initial raster layers load
      this.refreshRasterLayers();
    } catch (e) {
      console.warn('Raster APIs may not be available on ShapeManager:', e);
    }
  }

  // Load raster layers from the runtime ShapeManager if available
  refreshRasterLayers() {
    // Ensure this runs inside Angular's zone so change detection picks up the new array.
    // Needed because callers like loadIllustrationV2 may resume after await outside the zone.
    const doRefresh = () => {
      try {
        // Applied before refreshLayers() makes layers$ emit, so the 3D-scene transition is detected here
        this._applyRasterLayers(this.shapeManager?.getRasterLayers() ?? []);
        // Push to the raster-layers panel component (subscribes to rasterBrushService.layers$)
        this.rasterBrushService.refreshLayers();
        // Keep animation timeline layer list in sync
        this.animationService.refreshTimeline();
      } catch (e) {
        console.warn('Failed to load raster layers from ShapeManager', e);
        this.editorState.rasterLayers = [];
      }
    };

    if (NgZone.isInAngularZone()) {
      doRefresh();
    } else {
      this.ngZone.run(() => doRefresh());
    }
  }

  selectRasterLayer(layerId: string, event?: MouseEvent) {
    event?.stopPropagation();
    this.setActiveTool('');
    try {
      this.shapeManager?.selectRasterLayer(layerId);
      this.editorState.selectedRasterLayerId = layerId;
    } catch (e) {
      console.warn('Failed to select raster layer on ShapeManager', e);
    }
  }

  /** The window keydown listener (outside the zone): handleHotkeys runs in the zone only for a key it could act on —
   *  in Play, WASD / arrows / space and their repeats cost no change detection (zone audit item 2). */
  private readonly _onKeyDownOutsideZone = (event: KeyboardEvent): void => {
    const needsZone = hotkeyNeedsZone(event, {
      playing: this.scene3dViewIsPlaying,
      liveTextEditing: !!this.liveTextOptions?.liveTextIsEditing,
      engineInputActive: !!this.shapeManager?.isInputActive(),
      screencastKeys: this.hud.screencastKeysEnabled,
    });
    if (needsZone) this.ngZone.run(() => this.handleHotkeys(event));
  };

  handleHotkeys(event: KeyboardEvent) {
    if (this.scene3dViewIsPlaying) return; // game loop owns the keyboard during Play Mode
    const target = event.target as HTMLElement;
    const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

    // Escape must reach Frogmarks even during LiveText editing so we can
    // update our own state. Salsa's overlay textarea also handles Escape
    // internally, but we need to sync liveTextIsEditing.
    if (event.key === 'Escape' && this.liveTextOptions?.liveTextIsEditing) {
      MODE_ACTIONS.endLiveText(this);
      event.preventDefault();
      return;
    }

    if (isEditable || this.shapeManager.isInputActive()) return;

    this.hud.recordScreencastKey(event);

    const isMac = navigator.userAgent.includes('Mac');
    const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

    if (dispatchKey(MOD_KEYMAP, this, event, ctrlKey)) return;

    // Single keys another handler already claimed (the 3D G / R / S / axis keys while a mesh is selected): 3D grab
    // used to also select the Fill tool, and X both constrained the axis and hid the UI. (Ctrl combos keep their
    // current routing.)
    if (event.defaultPrevented) return;

    dispatchKey(TOOL_KEYMAP, this, event, ctrlKey);
  }

  /** Delete / Backspace: clear the pixel selection, or drop editor-side state for the selected layers (the engine
   *  owns deleting 2D canvas shapes). */
  deleteSelectionOrLayers(): void {
    if (this.rasterSelectionService.info.hasSelection) {
      this.rasterSelectionService.deleteSelection();
      return;
    }
    this.editorState.selectedLayerIds.forEach(id => {
      this.fx.layerDitherConfigs.delete(id);
      this.fx.layerFrameLinkConfigs.delete(id);
    });
  }

  selectCursor(cursor: string) {
    switch (cursor) {
      case 'cursor':
        this.cursorSelected = true; this.panHandSelected = false; this.shapeManager.disablePanningTool(); this.setActiveTool('');
        return;
      case 'panhand':
        this.cursorSelected = false; this.panHandSelected = true; this.setActiveTool(''); this.shapeManager.enablePanningTool();
        return;
    }
  }

  // (Persistent colour picker → <app-persistent-color-picker>)

  // --- Raster drawing support (wiring to ShapeManager raster APIs) ---
  showRasterControls = false;
  activeRasterTool: 'brush' | 'airbrush' | 'eraser' = 'brush';
  activeSelectionTool: SelectionTool = 'rect';
  showBrushCursor = false;
  brushCursorX = 0;
  brushCursorY = 0;
  /** The ring (only while showBrushCursor): moved by direct style writes outside the zone (BRUSH-2). */
  @ViewChild('brushCursorRing') brushCursorRingRef?: ElementRef<HTMLDivElement>;
  get brushCursorTransform(): string {
    return `translate(${this.brushCursorX}px, ${this.brushCursorY}px) translate(-50%, -50%)`;
  }

  async rasterUndo() {
    try {
      const ok = await this.shapeManager?.rasterUndo();
      if (ok) this._noteRasterHistoryEdit('__undo_');   // the cloud copy of that layer is now stale (mobile-parity 7.3c)
      if (!ok) this.notifyService.error('Raster undo returned false');
    } catch (e) {
      this.notifyService.error('Raster undo failed');
      console.error(e);
    }
  }

  async rasterRedo() {
    try {
      const ok = await this.shapeManager?.rasterRedo();
      if (ok) this._noteRasterHistoryEdit('__redo_');
      if (!ok) this.notifyService.error('Raster redo returned false');
    } catch (e) {
      this.notifyService.error('Raster redo failed');
      console.error(e);
    }
  }

  private isSubpanelTool(tool: string): boolean {
    return tool.startsWith('drawing') || tool.startsWith('shape') ||
      tool.startsWith('select') || tool.startsWith('polygon') ||
      tool === 'fill' || tool === 'stamp' || tool === 'arrow' ||
      tool === 'raster:text' || tool === 'balloon' || tool === 'live-text' ||
      tool === 'panel-layout';
  }

  /** Retro-chrome theme: dither the tool-options panel in (utils/dither-reveal). */
  private ditherRevealSubpanel(): void {
    if (!document.body.classList.contains('theme-retro-chrome')) return;
    // Find panel without requiring .visible — called synchronously before Angular renders
    // the class change, so the canvas lands on body before the panel snaps into view.
    const panel = this.toolOptionsPanelRef?.nativeElement;   // (a document query found the FIRST .tool-subpanel — the array tool's)
    if (panel) ditherReveal(panel);
  }

  setActiveTool(activeTool: string, event?: MouseEvent) {
    // Touch: the tool's options panel folded away after a brush pick; tapping the tool again reopens it (not off)
    if (this.toolSubpanel.onToolTap(activeTool, this.controlPanelActiveTool)) { this.ditherRevealSubpanel(); return; }
    if (activeTool && activeTool === this.controlPanelActiveTool) activeTool = '';
    if (activeTool) this.showEphemeraPanel = false;
    const prevTool = this.controlPanelActiveTool;
    if (activeTool !== this.controlPanelActiveTool) {
      this.controlPanelActiveTool = activeTool;
      if (this.controlPanelActiveTool) {
        this.cursorSelected = false; this.panHandSelected = false; this.shapeManager.disablePanningTool();
      }
    }

    // Each tool family switches its engine mode on for its own tool(s) and off for every other tool.
    this._syncEngineDrawingModes();
    this._syncRasterBrushTool();
    this._syncRasterMoveTool();
    this._syncSelectionTool();
    this._syncShapeTools(event);

    // ── Flood fill / Speech Balloon tools ──
    // PHANTOM: enableFloodFillTool/enableSpeechBalloonTool never existed in the engine —
    // these calls were silent no-ops (the tools work via other paths: sm.floodFill on click,
    // createSpeechBalloon). Left as a marker for the tool-mode wiring audit.

    // ── Live Text tool ── (<app-live-text-options>)
    if (this.controlPanelActiveTool === 'live-text') {
      this.liveTextOptions?.activate();
    } else {
      this.liveTextOptions?.deactivate();
    }

    // ── Panel Layout tool ──
    // PHANTOM: enablePanelLayoutTool never existed in the engine (see note above).

    // Diamond dither reveal when subpanel transitions from hidden to visible
    const subpanelBecameVisible =
      !this.editorState.scene3dPanelVisible &&
      !this.isSubpanelTool(prevTool) &&
      this.isSubpanelTool(this.controlPanelActiveTool);
    if (subpanelBecameVisible) {
      this.ditherRevealSubpanel();
    }
  }

  /** Engine drawing modes that are simply on for their tool, off otherwise (line / text / pen raster / eraser /
   *  highlighter / pattern / section / stamp / raster text / arrow). */
  private _syncEngineDrawingModes(): void {
    this.controlPanelActiveTool === 'arrow' ? this.shapeManager.enableLineDrawing() : this.shapeManager.disableLineDrawing();
    this.controlPanelActiveTool === 'text' ? this.shapeManager.enableTextDrawing() : this.shapeManager.disableTextDrawing();
    // Pen -> enable raster tool (tool-only) for illustrations; otherwise disable raster tool
    if (this.controlPanelActiveTool === 'drawing:pen') {
      this.draw.setRasterBrushColor(this.draw.selectedPenColor); // Sync colors
      this.shapeManager.enableRasterTool();
    }
    // Use raster eraser for illustrations (renderer already raster). Fall back to raster eraser API.
    else if (this.controlPanelActiveTool === 'drawing:eraser') {
      this.shapeManager.enableRasterClearEraserTool();
    }
    else {
      this.shapeManager.disableRasterTool();
    }

    this.controlPanelActiveTool === 'drawing:highlighter' ? this.shapeManager.enableHighlightDrawing() : this.shapeManager.disableHighlightDrawing();
    
    this.controlPanelActiveTool === 'drawing:pattern' ? this.shapeManager.enablePatternDrawing() : this.shapeManager.disablePatternDrawing();
    this.controlPanelActiveTool === 'section' ? this.shapeManager.enableSectionDrawing() : this.shapeManager.disableSectionDrawing();
    // sdftext removed from Illustration — vector only, lives in Board
    this.controlPanelActiveTool === 'stamp' ? this.shapeManager.enableStampDrawing() : this.shapeManager.disableStampDrawing();

    // ── Raster text tool ──
    if (this.controlPanelActiveTool === 'raster:text') {
      this.rt._enableRasterText();
    } else {
      this.rt._disableRasterText();
    }

    // ── Arrow tool (line with default arrowheads) ──
    if (this.controlPanelActiveTool === 'arrow') {
      this.shapeManager.setDefaultArrowheads(this.draw.arrowheadStart, this.draw.arrowheadEnd);
      this.shapeManager.enableLineDrawing();
    }
  }

  /** Raster brush / airbrush / eraser (structured tools) and the brush cursor. */
  private _syncRasterBrushTool(): void {
    // ── Raster brush / airbrush / eraser (new structured tools) ──
    if (this.controlPanelActiveTool === 'raster:brush') {
      this.activeRasterTool = 'brush';
      this.showBrushCursor = true;
      this.rasterBrushService.enableBrushTool();
      this.rasterBrushService.setColor(this.draw.rasterBrushColor);
      this.rasterBrushService.setSize(this.draw.rasterBrushSize);
    } else if (this.controlPanelActiveTool === 'raster:airbrush') {
      this.activeRasterTool = 'airbrush';
      this.showBrushCursor = true;
      this.rasterBrushService.enableBrushTool();
      this.rasterBrushService.setColor(this.draw.rasterBrushColor);
      this.rasterBrushService.setSize(this.draw.rasterBrushSize);
    } else if (this.controlPanelActiveTool === 'raster:eraser') {
      this.activeRasterTool = 'eraser';
      this.showBrushCursor = true;
      this.rasterBrushService.enableEraserTool('fade');
      this.rasterBrushService.setSize(this.draw.rasterBrushSize);
    } else if (this.controlPanelActiveTool === 'drawing:pen' || this.controlPanelActiveTool === 'drawing:eraser') {
      // drawing:pen and drawing:eraser already manage raster state above — just hide cursor
      this.showBrushCursor = false;
    } else {
      this.showBrushCursor = false;
      this.rasterBrushService.disableRasterTool();
    }
  }

  /** Raster move / grab tool and its canvas cursor. */
  private _syncRasterMoveTool(): void {
    // ── Raster move / grab tool ──
    if (this.controlPanelActiveTool === 'raster:move') {
      this.shapeManager.enableRasterMove();
      if (this.canvas) this.canvas.style.cursor = 'grab';
    } else {
      this.shapeManager.disableRasterMove();
      // Reset cursor when leaving move tool (other tools set their own)
      if (this.canvas && this.canvas.style.cursor === 'grab') {
        this.canvas.style.cursor = '';
      }
    }
  }

  /** Pixel selection tools (rect / ellipse / lasso / magic wand): engine capture + selection service. */
  private _syncSelectionTool(): void {
    // ── Selection tools ──
    if (this.controlPanelActiveTool.startsWith('select:')) {
      const tool = this.controlPanelActiveTool.replace('select:', '') as SelectionTool;
      this.activeSelectionTool = tool;
      // Activate engine-side selection (creates service, starts pointer capture, renders overlays)
      this.shapeManager.enableRasterSelection(tool);
      this.rasterSelectionService.enable();
      this.rasterSelectionService.setTool(tool);
      // Sync magic wand options when switching to wand
      if (tool === 'magic-wand') {
        this.fw._syncMagicWandOptions();
      }
    } else {
      // Deactivate engine-side selection and switch back to drawing
      this.shapeManager.disableRasterSelection();
      this.rasterSelectionService.disable();
    }
  }

  /** Shape preview tools (square / circle / triangle / polygon) and freeform polygon drawing. */
  private _syncShapeTools(event?: MouseEvent): void {
    // shapes
    if (this.controlPanelActiveTool.startsWith('shape')) {
      this.shapeManager.setShapeColor(this.draw.selectedPenColor);
    }
    if (this.controlPanelActiveTool === 'shape:square') this.setPreviewShapeSelected(ShapeType.Rectangle, event!);
    else if (this.controlPanelActiveTool === 'shape:circle') this.setPreviewShapeSelected(ShapeType.Circle, event!);
    else if (this.controlPanelActiveTool === 'shape:triangle') this.setPreviewShapeSelected(ShapeType.Triangle, event!);
    else if (this.controlPanelActiveTool === 'shape:polygon') {
      this.shapeManager.defaultPolygonSides = this.draw.defaultPolygonSides;
      this.setPreviewShapeSelected(ShapeType.Polygon, event!);
    }
    else this.setPreviewShapeSelected(null, event!);

    // Freeform polygon drawing
    if (this.controlPanelActiveTool === 'polygon:freeform') {
      this.shapeManager.setShapeColor(this.draw.selectedPenColor);
      this.shapeManager.enablePolygonDrawing();
    } else {
      this.shapeManager.disablePolygonDrawing();
    }
  }

  // ── Flood Fill ─────────────────────────────────────────────

  async onCanvasClickForFill(event: MouseEvent): Promise<void> {
    if (this.controlPanelActiveTool !== 'fill') return;
    // Convert screen coords → world coords via Salsa's interaction service
    const worldPos = this.shapeManager.interactionService?.toWorldCoords(event);
    if (!worldPos) return;
    const color = this.draw.selectedPenColor;
    await this.shapeManager.floodFillWorld(worldPos.x, worldPos.y, color, {
      tolerance: this.fw.fillTolerance,
      gapClosing: this.fw.fillGapClosing,
      contiguous: this.fw.fillContiguous,
      referenceLayerId: this.fw.fillReferenceLayerId || undefined,
    });
  }

  // ══════════════════════════════════════════════════════════
  //  Speech Balloon Tool
  // ══════════════════════════════════════════════════════════

  /** Get IDs of currently selected shapes from the interaction service. */
  private _getSelectedShapeIds(): string[] {
    const is = this.shapeManager.interactionService;
    if (is?.selectedNodes?.size) {
      return Array.from(is.selectedNodes).map((n: any) => n.id ?? n.getId?.()).filter(Boolean);
    }
    return this.shapeManager.getSelectedShapeIds() ?? [];
  }

  // ── Transform operations ───────────────────────────────────

  async rasterFlipHorizontal(): Promise<void> {
    if (!this.rasterSelectionService.info.hasSelection) return;
    await this.shapeManager.rasterFlipHorizontal();
    this.rasterSelectionService.refreshInfo();
  }

  async rasterFlipVertical(): Promise<void> {
    if (!this.rasterSelectionService.info.hasSelection) return;
    await this.shapeManager.rasterFlipVertical();
    this.rasterSelectionService.refreshInfo();
  }

  async rasterRotate(degrees: number): Promise<void> {
    if (!this.rasterSelectionService.info.hasSelection) return;
    await this.shapeManager.rasterRotate(degrees);
    this.rasterSelectionService.refreshInfo();
  }

  // ── Edit menu ──────────────────────────────────────────────

  toggleFileMenu(): void {
    const wasOpen = this.showFileMenu;
    this.closeAllMenus();
    this.showFileMenu = !wasOpen;
  }
  toggleEditMenu(): void {
    const wasOpen = this.showEditMenu;
    this.closeAllMenus();
    this.showEditMenu = !wasOpen;
  }
  toggleAnimationMenu(): void {
    const wasOpen = this.showAnimationMenu;
    this.closeAllMenus();
    this.showAnimationMenu = !wasOpen;
  }
  toggleViewMenu(): void {
    const wasOpen = this.showViewMenu;
    this.closeAllMenus();
    this.showViewMenu = !wasOpen;
  }
  closeAllMenus(): void {
    this.showFileMenu = false;
    this.showEditMenu = false;
    this.showAnimationMenu = false;
    this.showViewMenu = false;
    this.scene3dShowAddMeshMenu = false;
    this.closeContextMenu();
  }

  // ── Animation menu helpers ──────────────────────────────────
  private _currentAnimFrame = 1;

  menuInsertFrame(): void {
    if (!this.animationEnabled) return;
    this.animationService.insertFrame(this._currentAnimFrame);
  }
  menuDeleteFrame(): void {
    if (!this.animationEnabled) return;
    this.animationService.deleteFrame(this._currentAnimFrame);
  }
  menuAddFrames(): void {
    if (!this.animationEnabled) return;
    this.animationService.addFrames(12);
  }
  menuAddCel(): void {
    if (!this.animationEnabled) return;
    this.animationService.addCelAtCurrentFrame(this.editorState.selectedRasterLayerId ?? '');
  }

  // ── Auto-save ──────────────────────────────────────────────

  /** Ctrl+S / Save: flush the engine's local store AND the document metadata (cloud / browser-only) — it used to
   *  flush only the engine's OPFS store. */
  async saveNow(): Promise<void> {
    await this.autoSaveService.saveNow();
    await this.persist.saveIllustrationV2();
  }

  // ── Canvas resize dialog (M2) ──────────────────────────────────

  // ── Color history ──────────────────────────────────────────────

  // ── Shortcut cheatsheet ───────────────────────────────────────
  showShortcutCheatsheet = false;
  /** Keyboard Shortcuts dialog sections, generated from the keymap tables. */
  readonly cheatsheetColumns = cheatsheetColumns();

  // ── Artboard overlay ────────────────────────────────────────

  spawnShape(shape: string) {
    switch (shape) {
      case 'circle': this.shapeManager.createCircle(0, 0, .5, { r: 0, g: 0, b: 0, a: 1 }, 1); break;
      case 'rectangle': this.shapeManager.createRectangle(0, 0, .5, .5, { r: 0, g: 0, b: 0, a: 1 }, 1); break;
      case 'triangle': this.shapeManager.createTriangle(0, 0, .5, .5, { r: 0, g: 0, b: 0, a: 1 }, 1); break;
      case 'stickynote': this.shapeManager.createStickyNote(0, 0, 'Type anything!', { r: 1, g: 1, b: 0.56, a: 1 }); break;   // (was signed with a hard-coded name)
      case 'polygon': this.shapeManager.createRegularPolygon(0, 0, 0.3, this.draw.defaultPolygonSides, { r: 0, g: 0, b: 0, a: 1 }, 1); break;
    }
  }

  // ── Export Modal ──────────────────────────────────────────────

  setPreviewShapeSelected(shapeType: ShapeType | null, event: MouseEvent) {
    this.draw.selectedShapeType = shapeType;
    this.shapeManager.setPreviewShape(shapeType as any, event);
  }

  // ── V2 Load ──────────────────────────────────────────────────

  resetSceneState() {
    if (this.shapeManager) this.shapeManager.clear();
    if (this.worldManager) this.worldManager.resetWorldState();
  }

  _disableAllViewerTools(): void {
    const sm = this.shapeManager;
    sm.disableLineDrawing();
    sm.disablePolygonDrawing();
    sm.disableRasterDrawing();
    sm.disableRasterTool();
    sm.disableRasterEraserTool();
    sm.disableStampDrawing();
    sm.disableSectionDrawing();
    sm.disableHighlightDrawing();
    sm.disablePatternDrawing();
    sm.disableEraserTool();
    sm.disableSDFTextDrawing();
    sm.disableRasterSelection();
    sm.disableRasterMove();
    sm.disableRasterText();
    sm.disableScribbleDrawing();
    sm.disableTextDrawing();
  }

  private _setupEphemeraOverlay(): void {
    if (this._ephemeraOverlay) {
      this.shapeManager.setEphemeraOverlayCanvas(null);
      this._ephemeraOverlay.remove();
      this._ephemeraOverlayObserver?.disconnect();
      this._ephemeraOverlayObserver = null;
    }

    const webgpuCanvas = document.getElementById('webgpuCanvas') as HTMLCanvasElement | null;
    if (!webgpuCanvas) return;

    const overlay = document.createElement('canvas');
    overlay.style.position      = 'fixed';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex        = '10';
    document.body.appendChild(overlay);

    const sync = () => {
      const r = webgpuCanvas.getBoundingClientRect();
      overlay.width  = webgpuCanvas.width;
      overlay.height = webgpuCanvas.height;
      overlay.style.left   = `${r.left}px`;
      overlay.style.top    = `${r.top}px`;
      overlay.style.width  = `${r.width}px`;
      overlay.style.height = `${r.height}px`;
    };
    sync();

    this._ephemeraOverlayObserver = new ResizeObserver(sync);
    this._ephemeraOverlayObserver.observe(webgpuCanvas);

    this.shapeManager?.setEphemeraOverlayCanvas(overlay);
    this._ephemeraOverlay = overlay;
  }

  ngOnDestroy(): void {
    this._unregisterUpdateGuard?.();
    this._unregisterUpdateGuard = null;
    window.removeEventListener('scroll', this._onWinScrollOrResize);
    window.removeEventListener('resize', this._onWinScrollOrResize);
    document.removeEventListener('keydown', this._onDocKeyDownOutsideZone);
    document.removeEventListener('keyup', this._onDocKeyUpOutsideZone);
    this._hiddenUiWake.detach();
    clearTimeout(this._showUiBtnTimer);
    this._teardownEngineSubs();
    this.routeSub?.unsubscribe();
    this.rt._rasterTextSub?.unsubscribe(); this.rt._rasterTextSub = null;
    this.persist.autoSaveSubscription?.unsubscribe();
    this.persist._metaFlushSub?.unsubscribe();
    this.persist.thumbnailSaveSubscription?.unsubscribe();
    clearTimeout(this._gizmoPosTimer);
    this._scene3dViewportSub?.unsubscribe?.();
    this._scene3dResizeObserver?.disconnect();
    // Salsa's 3D nav gizmo sits on document.body (outside this template): with a 3D camera mode on it stayed on screen
    // over the Shell / dashboard / board after leaving. Dispose it with the editor (the next document re-creates it).
    releaseViewGizmo(this.shapeManager as unknown as ViewGizmoEngine);
    this.autoSaveService.disable();
    // Leaving the route with the UV editor / UV paint open: the engine outlives the editor, so close it fully here
    // (orbit, focus background, paint input, the mobile idle pause) — the panel's own destroy only exits paint.
    if (this.uv.uvEditorOpen || this.uv.scene3dClothingPaintActive) {
      try { this.uv.closeUVEditor(); } catch (e) { console.warn('[illustration] UV editor close on destroy failed', e); }
    }

    this.ribbon.stopHandleLoop();

    if (this.character.scene3dIdleEnabled && this.character.scene3dEditCharBodyId) {
      this.shapeManager.setIdleAnimation3D(this.character.scene3dEditCharBodyId, false);
    }
    clearTimeout(this.add._charPreviewTimer);
    clearTimeout(this._toolsSwapTimer);

    this._removeInputListeners();

    this.doc.clearExportReminder();
    this.resetSceneState();

    if (this._ephemeraOverlay) {
      this.shapeManager.setEphemeraOverlayCanvas(null);
      this._ephemeraOverlay.remove();
      this._ephemeraOverlayObserver?.disconnect();
      this._ephemeraOverlay = null;
      this._ephemeraOverlayObserver = null;
    }
  }

  getNodeById(nodeId: string): any { return this.shapeManager.getNodeById(nodeId); }

  isLoading = true;
  private _focusTitleOnLoad = false;
  private _startAnimationOnLoad = false;
  private loadingState = {
    renderer: false,
    illustration: false,
    sceneApplied: false
  };
  markLoaded(key: keyof typeof this.loadingState) {
    // The load paths mark 'sceneApplied' from a requestAnimationFrame callback, which runs OUTSIDE the zone (rAF is not
    // patched, src/zone-flags.ts): enter it, the loading overlay and the after-load steps are bound state.
    if (!NgZone.isInAngularZone()) { this.ngZone.run(() => this.markLoaded(key)); return; }
    this.loadingState[key] = true;
    if (Object.values(this.loadingState).every(Boolean)) {
      this.isLoading = false;
      perfMark('doc-loaded');
      requestAnimationFrame(() => requestAnimationFrame(() => { perfMark('editor:first-frame'); logCreateTimeline(); }));
      this.doc.startExportReminder();
      void this.storage._initPixelFormat();
      this.canvasLook.loadCanvasGrid();
      if (this._startAnimationOnLoad) {
        this._startAnimationOnLoad = false;
        this.setAnimationEnabled(true);
      }
      if (this._focusTitleOnLoad) {
        this._focusTitleOnLoad = false;
        setTimeout(() => {
          this.titleInputRef?.nativeElement?.select();
          this.titleInputRef?.nativeElement?.focus();
        }, 150);
      }
      // The engine holds the restored PS1 / retro-colour settings — mirror them into the panel (2026-09-29).
      this.s3._syncScene3dPS1FromEngine();
      this.s3._syncEnvironmentStyleFromEngine();
      this.anim.syncPlayerFromEngine();
      // Trigger Salsa's resize → setCanvasSize path after document load.
      // Required when the canvas doesn't physically resize (e.g. fixed full-viewport
      // placement) so the raster compositor recalculates against the loaded doc.
      window.dispatchEvent(new Event('resize'));
    }
  }

  // ── .frogmarks project file ────────────────────────────────────────────────

  // ── GARP Skins ────────────────────────────────────────────────────────────

  scene3dToggleGarpPanel(): void {
    this.garpPanelOpen = !this.garpPanelOpen;   // <app-skins-panel> refreshes itself when opened
  }

  scene3dGarpPaintStart(meshId: string): void {
    this.editorState.scene3dSelectedMeshId = meshId;
    this.uv.openUVEditor();
  }

  scene3dGarpRegenerateCity(): void {
    this.shapeManager.world?.updateCity(this.worldPanel?.worldParams());
    this.scene3dMarkDirty();
  }
}
