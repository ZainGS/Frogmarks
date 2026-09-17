import { Component, OnInit, OnDestroy, ViewChild, HostListener, ElementRef, NgZone, isDevMode } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ResultType } from '../../../shared/models/error-result.model';

import { IllustrationService, IllustrationStateDto, AnimationStateDto, LayerStateDto, CelStateDto } from 'app/shared/services/illustrate/illustration.service';
import { OpfsMetadataService } from 'app/shared/services/illustrate/opfs-metadata.service';
import { LocalIllustrationService } from 'app/shared/services/illustrate/local-illustration.service';
import { FrogFileService, FrogImportResult } from 'app/shared/services/illustrate/frog-file.service';

import { Illustration } from 'app/illustrate/models/illustration.model';

import ShapeManager from '@zaings/salsa/shape-manager';
import WorldManager from '@zaings/salsa/world-manager';
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering, SceneAuthoringAPI } from '@zaings/salsa';

import { ShapeType } from '../../../shared/enums/shape-type';
import { auditTime, debounceTime, distinctUntilChanged, filter, firstValueFrom, map, Subject, Subscription } from 'rxjs';
import { ColorPickerComponent } from 'app/shared/components/color-picker/color-picker.component';
import { GpDrawSettings } from '../grease-pencil-panel/grease-pencil-panel.component';

import { AuthService } from 'app/shared/services/auth/auth.service';
import { NotifyService } from 'app/shared/services/notify/notify.service';
import { LayerTreeNode } from 'app/boards/models/layer-tree-node.model';
import { RasterBrushService } from 'app/shared/services/raster/raster-brush.service';
import { RasterSelectionService } from 'app/shared/services/raster/raster-selection.service';
import { RasterAnimationService, OnionSkinConfig, LoopMode, TimelineLayerInfo, CelInfo } from 'app/shared/services/raster/raster-animation.service';
import { RasterAutoSaveService, AutoSaveState, AUTO_SAVE_INTERVALS, AutoSaveInterval } from 'app/shared/services/raster/raster-autosave.service';
import {
  SelectionTool,
  WandSelectionMode,
  MagicWandOptions,
  CanvasGrainType,
  CanvasGrainOption,
  CANVAS_GRAIN_OPTIONS,
  ArrowheadStyle,
  ARROWHEAD_OPTIONS,
  RasterTextState,
  DitherAlgorithm,
  DitherColorMode,
  DitherConfig,
  DEFAULT_DITHER_CONFIG,
  DITHER_ALGORITHM_OPTIONS,
  BAYER_LEVEL_OPTIONS,
  COLOR_LEVEL_OPTIONS,
  HALFTONE_SHAPE_OPTIONS,
  COLOR_MODE_OPTIONS,
  FrameLinkAnimation,
  FrameLinkAnimationType,
  FrameLinkLoopMode,
  DEFAULT_FRAME_LINK_ANIMATION,
  FRAME_LINK_TYPE_OPTIONS,
  FRAME_LINK_LOOP_MODE_OPTIONS,
} from 'app/boards/models/brush-preset.model';
import {
  TailSide, BalloonStyle, WritingMode, SpeechBalloonOptions,
  BALLOON_STYLE_OPTIONS, DEFAULT_BALLOON_OPTIONS,
} from 'app/illustrate/models/speech-balloon.model';
import {
  PanelTemplate, PanelLayoutOptions,
  PANEL_TEMPLATE_OPTIONS, PAGE_SIZE_PRESETS, PageSizePreset,
  DEFAULT_PANEL_LAYOUT_OPTIONS,
} from 'app/illustrate/models/panel-layout.model';
import {
  TextEffectType, TextEffectEntry, TextEffectPreset,
  TEXT_EFFECT_TYPE_OPTIONS, TEXT_EFFECT_PRESETS,
  createEffectEntry, createDefaultParams,
  BalloonPreset, BALLOON_PRESETS,
  ShaderSnippet, SHADER_SNIPPETS,
} from 'app/illustrate/models/text-effect.model';

async function gzipToBlob(data: unknown): Promise<Blob> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Response(cs.readable).blob();
}

async function gunzipFromBinary(buffer: ArrayBuffer): Promise<unknown> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(buffer));
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return JSON.parse(new TextDecoder().decode(merged));
}


async function gunzipFromBase64(b64: string): Promise<unknown> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return JSON.parse(new TextDecoder().decode(merged));
}

@Component({
  selector: 'app-illustration',
  standalone: false,
  templateUrl: './illustration.component.html',
  styleUrl: './illustration.component.scss'
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
  private _cameraCutsSub: any = null;
  private _scene3dResizeObserver: ResizeObserver | null = null;

  @ViewChild('webgpuCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
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

  // Close on any document click, scroll, resize, or Escape
  @HostListener('document:click') onDocClick() { this.closeAllMenus(); }
  @HostListener('window:scroll') onWinScroll() { this.closeContextMenu(); }
  @HostListener('window:resize') onWinResize() { this.closeContextMenu(); }
  @HostListener('document:keydown.escape') onEsc() {
    if (this.scene3dViewIsPlaying) return; // Esc releases pointer-lock; Play Mode handles it
    this.scene3dEndPlacePick();
    this.closeContextMenu();
  }
  // Viewport transform shortcut HUD (synced from Salsa getters)
  scene3dShortcutActive = false;
  scene3dShortcutMode: string | null = null;
  scene3dShortcutAxis: string | null = null;
  scene3dShortcutNumeric = '';

  private _syncShortcutHud(): void {
    const sm = this.shapeManager as any;
    this.scene3dShortcutActive = sm?.isShortcutActive3D ?? false;
    this.scene3dShortcutMode   = sm?.shortcutMode3D ?? null;
    this.scene3dShortcutAxis   = sm?.shortcutAxis3D ?? null;
    this.scene3dShortcutNumeric = sm?.shortcutNumericDisplay3D ?? '';
  }

  @HostListener('document:keydown', ['$event']) onCtrlSnapKeyDown(e: KeyboardEvent) {
    if (e.key === 'Control') {
      if (this._snapFadeTimer) { clearTimeout(this._snapFadeTimer); this._snapFadeTimer = null; }
      this.ngZone.run(() => {
        this.scene3dSnapActive = true;
        this.scene3dSnapFadingOut = false;
        this.scene3dSnapBadgeVisible = true;
      });
    }

    if (this.scene3dPanelVisible && this.scene3dSelectedMeshId) {
      const active = document.activeElement;
      const inInput = active instanceof HTMLInputElement
        || active instanceof HTMLTextAreaElement
        || (active as HTMLElement)?.isContentEditable;
      if (!inInput) {
        const sm = this.shapeManager as any;
        const key = e.key.toLowerCase();

        if (key === 'g') { sm.beginTransform3D?.('grab');   e.preventDefault(); this._syncShortcutHud(); return; }
        if (key === 'r') { sm.beginTransform3D?.('rotate');  e.preventDefault(); this._syncShortcutHud(); return; }
        if (key === 's' && !e.ctrlKey && !e.metaKey) { sm.beginTransform3D?.('scale'); e.preventDefault(); this._syncShortcutHud(); return; }

        if (sm.isShortcutActive3D) {
          if (key === 'x') { sm.constrainAxis3D?.('x'); e.preventDefault(); this._syncShortcutHud(); return; }
          if (key === 'y') { sm.constrainAxis3D?.('y'); e.preventDefault(); this._syncShortcutHud(); return; }
          if (key === 'z') { sm.constrainAxis3D?.('z'); e.preventDefault(); this._syncShortcutHud(); return; }
          if (key === 'enter') { sm.commitTransform3D?.(); e.preventDefault(); this._syncShortcutHud(); return; }
          if (/^[\d.\-]$/.test(e.key)) { sm.appendNumericInput?.(e.key); e.preventDefault(); this._syncShortcutHud(); return; }
        }

        if (key === 'escape') { sm.cancelTransform3D?.(); e.preventDefault(); this._syncShortcutHud(); return; }
      }
    }
  }
  @HostListener('document:keyup', ['$event']) onCtrlSnapKeyUp(e: KeyboardEvent) {
    if (e.key === 'Control') {
      this.ngZone.run(() => { this.scene3dSnapActive = false; });
      this._snapFadeTimer = setTimeout(() => {
        this.ngZone.run(() => { this.scene3dSnapFadingOut = true; });
        this._snapFadeTimer = setTimeout(() => {
          this.ngZone.run(() => {
            this.scene3dSnapBadgeVisible = false;
            this.scene3dSnapFadingOut = false;
            this._snapFadeTimer = null;
          });
        }, 1000);
      }, 1000);
    }
  }

  // State flags
  uiHidden = false;
  isFullscreen = false;
  layerTreeHidden = false;
  animationEnabled = false;

  // ── Flood Fill state ────────────────────────────────────────
  fillTolerance = 32;
  fillGapClosing = 1;
  fillContiguous = true;
  fillReferenceLayerId = '';

  // ── Magic Wand state ──────────────────────────────────────────
  wandTolerance = 32;
  wandContiguous = true;
  wandMode: WandSelectionMode = 'new';
  wandReferenceLayerId = '';

  // ── Auto-save state ───────────────────────────────────────────
  autoSaveState: AutoSaveState = 'idle';
  autoSaveIntervals = AUTO_SAVE_INTERVALS;
  selectedAutoSaveInterval = 30_000;
  showEditMenu = false;
  showFileMenu = false;
  showAnimationMenu = false;
  showViewMenu = false;
  scene3dShowAddMeshMenu = false;
  scene3dShowKeyframeHint = false;

  toggleAnimationMode(): void {
    this.animationEnabled = !this.animationEnabled;
    this.animationService.setAnimationEnabled(this.animationEnabled);
    this.closeContextMenu();
    this._markStateDirty();
  }

  toggleUI(force?: boolean) {
    this.notifyService.success('Press the X button to toggle UI');
    this.uiHidden = typeof force === 'boolean' ? force : !this.uiHidden;
    if (this.uiHidden) this.closeContextMenu();
  }

  toggleLayerTree() {
    this.layerTreeHidden = !this.layerTreeHidden;
    this.closeContextMenu();
  }

  async toggleFullscreen() {
    const el: any =
      this.boardShellRef?.nativeElement ??
      this.canvasRef?.nativeElement ??
      document.documentElement;

    try {
      const isActive =
        !!document.fullscreenElement ||
        !!(document as any).webkitFullscreenElement;

      if (!isActive) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    const sm = this.shapeManager as any;
    const dirtyMeshIds: string[] = sm?.getDirtyMeshIds3D?.() ?? [];
    // Warn for unsaved 3D changes (cloud-sync/no-cloud) or if a save is still in-flight
    const hasUnsaved = dirtyMeshIds.length > 0 || this._saveRunning || this._saveQueued;
    if (hasUnsaved) {
      event.preventDefault();
    }
  }

  @HostListener('document:fullscreenchange') onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
  }
  @HostListener('document:webkitfullscreenchange') onFullscreenChangeWebkit() {
    this.isFullscreen = !!(document as any).webkitFullscreenElement;
  }

  // ---- renamed core state ----
  canvas!: HTMLCanvasElement;
  illustrationUid: string | null = null;
  illustration: Illustration | null = null;
  layerTree: LayerTreeNode | null = null;
  selectedLayerIds: Set<string> = new Set();
  hoveredLayerId: string | null = null;
  private selectionChangedSubscription!: { unsubscribe: () => void };
  private selectionToolSubscription!: { unsubscribe: () => void };
  public selectedNode: any | null = null;

  contextMenu = { visible: false, x: 0, y: 0 };
  closeContextMenu() { if (this.contextMenu.visible) this.contextMenu.visible = false; }

  openIllustrationMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (this.contextMenu.visible) { this.closeContextMenu(); return; }

    // Position menu below the hamburger button, aligned to its right edge
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 220;
    const x = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8);
    const y = rect.bottom + 4;
    this.contextMenu = { visible: true, x, y };
  }

  private autoSaveSubscription!: Subscription;
  private thumbnailSaveSubscription!: Subscription;
  private lastSavedJSON = '';
  private rasterStrokeSubscription?: Subscription;

  controlPanelActiveTool = '';
  shapeManager!: ShapeManager;
  worldManager!: WorldManager;
  authoringApi: SceneAuthoringAPI | null = null;
  isCommentPanelActive = false;

  selectedPenColor = '#9B59B6';
  secondaryPenColor = '#000000';
  selectedShapeColor = '#FFFFFF';
  selectedTextColor = '#FFFFFF';
  selectedHighlightColor = '#DAB6FC';
  selectedPattern = 'assets/patterns/leaves.svg';

  cursorSelected = true;
  panHandSelected = false;

  // ── Artboard overlay ────────────────────────────────────────
  artboardShadowStyle: Record<string, string> = {};
  artboardLabelStyle: Record<string, string> = {};
  artboardLabelText = '';
  private _artboardViewportSub: any = null;

  selectedStamp = 'assets/stamps/star.webp';
  selectedStampColor = '#FFFFFF';
  selectedStampSize = 0.10;

  stampPalette: string[] = [
    'assets/stamps/star.webp',
    'assets/stamps/heart.webp',
    'assets/stamps/check.webp',
    'assets/stamps/arrow.webp',
    'assets/stamps/circle.webp',
    'assets/stamps/x.webp',
    'assets/stamps/thumbs_up.webp',
    'assets/stamps/icecream/icecream_strawberry.webp'
  ];

  iceCreamStamps: string[] = [
    'assets/stamps/icecream/icecream_chocolate.webp',
    'assets/stamps/icecream/icecream_chocolate2.webp',
    'assets/stamps/icecream/icecream_matcha.webp',
    'assets/stamps/icecream/icecream_matcha2.webp',
    'assets/stamps/icecream/icecream_strawberry.webp',
    'assets/stamps/icecream/icecream_strawberry2.webp',
    'assets/stamps/icecream/icecream_vanilla.webp',
    'assets/stamps/icecream/icecream_vanilla2.webp'
  ];

  getRandomIceCreamStamp(): string {
    return this.iceCreamStamps[Math.floor(Math.random() * this.iceCreamStamps.length)];
  }
  setStamp(stamp: string) {
    if (stamp.startsWith('assets/stamps/icecream')) {
      const randomIceCream = this.getRandomIceCreamStamp();
      this.selectedStamp = randomIceCream;
      this.shapeManager.setStampTexture(randomIceCream);
      this.stampPalette[7] = this.selectedStamp;
    } else {
      this.selectedStamp = stamp;
      this.shapeManager.setStampTexture(stamp);
    }
  }
  setStampColor(color: string) { this.selectedStampColor = color; this.shapeManager.setStampColor(color); }
  setStampSize(size: number) { this.selectedStampSize = size; this.shapeManager.setStampSize(size); }

  strokeWidth = 2;
  selectedShapeType: ShapeType | null = null;
  activeShapeKind: 'circle' | 'square' | 'triangle' | 'polygon' = 'circle';

  selectShapeType(kind: 'circle' | 'square' | 'triangle' | 'polygon'): void {
    this.activeShapeKind = kind;
    this.setActiveTool('shape:' + kind);
  }

  // Background / Dot / Shape color pickers
  showBgColorPicker = false;
  bgColor = '#fff';
  bgHexInputDraft: string = this.bgColor.replace('#', '');

  showDotColorPicker = false;
  dotColor = '#fff';
  dotHexInputDraft: string = this.dotColor.replace('#', '');

  // Paper grain (global canvas paper material)
  paperGrainType: CanvasGrainType = 'none';
  paperGrainScale = 1.0;
  paperGrainStrength = 0.3;
  paperGrainOptions: CanvasGrainOption[] = CANVAS_GRAIN_OPTIONS;

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

  // 3D Ground Grid
  scene3dGridVisible = true;
  scene3dGridOpacity = 0.30;
  scene3dGridColor: [number, number, number] = [64/255, 64/255, 64/255];

  get scene3dGridColorHex(): string {
    const [r, g, b] = this.scene3dGridColor;
    return '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  // Canvas Grid
  canvasGridVisible = true;
  canvasGridCells = 64;
  canvasGridOpacity = 0.15;
  canvasGridColor: [number, number, number] = [128/255, 128/255, 128/255];

  get canvasGridColorHex(): string {
    const [r, g, b] = this.canvasGridColor;
    return '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  // Pixel codec / layer compression
  pixelFormat: string = 'png';
  webpSupported = false;
  readonly storageFormatOptions = [
    { id: 'raw',  label: 'Raw',  desc: 'Fastest saves, largest files' },
    { id: 'png',  label: 'PNG',  desc: 'Recommended — lossless, ~10–50× smaller' },
    { id: 'webp', label: 'WebP', desc: 'Smaller than PNG — browser-dependent' },
  ];

  showShapeColorPicker = false;
  shapeColor = '#fff';
  shapeHexInputDraft: string = 'ffffff';

  // SDF text props
  selectedSDFTextColor = '#FFFFFF';
  selectedSDFTextOutlineColor = '#000000';
  selectedSDFTextFontSize = 120;
  selectedSDFTextFont = 'Arial';
  selectedSDFTextThreshold = 0.485;
  selectedSDFTextSmoothing = 1;
  selectedSDFTextOutlineWidth = 0;

  showSDFTextColorPicker = false;
  showSDFTextOutlineColorPicker = false;
  sdfTextMaxWidth = 0; // 0 = no wrap (world units)

  // Arrowhead defaults for new lines
  arrowheadStart: ArrowheadStyle = 'none';
  arrowheadEnd: ArrowheadStyle = 'triangle';
  arrowheadSize = 6;
  arrowheadOptions = ARROWHEAD_OPTIONS;

  // Polygon tool
  defaultPolygonSides = 6;
  polygonPresets: string[] = [];

  onPolygonSidesChange(sides: number): void {
    this.defaultPolygonSides = +sides;
    (this.shapeManager as any).defaultPolygonSides = this.defaultPolygonSides;
  }

  placePresetPolygon(preset: string): void {
    this.shapeManager.createPresetPolygon?.(0, 0, 0.5, 0.5, preset as any, { r: 0, g: 0, b: 0, a: 1 }, 1);
  }

  loadPolygonPresets(): void {
    this.polygonPresets = (ShapeManager as any).PolygonPresets || [];
  }

  private readonly _polygonPresetLabels: Record<string, string> = {
    arrowRight: 'Arrow Right',
    speechBubble: 'Speech Bubble',
    star5: '5-Sided Star',
    star6: '6-Sided Star',
    parallelogram: 'Parallelogram',
    trapezoid: 'Trapezoid',
    chevron: 'Chevron',
    cross: 'Cross',
  };
  polygonPresetLabel(preset: string): string {
    return this._polygonPresetLabels[preset] ?? preset;
  }

  // Dither effect
  ditherConfig: DitherConfig = { ...DEFAULT_DITHER_CONFIG };
  ditherAlgorithmOptions = DITHER_ALGORITHM_OPTIONS;
  bayerLevelOptions = BAYER_LEVEL_OPTIONS;
  colorLevelOptions = COLOR_LEVEL_OPTIONS;
  halftoneShapeOptions = HALFTONE_SHAPE_OPTIONS;

  onDitherEnabledChange(enabled: boolean): void {
    this.ditherConfig.enabled = enabled;
    // Seed FG from the current pen color when enabling
    if (enabled && this.ditherConfig.colorMode === 'duotone') {
      const fgRgba = this.hexToRgba01(this.selectedPenColor || '#000000');
      fgRgba[3] = this.ditherConfig.foregroundColor[3];
      this.ditherConfig.foregroundColor = fgRgba;
      this.shapeManager.setDitherForegroundColor?.(fgRgba[0], fgRgba[1], fgRgba[2], fgRgba[3]);
    }
    this.shapeManager.setDitherEnabled?.(enabled);
    this._markStateDirty();
  }

  onDitherAlgorithmChange(algorithm: DitherAlgorithm): void {
    this.ditherConfig.algorithm = algorithm;
    this.shapeManager.setDitherAlgorithm?.(algorithm);
    this._markStateDirty();
  }

  onDitherColorLevelsChange(levels: number): void {
    this.ditherConfig.colorLevels = +levels;
    this.shapeManager.setDitherColorLevels?.(+levels);
    this._markStateDirty();
  }

  onDitherStrengthChange(strength: number): void {
    this.ditherConfig.strength = +strength;
    this.shapeManager.setDitherStrength?.(+strength / 100);
    this._markStateDirty();
  }

  onDitherPatternScaleChange(scale: number): void {
    this.ditherConfig.patternScale = +scale;
    this.shapeManager.setDitherPatternScale?.(+scale);
    this._markStateDirty();
  }

  onDitherPerChannelChange(perChannel: boolean): void {
    this.ditherConfig.perChannel = perChannel;
    this.shapeManager.setDitherPerChannel?.(perChannel);
    this._markStateDirty();
  }

  onDitherBayerLevelChange(level: number): void {
    this.ditherConfig.bayerLevel = +level;
    this.shapeManager.setDitherBayerLevel?.(+level);
    this._markStateDirty();
  }

  onDitherHalftoneAngleChange(angle: number): void {
    this.ditherConfig.halftoneAngle = +angle;
    this.shapeManager.setDitherHalftoneAngle?.(+angle);
    this._markStateDirty();
  }

  onDitherHalftoneFrequencyChange(freq: number): void {
    this.ditherConfig.halftoneFrequency = +freq;
    this.shapeManager.setDitherHalftoneFrequency?.(+freq);
    this._markStateDirty();
  }

  onDitherHalftoneShapeChange(algorithm: DitherAlgorithm): void {
    this.ditherConfig.algorithm = algorithm;
    this.shapeManager.setDitherAlgorithm?.(algorithm);
    this._markStateDirty();
  }

  get ditherStrengthPercent(): number {
    return Math.round(this.ditherConfig.strength * 100);
  }

  set ditherStrengthPercent(val: number) {
    this.ditherConfig.strength = val / 100;
    this.shapeManager.setDitherStrength?.(val / 100);
    this._markStateDirty();
  }

  // Dither color controls
  colorModeOptions = COLOR_MODE_OPTIONS;

  onDitherColorModeChange(mode: DitherColorMode): void {
    this.ditherConfig.colorMode = mode;
    // Seed duotone FG from the current pen color
    if (mode === 'duotone') {
      const fgRgba = this.hexToRgba01(this.selectedPenColor || '#000000');
      fgRgba[3] = this.ditherConfig.foregroundColor[3]; // preserve alpha
      this.ditherConfig.foregroundColor = fgRgba;
      this.shapeManager.setDitherForegroundColor?.(fgRgba[0], fgRgba[1], fgRgba[2], fgRgba[3]);
    }
    this.shapeManager.setDitherColorMode?.(mode);
    this._markStateDirty();
  }

  onDitherForegroundColorChange(hex: string): void {
    const c = this.hexToRgba01(hex);
    this.ditherConfig.foregroundColor = c;
    this.shapeManager.setDitherForegroundColor?.(c[0], c[1], c[2], c[3]);
    this._markStateDirty();
  }

  onDitherBackgroundColorChange(hex: string): void {
    const c = this.hexToRgba01(hex);
    this.ditherConfig.backgroundColor = c;
    this.shapeManager.setDitherBackgroundColor?.(c[0], c[1], c[2], c[3]);
    this._markStateDirty();
  }

  onDitherSwapColors(): void {
    const tmp = [...this.ditherConfig.foregroundColor] as [number, number, number, number];
    this.ditherConfig.foregroundColor = [...this.ditherConfig.backgroundColor] as [number, number, number, number];
    this.ditherConfig.backgroundColor = tmp;
    this.shapeManager.swapDitherColors?.();
    this._markStateDirty();
  }

  onDitherInvertPatternChange(invert: boolean): void {
    this.ditherConfig.invertPattern = invert;
    this.shapeManager.setDitherInvertPattern?.(invert);
    this._markStateDirty();
  }

  onDitherDuotoneBiasChange(value: number): void {
    this.ditherConfig.duotoneBias = +value / 100;
    this.shapeManager.setDitherDuotoneBias?.(+value / 100);
    this._markStateDirty();
  }

  onDitherTintOpacityChange(opacity: number): void {
    this.ditherConfig.tintOpacity = +opacity / 100;
    this.shapeManager.setDitherTintOpacity?.(+opacity / 100);
    this._markStateDirty();
  }

  get ditherTintPercent(): number {
    return Math.round(this.ditherConfig.tintOpacity * 100);
  }

  get ditherFgHex(): string {
    return this.rgba01ToHex(this.ditherConfig.foregroundColor);
  }

  get ditherBgHex(): string {
    return this.rgba01ToHex(this.ditherConfig.backgroundColor);
  }

  get ditherFgAlphaPercent(): number {
    return Math.round(this.ditherConfig.foregroundColor[3] * 100);
  }

  get ditherBgAlphaPercent(): number {
    return Math.round(this.ditherConfig.backgroundColor[3] * 100);
  }

  onDitherFgAlphaChange(alpha: number): void {
    this.ditherConfig.foregroundColor[3] = +alpha / 100;
    const c = this.ditherConfig.foregroundColor;
    this.shapeManager.setDitherForegroundColor?.(c[0], c[1], c[2], c[3]);
    this._markStateDirty();
  }

  onDitherBgAlphaChange(alpha: number): void {
    this.ditherConfig.backgroundColor[3] = +alpha / 100;
    const c = this.ditherConfig.backgroundColor;
    this.shapeManager.setDitherBackgroundColor?.(c[0], c[1], c[2], c[3]);
    this._markStateDirty();
  }

  // Per-layer dither
  layerDitherConfigs: Map<string, DitherConfig> = new Map();

  getLayerDitherEnabled(layerId: string): boolean {
    return this.layerDitherConfigs.get(layerId)?.enabled ?? false;
  }

  onLayerDitherEnabledChange(layerId: string, enabled: boolean): void {
    if (enabled) {
      if (!this.layerDitherConfigs.has(layerId)) {
        const cfg = { ...DEFAULT_DITHER_CONFIG, enabled: true };
        // Seed FG from pen color
        if (cfg.colorMode === 'duotone') {
          const fgRgba = this.hexToRgba01(this.selectedPenColor || '#000000');
          fgRgba[3] = cfg.foregroundColor[3];
          cfg.foregroundColor = fgRgba;
        }
        this.layerDitherConfigs.set(layerId, cfg);
      } else {
        const cfg = this.layerDitherConfigs.get(layerId)!;
        cfg.enabled = true;
        this.layerDitherConfigs.set(layerId, cfg);
      }
      this.shapeManager.setLayerDitherConfig?.(layerId, this.layerDitherConfigs.get(layerId)!);
    } else {
      if (this.layerDitherConfigs.has(layerId)) {
        const cfg = this.layerDitherConfigs.get(layerId)!;
        cfg.enabled = false;
        this.layerDitherConfigs.set(layerId, cfg);
      }
      this.shapeManager.setLayerDitherConfig?.(layerId, undefined);
    }
    this._markStateDirty();
  }

  getLayerDitherConfig(layerId: string): DitherConfig {
    return this.layerDitherConfigs.get(layerId) ?? { ...DEFAULT_DITHER_CONFIG };
  }

  updateLayerDitherField(layerId: string, field: keyof DitherConfig, value: any): void {
    const cfg = this.getLayerDitherConfig(layerId);
    (cfg as any)[field] = value;
    this.layerDitherConfigs.set(layerId, cfg);
    if (cfg.enabled) {
      this.shapeManager.setLayerDitherConfig?.(layerId, cfg);
    }
    this._markStateDirty();
  }

  onLayerDitherAlgorithmChange(layerId: string, algorithm: DitherAlgorithm): void {
    this.updateLayerDitherField(layerId, 'algorithm', algorithm);
  }

  onLayerDitherStrengthChange(layerId: string, strength: number): void {
    this.updateLayerDitherField(layerId, 'strength', +strength / 100);
  }

  onLayerDitherColorLevelsChange(layerId: string, levels: number): void {
    this.updateLayerDitherField(layerId, 'colorLevels', +levels);
  }

  onLayerDitherColorModeChange(layerId: string, mode: DitherColorMode): void {
    this.updateLayerDitherField(layerId, 'colorMode', mode);
    // Seed duotone FG from pen color
    if (mode === 'duotone') {
      const cfg = this.getLayerDitherConfig(layerId);
      const fgRgba = this.hexToRgba01(this.selectedPenColor || '#000000');
      fgRgba[3] = cfg.foregroundColor[3]; // preserve alpha
      this.updateLayerDitherField(layerId, 'foregroundColor', fgRgba);
    }
  }

  onLayerDitherFgChange(layerId: string, hex: string): void {
    this.updateLayerDitherField(layerId, 'foregroundColor', this.hexToRgba01(hex));
  }

  onLayerDitherBgChange(layerId: string, hex: string): void {
    this.updateLayerDitherField(layerId, 'backgroundColor', this.hexToRgba01(hex));
  }

  onLayerDitherFgAlphaChange(layerId: string, alpha: number): void {
    const cfg = this.getLayerDitherConfig(layerId);
    cfg.foregroundColor[3] = +alpha / 100;
    this.updateLayerDitherField(layerId, 'foregroundColor', [...cfg.foregroundColor]);
  }

  onLayerDitherBgAlphaChange(layerId: string, alpha: number): void {
    const cfg = this.getLayerDitherConfig(layerId);
    cfg.backgroundColor[3] = +alpha / 100;
    this.updateLayerDitherField(layerId, 'backgroundColor', [...cfg.backgroundColor]);
  }

  onLayerDitherSwapColors(layerId: string): void {
    const cfg = this.getLayerDitherConfig(layerId);
    const tmp = [...cfg.foregroundColor] as [number, number, number, number];
    cfg.foregroundColor = [...cfg.backgroundColor] as [number, number, number, number];
    cfg.backgroundColor = tmp;
    this.layerDitherConfigs.set(layerId, cfg);
    if (cfg.enabled) this.shapeManager.setLayerDitherConfig?.(layerId, cfg);
    this._markStateDirty();
  }

  /** Sync the UI-side layerDitherConfigs map from the engine's per-layer dither state. */
  private _syncLayerDitherConfigsFromEngine(): void {
    const sm = this.shapeManager as any;
    if (!sm?.getLayerDitherConfig) return;
    const layers = sm.getRasterLayers?.() ?? [];
    for (const layer of layers) {
      try {
        const raw = sm.getLayerDitherConfig(layer.id);
        if (raw && raw.enabled !== undefined) {
          this.layerDitherConfigs.set(layer.id, { ...raw });
        }
      } catch { /* API may not exist */ }
    }
  }

  onLayerDitherInvertChange(layerId: string, invert: boolean): void {
    this.updateLayerDitherField(layerId, 'invertPattern', invert);
  }

  onLayerDitherBiasChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'duotoneBias', +value / 100);
  }

  onLayerDitherTintChange(layerId: string, opacity: number): void {
    this.updateLayerDitherField(layerId, 'tintOpacity', +opacity / 100);
  }

  onLayerDitherScaleChange(layerId: string, scale: number): void {
    this.updateLayerDitherField(layerId, 'patternScale', +scale);
  }

  onLayerDitherPerChannelChange(layerId: string, perChannel: boolean): void {
    this.updateLayerDitherField(layerId, 'perChannel', perChannel);
  }

  onLayerDitherBayerLevelChange(layerId: string, level: number): void {
    this.updateLayerDitherField(layerId, 'bayerLevel', +level);
  }

  onLayerDitherHalftoneShapeChange(layerId: string, algorithm: DitherAlgorithm): void {
    this.updateLayerDitherField(layerId, 'algorithm', algorithm);
  }

  onLayerDitherHalftoneAngleChange(layerId: string, angle: number): void {
    this.updateLayerDitherField(layerId, 'halftoneAngle', +angle);
  }

  onLayerDitherHalftoneFrequencyChange(layerId: string, freq: number): void {
    this.updateLayerDitherField(layerId, 'halftoneFrequency', +freq);
  }

  onLayerDitherEdgeWidthChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'edgeWidth', +value);
  }

  onLayerDitherEdgeFadeChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'edgeFade', +value / 100);
  }

  onLayerDitherEdgeShrinkChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'edgeShrink', +value / 100);
  }

  onLayerDitherEdgeDensityChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'edgeDensity', +value / 100);
  }

  onLayerDitherEdgeSeedReroll(layerId: string): void {
    const current = (this.getLayerDitherConfig(layerId) as any)['edgeSeed'] ?? 0;
    this.updateLayerDitherField(layerId, 'edgeSeed', (current + 1) % 65536);
  }

  onLayerDitherEdgeModeChange(layerId: string, mode: 'content' | 'canvas' | 'both'): void {
    this.updateLayerDitherField(layerId, 'edgeMode', mode);
  }

  isGpuDitherAlgorithm(algorithm: DitherAlgorithm): boolean {
    return ['bayer', 'halftone_dot', 'halftone_line', 'halftone_diamond', 'blue_noise', 'noise'].includes(algorithm as string);
  }

  // Color helpers
  private hexToRgba01(hex: string): [number, number, number, number] {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return [r, g, b, 1];
  }

  rgba01ToHex(c: [number, number, number, number]): string {
    const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
    return '#' + toHex(c[0]) + toHex(c[1]) + toHex(c[2]);
  }

  mathRound(v: number): number { return Math.round(v); }

  // ═══════════════════════════════════════════════════════════
  //  Frame Link Animation — per-layer procedural displacement
  // ═══════════════════════════════════════════════════════════

  frameLinkTypeOptions = FRAME_LINK_TYPE_OPTIONS;
  frameLinkLoopModeOptions = FRAME_LINK_LOOP_MODE_OPTIONS;
  private layerFrameLinkConfigs = new Map<string, FrameLinkAnimation>();

  getLayerFrameLinkConfig(layerId: string): FrameLinkAnimation {
    if (!this.layerFrameLinkConfigs.has(layerId)) {
      // Try reading from engine first
      const sm = this.shapeManager as any;
      const existing = sm?.getLayerFrameLinkAnimation?.(layerId);
      this.layerFrameLinkConfigs.set(layerId, existing ? { ...existing } : { ...DEFAULT_FRAME_LINK_ANIMATION });
    }
    return this.layerFrameLinkConfigs.get(layerId)!;
  }

  private updateFrameLinkField<K extends keyof FrameLinkAnimation>(layerId: string, field: K, value: FrameLinkAnimation[K]): void {
    const cfg = this.getLayerFrameLinkConfig(layerId);
    (cfg as any)[field] = value;
    this.layerFrameLinkConfigs.set(layerId, cfg);
    this._markStateDirty();
    if (cfg.enabled) {
      (this.shapeManager as any)?.setLayerFrameLinkAnimation?.(layerId, cfg);
    }
  }

  onFrameLinkEnabledChange(layerId: string, enabled: boolean): void {
    const cfg = this.getLayerFrameLinkConfig(layerId);
    cfg.enabled = enabled;
    this.layerFrameLinkConfigs.set(layerId, cfg);
    const sm = this.shapeManager as any;
    if (enabled) {
      sm?.setLayerFrameLinkAnimation?.(layerId, cfg);
      // Auto-enable animation mode so the user sees the effect immediately
      if (!this.animationEnabled) {
        this.toggleAnimationMode();
      }
    } else {
      sm?.setLayerFrameLinkAnimation?.(layerId, undefined);
    }
    this._markStateDirty();
  }

  onFrameLinkTypeChange(layerId: string, type: FrameLinkAnimationType): void {
    this.updateFrameLinkField(layerId, 'type', type);
  }

  onFrameLinkAmplitudeChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'amplitude', +v);
  }

  onFrameLinkFrequencyChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'frequency', +v);
  }

  onFrameLinkSpeedChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'speed', +v / 100);
  }

  onFrameLinkDirectionChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'direction', +v);
  }

  onFrameLinkPhaseChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'phase', +v / 100);
  }

  onFrameLinkLoopModeChange(layerId: string, mode: FrameLinkLoopMode): void {
    this.updateFrameLinkField(layerId, 'loopMode', mode);
  }

  onFrameLinkDisplaceXChange(layerId: string, v: boolean): void {
    this.updateFrameLinkField(layerId, 'displaceX', v);
  }

  onFrameLinkDisplaceYChange(layerId: string, v: boolean): void {
    this.updateFrameLinkField(layerId, 'displaceY', v);
  }

  onFrameLinkRippleCenterXChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'rippleCenterX', +v / 100);
  }

  onFrameLinkRippleCenterYChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'rippleCenterY', +v / 100);
  }

  onFrameLinkOctavesChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'noiseOctaves', +v);
  }

  onFrameLinkLacunarityChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'noiseLacunarity', +v / 10);
  }

  onFrameLinkPersistenceChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'noisePersistence', +v / 100);
  }

  onFrameLinkSeedChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'shakeSeed', +v);
  }

  // ═══════════════════════════════════════════════════════════
  //  Image Import — file picker, clipboard paste, drag-and-drop
  // ═══════════════════════════════════════════════════════════

  /** Triggered from Edit menu → Import Image as Layer */
  importImageAsNewLayer(): void {
    this.imageFileInput?.nativeElement?.click();
  }

  /** Triggered from Edit menu → Import Image to Layer */
  importImageToCurrentLayer(): void {
    this.imageFileInputLayer?.nativeElement?.click();
  }

  /** Hidden <input type="file"> change → import as new layer */
  async onImageFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const sm = this.shapeManager as any;
    const layerId = await sm.importImageAsNewLayer?.(file, file.name.replace(/\.[^.]+$/, ''));
    if (layerId) {
      this.selectRasterLayer(layerId);
      this.refreshRasterLayers();
    }
    // Reset so re-selecting the same file still triggers change
    (event.target as HTMLInputElement).value = '';
  }

  /** Hidden <input type="file"> change → import into current layer */
  async onImageFileSelectedToLayer(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const sm = this.shapeManager as any;
    await sm.importImageToCurrentLayer?.(file);
    (event.target as HTMLInputElement).value = '';
  }

  /** Paste event handler — imports clipboard image into current layer */
  handlePasteImage(e: ClipboardEvent): void {
    // Don't intercept paste when typing in an input
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((this.shapeManager as any).isInputActive?.()) return;

    const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
    if (!item) return;

    const file = item.getAsFile();
    if (!file) return;

    e.preventDefault();
    (this.shapeManager as any).importImageToCurrentLayer?.(file);
  }

  /** Paste image from clipboard — triggered from Edit menu */
  async pasteImageFromClipboard(): Promise<void> {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          await (this.shapeManager as any).importImageToCurrentLayer?.(blob);
          return;
        }
      }
    } catch (err) {
      console.warn('[ImageImport] Clipboard read failed:', err);
    }
  }

  /** Canvas dragover — allow drop */
  onCanvasDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.some(t => t === 'Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  /** Canvas drop — import 3D models (.glb/.gltf/.obj) or images when appropriate */
  async onCanvasDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);

    if (this.scene3dPanelVisible) {
      const modelFile = files.find(f => /\.(glb|gltf|obj)$/i.test(f.name));
      if (modelFile) {
        await this.scene3dImportModelFile(modelFile);
        return;
      }
    }

    // image → new raster layer
    const imageFile = files.find(f => f.type.startsWith('image/'));
    if (!imageFile) return;
    const sm = this.shapeManager as any;
    const layerId = await sm.importImageAsNewLayer?.(imageFile, imageFile.name.replace(/\.[^.]+$/, ''));
    if (layerId) {
      this.selectRasterLayer(layerId);
      this.refreshRasterLayers();
    }
  }

  private async scene3dImportModelFile(file: File): Promise<void> {
    const sm = this.shapeManager as any;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'glb' || ext === 'gltf') {
      const meshes: any[] = await sm.importGltfFile3D?.(0, 0, 0, file) ?? [];
      if (meshes.length) {
        this._instanceGroupRegister(crypto.randomUUID(), meshes.map((m: any) => m.id ?? m.nodeId));
        this._scene3dAutoScale(meshes);
        this.scene3dRefreshMeshes();
        this.scene3dSelectMesh(meshes[0].id ?? meshes[0].nodeId);
        this.scene3dMarkTexLibDirty(); // GLTF may embed textures into the library
      }
    } else if (ext === 'obj') {
      const mesh = await sm.importObjFile3D?.(0, 0, 0, file);
      if (mesh) {
        this._instanceGroupRegister(crypto.randomUUID(), [mesh.id ?? mesh.nodeId]);
        this._scene3dAutoScale([mesh]);
        this.scene3dRefreshMeshes();
        this.scene3dSelectMesh(mesh.id ?? mesh.nodeId);
        this.scene3dMarkTexLibDirty();
      }
    }
  }

  /** Auto-scale imported meshes if they are tiny relative to the canvas (GLTF uses metres, canvas uses pixels). */
  private _scene3dAutoScale(meshes: any[]): void {
    if (!meshes.length) return;
    const sm = this.shapeManager as any;
    const canvasSize = this.canvas?.width ?? 800;
    for (const mesh of meshes) {
      const bbox = mesh.calculateBoundingBox?.() ?? mesh.boundingBox;
      if (!bbox) continue;
      const modelSize = Math.max(bbox.width ?? 0, bbox.height ?? 0, bbox.depth ?? 0, 0.001);
      if (modelSize < canvasSize * 0.05) {
        const scale = (canvasSize * 0.3) / modelSize;
        sm.scene3d?.setScale?.(mesh.id ?? mesh.nodeId, scale, scale, scale);
      }
    }
  }

  // Raster text tool
  rasterTextState: RasterTextState | null = null;
  rasterTextFont = 'Arial';
  rasterTextFontSize = 32;
  rasterTextBold = false;
  rasterTextItalic = false;
  rasterTextAlign: 'left' | 'center' | 'right' = 'left';
  rasterTextColor = '#ffffff';
  private _rasterTextSub: { unsubscribe(): void } | null = null;

  availableFonts = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Comic Sans MS'];

  // ── Speech Balloon tool ────────────────────────────────────
  balloonStyleOptions = BALLOON_STYLE_OPTIONS;
  balloonStyle: BalloonStyle = DEFAULT_BALLOON_OPTIONS.style;
  balloonWritingMode: WritingMode = DEFAULT_BALLOON_OPTIONS.writingMode;
  balloonTailSide: TailSide = DEFAULT_BALLOON_OPTIONS.tailSide;
  balloonTailPosition: number = DEFAULT_BALLOON_OPTIONS.tailPosition;
  balloonShowTail: boolean = DEFAULT_BALLOON_OPTIONS.showTail;
  balloonFontFamily: string = DEFAULT_BALLOON_OPTIONS.fontFamily;
  balloonFontSize: number = DEFAULT_BALLOON_OPTIONS.fontSize;
  balloonMaxWidth: number = DEFAULT_BALLOON_OPTIONS.maxWidth;
  balloonTextColor: string = '#000000';
  balloonFillColor: string = '#ffffff';
  balloonStrokeColor: string = '#000000';

  // ── Text Effects ───────────────────────────────────────────
  textEffectTypeOptions = TEXT_EFFECT_TYPE_OPTIONS;
  textEffectPresets = TEXT_EFFECT_PRESETS;
  textEffectChain: TextEffectEntry[] = [];
  textEffectText: string = 'KABOOM!';
  textEffectFont: string = 'Impact';
  textEffectFontSize: number = 96;
  textEffectBold: boolean = true;
  textEffectItalic: boolean = false;
  textEffectColor: string = '#ffffff';
  textEffectPadding: number = 24;
  textEffectAnimating: boolean = false;
  private _textEffectAnimFrame: number | null = null;

  // ── Live Text tool ─────────────────────────────────────────
  liveTextNodeId: string | null = null;
  liveTextText: string = '';
  liveTextFont: string = 'Arial';
  liveTextFontSize: number = 48;
  liveTextBold: boolean = false;
  liveTextItalic: boolean = false;
  liveTextWritingMode: 'horizontal-tb' | 'vertical-rl' = 'horizontal-tb';
  liveTextColor: string = '#ffffff';
  liveTextMaxWidth: number = 0;
  liveTextPadding: number = 16;
  liveTextArcAngle: number = 0;
  liveTextEffectChain: TextEffectEntry[] = [];
  liveTextIsEditing: boolean = false;
  liveTextAlign: 'left' | 'center' | 'right' = 'left';
  liveTextBgColor: string = '#ffffff';
  liveTextBgAlpha: number = 0;
  hasHtmlInCanvas: boolean = false;

  // ── Custom Shader ──────────────────────────────────────────
  shaderSnippets = SHADER_SNIPPETS;
  customShaderCode: string = '';
  customShaderAdvanced: boolean = false;
  customShaderStatus: string = '';
  customShaderStatusType: 'success' | 'error' | '' = '';
  customShaderParamA: number = 0;
  customShaderParamB: number = 0;
  customShaderParamC: number = 0;
  customShaderParamD: number = 0;
  customShaderParamCount: number = 1;

  // ── Balloon presets ────────────────────────────────────────
  balloonPresets = BALLOON_PRESETS;
  balloonStrokeWidth: number = 2;
  balloonTailLength: number = 0.15;

  // ── Panel Layout tool ──────────────────────────────────────
  panelTemplateOptions = PANEL_TEMPLATE_OPTIONS;
  pageSizePresets = PAGE_SIZE_PRESETS;
  panelTemplate: PanelTemplate = DEFAULT_PANEL_LAYOUT_OPTIONS.template;
  panelPageSizeIndex: number = 0; // index into PAGE_SIZE_PRESETS
  panelGutterWidth: number = DEFAULT_PANEL_LAYOUT_OPTIONS.gutterWidth;
  panelBleedMargin: number = DEFAULT_PANEL_LAYOUT_OPTIONS.bleedMargin;
  panelBorderWidth: number = DEFAULT_PANEL_LAYOUT_OPTIONS.borderWidth;
  panelBorderColor: string = '#000000';
  panelBackgroundColor: string = '#ffffff';
  panelShowBleedGuides: boolean = DEFAULT_PANEL_LAYOUT_OPTIONS.showBleedGuides;
  panelShowGutterGuides: boolean = DEFAULT_PANEL_LAYOUT_OPTIONS.showGutterGuides;
  activePanelLayoutId: string | null = null;
  bleedGuideRect: { x: number; y: number; w: number; h: number } | null = null;
  gutterGuideLines: { horizontal: number[]; vertical: number[] } | null = null;

  getBackgroundColor() { this.bgColor = this.shapeManager.getBackgroundColor(); this.bgHexInputDraft = this.bgColor; }
  getDotColor() { this.dotColor = this.shapeManager.getDotColor(); this.dotHexInputDraft = this.dotColor; }

  // ── Paper grain ────────────────────────────────────────────
  onPaperGrainTypeChange(type: CanvasGrainType): void {
    this.paperGrainType = type;
    this._applyPaperGrain();
  }
  onPaperGrainScaleChange(v: number): void {
    this.paperGrainScale = +v;
    this._applyPaperGrain();
  }
  onPaperGrainStrengthChange(v: number): void {
    this.paperGrainStrength = +v;
    this._applyPaperGrain();
  }
  private _applyPaperGrain(): void {
    this.rasterBrushService.setPaperGrain({
      type: this.paperGrainType,
      scale: this.paperGrainScale,
      strength: this.paperGrainStrength,
    });
    this._markStateDirty();
  }
  syncPaperGrain(): void {
    const grain = this.rasterBrushService.getPaperGrain();
    if (grain) {
      this.paperGrainType = (grain.type as CanvasGrainType) ?? 'none';
      this.paperGrainScale = grain.scale ?? 1.0;
      this.paperGrainStrength = grain.strength ?? 0.3;
    }
  }

  // ── Pixel codec / layer compression ───────────────────────
  async _initPixelFormat(): Promise<void> {
    const sm = this.shapeManager as any;
    if (!sm?.getPixelFormat) return;
    this.pixelFormat = sm.getPixelFormat() ?? 'png';
    this.webpSupported = await sm.isPixelFormatSupported?.('webp') ?? false;
  }

  onPixelFormatChange(fmt: string): void {
    this.pixelFormat = fmt;
    (this.shapeManager as any).setPixelFormat?.(fmt);
  }

  // ── SDF Text max width ─────────────────────────────────────
  onSdfTextMaxWidthChange(v: number): void {
    this.sdfTextMaxWidth = +v;
    this.shapeManager.setSDFTextMaxWidth?.(this.sdfTextMaxWidth);
  }

  // ══════════════════════════════════════════════════════════
  //  3D Scene
  // ══════════════════════════════════════════════════════════

  /** Whether a 3D scene exists in the layer stack */
  get has3DScene(): boolean {
    return this.rasterLayers.some((l: any) => l.type === '3d-scene' || l.type === '3d-divider');
  }

  /** Whether the 3D scene entry is currently selected in the layer panel */
  scene3dPanelVisible = false;
  authoringPanelOpen = false;

  /** Right-panel tab: 'scene' = layers + outliner/mesh, 'global' = global scene settings, 'ui' = UI system */
  rightPanelTab: 'scene' | 'global' | 'ui' = 'scene';

  // Rotation drag readout
  scene3dDragAngleDeg: number | null = null;
  scene3dDragLabelPos: { x: number; y: number } | null = null;
  private _scene3dGizmoRafId: number | null = null;

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
  scene3dCameraMode: 'perspective' | 'orthographic' = 'perspective';
  scene3dIllustrationProjection: 'perspective' | 'orthographic' = 'orthographic';
  scene3dFOV = 60;

  // View mode: target × cameraMode (driven by engine events — see applyViewUI3D)
  scene3dViewTarget: 'illustration' | 'scene' = 'illustration';
  scene3dViewCameraMode: 'ortho2D' | 'perspective2D' | 'free3D' = 'ortho2D';
  scene3d2DPanelsActive = true;
  scene3dViewFly = false;
  scene3dViewIsPlaying = false;
  scene3dViewArtboardFrame = true;
  scene3dPlayCameraMode: 'first' | 'third' = 'first';
  scene3dPlayerObjectId: string | null = null;
  scene3dSkyPresets: string[] = [];
  scene3dActiveSkyPreset: string | null = null;
  scene3dDiffuseIBL = 1.0;
  scene3dSpecularIBL = 1.0;
  scene3dSSREnabled = false;
  scene3dSSRIntensity = 1.0;
  scene3dSSRFillBlur = 2.0;
  scene3dSSRThickness = 2.0;
  scene3dSSRReach = 12.8;
  scene3dSSRShadow = 0.35;

  // Cinematic cameras
  scene3dCameraNodes: { id: string; name: string }[] = [];
  scene3dLookThroughId: string | null = null;
  scene3dCameraCuts: { cameraId: string; frame: number }[] = [];
  scene3dCutPreviewOn = false;

  // CD Jewel-Case Designer
  cdDesignerActive = false;
  cdKitRootId: string | null = null;
  cdActiveComponent = 'complete';
  cdScrub = 0;
  cdTrayCardFold = 0;
  cdTrayClear = false;

  // ── UI System ────────────────────────────────────────────
  uiLayers: { id: string; name: string }[] = [];
  uiActiveLayerId: string | null = null;
  uiPreviewOn = false;
  uiCurrentStateId: string | null = null;
  uiActiveMachine: any | null = null;
  uiActiveShapeInteractions: Record<string, any> = {};
  uiSelectedStateId: string | null = null;
  uiSelectedTransitionId: string | null = null;
  uiAddingState = false;
  uiNewStateName = '';
  uiAddingVar = false;
  uiNewVarName = '';
  uiNewVarType = 'boolean';
  uiSelectedShapeId: string | null = null;
  uiSoundList: { assetId: string }[] = [];
  private _uiEventOff: (() => void) | null = null;
  private _uiSelectionOff: (() => void) | null = null;
  private _pathEditedOff: (() => void) | null = null;
  isPathEditActive = false;
  private _uiTickRafId: number | null = null;
  private _uiTickLast = 0;

  // Phase 4: shadows
  scene3dShadowsEnabled = false;
  scene3dShadowMapSize = 1024;
  scene3dShadowExtent = 15;
  scene3dShadowBias = 0.002;
  scene3dShadowStrength = 0.58;

  // Phase 4: performance/debug
  scene3dFrustumCulling = true;

  // Phase 4: 3D animation panel state
  scene3dAnimSyncWithTimeline = true;
  scene3dAnimStartFrame = 0;
  scene3dAnimEndFrame = 120;
  scene3dAnimFps = 24;
  scene3dAnimLoop = true;

  // Frame-link animation (procedural per-mesh animation)
  scene3dFrameLinkEnabled = false;
  scene3dFrameLinkType: 'bounce' | 'sway' | 'spin' | 'pulse' | 'shake' | 'scroll' = 'bounce';
  scene3dFrameLinkAxis: 'x' | 'y' | 'z' = 'y';
  scene3dFrameLinkAmplitude = 0.15;
  scene3dFrameLinkFramesPerCycle = 24;
  scene3dFrameLinkPhase = 0;
  scene3dFrameLinkStagger = 0;
  scene3dSelectedIsGroup = false;
  scene3dSelectedMeshType = '';
  cityBuilding = false;
  cityBuildReason: 'load' | 'edit' = 'load';
  private _cityBuildSub: { unsubscribe(): void } | null = null;
  // Bucket state — persisted per group ID in the illustration save
  scene3dAllGroupBuckets: Record<string, string[][]> = {};
  scene3dBucketSelections: string[] = []; // per-bucket dropdown selection (transient)

  // ── Vector / Ephemera state ────────────────────────────────
  activeVectorLayerId: string | null = null;
  showEphemeraPanel = false;
  vectorShapes: { id: string; name: string; type: string; parentId?: string; visible: boolean }[] = [];

  onVectorLayerSelected(id: string | null): void {
    this.activeVectorLayerId = id;
    (this.shapeManager as any)?.setActiveVectorLayer?.(id);
    if (!id) {
      this.showEphemeraPanel = false;
      this.vectorShapes = [];
    } else {
      // Deactivate 2D brush/drawing tools — they don't apply to vector layers
      const t = this.controlPanelActiveTool;
      if (t.startsWith('drawing:') || t.startsWith('raster:') || t === 'fill') {
        this.setActiveTool('');
      }
      this.refreshVectorShapes();
    }
  }

  showSVGImport = false;
  svgImportD = '';
  svgImportWidth = 0.5;

  refreshVectorShapes(): void {
    this.vectorShapes = (this.shapeManager as any)?.getVectorShapes?.(this.activeVectorLayerId) ?? [];
  }

  selectVectorShape(id: string, e: MouseEvent): void {
    e.stopPropagation();
    (this.shapeManager as any)?.selectNodesByIds?.([id], e.shiftKey);
  }

  enterPathEdit(id: string): void {
    (this.shapeManager as any)?.enterPathEdit?.(id);
  }

  convertPolygonToPath(id: string): void {
    (this.shapeManager as any)?.convertPolygonToPath?.(id);
    this.refreshVectorShapes();
  }

  vectorAlign(dir: 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom'): void {
    (this.shapeManager as any)?.alignSelectedShapes?.(dir);
  }

  vectorDistribute(axis: 'x' | 'y'): void {
    (this.shapeManager as any)?.distributeSelectedShapes?.(axis);
  }

  vectorFlip(axis: 'horizontal' | 'vertical'): void {
    (this.shapeManager as any)?.flipSelectedShapes?.(axis);
  }

  importSVGPath(): void {
    const d = this.svgImportD.trim();
    if (!d) return;
    (this.shapeManager as any)?.importSVGPath?.(d, { width: this.svgImportWidth });
    this.svgImportD = '';
    this.showSVGImport = false;
    this.refreshVectorShapes();
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
    this.scene3dDeactivateArrayTool();
    this.scene3dGizmoMode = null;
    const sm = this.shapeManager as any;
    sm.scene3d?.setGizmoMode?.(null);
    sm.setGizmoMode3D?.(null);
  }

  closeArmaturePanel(): void {
    this.scene3dArmaturePanelOpen = false;
    this._armatureCleanup();
  }

  private _armatureCleanup(): void {
    const sm = this.shapeManager as any;
    sm.exitBonePlacementMode3D?.();
    sm.showBoneOverlay3D?.(null);
    sm.selectJoint3D?.(null);
    sm.setArmatureBgMode3D?.({ mode: 'none' });
  }

  /** True while any exclusive 3D sub-mode is active. */
  get scene3dInSubMode(): boolean {
    return this.scene3dIsEditingMesh
      || this.scene3dArmaturePanelOpen
      || this.gpPanelVisible
      || this.uvEditorOpen
      || this.scene3dClothingPaintActive !== null
      || this.scene3dWorldPanelOpen;
  }

  private _exitAllScene3dModes(): void {
    if (this.scene3dIsEditingMesh) this.exitMeshEditMode();
    if (this.scene3dArmaturePanelOpen) { this.scene3dArmaturePanelOpen = false; this._armatureCleanup(); }
    if (this.gpPanelVisible) this.closeGpPanel();
    if (this.uvEditorOpen) this.closeUVEditor();
    if (this.scene3dClothingPaintActive) this.scene3dToggleClothingPaint(this.scene3dClothingPaintActive);
    if (this.scene3dEditCharPanelOpen) { this.scene3dEditCharPanelOpen = false; }
    if (this.scene3dGizmoMode !== null) {
      this.scene3dGizmoMode = null;
      (this.shapeManager as any).setGizmoMode3D?.(null);
    }
    if (this.scene3dArrayToolActive) { this.scene3dDeactivateArrayTool(); }
    if (this.scene3dWorldPanelOpen) { this.scene3dWorldPanelOpen = false; }
    if (this.scene3dPkgCreatorOpen) {
      this.scene3dPkgCreatorOpen = false;
      this.pkgLayerStack = [];
      (this.shapeManager as any).packaging?.exitCreatorMode();
      this._pkgDielinePane = null;
      if (this._pkgFoldRaf != null) { cancelAnimationFrame(this._pkgFoldRaf); this._pkgFoldRaf = undefined; }
    }
  }

  // ── Mesh Edit state ────────────────────────────────────────
  scene3dIsEditingMesh = false;
  scene3dEditTool: 'select' | 'knife' = 'select';
  private _knifeStart: { x: number; y: number } | null = null;

  // ── Array Tool (Repeat) ─────────────────────────────────────
  scene3dArrayToolActive = false;
  scene3dArrayToolMode: 'line' | 'grid' | 'radial' = 'line';
  scene3dArrayToolCount = 3;
  scene3dArrayToolRadius: number | null = null;
  scene3dArrayToolArc = 360;
  scene3dArrayToolAxis: 'x' | 'y' | 'z' = 'y';
  // Array Group panel state
  scene3dIsArrayGroup = false;
  scene3dArrayMode: 'linear' | 'grid' | 'radial' = 'linear';
  scene3dArrayCountX = 3;
  scene3dArraySpacingX = 2.0;
  scene3dArrayAxisX: 'x' | 'y' | 'z' = 'x';
  scene3dArrayCountY = 3;
  scene3dArraySpacingY = 2.0;
  scene3dArrayAxisY: 'x' | 'y' | 'z' = 'z';
  scene3dArrayRadialCount = 6;
  scene3dArrayRadius = 3.0;
  scene3dArrayArc = 360;
  scene3dArrayRadialAxis: 'x' | 'y' | 'z' = 'y';
  // Phase 5: linked arrays badge (shown on source mesh)
  scene3dLinkedArrayCount = 0;
  // Phase 5: per-instance overrides (array group panel)
  scene3dInstanceOverrides: Array<{index: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number; visible: boolean}> = [];
  scene3dOverridesPanelOpen = false;
  scene3dNewOverrideIdx = 0;

  // ── Package Creator ─────────────────────────────────────────────────────────
  scene3dPkgCreatorOpen = false;
  pkgCreatorId: string | null = null;
  pkgStyle = 'simpleBox';
  pkgWidth  = 80;
  pkgHeight = 60;
  pkgDepth  = 40;
  pkgBleed  = 3;
  pkgFoldAmount = 0;
  // Style-specific params
  pkgTuckStyle: 'reverse' | 'straight' = 'reverse';
  pkgLockTabs = true;
  pkgRestOpenAmount = 0;
  pkgLidDepth = 0;        // 0 = Salsa default (full telescope)
  pkgBoardThickness = 2;
  pkgBoardPreset: 'white' | 'kraft' = 'white';
  pkgStageMode = 'gradient';
  private _pkgDimDebounce: any = null;
  private _pkgFoldRaf?: number;
  // Selection-driven package mode
  scene3dSelectedIsPackage = false;
  pkgSelectedId: string | null = null;
  // Selection-driven particle emitter panel
  selectedParticleEmitterId: string | null = null;
  // Dieline pane handle (from attachDielinePane) — LIVE handle, re-use on resize/setDimensions
  private _pkgDielinePane: any = null;
  pkgGuideTypes = new Set<string>(['cut', 'fold', 'bleed', 'panel', 'slit']);
  pkgLayerStack: Array<{layerId: string; name: string; visible: boolean; opacity: number; active: boolean; kind: 'raster' | 'vector'}> = [];

  // ── World / City Tool ──────────────────────────────────────────────────────
  scene3dWorldPanelOpen = false;
  scene3dCityContainerId: string | null = null;
  worldMode: 'diorama' | 'tiled' = 'diorama';
  worldTileRadius = 0;
  worldTileDetail: 'flat' | 'focus' | 'full' = 'focus';
  worldStreamFollow = false;
  worldStreamStats = '';
  worldBorder: 'circle' | 'square' | 'hexagon' | 'octagon' = 'square';
  worldPattern: 'radial' | 'grid' = 'grid';
  worldSeed = 3;
  worldRadius = 10;
  worldSpokeCount = 8;
  worldRingCount = 4;
  worldGridCols = 11;
  worldGridRows = 11;
  worldLotsRadial = 2;
  worldLotsAngular = 3;
  worldStreetWidth = 0.40;
  worldPlazaRadius = 0.09;
  worldParkChance = 0.12;
  worldWaterChance = 0.06;
  worldHasWorld = false;
  worldEnabledRegions: number[] | null = null;  // null = all enabled
  worldRegions: Array<{ id: number; type: string }> = [];
  worldLandmarks = true;
  worldShotengai = false;
  worldAwnings = true;
  worldStreetFurniture = true;
  worldPowerLines = true;
  worldParkedCars = true;
  worldNightMode = false;
  worldStreetTrees = true;
  worldBicycles = true;
  worldLanterns = true;
  worldRailway = true;
  worldRooftops = true;
  worldFacadeDetail = true;
  worldDetailedBuildings = true;
  worldPedestrians = true;
  worldPedestrianDensity = 1;
  worldFog = true;
  worldClouds = true;
  worldCloudDensity = 0.55;
  worldHolograms = false;
  worldVoidGrid = true;
  worldBorderGlow = true;
  worldTerrainApron = false;
  worldVoidExtent = 2.0;
  worldVoidLineWidth = 0.05;
  worldBorderGlowHeight = 1.2;
  worldWarp = 0.35;
  worldPalette: 'auto' | 'terracotta' | 'slate' | 'pastel' | 'brick' | 'mint' = 'auto';
  worldLeafColor = '#ffffff';
  worldLeafColorVar = 0.08;
  // Live controls (no regen)
  worldTimeOfDay: number | null = null;
  worldDayCyclePlaying = false;
  worldDayCycleSec = 120;
  worldRenderStyle: string | null = null;
  worldTrafficRunning = true;
  worldTurntableOn = false;
  worldWeather: 'clear' | 'rain' | 'snow' = 'clear';
  worldCinematicGrade = true;
  worldOverrideGlobalLighting = true;
  worldGradePhase: 'night' | 'dawn' | 'noon' | 'dusk' = 'noon';
  worldGradeKeys: Record<string, Record<string, number>> = {
    night: { bloomIntensity: 1.35, vignette: 0.35 },
    dawn:  { bloomIntensity: 0.8,  vignette: 0.2  },
    noon:  { bloomIntensity: 0.6,  vignette: 0.15 },
    dusk:  { bloomIntensity: 1.1,  vignette: 0.25 },
  };
  worldJunctionVariety = 0.3;
  worldElevation = 0.45;
  worldTerraces = true;
  worldSidewalks = true;
  worldRoadPaint = true;
  worldStreetLights = true;
  worldTrafficLights = true;
  worldCornerStyle: 'sharp' | 'chamfer' | 'round' | 'mixed' = 'mixed';
  worldRoofStyle: 'flat' | 'pointed' | 'parapet' | 'chamfer' | 'rounded' | 'helipad' | 'tower' | 'spire' | 'mansard' | 'mixed' = 'mixed';
  worldSignage = false;
  private _worldDebounce: any = null;
  private _streamStatsTimer: any = null;
  private _gizmoPosTimer: any = null;
  private _worldMeshIdsKey = '';
  // Object offset and merge-bake options (linear arrays only)
  scene3dArrayObjectOffsetId = '';
  scene3dArrayGapFill = false;
  scene3dArrayWeldThreshold = 0.001;

  enterMeshEditMode(): void {
    if (!this.scene3dSelectedMeshId) return;
    this._exitAllScene3dModes();
    const sm = this.shapeManager as any;
    const canvas = this.canvasRef?.nativeElement;
    sm.enterMeshEditMode3D?.(this.scene3dSelectedMeshId);
    this.scene3dIsEditingMesh = true;
    if (canvas) {
      sm.attachMeshEditPointerHandlers?.(
        canvas,
        this.scene3dSelectedMeshId,
        () => this.ngZone.run(() => { /* trigger change detection so panel re-reads selection */ }),
      );
    }
  }

  exitMeshEditMode(): void {
    const sm = this.shapeManager as any;
    sm.detachMeshEditPointerHandlers?.();
    sm.exitMeshEditMode3D?.();
    this.scene3dIsEditingMesh = false;
    this.scene3dEditTool = 'select';
    this._knifeStart = null;
    this._clearKnifePreview();
  }

  // ── Instance groups (UV texture sharing) ───────────────────────
  // groupId → Set<meshId>; rebuilt each session from import/duplicate history
  private _instanceGroups = new Map<string, Set<string>>();
  // meshId → groupId (reverse lookup)
  private _meshGroupId = new Map<string, string>();

  private _instanceGroupRegister(groupId: string, meshIds: string[]): void {
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

  // ── UV Editor ──────────────────────────────────────────────────
  uvEditorOpen = false;
  private _uvSession: any = null;
  private _uvRenderer: any = null;
  private _uvHandlersBound = false;
  uvPaintMode = false;
  showUVPane  = false;
  uvLayers: Array<{id: string; name: string}> = [];
  // Stamp tool (Mode B decals — bake into mesh texture while in UV Paint)
  uvStampActive = false;
  uvStampSize   = 0.25;
  uvStampRotationRad = 0;

  get uvRendererRef(): any { return this._uvRenderer; }

  get uvSession(): any { return this._uvSession; }

  openUVEditor(): void {
    if (!this.scene3dSelectedMeshId) return;
    this._exitAllScene3dModes();
    const sm = this.shapeManager as any;
    // openUVEditor3D handles orbit setup internally — no enterMeshEditMode3D needed
    this._uvSession = sm.openUVEditor3D?.(this.scene3dSelectedMeshId);
    if (!this._uvSession) return;
    this.uvEditorOpen = true;
    setTimeout(() => {
      const uvCanvas = this.uvCanvasRef?.nativeElement;
      if (!uvCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      uvCanvas.width  = Math.round((window.innerWidth * 0.5 - 280) * dpr);
      uvCanvas.height = Math.round(window.innerHeight * dpr);
      this._uvRenderer = sm.createUVCanvasRenderer?.(uvCanvas);
      this.uvLayers = (sm.getLayers?.() ?? []).map((l: any) => ({ id: l.id, name: l.name }));
      this.uvPaintMode = true;  // paint is always active in UV Editor
      this._uvDraw();
      this._attachUVPointerHandlers(uvCanvas);
    });
  }

  closeUVEditor(): void {
    const sm = this.shapeManager as any;
    // If closing with an active GARP paint preview, discard it (cancelGarpPaint3D is idempotent)
    if (this.garpPaintMeshId) {
      sm.cancelGarpPaint3D?.();
      this.garpPaintMeshId = null;
      this.garpPaintSlot = null;
      this.garpPaintSkinName = '';
    }
    // No-arg exit is idempotent and safe — don't gate on mesh ID (wrong mesh = skipped exit)
    sm.exitUVPaintMode3D?.();
    if (!this.scene3dClothingPaintActive) {
      sm.closeUVEditor3D?.(this.scene3dSelectedMeshId);
    }
    this.scene3dClothingPaintActive = null;
    this._uvSession = null;
    this._uvRenderer = null;
    this._uvHandlersBound = false;
    this.uvEditorOpen = false;
    this.uvPaintMode  = false;
    this.showUVPane   = false;
    this.uvStampActive = false;
  }

  uvDraw(): void { this._uvDraw(); }

  onUvStampToolChange(evt: {active: boolean; size: number; rotationRad: number}): void {
    this.uvStampActive     = evt.active;
    this.uvStampSize       = evt.size;
    this.uvStampRotationRad = evt.rotationRad;
  }

  onShowUVPaneChange(show: boolean): void {
    this.showUVPane = show;
  }

  private _uvDraw(): void {
    if (!this._uvRenderer || !this._uvSession) return;
    if (this.uvPaintMode) return;  // Salsa redraws after every dab; don't stomp it
    const em = (this.shapeManager as any).getEditMesh3D?.(this.scene3dSelectedMeshId);
    if (!em) return;
    this._uvRenderer.draw(this._uvSession, em);
  }

  private _uvCssCoords(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private _attachUVPointerHandlers(canvas: HTMLCanvasElement): void {
    if (this._uvHandlersBound) return;
    this._uvHandlersBound = true;
    const sm = this.shapeManager as any;

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this._uvRenderer || !this._uvSession) return;
      const { x, y } = this._uvCssCoords(canvas, e);
      const em = sm.getEditMesh3D?.(this.scene3dSelectedMeshId);
      const fi = em ? this._uvRenderer.hitTestFace?.(x, y, this._uvSession, em) : null;
      sm.setUVHoverFace3D?.(this.scene3dSelectedMeshId, fi ?? null);
      this._uvDraw();
    });

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!this._uvRenderer || !this._uvSession) return;
      const { x, y } = this._uvCssCoords(canvas, e);
      const em = sm.getEditMesh3D?.(this.scene3dSelectedMeshId);
      if (!em) return;
      const fi = this._uvRenderer.hitTestFace?.(x, y, this._uvSession, em);
      if (fi != null) {
        this._uvSession.selectFace?.(fi, e.shiftKey);
        this.ngZone.run(() => this._uvDraw());
      }
    });

    canvas.addEventListener('pointerleave', () => {
      sm.setUVHoverFace3D?.(this.scene3dSelectedMeshId, null);
      this._uvDraw();
    });

    canvas.addEventListener('wheel', (e: WheelEvent) => {
      if (!this._uvSession) return;
      e.preventDefault();
      this._uvSession.zoom = Math.max(0.1, Math.min(20, (this._uvSession.zoom ?? 1) * (1 - e.deltaY * 0.001)));
      this._uvDraw();
    }, { passive: false });
  }

  private _drawKnifePreview(x0: number, y0: number, x1: number, y1: number): void {
    const hc = this.handleCanvasRef?.nativeElement;
    if (!hc) return;
    const ctx = hc.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, hc.width, hc.height);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = 'rgba(255, 255, 80, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    // Start dot
    ctx.beginPath();
    ctx.arc(x0, y0, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 80, 0.9)';
    ctx.fill();
    ctx.restore();
  }

  private _clearKnifePreview(): void {
    const hc = this.handleCanvasRef?.nativeElement;
    if (!hc) return;
    hc.getContext('2d')?.clearRect(0, 0, hc.width, hc.height);
  }

  // ── Cloth state ────────────────────────────────────────────
  scene3dIsCloth = false;
  scene3dClothIds = new Set<string>();
  // Character body IDs (isProceduralBody3D === true) — shown as "Character" in outliner
  scene3dCharacterBodyIds = new Set<string>();
  // Part IDs that belong to a character body — hidden from outliner (needs getProceduralBodyParts3D)
  scene3dCharPartIds = new Set<string>();
  clothBuilderVisible = false;
  clothBuilderExistingId: string | null = null;
  clothBuilderInitialGrid: any = null;
  clothBuilderInitialPhysics: any = null;
  clothBuilderInitialSimMode: 'none' | 'hang' | 'drape' = 'none';
  clothBuilderInitialSimPositions: Float32Array | null = null;
  clothBuilderDropPosition: [number, number, number] = [0, 0, 0];
  clothInfoGrid: any = null;
  clothInfoSim: any = null;
  clothInfoVertexCount: number | null = null;
  clothInfoTriCount: number | null = null;
  clothLiveEnabled = false;
  clothWindEnabled = false;
  clothWindAxis: 'x' | 'y' | 'z' = 'x';
  clothWindAmplitude = 3.0;
  clothWindFramesPerCycle = 48;
  clothWindPhase = 0;

  // ── Wind zones ─────────────────────────────────────────────────
  windZones: any[] = [];
  windZoneSelectedIdx: number | null = null;
  windZoneShape: 'sphere' | 'box' = 'sphere';
  windZoneCenter: [number, number, number] = [0, 0, 0];
  windZoneRadius = 1.0;
  windZoneBoxMin: [number, number, number] = [-0.5, -0.5, -0.5];
  windZoneBoxMax: [number, number, number] = [0.5, 0.5, 0.5];
  windZoneWindX = 0; windZoneWindY = 5; windZoneWindZ = 0;
  windZoneFalloff = 1.0;
  windZonePulseEnabled = false;
  windZonePulsePeriod = 60;
  windZonePulsePhase = 0;

  scene3dIsRibbon = false;
  scene3dRibbonWidth = 0.10;
  scene3dRibbonSegments = 16;
  scene3dRibbonPathMode: 'normal' | 'world-up' | 'camera-facing' = 'normal';
  scene3dRibbonDoubleSided: 'double' | 'front' | 'back' = 'double';
  scene3dRibbonShowHandles = true;
  scene3dRibbonFlipRearU = true;
  scene3dRibbonUvTileCount = 1;
  scene3dRibbonControlPoints: { x: number; y: number; z: number }[] = [
    { x: -1, y: 0, z: 0 }, { x: 0, y: 0.3, z: 0 }, { x: 1, y: 0, z: 0 }
  ];

  // Canvas overlay handle drag
  private _scene3dActiveDragIndex: number | null = null;
  private _scene3dHandleRafId: number | null = null;
  private _scene3dDirtySeq = 0;

  // Fix 1: concurrent save guard
  private _saveRunning = false;
  private _saveQueued = false;

  // Opt 1: texture library dirty flag — skip re-uploading when only geometry/transforms changed
  private _texLibDirty = false;

  // Fix 3: per-layer dirty tracking — only upload layers that had strokes since last save
  private _dirtyLayerIds = new Set<string>();
  private _uploadedLayerIds = new Set<string>();

  private scene3dMarkDirty(): void {
    this.sceneChanged$.next('__3d_' + ++this._scene3dDirtySeq);
  }

  private scene3dMarkTexLibDirty(): void {
    this._texLibDirty = true;
    this.sceneChanged$.next('__3d_' + ++this._scene3dDirtySeq);
  }

  private _markStateDirty(): void {
    this.sceneChanged$.next('__state_' + Date.now());
    this._metaFlush$.next();
  }

  /** Write current non-pixel settings (dither, bgColor, etc.) to OPFS metadata fast,
   *  without waiting for the 2s cloud-save debounce. Ensures a quick refresh doesn't lose changes. */
  private async _quickFlushOpfsMeta(): Promise<void> {
    if (!this.illustration?.id || this.isLoading) return;
    try {
      const { state } = await this.frogFileService.buildStatePayload(this.illustrationTitle);
      state.ditherConfig = { ...this.ditherConfig };
      for (const layer of state.layers) {
        const cfg = this.layerDitherConfigs.get(layer.layerId);
        if (cfg !== undefined) layer.ditherConfig = { ...cfg } as any;
      }
      state.documentSize = (this.shapeManager as any).getDocumentSize?.() ?? null;
      state.bgColor = this.bgColor;
      state.dotColor = this.dotColor;
      state.paperGrain = { type: this.paperGrainType, scale: this.paperGrainScale, strength: this.paperGrainStrength };
      const key = this.syncMode === 2
        ? 'local-' + (this.illustration.uuid ?? '')
        : this.illustration.id.toString();
      (state as any).backendSynced = false;
      void this.opfsMetadataService.write(key, state);
    } catch (e) {
      console.warn('[QuickFlush] OPFS meta write failed', e);
    }
  }

  // Ribbon path presets
  scene3dPresetType: 'spiral' | 'circle' | 'arc' | 'wave' | 'scurve' | 'zigzag' = 'spiral';
  scene3dPresetDiameter = 0.5;
  scene3dPresetHeight = 0.75;
  scene3dPresetTurns = 4;
  scene3dPresetAngle = 180;
  scene3dPresetAmplitude = 0.5;
  scene3dPresetFrequency = 2;
  scene3dPresetReverse = false;

  // HTML texture
  scene3dHtmlEnabled = false;
  scene3dHtmlContent = '';
  scene3dHtmlTexWidth = 512;
  scene3dHtmlTexHeight = 128;
  scene3dHtmlTexBg = '#000000';
  scene3dHtmlTexBgTransparent = true;
  scene3dHtmlTexQuality: 64 | 128 | 256 = 128;  // targetHeight (px) for ribbon auto-sizing

  get scene3dEffectiveTexBg(): string {
    return this.scene3dHtmlTexBgTransparent ? '' : this.scene3dHtmlTexBg;
  }
  private _scene3dHtmlDebounce: any;

  // PS1 config (spec defaults)
  scene3dPS1Jitter = 0.8;
  scene3dPS1Snap = 160;
  scene3dPS1Affine = 0.5;
  scene3dPS1ColorDepth = 32;
  scene3dPS1LoRes = false;
  scene3dPS1ResW = 320;
  scene3dPS1ResH = 240;
  scene3dPS1Dither = false;
  scene3dPS1DitherStrength = 0.45;
  scene3dPS1UVQuantize = false;
  scene3dPS1UVSteps = 64;

  // Scene background / skybox
  scene3dBgMode: 'none' | 'solid' | 'gradient' | 'wavy' | 'checkers' = 'none';
  scene3dBgColor1 = '#1a1a2e';
  scene3dBgColor2 = '#99aabb';

  // Enhanced visuals
  scene3dEnhancedVisuals = false;
  scene3dGlassQuality = false;
  scene3dAerialPerspective = 0;

  // Fog
  scene3dFogMode: 'off' | 'linear' | 'exponential' = 'off';
  scene3dFogColor = '#cccccc';
  scene3dFogNear = 5;
  scene3dFogFar = 20;
  scene3dFogDensity = 0.08;

  // Texture sampling
  scene3dTextureFilter: 'nearest' | 'linear' = 'nearest';

  // Lighting (spec defaults — matches salsa's built-in default)
  scene3dLightAzimuth = -31;
  scene3dLightElevation = 54;
  scene3dLightIntensity = 1.0;
  scene3dKeyLightColorHex = '#ffffff';
  scene3dAmbientR = 0.17;
  scene3dAmbientG = 0.17;
  scene3dAmbientB = 0.17;
  scene3dAmbientIntensity = 1.0;
  scene3dAmbientColorHex = '#2b2b2b';

  // Scene wind (S1 foliage sway) — defaults match Salsa's DEFAULT_SCENE_WIND
  sceneWindDirDeg = 35;
  sceneWindStrength = 0.06;
  sceneWindSpeed = 1.0;

  // Mesh list from engine
  scene3dMeshes: Array<any> = [];

  // Selected mesh
  scene3dSelectedMeshId: string | null = null;
  scene3dMeshPosX = 0; scene3dMeshPosY = 0; scene3dMeshPosZ = 0;
  scene3dMeshRotX = 0; scene3dMeshRotY = 0; scene3dMeshRotZ = 0;
  scene3dMeshScaleX = 1; scene3dMeshScaleY = 1; scene3dMeshScaleZ = 1;
  scene3dMeshColor = '#ffffff';
  scene3dMeshOpacity = 1.0;
  scene3dMeshRoughness = 0.5;
  scene3dMeshMetalness = 0.0;
  scene3dMeshNoEnvReflection = false;
  scene3dMeshPlanarReflector = false;
  groundSurface = 'ashlar';
  groundTileMm = 600;
  groundGroutMm = 15;
  groundTintHex = '#ccc09e';
  groundExtentM = 20;
  groundWeather: 'new' | 'worn' | 'ancient' | 'mossy' | 'dirty' = 'worn';
  groundMossTintHex = '#4a6741';
  groundDirtTintHex = '#5a3a1a';
  groundWearTrack = false;
  groundWedges = 12;
  groundRingMm = 600;
  groundScatterGroupId: string | null = null;
  groundScatterFlowers = 1.0;
  groundScatterPebbles = 1.0;
  groundScatterTallGrass = 1.0;
  groundScatterBushes = 1.0;
  groundScatterRocks = 1.0;
  // IBL / Environment Map (global scene)
  scene3dIblEnabled = false;
  scene3dIblIntensity = 1.0;

  // GLB export
  scene3dExportStats: string | null = null;

  // Post-processing (global scene)
  scene3dBloomEnabled = false;
  scene3dBloomThreshold = 0.8;
  scene3dBloomIntensity = 1.0;
  scene3dColorGradeEnabled = false;
  scene3dColorGradeBrightness = 0.0;
  scene3dColorGradeContrast = 0.0;
  scene3dColorGradeSaturation = 0.0;
  scene3dColorGradeTint = '#ffffff';
  scene3dVignetteEnabled = false;
  scene3dVignetteIntensity = 0.45;
  scene3dVignetteRadius = 0.75;
  scene3dVignetteSoftness = 0.45;
  // SSAO (ambient occlusion)
  scene3dSSAOEnabled         = false;
  scene3dSSAORadius          = 0.5;
  scene3dSSAOIntensity       = 0.8;
  scene3dSSAOPower           = 2.0;
  scene3dSSAOBias            = 0.025;
  scene3dSSAOResolutionScale = 0.5;
  scene3dSSAOSamples         = 8;
  scene3dSSAODebug           = false;

  // -- Multi-material submesh slots
  scene3dSubmeshes: Array<{ label: string; color: string; opacity: number; renderStyle: string }> = [];

  // -- Snap indicator
  scene3dSnapActive = false;
  scene3dSnapBadgeVisible = false;
  scene3dSnapFadingOut = false;
  private _snapFadeTimer: any = null;
  scene3dSnapMode: 'none' | 'grid' | 'vertex' = 'grid';
  scene3dSnapGridSize = 0.05;
  scene3dSnapAngleDeg = 15;
  scene3dSnapScaleStep = 0.25;

  // -- Outliner hierarchy
  scene3dHierarchy: Array<any> = [];
  scene3dRenamingId: string | null = null;
  scene3dRenamingName = '';
  scene3dCollapsedGroups: Set<string> = new Set();

  // -- Texture state for selected mesh
  scene3dDiffuseTextureSet = false;
  scene3dNormalMapSet = false;

  // -- Blend shapes (morph targets) for selected mesh
  scene3dBlendShapes: Array<{name: string; weight: number}> = [];

  // -- Keyframe recording feedback
  scene3dKeyframeFlash = false;
  private _scene3dFlashTimer: any = null;

  // -- Dope Sheet data for the timeline component
  scene3dSelectedMeshTracks: any = null;
  scene3dSelectedMeshName = '';
  scene3dAllMeshTracks: { meshId: string; name: string; tracks: any }[] = [];

  get is3DContextActive(): boolean {
    return this.scene3dPanelVisible || !!this.scene3dSelectedMeshId;
  }

  get canUndo3D(): boolean {
    return !!(this.shapeManager as any).canUndo3D;
  }

  get canRedo3D(): boolean {
    return !!(this.shapeManager as any).canRedo3D;
  }

  get undoDescription3D(): string {
    return (this.shapeManager as any).undoDescription3D ?? 'Nothing to undo';
  }

  get redoDescription3D(): string {
    return (this.shapeManager as any).redoDescription3D ?? 'Nothing to redo';
  }

  get scene3dAnimCurrentFrame(): number {
    const player = (this.shapeManager as any).getAnimationPlayer3D?.();
    return player?.currentFrame ?? this.animationService.getCurrentFrame?.() ?? 0;
  }

  /** Current raster timeline frame (1-based) for display in the 3D panel. */
  get scene3dTimelineFrame(): number {
    return this.animationService.getCurrentFrame?.() ?? 1;
  }

  /** Called by layer panel's (scene3dSelected) event */
  onScene3dSelected(selected: boolean): void {
    this.scene3dPanelVisible = selected;
    const sm = this.shapeManager as any;
    sm.canvasGridVisibleOverride  = !selected;
    sm.sceneGridVisible3DOverride =  selected;

    if (this._toolsSwapTimer) { clearTimeout(this._toolsSwapTimer); this._toolsSwapTimer = null; }
    if (selected) {
      this._scene3dLoadSnapSettings();
      this._loadScene3dGrid();
      this.scene3dLoadSkyPresets();
      // 2D exits first, then 3D enters
      this.tools3dExiting = false;
      this.tools2dExiting = true;
      this._toolsSwapTimer = setTimeout(() => {
        this.tools2dVisible = false;
        this.tools2dExiting = false;
        this.tools3dVisible = true;
      }, 300);
    } else {
      // 3D exits first, then 2D enters
      this.tools3dExiting = true;
      this._toolsSwapTimer = setTimeout(() => {
        this.tools3dVisible = false;
        this.tools3dExiting = false;
        this.tools2dVisible = true;
      }, 200);
    }

    if (selected) {
      this.selectedRasterLayerId = null;
      this.scene3dRefreshMeshes();
      this.scene3dRefreshHierarchy();
      this.scene3dRefreshRuntimeState();
      this.scene3dEnsureAnimationPlayer();
      (this.shapeManager as any).scene3d?.enableTransformControls?.();

      const sm = this.shapeManager as any;

      // attachKeyframesToTimeline3D connects the 3D engine to the raster timeline
      // internally — it handles applyAllKeyframesAtFrame on every frame tick itself.
      sm.attachKeyframesToTimeline3D?.();
      sm.scene3d?.attachKeyframesToTimeline?.();

      // Disable all tools except cursor/pan while 3D viewport is active.
      this.selectCursor('cursor');

      // Apply the stored illustration projection (default: orthographic).
      sm.setIllustrationProjection3D?.(this.scene3dIllustrationProjection);
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
          (this.shapeManager as any).repositionUIForms?.();
        });
        this._scene3dResizeObserver.observe(this.canvas);
      }
    } else {
      this._exitAllScene3dModes();
      this._scene3dViewportSub?.unsubscribe?.();
      this._scene3dViewportSub = null;
      this._scene3dResizeObserver?.disconnect();
      this._scene3dResizeObserver = null;
      this._scene3dStopGizmoLoop();
    }

    if (selected) this._scene3dStartGizmoLoop();
  }

  private _scene3dStartGizmoLoop(): void {
    if (this._scene3dGizmoRafId != null) return;
    this.ngZone.runOutsideAngular(() => {
      const loop = () => {
        this._scene3dPollDragInfo();
        if (this.scene3dPanelVisible) {
          this._scene3dGizmoRafId = requestAnimationFrame(loop);
        } else {
          this._scene3dGizmoRafId = null;
        }
      };
      this._scene3dGizmoRafId = requestAnimationFrame(loop);
    });
  }

  private _scene3dStopGizmoLoop(): void {
    if (this._scene3dGizmoRafId != null) {
      cancelAnimationFrame(this._scene3dGizmoRafId);
      this._scene3dGizmoRafId = null;
    }
    if (this.scene3dDragAngleDeg !== null) {
      this.ngZone.run(() => {
        this.scene3dDragAngleDeg = null;
        this.scene3dDragLabelPos = null;
      });
    }
  }

  private _scene3dPollDragInfo(): void {
    const sm = this.shapeManager as any;

    // Poll snap indicator
    const snapNow = !!(sm.snapActive3D);
    if (snapNow !== this.scene3dSnapActive) {
      this.ngZone.run(() => { this.scene3dSnapActive = snapNow; });
    }

    const info = sm.scene3d?.getDragInfo?.();
    if (!info?.isDragging || info.angleDeg == null || !info.gizmoCenterWorld) {
      if (this.scene3dDragAngleDeg !== null) {
        this.ngZone.run(() => {
          this.scene3dDragAngleDeg = null;
          this.scene3dDragLabelPos = null;
        });
      }
      return;
    }
    const canvas = this.canvasRef?.nativeElement;
    const cw = canvas ? (canvas.clientWidth || canvas.width) : 0;
    const ch = canvas ? (canvas.clientHeight || canvas.height) : 0;
    const [wx, wy, wz] = info.gizmoCenterWorld as [number, number, number];
    const screen = sm.scene3d?.projectWorldToScreen3D?.(wx, wy, wz, cw, ch);
    const newAngle = Math.round(info.angleDeg * 10) / 10;
    const newPos = screen ? { x: screen.x, y: screen.y } : null;
    if (this.scene3dDragAngleDeg !== newAngle ||
        this.scene3dDragLabelPos?.x !== newPos?.x ||
        this.scene3dDragLabelPos?.y !== newPos?.y) {
      this.ngZone.run(() => {
        this.scene3dDragAngleDeg = newAngle;
        this.scene3dDragLabelPos = newPos;
      });
    }
  }

  scene3dRemoveScene(): void {
    this.rasterBrushService.remove3DScene();
    this.scene3dPanelVisible = false;
    this.scene3dSelectedMeshId = null;
    const sm = this.shapeManager as any;
    sm.canvasGridVisibleOverride  = true;
    sm.sceneGridVisible3DOverride = false;
  }

  scene3dSyncIllustrationCamera(): void {
    const sm = this.shapeManager as any;
    const is = sm.interactionService;
    if (!is || !this.canvas) return;
    sm.syncIllustrationCamera3D?.(
      is.getPanOffset().x, is.getPanOffset().y,
      is.getZoomFactor(),
      this.canvas.width, this.canvas.height
    );
  }

  scene3dSetIllustrationProjection(mode: 'perspective' | 'orthographic'): void {
    this.scene3dIllustrationProjection = mode;
    (this.shapeManager as any).setIllustrationProjection3D?.(mode);
    this._markStateDirty();
  }

  // ── View mode: target × cameraMode ───────────────────────────────────────

  private applyViewUI3D(rules: any): void {
    this.scene3d2DPanelsActive = rules.twoDToolsActive ?? true;
    const state: any = (this.shapeManager as any).getViewState3D?.() ?? {};
    this.scene3dViewTarget = state.target ?? 'illustration';
    this.scene3dViewCameraMode = state.cameraMode ?? 'ortho2D';
    this.scene3dViewArtboardFrame = state.showArtboardFrame ?? true;
    this.scene3dViewFly = (this.shapeManager as any).isFlyEnabled3D ?? false;
    // Scene target: the 3D outliner is always the primary panel — no layer-row click needed
    if (this.scene3dViewTarget === 'scene' && this.has3DScene) {
      this.scene3dPanelVisible = true;
    }
    // free3D: auto-activate the 3D scene context so the orbit camera + 3D render are live
    // without requiring a manual "3D Scene" layer click
    if (this.scene3dViewCameraMode === 'free3D' && this.has3DScene && !this.scene3dPanelVisible) {
      this.onScene3dSelected(true);
    }
  }

  scene3dSetViewTarget(t: 'illustration' | 'scene'): void {
    (this.shapeManager as any).setTarget3D?.(t);
  }

  scene3dSetViewCameraMode(m: 'ortho2D' | 'perspective2D' | 'free3D'): void {
    (this.shapeManager as any).setCameraMode3D?.(m);
  }

  scene3dSetArtboardFrame(on: boolean): void {
    this.scene3dViewArtboardFrame = on;
    (this.shapeManager as any).setArtboardFrameVisible3D?.(on);
  }

  scene3dSetFly(on: boolean): void {
    this.scene3dViewFly = on;
    (this.shapeManager as any).setFlyEnabled3D?.(on);
  }

  scene3dTogglePlay(): void {
    const sm = this.shapeManager as any;
    if (sm.isPlaying3D) {
      sm.exitPlayMode3D?.();
    } else {
      sm.enterPlayMode3D?.({ config: { cameraMode: this.scene3dPlayCameraMode } });
    }
  }

  scene3dLoadSkyPresets(): void {
    const sm = this.shapeManager as any;
    this.scene3dSkyPresets = sm.listSkyPresets3D?.() ?? [];
  }

  scene3dApplySkyPreset(name: string): void {
    const sm = this.shapeManager as any;
    sm.applySkyPreset3D?.(name);
    this.scene3dActiveSkyPreset = name;
    this.scene3dSyncIBLSliders();
  }

  scene3dClearSky(): void {
    (this.shapeManager as any).resetSky3D?.();
    this.scene3dActiveSkyPreset = null;
    this.scene3dSyncIBLSliders();
  }

  private scene3dSyncIBLSliders(): void {
    const intensities = (this.shapeManager as any).getIBLIntensities3D?.();
    if (intensities) {
      this.scene3dDiffuseIBL = intensities.diffuse ?? 1.0;
      this.scene3dSpecularIBL = intensities.specular ?? 1.0;
    }
  }

  scene3dSetDiffuseIBL(v: number): void {
    this.scene3dDiffuseIBL = v;
    (this.shapeManager as any).setIBLDiffuseIntensity3D?.(v);
  }

  scene3dSetSpecularIBL(v: number): void {
    this.scene3dSpecularIBL = v;
    (this.shapeManager as any).setIBLSpecularIntensity3D?.(v);
  }

  scene3dToggleSSR(): void {
    const sm = this.shapeManager as any;
    if (this.scene3dSSREnabled) {
      const r = sm.getReflections3D?.();
      if (r) {
        this.scene3dSSRIntensity = r.ssrIntensity ?? 1.0;
        this.scene3dSSRFillBlur = r.ssrFillBlur ?? 2.0;
        this.scene3dSSRThickness = r.ssrEdgeFeather ?? 2.0;
        this.scene3dSSRReach = r.ssrReach ?? 12.8;
        this.scene3dSSRShadow = r.ssrFallbackShadow ?? 0.35;
      }
    }
    sm.setSSR3D?.({ ssr: this.scene3dSSREnabled, ssrIntensity: this.scene3dSSRIntensity });
  }

  scene3dSetSSRIntensity(v: number): void {
    this.scene3dSSRIntensity = v;
    if (this.scene3dSSREnabled) {
      (this.shapeManager as any).setSSR3D?.({ ssrIntensity: v });
    }
  }

  scene3dSetSSRFillBlur(v: number): void {
    this.scene3dSSRFillBlur = v;
    if (this.scene3dSSREnabled) {
      (this.shapeManager as any).setSSR3D?.({ ssrFillBlur: v });
    }
  }

  scene3dSetSSRThickness(v: number): void {
    this.scene3dSSRThickness = v;
    if (this.scene3dSSREnabled) {
      (this.shapeManager as any).setSSR3D?.({ ssrEdgeFeather: v });
    }
  }

  scene3dSetSSRReach(v: number): void {
    this.scene3dSSRReach = v;
    if (this.scene3dSSREnabled) {
      (this.shapeManager as any).setSSR3D?.({ ssrReach: v });
    }
  }

  scene3dSetSSRShadow(v: number): void {
    this.scene3dSSRShadow = v;
    if (this.scene3dSSREnabled) {
      (this.shapeManager as any).setSSR3D?.({ ssrFallbackShadow: v });
    }
  }

  scene3dSetPlayerObject(meshId: string | null): void {
    const sm = this.shapeManager as any;
    const next = meshId === this.scene3dPlayerObjectId ? null : meshId;
    sm.setPlayerObject3D?.(next);
    this.scene3dPlayerObjectId = next;
  }

  // ── Cinematic cameras ──────────────────────────────────────

  scene3dRefreshCameraNodes(): void {
    const sm = this.shapeManager as any;
    const nodes: any[] = sm.listCameraNodes3D?.() ?? [];
    this.scene3dCameraNodes = nodes.map((n: any) => ({ id: n.id, name: n.name || 'Camera' }));
  }

  scene3dAddCamera(): void {
    const sm = this.shapeManager as any;
    const id: string | undefined = sm.createCameraNode3D?.({ fov: 60 });
    if (!id) return;
    sm.setCameraMarkerSprite3D?.(id, 'fishing_frog.png');
    this.scene3dRefreshCameraNodes();
  }

  scene3dToggleLookThrough(id: string): void {
    const sm = this.shapeManager as any;
    if (this.scene3dLookThroughId === id) {
      sm.lookThroughCamera3D?.(null);
      this.scene3dLookThroughId = null;
    } else {
      sm.lookThroughCamera3D?.(id);
      this.scene3dLookThroughId = id;
    }
  }

  scene3dDeleteCamera(id: string): void {
    const sm = this.shapeManager as any;
    if (this.scene3dLookThroughId === id) {
      sm.lookThroughCamera3D?.(null);
      this.scene3dLookThroughId = null;
    }
    sm.deleteNode3D?.(id);
    this.scene3dRefreshCameraNodes();
  }

  scene3dRefreshCuts(): void {
    const sm = this.shapeManager as any;
    this.scene3dCameraCuts = sm.getCameraCuts3D?.() ?? [];
  }

  scene3dDropCut(cameraId: string, frame: number): void {
    const sm = this.shapeManager as any;
    sm.setCameraCut3D?.({ cameraId, frame });
  }

  scene3dRemoveCut(frame: number): void {
    const sm = this.shapeManager as any;
    sm.removeCameraCut3D?.(frame);
  }

  scene3dToggleCutPreview(): void {
    this.scene3dCutPreviewOn = !this.scene3dCutPreviewOn;
    const sm = this.shapeManager as any;
    sm.setPreviewThroughCameras3D?.(this.scene3dCutPreviewOn);
  }

  scene3dClearAllCuts(): void {
    (this.shapeManager as any).clearCameraCuts3D?.();
    this.scene3dRefreshCuts();
  }

  scene3dExportCinematic(): void {
    (this.shapeManager as any).exportCinematicFrames3D?.();
  }

  // ── CD Jewel-Case Designer ─────────────────────────────────

  cdAddKit(): void {
    const sm = this.shapeManager as any;
    const result = sm.createCDKit3D?.(0, 0, 0, { clearTray: this.cdTrayClear });
    if (!result?.rootId) return;
    this.cdKitRootId = result.rootId;
    sm.enterCDDesigner3D?.(result.rootId);
    this.cdDesignerActive = true;
    this.cdActiveComponent = 'complete';
    this.cdScrub = 0;
    this.cdTrayCardFold = 0;
  }

  cdSetTrayClear(clear: boolean): void {
    this.cdTrayClear = clear;
    if (!this.cdKitRootId) return;
    (this.shapeManager as any).setCDTrayClear3D?.(this.cdKitRootId, clear);
  }

  cdExitDesigner(): void {
    (this.shapeManager as any).exitCDDesigner3D?.();
    this.cdDesignerActive = false;
    this.cdKitRootId = null;
  }

  cdSetComponent(c: string): void {
    (this.shapeManager as any).setCDActiveComponent3D?.(c);
  }

  cdSetScrub(t: number): void {
    if (!this.cdKitRootId) return;
    (this.shapeManager as any).setCDKitScrub3D?.(this.cdKitRootId, t);
  }

  cdSetTrayCardFold(fold: number): void {
    if (!this.cdKitRootId) return;
    (this.shapeManager as any).setCDTrayCardFold3D?.(this.cdKitRootId, fold);
  }

  async cdUploadArt(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.cdKitRootId || this.cdActiveComponent === 'complete') return;
    await (this.shapeManager as any).setCDPieceArt3D?.(this.cdKitRootId, this.cdActiveComponent, file);
  }

  cdOnDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file || !this.cdKitRootId || this.cdActiveComponent === 'complete') return;
    (this.shapeManager as any).setCDPieceArt3D?.(this.cdKitRootId, this.cdActiveComponent, file);
  }

  async cdExportPrintPDF(): Promise<void> {
    if (!this.cdKitRootId) return;
    const pdf: Blob | null =
      await (this.shapeManager as any).exportCDKitPrintPDF3D?.(this.cdKitRootId, {
        title: this.illustrationTitle ?? '',
      }) ?? null;
    if (!pdf) return;
    const url = URL.createObjectURL(pdf);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.illustrationTitle ?? 'cd-print'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async cdExportPrintSet(): Promise<void> {
    if (!this.cdKitRootId) return;
    const set: { piece: string; blob: Blob; widthMm: number; heightMm: number; dpi: number }[] =
      await (this.shapeManager as any).exportCDKitPrintSet3D?.(this.cdKitRootId) ?? [];
    for (const item of set) {
      const url = URL.createObjectURL(item.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cd-${item.piece}-${item.dpi}dpi.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // ── UI System ────────────────────────────────────────────

  uiRefreshLayers(): void {
    const sm = this.shapeManager as any;
    const list: any[] = sm.listUILayers?.() ?? [];
    if (list.length > 0) {
      this.uiLayers = list.map((l: any) => ({ id: l.id, name: l.name }));
      // sync active layer from engine state (important after restore)
      const engineActive = sm.activeUILayerId;
      if (engineActive && this.uiLayers.some(l => l.id === engineActive)) {
        this.uiActiveLayerId = engineActive;
      }
    }
    if (this.uiActiveLayerId) this.uiRefreshActive();
    this.uiRefreshSounds();
  }

  uiRefreshActive(): void {
    if (!this.uiActiveLayerId) return;
    const sm = this.shapeManager as any;
    this.uiActiveMachine = sm.getStateMachine?.(this.uiActiveLayerId) ?? null;
    const layer = sm.getUILayer?.(this.uiActiveLayerId);
    this.uiActiveShapeInteractions = layer?.shapeInteractions ?? {};
    this.uiCurrentStateId = sm.getCurrentUIState?.(this.uiActiveLayerId) ?? null;
  }

  uiAddLayer(): void {
    const sm = this.shapeManager as any;
    const name = `UI Layer ${this.uiLayers.length + 1}`;
    const id = sm.createUILayer?.(name);
    if (!id) return;
    this.uiLayers = [...this.uiLayers, { id, name }];
    this.uiActiveLayerId = id;
    this.uiSelectedStateId = null;
    this.uiSelectedTransitionId = null;
    const machine = this._uiBlankMachine(id);
    sm.setStateMachine?.(id, machine);
    sm.updateUILayer?.(id, { backgroundOverlay: { color: [0, 0, 0, 0.55] } });
    this.uiActiveMachine = machine;
    this.uiActiveShapeInteractions = {};
  }

  uiDeleteLayer(id: string): void {
    (this.shapeManager as any).deleteUILayer?.(id);
    this.uiLayers = this.uiLayers.filter(l => l.id !== id);
    if (this.uiActiveLayerId === id) {
      this.uiActiveLayerId = this.uiLayers[0]?.id ?? null;
      this.uiActiveMachine = null;
      this.uiActiveShapeInteractions = {};
      this.uiSelectedStateId = null;
      this.uiSelectedTransitionId = null;
      if (this.uiActiveLayerId) this.uiRefreshActive();
    }
  }

  uiSelectLayer(id: string): void {
    this.uiActiveLayerId = id;
    (this.shapeManager as any).setActiveUILayer?.(id);
    this.uiSelectedStateId = null;
    this.uiSelectedTransitionId = null;
    this.uiRefreshActive();
  }

  uiTogglePreview(): void {
    this.uiPreviewOn = !this.uiPreviewOn;
    (this.shapeManager as any).setUIInteractive?.(this.uiPreviewOn);
    if (this.uiPreviewOn) {
      this._startUiTick();
    } else {
      this._stopUiTick();
    }
    if (this.uiActiveLayerId) {
      this.uiCurrentStateId = (this.shapeManager as any).getCurrentUIState?.(this.uiActiveLayerId) ?? null;
    }
  }

  uiGoToState(stateId: string): void {
    if (!this.uiActiveLayerId || !this.uiPreviewOn) return;
    (this.shapeManager as any).goToUIState?.(this.uiActiveLayerId, stateId);
    this.uiCurrentStateId = stateId;
  }

  uiAddState(): void {
    if (!this.uiActiveMachine || !this.uiNewStateName.trim()) return;
    const id = 'state-' + Date.now();
    const newState: any = { id, name: this.uiNewStateName.trim(), layerVisibility: {}, shapeVisibility: {}, worldBlur: 0 };
    this.uiActiveMachine = { ...this.uiActiveMachine, states: [...(this.uiActiveMachine.states ?? []), newState] };
    this.uiNewStateName = '';
    this.uiAddingState = false;
    this.uiPushMachine();
    this.uiSelectedStateId = id;
  }

  uiDeleteState(id: string): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      states: this.uiActiveMachine.states.filter((s: any) => s.id !== id),
      transitions: (this.uiActiveMachine.transitions ?? []).filter((t: any) => t.fromState !== id && t.toState !== id),
      initialStateId: this.uiActiveMachine.initialStateId === id
        ? (this.uiActiveMachine.states.find((s: any) => s.id !== id)?.id ?? '')
        : this.uiActiveMachine.initialStateId,
    };
    if (this.uiSelectedStateId === id) this.uiSelectedStateId = null;
    this.uiPushMachine();
  }

  uiSetInitialState(id: string): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = { ...this.uiActiveMachine, initialStateId: id };
    this.uiPushMachine();
  }

  uiSetStateField(stateId: string, field: string, value: any): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      states: this.uiActiveMachine.states.map((s: any) => s.id === stateId ? { ...s, [field]: value } : s),
    };
    this.uiPushMachine();
  }

  uiGetState(id: string | null): any {
    return this.uiActiveMachine?.states?.find((s: any) => s.id === id) ?? null;
  }

  uiTransitionsFrom(stateId: string): any[] {
    return (this.uiActiveMachine?.transitions ?? []).filter((t: any) => t.fromState === stateId);
  }

  uiGlobalTransitions(): any[] {
    return this.uiActiveMachine?.globalTransitions ?? [];
  }

  uiAddTransitionFromSelected(): void {
    if (!this.uiActiveMachine || !this.uiSelectedStateId) return;
    const states: any[] = this.uiActiveMachine.states ?? [];
    const toState = states.find((s: any) => s.id !== this.uiSelectedStateId)?.id ?? states[0]?.id ?? '';
    const id = 't-' + Date.now();
    const newT: any = {
      id, fromState: this.uiSelectedStateId, toState,
      trigger: { type: 'click', targetId: '' },
      actions: [{ type: 'goToState', stateId: toState }],
    };
    this.uiActiveMachine = { ...this.uiActiveMachine, transitions: [...(this.uiActiveMachine.transitions ?? []), newT] };
    this.uiSelectedTransitionId = id;
    this.uiPushMachine();
  }

  uiAddGlobalTransition(): void {
    if (!this.uiActiveMachine) return;
    const states: any[] = this.uiActiveMachine.states ?? [];
    const toState = states[0]?.id ?? '';
    const id = 'tg-' + Date.now();
    const newT: any = {
      id, fromState: '*', toState,
      trigger: { type: 'keyDown', key: 'Escape' },
      actions: [{ type: 'goToState', stateId: toState }],
    };
    this.uiActiveMachine = { ...this.uiActiveMachine, globalTransitions: [...(this.uiActiveMachine.globalTransitions ?? []), newT] };
    this.uiSelectedStateId = null;
    this.uiSelectedTransitionId = id;
    this.uiPushMachine();
  }

  uiDeleteTransition(id: string): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: (this.uiActiveMachine.transitions ?? []).filter((t: any) => t.id !== id),
      globalTransitions: (this.uiActiveMachine.globalTransitions ?? []).filter((t: any) => t.id !== id),
    };
    if (this.uiSelectedTransitionId === id) this.uiSelectedTransitionId = null;
    this.uiPushMachine();
  }

  uiGetTransition(id: string | null): any {
    if (!id || !this.uiActiveMachine) return null;
    return [...(this.uiActiveMachine.transitions ?? []), ...(this.uiActiveMachine.globalTransitions ?? [])]
      .find((t: any) => t.id === id) ?? null;
  }

  uiSetTransitionField(tId: string, field: string, value: any): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) => t.id === tId ? { ...t, [field]: value } : t);
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionTriggerField(tId: string, field: string, value: any): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) =>
      t.id === tId ? { ...t, trigger: { ...t.trigger, [field]: value } } : t
    );
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionTriggerType(tId: string, type: string): void {
    const defaults: Record<string, any> = {
      click:      { type: 'click', targetId: '' },
      keyDown:    { type: 'keyDown', key: 'Escape' },
      timer:      { type: 'timer', delay: 2000 },
      stateEnter: { type: 'stateEnter', stateId: '' },
    };
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) =>
      t.id === tId ? { ...t, trigger: defaults[type] ?? { type } } : t
    );
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionAction(tId: string, field: string, value: any): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) => {
      if (t.id !== tId) return t;
      const actions = t.actions?.length ? [...t.actions] : [{ type: 'goToState', stateId: '' }];
      actions[0] = { ...actions[0], [field]: value };
      return { ...t, actions };
    });
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionAnimation(tId: string, animType: string): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) => {
      if (t.id !== tId) return t;
      const animation = animType === 'none' ? undefined : { type: animType, duration: t.animation?.duration ?? 300, easing: 'easeInOut' };
      return { ...t, animation };
    });
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionAnimDuration(tId: string, ms: number): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) =>
      t.id === tId && t.animation ? { ...t, animation: { ...t.animation, duration: ms } } : t
    );
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiTriggerLabel(trigger: any): string {
    if (!trigger) return '?';
    switch (trigger.type) {
      case 'click':      return `click:${trigger.targetId ? trigger.targetId.slice(0, 6) + '…' : '?'}`;
      case 'keyDown':    return `key:${trigger.key || '?'}`;
      case 'timer':      return `${trigger.delay ?? 0}ms`;
      case 'stateEnter': return `enter:${trigger.stateId ? trigger.stateId.slice(0, 6) + '…' : '?'}`;
      default:           return trigger.type;
    }
  }

  uiAddVariable(): void {
    if (!this.uiActiveMachine || !this.uiNewVarName.trim()) return;
    const id = 'var-' + Date.now();
    const defaults: any = { boolean: false, number: 0, string: '' };
    const newVar: any = { id, name: this.uiNewVarName.trim(), type: this.uiNewVarType, defaultValue: defaults[this.uiNewVarType] };
    this.uiActiveMachine = { ...this.uiActiveMachine, variables: [...(this.uiActiveMachine.variables ?? []), newVar] };
    this.uiNewVarName = '';
    this.uiAddingVar = false;
    this.uiPushMachine();
  }

  uiDeleteVariable(id: string): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = { ...this.uiActiveMachine, variables: (this.uiActiveMachine.variables ?? []).filter((v: any) => v.id !== id) };
    this.uiPushMachine();
  }

  uiGetVariable(id: string): any {
    if (!this.uiActiveLayerId) return null;
    return (this.shapeManager as any).getUIVariable?.(this.uiActiveLayerId, id);
  }

  uiSetVariable(id: string, value: any): void {
    if (!this.uiActiveLayerId) return;
    (this.shapeManager as any).setUIVariable?.(this.uiActiveLayerId, id, value);
  }

  uiAssignShapeInteraction(shapeId: string): void {
    if (!this.uiActiveLayerId) return;
    (this.shapeManager as any).setShapeInteraction?.({ shapeId, cursor: 'pointer', focusable: true, tabIndex: 0 }, this.uiActiveLayerId);
    this.uiRefreshActive();
  }

  uiUpdateInteraction(shapeId: string, field: string, value: any): void {
    if (!this.uiActiveLayerId) return;
    const existing = this.uiActiveShapeInteractions[shapeId] ?? { shapeId };
    (this.shapeManager as any).setShapeInteraction?.({ ...existing, [field]: value }, this.uiActiveLayerId);
    this.uiRefreshActive();
  }

  uiClearInteraction(shapeId: string): void {
    if (!this.uiActiveLayerId) return;
    (this.shapeManager as any).clearShapeInteraction?.(shapeId, this.uiActiveLayerId);
    this.uiRefreshActive();
  }

  uiInteractionList(): { shapeId: string; props: any }[] {
    return Object.entries(this.uiActiveShapeInteractions).map(([shapeId, props]) => ({ shapeId, props }));
  }

  uiRefreshSounds(): void {
    const sounds: any[] = (this.shapeManager as any).listUISounds?.() ?? [];
    this.uiSoundList = sounds.map((s: any) => ({ assetId: s.assetId ?? s }));
  }

  async uiUploadSound(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (!file) return;
    const assetId = file.name.replace(/\.[^.]+$/, '');
    await (this.shapeManager as any).registerUISound?.(assetId, file);
    this.uiRefreshSounds();
  }

  uiDeleteSound(assetId: string): void {
    (this.shapeManager as any).removeUISound?.(assetId);
    this.uiRefreshSounds();
  }

  uiPushMachine(): void {
    if (!this.uiActiveLayerId || !this.uiActiveMachine) return;
    (this.shapeManager as any).setStateMachine?.(this.uiActiveLayerId, this.uiActiveMachine);
  }

  private _uiBlankMachine(layerId: string): any {
    const initId = 'state-' + Date.now();
    return {
      id: 'machine-' + layerId,
      initialStateId: initId,
      states: [{ id: initId, name: 'Initial', layerVisibility: {}, shapeVisibility: {}, worldBlur: 0 }],
      transitions: [],
      variables: [],
      globalTransitions: [],
    };
  }

  private _startUiTick(): void {
    this._uiTickLast = performance.now();
    const loop = (now: number) => {
      if (!this.uiPreviewOn) return;
      (this.shapeManager as any).tickUI?.(now - this._uiTickLast);
      this._uiTickLast = now;
      this._uiTickRafId = requestAnimationFrame(loop);
    };
    this._uiTickRafId = requestAnimationFrame(loop);
  }

  private _stopUiTick(): void {
    if (this._uiTickRafId != null) { cancelAnimationFrame(this._uiTickRafId); this._uiTickRafId = null; }
  }

  private _handleUIEvent(e: any): void {
    if (e.type === 'stateChange') {
      this.uiCurrentStateId = e.toState;
    }
  }

  scene3dRefreshRuntimeState(): void {
    const sm = this.shapeManager as any;
    const s3d = sm.scene3d;
    if (!s3d) return;

    this.scene3dOrbitEnabled = !!s3d.getOrbitController?.()?.enabled;
    const cam = s3d.getCamera?.();
    if (cam) {
      this.scene3dCameraMode = (cam.mode as any) ?? 'perspective';
      this.scene3dFOV = Math.round(((cam.fov ?? (Math.PI / 3)) * 180) / Math.PI);
    }

    this.scene3dShadowsEnabled = !!(s3d.shadowsEnabled ?? sm.shadowsEnabled3D ?? false);
    this.scene3dFrustumCulling = (s3d.frustumCulling ?? sm.frustumCulling3D ?? true) !== false;
    const ao = s3d.ssao3D;
    if (ao) {
      this.scene3dSSAOEnabled         = ao.enabled         ?? false;
      this.scene3dSSAORadius          = ao.radius          ?? this.scene3dSSAORadius;
      this.scene3dSSAOIntensity       = ao.intensity       ?? this.scene3dSSAOIntensity;
      this.scene3dSSAOPower           = ao.power           ?? this.scene3dSSAOPower;
      this.scene3dSSAOBias            = ao.bias            ?? this.scene3dSSAOBias;
      this.scene3dSSAOResolutionScale = ao.resolutionScale ?? this.scene3dSSAOResolutionScale;
      this.scene3dSSAOSamples         = ao.samples         ?? this.scene3dSSAOSamples;
    }
  }

  scene3dRefreshMeshes(): void {
    if (this.scene3dWorldPanelOpen) return;
    const s3d = (this.shapeManager as any).scene3d;
    if (!s3d) return;
    this.scene3dMeshes = s3d.getAllMeshes?.() ?? [];
    // If selected mesh was removed, clear selection
    if (this.scene3dSelectedMeshId && !this.scene3dMeshes.some((m: any) => (m.id ?? m.nodeId) === this.scene3dSelectedMeshId)) {
      this.scene3dSelectedMeshId = null;
    }
    // Track which nodes are cloth meshes (API-based, no type-string guessing)
    this.scene3dClothIds = new Set(
      this.scene3dMeshes
        .map((m: any) => m.id ?? m.nodeId)
        .filter((id: string) => !!s3d.getClothConfig?.(id))
    );
    // Track character body meshes and their parts for outliner display
    const sm2 = this.shapeManager as any;
    const allIds = this.scene3dMeshes.map((m: any) => m.id ?? m.nodeId) as string[];
    this.scene3dCharacterBodyIds = new Set(allIds.filter((id) => !!sm2.isProceduralBody3D?.(id)));
    this.scene3dCharPartIds = new Set(
      [...this.scene3dCharacterBodyIds].flatMap((bodyId) => (sm2.getProceduralBodyParts3D?.(bodyId) as string[] | undefined) ?? [])
    );
    this.scene3dBuildingIds = new Set(allIds.filter((id: string) => !!sm2.isProceduralBuilding3D?.(id)));
    this.scene3dFoliageIds  = new Set(allIds.filter((id: string) => !!sm2.isProceduralFoliage3D?.(id)));
    this.scene3dBlockIds    = new Set(allIds.filter((id: string) => !!sm2.isBlock3D?.(id)));
    this.scene3dCreatorIds  = new Set(allIds.filter((id: string) => !!sm2.isCreator3D?.(id)));
    this.scene3dDecalIds    = new Set([
      ...allIds.filter((id: string) => !!sm2.isDecal3D?.(id)),
      ...(sm2.listDecals3D?.() ?? []).map((d: any) => d.id as string),
    ]);
    const pkgAll: any[] = sm2.packaging?.getAll?.() ?? [];
    const pkgRootsFromRegistry = pkgAll.map((p: any) => p.id);
    const pkgRootsFromIsPackageNode = allIds.filter((id: string) => {
      const resolved = sm2.packaging?.isPackageNode?.(id);
      return resolved != null && resolved === id;
    });
    this.scene3dPackageIds = new Set([...pkgRootsFromRegistry, ...pkgRootsFromIsPackageNode]);
    this.scene3dCDKitIds = new Set([
      ...allIds.filter((id: string) => !!sm2.isCDKit3D?.(id)),
      ...(this.cdKitRootId ? [this.cdKitRootId] : []),
    ]);
    this.scene3dRefreshHierarchy();
    this.scene3dRefreshKeyframeTracks();
  }

  scene3dRefreshHierarchy(): void {
    const sm = this.shapeManager as any;
    const hierarchy = sm.getScene3DHierarchy?.();
    if (hierarchy) {
      this.scene3dHierarchy = hierarchy;
    } else {
      // fallback: flat list from mesh array
      this.scene3dHierarchy = this.scene3dMeshes.map((m: any) => ({
        id: m.id ?? m.nodeId,
        name: m.name ?? m.meshPrimitive ?? 'mesh',
        type: 'mesh',
        visible: m.visible !== false,
        normalMapLibraryId: m.normalMapLibraryId ?? null,
        children: [],
      }));
    }
    this.scene3dCityContainerId = sm.world?.getCityContainerId?.() ?? null;
  }

  // Polygon / circle / character creation forms
  scene3dShowPolygonForm = false;
  scene3dShowCircleForm = false;
  scene3dShowCharacterForm = false;
  scene3dCharHeight = 0.5;
  scene3dCharLegLength = 1.0;
  scene3dCharLimbThick = 0.85;
  scene3dCharTorsoThick = 0.9;
  scene3dCharTorsoLength = 1.0;
  scene3dCharHeadSize = 1.25;
  scene3dCharBiasBodyId: string | null = null;
  private _charPreviewTimer: any = null;
  private _suppressLayerTreeRebuild = false;

  // Building Creator panel
  scene3dBuildingIds: Set<string> = new Set();
  scene3dSelectedIsBuilding = false;
  scene3dEditBuildingId: string | null = null;
  scene3dEditBuildingPanelOpen = false;
  scene3dBuildingArchetypes: string[] = [];
  // Typology
  buildingCategory = 'office';
  buildingArchetype = '';
  buildingSeed = 1;
  // Massing
  buildingFloors = 6;
  buildingWidth = 12;
  buildingDepth = 10;
  buildingFloorHeight = 3.2;
  buildingGroundFloorHeight = 4.5;
  buildingCornerStyle: 'sharp' | 'chamfer' | 'round' = 'sharp';
  buildingCornerAmount = 0.5;
  buildingSetbacks = false;
  buildingSetbackInset = 2.0;
  buildingPodium = false;
  buildingPodiumFloors = 2;
  // Facade
  buildingWindowStyle: 'grid' | 'punched' | 'ribbon' | 'curtain' = 'grid';
  buildingBayWidth = 3.0;
  buildingMaterial: 'concrete' | 'brick' | 'plaster' | 'tile' | 'glass' | 'timber' | 'metal' = 'concrete';
  buildingPilasters = false;
  buildingQuoins = false;
  buildingQuoinStyle: 'alternating' | 'block' = 'alternating';
  buildingCornice = true;
  buildingMullions = false;
  buildingGlassTransparent = false;
  // Ground / storefront
  buildingStorefront = false;
  buildingShopBays = 3;
  buildingStallriser = true;
  buildingTransom = true;
  buildingShutter = false;
  buildingAwning = false;
  buildingAwningStyle: 'flat' | 'sloped' | 'dome' = 'sloped';
  buildingAwningStripe = false;
  buildingNoren = false;
  buildingRecessedEntry = false;
  buildingRollerDoors = false;
  buildingCanopy = false;
  buildingLattice = false;
  buildingDoorStyle: 'flush' | 'panel' | 'glazed' | 'double' = 'panel';
  // Features
  buildingBalconies = false;
  buildingJulietBalconies = false;
  buildingJulietColor = '#2a2a2a';
  buildingJulietScroll = 0;
  buildingWindowTrim = false;
  buildingWindowTrimColor = '#c8c0b0';
  buildingLedges = true;
  buildingFireEscape = false;
  buildingDownpipes = true;
  buildingWallUnits = false;
  // Roof
  buildingRoofStyle: 'flat' | 'parapet' | 'hip' | 'gable' | 'mansard' | 'sawtooth' | 'tiled-hip' = 'parapet';
  buildingRoofPitch = 0.5;
  buildingDeepEaves = false;
  buildingRoofClutter = true;
  buildingRoofPenthouse = false;
  buildingRoofRailing = true;
  buildingRoofGarden = false;
  buildingRoofDishes = false;
  buildingRoofVents = false;
  buildingHelipad = false;
  buildingCrown: 'none' | 'spire' | 'mech' | 'blade' = 'none';
  // Signage
  buildingSignage = false;
  buildingBladeSign = false;
  buildingWrapSign = false;
  buildingRooftopSign = false;
  buildingLedScreen = false;
  buildingNeon = false;
  // Color
  buildingBaseColor = '#c8bfae';
  buildingTrimColor = '#8a8a8a';
  buildingRoofColor = '#555555';
  buildingGlassColor = '#4a8fc4';
  buildingAccentColor = '#c4623a';
  buildingSignColor = '#ff4444';
  buildingStorefrontColor = '#5a7a8a';
  buildingAwningColor = '#c43a3a';
  buildingDoorColor = '#4a3a2a';
  buildingDoorFrameColor = '#8a7a6a';
  buildingDoorHandleColor = '#8a8a6a';
  buildingRenderStyle: 'default' | 'cel' | 'cel-hd' | 'sketch' | 'ink' | 'gouraud' = 'default';
  buildingNightWindows = 0.4;
  // Greenery (attached)
  buildingBaseHedge = false;
  buildingVines = false;
  buildingWindowBoxes = false;
  buildingBasePlanters = false;
  buildingGreeneryColor = '#4a7a35';
  buildingBloomColor = '#e05050';
  // Scale
  buildingUnitsPerMetre = 0.1;
  buildingScaleInfo: { scale: number; metersPerUnit: number; realHeightM: number; displayHeightUnits: number; realWidthM: number; realDepthM: number } | null = null;

  // Foliage Creator panel
  scene3dFoliageIds: Set<string> = new Set();
  scene3dSelectedIsFoliage = false;
  scene3dEditFoliageId: string | null = null;
  scene3dEditFoliagePanelOpen = false;
  // Block Creator panel
  scene3dBlockIds: Set<string> = new Set();
  scene3dPackageIds: Set<string> = new Set();
  scene3dSelectedIsBlock = false;
  scene3dEditBlockId: string | null = null;
  scene3dEditBlockPanelOpen = false;
  scene3dEditBlockBuildingIndex: number | null = null;
  blockStats: { buildings: number; distinctInstancedGeometries: number; totalInstances: number } | null = null;
  blockBuildingList: { index: number; archetype: string; category?: string; placement: { x: number; z: number; ry: number } }[] = [];
  blockBuildingIndices: number[] = [];
  blockScale = 0.1;
  blockAddArchetype = 'brick-townhouse';
  blockAddX = 0;
  blockAddZ = 0;
  blockAddRy = 0;
  foliageType = 'bush';
  foliageSeed = 1;
  foliageSize = 2.0;
  foliageWidth = 3.0;
  foliageDensity = 0.8;
  foliageRender: 'chunky' | 'card' = 'chunky';
  foliageCelShade = false;
  foliageBloom = false;
  foliagePotMaterial: 'terracotta' | 'ceramic' | 'metal' | 'wood' | 'stone' = 'terracotta';
  foliageColor = '#4a7a35';
  foliageTipColor = '#7ab84a';
  foliageBloomColor = '#e05050';
  foliagePotColor = '#c8703a';
  foliageTrunkColor = '#6b4a2a';
  // Blade params (grass-tuft / tall-grass only) — 0.5 = archetype default
  bladeCurve = 0.5;
  bladeTwist = 0.5;
  bladeFold  = 0.5;
  bladeLod   = 0;
  // Woody params (bush / shrub / hedge / small-tree only — P4 branch primitive)
  branchLevels    = 2;
  branchGnarl     = 0.5;
  branchUpBias    = 0.5;
  foliageStemCount = 1;
  canopyIrregular = 0.5;
  leafGaps        = 0.3;
  hedgeSprigs     = 3;
  branchLod       = 0;
  // Vessel params (potted / planter / window-box only — P4v arrangement)
  foliageSpill      = 0.5;
  foliagePlantCount = 2;
  foliageSoilColor  = '#6b4a2a';
  foliagePlantLod   = 0;
  // Climber params (ivy / vine only — P3 runner primitive)
  ivyMode: 'area' | 'path' = 'area';
  ivyAreaWidth    = 3.0;
  ivyAreaHeight   = 2.4;
  ivyLeafDensity  = 0.5;
  ivyCoverage     = 0.7;
  ivyGrowthBias   = 0.3;
  ivyWander       = 0.35;
  ivyStemColor    = '#8a7060';
  ivyRunnerLod    = 0;
  // Flower params (daisy / rapeseed / lavender / flower-bed only)
  foliageBloomStart      = 0.5;
  foliageBloomScaleCurve = 0.5;
  foliagePetalPitch      = 0.55;
  foliagePetalShape: 'rounded' | 'pointed' | 'notched' | 'strap' = 'rounded';
  foliageBranches        = 0;
  foliageFlowerLod       = 0;
  foliagePetalColor      = '#ffffff';
  foliageCenterColor     = '#f5c000';

  // Decal tool
  scene3dDecalToolActive   = false;
  scene3dDecalIds: Set<string> = new Set();
  scene3dSelectedIsDecal   = false;
  scene3dSelectedDecalId: string | null = null;
  decalSize        = 2.0;
  decalRotation    = 0;
  decalSourceTab: 'ephemera' | 'image' = 'ephemera';
  decalImageDataUrl        = '';
  decalEphemeraCategories: any[] = [];
  decalEphemeraGenerators: any[] = [];
  decalActiveCategoryId    = '';
  decalActiveTypeId        = '';
  decalEphemeraSchema: any[] = [];
  decalEphemeraParams: Record<string, any> = {};

  // GARP Skins panel
  garpPanelOpen = false;
  garpPools: Array<{ id: string; name: string; slots: Array<{ name: string; live: boolean }>; skins: Array<{ name: string }> }> = [];
  garpActivePoolId = '';
  garpNewSkinName = '';
  garpSlotSources: Record<string, string> = {};
  garpSaving = false;
  garpSlotRegionsCache: Record<string, Array<{ label: string; u0: number; v0: number; u1: number; v1: number }>> = {};
  garpPaintMeshId: string | null = null;
  garpPaintSlot: string | null = null;
  garpPaintSkinName = '';

  // Creator panel (generic — vending, bike-rack, bollard, etc.)
  scene3dCreatorIds: Set<string> = new Set();
  // CD Kit tracking
  scene3dCDKitIds: Set<string> = new Set();
  scene3dCreatorPanelOpen   = false;
  activeCreatorId: string | null = null;
  activeCreatorTypeId: string | null = null;
  creatorSchemaList: any[] = [];
  creatorParams: Record<string, any> = {};

  // Edit Character panel
  scene3dEditCharPanelOpen = false;
  scene3dSelectedIsCharacter = false;
  scene3dEditCharBodyId: string | null = null;
  eyeDrawMode = false;
  eyeDrawExprId: string | null = null;
  scene3dFaceExpressions: Array<{ id: string; name: string; isBlink?: boolean }> = [];
  scene3dFaceActiveExprId: string | null = null;
  scene3dFaceBlinkExprId: string | null = null;
  scene3dFaceBlinkMode: 'fixed' | 'random' = 'random';
  scene3dFaceBlinkMin = 2.5;
  scene3dFaceBlinkMax = 6.0;
  scene3dFaceBlinkHold = 110;
  // Auto-blink
  scene3dAutoBlinkEnabled = false;
  scene3dAutoBlinkMinSec = 2.5;
  scene3dAutoBlinkMaxSec = 6.0;
  scene3dAutoBlinkHoldMs = 110;
  scene3dAutoBlinkDoubleProb = 15;
  scene3dAutoBlinkDoubleGapMin = 150;
  scene3dAutoBlinkDoubleGapMax = 320;

  // Body shape + skin tone (live editing of existing character)
  scene3dBodyParams: any = null;
  scene3dSkinTone = '#f5c5a3';
  private _bodyParamTimer: any = null;

  // Procedural eye params per expression
  scene3dEyeModeMap: Record<string, 'draw' | 'procedural'> = {};
  scene3dEyeParamsMap: Record<string, any> = {};
  private _eyeParamTimers: Record<string, any> = {};
  scene3dGazeX = 0;
  scene3dGazeY = 0;
  private _gazePointerActive = false;

  // Hair
  scene3dHairParams: any = null;
  private _hairParamTimer: any = null;

  // Clothing
  scene3dClothingTab: 'top' | 'bottom' = 'top';
  private _charSection: 'menu' | 'body' | 'eyes' | 'hair' | 'top' | 'bottom' | 'shoes' | 'socks' | 'charms' = 'menu';
  get charSection() { return this._charSection; }
  set charSection(v: 'menu' | 'body' | 'eyes' | 'hair' | 'top' | 'bottom' | 'shoes' | 'socks' | 'charms') {
    if (this._charSection === 'charms' && v !== 'charms') {
      this.scene3dEndPlacePick();
      this._hideCharmPreview();
    }
    this._charSection = v;
  }
  charRenderStyle = 'cel';
  scene3dCharRimLight = false;
  charPartTextureSet: Record<string, boolean> = { body: false, eyes: false, hair: false, top: false, bottom: false, shoes: false, socks: false };
  scene3dClothingPaintActive: 'top' | 'bottom' | 'shoes' | 'socks' | null = null;
  scene3dEraseStyle: 'burn' | 'clean' | 'cutout' = 'burn';
  // Charms / accessories
  scene3dAttachments: Array<{ id: string; type: string; params: any; placement: { joint: string; offset: [number, number, number]; scale: number } }> = [];
  scene3dAttachmentTypes: string[] = [];
  scene3dNewAttachmentType = 'chain';
  scene3dPlacingCharmType: string | null = null;
  scene3dDrawingChain = false;
  scene3dChainPickProgress: 'first' | 'second' | null = null;
  scene3dPreviewActive = false;
  scene3dCharSparkle = false;
  scene3dCharSparkleMode: 'glint' | 'star' = 'glint';
  scene3dAccordionOpen: Record<string, boolean> = {};
  scene3dCharmOpen: Record<string, boolean> = {};
  scene3dAttachmentsByType: Array<{ type: string; items: typeof this.scene3dAttachments }> = [];
  private _attachmentParamTimers: Map<string, any> = new Map();
  // Procedural idle animation
  scene3dIdleEnabled = false;
  scene3dIdleBreaksEnabled = false;
  scene3dIdleBreaksMinSec = 8;
  scene3dIdleBreaksMaxSec = 20;
  scene3dSquashStretchEnabled = false;
  scene3dSquashStretchIntensity = 0.25;
  scene3dLegIdleMode: 'fk' | 'ik' | 'none' = 'fk';
  // Performance stats HUD
  scene3dStatsVisible = false;
  scene3dStats: any = null;
  private _statsInterval: any = null;
  scene3dTopParams: any = null;
  scene3dBottomParams: any = null;
  scene3dShoeParams: any = null;
  scene3dSockParams: any = null;
  scene3dClothingPattern: Record<string, { mode: string; colorHex: string; freq: number; angleDeg: number; scale: number }> = {};
  scene3dTopPresets: string[] = [];
  scene3dBottomPresets: string[] = [];
  scene3dShoePresets: string[] = [];
  scene3dSockPresets: string[] = [];
  scene3dTopPresetName = '';
  scene3dBottomPresetName = '';
  scene3dShoePresetName = '';
  scene3dSockPresetName = '';
  private _clothingParamTopTimer: any = null;
  private _clothingParamBottomTimer: any = null;
  private _clothingParamShoesTimer: any = null;
  private _clothingParamSocksTimer: any = null;
  private _clothingParamUndershirtTimer: any = null;
  private _clothingParamUnderpantsTimer: any = null;
  scene3dUndershirtParams: any = null;
  scene3dUnderpantsParams: any = null;
  scene3dUndershirtPresets: string[] = [];
  scene3dUnderpantsPresets: string[] = [];
  scene3dUndershirtPresetName = '';
  scene3dUnderpantsPresetName = '';
  scene3dTopTab: 'top' | 'undershirt' = 'top';
  scene3dBottomTab: 'bottom' | 'underpants' = 'bottom';
  private readonly _hairParamDefaults = {
    verticalOffset: 0.62,
    capThickness: 0.00,
    backLength: 4.0,
    crownRound: 0.00,
    hairlineFront: 0.11,
    partingStyle: 'parted',
    partingPosition: 0.10,
    partingWidth: 0.25,
    bangCount: 12,
    bangLength: 0.60,
    bangCurve: 1.00,
    bangPointiness: 1.00,
    bangOffset: -0.18,
    sideLock: false,
    tailStyle: 'twin',
    tailHeight: 0.80,
    tailSpread: 0.70,
    tailLength: 4.2,
    tailThickness: 0.60,
    tailTaper: 1.00,
    tailCurl: 1.00,
    tailTip: 'point',
    rootColor: '#80bc80',
    tipColor: '#000000',
    gradient: true,
    tipFade: 1.00,
    chunkiness: 1.00,
  };
  private readonly _eyeParamDefaults = {
    pixelResolution: 50,
    spacing: 0.40,
    verticalPos: 0.60,
    width: 0.50,
    height: 0.34,
    tilt: 0.50,
    roundness: 1.0,
    irisRadius: 0.90,
    irisGradient: true,
    irisColorTop: '#6d523b',
    irisColorBottom: '#b8853d',
    irisColor: '#96693c',
    pupilRadius: 0.60,
    pupilColor: '#3a2010',
    upperLashThickness: 0.08,
    upperLashColor: '#111111',
    outerLashLength: 0.25,
    lowerLash: false,
    doubleEyelid: false,
    underDeco: true,
    underDecoColor: '#80bc80',
    underDecoCount: 3,
    closed: false,
  };

  // ── Original default character (keep for revert) ──────────────────────
  private readonly _charBodyDefaults = {
    height:      0.50,
    legLength:   1.00,
    limbThick:   0.85,
    torsoThick:  0.90,
    torsoLength: 1.00,
    headSize:    1.25,
    waist:       0.90,
    hipFront:    0.75,
    skinTone:    '#f5c5a3',
    hairRoot:    '#80bc80',
    hairTip:     '#000000',
    eyeIrisColor:'#96693c',
    topColor:    '#419041',
    topTrim:     '#315e31',
    bottomColor: '#404763',
    bottomTrim:  '#030407',
  } as const;

  scene3dPolygonSides = 6;
  scene3dPolygonRadius = 0.5;
  scene3dPolygonHeight = 0.2;
  scene3dCircleRadius = 0.5;
  scene3dCircleSegments = 16;
  scene3dCircleHeight = 0.2;

  // Cylinder / cone / frustum form
  scene3dShowCylinderForm = false;
  scene3dCylinderRadius = 0.3;
  scene3dCylinderHeight = 0.8;
  scene3dCylinderRadiusTop = 0.3;
  scene3dCylinderSegments = 12;

  // Revolve / lathe form
  scene3dShowRevolveForm = false;
  scene3dRevolveProfile: [number, number][] = [[0.3, -0.4], [0.4, 0], [0.3, 0.4]];
  scene3dRevolveSegments = 16;

  // Tube / loft form
  scene3dShowTubeForm = false;
  scene3dTubePath: [number, number, number][] = [[0, -0.4, 0], [0, 0, 0], [0, 0.4, 0]];
  scene3dTubeRadii: number[] = [0.1, 0.15, 0.1];
  scene3dTubeSegments = 8;

  // Multi-select for boolean CSG
  scene3dSelectedMeshIds = new Set<string>();

  // Metaballs form
  scene3dShowMetaballForm = false;
  scene3dMetaballBlobs: Array<{
    shape: 'sphere' | 'capsule' | 'ellipsoid' | 'box' | 'torus';
    ax: number; ay: number; az: number;
    bx: number; by: number; bz: number;
    radius: number; blend: number; subtract: boolean;
  }> = [
    { shape: 'sphere', ax: -0.2, ay: 0, az: 0, bx: 0, by: 0.3, bz: 0, radius: 0.3, blend: 0.3, subtract: false },
    { shape: 'sphere', ax:  0.2, ay: 0, az: 0, bx: 0, by: 0.3, bz: 0, radius: 0.25, blend: 0.3, subtract: false },
  ];
  scene3dMetaballResolution = 32;
  scene3dMetaballDecimate = 1.0;

  // Creature form
  scene3dShowCreatureForm = false;
  scene3dCreatureSpecies = 'dog';
  scene3dCreatureParams = {
    bodyLength: 1.0, bodyRadius: 0.3,
    legCount: 4,     legLength: 0.5,
    neckLength: 0.3, headSize: 0.4,
    tailLength: 0.4, tailCurl: 0.3,
    earSize: 0.2,    blend: 0.3,
    roughness: 0.0,  eyes: true,
    rigged: false,   decimate: 0.4,
  };
  scene3dCreatureSeed = 42;
  scene3dCreatureResolution = 32;

  scene3dAddMesh(primitive: string): void {
    const sm = this.shapeManager as any;
    const s3d = sm.scene3d;
    if (!s3d) return;

    // Place new meshes at the visible illustration center instead of world origin.
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    const [cx, cy, cz] = center;

    let mesh: any;
    switch (primitive) {
      case 'box':      mesh = s3d.createBox(cx, cy, cz); break;
      case 'sphere':   mesh = s3d.createSphere(cx, cy, cz); break;
      case 'plane':    mesh = s3d.createPlane(cx, cy, cz); break;
      case 'cylinder': mesh = s3d.createCylinder(cx, cy, cz); break;
      case 'torus':    mesh = s3d.createTorus(cx, cy, cz); break;
      case 'sprite':   mesh = sm.createSprite3D?.(cx, cy, cz, 1, 1); break;
      default: return;
    }
    this.scene3dRefreshMeshes();
    this.scene3dEnsureAnimationPlayer();
    if (mesh) {
      this.scene3dSelectMesh(mesh.id ?? mesh.nodeId);
    }
  }

  scene3dAddPolygon(): void {
    const sm = this.shapeManager as any;
    const n = Math.max(3, Math.floor(this.scene3dPolygonSides));
    const r = this.scene3dPolygonRadius;
    const points: [number, number][] = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    const mesh = sm.addPolygonMesh3D?.(center[0], center[1], center[2], points, this.scene3dPolygonHeight);
    if (mesh) {
      this.scene3dRefreshMeshes();
      this.scene3dEnsureAnimationPlayer();
      this.scene3dSelectMesh(mesh.id ?? mesh.nodeId);
    }
    this.scene3dShowPolygonForm = false;
    this.scene3dShowAddMeshMenu = false;
  }

  scene3dAddCircle(): void {
    const sm = this.shapeManager as any;
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    const mesh = sm.addCircleMesh3D?.(
      center[0], center[1], center[2],
      this.scene3dCircleRadius,
      Math.max(3, Math.floor(this.scene3dCircleSegments)),
      this.scene3dCircleHeight,
    );
    if (mesh) {
      this.scene3dRefreshMeshes();
      this.scene3dEnsureAnimationPlayer();
      this.scene3dSelectMesh(mesh.id ?? mesh.nodeId);
    }
    this.scene3dShowCircleForm = false;
    this.scene3dShowAddMeshMenu = false;
  }

  scene3dAddCylinder(): void {
    const sm = this.shapeManager as any;
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    const mesh = sm.scene3d?.createCylinder(
      cx, cy, cz,
      this.scene3dCylinderRadius,
      this.scene3dCylinderHeight,
      this.scene3dCylinderSegments,
      undefined,
      this.scene3dCylinderRadiusTop,
    );
    if (mesh) {
      this.scene3dRefreshMeshes();
      this.scene3dEnsureAnimationPlayer();
      this.scene3dSelectMesh(mesh.id ?? mesh.nodeId);
    }
    this.scene3dShowCylinderForm = false;
    this.scene3dShowAddMeshMenu = false;
  }

  scene3dRevolveAddPoint(): void {
    const last = this.scene3dRevolveProfile[this.scene3dRevolveProfile.length - 1];
    this.scene3dRevolveProfile = [...this.scene3dRevolveProfile, [last[0], last[1] + 0.2]];
  }

  scene3dRevolveRemovePoint(i: number): void {
    if (this.scene3dRevolveProfile.length <= 2) return;
    this.scene3dRevolveProfile = this.scene3dRevolveProfile.filter((_, idx) => idx !== i);
  }

  scene3dAddRevolve(): void {
    const sm = this.shapeManager as any;
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    const mesh = sm.createRevolve3D?.(cx, cy, cz, this.scene3dRevolveProfile, this.scene3dRevolveSegments);
    if (mesh) {
      this.scene3dRefreshMeshes();
      this.scene3dEnsureAnimationPlayer();
      this.scene3dSelectMesh(mesh.id ?? mesh.nodeId);
    }
    this.scene3dShowRevolveForm = false;
    this.scene3dShowAddMeshMenu = false;
  }

  scene3dTubeAddPoint(): void {
    const last = this.scene3dTubePath[this.scene3dTubePath.length - 1];
    this.scene3dTubePath = [...this.scene3dTubePath, [last[0], last[1] + 0.2, last[2]]];
    this.scene3dTubeRadii = [...this.scene3dTubeRadii, this.scene3dTubeRadii[this.scene3dTubeRadii.length - 1]];
  }

  scene3dTubeRemovePoint(i: number): void {
    if (this.scene3dTubePath.length <= 2) return;
    this.scene3dTubePath = this.scene3dTubePath.filter((_, idx) => idx !== i);
    this.scene3dTubeRadii = this.scene3dTubeRadii.filter((_, idx) => idx !== i);
  }

  scene3dAddTube(): void {
    const sm = this.shapeManager as any;
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    const mesh = sm.createTube3D?.(cx, cy, cz, this.scene3dTubePath, this.scene3dTubeRadii, this.scene3dTubeSegments);
    if (mesh) {
      this.scene3dRefreshMeshes();
      this.scene3dEnsureAnimationPlayer();
      this.scene3dSelectMesh(mesh.id ?? mesh.nodeId);
    }
    this.scene3dShowTubeForm = false;
    this.scene3dShowAddMeshMenu = false;
  }

  scene3dMetaballAddBlob(): void {
    this.scene3dMetaballBlobs = [...this.scene3dMetaballBlobs, {
      shape: 'sphere', ax: 0, ay: 0, az: 0, bx: 0, by: 0.3, bz: 0,
      radius: 0.2, blend: 0.3, subtract: false,
    }];
  }

  scene3dMetaballRemoveBlob(i: number): void {
    if (this.scene3dMetaballBlobs.length <= 1) return;
    this.scene3dMetaballBlobs = this.scene3dMetaballBlobs.filter((_, idx) => idx !== i);
  }

  scene3dAddMetaball(): void {
    const sm = this.shapeManager as any;
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    const blobs = this.scene3dMetaballBlobs.map(b => ({
      shape: b.shape,
      a: [b.ax, b.ay, b.az] as [number, number, number],
      b: [b.bx, b.by, b.bz] as [number, number, number],
      radius: b.radius,
      blend: b.blend,
      subtract: b.subtract,
    }));
    const mesh = sm.createMetaballMesh3D?.(cx, cy, cz, blobs, this.scene3dMetaballResolution, undefined, this.scene3dMetaballDecimate);
    if (mesh) {
      this.scene3dRefreshMeshes();
      this.scene3dEnsureAnimationPlayer();
      this.scene3dSelectMesh(mesh.id ?? mesh.nodeId);
    }
    this.scene3dShowMetaballForm = false;
    this.scene3dShowAddMeshMenu = false;
  }

  scene3dRandomizeCreature(): void {
    this.scene3dCreatureSeed = Math.floor(Math.random() * 99999);
  }

  scene3dAddCreature(): void {
    const sm = this.shapeManager as any;
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    const params = {
      ...this.scene3dCreatureParams,
      species: this.scene3dCreatureSpecies,
      seed: this.scene3dCreatureSeed,
    };
    const mesh = sm.createCreature3D?.(params, cx, cy, cz, this.scene3dCreatureResolution);
    if (mesh) {
      this.scene3dRefreshMeshes();
      this.scene3dEnsureAnimationPlayer();
      this.scene3dSelectMesh(mesh.id ?? mesh.nodeId);
    }
    this.scene3dShowCreatureForm = false;
    this.scene3dShowAddMeshMenu = false;
  }

  scene3dSelectMeshMulti(id: string, event: MouseEvent): void {
    if (event.shiftKey) {
      const ids = new Set(this.scene3dSelectedMeshIds);
      if (ids.has(id)) {
        ids.delete(id);
      } else {
        ids.add(id);
      }
      this.scene3dSelectedMeshIds = ids;
    } else {
      this.scene3dSelectedMeshIds = new Set([id]);
      this.scene3dSelectMesh(id);
    }
  }

  scene3dRunBoolean(op: 'union' | 'subtract' | 'intersect'): void {
    const ids = [...this.scene3dSelectedMeshIds];
    if (ids.length !== 2) return;
    const sm = this.shapeManager as any;
    sm.beginSceneGraphBatch3D?.();
    const result = sm.booleanMesh3D?.(ids[0], ids[1], op, { keepOperands: false });
    sm.endSceneGraphBatch3D?.();
    this.scene3dSelectedMeshIds = new Set();
    this.scene3dRefreshMeshes();
    if (result) {
      const resultId = result.id ?? result.nodeId;
      this.scene3dSelectedMeshIds = new Set([resultId]);
      this.scene3dSelectMesh(resultId);
      sm.mergeByDistance3D?.(resultId, 0.001);
    }
  }

  scene3dOpenCharacterForm(): void {
    this.scene3dShowCharacterForm = !this.scene3dShowCharacterForm;
    this.scene3dShowPolygonForm = false;
    this.scene3dShowCircleForm = false;
    if (this.scene3dShowCharacterForm) {
      this._fireCharPreview();
    } else {
      (this.shapeManager as any).clearProceduralBodyPreview3D?.();
    }
  }

  scene3dPreviewCharacter(): void {
    this._fireCharPreview();
  }

  private _fireCharPreview(): void {
    (this.shapeManager as any).previewProceduralBody3D?.({
      height:      this.scene3dCharHeight,
      legLength:   this.scene3dCharLegLength,
      limbThick:   this.scene3dCharLimbThick,
      torsoThick:  this.scene3dCharTorsoThick,
      torsoLength: this.scene3dCharTorsoLength,
      headSize:    this.scene3dCharHeadSize,
    });
  }

  private _rnd(min: number, max: number): number {
    return Math.round((min + Math.random() * (max - min)) * 100) / 100;
  }

  private _pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private _varyColorLightness(hex: string, delta: number): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    const r = parseInt(hex.slice(1,3),16)/255;
    const g = parseInt(hex.slice(3,5),16)/255;
    const b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h = 0, s = 0, l = (max+min)/2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d/(2-max-min) : d/(max+min);
      if (max === r) h = ((g-b)/d + (g<b?6:0))/6;
      else if (max === g) h = ((b-r)/d + 2)/6;
      else h = ((r-g)/d + 4)/6;
    }
    l = Math.max(0.10, Math.min(0.90, l + delta));
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p+(q-p)*6*t;
      if (t < 1/2) return q;
      if (t < 2/3) return p+(q-p)*(2/3-t)*6;
      return p;
    };
    let nr: number, ng: number, nb: number;
    if (s === 0) { nr = ng = nb = l; }
    else {
      const q = l < 0.5 ? l*(1+s) : l+s-l*s;
      const p = 2*l - q;
      nr = hue2rgb(p,q,h+1/3); ng = hue2rgb(p,q,h); nb = hue2rgb(p,q,h-1/3);
    }
    const toHex = (x: number) => Math.round(x*255).toString(16).padStart(2,'0');
    return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
  }

  private _randomizeCharacterInputs(biasBodyId?: string | null) {

    const skinTones    = ['#f5c5a3','#e8b492','#d9956b','#c07846','#8d5633','#6b3a22','#f2d5b0','#fce4cc','#a0724f','#7a4f2d'] as const;
    const hairColors   = ['#1a0a00','#3d1a00','#6b3a1f','#9b6b3a','#c49a6c','#e8c87a','#f5e6c8','#cc3300','#990033','#4a0066','#1a1a66','#005533','#444444','#888888','#cccccc','#80bc80','#ff6699','#ff9900'] as const;
    const eyeColors    = ['#6d523b','#4a7c59','#3a5f8a','#6b4a8a','#8a6a3a','#2a5a3a','#5a3a6b','#8a4a2a','#3a6b8a','#1a6b4a'] as const;
    const accentColors = ['#80bc80','#bc8080','#8080bc','#bc80bc','#80bcbc','#bcbc80','#bc9060','#60bc90'] as const;
    const shoeColors   = ['#1a1a1a','#2d2d2d','#4a3728','#6b4c35','#8b6848','#c4a882','#f5f5f5','#2c3e6b','#8b4513','#d2691e'] as const;
    const sockColors   = ['#ffffff','#f5f5f5','#e0e0e0','#cccccc','#1a1a1a','#2d2d2d','#8b3a3a','#3a5a8b','#3a6b3a','#6b3a6b','#d4a574'] as const;
    const clothPairs   = [
      ['#419041','#315e31'], ['#404763','#030407'], ['#c0392b','#8e2020'],
      ['#2980b9','#1a5276'], ['#8e44ad','#4a235a'], ['#e67e22','#7d5a0a'],
      ['#16a085','#0e6655'], ['#2c3e50','#1a1a2e'], ['#f39c12','#876500'],
      ['#d35400','#7a2e00'], ['#1abc9c','#0a6b50'], ['#e74c3c','#6b1010'],
      ['#9b59b6','#5b2c6f'], ['#3498db','#1a4a7a'], ['#f1c40f','#7d6608'],
      ['#e8d5b0','#9a8060'], ['#34495e','#1a2530'], ['#bdc3c7','#7f8c8d'],
    ] as const;

    const eyeIris    = this._pick(eyeColors);
    const [topColor, topTrim]       = this._pick(clothPairs);
    const [bottomColor, bottomTrim] = this._pick(clothPairs);
    const tailStyle   = this._pick(['none','twin','pony','pig'] as const);
    const bottomStyle = this._pick(['skirt','shorts','pants'] as const);
    const bottomLen   = bottomStyle === 'shorts' ? this._rnd(0.35, 0.50)
                      : bottomStyle === 'pants'  ? this._rnd(0.60, 1.00)
                      :                            this._rnd(0.60, 1.40);

    const hairOverride = {
      hairMode:        'cards' as const,
      cardifyCap:      true,
      verticalOffset:  this._rnd(0.60, 0.80),
      capThickness:    this._rnd(-0.20, 0.15),
      backLength:      this._rnd(0.00, 4.00),
      crownRound:      this._rnd(0.00, 0.40),
      hairlineFront:   this._rnd(0.00, 0.40),
      partingStyle:    this._pick(['fringe','parted','swept'] as const),
      partingPosition: this._rnd(-0.50, 0.50),
      partingWidth:    this._rnd(0.10, 0.40),
      bangCount:       0,
      sideLock:        Math.random() < 0.5,
      sideLockLength:  this._rnd(0.30, 2.00),
      sideLockWidth:   this._rnd(0.05, 0.25),
      sideLockCount:   Math.round(this._rnd(1, 4)),
      tailStyle,
      tailHeight:      this._rnd(-0.20, 0.70),
      tailSpread:      this._rnd(0.20, 0.90),
      tailLength:      this._rnd(1.00, 5.50),
      tailThickness:   this._rnd(0.15, 0.70),
      tailTaper:       this._rnd(0.20, 1.00),
      tailCurl:        this._rnd(-0.80, 0.80),
      tailTip:         this._pick(['point','flare','blunt'] as const),
      rootColor:       this._pick(hairColors),
      tipColor:        this._pick(hairColors),
      gradient:        true,
      tipFade:         this._rnd(0.30, 1.00),
      chunkiness:      this._rnd(0.30, 1.00),
    };

    const eyeWidth = this._rnd(0.15, 0.45);
    const eyeOverride = {
      spacing:            this._rnd(0.30, 0.50),
      verticalPos:        this._rnd(0.35, 0.75),
      width:              eyeWidth,
      height:             this._rnd(0.10, eyeWidth * 0.70),
      tilt:               this._rnd(-0.30, 0.30),
      roundness:          this._rnd(0.30, 1.00),
      irisRadius:         this._rnd(0.50, 0.90),
      irisGradient:       true,
      irisColorTop:       eyeIris,
      irisColorBottom:    eyeIris,
      irisColor:          eyeIris,
      pupilRadius:        this._rnd(0.30, 0.60),
      upperLashThickness: this._rnd(0.03, 0.09),
      outerLashLength:    this._rnd(0.10, 0.60),
      lowerLash:          Math.random() < 0.40,
      doubleEyelid:       Math.random() < 0.50,
      underDeco:          Math.random() < 0.60,
      underDecoColor:     this._pick(accentColors),
      underDecoCount:     Math.round(this._rnd(1, 5)),
    };

    const topOverride = {
      hemHeight: this._rnd(-0.10, 0.85),
      gradient:  true,
      trimWidth: this._rnd(0.10, 0.45),
      baseColor: topColor,
      trimColor: topTrim,
    };

    const bottomOverride = {
      bottomStyle,
      waistWidth:  this._rnd(0.05, 0.45),
      waistHeight: this._rnd(-0.20, 0.30),
      length:      bottomLen,
      gradient:    true,
      trimWidth:   this._rnd(0.10, 0.45),
      baseColor:   bottomColor,
      trimColor:   bottomTrim,
    };

    const shoeStyle  = this._pick(['sneaker','sneaker','sneaker','boot','boot','heel'] as const);
    const shoeBase   = this._pick(shoeColors);
    const shoesOverride = {
      shoeStyle,
      soleThickness: 0.010,
      topCover:      this._rnd(0.30, 0.80),
      shaftHeight:   shoeStyle === 'boot' ? this._rnd(0.40, 1.20) : this._rnd(0.00, 0.25),
      heelHeight:    shoeStyle === 'heel' ? this._rnd(0.20, 0.70) : 0.10,
      toePoint:      this._rnd(0.00, 0.40),
      ankleCollar:   this._rnd(0.20, 0.70),
      thickness:     this._rnd(0.005, 0.015),
      baseColor:     shoeBase,
      trimColor:     this._varyColorLightness(shoeBase, this._rnd(-0.20, 0.20)),
      gradient:      Math.random() < 0.5,
      trimWidth:     this._rnd(0.10, 0.35),
      chunkiness:    this._rnd(0.30, 0.80),
    };

    const sockBase   = this._pick(sockColors);
    const sockTrimDelta = Math.random() < 0.5 ? this._rnd(0.15, 0.25) : this._rnd(-0.25, -0.15);
    const socksOverride = {
      sockStyle:  this._pick(['ankle','crew','tube'] as const),
      legHeight:  this._rnd(0.00, 0.50),
      thickness:  0.008,
      baseColor:  sockBase,
      trimColor:  this._varyColorLightness(sockBase, sockTrimDelta),
      gradient:   Math.random() < 0.4,
      trimWidth:  this._rnd(0.10, 0.30),
    };

    // Bias clothing color + silhouette from a reference character
    if (biasBodyId) {
      const sm = this.shapeManager as any;
      const refTop    = sm.getClothingParams3D?.(biasBodyId, 'top');
      const refBottom = sm.getClothingParams3D?.(biasBodyId, 'bottom');
      const nudge = () => this._rnd(-0.12, 0.12);
      if (refTop) {
        if (refTop.baseColor) (topOverride as any).baseColor = this._varyColorLightness(refTop.baseColor, this._rnd(-0.15, 0.15));
        if (refTop.trimColor)  (topOverride as any).trimColor  = this._varyColorLightness(refTop.trimColor,  this._rnd(-0.15, 0.15));
        if (refTop.hemHeight  != null) (topOverride as any).hemHeight = Math.max(-0.10, Math.min(0.85, refTop.hemHeight  + nudge()));
        if (refTop.trimWidth   != null) (topOverride as any).trimWidth  = Math.max(0.10,  Math.min(0.45, refTop.trimWidth   + nudge()));
      }
      if (refBottom) {
        if (refBottom.baseColor) (bottomOverride as any).baseColor = this._varyColorLightness(refBottom.baseColor, this._rnd(-0.15, 0.15));
        if (refBottom.trimColor) (bottomOverride as any).trimColor  = this._varyColorLightness(refBottom.trimColor, this._rnd(-0.15, 0.15));
        if (refBottom.length    != null) (bottomOverride as any).length    = Math.max(0.35, Math.min(1.40, refBottom.length    + nudge()));
        if (refBottom.trimWidth != null) (bottomOverride as any).trimWidth = Math.max(0.10, Math.min(0.45, refBottom.trimWidth + nudge()));
      }
      const refShoes = sm.getClothingParams3D?.(biasBodyId, 'shoes');
      if (refShoes?.baseColor) {
        const biasedShoeBase = this._varyColorLightness(refShoes.baseColor, this._rnd(-0.15, 0.15));
        (shoesOverride as any).baseColor = biasedShoeBase;
        (shoesOverride as any).trimColor = this._varyColorLightness(biasedShoeBase, this._rnd(-0.20, 0.20));
      }
      const refSocks = sm.getClothingParams3D?.(biasBodyId, 'socks');
      if (refSocks?.baseColor) {
        const biasedSockBase = this._varyColorLightness(refSocks.baseColor, this._rnd(-0.15, 0.15));
        const delta = Math.random() < 0.5 ? this._rnd(0.15, 0.25) : this._rnd(-0.25, -0.15);
        (socksOverride as any).baseColor = biasedSockBase;
        (socksOverride as any).trimColor = this._varyColorLightness(biasedSockBase, delta);
      }
    }

    return {
      waist:    this._rnd(0.75, 1.05),
      hipFront: this._rnd(0.60, 0.90),
      skinTone: this._pick(skinTones),
      hairOverride, eyeOverride, topOverride, bottomOverride, shoesOverride, socksOverride,
    };
  }

  scene3dCancelCharacter(): void {
    clearTimeout(this._charPreviewTimer);
    (this.shapeManager as any).clearProceduralBodyPreview3D?.();
    this.scene3dShowCharacterForm = false;
    this.scene3dShowAddMeshMenu = false;
  }

  async scene3dGenerateCharacter(): Promise<void> {
    clearTimeout(this._charPreviewTimer);
    const sm = this.shapeManager as any;
    const rnd = this._randomizeCharacterInputs(this.scene3dCharBiasBodyId);

    // Build all part params up front so we can pass them as one atomic call
    const hairParams = {
      ...(sm.getDefaultHairParams3D?.() ?? {}),
      ...this._hairParamDefaults,
      ...rnd.hairOverride,
    };
    const eyeParams = {
      ...(sm.getDefaultEyeParams3D?.() ?? {}),
      ...this._eyeParamDefaults,
      ...rnd.eyeOverride,
    };
    const topParams = {
      ...(sm.getDefaultClothingParams3D?.('top') ?? { slot: 'top' }),
      hemHeight: 0.65, gradient: true, trimWidth: 0.50,
      baseColor: this._charBodyDefaults.topColor,
      trimColor: this._charBodyDefaults.topTrim,
      ...rnd.topOverride,
    };
    const bottomParams = {
      ...(sm.getDefaultClothingParams3D?.('bottom') ?? { slot: 'bottom' }),
      bottomStyle: 'pants', waistWidth: 0.32, waistHeight: 0.50, length: 1.00, gradient: true, trimWidth: 0.50,
      baseColor: this._charBodyDefaults.bottomColor,
      trimColor: this._charBodyDefaults.bottomTrim,
      ...rnd.bottomOverride,
    };
    const shoesParams = {
      ...(sm.getDefaultClothingParams3D?.('shoes') ?? { slot: 'shoes' }),
      ...rnd.shoesOverride,
    };
    const socksParams = {
      ...(sm.getDefaultClothingParams3D?.('socks') ?? { slot: 'socks' }),
      ...rnd.socksOverride,
    };
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];

    // Single salsa call → single scene-graph event (was ~9 separate calls)
    // Suppress 2D layer-tree rebuild during the call — 3D-only ops don't touch 2D layers
    this._suppressLayerTreeRebuild = true;
    let result: any;
    try {
      result = await sm.createFullCharacter3D?.({
        body: {
          height:      this.scene3dCharHeight,
          legLength:   this.scene3dCharLegLength,
          limbThick:   this.scene3dCharLimbThick,
          torsoThick:  this.scene3dCharTorsoThick,
          torsoLength: this.scene3dCharTorsoLength,
          headSize:    this.scene3dCharHeadSize,
          waist:       rnd.waist,
          hipFront:    rnd.hipFront,
        },
        position: center,
        eyes:     eyeParams,
        hair:     hairParams,
        top:      topParams,
        bottom:   bottomParams,
        shoes:    shoesParams,
        socks:    socksParams,
        skinTone: rnd.skinTone,
      });
    } finally {
      this._suppressLayerTreeRebuild = false;
    }

    // Incremental O(1) mesh list update using nodeIds returned by createFullCharacter3D
    if (result?.nodeIds?.length) {
      for (const id of result.nodeIds as string[]) {
        const meshDesc = sm.getMesh3D?.(id);
        if (meshDesc) this.scene3dMeshes = [...this.scene3dMeshes, meshDesc];
        const nodeDesc = sm.getNode3D?.(id);
        if (nodeDesc) this.scene3dHierarchy = [...this.scene3dHierarchy, nodeDesc];
      }
      this.scene3dRefreshKeyframeTracks();
    } else {
      this.scene3dRefreshMeshes();
    }
    this.scene3dEnsureAnimationPlayer();
    if (result?.meshId) {
      this.scene3dSelectMesh(result.meshId);
      this.scene3dEditCharBodyId = result.meshId;
      sm.playSpawnReveal3D?.(result.meshId);
      // Sync UI state — no salsa API calls, createFullCharacter3D already applied everything
      this._syncCharEquipState(result.meshId, { hairParams, eyeParams, topParams, bottomParams, skinTone: rnd.skinTone });
    }
    this.scene3dShowCharacterForm = false;
    this.scene3dShowAddMeshMenu = false;
    // Trigger autosave — character creation suppressed the normal onSceneGraphChanged path
    this.scene3dMarkDirty();
  }

  private _syncCharEquipState(bodyId: string, p: {
    hairParams: any; eyeParams: any;
    topParams: any; bottomParams: any; skinTone: string;
  }): void {
    const sm = this.shapeManager as any;

    // Eyes — createFullCharacter3D created the 'Neutral' expression; just read it back
    this._refreshFaceExpressions();
    const firstExpr = this.scene3dFaceExpressions[0];
    if (firstExpr) {
      this.scene3dEyeModeMap[firstExpr.id]  = 'procedural';
      this.scene3dEyeParamsMap[firstExpr.id] = p.eyeParams;
    }

    // Hair / clothing
    this.scene3dHairParams    = p.hairParams;
    this.scene3dTopPresets    = sm.getClothingPresetNames3D?.('top')    ?? [];
    this.scene3dTopParams     = p.topParams;
    this.scene3dBottomPresets = sm.getClothingPresetNames3D?.('bottom') ?? [];
    this.scene3dBottomParams  = p.bottomParams;
    this.scene3dShoePresets   = sm.getClothingPresetNames3D?.('shoes')  ?? [];
    this.scene3dShoeParams    = sm.getClothingParams3D?.(bodyId, 'shoes') ?? null;
    this.scene3dSockPresets   = sm.getClothingPresetNames3D?.('socks')  ?? [];
    this.scene3dSockParams    = sm.getClothingParams3D?.(bodyId, 'socks') ?? null;

    // Body shape + skin tone
    this.scene3dBodyParams = sm.getBodyParams3D?.(bodyId) ?? {
      height: 0.50, legLength: 1.00, limbThick: 0.85, torsoThick: 0.90, torsoLength: 1.00, headSize: 1.25,
      bust: 1, waist: 0.90, hipWidth: 1, hipFront: 0.75, shoulderWidth: 1, buttSize: 1,
    };
    this.scene3dSkinTone   = p.skinTone;

    this.scene3dSetCharRenderStyle('cel');
  }

  // ── Building Creator ────────────────────────────────────────────────────────

  async scene3dAddBuilding(): Promise<void> {
    const sm = this.shapeManager as any;
    const result = await sm.createProceduralBuilding3D?.();
    if (!result?.id) return;
    this.scene3dRefreshMeshes();
    this.scene3dSelectMesh(result.id);
  }

  scene3dToggleEditBuildingPanel(): void {
    this.scene3dEditBuildingPanelOpen = !this.scene3dEditBuildingPanelOpen;
    this._updateGizmoPosition();
    if (this.scene3dEditBuildingPanelOpen) {
      this.scene3dEditBuildingId = this.scene3dSelectedMeshId;
      this._initBuildingParams();
    }
  }

  private _initBuildingParams(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditBuildingId;
    if (!id) return;
    const p = this.scene3dEditBlockBuildingIndex !== null
      ? sm.getBlockBuildingParams3D?.(id, this.scene3dEditBlockBuildingIndex)
      : sm.getBuildingParams3D?.(id);
    if (!p) return;
    if (p.category != null)           this.buildingCategory          = p.category;
    if (p.archetype != null)          this.buildingArchetype         = p.archetype;
    if (p.seed != null)               this.buildingSeed              = p.seed;
    if (p.floors != null)             this.buildingFloors            = p.floors;
    if (p.width != null)              this.buildingWidth             = p.width;
    if (p.depth != null)              this.buildingDepth             = p.depth;
    if (p.floorHeight != null)        this.buildingFloorHeight       = p.floorHeight;
    if (p.groundFloorHeight != null)  this.buildingGroundFloorHeight = p.groundFloorHeight;
    if (p.cornerStyle != null)        this.buildingCornerStyle       = p.cornerStyle;
    if (p.cornerAmount != null)       this.buildingCornerAmount      = p.cornerAmount;
    if (p.setbacks != null)           this.buildingSetbacks          = p.setbacks;
    if (p.setbackInset != null)       this.buildingSetbackInset      = p.setbackInset;
    if (p.podium != null)             this.buildingPodium            = p.podium;
    if (p.podiumFloors != null)       this.buildingPodiumFloors      = p.podiumFloors;
    if (p.windowStyle != null)        this.buildingWindowStyle       = p.windowStyle;
    if (p.bayWidth != null)           this.buildingBayWidth          = p.bayWidth;
    if (p.material != null)           this.buildingMaterial          = p.material;
    if (p.pilasters != null)          this.buildingPilasters         = p.pilasters;
    if (p.quoins != null)             this.buildingQuoins            = p.quoins;
    if (p.quoinStyle != null)         this.buildingQuoinStyle        = p.quoinStyle;
    if (p.cornice != null)            this.buildingCornice           = p.cornice;
    if (p.mullions != null)           this.buildingMullions          = p.mullions;
    if (p.glassTransparent != null)   this.buildingGlassTransparent  = p.glassTransparent;
    if (p.storefront != null)         this.buildingStorefront        = p.storefront;
    if (p.shopBays != null)           this.buildingShopBays          = p.shopBays;
    if (p.stallriser != null)         this.buildingStallriser        = p.stallriser;
    if (p.transom != null)            this.buildingTransom           = p.transom;
    if (p.shutter != null)            this.buildingShutter           = p.shutter;
    if (p.awning != null)             this.buildingAwning            = p.awning;
    if (p.awningStyle != null)        this.buildingAwningStyle       = p.awningStyle;
    if (p.awningStripe != null)       this.buildingAwningStripe      = p.awningStripe;
    if (p.noren != null)              this.buildingNoren             = p.noren;
    if (p.recessedEntry != null)      this.buildingRecessedEntry     = p.recessedEntry;
    if (p.rollerDoors != null)        this.buildingRollerDoors       = p.rollerDoors;
    if (p.canopy != null)             this.buildingCanopy            = p.canopy;
    if (p.lattice != null)            this.buildingLattice           = p.lattice;
    if (p.doorStyle != null)          this.buildingDoorStyle         = p.doorStyle;
    if (p.balconies != null)          this.buildingBalconies         = p.balconies;
    if (p.julietBalconies != null)    this.buildingJulietBalconies   = p.julietBalconies;
    if (p.julietScroll != null)       this.buildingJulietScroll      = p.julietScroll;
    if (p.windowTrim != null)         this.buildingWindowTrim        = p.windowTrim;
    if (p.ledges != null)             this.buildingLedges            = p.ledges;
    if (p.fireEscape != null)         this.buildingFireEscape        = p.fireEscape;
    if (p.downpipes != null)          this.buildingDownpipes         = p.downpipes;
    if (p.wallUnits != null)          this.buildingWallUnits         = p.wallUnits;
    if (p.roofStyle != null)          this.buildingRoofStyle         = p.roofStyle;
    if (p.roofPitch != null)          this.buildingRoofPitch         = p.roofPitch;
    if (p.deepEaves != null)          this.buildingDeepEaves         = p.deepEaves;
    if (p.roofClutter != null)        this.buildingRoofClutter       = p.roofClutter;
    if (p.roofPenthouse != null)      this.buildingRoofPenthouse     = p.roofPenthouse;
    if (p.roofRailing != null)        this.buildingRoofRailing       = p.roofRailing;
    if (p.roofGarden != null)         this.buildingRoofGarden        = p.roofGarden;
    if (p.roofDishes != null)         this.buildingRoofDishes        = p.roofDishes;
    if (p.roofVents != null)          this.buildingRoofVents         = p.roofVents;
    if (p.helipad != null)            this.buildingHelipad           = p.helipad;
    if (p.crown != null)              this.buildingCrown             = p.crown;
    if (p.signage != null)            this.buildingSignage           = p.signage;
    if (p.bladeSign != null)          this.buildingBladeSign         = p.bladeSign;
    if (p.wrapSign != null)           this.buildingWrapSign          = p.wrapSign;
    if (p.rooftopSign != null)        this.buildingRooftopSign       = p.rooftopSign;
    if (p.ledScreen != null)          this.buildingLedScreen         = p.ledScreen;
    if (p.neon != null)               this.buildingNeon              = p.neon;
    const col = (v: unknown) => this._buildingColorToHex(v);
    if (p.baseColor != null)          this.buildingBaseColor         = col(p.baseColor);
    if (p.trimColor != null)          this.buildingTrimColor         = col(p.trimColor);
    if (p.roofColor != null)          this.buildingRoofColor         = col(p.roofColor);
    if (p.glassColor != null)         this.buildingGlassColor        = col(p.glassColor);
    if (p.accentColor != null)        this.buildingAccentColor       = col(p.accentColor);
    if (p.signColor != null)          this.buildingSignColor         = col(p.signColor);
    if (p.storefrontColor != null)    this.buildingStorefrontColor   = col(p.storefrontColor);
    if (p.awningColor != null)        this.buildingAwningColor       = col(p.awningColor);
    if (p.doorColor != null)          this.buildingDoorColor         = col(p.doorColor);
    if (p.doorFrameColor != null)     this.buildingDoorFrameColor    = col(p.doorFrameColor);
    if (p.doorHandleColor != null)    this.buildingDoorHandleColor   = col(p.doorHandleColor);
    if (p.julietColor != null)        this.buildingJulietColor       = col(p.julietColor);
    if (p.windowTrimColor != null)    this.buildingWindowTrimColor   = col(p.windowTrimColor);
    if (p.renderStyle != null)        this.buildingRenderStyle       = p.renderStyle;
    if (p.nightWindows != null)       this.buildingNightWindows      = p.nightWindows;
    if (p.baseHedge != null)          this.buildingBaseHedge         = p.baseHedge;
    if (p.vines != null)              this.buildingVines             = p.vines;
    if (p.windowBoxes != null)        this.buildingWindowBoxes       = p.windowBoxes;
    if (p.basePlanters != null)       this.buildingBasePlanters      = p.basePlanters;
    if (p.greeneryColor != null)      this.buildingGreeneryColor     = col(p.greeneryColor);
    if (p.bloomColor != null)         this.buildingBloomColor        = col(p.bloomColor);
    this.scene3dBuildingArchetypes = sm.buildingArchetypeNames3D?.() ?? [];
    this._refreshBuildingScaleInfo();
  }

  scene3dApplyBuildingParam(field: string, value: unknown): void {
    const v = (field.endsWith('Color') && typeof value === 'string')
      ? (() => { const c = this._hexToRgba01(value); return [c.r, c.g, c.b]; })()
      : value;
    const sm = this.shapeManager as any;
    if (this.scene3dEditBlockBuildingIndex !== null && this.scene3dEditBlockId) {
      sm.setBlockBuildingParams3D?.(this.scene3dEditBlockId, this.scene3dEditBlockBuildingIndex, { [field]: v });
      return;
    }
    const id = this.scene3dEditBuildingId;
    if (!id) return;
    sm.setBuildingParams3D?.(id, { [field]: v });
  }

  scene3dRandomizeBuildingSeed(): void {
    this.buildingSeed = ((Math.random() * 9999) | 0) + 1;
    this.scene3dApplyBuildingParam('seed', this.buildingSeed);
  }

  scene3dDeleteBuilding(): void {
    const id = this.scene3dEditBuildingId;
    if (!id) return;
    (this.shapeManager as any).removeBuilding3D?.(id);
    this.scene3dEditBuildingPanelOpen = false;
    this.scene3dEditBuildingId = null;
    this.scene3dSelectedMeshId = null;
    this.scene3dSelectedIsBuilding = false;
    this.scene3dRefreshMeshes();
    this._updateGizmoPosition();
  }

  private _refreshBuildingScaleInfo(): void {
    const id = this.scene3dEditBuildingId;
    if (!id) return;
    this.buildingScaleInfo = (this.shapeManager as any).getBuildingScaleInfo3D?.(id) ?? null;
    if (this.buildingScaleInfo) this.buildingUnitsPerMetre = this.buildingScaleInfo.scale;
  }

  scene3dApplyBuildingScale(): void {
    const id = this.scene3dEditBuildingId;
    if (!id) return;
    (this.shapeManager as any).setBuildingScale3D?.(id, this.buildingUnitsPerMetre);
    this._refreshBuildingScaleInfo();
  }

  scene3dFrameBuilding(): void {
    const id = this.scene3dEditBuildingId;
    if (!id) return;
    (this.shapeManager as any).frameBuilding3D?.(id);
  }

  // ── Foliage Creator ─────────────────────────────────────────────────────────

  async scene3dAddFoliage(): Promise<void> {
    const sm = this.shapeManager as any;
    const result = await sm.createProceduralFoliage3D?.();
    if (!result?.id) return;
    this.scene3dRefreshMeshes();
    this.scene3dSelectMesh(result.id);
  }

  scene3dToggleEditFoliagePanel(): void {
    this.scene3dEditFoliagePanelOpen = !this.scene3dEditFoliagePanelOpen;
    this._updateGizmoPosition();
    if (this.scene3dEditFoliagePanelOpen) {
      this.scene3dEditFoliageId = this.scene3dSelectedMeshId;
      this._initFoliageParams();
    }
  }

  private _initFoliageParams(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditFoliageId;
    if (!id) return;
    const p = sm.getFoliageParams3D?.(id);
    if (!p) return;
    const col = (v: unknown) => this._buildingColorToHex(v);
    if (p.type != null)         this.foliageType         = p.type;
    if (p.seed != null)         this.foliageSeed         = p.seed;
    if (p.size != null)         this.foliageSize         = p.size;
    if (p.width != null)        this.foliageWidth        = p.width;
    if (p.density != null)      this.foliageDensity      = p.density;
    if (p.render != null)       this.foliageRender       = p.render;
    if (p.celShade != null)     this.foliageCelShade     = p.celShade;
    if (p.bloom != null)        this.foliageBloom        = p.bloom;
    if (p.potMaterial != null)  this.foliagePotMaterial  = p.potMaterial;
    if (p.foliageColor != null) this.foliageColor        = col(p.foliageColor);
    if (p.tipColor != null)     this.foliageTipColor     = col(p.tipColor);
    if (p.bloomColor != null)   this.foliageBloomColor   = col(p.bloomColor);
    if (p.potColor != null)     this.foliagePotColor     = col(p.potColor);
    if (p.trunkColor != null)   this.foliageTrunkColor   = col(p.trunkColor);
    if (p.bladeCurve != null)       this.bladeCurve           = p.bladeCurve;
    if (p.bladeTwist != null)       this.bladeTwist           = p.bladeTwist;
    if (p.bladeFold  != null)       this.bladeFold            = p.bladeFold;
    if (p.bladeLod   != null)       this.bladeLod             = p.bladeLod;
    if (p.bloomStart != null)       this.foliageBloomStart      = p.bloomStart;
    if (p.bloomScaleCurve != null)  this.foliageBloomScaleCurve = p.bloomScaleCurve;
    if (p.petalPitch != null)       this.foliagePetalPitch      = p.petalPitch;
    if (p.petalShape != null)       this.foliagePetalShape      = p.petalShape;
    if (p.branches != null)         this.foliageBranches        = p.branches;
    if (p.flowerLod != null)        this.foliageFlowerLod       = p.flowerLod;
    if (p.petalColor != null)       this.foliagePetalColor      = col(p.petalColor);
    if (p.centerColor != null)      this.foliageCenterColor     = col(p.centerColor);
    if (p.branchLevels != null)     this.branchLevels           = p.branchLevels;
    if (p.branchGnarl != null)      this.branchGnarl            = p.branchGnarl;
    if (p.branchUpBias != null)     this.branchUpBias           = p.branchUpBias;
    if (p.stemCount != null)        this.foliageStemCount       = p.stemCount;
    if (p.canopyIrregular != null)  this.canopyIrregular        = p.canopyIrregular;
    if (p.leafGaps != null)         this.leafGaps               = p.leafGaps;
    if (p.hedgeSprigs != null)      this.hedgeSprigs            = p.hedgeSprigs;
    if (p.branchLod != null)        this.branchLod              = p.branchLod;
    if (p.spill != null)            this.foliageSpill           = p.spill;
    if (p.plantCount != null)       this.foliagePlantCount      = p.plantCount;
    if (p.soilColor != null)        this.foliageSoilColor       = col(p.soilColor);
    if (p.plantLod != null)         this.foliagePlantLod        = p.plantLod;
    if (p.ivyMode != null)          this.ivyMode                = p.ivyMode;
    if (p.areaWidth != null)        this.ivyAreaWidth           = p.areaWidth;
    if (p.areaHeight != null)       this.ivyAreaHeight          = p.areaHeight;
    if (p.leafDensity != null)      this.ivyLeafDensity         = p.leafDensity;
    if (p.coverage != null)         this.ivyCoverage            = p.coverage;
    if (p.growthBias != null)       this.ivyGrowthBias          = p.growthBias;
    if (p.wander != null)           this.ivyWander              = p.wander;
    if (p.stemColor != null)        this.ivyStemColor           = col(p.stemColor);
    if (p.runnerLod != null)        this.ivyRunnerLod           = p.runnerLod;
  }

  scene3dApplyFoliageParam(field: string, value: unknown): void {
    const id = this.scene3dEditFoliageId;
    if (!id) return;
    const v = (field.endsWith('Color') && typeof value === 'string')
      ? (() => { const c = this._hexToRgba01(value); return [c.r, c.g, c.b]; })()
      : value;
    (this.shapeManager as any).setFoliageParams3D?.(id, { [field]: v });
  }

  scene3dRandomizeFoliageSeed(): void {
    this.foliageSeed = ((Math.random() * 9999) | 0) + 1;
    this.scene3dApplyFoliageParam('seed', this.foliageSeed);
  }

  scene3dDeleteFoliage(): void {
    const id = this.scene3dEditFoliageId;
    if (!id) return;
    (this.shapeManager as any).removeFoliage3D?.(id);
    this.scene3dEditFoliagePanelOpen = false;
    this.scene3dEditFoliageId = null;
    this.scene3dSelectedMeshId = null;
    this.scene3dSelectedIsFoliage = false;
    this.scene3dRefreshMeshes();
    this._updateGizmoPosition();
  }

  // ── Decal tool ───────────────────────────────────────────────────────────────

  scene3dToggleDecalTool(): void {
    if (this.scene3dDecalToolActive) {
      this.scene3dDecalToolActive = false;
      (this.shapeManager as any).exitDecalPlaceMode3D?.();
    } else {
      this.scene3dDecalToolActive = true;
      this._refreshDecalEphemeraCategories();
    }
  }

  private _refreshDecalEphemeraCategories(): void {
    const sm = this.shapeManager as any;
    this.decalEphemeraCategories = sm.getEphemeraCategories?.() ?? [];
    if (this.decalEphemeraCategories.length && !this.decalActiveCategoryId) {
      this.selectDecalCategory(this.decalEphemeraCategories[0].id);
    } else if (this.decalActiveCategoryId) {
      this.selectDecalCategory(this.decalActiveCategoryId);
    }
  }

  selectDecalCategory(id: string): void {
    this.decalActiveCategoryId = id;
    const sm = this.shapeManager as any;
    this.decalEphemeraGenerators = sm.getEphemeraGeneratorsByCategory?.(id) ?? [];
    if (this.decalEphemeraGenerators.length) {
      this.selectDecalGenerator(this.decalEphemeraGenerators[0].typeId);
    }
  }

  selectDecalGenerator(typeId: string): void {
    this.decalActiveTypeId = typeId;
    const sm = this.shapeManager as any;
    const gen = sm.getEphemeraGenerator?.(typeId);
    this.decalEphemeraSchema = gen?.getParamSchema?.() ?? [];
    this.decalEphemeraParams = {};
    for (const s of this.decalEphemeraSchema) {
      this.decalEphemeraParams[s.key] = s.default;
    }
    if (this.scene3dDecalToolActive) this._enterDecalPlaceMode();
  }

  onDecalEphemeraParamChange(key: string, value: any, type: string): void {
    this.decalEphemeraParams[key] = (type === 'range' || type === 'seed') ? +value : value;
    if (this.scene3dDecalToolActive) this._enterDecalPlaceMode();
  }

  onDecalImageUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.decalImageDataUrl = (e.target?.result as string) ?? '';
      if (this.scene3dDecalToolActive) this._enterDecalPlaceMode();
    };
    reader.readAsDataURL(file);
  }

  private _buildDecalSource(): { kind: 'ephemera'; typeId: string; params: Record<string, unknown> } | { kind: 'image'; dataUrl: string } | null {
    if (this.decalSourceTab === 'ephemera') {
      if (!this.decalActiveTypeId) return null;
      return { kind: 'ephemera', typeId: this.decalActiveTypeId, params: { ...this.decalEphemeraParams } };
    } else {
      if (!this.decalImageDataUrl) return null;
      return { kind: 'image', dataUrl: this.decalImageDataUrl };
    }
  }

  private _decalMetresPerUnit(): number {
    return (this.shapeManager as any).cityMetresPerUnit?.() ?? 15;
  }

  private _enterDecalPlaceMode(): void {
    const source = this._buildDecalSource();
    if (!source) return;
    (this.shapeManager as any).enterDecalPlaceMode3D?.(source, {
      size: this.decalSize,
      rotation: this.decalRotation,
      metresPerUnit: this._decalMetresPerUnit(),
    });
  }

  scene3dUpdateDecalSize(): void {
    const sm = this.shapeManager as any;
    const mpu = this._decalMetresPerUnit();
    if (this.scene3dDecalToolActive) {
      sm.setDecalToolSize3D?.(this.decalSize, { metresPerUnit: mpu });
    } else if (this.scene3dSelectedDecalId) {
      sm.setDecalSize3D?.(this.scene3dSelectedDecalId, this.decalSize, { metresPerUnit: mpu });
      this.scene3dMarkDirty();
    }
  }

  scene3dUpdateDecalRotation(): void {
    const sm = this.shapeManager as any;
    if (this.scene3dDecalToolActive) {
      sm.setDecalToolRotation3D?.(this.decalRotation);
    } else if (this.scene3dSelectedDecalId) {
      sm.setDecalRotation3D?.(this.scene3dSelectedDecalId, this.decalRotation);
      this.scene3dMarkDirty();
    }
  }

  scene3dDeleteDecal(): void {
    if (!this.scene3dSelectedDecalId) return;
    (this.shapeManager as any).removeDecal3D?.(this.scene3dSelectedDecalId);
    this.scene3dSelectedIsDecal = false;
    this.scene3dSelectedDecalId = null;
    this.scene3dSelectedMeshId = null;
    this.scene3dRefreshMeshes();
    this.scene3dMarkDirty();
  }

  scene3dOutlinerDeleteDecal(id: string): void {
    (this.shapeManager as any).removeDecal3D?.(id);
    if (this.scene3dSelectedDecalId === id) {
      this.scene3dSelectedIsDecal = false;
      this.scene3dSelectedDecalId = null;
      this.scene3dSelectedMeshId = null;
    }
    this.scene3dRefreshMeshes();
    this.scene3dMarkDirty();
  }

  // ── Creator Panel (generic — vending / bike-rack / bollard / …) ─────────────

  scene3dOpenCreator(typeId: string): void {
    const sm = this.shapeManager as any;
    this.activeCreatorTypeId = typeId;
    this.creatorSchemaList = sm.creatorParamSchema3D?.(typeId) ?? [];
    this.creatorParams = { ...(sm.creatorDefaults3D?.(typeId) ?? {}) };
    const result = sm.createCreator3D?.(typeId);
    this.activeCreatorId = result?.id ?? null;
    if (this.activeCreatorId) {
      sm.enterCreatorStage3D?.(this.activeCreatorId);
    }
    this.scene3dCreatorPanelOpen = true;
    this.scene3dRefreshMeshes();
    this._updateGizmoPosition();
    this.scene3dMarkDirty();
  }

  scene3dEditCreator(id: string): void {
    const sm = this.shapeManager as any;
    const typeId = sm.creatorTypeOf3D?.(id);
    if (!typeId) return;
    this.activeCreatorTypeId = typeId;
    this.activeCreatorId = id;
    this.creatorSchemaList = sm.creatorParamSchema3D?.(typeId) ?? [];
    this.creatorParams = { ...(sm.getCreatorParams3D?.(id) ?? {}) };
    sm.enterCreatorStage3D?.(id);
    this.scene3dCreatorPanelOpen = true;
    this._updateGizmoPosition();
  }

  scene3dCloseCreatorPanel(): void {
    (this.shapeManager as any).exitCreatorStage3D?.();
    this.scene3dCreatorPanelOpen = false;
    this._updateGizmoPosition();
    this.scene3dMarkDirty();
  }

  onCreatorParamChange(key: string, value: any, type: string): void {
    this.creatorParams[key] = (type === 'range' || type === 'seed') ? +value : value;
    if (this.activeCreatorId) {
      (this.shapeManager as any).setCreatorParams3D?.(this.activeCreatorId, { [key]: value });
      this.scene3dMarkDirty();
    }
  }

  scene3dDeleteCreator(): void {
    if (!this.activeCreatorId) return;
    this._removeCreatorById(this.activeCreatorId);
  }

  scene3dOutlinerDeleteCreator(id: string): void {
    this._removeCreatorById(id);
  }

  private _removeCreatorById(id: string): void {
    const sm = this.shapeManager as any;
    if (this.scene3dCreatorPanelOpen && this.activeCreatorId === id) {
      sm.exitCreatorStage3D?.();
      this.scene3dCreatorPanelOpen = false;
    }
    sm.removeCreator3D?.(id);
    if (this.activeCreatorId === id) this.activeCreatorId = null;
    this.scene3dRefreshMeshes();
    this._updateGizmoPosition();
    this.scene3dMarkDirty();
  }

  creatorGroups(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of this.creatorSchemaList) {
      const g = s.group ?? '';
      if (!seen.has(g)) { seen.add(g); out.push(g); }
    }
    return out;
  }

  schemaForGroup(group: string): any[] {
    return this.creatorSchemaList.filter(s => (s.group ?? '') === group);
  }

  get scene3dSelectedIsCreator(): boolean {
    return !!(this.scene3dSelectedMeshId && (this.shapeManager as any).isCreator3D?.(this.scene3dSelectedMeshId));
  }

  // ── Block Creator ─────────────────────────────────────────────────────────

  async scene3dCreateBlock(): Promise<void> {
    const sm = this.shapeManager as any;
    const id = await sm.createBlock3D?.();
    if (!id) return;
    this.scene3dRefreshMeshes();
    this.scene3dSelectMesh(id);
  }

  scene3dToggleEditBlockPanel(): void {
    this.scene3dEditBlockPanelOpen = !this.scene3dEditBlockPanelOpen;
    if (!this.scene3dEditBlockPanelOpen) {
      this._exitBlockBuildingEdit();
    } else {
      this.scene3dEditBlockId = this.scene3dSelectedMeshId ?? null;
      this._refreshBlockStats();
    }
    this._updateGizmoPosition();
  }

  private _refreshBlockStats(): void {
    const id = this.scene3dEditBlockId;
    if (!id) return;
    this.blockStats = (this.shapeManager as any).getBlockStats3D?.(id) ?? null;
    this._refreshBlockBuildingList();
  }

  private _refreshBlockBuildingList(): void {
    const id = this.scene3dEditBlockId;
    if (!id) return;
    const list = (this.shapeManager as any).getBlockBuildings3D?.(id) ?? [];
    this.blockBuildingList = list;
    this.blockBuildingIndices = list.map((_: any, i: number) => i);
  }

  scene3dSelectBlockBuilding(index: number): void {
    const blockId = this.scene3dEditBlockId;
    if (!blockId) return;
    this.scene3dEditBlockBuildingIndex = index;
    this.scene3dEditBuildingId = blockId;
    this._initBuildingParams();
    this.scene3dEditBlockPanelOpen = false;
    this.scene3dEditBuildingPanelOpen = true;
    this._updateGizmoPosition();
  }

  scene3dBackToBlock(): void {
    this._exitBlockBuildingEdit();
    this.scene3dEditBlockPanelOpen = true;
    this._refreshBlockStats();
    this._updateGizmoPosition();
  }

  private _exitBlockBuildingEdit(): void {
    if (this.scene3dEditBlockBuildingIndex !== null) {
      this.scene3dEditBlockBuildingIndex = null;
      this.scene3dEditBuildingId = null;
      this.scene3dEditBuildingPanelOpen = false;
    }
  }

  async scene3dAddBuildingToBlock(): Promise<void> {
    const id = this.scene3dEditBlockId;
    if (!id) return;
    await (this.shapeManager as any).addBuildingToBlock3D?.(id,
      { archetype: this.blockAddArchetype },
      { x: this.blockAddX, z: this.blockAddZ, ry: this.blockAddRy }
    );
    this._refreshBlockStats();
  }

  async scene3dRemoveBuildingFromBlock(index: number): Promise<void> {
    const id = this.scene3dEditBlockId;
    if (!id) return;
    if (this.scene3dEditBlockBuildingIndex === index) this._exitBlockBuildingEdit();
    await (this.shapeManager as any).removeBlockBuilding3D?.(id, index);
    this._refreshBlockStats();
  }

  scene3dApplyBlockScale(): void {
    const id = this.scene3dEditBlockId;
    if (!id) return;
    (this.shapeManager as any).setBlockScale3D?.(id, this.blockScale);
  }

  scene3dDeleteBlock(): void {
    const id = this.scene3dEditBlockId;
    if (!id) return;
    this._exitBlockBuildingEdit();
    (this.shapeManager as any).removeBlock3D?.(id);
    this.scene3dEditBlockPanelOpen = false;
    this.scene3dEditBlockId = null;
    this.scene3dSelectedIsBlock = false;
    this.blockStats = null;
    this.blockBuildingList = [];
    this.blockBuildingIndices = [];
    this.scene3dRefreshMeshes();
    this._updateGizmoPosition();
  }

  scene3dToggleEditCharPanel(): void {
    this.scene3dEditCharPanelOpen = !this.scene3dEditCharPanelOpen;
    this._updateGizmoPosition();
    const sm = this.shapeManager as any;
    if (this.scene3dEditCharPanelOpen) {
      this.scene3dEditCharBodyId = this.scene3dSelectedMeshId;
      this._refreshFaceExpressions();
      this.scene3dInitBodyParams();
      // Enable hair jiggle simulation while the character is being edited
      if (this.scene3dEditCharBodyId) sm.setHairSimulation3D?.(this.scene3dEditCharBodyId, true);
    } else {
      if (this.eyeDrawMode) this.scene3dExitEyeDraw();
      if (this.scene3dClothingPaintActive) this.scene3dToggleClothingPaint(this.scene3dClothingPaintActive);
      // Disable hair simulation when panel closes (idle characters cost 0 sims/frame)
      if (this.scene3dEditCharBodyId) sm.setHairSimulation3D?.(this.scene3dEditCharBodyId, false);
    }
  }

  private _refreshFaceExpressions(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) { this.scene3dFaceExpressions = []; return; }
    const face = sm.getFaceExpressions3D?.(id);
    if (!face) { this.scene3dFaceExpressions = []; return; }
    this.scene3dFaceExpressions = face.expressions ?? [];
    this.scene3dFaceActiveExprId = face.activeId ?? null;
    this.scene3dFaceBlinkExprId  = face.blinkId  ?? null;
    if (face.blink) {
      this.scene3dFaceBlinkMode = face.blink.mode   ?? 'random';
      this.scene3dFaceBlinkMin  = face.blink.minSec ?? 2.5;
      this.scene3dFaceBlinkMax  = face.blink.maxSec ?? 6.0;
      this.scene3dFaceBlinkHold = face.blink.holdMs ?? 110;
      this.scene3dAutoBlinkEnabled      = face.blink.enabled          ?? false;
      this.scene3dAutoBlinkMinSec       = face.blink.minSec           ?? 2.5;
      this.scene3dAutoBlinkMaxSec       = face.blink.maxSec           ?? 6.0;
      this.scene3dAutoBlinkHoldMs       = face.blink.holdMs           ?? 110;
      this.scene3dAutoBlinkDoubleProb   = Math.round((face.blink.doubleProbability ?? 0.15) * 100);
      this.scene3dAutoBlinkDoubleGapMin = face.blink.doubleGapMinMs   ?? 150;
      this.scene3dAutoBlinkDoubleGapMax = face.blink.doubleGapMaxMs   ?? 320;
    }
  }

  scene3dAddFaceExpression(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.ensureFace3D?.(id);
    sm.createFaceExpression3D?.(id, 'New');
    this._refreshFaceExpressions();
  }

  scene3dSetActiveFaceExpr(exprId: string): void {
    const sm = this.shapeManager as any;
    if (!this.scene3dEditCharBodyId) return;
    sm.setActiveFaceExpression3D?.(this.scene3dEditCharBodyId, exprId);
    this.scene3dFaceActiveExprId = exprId;
  }

  scene3dToggleBlinkExpr(exprId: string): void {
    const newBlink = this.scene3dFaceBlinkExprId === exprId ? null : exprId;
    const sm = this.shapeManager as any;
    if (!this.scene3dEditCharBodyId) return;
    sm.setFaceBlinkExpression3D?.(this.scene3dEditCharBodyId, newBlink);
    this.scene3dFaceBlinkExprId = newBlink;
  }

  scene3dDeleteFaceExpr(exprId: string): void {
    const sm = this.shapeManager as any;
    if (!this.scene3dEditCharBodyId) return;
    sm.deleteFaceExpression3D?.(this.scene3dEditCharBodyId, exprId);
    delete this.scene3dEyeModeMap[exprId];
    delete this.scene3dEyeParamsMap[exprId];
    clearTimeout(this._eyeParamTimers[exprId]);
    delete this._eyeParamTimers[exprId];
    this._refreshFaceExpressions();
  }

  scene3dApplyFaceBlinkConfig(): void {
    const sm = this.shapeManager as any;
    if (!this.scene3dEditCharBodyId) return;
    sm.setFaceBlinkConfig3D?.(this.scene3dEditCharBodyId, {
      mode:    this.scene3dFaceBlinkMode,
      minSec:  this.scene3dFaceBlinkMin,
      maxSec:  this.scene3dFaceBlinkMax,
      holdMs:  this.scene3dFaceBlinkHold,
    });
  }

  scene3dDrawEyes(exprId: string): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.ensureFace3D?.(id);
    this.eyeDrawMode  = true;
    this.eyeDrawExprId = exprId;
    setTimeout(() => {
      const uvCanvas = this.uvCanvasRef?.nativeElement;
      if (!uvCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      uvCanvas.width  = Math.round((window.innerWidth * 0.5 - 280) * dpr);
      uvCanvas.height = Math.round(window.innerHeight * dpr);
      const renderer = sm.createUVCanvasRenderer?.(uvCanvas);
      sm.enterEyeDrawMode3D?.(id, exprId, renderer);
      sm.frameFace3D?.(id);
    });
  }

  scene3dSwitchEyeDrawExpr(exprId: string): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    const uvCanvas = this.uvCanvasRef?.nativeElement;
    if (!uvCanvas) return;
    const renderer = sm.createUVCanvasRenderer?.(uvCanvas);
    sm.enterEyeDrawMode3D?.(id, exprId, renderer);
    this.eyeDrawExprId = exprId;
  }

  scene3dReframeFace(): void {
    if (this.scene3dEditCharBodyId) {
      (this.shapeManager as any).frameFace3D?.(this.scene3dEditCharBodyId);
    }
  }

  scene3dExitEyeDraw(): void {
    (this.shapeManager as any).exitEyeDrawMode3D?.();
    this.eyeDrawMode   = false;
    this.eyeDrawExprId = null;
  }

  scene3dSetEyeMode(exprId: string, mode: 'draw' | 'procedural'): void {
    this.scene3dEyeModeMap[exprId] = mode;
    if (mode === 'procedural') {
      if (this.eyeDrawMode && this.eyeDrawExprId === exprId) {
        (this.shapeManager as any).exitEyeDrawMode3D?.();
        this.eyeDrawMode = false;
        this.eyeDrawExprId = null;
      }
      const sm = this.shapeManager as any;
      const id = this.scene3dEditCharBodyId;
      if (!id) return;
      const existing = sm.getFaceExpressionParams3D?.(id, exprId);
      const base = sm.getDefaultEyeParams3D?.() ?? {};
      this.scene3dEyeParamsMap[exprId] = existing ?? { ...base, ...this._eyeParamDefaults };
      this._applyProceduralEyes(exprId);
    }
  }

  scene3dEyeParamChanged(exprId: string): void {
    clearTimeout(this._eyeParamTimers[exprId]);
    this._eyeParamTimers[exprId] = setTimeout(() => this._applyProceduralEyes(exprId), 50);
  }

  private _applyProceduralEyes(exprId: string): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    const p = this.scene3dEyeParamsMap[exprId];
    if (!id || !p) return;
    sm.setFaceExpressionProcedural3D?.(id, exprId, p);
  }

  scene3dGazePadPointerDown(event: PointerEvent, el: HTMLElement): void {
    this._gazePointerActive = true;
    el.setPointerCapture(event.pointerId);
    this._updateGaze(event, el);
  }

  scene3dGazePadPointerMove(event: PointerEvent, el: HTMLElement): void {
    if (!this._gazePointerActive) return;
    this._updateGaze(event, el);
  }

  scene3dGazePadPointerUp(): void {
    this._gazePointerActive = false;
  }

  scene3dGazeCenter(): void {
    this.scene3dGazeX = 0;
    this.scene3dGazeY = 0;
    (this.shapeManager as any).setFaceGaze3D?.(this.scene3dEditCharBodyId, 0, 0);
  }

  private _updateGaze(event: PointerEvent, el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    this.scene3dGazeX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    this.scene3dGazeY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    (this.shapeManager as any).setFaceGaze3D?.(this.scene3dEditCharBodyId, this.scene3dGazeX, this.scene3dGazeY);
  }

  scene3dInitBodyParams(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dBodyParams = sm.getBodyParams3D?.(id) ?? {
      height: 0.50, legLength: 1.00, limbThick: 0.85, torsoThick: 0.90, torsoLength: 1.00, headSize: 1.25,
      bust: 1, waist: 0.90, hipWidth: 1, hipFront: 0.75, shoulderWidth: 1, buttSize: 1,
    };
    const tone = sm.getSkinTone3D?.(id);
    if (tone) this.scene3dSkinTone = tone;
    // Sync clothing + hair so the editor shows existing state after save/reload
    const hair = sm.getHairParams3D?.(id);
    if (hair) this.scene3dHairParams = hair;
    this.scene3dTopPresets    = sm.getClothingPresetNames3D?.('top')    ?? [];
    this.scene3dBottomPresets = sm.getClothingPresetNames3D?.('bottom') ?? [];
    this.scene3dShoePresets   = sm.getClothingPresetNames3D?.('shoes')  ?? [];
    this.scene3dTopParams         = sm.getClothingParams3D?.(id, 'top')         ?? null;
    this.scene3dBottomParams      = sm.getClothingParams3D?.(id, 'bottom')      ?? null;
    this.scene3dShoeParams        = sm.getClothingParams3D?.(id, 'shoes')       ?? null;
    this.scene3dSockParams        = sm.getClothingParams3D?.(id, 'socks')       ?? null;
    this.scene3dUndershirtParams  = sm.getClothingParams3D?.(id, 'undershirt')  ?? null;
    this.scene3dUnderpantsParams  = sm.getClothingParams3D?.(id, 'underpants')  ?? null;
    // Load existing patterns from params.pattern (persists through rebuilds)
    for (const slot of ['top', 'bottom', 'shoes', 'socks', 'undershirt', 'underpants']) {
      const slotParams = this._getClothingParamsBySlot(slot);
      const p = slotParams?.pattern;
      if (p?.mode) {
        this.scene3dClothingPattern[slot] = {
          mode: p.mode,
          colorHex: typeof p.secondaryColor === 'string' ? p.secondaryColor : '#333333',
          freq: p.freq ?? 10,
          angleDeg: Math.round((p.angle ?? 0) * 180 / Math.PI),
          scale: p.scale ?? 0.5,
        };
      } else {
        this.scene3dClothingPattern[slot] = { mode: '', colorHex: '#333333', freq: 10, angleDeg: 0, scale: 0.5 };
      }
    }
    this.scene3dRefreshAttachments();
    // Default idle on so the character breathes in the standing preview
    if (!this.scene3dIdleEnabled) {
      this.scene3dIdleEnabled = true;
      sm.setIdleAnimation3D?.(id, true);
    }
    this.scene3dLegIdleMode = sm.getLegIdleMode3D?.(id) ?? 'fk';
  }

  readonly scene3dPatternPresets = ['Pinstripe', 'Stripes', 'Diagonal', 'Polka Dots', 'Micro Dots', 'Argyle', 'Harlequin', 'Checkerboard', 'Gingham', 'Grid', 'Graph'];

  private _getClothingParamsBySlot(slot: string): any {
    if (slot === 'top') return this.scene3dTopParams;
    if (slot === 'bottom') return this.scene3dBottomParams;
    if (slot === 'shoes') return this.scene3dShoeParams;
    if (slot === 'socks') return this.scene3dSockParams;
    if (slot === 'undershirt') return this.scene3dUndershirtParams;
    if (slot === 'underpants') return this.scene3dUnderpantsParams;
    return null;
  }

  scene3dApplyPatternPreset(slot: string, presetName: string): void {
    if (!presetName) return;
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    const params = this._getClothingParamsBySlot(slot);
    if (!params) return;
    const preset = sm.clothingPatternPreset3D?.(presetName);
    if (!preset) return;
    params.pattern = preset;
    this.scene3dClothingPattern[slot] = {
      mode: preset.mode ?? '',
      colorHex: typeof preset.secondaryColor === 'string' ? preset.secondaryColor : '#333333',
      freq: preset.freq ?? 10,
      angleDeg: Math.round((preset.angle ?? 0) * 180 / Math.PI),
      scale: preset.scale ?? 0.5,
    };
    this.scene3dClothingParamChanged(slot as any);
    this.scene3dMarkDirty();
  }

  scene3dApplyClothingPattern(slot: string): void {
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    const p = this.scene3dClothingPattern[slot];
    if (!p) return;
    const params = this._getClothingParamsBySlot(slot);
    if (!params) return;
    if (!p.mode) {
      params.pattern = undefined;
    } else {
      params.pattern = {
        mode: p.mode,
        secondaryColor: p.colorHex,
        freq: p.freq,
        angle: p.angleDeg * Math.PI / 180,
        scale: p.scale,
        spacing: 0,
      };
    }
    this.scene3dClothingParamChanged(slot as any);
    this.scene3dMarkDirty();
  }

  scene3dToggleIdle(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId ?? this.scene3dSelectedMeshId;
    if (!id) return;
    this.scene3dIdleEnabled = !this.scene3dIdleEnabled;
    sm.setIdleAnimation3D?.(id, this.scene3dIdleEnabled);
    if (!this.scene3dIdleEnabled) {
      this.scene3dIdleBreaksEnabled = false;
      sm.setIdleBreaks3D?.(id, { enabled: false });
    }
  }

  scene3dToggleIdleBreaks(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId ?? this.scene3dSelectedMeshId;
    if (!id) return;
    this.scene3dIdleBreaksEnabled = !this.scene3dIdleBreaksEnabled;
    sm.setIdleBreaks3D?.(id, {
      enabled: this.scene3dIdleBreaksEnabled,
      minSec: this.scene3dIdleBreaksMinSec,
      maxSec: this.scene3dIdleBreaksMaxSec,
    });
  }

  scene3dApplySquashStretch(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId ?? this.scene3dSelectedMeshId;
    if (!id) return;
    sm.setSquashStretch3D?.(id, {
      enabled:   this.scene3dSquashStretchEnabled,
      intensity: this.scene3dSquashStretchIntensity,
    });
  }

  scene3dSetLegIdleMode(mode: 'fk' | 'ik' | 'none'): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId ?? this.scene3dSelectedMeshId;
    if (!id) return;
    this.scene3dLegIdleMode = mode;
    sm.setLegIdleMode3D?.(id, mode);
  }

  scene3dApplyAutoBlink(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.setAutoBlink3D?.(id, {
      enabled:           this.scene3dAutoBlinkEnabled,
      minSec:            this.scene3dAutoBlinkMinSec,
      maxSec:            this.scene3dAutoBlinkMaxSec,
      holdMs:            this.scene3dAutoBlinkHoldMs,
      doubleProbability: this.scene3dAutoBlinkDoubleProb / 100,
      doubleGapMinMs:    this.scene3dAutoBlinkDoubleGapMin,
      doubleGapMaxMs:    this.scene3dAutoBlinkDoubleGapMax,
    });
  }

  scene3dInstallDefaultAnimations(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.installDefaultAnimations3D?.(id);
  }

  scene3dBodyParamChanged(): void {
    clearTimeout(this._bodyParamTimer);
    this._bodyParamTimer = setTimeout(() => {
      const sm = this.shapeManager as any;
      const id = this.scene3dEditCharBodyId;
      if (!id || !this.scene3dBodyParams) return;
      sm.setBodyParams3D?.(id, this.scene3dBodyParams);
    }, 10);
  }

  scene3dSkinToneChanged(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.setSkinTone3D?.(id, this.scene3dSkinTone);
  }

  scene3dBakeHair(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.bakeHairToPart3D?.(id);
  }

  scene3dInitHair(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    const existing = sm.getHairParams3D?.(id);
    const base = sm.getDefaultHairParams3D?.() ?? {};
    this.scene3dHairParams = existing ?? { ...base, ...this._hairParamDefaults };
    sm.setHairParams3D?.(id, this.scene3dHairParams);
  }

  scene3dSetHairMode(mode: 'chunky' | 'cards'): void {
    if (!this.scene3dHairParams) return;
    this.scene3dHairParams = { ...this.scene3dHairParams, hairMode: mode, ...(mode === 'cards' ? { cardifyCap: true } : {}) };
    this.scene3dHairParamChanged();
  }

  scene3dHairParamChanged(): void {
    clearTimeout(this._hairParamTimer);
    this._hairParamTimer = setTimeout(() => {
      const sm = this.shapeManager as any;
      const id = this.scene3dEditCharBodyId;
      if (!id || !this.scene3dHairParams) return;
      sm.setHairParams3D?.(id, this.scene3dHairParams);
    }, 10);
  }

  scene3dRemoveHair(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.removeHair3D?.(id);
    this.scene3dHairParams = null;
  }

  scene3dInitClothing(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants'): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    if (slot === 'top') {
      this.scene3dTopPresets = sm.getClothingPresetNames3D?.('top') ?? [];
      const existing = sm.getClothingParams3D?.(id, 'top');
      this.scene3dTopParams = existing ?? { ...(sm.getDefaultClothingParams3D?.('top') ?? { slot: 'top' }), hemHeight: 0.65, gradient: true, trimWidth: 0.50, baseColor: '#419041', trimColor: '#315e31' };
      sm.setClothingParams3D?.(id, this.scene3dTopParams);
    } else if (slot === 'bottom') {
      this.scene3dBottomPresets = sm.getClothingPresetNames3D?.('bottom') ?? [];
      const existing = sm.getClothingParams3D?.(id, 'bottom');
      this.scene3dBottomParams = existing ?? { ...(sm.getDefaultClothingParams3D?.('bottom') ?? { slot: 'bottom' }), bottomStyle: 'pants', waistWidth: 0.32, waistHeight: 0.50, length: 1.00, gradient: true, trimWidth: 0.50, baseColor: '#404763', trimColor: '#030407' };
      sm.setClothingParams3D?.(id, this.scene3dBottomParams);
    } else if (slot === 'shoes') {
      this.scene3dShoePresets = sm.getClothingPresetNames3D?.('shoes') ?? [];
      const existing = sm.getClothingParams3D?.(id, 'shoes');
      this.scene3dShoeParams = existing ?? (sm.getDefaultClothingParams3D?.('shoes') ?? { slot: 'shoes' });
      sm.setClothingParams3D?.(id, this.scene3dShoeParams);
    } else if (slot === 'socks') {
      this.scene3dSockPresets = sm.getClothingPresetNames3D?.('socks') ?? [];
      const existing = sm.getClothingParams3D?.(id, 'socks');
      this.scene3dSockParams = existing ?? (sm.getDefaultClothingParams3D?.('socks') ?? { slot: 'socks' });
      sm.setClothingParams3D?.(id, this.scene3dSockParams);
    } else if (slot === 'undershirt') {
      this.scene3dUndershirtPresets = sm.getClothingPresetNames3D?.('undershirt') ?? [];
      const existing = sm.getClothingParams3D?.(id, 'undershirt');
      this.scene3dUndershirtParams = existing ?? (sm.getDefaultClothingParams3D?.('undershirt') ?? { slot: 'undershirt' });
      sm.setClothingParams3D?.(id, this.scene3dUndershirtParams);
      const p = this.scene3dUndershirtParams?.pattern;
      this.scene3dClothingPattern['undershirt'] = p?.mode
        ? { mode: p.mode, colorHex: typeof p.secondaryColor === 'string' ? p.secondaryColor : '#f5e6d3', freq: p.freq ?? 12, angleDeg: Math.round((p.angle ?? 0) * 180 / Math.PI), scale: p.scale ?? 0.4 }
        : { mode: '', colorHex: '#f5e6d3', freq: 12, angleDeg: 0, scale: 0.4 };
    } else {
      this.scene3dUnderpantsPresets = sm.getClothingPresetNames3D?.('underpants') ?? [];
      const existing = sm.getClothingParams3D?.(id, 'underpants');
      this.scene3dUnderpantsParams = existing ?? (sm.getDefaultClothingParams3D?.('underpants') ?? { slot: 'underpants' });
      sm.setClothingParams3D?.(id, this.scene3dUnderpantsParams);
      const p = this.scene3dUnderpantsParams?.pattern;
      this.scene3dClothingPattern['underpants'] = p?.mode
        ? { mode: p.mode, colorHex: typeof p.secondaryColor === 'string' ? p.secondaryColor : '#f5e6d3', freq: p.freq ?? 8, angleDeg: Math.round((p.angle ?? 0) * 180 / Math.PI), scale: p.scale ?? 0.5 }
        : { mode: '', colorHex: '#f5e6d3', freq: 8, angleDeg: 0, scale: 0.5 };
    }
  }

  scene3dClothingParamChanged(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants'): void {
    if (slot === 'top') {
      clearTimeout(this._clothingParamTopTimer);
      this._clothingParamTopTimer = setTimeout(() => {
        const sm = this.shapeManager as any;
        const id = this.scene3dEditCharBodyId;
        if (!id || !this.scene3dTopParams) return;
        sm.setClothingParams3D?.(id, this.scene3dTopParams);
      }, 10);
    } else if (slot === 'bottom') {
      clearTimeout(this._clothingParamBottomTimer);
      this._clothingParamBottomTimer = setTimeout(() => {
        const sm = this.shapeManager as any;
        const id = this.scene3dEditCharBodyId;
        if (!id || !this.scene3dBottomParams) return;
        sm.setClothingParams3D?.(id, this.scene3dBottomParams);
      }, 10);
    } else if (slot === 'shoes') {
      clearTimeout(this._clothingParamShoesTimer);
      this._clothingParamShoesTimer = setTimeout(() => {
        const sm = this.shapeManager as any;
        const id = this.scene3dEditCharBodyId;
        if (!id || !this.scene3dShoeParams) return;
        sm.setClothingParams3D?.(id, this.scene3dShoeParams);
      }, 10);
    } else if (slot === 'socks') {
      clearTimeout(this._clothingParamSocksTimer);
      this._clothingParamSocksTimer = setTimeout(() => {
        const sm = this.shapeManager as any;
        const id = this.scene3dEditCharBodyId;
        if (!id || !this.scene3dSockParams) return;
        sm.setClothingParams3D?.(id, this.scene3dSockParams);
      }, 10);
    } else if (slot === 'undershirt') {
      clearTimeout(this._clothingParamUndershirtTimer);
      this._clothingParamUndershirtTimer = setTimeout(() => {
        const sm = this.shapeManager as any;
        const id = this.scene3dEditCharBodyId;
        if (!id || !this.scene3dUndershirtParams) return;
        sm.setClothingParams3D?.(id, this.scene3dUndershirtParams);
      }, 10);
    } else {
      clearTimeout(this._clothingParamUnderpantsTimer);
      this._clothingParamUnderpantsTimer = setTimeout(() => {
        const sm = this.shapeManager as any;
        const id = this.scene3dEditCharBodyId;
        if (!id || !this.scene3dUnderpantsParams) return;
        sm.setClothingParams3D?.(id, this.scene3dUnderpantsParams);
      }, 10);
    }
  }

  scene3dApplyClothingPreset(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants', name: string): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id || !name) return;
    const p = sm.getClothingPreset3D?.(slot, name);
    if (!p) return;
    if (slot === 'top') this.scene3dTopParams = p;
    else if (slot === 'bottom') this.scene3dBottomParams = p;
    else if (slot === 'shoes') this.scene3dShoeParams = p;
    else if (slot === 'socks') this.scene3dSockParams = p;
    else if (slot === 'undershirt') this.scene3dUndershirtParams = p;
    else this.scene3dUnderpantsParams = p;
    sm.setClothingParams3D?.(id, p);
  }

  scene3dRemoveClothing(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants'): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.removeClothing3D?.(id, slot);
    if (slot === 'top') this.scene3dTopParams = null;
    else if (slot === 'bottom') this.scene3dBottomParams = null;
    else if (slot === 'shoes') this.scene3dShoeParams = null;
    else if (slot === 'socks') this.scene3dSockParams = null;
    else if (slot === 'undershirt') this.scene3dUndershirtParams = null;
    else this.scene3dUnderpantsParams = null;
  }

  scene3dBakeClothing(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants'): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    const label = slot === 'top' ? 'Top 1' : slot === 'bottom' ? 'Bottom 1' : slot === 'shoes' ? 'Shoes 1' : slot === 'undershirt' ? 'Undershirt 1' : slot === 'underpants' ? 'Underpants 1' : 'Socks 1';
    sm.bakeClothingToPart3D?.(id, slot, label);
  }

  scene3dSetEraseStyle(style: 'burn' | 'clean' | 'cutout'): void {
    this.scene3dEraseStyle = style;
    (this.shapeManager as any).setGarmentEraseStyle3D?.(style);
  }

  scene3dToggleStats(): void {
    this.scene3dStatsVisible = !this.scene3dStatsVisible;
    if (this.scene3dStatsVisible) {
      this.scene3dStats = (this.shapeManager as any).getRenderStats3D?.() ?? null;
      this._statsInterval = setInterval(() => {
        this.scene3dStats = (this.shapeManager as any).getRenderStats3D?.() ?? null;
      }, 250);
    } else {
      clearInterval(this._statsInterval);
      this._statsInterval = null;
      this.scene3dStats = null;
    }
  }

  scene3dStatsBudgetColor(tris: number): string {
    if (tris < 100_000) return '#4caf50';
    if (tris < 300_000) return '#ff9800';
    return '#f44336';
  }

  scene3dRefreshAttachments(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dAttachmentTypes = sm.attachmentTypeNames3D?.() ?? ['chain', 'pocket', 'pendant', 'bracelet', 'watch', 'choker', 'clip', 'flower', 'loop', 'beltloop', 'button'];
    this.scene3dAttachments = sm.listAttachments3D?.(id) ?? [];
    // Recompute grouped view (stored property — never a getter, avoids change-detection loop)
    const _groups = new Map<string, typeof this.scene3dAttachments>();
    for (const a of this.scene3dAttachments) {
      if (!_groups.has(a.type)) _groups.set(a.type, []);
      _groups.get(a.type)!.push(a);
      if (!(a.type in this.scene3dAccordionOpen)) this.scene3dAccordionOpen[a.type] = false;
      if (!(a.id in this.scene3dCharmOpen)) this.scene3dCharmOpen[a.id] = false;
    }
    this.scene3dAttachmentsByType = Array.from(_groups.entries()).map(([type, items]) => ({ type, items }));
    if (this.scene3dAttachmentTypes.length && !this.scene3dAttachmentTypes.includes(this.scene3dNewAttachmentType)) {
      this.scene3dNewAttachmentType = this.scene3dAttachmentTypes[0];
    }
  }

  private _scene3dLoopsCache: Array<{ id: string; type: string; params: any; placement: any }> | null = null;
  private _scene3dLoopsRef: any[] | null = null;
  get scene3dLoops(): Array<{ id: string; type: string; params: any; placement: any }> {
    if (this._scene3dLoopsCache && this._scene3dLoopsRef === this.scene3dAttachments) {
      return this._scene3dLoopsCache;
    }
    this._scene3dLoopsRef = this.scene3dAttachments;
    this._scene3dLoopsCache = this.scene3dAttachments.filter(a => a.type === 'loop');
    return this._scene3dLoopsCache;
  }

  private _scene3dCharBiasOptionsCache: Array<{ id: string; label: string }> | null = null;
  private _scene3dCharBiasHierarchyRef: any[] | null = null;
  get scene3dCharBiasOptions(): Array<{ id: string; label: string }> {
    if (this._scene3dCharBiasOptionsCache && this._scene3dCharBiasHierarchyRef === this.scene3dHierarchy) {
      return this._scene3dCharBiasOptionsCache;
    }
    this._scene3dCharBiasHierarchyRef = this.scene3dHierarchy;
    const opts: Array<{ id: string; label: string }> = [];
    let idx = 1;
    for (const node of this.scene3dHierarchy) {
      if (this.scene3dCharacterBodyIds.has(node.id)) {
        opts.push({ id: node.id, label: `Character ${idx++}` });
      }
    }
    this._scene3dCharBiasOptionsCache = opts;
    return opts;
  }

  scene3dAddBeltLoops(count: number = 5): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.addBeltLoops3D?.(id, count);
    this.scene3dRefreshAttachments();
    this.scene3dMarkDirty();
  }

  scene3dTogglePlacePick(): void {
    if (this.scene3dPlacingCharmType) {
      this.scene3dEndPlacePick();
    } else {
      this.scene3dStartPlacePick(this.scene3dNewAttachmentType);
    }
  }

  scene3dStartPlacePick(type: string): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dPlacingCharmType = type;
    this._showCharmPreview();
    sm.beginAttachmentPlacePick3D?.(id, type, {
      onPlaced: (placedId: string) => {
        this.scene3dRefreshAttachments();
        if (placedId) {
          this.scene3dAccordionOpen[type] = true;
          this.scene3dCharmOpen[placedId] = true;
        }
        this.scene3dMarkDirty();
      },
    });
  }

  scene3dEndPlacePick(): void {
    if (!this.scene3dPlacingCharmType && !this.scene3dDrawingChain) return;
    this.scene3dPlacingCharmType = null;
    this.scene3dDrawingChain = false;
    this.scene3dChainPickProgress = null;
    (this.shapeManager as any).endAttachmentPlacePick3D?.();
    this._hideCharmPreview();
  }

  scene3dToggleChainPick(): void {
    if (this.scene3dDrawingChain || this.scene3dPlacingCharmType) {
      this.scene3dEndPlacePick();
      return;
    }
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    this._hideCharmPreview();
    this.scene3dDrawingChain = true;
    this.scene3dChainPickProgress = 'first';
    sm.beginChainPick3D?.(id, {
      onPlaced: (chainId: string) => {
        this.scene3dDrawingChain = false;
        this.scene3dChainPickProgress = null;
        this.scene3dRefreshAttachments();
        if (chainId) {
          this.scene3dAccordionOpen['chain'] = true;
          this.scene3dCharmOpen[chainId] = true;
        }
        this.scene3dMarkDirty();
      },
      onProgress: (p: 'first' | 'second') => {
        this.scene3dChainPickProgress = p;
      },
    });
  }

  scene3dToggleCharSparkle(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dCharSparkle = !this.scene3dCharSparkle;
    sm.setCharacterSparkle3D?.(id, this.scene3dCharSparkle, this.scene3dCharSparkleMode);
  }

  scene3dSetCharSparkleMode(mode: 'glint' | 'star'): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dCharSparkleMode = mode;
    if (this.scene3dCharSparkle) {
      sm.setCharacterSparkle3D?.(id, true, mode);
    }
  }

  private _showCharmPreview(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id || !sm.showAttachmentPreview3D) return;
    sm.showAttachmentPreview3D(id, this.scene3dNewAttachmentType);
    this.scene3dPreviewActive = true;
  }

  private _hideCharmPreview(): void {
    if (!this.scene3dPreviewActive) return;
    (this.shapeManager as any).hideAttachmentPreview3D?.();
    this.scene3dPreviewActive = false;
  }

  scene3dNewAttachmentTypeChanged(type: string): void {
    this.scene3dNewAttachmentType = type;
    if (this.scene3dPreviewActive) {
      (this.shapeManager as any).updateAttachmentPreview3D?.(null, type);
    }
  }

  scene3dAddAttachment(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    let newId: string | null = null;
    if (this.scene3dPreviewActive) {
      newId = sm.commitAttachmentPreview3D?.() ?? null;
    } else {
      let placement = sm.getDefaultAttachmentPlacement3D?.(this.scene3dNewAttachmentType);
      let params    = sm.getDefaultAttachmentParams3D?.(this.scene3dNewAttachmentType);
      if (this.scene3dNewAttachmentType === 'chain') {
        placement = { ...placement, offset: [0, 0, 0.04] as [number,number,number], scale: 1.0 };
        params = { ...params, chainMode: 'dangle', linkCount: 20, thickness: 0.0015, span: 0, sag: 0, metalness: 0.40, roughness: 0.28, sparkle: false };
      }
      if (this.scene3dNewAttachmentType === 'choker') {
        params = { ...params, metalness: 1.0, roughness: 0.46, sparkle: false, position: 0.0, thickness: 0.001 };
      }
      if (this.scene3dNewAttachmentType === 'pocket') {
        params = { ...params, width: 0.08, height: 0.09 };
      }
      if (this.scene3dNewAttachmentType === 'clip') {
        params = { ...params, width: 0.02, height: 0.005, thickness: 0.002, metalness: 1.0, roughness: 0.50 };
      }
      if (this.scene3dNewAttachmentType === 'pendant') {
        placement = { ...placement, offset: [0.04, 0.02, 0.01] as [number,number,number], scale: 1.25 };
        params = { ...params, dropLength: 0.02, width: 0.01, thickness: 0.002, metalness: 1.0, roughness: 0.28, sparkle: false };
      }
      if (this.scene3dNewAttachmentType === 'watch') {
        placement = { ...placement, joint: 'lowerarm_l' };
        params = { ...params, position: 1.0, thickness: 0.001, width: 0.01, height: 0.01, metalness: 1.0, roughness: 0.28, sparkle: false };
      }
      if (this.scene3dNewAttachmentType === 'bracelet') {
        placement = { ...placement, joint: 'lowerarm_l' };
        params = { ...params, position: 0.80, thickness: 0.001, metalness: 1.0, roughness: 0.28, sparkle: false };
      }
      newId = sm.addAttachment3D?.(id, this.scene3dNewAttachmentType, placement, params) ?? null;
    }
    this.scene3dRefreshAttachments();
    if (newId) {
      this.scene3dAccordionOpen[this.scene3dNewAttachmentType] = true;
      this.scene3dCharmOpen[newId] = true;
    }
    this.scene3dMarkDirty();
    if (this.scene3dPlacingCharmType) this._showCharmPreview();
  }

  scene3dRemoveAttachment(attachId: string): void {
    const sm = this.shapeManager as any;
    sm.removeAttachment3D?.(attachId);
    delete this.scene3dCharmOpen[attachId];
    this.scene3dRefreshAttachments();
    this.scene3dMarkDirty();
  }

  scene3dRemoveAttachmentsByType(type: string): void {
    const sm = this.shapeManager as any;
    const ids = this.scene3dAttachments.filter(a => a.type === type).map(a => a.id);
    for (const id of ids) {
      sm.removeAttachment3D?.(id);
      delete this.scene3dCharmOpen[id];
    }
    delete this.scene3dAccordionOpen[type];
    this.scene3dRefreshAttachments();
    this.scene3dMarkDirty();
  }

  scene3dAttachmentParamChanged(attachId: string, params: any): void {
    clearTimeout(this._attachmentParamTimers.get(attachId));
    this._attachmentParamTimers.set(attachId, setTimeout(() => {
      (this.shapeManager as any).setAttachmentParams3D?.(attachId, params);
      this.scene3dMarkDirty();
    }, 30));
  }

  scene3dSetAttachmentPlacement(attachId: string, field: string, value: any): void {
    const a = this.scene3dAttachments.find(x => x.id === attachId);
    if (!a) return;
    if (field === 'joint') a.placement.joint = value;
    else if (field === 'scale') a.placement.scale = +value;
    else if (field === 'offsetX') a.placement.offset[0] = +value;
    else if (field === 'offsetY') a.placement.offset[1] = +value;
    else if (field === 'offsetZ') a.placement.offset[2] = +value;
    (this.shapeManager as any).setAttachmentPlacement3D?.(attachId, a.placement);
    this.scene3dMarkDirty();
  }

  scene3dToggleClothingPaint(slot: 'top' | 'bottom' | 'shoes' | 'socks'): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;

    if (this.scene3dClothingPaintActive === slot) {
      // Exit paint mode — no-arg exit is idempotent, avoids wrong-mesh-ID pitfalls
      if (this.uvEditorOpen) this.closeUVEditor();
      else {
        sm.exitUVPaintMode3D?.();
        this.scene3dClothingPaintActive = null;
        this.uvPaintMode = false;
      }
    } else {
      // Exit any active paint first
      if (this.scene3dClothingPaintActive) {
        sm.exitUVPaintMode3D?.();
      }
      const meshId = sm.getClothingMeshId3D?.(id, slot);
      if (!meshId) return;
      sm.enterUVPaintMode3D?.(meshId);
      this.scene3dClothingPaintActive = slot;
      this.uvPaintMode = true;
      // Show the UV paint panel on the right for brush controls
      if (!this.uvEditorOpen) this.uvEditorOpen = true;
    }
  }

  scene3dSetCharRimLight(on: boolean): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.setCharacterRimLight3D?.(id, on);
  }

  scene3dExportCharacterPreset(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    const json = sm.exportCharacter3D?.(id);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'character-preset.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async scene3dImportCharacterPreset(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    await sm.importCharacter3D?.(id, text);
    // Sync all UI panels from the freshly imported params
    this.scene3dInitBodyParams();
    const hair = sm.getHairParams3D?.(id);
    if (hair) this.scene3dHairParams = hair;
    this.scene3dTopParams    = sm.getClothingParams3D?.(id, 'top')    ?? this.scene3dTopParams;
    this.scene3dBottomParams = sm.getClothingParams3D?.(id, 'bottom') ?? this.scene3dBottomParams;
    this.scene3dShoeParams   = sm.getClothingParams3D?.(id, 'shoes')  ?? null;
    this.scene3dSockParams   = sm.getClothingParams3D?.(id, 'socks')  ?? null;
    const tone = sm.getSkinTone3D?.(id);
    if (tone) this.scene3dSkinTone = tone;
    (event.target as HTMLInputElement).value = '';
  }

  scene3dSetCharRenderStyle(style: string): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    this.charRenderStyle = style;
    sm.setCharacterRenderStyle3D?.(id, style);
    this.scene3dMarkDirty();
  }

  scene3dSetRenderStyleAll(style: string): void {
    (this.shapeManager as any).setRenderStyleAll3D?.(style);
    this.scene3dMarkDirty();
  }

  private _charPartMeshId(part: string): string | null {
    const sm = this.shapeManager as any;
    const id = this.scene3dEditCharBodyId;
    if (!id) return null;
    switch (part) {
      case 'body':   return id;
      case 'hair':   return sm.getHairMeshId3D?.(id) ?? null;
      case 'top':    return sm.getClothingMeshId3D?.(id, 'top') ?? null;
      case 'bottom': return sm.getClothingMeshId3D?.(id, 'bottom') ?? null;
      case 'shoes':  return sm.getClothingMeshId3D?.(id, 'shoes') ?? null;
      case 'socks':  return sm.getClothingMeshId3D?.(id, 'socks') ?? null;
      case 'eyes':   return sm.getEyesMeshId3D?.(id) ?? null;
      default:       return null;
    }
  }

  async scene3dUploadCharPartTexture(part: string, event: Event): Promise<void> {
    const meshId = this._charPartMeshId(part);
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!meshId || !file) return;
    const bitmap = await createImageBitmap(file);
    await (this.shapeManager as any).setPartTexture3D?.(meshId, bitmap);
    this.charPartTextureSet[part] = true;
    this.scene3dMarkTexLibDirty();
    (event.target as HTMLInputElement).value = '';
  }

  scene3dClearCharPartTexture(part: string): void {
    const meshId = this._charPartMeshId(part);
    if (!meshId) return;
    (this.shapeManager as any).clearPartTexture3D?.(meshId);
    this.charPartTextureSet[part] = false;
    this.scene3dMarkTexLibDirty();
  }

  scene3dSelectMesh(id: string): void {
    this.scene3dRenamingId = null;
    this._scene3dHideHandles();
    if (this.scene3dIsEditingMesh && id !== this.scene3dSelectedMeshId) {
      this.exitMeshEditMode();
    }
    this.scene3dSelectedMeshId = id;
    // Reset per-mesh state so switching between mesh types clears the flags
    this.scene3dSelectedMeshType = '';
    this.scene3dSelectedIsGroup = false;
    this.scene3dSelectedIsBuilding = false;
    this.scene3dSelectedIsPackage = false;
    this.pkgSelectedId = null;
    this.scene3dIsArrayGroup = false;
    this.scene3dLinkedArrayCount = 0;
    this.scene3dInstanceOverrides = [];
    this.scene3dBlendShapes = [];
    this.scene3dIsCloth = false;
    this.clothLiveEnabled = false;
    this.clothWindEnabled = false;
    this.windZones = [];
    this.windZoneSelectedIdx = null;
    this.scene3dIsRibbon = false;
    this.scene3dRibbonPathMode = 'normal';
    this.scene3dRibbonDoubleSided = 'double';
    this.scene3dRibbonFlipRearU = true;
    this.scene3dRibbonUvTileCount = 1;
    this.scene3dHtmlEnabled = false;
    this.scene3dHtmlContent = '';
    const s3d = (this.shapeManager as any).scene3d;
    if (!s3d) return;
    // City container thin-wrapper — O(1) path, no child iteration or mesh data loading
    if (this.scene3dCityContainerId && id === this.scene3dCityContainerId) {
      (this.shapeManager as any).world?.syncSelectionFromOutliner?.(id);
      return;
    }
    (this.shapeManager as any).setSelectedNode?.(id);
    // Detect array group before normal mesh loading — array groups use a separate panel
    if ((this.shapeManager as any).isArrayGroup3D?.(id)) {
      this.scene3dIsArrayGroup = true;
      this.scene3dSelectedIsGroup = true;
      this._scene3dSyncArrayPanel(id);
      return;
    }
    this.scene3dSelectedIsGroup = !!s3d.getMeshGroup?.(id);
    // Phase 5: count how many array groups reference this mesh as their source
    const linkedGroups = (this.shapeManager as any).getArrayGroupsForSource3D?.(id) ?? [];
    this.scene3dLinkedArrayCount = linkedGroups.length;
    const mesh = s3d.getMesh(id);
    if (mesh) {
      this.scene3dSelectedMeshType = (mesh.type ?? '').toLowerCase();
      this.scene3dMeshPosX = mesh.x ?? mesh.position?.x ?? 0;
      this.scene3dMeshPosY = mesh.y ?? mesh.position?.y ?? 0;
      this.scene3dMeshPosZ = mesh.z ?? mesh.position?.z ?? 0;
      // Engine stores radians — convert to degrees for UI
      const r2d = 180 / Math.PI;
      this.scene3dMeshRotX = (mesh.rotation?.x ?? 0) * r2d;
      this.scene3dMeshRotY = (mesh.rotation?.y ?? 0) * r2d;
      this.scene3dMeshRotZ = (mesh.rotation?.z ?? 0) * r2d;
      this.scene3dMeshScaleX = mesh.scale?.x ?? 1;
      this.scene3dMeshScaleY = mesh.scale?.y ?? 1;
      this.scene3dMeshScaleZ = mesh.scale?.z ?? 1;
      this.scene3dMeshOpacity = mesh.material?.opacity ?? mesh.opacity ?? 1;
      const d = mesh.material?.diffuse;
      this.scene3dMeshColor = d
        ? '#' + [d[0], d[1], d[2]].map((v: number) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
        : '#ffffff';
      this.scene3dDiffuseTextureSet = !!(mesh.textureLibraryId ?? mesh.diffuseTextureId ?? mesh.texture);
      this.scene3dNormalMapSet = !!mesh.normalMapLibraryId;
      this.scene3dBlendShapes = (this.shapeManager as any).getBlendShapes3D?.(id) ?? [];
      this._refreshBlendKeyframeTracks();
      this.scene3dRenderStyle = (mesh.material?.renderStyle ?? 'default') as any;
      this.scene3dMeshRoughness = mesh.material?.roughness ?? 0.5;
      this.scene3dMeshMetalness = mesh.material?.metalness ?? 0.0;
      this.scene3dMeshNoEnvReflection = mesh.material?.noEnvReflection ?? false;
      this.scene3dMeshPlanarReflector = mesh.material?.planarReflector ?? false;
      this.scene3dLoadSurfaces();
      // Load submesh slots
      const sm2 = this.shapeManager as any;
      this._scene3dReloadSubmeshes();
      // Load frame-link config from mesh if available
      const fl = sm2.getFrameLinkAnimation3D?.(id) ?? mesh.frameLinkAnimation ?? mesh.frameLink;
      if (fl) {
        this.scene3dFrameLinkEnabled = fl.enabled ?? false;
        this.scene3dFrameLinkType = fl.type ?? 'bounce';
        this.scene3dFrameLinkAxis = fl.axis ?? 'y';
        this.scene3dFrameLinkAmplitude = fl.amplitude ?? 0.15;
        this.scene3dFrameLinkFramesPerCycle = fl.framesPerCycle ?? 24;
        this.scene3dFrameLinkPhase = fl.phase ?? 0;
      } else {
        this.scene3dFrameLinkEnabled = false;
        this.scene3dFrameLinkPhase = 0;
        // Ribbons default to Scroll (UV) so the setting is ready to enable immediately
        const isRibbonMesh = !!(sm2.getRibbonData3D?.(id)
          ?? (mesh.type === 'ribbon' || mesh.type === 'Ribbon' || mesh.controlPoints ? mesh : null));
        this.scene3dFrameLinkType = isRibbonMesh ? 'scroll' : 'bounce';
        this.scene3dFrameLinkAxis = isRibbonMesh ? 'x' : 'y';
        this.scene3dFrameLinkAmplitude = isRibbonMesh ? 1.0 : 0.15;
        this.scene3dFrameLinkFramesPerCycle = isRibbonMesh ? 240 : 24;
      }
      this.scene3dFrameLinkStagger = 0;
      this.scene3dBucketSelections = [];
      // Load ribbon state — getRibbonData3D may return null on a just-restored scene,
      // so also check mesh.type and mesh.controlPoints as fallbacks.
      const ribbonData = sm2.getRibbonData3D?.(id)
        ?? (mesh.type === 'ribbon' || mesh.type === 'Ribbon' || mesh.controlPoints ? mesh : null);
      this.scene3dIsRibbon = !!ribbonData;
      if (ribbonData) {
        this.scene3dRibbonWidth = ribbonData.width ?? 0.10;
        this.scene3dRibbonSegments = ribbonData.segments ?? 16;
        this.scene3dRibbonPathMode = ribbonData.pathMode ?? 'normal';
        const ds = ribbonData.doubleSided ?? 'double';
        this.scene3dRibbonDoubleSided = ds === true ? 'double' : ds === false ? 'front' : ds;
        this.scene3dRibbonShowHandles = ribbonData.showHandles !== false;
        this.scene3dRibbonFlipRearU = ribbonData.flipRearU ?? true;
        this.scene3dRibbonUvTileCount = ribbonData.uvTileCount ?? 1;
        this.scene3dRibbonControlPoints = (ribbonData.controlPoints ?? []).map(
          (p: any) => ({ x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 })
        );
        if (this.scene3dRibbonControlPoints.length < 2) {
          this.scene3dRibbonControlPoints = [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
        }
      }
      // Show renderer-side handles after ribbon state is loaded
      setTimeout(() => this._scene3dShowHandles(), 80);
      // Load HTML texture state (including bg so quality-change re-apply preserves color)
      this.scene3dHtmlEnabled = sm2.hasHtmlTexture3D?.(id) ?? false;
      if (this.scene3dHtmlEnabled) {
        const texData = sm2.getHtmlTexture3D?.(id);
        this.scene3dHtmlContent = texData?.html ?? '';
        const savedBg: string = texData?.bg ?? '';
        this.scene3dHtmlTexBgTransparent = !savedBg;
        if (savedBg) this.scene3dHtmlTexBg = savedBg;
        if (texData?.width) this.scene3dHtmlTexWidth = texData.width;
        if (texData?.height) this.scene3dHtmlTexHeight = texData.height;
      } else {
        this.scene3dHtmlContent = '';
      }

      // Cloth detection — use API-based set populated in scene3dRefreshMeshes
      const isClothMesh = this.scene3dClothIds.has(id);
      this.scene3dIsCloth = isClothMesh;
      if (isClothMesh) {
        const cfg = s3d.getClothConfig?.(id);
        this.clothInfoGrid = cfg?.grid ?? null;
        this.clothInfoSim = mesh.simState ?? null;
        const geomResult = s3d.getClothGeometryResult?.(id);
        this.clothInfoVertexCount = geomResult?.vertexCount ?? null;
        this.clothInfoTriCount = geomResult ? Math.floor((geomResult.geometry?.indices?.length ?? 0) / 3) : null;
        // Live config
        this.clothLiveEnabled = mesh.liveConfig?.enabled ?? false;
        // Wind frame link
        const sm2 = this.shapeManager as any;
        const windAnim = sm2.getFrameLinkAnimation3D?.(id);
        if (windAnim?.type === 'wind') {
          this.clothWindEnabled = windAnim.enabled ?? false;
          this.clothWindAxis = windAnim.axis ?? 'x';
          this.clothWindAmplitude = windAnim.amplitude ?? 3.0;
          this.clothWindFramesPerCycle = windAnim.framesPerCycle ?? 48;
          this.clothWindPhase = windAnim.phase ?? 0;
        } else {
          this.clothWindEnabled = false;
          this.clothWindAxis = 'x';
          this.clothWindAmplitude = 3.0;
          this.clothWindFramesPerCycle = 48;
          this.clothWindPhase = 0;
        }
        // Load wind zones (scene-level)
        try {
          this.windZones = s3d.getWindZones?.() ?? [];
        } catch { this.windZones = []; }
      } else {
        this.clothInfoGrid = null;
        this.clothInfoSim = null;
        this.clothInfoVertexCount = null;
        this.clothInfoTriCount = null;
      }
    } else if (this.scene3dSelectedIsGroup) {
      // Load FLA from the first child as representative values for the group panel
      const sm2 = this.shapeManager as any;
      const groupNode = this.scene3dHierarchy.find((n: any) => n.id === id);
      const firstChildId: string | undefined = groupNode?.children?.[0]?.id;
      const fl = firstChildId ? sm2.getFrameLinkAnimation3D?.(firstChildId) : null;
      if (fl) {
        this.scene3dFrameLinkEnabled = fl.enabled ?? false;
        this.scene3dFrameLinkType = fl.type ?? 'bounce';
        this.scene3dFrameLinkAxis = fl.axis ?? 'y';
        this.scene3dFrameLinkAmplitude = fl.amplitude ?? 0.15;
        this.scene3dFrameLinkFramesPerCycle = fl.framesPerCycle ?? 24;
        this.scene3dFrameLinkPhase = fl.phase ?? 0;
      } else {
        this.scene3dFrameLinkEnabled = false;
        this.scene3dFrameLinkType = 'bounce';
        this.scene3dFrameLinkAxis = 'y';
        this.scene3dFrameLinkAmplitude = 0.15;
        this.scene3dFrameLinkFramesPerCycle = 24;
        this.scene3dFrameLinkPhase = 0;
      }
      this.scene3dFrameLinkStagger = 0;
      // Restore bucket selections array sized to stored buckets for this group
      const storedBuckets = this.scene3dAllGroupBuckets[id] ?? [];
      this.scene3dBucketSelections = storedBuckets.map(() => '');
    }
    this.scene3dSelectedIsBuilding = !!(this.shapeManager as any).isProceduralBuilding3D?.(id);
    if (!this.scene3dSelectedIsBuilding && this.scene3dEditBuildingPanelOpen) {
      this.scene3dEditBuildingPanelOpen = false;
      this._updateGizmoPosition();
    } else if (this.scene3dSelectedIsBuilding && this.scene3dEditBuildingPanelOpen && this.scene3dEditBuildingId !== id) {
      this.scene3dEditBuildingId = id;
      this._initBuildingParams();
    }
    this.scene3dSelectedIsFoliage = !!(this.shapeManager as any).isProceduralFoliage3D?.(id);
    if (!this.scene3dSelectedIsFoliage && this.scene3dEditFoliagePanelOpen) {
      this.scene3dEditFoliagePanelOpen = false;
      this._updateGizmoPosition();
    } else if (this.scene3dSelectedIsFoliage && this.scene3dEditFoliagePanelOpen && this.scene3dEditFoliageId !== id) {
      this.scene3dEditFoliageId = id;
      this._initFoliageParams();
    }
    this.scene3dSelectedIsBlock = !!(this.shapeManager as any).isBlock3D?.(id);
    if (!this.scene3dSelectedIsBlock && this.scene3dEditBlockPanelOpen) {
      this.scene3dEditBlockPanelOpen = false;
      this._updateGizmoPosition();
    } else if (this.scene3dSelectedIsBlock && this.scene3dEditBlockPanelOpen && this.scene3dEditBlockId !== id) {
      this.scene3dEditBlockId = id;
      this._refreshBlockStats();
    }
    this.scene3dSelectedIsDecal = this.scene3dDecalIds.has(id) || !!(this.shapeManager as any).isDecal3D?.(id);
    this.scene3dSelectedDecalId = this.scene3dSelectedIsDecal ? id : null;
    if (this.scene3dSelectedIsDecal) {
      const dp = (this.shapeManager as any).getDecalParams3D?.(id);
      if (dp) {
        if (dp.size != null) this.decalSize = dp.size;
        if (dp.rotation != null) this.decalRotation = dp.rotation;
      }
    }
    const _pkgNodeId = (this.shapeManager as any).packaging?.isPackageNode?.(id);
    this.scene3dSelectedIsPackage = !!_pkgNodeId;
    if (_pkgNodeId) this.pkgSelectedId = _pkgNodeId;
    this.scene3dSelectedIsCharacter = !!(this.shapeManager as any).isProceduralBody3D?.(id);
    if (!this.scene3dSelectedIsCharacter) {
      this.scene3dEditCharPanelOpen = false;
    } else if (this.scene3dEditCharPanelOpen && this.scene3dEditCharBodyId !== id) {
      const prevCharId = this.scene3dEditCharBodyId;
      this.scene3dEditCharBodyId = id;
      this.charSection = 'menu';
      this._refreshFaceExpressions();
      this.scene3dInitBodyParams();
      this.scene3dRefreshAttachments();
      const sm2 = this.shapeManager as any;
      if (prevCharId) sm2.setHairSimulation3D?.(prevCharId, false);
      sm2.setHairSimulation3D?.(id, true);
    }
    this.scene3dRefreshKeyframeTracks();
  }

  scene3dOpenClothBuilder(meshId?: string): void {
    const sm = this.shapeManager as any;
    if (meshId) {
      const cfg = sm.scene3d?.getClothConfig?.(meshId);
      const node = (sm.scene3d?.getMesh?.(meshId) ?? sm.scene3d?.getNode?.(meshId));
      this.clothBuilderExistingId = meshId;
      this.clothBuilderInitialGrid = cfg?.grid ?? null;
      this.clothBuilderInitialPhysics = cfg?.physics ?? null;
      this.clothBuilderInitialSimMode = node?.simState?.simulationMode ?? 'none';
      const rawPos = node?.simState?.positions;
      this.clothBuilderInitialSimPositions = rawPos ? Float32Array.from(rawPos) : null;
    } else {
      this.clothBuilderExistingId = null;
      this.clothBuilderInitialGrid = null;
      this.clothBuilderInitialPhysics = null;
      this.clothBuilderInitialSimMode = 'none';
      this.clothBuilderInitialSimPositions = null;
    }
    this.clothBuilderDropPosition = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    this.clothBuilderVisible = true;
  }

  onClothPreviewReady(meshId: string): void {
    const sm = this.shapeManager as any;
    // Try various camera focus methods — whichever Salsa exposes
    sm.focusOnMesh3D?.(meshId)
      ?? sm.lookAtMesh3D?.(meshId)
      ?? sm.zoomToNode3D?.(meshId)
      ?? sm.scene3d?.focusCamera?.(meshId);
  }

  onClothBuilderCreated(result: any): void {
    const sm = this.shapeManager as any;
    const s3d = sm.scene3d;
    if (!s3d) return;

    const { grid, physics, simulatedPositions, simMode, existingMeshId, previewMeshId, stitches, bendStiffnessMap } = result;
    let targetMeshId: string | null = null;

    if (existingMeshId) {
      s3d.replaceClothMesh?.(existingMeshId, grid, physics, simulatedPositions ?? undefined, simMode !== 'none' ? simMode : 'none');
      if (previewMeshId && previewMeshId !== existingMeshId) {
        s3d.removeNode?.(previewMeshId);
      }
      targetMeshId = existingMeshId;
    } else if (previewMeshId) {
      s3d.replaceClothMesh?.(previewMeshId, grid, physics, simulatedPositions ?? undefined, simMode !== 'none' ? simMode : 'none');
      targetMeshId = previewMeshId;
    } else {
      const center: [number,number,number] = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
      const created = s3d.createClothMesh?.(center[0], center[1], center[2], grid, physics, simulatedPositions ?? undefined, 'Cloth');
      targetMeshId = created?.id ?? created?.nodeId ?? null;
    }

    // Apply stitches
    if (targetMeshId && Array.isArray(stitches) && stitches.length > 0) {
      try {
        s3d.clearClothStitches?.(targetMeshId);
        for (const stitch of stitches) {
          s3d.addClothStitch?.(targetMeshId, stitch.a, stitch.b, stitch.restLength, stitch.side);
        }
      } catch (e) { console.warn('[Cloth] Failed to apply stitches', e); }
    }

    // Apply bend stiffness map
    if (targetMeshId && bendStiffnessMap instanceof Float32Array && bendStiffnessMap.length > 0) {
      try {
        s3d.setClothBendStiffness?.(targetMeshId, bendStiffnessMap);
      } catch (e) { console.warn('[Cloth] Failed to apply bend stiffness', e); }
    }

    this.clothBuilderVisible = false;
    this.scene3dRefreshMeshes();
    this.scene3dMarkDirty();
  }

  onClothBuilderCancelled(): void {
    this.clothBuilderVisible = false;
    this.scene3dRefreshMeshes();
  }

  async scene3dReSimulateCloth(): Promise<void> {
    const id = this.scene3dSelectedMeshId;
    if (!id) return;
    const sm = this.shapeManager as any;
    const s3d = sm.scene3d;
    if (!s3d) return;
    const cfg = s3d.getClothConfig?.(id);
    if (!cfg) return;
    const node = s3d.getMesh?.(id) ?? s3d.getNode?.(id);
    const mode: 'hang' | 'drape' = (node?.simState?.simulationMode !== 'none' ? node?.simState?.simulationMode : 'hang') ?? 'hang';
    try {
      const positions: Float32Array = await s3d.simulateCloth(cfg.grid, cfg.physics, mode);
      s3d.updateClothMeshPose?.(id, positions, mode);
      this.scene3dMarkDirty();
    } catch (e) {
      console.warn('[Cloth] Re-simulate failed', e);
    }
  }

  async setLiveCloth(enabled: boolean): Promise<void> {
    const id = this.scene3dSelectedMeshId;
    if (!id) return;
    const s3d = (this.shapeManager as any).scene3d;
    if (!s3d) return;
    if (enabled) {
      s3d.enableLiveCloth?.(id);
      this.clothLiveEnabled = true;
    } else {
      await s3d.disableLiveCloth?.(id, true);
      this.clothLiveEnabled = false;
      if (this.clothWindEnabled) {
        this.clothWindEnabled = false;
        this.applyWindAnimation();
      }
    }
    this.scene3dMarkDirty();
  }

  applyWindAnimation(): void {
    const id = this.scene3dSelectedMeshId;
    if (!id) return;
    (this.shapeManager as any).setFrameLinkAnimation3D?.(id, {
      enabled: this.clothWindEnabled,
      type: 'wind',
      axis: this.clothWindAxis,
      amplitude: this.clothWindAmplitude,
      framesPerCycle: this.clothWindFramesPerCycle,
      phase: this.clothWindPhase,
    });
    this.scene3dMarkDirty();
  }

  // ── Wind zones ─────────────────────────────────────────────────

  private _loadWindZones(): void {
    const s3d = (this.shapeManager as any).scene3d;
    try { this.windZones = s3d?.getWindZones?.() ?? []; } catch { this.windZones = []; }
  }

  private _buildWindZonePayload(): any {
    const zone: any = {
      shape: this.windZoneShape,
      center: [...this.windZoneCenter] as [number,number,number],
      windVec: [this.windZoneWindX, this.windZoneWindY, this.windZoneWindZ] as [number,number,number],
      falloff: this.windZoneFalloff,
    };
    if (this.windZoneShape === 'sphere') zone.radius = this.windZoneRadius;
    else zone.halfExtents = [
      (this.windZoneBoxMax[0] - this.windZoneBoxMin[0]) / 2,
      (this.windZoneBoxMax[1] - this.windZoneBoxMin[1]) / 2,
      (this.windZoneBoxMax[2] - this.windZoneBoxMin[2]) / 2,
    ];
    if (this.windZonePulseEnabled) zone.pulse = { period: this.windZonePulsePeriod, phase: this.windZonePulsePhase };
    return zone;
  }

  private _loadWindZoneFields(zone: any): void {
    this.windZoneShape = zone.shape ?? 'sphere';
    this.windZoneCenter = [...(zone.center ?? [0, 0, 0])] as [number,number,number];
    this.windZoneRadius = zone.radius ?? 1.0;
    const he = zone.halfExtents ?? [0.5, 0.5, 0.5];
    const c = zone.center ?? [0, 0, 0];
    this.windZoneBoxMin = [c[0]-he[0], c[1]-he[1], c[2]-he[2]];
    this.windZoneBoxMax = [c[0]+he[0], c[1]+he[1], c[2]+he[2]];
    this.windZoneWindX = zone.windVec?.[0] ?? 0;
    this.windZoneWindY = zone.windVec?.[1] ?? 5;
    this.windZoneWindZ = zone.windVec?.[2] ?? 0;
    this.windZoneFalloff = zone.falloff ?? 1.0;
    this.windZonePulseEnabled = !!zone.pulse;
    this.windZonePulsePeriod = zone.pulse?.period ?? 60;
    this.windZonePulsePhase = zone.pulse?.phase ?? 0;
  }

  addWindZone(): void {
    const s3d = (this.shapeManager as any).scene3d;
    if (!s3d) return;
    const sm = this.shapeManager as any;
    const center = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    this.windZoneCenter = [...center] as [number,number,number];
    const zone = this._buildWindZonePayload();
    try {
      const id = s3d.addWindZone?.(zone);
      this._loadWindZones();
      const idx = this.windZones.findIndex((z: any) => z.id === id);
      this.windZoneSelectedIdx = idx >= 0 ? idx : this.windZones.length - 1;
    } catch (e) { console.warn('[WindZone] add failed', e); }
    this.scene3dMarkDirty();
  }

  removeWindZone(idx: number): void {
    const s3d = (this.shapeManager as any).scene3d;
    const zone = this.windZones[idx];
    if (!zone || !s3d) return;
    try { s3d.removeWindZone?.(zone.id); } catch { /* ignore */ }
    this._loadWindZones();
    if (this.windZoneSelectedIdx === idx) this.windZoneSelectedIdx = null;
    else if (this.windZoneSelectedIdx !== null && this.windZoneSelectedIdx > idx) this.windZoneSelectedIdx--;
    this.scene3dMarkDirty();
  }

  selectWindZone(idx: number): void {
    this.windZoneSelectedIdx = idx;
    const zone = this.windZones[idx];
    if (zone) this._loadWindZoneFields(zone);
  }

  updateSelectedWindZone(): void {
    if (this.windZoneSelectedIdx === null) return;
    const s3d = (this.shapeManager as any).scene3d;
    const zone = this.windZones[this.windZoneSelectedIdx];
    if (!zone || !s3d) return;
    try {
      s3d.updateWindZone?.(zone.id, this._buildWindZonePayload());
      this._loadWindZones();
    } catch (e) { console.warn('[WindZone] update failed', e); }
    this.scene3dMarkDirty();
  }

  clearAllWindZones(): void {
    const s3d = (this.shapeManager as any).scene3d;
    if (!s3d) return;
    try { s3d.clearWindZones?.(); } catch { /* ignore */ }
    this.windZones = [];
    this.windZoneSelectedIdx = null;
    this.scene3dMarkDirty();
  }

  scene3dAddRibbon(): void {
    const sm = this.shapeManager as any;
    const center: [number, number, number] = sm.getIllustrationCenter3D?.() ?? [0, 0, 0];
    const scale: number = sm.getIllustrationMeshDefaultScale3D?.() || 1;
    const [cx, cy, cz] = center;
    const ribbon = sm.addRibbon3D?.(
      cx, cy, cz,
      [
        { x: cx - scale,        y: cy,                z: cz },
        { x: cx - scale * 0.3,  y: cy + scale * 0.25, z: cz },
        { x: cx + scale * 0.3,  y: cy + scale * 0.25, z: cz },
        { x: cx + scale,        y: cy,                z: cz },
      ],
      scale * 0.3,
      16,
    );
    if (ribbon?.id) {
      this.scene3dRefreshMeshes();
      this.scene3dRefreshHierarchy();
      this.scene3dSelectMesh(ribbon.id);
    }
  }

  scene3dUpdateRibbonPath(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).updateRibbonPath3D?.(
      this.scene3dSelectedMeshId, this.scene3dRibbonControlPoints.map(p => ({ ...p })));
  }

  scene3dUpdateRibbonWidth(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).updateRibbonWidth3D?.(this.scene3dSelectedMeshId, this.scene3dRibbonWidth);
    this.scene3dMarkDirty();
  }

  scene3dSetRibbonControlPoint(index: number): void {
    if (!this.scene3dSelectedMeshId) return;
    const pt = this.scene3dRibbonControlPoints[index];
    if (!pt) return;
    (this.shapeManager as any).setRibbonControlPoint3D?.(
      this.scene3dSelectedMeshId, index, pt.x, pt.y, pt.z);
    this.scene3dMarkDirty();
  }

  scene3dSetRibbonPathMode(mode: 'normal' | 'world-up' | 'camera-facing'): void {
    this.scene3dRibbonPathMode = mode;
    if (!this.scene3dSelectedMeshId) return;
    const result = (this.shapeManager as any).setRibbonPathMode3D?.(this.scene3dSelectedMeshId, mode);
    if (result === false) console.warn('[3D] setRibbonPathMode3D returned false — meshId:', this.scene3dSelectedMeshId, 'mode:', mode);
    this.scene3dMarkDirty();
  }

  scene3dSetRibbonSegments(n: number): void {
    this.scene3dRibbonSegments = n;
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).updateRibbonSegments3D?.(this.scene3dSelectedMeshId, n);
    this.scene3dMarkDirty();
  }

  scene3dSetRibbonDoubleSided(v: 'double' | 'front' | 'back'): void {
    this.scene3dRibbonDoubleSided = v;
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).setRibbonDoubleSided3D?.(this.scene3dSelectedMeshId, v);
    this.scene3dMarkDirty();
  }

  scene3dSetRibbonShowHandles(show: boolean): void {
    this.scene3dRibbonShowHandles = show;
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).setRibbonShowHandles3D?.(this.scene3dSelectedMeshId, show);
  }

  scene3dSetRibbonFlipRearU(v: boolean): void {
    this.scene3dRibbonFlipRearU = v;
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).setRibbonFlipRearU3D?.(this.scene3dSelectedMeshId, v);
    this.scene3dMarkDirty();
  }

  scene3dSetRibbonUvTileCount(n: number): void {
    this.scene3dRibbonUvTileCount = n;
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).setRibbonUvTileCount3D?.(this.scene3dSelectedMeshId, n);
    this.scene3dMarkDirty();
  }

  // ── Canvas overlay handle management ────────────────────────────────────────
  private _scene3dShowHandles(): void {
    if (!this.scene3dIsRibbon || !this.scene3dSelectedMeshId) return;
    this._scene3dStartHandleLoop();
  }

  private _scene3dHideHandles(): void {
    this._scene3dStopHandleLoop();
  }

  private _scene3dStartHandleLoop(): void {
    if (this._scene3dHandleRafId != null) return;
    const loop = () => {
      this._scene3dDrawHandles();
      if (this.scene3dIsRibbon && this.scene3dSelectedMeshId) {
        this._scene3dHandleRafId = requestAnimationFrame(loop);
      } else {
        this._scene3dHandleRafId = null;
      }
    };
    this._scene3dHandleRafId = requestAnimationFrame(loop);
  }

  private _scene3dStopHandleLoop(): void {
    if (this._scene3dHandleRafId != null) {
      cancelAnimationFrame(this._scene3dHandleRafId);
      this._scene3dHandleRafId = null;
    }
    const hc = this.handleCanvasRef?.nativeElement;
    if (hc) hc.getContext('2d')?.clearRect(0, 0, hc.width, hc.height);
    this._scene3dActiveDragIndex = null;
  }

  private _scene3dDrawHandles(): void {
    const hc = this.handleCanvasRef?.nativeElement;
    const canvas = this.canvasRef?.nativeElement;
    if (!hc || !canvas || !this.scene3dSelectedMeshId) return;
    const cw = canvas.clientWidth || canvas.width;
    const ch = canvas.clientHeight || canvas.height;
    if (hc.width !== cw || hc.height !== ch) { hc.width = cw; hc.height = ch; }
    const ctx = hc.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    const sm = this.shapeManager as any;

    // Grid snap target dot (vertex snap viz is rendered engine-side by Salsa)
    const snapTarget = sm.getSnapTarget3D?.() as [number,number,number] | null;
    if (snapTarget) {
      const scr = sm.worldToScreen3D?.(snapTarget) as [number,number] | null;
      if (scr) {
        ctx.beginPath();
        ctx.arc(scr[0], scr[1], 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (sm.getRibbonData3D?.(this.scene3dSelectedMeshId)?.showHandles === false) return;
    const positions: { x: number; y: number; depth: number; index: number }[] =
      sm.getRibbonHandleScreenPositions3D?.(this.scene3dSelectedMeshId, cw, ch) ?? [];
    for (const pt of positions) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = this._scene3dActiveDragIndex === pt.index ? 'rgba(255,220,0,0.9)' : 'rgba(0,190,255,0.75)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pt.index), pt.x, pt.y);
    }
  }

  scene3dCanvasPointerDown(event: PointerEvent): void {
    if (!this.scene3dPanelVisible) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const sm = this.shapeManager as any;

    // 0. Mesh edit mode — Salsa's MeshEditPointerController owns face/vertex/edge picking.
    // For knife: capture start position here. Either way, prevent fallthrough to mesh selection.
    if (this.scene3dIsEditingMesh && this.scene3dSelectedMeshId) {
      if (this.scene3dEditTool === 'knife') {
        this._knifeStart = { x: event.offsetX, y: event.offsetY };
        canvas.setPointerCapture(event.pointerId);
      }
      return;
    }

    // 0b. UV Paint stamp mode — bake a decal into the mesh texture at the clicked surface point.
    if (this.uvEditorOpen && this.uvStampActive && this.scene3dSelectedMeshId) {
      const source = this._buildDecalSource();
      if (source) {
        sm.stampDecalAtScreen3D?.(
          this.scene3dSelectedMeshId, source,
          event.clientX, event.clientY, canvas.getBoundingClientRect(),
          { size: this.uvStampSize, rotation: this.uvStampRotationRad }
        );
      }
      return;
    }

    // 1. Try ribbon handle hit first (only when a ribbon with visible handles is selected)
    if (this.scene3dIsRibbon && this.scene3dSelectedMeshId && this.scene3dRibbonShowHandles) {
      const cw = canvas.clientWidth || canvas.width;
      const ch = canvas.clientHeight || canvas.height;
      const mx = event.offsetX;
      const my = event.offsetY;
      const positions: { x: number; y: number; depth: number; index: number }[] =
        sm.getRibbonHandleScreenPositions3D?.(this.scene3dSelectedMeshId, cw, ch) ?? [];
      let hit: { x: number; y: number; depth: number; index: number } | null = null;
      for (const pt of positions) {
        const dx = mx - pt.x, dy = my - pt.y;
        if (Math.sqrt(dx * dx + dy * dy) <= 12 && (!hit || pt.depth < hit.depth)) hit = pt;
      }
      if (hit) {
        event.stopPropagation();
        canvas.setPointerCapture(event.pointerId);
        this._scene3dActiveDragIndex = hit.index;
        sm.beginRibbonHandleDrag3D?.(this.scene3dSelectedMeshId, hit.index, cw, ch);
        return;
      }
    }

    // 2. Fall through to viewport picking — click anywhere on canvas to select a mesh
    const picked = sm.pickFromClient3D?.(event.clientX, event.clientY, canvas.getBoundingClientRect());
    const pickedId = picked?.meshId ?? picked?.id ?? picked?.nodeId ?? null;
    if (pickedId) {
      this.scene3dSelectMesh(pickedId);
    } else {
      // Clicked empty space — clear mesh selection and close char panel if open
      if (this.scene3dSelectedMeshId) {
        this.scene3dSelectedMeshId = null;
        sm.setSelectedNode?.(null);
      }
      if (this.scene3dEditCharPanelOpen) {
        const prevId = this.scene3dEditCharBodyId;
        this.scene3dEditCharPanelOpen = false;
        this.scene3dSelectedIsCharacter = false;
        this.scene3dEditCharBodyId = null;
        if (prevId) sm.setHairSimulation3D?.(prevId, false);
        this.charSection = 'menu';
      }
    }
  }

  scene3dCanvasPointerMove(event: PointerEvent): void {
    if (this.scene3dWorldPanelOpen) {
      const canvas = this.canvasRef?.nativeElement;
      if (canvas) {
        (this.shapeManager as any).world?.hoverLandmarkAtScreen?.(
          event.clientX, event.clientY, canvas.getBoundingClientRect()
        );
      }
    }
    if (this.scene3dIsEditingMesh && this.scene3dEditTool === 'knife' && this._knifeStart) {
      this._drawKnifePreview(this._knifeStart.x, this._knifeStart.y, event.offsetX, event.offsetY);
      return;
    }
    if (this._scene3dActiveDragIndex === null || !this.scene3dSelectedMeshId) return;
    const canvas = this.canvasRef?.nativeElement;
    const cw = canvas ? (canvas.clientWidth || canvas.width) : 0;
    const ch = canvas ? (canvas.clientHeight || canvas.height) : 0;
    const sm = this.shapeManager as any;
    sm.moveRibbonHandle3D?.(this.scene3dSelectedMeshId, this._scene3dActiveDragIndex,
      event.offsetX, event.offsetY, cw, ch);
    const data = sm.getRibbonData3D?.(this.scene3dSelectedMeshId);
    if (data?.controlPoints) {
      this.scene3dRibbonControlPoints = data.controlPoints.map(
        (p: any) => ({ x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 })
      );
    }
  }

  scene3dCanvasPointerLeave(): void {
    if (this.scene3dWorldPanelOpen) {
      (this.shapeManager as any).world?.clearLandmarkHover?.();
    }
  }

  scene3dCanvasPointerUp(event: PointerEvent): void {
    if (this.scene3dIsEditingMesh && this.scene3dEditTool === 'knife' && this._knifeStart) {
      const canvas = this.canvasRef?.nativeElement;
      if (canvas && this.scene3dSelectedMeshId) {
        const dpr = window.devicePixelRatio || 1;
        (this.shapeManager as any).knifeCut3D?.(
          this.scene3dSelectedMeshId,
          this._knifeStart.x * dpr, this._knifeStart.y * dpr,
          event.offsetX * dpr, event.offsetY * dpr,
          canvas.width, canvas.height,
        );
      }
      this._knifeStart = null;
      this._clearKnifePreview();
      return;
    }
    if (this._scene3dActiveDragIndex === null || !this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).endRibbonHandleDrag3D?.(this.scene3dSelectedMeshId, this._scene3dActiveDragIndex);
    this._scene3dActiveDragIndex = null;
    this.scene3dMarkDirty();
  }

  // ── Path presets ─────────────────────────────────────────────────────────────
  scene3dApplyPreset(): void {
    let pts = this._scene3dComputePreset();
    if (this.scene3dPresetReverse) pts = pts.reverse();
    this.scene3dRibbonControlPoints = pts;
    this.scene3dUpdateRibbonPath();
    this.scene3dMarkDirty();
  }

  private _scene3dComputePreset(): { x: number; y: number; z: number }[] {
    const r = this.scene3dPresetDiameter / 2;
    switch (this.scene3dPresetType) {
      case 'spiral': {
        const n = Math.max(4, Math.round(this.scene3dPresetTurns * 8));
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * this.scene3dPresetTurns * 2 * Math.PI;
          return { x: r * Math.cos(t), y: (i / n) * this.scene3dPresetHeight, z: r * Math.sin(t) };
        });
      }
      case 'circle': {
        const n = 12;
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * 2 * Math.PI;
          return { x: r * Math.cos(t), y: 0, z: r * Math.sin(t) };
        });
      }
      case 'arc': {
        const n = Math.max(4, Math.round(Math.abs(this.scene3dPresetAngle) / 15));
        const total = (this.scene3dPresetAngle * Math.PI) / 180;
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * total - total / 2;
          return { x: r * Math.cos(t), y: 0, z: r * Math.sin(t) };
        });
      }
      case 'wave': {
        const n = Math.max(4, this.scene3dPresetFrequency * 6);
        const w = this.scene3dPresetDiameter;
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = i / n;
          return { x: t * w - w / 2, y: Math.sin(t * this.scene3dPresetFrequency * 2 * Math.PI) * this.scene3dPresetAmplitude, z: 0 };
        });
      }
      case 'scurve': {
        const n = 8;
        const w = this.scene3dPresetDiameter;
        const a = this.scene3dPresetAmplitude;
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * 4 - 2;
          return { x: (i / n) * w - w / 2, y: a * Math.tanh(t), z: 0 };
        });
      }
      case 'zigzag': {
        const n = Math.max(2, this.scene3dPresetFrequency * 2);
        const w = this.scene3dPresetDiameter;
        const a = this.scene3dPresetAmplitude;
        return Array.from({ length: n + 1 }, (_, i) => ({
          x: (i / n) * w - w / 2, y: (i % 2 === 0 ? -a : a), z: 0,
        }));
      }
      default:
        return [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
    }
  }

  scene3dAddRibbonControlPoint(): void {
    const last = this.scene3dRibbonControlPoints[this.scene3dRibbonControlPoints.length - 1];
    this.scene3dRibbonControlPoints = [
      ...this.scene3dRibbonControlPoints,
      { x: (last?.x ?? 0) + 0.5, y: last?.y ?? 0, z: last?.z ?? 0 },
    ];
    this.scene3dUpdateRibbonPath();
  }

  scene3dRemoveRibbonControlPoint(index: number): void {
    if (this.scene3dRibbonControlPoints.length <= 2) return;
    this.scene3dRibbonControlPoints = this.scene3dRibbonControlPoints.filter((_, i) => i !== index);
    this.scene3dUpdateRibbonPath();
  }

  async scene3dApplyHtmlTexture(): Promise<void> {
    if (!this.scene3dSelectedMeshId) return;
    const sm = this.shapeManager as any;
    if (this.scene3dHtmlEnabled) {
      await sm.updateHtmlTexture3D?.(this.scene3dSelectedMeshId, this.scene3dHtmlContent, { backgroundColor: this.scene3dEffectiveTexBg, stretchToFit: true });
    } else {
      let w = this.scene3dHtmlTexWidth;
      let h = this.scene3dHtmlTexHeight;
      if (this.scene3dIsRibbon) {
        const computed = sm.computeRibbonTextureSize3D?.(
          this.scene3dSelectedMeshId, this.scene3dHtmlTexQuality
        ) ?? { width: 512, height: 128, fontSize: 128 };
        w = computed.width;
        h = computed.height;
        this.scene3dHtmlTexWidth = w;
        this.scene3dHtmlTexHeight = h;
        // fontSize is ignored — stretchToFit overrides it
      }
      await sm.setHtmlTexture3D?.(
        this.scene3dSelectedMeshId,
        this.scene3dHtmlContent,
        w, h,
        { backgroundColor: this.scene3dHtmlTexBg, stretchToFit: true },
      );
      this.scene3dHtmlEnabled = true;
    }
    this.scene3dMarkTexLibDirty();
  }

  scene3dOnHtmlContentChange(): void {
    clearTimeout(this._scene3dHtmlDebounce);
    if (!this.scene3dHtmlEnabled) return;
    this._scene3dHtmlDebounce = setTimeout(() => {
      const sm = this.shapeManager as any;
      sm.updateHtmlTexture3D?.(this.scene3dSelectedMeshId, this.scene3dHtmlContent, { backgroundColor: this.scene3dEffectiveTexBg, stretchToFit: true });
      this.scene3dMarkTexLibDirty();
    }, 300);
  }

  async scene3dSetHtmlTexQuality(quality: 64 | 128 | 256): Promise<void> {
    this.scene3dHtmlTexQuality = quality;
    if (!this.scene3dHtmlEnabled || !this.scene3dSelectedMeshId) return;
    const sm = this.shapeManager as any;
    sm.removeHtmlTexture3D?.(this.scene3dSelectedMeshId);
    this.scene3dHtmlEnabled = false;
    await this.scene3dApplyHtmlTexture();
    this.scene3dMarkTexLibDirty();
  }

  scene3dRemoveHtmlTexture(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).removeHtmlTexture3D?.(this.scene3dSelectedMeshId);
    this.scene3dHtmlEnabled = false;
    this.scene3dHtmlContent = '';
    this.scene3dMarkTexLibDirty();
  }

  get scene3dHtmlPlaceholder(): string {
    return this.scene3dIsRibbon
      ? `<div style="font:bold 1px sans-serif;color:white;letter-spacing:0.1em">★ HELLO 3D ★ &nbsp;&nbsp; ★ HELLO 3D ★ &nbsp;&nbsp;</div>`
      : `<div style="font:bold 1px sans-serif;color:white">Hello 3D!</div>`;
  }

  scene3dGetScrollSecondsPerLoop(): number {
    const fps = (this.shapeManager as any).getAnimationPlayer3D?.()?.fps ?? 24;
    return this.scene3dFrameLinkFramesPerCycle / fps;
  }

  scene3dSetScrollSecondsPerLoop(seconds: number): void {
    const fps = (this.shapeManager as any).getAnimationPlayer3D?.()?.fps ?? 24;
    this.scene3dFrameLinkFramesPerCycle = Math.max(1, Math.round(seconds * fps));
    this.scene3dApplyFrameLink();
  }

  scene3dSetHovered(id: string | null): void {
    (this.shapeManager as any).setHoveredMesh3D?.(id);
  }

  trackByNodeId(_: number, node: any): string { return node.id; }

  scene3dApplyFrameLink(): void {
    const id = this.scene3dSelectedMeshId;
    if (!id) return;
    const sm = this.shapeManager as any;
    const baseConfig = {
      enabled: this.scene3dFrameLinkEnabled,
      type: this.scene3dFrameLinkType,
      axis: this.scene3dFrameLinkAxis,
      amplitude: this.scene3dFrameLinkAmplitude,
      framesPerCycle: this.scene3dFrameLinkFramesPerCycle,
      phase: this.scene3dFrameLinkPhase,
    };
    if (this.scene3dSelectedIsGroup) {
      const freshHierarchy: any[] = sm.getScene3DHierarchy?.() ?? [];
      const groupNode = freshHierarchy.find((n: any) => n.id === id);
      const children: any[] = groupNode?.children ?? [];

      const buckets = this.scene3dAllGroupBuckets[id] ?? [];
      const bucketed = new Set(buckets.flat());
      const unbucketed = children.filter((c: any) => !bucketed.has(c.id));

      // Stagger units: each bucket counts as one unit, each unbucketed child counts as one unit
      const units: string[][] = [
        ...buckets,
        ...unbucketed.map((c: any) => [c.id as string]),
      ];
      const totalUnits = units.length || 1;

      units.forEach((unitIds, i) => {
        const unitPhase = this.scene3dFrameLinkPhase + (i / totalUnits) * this.scene3dFrameLinkStagger;
        unitIds.forEach(childId => {
          sm.setFrameLinkAnimation3D?.(childId, { ...baseConfig, phase: unitPhase });
        });
      });
    } else {
      sm.setFrameLinkAnimation3D?.(id, baseConfig);
    }
    this.scene3dMarkDirty();
  }

  // ── Phase Bucket helpers ────────────────────────────────────────────────────

  scene3dGetCurrentBuckets(): string[][] {
    return this.scene3dAllGroupBuckets[this.scene3dSelectedMeshId!] ?? [];
  }

  scene3dGetAvailableChildren(): Array<{ id: string; name: string }> {
    const id = this.scene3dSelectedMeshId;
    if (!id) return [];
    const bucketed = new Set((this.scene3dAllGroupBuckets[id] ?? []).flat());
    const groupNode = this.scene3dHierarchy.find((n: any) => n.id === id);
    return (groupNode?.children ?? [])
      .filter((c: any) => !bucketed.has(c.id))
      .map((c: any) => ({ id: c.id as string, name: (c.name ?? c.id) as string }));
  }

  scene3dGetChildName(childId: string): string {
    const groupNode = this.scene3dHierarchy.find((n: any) => n.id === this.scene3dSelectedMeshId);
    return groupNode?.children?.find((c: any) => c.id === childId)?.name ?? childId;
  }

  scene3dAddBucket(): void {
    const id = this.scene3dSelectedMeshId;
    if (!id) return;
    const existing = this.scene3dAllGroupBuckets[id] ?? [];
    this.scene3dAllGroupBuckets = { ...this.scene3dAllGroupBuckets, [id]: [...existing, []] };
    this.scene3dBucketSelections = [...this.scene3dBucketSelections, ''];
  }

  scene3dRemoveBucket(bi: number): void {
    const id = this.scene3dSelectedMeshId;
    if (!id) return;
    const buckets = [...(this.scene3dAllGroupBuckets[id] ?? [])];
    buckets.splice(bi, 1);
    this.scene3dAllGroupBuckets = { ...this.scene3dAllGroupBuckets, [id]: buckets };
    const sels = [...this.scene3dBucketSelections];
    sels.splice(bi, 1);
    this.scene3dBucketSelections = sels;
    this.scene3dApplyFrameLink();
  }

  scene3dAddChildToBucket(bi: number): void {
    const id = this.scene3dSelectedMeshId;
    if (!id) return;
    const childId = this.scene3dBucketSelections[bi];
    if (!childId) return;
    const buckets = (this.scene3dAllGroupBuckets[id] ?? []).map(b => [...b]);
    if (!buckets[bi]) buckets[bi] = [];
    buckets[bi].push(childId);
    this.scene3dAllGroupBuckets = { ...this.scene3dAllGroupBuckets, [id]: buckets };
    const sels = [...this.scene3dBucketSelections];
    sels[bi] = '';
    this.scene3dBucketSelections = sels;
    this.scene3dApplyFrameLink();
  }

  scene3dRemoveChildFromBucket(bi: number, childId: string): void {
    const id = this.scene3dSelectedMeshId;
    if (!id) return;
    const buckets = (this.scene3dAllGroupBuckets[id] ?? []).map(b => [...b]);
    buckets[bi] = buckets[bi].filter(c => c !== childId);
    this.scene3dAllGroupBuckets = { ...this.scene3dAllGroupBuckets, [id]: buckets };
    this.scene3dApplyFrameLink();
  }

  scene3dUpdateMeshPosition(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).scene3d?.setPosition(
      this.scene3dSelectedMeshId, +this.scene3dMeshPosX, +this.scene3dMeshPosY, +this.scene3dMeshPosZ);
    this.scene3dMarkDirty();
  }

  scene3dUpdateMeshRotation(): void {
    if (!this.scene3dSelectedMeshId) return;
    const d2r = Math.PI / 180;
    (this.shapeManager as any).scene3d?.setRotation(
      this.scene3dSelectedMeshId, +this.scene3dMeshRotX * d2r, +this.scene3dMeshRotY * d2r, +this.scene3dMeshRotZ * d2r);
    this.scene3dMarkDirty();
  }

  scene3dUpdateMeshScale(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).scene3d?.setScale(
      this.scene3dSelectedMeshId, +this.scene3dMeshScaleX, +this.scene3dMeshScaleY, +this.scene3dMeshScaleZ);
    this.scene3dMarkDirty();
  }

  scene3dUpdateMeshColor(): void {
    if (!this.scene3dSelectedMeshId) return;
    const c = this._hexToRgba01(this.scene3dMeshColor);
    (this.shapeManager as any).scene3d?.setDiffuseColor(
      this.scene3dSelectedMeshId, c.r, c.g, c.b);
    this.scene3dMarkDirty();
  }

  scene3dUpdateMeshOpacity(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).scene3d?.setOpacity(this.scene3dSelectedMeshId, +this.scene3dMeshOpacity);
    this.scene3dMarkDirty();
  }

  scene3dUpdateMeshRoughness(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).setMeshRoughness3D?.(this.scene3dSelectedMeshId, this.scene3dMeshRoughness);
    this.scene3dMarkDirty();
  }

  scene3dUpdateMeshMetalness(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).setMeshMetalness3D?.(this.scene3dSelectedMeshId, this.scene3dMeshMetalness);
    this.scene3dMarkDirty();
  }

  scene3dUpdateMeshNoEnvReflection(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).setMeshNoEnvReflection3D?.(this.scene3dSelectedMeshId, this.scene3dMeshNoEnvReflection);
    this.scene3dMarkDirty();
  }

  scene3dUpdateMeshPlanarReflector(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).setMeshPlanarReflector3D?.(this.scene3dSelectedMeshId, this.scene3dMeshPlanarReflector);
    this.scene3dMarkDirty();
  }

  applyGroundMaterial(): void {
    if (!this.scene3dSelectedMeshId) return;
    const tint = this.hexToRgba01(this.groundTintHex);
    const moss = this.hexToRgba01(this.groundMossTintHex);
    const dirt = this.hexToRgba01(this.groundDirtTintHex);
    const opts: any = {
      surface: this.groundSurface,
      tileMm: this.groundTileMm,
      groutMm: this.groundGroutMm,
      tint: [tint[0], tint[1], tint[2]],
      extentMeters: this.groundExtentM,
      weather: this.groundWeather,
      mossTint: [moss[0], moss[1], moss[2]],
      dirtTint: [dirt[0], dirt[1], dirt[2]],
    };
    if (this.groundSurface === 'radialMedallion') {
      opts.wedges = this.groundWedges;
      opts.ringMm = this.groundRingMm;
    }
    if (this.groundWearTrack) opts.wearPath = [0.5, 0.5, 0.25];
    (this.shapeManager as any).applyGroundMaterial3D?.(this.scene3dSelectedMeshId, opts);
    this.scene3dMarkDirty();
  }

  applyGroundScatter(): void {
    if (!this.scene3dSelectedMeshId) return;
    const sm = this.shapeManager as any;
    if (this.groundScatterGroupId) {
      sm.clearGroundScatter3D?.(this.groundScatterGroupId);
      this.groundScatterGroupId = null;
    }
    const groupId = sm.scatterOnGround3D?.(this.scene3dSelectedMeshId, {
      flowers:   this.groundScatterFlowers,
      pebbles:   this.groundScatterPebbles,
      tallGrass: this.groundScatterTallGrass,
      bushes:    this.groundScatterBushes,
      rocks:     this.groundScatterRocks,
      wearPath:  this.groundWearTrack ? [0.5, 0.5, 0.25] : null,
    });
    if (groupId) this.groundScatterGroupId = groupId;
    this.scene3dMarkDirty();
  }

  clearGroundScatter(): void {
    if (!this.groundScatterGroupId) return;
    (this.shapeManager as any).clearGroundScatter3D?.(this.groundScatterGroupId);
    this.groundScatterGroupId = null;
    this.scene3dMarkDirty();
  }

  async scene3dUploadEnvironmentMap(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const sm = this.shapeManager as any;
    sm.setEnvironmentMap3D?.(imageData, this.scene3dIblIntensity);
    this.scene3dIblEnabled = true;
    this.scene3dMarkDirty();
  }

  scene3dClearEnvironmentMap(): void {
    (this.shapeManager as any).clearEnvironmentMap3D?.();
    this.scene3dIblEnabled = false;
    this.scene3dMarkDirty();
  }

  scene3dExportGlb(): void {
    const result = (this.shapeManager as any).exportSceneGltf3D?.();
    if (!result?.blob) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.glb';
    a.click();
    URL.revokeObjectURL(url);
    this.scene3dExportStats =
      `${result.meshCount ?? 0} mesh, ${result.skeletonCount ?? 0} skel, ` +
      `${result.animationCount ?? 0} anim, ${result.vertexCount ?? 0} verts`;
  }

  scene3dApplyPostProcessing(): void {
    const tint = this.scene3dColorGradeTint;
    const tr = parseInt(tint.slice(1, 3), 16) / 255;
    const tg = parseInt(tint.slice(3, 5), 16) / 255;
    const tb = parseInt(tint.slice(5, 7), 16) / 255;
    (this.shapeManager as any).setPostProcessing3D?.({
      bloom: {
        enabled: this.scene3dBloomEnabled,
        threshold: this.scene3dBloomThreshold,
        intensity: this.scene3dBloomIntensity,
      },
      colorGrade: {
        enabled: this.scene3dColorGradeEnabled,
        brightness: this.scene3dColorGradeBrightness,
        contrast: this.scene3dColorGradeContrast,
        saturation: this.scene3dColorGradeSaturation,
        tint: [tr, tg, tb] as [number, number, number],
      },
      vignette: {
        enabled: this.scene3dVignetteEnabled,
        intensity: this.scene3dVignetteIntensity,
        radius: this.scene3dVignetteRadius,
        softness: this.scene3dVignetteSoftness,
      },
    });
    this.scene3dMarkDirty();
  }

  scene3dApplySSAO(): void {
    const sm = this.shapeManager as any;
    sm.scene3d?.setSSAO3D?.(this.scene3dSSAOEnabled, {
      radius:          this.scene3dSSAORadius,
      intensity:       this.scene3dSSAOIntensity,
      power:           this.scene3dSSAOPower,
      bias:            this.scene3dSSAOBias,
      resolutionScale: this.scene3dSSAOResolutionScale,
      samples:         this.scene3dSSAOSamples,
    });
    if (!this.scene3dSSAOEnabled && this.scene3dSSAODebug) {
      this.scene3dSSAODebug = false;
      sm.scene3d?.setSSAODebug3D?.(false);
    }
    this.scene3dMarkDirty();
  }

  scene3dToggleSSAODebug(on: boolean): void {
    this.scene3dSSAODebug = on;
    (this.shapeManager as any).scene3d?.setSSAODebug3D?.(on);
    this.scene3dMarkDirty();
  }

  scene3dDeleteMesh(id: string): void {
    const sm = this.shapeManager as any;
    if (this.scene3dCharacterBodyIds.has(id)) {
      // deleteProceduralBody3D removes body + all parts + skeleton + clears rig maps atomically
      sm.deleteProceduralBody3D?.(id);
      if (this.scene3dEditCharBodyId === id) {
        this.scene3dEditCharBodyId = null;
        this.scene3dEditCharPanelOpen = false;
      }
    } else {
      this._instanceGroupRemove(id);
      sm.scene3d?.deleteMesh?.(id);
    }
    this.scene3dRefreshMeshes();
    if (this.scene3dSelectedMeshId === id) {
      this.scene3dSelectedMeshId = this.scene3dMeshes[0]?.id ?? this.scene3dMeshes[0]?.nodeId ?? null;
      this.scene3dDiffuseTextureSet = false;
      this.scene3dNormalMapSet = false;
    }
    this.scene3dMarkDirty();
  }

  scene3dDuplicateMesh(id: string): void {
    const sm = this.shapeManager as any;
    const copy = sm.duplicateMesh3D?.(id);
    if (copy) {
      const copyId = copy.id ?? copy.nodeId;
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

  scene3dRecordCameraKeyframe(): void {
    const sm = this.shapeManager as any;
    const frame = this.animationService.getCurrentFrame?.() ?? 1;
    sm.recordCameraKeyframe3D?.(frame);
    this.scene3dRefreshKeyframeTracks();
    this.scene3dMarkDirty();
  }

  scene3dMoveMesh(id: string, direction: 'up' | 'down'): void {
    const sm = this.shapeManager as any;
    if (direction === 'up') {
      sm.moveLayerUp3D?.(id);
    } else {
      sm.moveLayerDown3D?.(id);
    }
    setTimeout(() => this.scene3dRefreshHierarchy(), 50);
    this.scene3dMarkDirty();
  }

  scene3dToggleGroupCollapse(id: string): void {
    if (this.scene3dCollapsedGroups.has(id)) this.scene3dCollapsedGroups.delete(id);
    else this.scene3dCollapsedGroups.add(id);
  }

  scene3dToggleVisibility(node: any): void {
    const sm = this.shapeManager as any;
    const nowVisible = !(node.visible !== false);
    if (node.type === '3DMeshGroup') {
      sm.setGroupVisible3D?.(node.id, nowVisible);
      this._scene3dSetChildrenVisible(node.children ?? [], nowVisible, sm);
    } else {
      sm.setMeshVisible3D?.(node.id, nowVisible);
    }
    this.scene3dRefreshHierarchy();
    this.scene3dMarkDirty();
  }

  private _scene3dSetChildrenVisible(children: any[], visible: boolean, sm: any): void {
    for (const child of children) {
      if (child.type === '3DMeshGroup') {
        sm.setGroupVisible3D?.(child.id, visible);
        this._scene3dSetChildrenVisible(child.children ?? [], visible, sm);
      } else {
        sm.setMeshVisible3D?.(child.id, visible);
      }
    }
  }

  private _scene3dReconstructGroups(sm: any, groups: Array<{ name: string; children: string[] }>): void {
    for (const g of groups) {
      if (!g.children?.length) continue;
      const group = sm.scene3d?.createMeshGroup?.(g.name ?? 'Group');
      const groupId: string | undefined = group?.id;
      if (!groupId) continue;
      for (const childId of g.children) {
        sm.scene3d?.addMeshToGroup?.(childId, groupId);
      }
    }
  }

  scene3dStartRename(node: any, event: Event): void {
    event.stopPropagation();
    this.scene3dRenamingId = node.id;
    this.scene3dRenamingName = node.name;
  }

  scene3dCommitRename(node: any): void {
    if (!this.scene3dRenamingId) return;
    const name = this.scene3dRenamingName.trim();
    if (name) {
      const sm = this.shapeManager as any;
      if (node.type === '3DMeshGroup') {
        sm.setGroupName3D?.(node.id, name);
      } else {
        sm.setMeshName3D?.(node.id, name);
      }
      this.scene3dRefreshHierarchy();
      this.scene3dMarkDirty();
    }
    this.scene3dRenamingId = null;
  }

  scene3dCancelRename(): void {
    this.scene3dRenamingId = null;
  }

  scene3dDeleteGroup(groupId: string): void {
    (this.shapeManager as any).deleteMeshGroup3D?.(groupId);
    this.scene3dRefreshMeshes();
  }

  scene3dAddGroup(): void {
    (this.shapeManager as any).scene3d?.createMeshGroup?.('Group');
    this.scene3dRefreshMeshes();
  }

  async scene3dImportModelFromPicker(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await this.scene3dImportModelFile(file);
    (event.target as HTMLInputElement).value = '';
  }

  // ── Render style ──────────────────────────────────────────────────────────
  scene3dRenderStyle: 'default' | 'cel' | 'sketch' | 'ink' | 'gouraud' | 'unlit' = 'default';

  scene3dSetRenderStyle(style: 'default' | 'cel' | 'sketch' | 'ink' | 'gouraud' | 'unlit'): void {
    if (!this.scene3dSelectedMeshId) return;
    this.scene3dRenderStyle = style;
    (this.shapeManager as any).setRenderStyle3D?.(this.scene3dSelectedMeshId, style);
    this.scene3dMarkDirty();
  }

  // ── Procedural surface materials ──────────────────────────────────────────
  scene3dSurfacesList: string[] = [];

  scene3dLoadSurfaces(): void {
    if (this.scene3dSurfacesList.length) return;
    const list: string[] = (this.shapeManager as any).surfaceMaterials3D?.() ?? [];
    this.scene3dSurfacesList = list;
    if (list.length && !list.includes(this.groundSurface)) {
      this.groundSurface = list[0];
    }
  }

  scene3dFormatSurfaceName(s: string): string {
    return s
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^\w/, c => c.toUpperCase())
      .trim();
  }

  // ── Multi-material submesh slots ─────────────────────────────

  private _scene3dReloadSubmeshes(): void {
    const sm = this.shapeManager as any;
    const id = this.scene3dSelectedMeshId;
    if (!id) { this.scene3dSubmeshes = []; return; }
    const rawSubs: any[] = sm.getMeshSubmeshes3D?.(id) ?? [];
    this.scene3dSubmeshes = rawSubs.map((s: any, i: number) => {
      const d = s.material?.diffuse ?? s.material?.diffuseColor;
      const color = d
        ? '#' + [d[0], d[1], d[2]].map((v: number) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
        : '#ffffff';
      return {
        label: s.label ?? `Slot ${i}`,
        color,
        opacity: s.material?.opacity ?? 1,
        renderStyle: s.material?.renderStyle ?? 'default',
      };
    });
  }

  scene3dUpdateSubmeshColor(slotIndex: number): void {
    const id = this.scene3dSelectedMeshId; if (!id) return;
    const sm = this.shapeManager as any;
    const c = this._hexToRgba01(this.scene3dSubmeshes[slotIndex].color);
    const rawSubs: any[] = sm.getMeshSubmeshes3D?.(id) ?? [];
    const s = rawSubs[slotIndex]; if (!s) return;
    sm.setMeshSubmesh3D?.(id, slotIndex, { material: { ...s.material, diffuseColor: [c.r, c.g, c.b, s.material?.opacity ?? 1] } });
    this.scene3dMarkDirty();
  }

  scene3dUpdateSubmeshOpacity(slotIndex: number): void {
    const id = this.scene3dSelectedMeshId; if (!id) return;
    const sm = this.shapeManager as any;
    const rawSubs: any[] = sm.getMeshSubmeshes3D?.(id) ?? [];
    const s = rawSubs[slotIndex]; if (!s) return;
    sm.setMeshSubmesh3D?.(id, slotIndex, { material: { ...s.material, opacity: this.scene3dSubmeshes[slotIndex].opacity } });
    this.scene3dMarkDirty();
  }

  scene3dUpdateSubmeshRenderStyle(slotIndex: number, style: string): void {
    const id = this.scene3dSelectedMeshId; if (!id) return;
    const sm = this.shapeManager as any;
    const rawSubs: any[] = sm.getMeshSubmeshes3D?.(id) ?? [];
    const s = rawSubs[slotIndex]; if (!s) return;
    sm.setMeshSubmesh3D?.(id, slotIndex, { material: { ...s.material, renderStyle: style } });
    this.scene3dSubmeshes[slotIndex].renderStyle = style;
    this.scene3dMarkDirty();
  }

  scene3dUpdateSubmeshLabel(slotIndex: number): void {
    const id = this.scene3dSelectedMeshId; if (!id) return;
    (this.shapeManager as any).setMeshSubmesh3D?.(id, slotIndex, { label: this.scene3dSubmeshes[slotIndex].label });
    this.scene3dMarkDirty();
  }

  scene3dRemoveSubmesh(slotIndex: number): void {
    const id = this.scene3dSelectedMeshId; if (!id) return;
    (this.shapeManager as any).removeMeshSubmesh3D?.(id, slotIndex);
    this._scene3dReloadSubmeshes();
    this.scene3dMarkDirty();
  }

  scene3dAddSubmesh(): void {
    const id = this.scene3dSelectedMeshId; if (!id) return;
    const label = `Slot ${this.scene3dSubmeshes.length + 1}`;
    (this.shapeManager as any).appendMeshSubmesh3D?.(id, {
      label,
      material: { diffuseColor: [1, 1, 1, 1], opacity: 1, renderStyle: 'default' },
    });
    this._scene3dReloadSubmeshes();
    this.scene3dMarkDirty();
  }

  scene3dClearSubmeshes(): void {
    const id = this.scene3dSelectedMeshId; if (!id) return;
    (this.shapeManager as any).clearMeshSubmeshes3D?.(id);
    this.scene3dSubmeshes = [];
    this.scene3dMarkDirty();
  }

  // ── Snap settings ────────────────────────────────────────────

  private _scene3dLoadSnapSettings(): void {
    const sm = this.shapeManager as any;
    this.scene3dSnapMode      = sm.snapMode3D ?? 'grid';
    this.scene3dSnapGridSize  = sm.snapGridSize3D ?? 0.1;
    this.scene3dSnapAngleDeg  = Math.round(((sm.snapAngle3D ?? (Math.PI / 12)) * 180 / Math.PI) * 10) / 10;
    this.scene3dSnapScaleStep = sm.snapScaleStep3D ?? 0.25;
  }

  scene3dSetSnapMode(mode: 'none' | 'grid' | 'vertex'): void {
    this.scene3dSnapMode = mode;
    (this.shapeManager as any).snapMode3D = mode;
  }

  scene3dUpdateSnapSettings(): void {
    const sm = this.shapeManager as any;
    sm.snapGridSize3D   = this.scene3dSnapGridSize;
    sm.snapAngle3D      = this.scene3dSnapAngleDeg * Math.PI / 180;
    sm.snapScaleStep3D  = this.scene3dSnapScaleStep;
  }

  // ── 3D Ground Grid ─────────────────────────────────────────

  private _loadScene3dGrid(): void {
    const sm = this.shapeManager as any;
    this.scene3dGridVisible = sm.sceneGridVisible3D ?? false;
    this.scene3dGridOpacity = sm.sceneGridOpacity3D ?? 0.5;
    this.scene3dGridColor   = sm.sceneGridColor3D ? [...sm.sceneGridColor3D] as [number, number, number] : [0.5, 0.5, 0.5];
  }

  applyScene3dGrid(): void {
    const sm = this.shapeManager as any;
    if (!sm) return;
    sm.sceneGridVisible3D = this.scene3dGridVisible;
    sm.sceneGridOpacity3D = this.scene3dGridOpacity;
    sm.sceneGridColor3D   = [...this.scene3dGridColor];
  }

  onScene3dGridOpacityChange(val: string): void {
    this.scene3dGridOpacity = +val / 100;
    this.applyScene3dGrid();
  }

  onScene3dGridColorChange(hex: string): void {
    this.scene3dGridColor = [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
    this.applyScene3dGrid();
  }

  // ── Canvas Grid ────────────────────────────────────────────

  private _loadCanvasGrid(): void {
    const sm = this.shapeManager as any;
    this.canvasGridVisible = sm.canvasGridVisible ?? true;
    this.canvasGridCells   = sm.canvasGridCells ?? 64;
    this.canvasGridOpacity = sm.canvasGridOpacity ?? 0.15;
    this.canvasGridColor   = sm.canvasGridColor ? [...sm.canvasGridColor] as [number, number, number] : [128/255, 128/255, 128/255];
  }

  applyCanvasGrid(): void {
    const sm = this.shapeManager as any;
    if (!sm) return;
    sm.canvasGridVisible = this.canvasGridVisible;
    sm.canvasGridCells   = this.canvasGridCells;
    sm.canvasGridOpacity = this.canvasGridOpacity;
    sm.canvasGridColor   = [...this.canvasGridColor];
  }

  onCanvasGridOpacityChange(val: string): void {
    this.canvasGridOpacity = +val / 100;
    this.applyCanvasGrid();
  }

  onCanvasGridColorChange(hex: string): void {
    this.canvasGridColor = [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
    this.applyCanvasGrid();
  }

  async scene3dUploadDiffuseTexture(event: Event): Promise<void> {
    if (!this.scene3dSelectedMeshId) return;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await (this.shapeManager as any).scene3d?.setMeshTexture?.(this.scene3dSelectedMeshId, file);
    this.scene3dDiffuseTextureSet = true;
    this.scene3dMarkTexLibDirty();
    (event.target as HTMLInputElement).value = '';
  }

  scene3dClearDiffuseTexture(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).scene3d?.clearMeshTexture?.(this.scene3dSelectedMeshId);
    this.scene3dDiffuseTextureSet = false;
    this.scene3dMarkTexLibDirty();
  }

  async scene3dUploadNormalMap(event: Event): Promise<void> {
    if (!this.scene3dSelectedMeshId) return;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const sm = this.shapeManager as any;
    const result = await sm.uploadAndApplyNormalMap3D?.(this.scene3dSelectedMeshId, file);
    if (result != null) {
      this.scene3dNormalMapSet = true;
      this.scene3dMarkTexLibDirty();
    }
    (event.target as HTMLInputElement).value = '';
  }

  scene3dClearNormalMap(): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).clearMeshNormalMap3D?.(this.scene3dSelectedMeshId);
    this.scene3dNormalMapSet = false;
    this.scene3dMarkTexLibDirty();
  }

  scene3dSetBlendWeight(index: number, weight: number): void {
    if (!this.scene3dSelectedMeshId) return;
    (this.shapeManager as any).setBlendWeight3D?.(this.scene3dSelectedMeshId, index, weight);
    this.scene3dMarkDirty();
  }

  scene3dBlendKeyframeTracks: Record<string, {frame: number; value: number; easing?: string}[]> | null = null;

  private _refreshBlendKeyframeTracks(): void {
    if (!this.scene3dSelectedMeshId) { this.scene3dBlendKeyframeTracks = null; return; }
    this.scene3dBlendKeyframeTracks = (this.shapeManager as any).getBlendShapeKeyframeTracks3D?.(this.scene3dSelectedMeshId) ?? null;
  }

  scene3dBlendShapeHasKeyframe(shapeName: string): boolean {
    const track = this.scene3dBlendKeyframeTracks?.[shapeName];
    if (!track?.length) return false;
    const frame = this.animationService.getCurrentFrame?.() ?? 1;
    return track.some((kf: any) => kf.frame === frame);
  }

  scene3dToggleBlendShapeKeyframe(shapeName: string, weight: number): void {
    if (!this.scene3dSelectedMeshId) return;
    const sm = this.shapeManager as any;
    const frame = this.animationService.getCurrentFrame?.() ?? 1;
    if (this.scene3dBlendShapeHasKeyframe(shapeName)) {
      sm.removeBlendShapeKeyframe3D?.(this.scene3dSelectedMeshId, shapeName, frame);
    } else {
      sm.setBlendShapeKeyframe3D?.(this.scene3dSelectedMeshId, shapeName, frame, weight);
    }
    this._refreshBlendKeyframeTracks();
    this.scene3dMarkDirty();
  }

  scene3dFrameAllMeshes(): void {
    (this.shapeManager as any).scene3d?.frameAllMeshes?.();
  }

  scene3dSetGizmoMode(mode: 'move' | 'rotate' | 'scale'): void {
    this.scene3dDeactivateArrayTool();
    const next = this.scene3dGizmoMode === mode ? null : mode;
    this.scene3dGizmoMode = next;
    const sm = this.shapeManager as any;
    sm.scene3d?.setGizmoMode?.(next);
    sm.setGizmoMode3D?.(next);
  }

  scene3dToggleGizmoOrientation(): void {
    this.scene3dGizmoOrientation = this.scene3dGizmoOrientation === 'world' ? 'local' : 'world';
    (this.shapeManager as any).setGizmoOrientation3D?.(this.scene3dGizmoOrientation);
  }

  // ── Array Tool (Repeat) methods ─────────────────────────────

  scene3dToggleArrayTool(): void {
    if (this.scene3dArrayToolActive) { this.scene3dDeactivateArrayTool(); return; }
    this.scene3dArrayToolActive = true;
    this.scene3dGizmoMode = null;
    const sm = this.shapeManager as any;
    sm.scene3d?.setGizmoMode?.(null);
    sm.setGizmoMode3D?.(null);
    sm.enableArrayTool?.(this.scene3dArrayToolMode, this.scene3dArrayToolCount);
    if (this.scene3dArrayToolMode === 'radial') this._scene3dSyncRadialToolStrip();
    this._updateGizmoPosition();
  }

  scene3dDeactivateArrayTool(): void {
    if (!this.scene3dArrayToolActive) return;
    this.scene3dArrayToolActive = false;
    (this.shapeManager as any).disableArrayTool?.();
    this._updateGizmoPosition();
  }

  // ── World / City Tool ──────────────────────────────────────────────────────
  openWorldPanel(): void {
    this._exitAllScene3dModes();
    this.scene3dWorldPanelOpen = true;
    const sm = this.shapeManager as any;
    if (this.worldHasWorld && sm.world?.hasWorld) {
      sm.world?.enterCityMode();              // resume existing city, no regen
    } else {
      sm.world?.enterCityMode(this._worldParams());  // fresh city
      this.worldHasWorld = true;
      this.worldRefreshRegions();
    }
    this.worldInitGradeKeys();
    const overrideFlag = sm.world?.overrideGlobalLighting;
    if (overrideFlag != null) this.worldOverrideGlobalLighting = overrideFlag;
    this._updateGizmoPosition();
  }

  closeWorldPanel(): void {
    this.scene3dWorldPanelOpen = false;
    (this.shapeManager as any).world?.exitCityMode();
    this._updateGizmoPosition();
  }

  // ── Package Creator ──────────────────────────────────────────────────────────

  // 3D = no pane; split/2d = pane mounted in the subpanel canvas
  pkgViewMode: '3d' | 'split' | '2d' = '3d';

  openPkgCreator(packageId?: string | null): void {
    this._exitAllScene3dModes();
    this.scene3dPkgCreatorOpen = true;
    this.pkgViewMode = '3d';
    const sm = this.shapeManager as any;
    const params: any = { width: this.pkgWidth, height: this.pkgHeight, depth: this.pkgDepth, bleed: this.pkgBleed };
    const opts: any = { params };
    if (packageId) {
      opts.packageId = packageId;
    } else {
      opts.style = this.pkgStyle;
      this._applyStyleParams(params);
    }
    const st = sm.packaging?.enterCreatorMode(opts);
    if (st?.packageId) {
      this.pkgCreatorId = st.packageId;
      this.pkgFoldAmount = st.foldAmount ?? 0;
      if (st.style) this.pkgStyle = st.style;
      const preset = sm.packaging?.getBoardPreset?.(st.packageId);
      if (preset) this.pkgBoardPreset = preset;
      const stageBg = sm.packaging?.getStageBackground?.();
      if (stageBg?.mode) this.pkgStageMode = stageBg.mode;
      this._refreshPkgLayerStack();
    }
    this._updateGizmoPosition();
  }

  closePkgCreator(): void {
    this.scene3dPkgCreatorOpen = false;
    this.pkgViewMode = '3d';
    this.pkgLayerStack = [];
    this.onVectorLayerSelected(null);
    const sm = this.shapeManager as any;
    sm.packaging?.exitCreatorMode();
    this._pkgDielinePane = null;
    if (this._pkgFoldRaf != null) { cancelAnimationFrame(this._pkgFoldRaf); this._pkgFoldRaf = undefined; }
    this._updateGizmoPosition();
  }

  pkgSetViewMode(mode: '3d' | 'split' | '2d'): void {
    this.pkgViewMode = mode;
    const sm = this.shapeManager as any;
    if (mode === '3d') {
      sm.packaging?.detachDielinePane?.();
      this._pkgDielinePane = null;
    } else if (!this._pkgDielinePane) {
      // Canvas just appeared in the DOM — attach fresh
      setTimeout(() => this._attachDielinePane(), 0);
    } else {
      // Mode switched but pane already attached; canvas resized → redraw overlay
      setTimeout(() => this._drawDielinePaneGuides(), 0);
    }
  }

  pkgDimChanged(): void {
    if (this._pkgDimDebounce) clearTimeout(this._pkgDimDebounce);
    this._pkgDimDebounce = setTimeout(() => {
      if (!this.pkgCreatorId) return;
      const params: any = { width: this.pkgWidth, height: this.pkgHeight, depth: this.pkgDepth, bleed: this.pkgBleed };
      this._applyStyleParams(params);
      const s = (this.shapeManager as any).packaging?.setDimensions(this.pkgCreatorId, params);
      if (s?.id) this.pkgCreatorId = s.id;
      this._drawDielinePaneGuides();
    }, 40);
  }

  private _applyStyleParams(params: any): void {
    if (this.pkgStyle === 'tuckEnd') {
      params.tuckStyle = this.pkgTuckStyle;
    } else if (this.pkgStyle === 'rollEndMailer') {
      params.lockTabs = this.pkgLockTabs;
      params.restOpenAmount = this.pkgRestOpenAmount;
    } else if (this.pkgStyle === 'rigidTwoPiece') {
      if (this.pkgLidDepth > 0) params.lidDepth = this.pkgLidDepth;
      params.boardThickness = this.pkgBoardThickness;
    }
  }

  pkgFold(): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.fold(this.pkgCreatorId);
    this._pkgSyncFoldTween();
  }

  pkgUnfold(): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.unfold(this.pkgCreatorId);
    this._pkgSyncFoldTween();
  }

  pkgFoldScrub(): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.setFoldAmount(this.pkgCreatorId, this.pkgFoldAmount);
  }

  private _pkgSyncFoldTween(): void {
    if (this._pkgFoldRaf != null) cancelAnimationFrame(this._pkgFoldRaf);
    const tick = () => {
      const st = (this.shapeManager as any).packaging?.get?.(this.pkgCreatorId!);
      if (st != null) this.pkgFoldAmount = st.foldAmount;
      const settled = Math.abs(this.pkgFoldAmount - Math.round(this.pkgFoldAmount)) < 0.002;
      this._pkgFoldRaf = settled ? undefined : requestAnimationFrame(tick);
    };
    this._pkgFoldRaf = requestAnimationFrame(tick);
  }

  async pkgExportDieline(): Promise<void> {
    if (!this.pkgCreatorId) return;
    const blob = await (this.shapeManager as any).packaging?.exportDielinePng?.(this.pkgCreatorId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dieline.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  scene3dDeletePackage(id: string): void {
    const sm = this.shapeManager as any;
    if (this.pkgCreatorId === id && this.scene3dPkgCreatorOpen) this.closePkgCreator();
    sm.scene3d?.deleteMesh?.(id);
    this.scene3dPackageIds.delete(id);
    if (this.scene3dSelectedMeshId === id) this.scene3dSelectedMeshId = null;
    this.scene3dRefreshMeshes();
    this.scene3dMarkDirty();
  }

  scene3dOutlinerDeleteCDKit(id: string): void {
    const sm = this.shapeManager as any;
    if (this.cdKitRootId === id) {
      sm.exitCDDesigner3D?.();
      this.cdDesignerActive = false;
      this.cdKitRootId = null;
    }
    sm.deleteCDKit3D?.(id);
    this.scene3dCDKitIds.delete(id);
    if (this.scene3dSelectedMeshId === id) this.scene3dSelectedMeshId = null;
    this.scene3dRefreshMeshes();
    this.scene3dMarkDirty();
  }

  scene3dAddPackage(): void {
    const sm = this.shapeManager as any;
    if (!sm.packaging) return;
    const params: any = { width: this.pkgWidth, height: this.pkgHeight, depth: this.pkgDepth, bleed: this.pkgBleed };
    this._applyStyleParams(params);
    const st = sm.packaging.addPackage?.(params, this.pkgStyle);
    if (st?.id) {
      this.scene3dRefreshMeshes();
      this.scene3dSelectMesh(st.id);
    }
  }

  pkgToggleGuide(type: string, on: boolean): void {
    on ? this.pkgGuideTypes.add(type) : this.pkgGuideTypes.delete(type);
    this._drawDielinePaneGuides();
  }

  // ── Package layer stack (§0e) ────────────────────────────────────────────

  private _refreshPkgLayerStack(): void {
    if (!this.pkgCreatorId) { this.pkgLayerStack = []; return; }
    const stack: any[] = (this.shapeManager as any).packaging?.getLayerStack?.(this.pkgCreatorId) ?? [];
    this.pkgLayerStack = [...stack].reverse(); // API returns bottom→top; UI shows top→bottom
  }

  pkgAddLayer(): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.addLayer?.(this.pkgCreatorId);
    this._refreshPkgLayerStack();
  }

  pkgAddVectorLayer(): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.addVectorLayer?.(this.pkgCreatorId);
    this._refreshPkgLayerStack();
  }

  pkgSetActiveLayer(layerId: string): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.setActiveLayer?.(this.pkgCreatorId, layerId);
    this._refreshPkgLayerStack();
    // Wire the active layer into the ephemera/vector system
    const active = this.pkgLayerStack.find(l => l.layerId === layerId);
    this.onVectorLayerSelected(active?.kind === 'vector' ? layerId : null);
  }

  pkgSetLayerVisible(layerId: string, visible: boolean): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.setLayerVisible?.(this.pkgCreatorId, layerId, visible);
    this._refreshPkgLayerStack();
  }

  pkgSetLayerOpacity(layerId: string, opacity: number, commit = true): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.setLayerOpacity?.(this.pkgCreatorId, layerId, opacity);
    if (commit) this._refreshPkgLayerStack();
  }

  pkgRemoveLayer(layerId: string): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.removeLayer?.(this.pkgCreatorId, layerId);
    this._refreshPkgLayerStack();
  }

  pkgReorderLayer(layerId: string, toIndex: number): void {
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.reorderLayer?.(this.pkgCreatorId, layerId, toIndex);
    this._refreshPkgLayerStack();
  }

  pkgSetStyle(style: string): void {
    this.pkgStyle = style;
    // If creator is open, apply the style change to the live box immediately.
    if (!this.pkgCreatorId || !this.scene3dPkgCreatorOpen) return;
    const s = (this.shapeManager as any).packaging?.setStyle?.(this.pkgCreatorId, style);
    if (s?.id) {
      this.pkgCreatorId = s.id;
      this._refreshPkgLayerStack();
      this._drawDielinePaneGuides();
    }
  }

  pkgSetBoardPreset(preset: 'white' | 'kraft'): void {
    this.pkgBoardPreset = preset;
    if (!this.pkgCreatorId) return;
    (this.shapeManager as any).packaging?.setBoardPreset?.(this.pkgCreatorId, preset);
  }

  pkgSetStageMode(mode: string): void {
    this.pkgStageMode = mode;
    (this.shapeManager as any).packaging?.setStageBackground?.({ mode });
  }

  get pkgRasterLayerCount(): number {
    return this.pkgLayerStack.filter(l => l.kind === 'raster').length;
  }

  /** True when a raster layer is active (paint mode); false when a vector layer is active (place mode). */
  get pkgIsActivePaintable(): boolean {
    return (this.shapeManager as any).packaging?.isActivePaintable?.() ?? true;
  }

  private _attachDielinePane(): void {
    const sm = this.shapeManager as any;
    if (!sm.packaging) return;
    const paneCanvas = this.pkgDiePaneRef?.nativeElement;
    if (!paneCanvas) return;
    const renderer = sm.createUVCanvasRenderer?.(paneCanvas);
    if (!renderer) return;
    const pane = sm.packaging.attachDielinePane?.(renderer);
    if (!pane) return;
    this._pkgDielinePane = pane;
    // Salsa fires onPaneResize after its internal ResizeObserver re-syncs the backing store;
    // redraw our overlay there so guide coordinates are always in the new mapping.
    pane.onPaneResize = () => this._drawDielinePaneGuides();
    this._drawDielinePaneGuides();
  }

  private _drawDielinePaneGuides(): void {
    const pane = this._pkgDielinePane;
    const guideCanvas = this.pkgDieGuideRef?.nativeElement;
    const paneEl = this.pkgDiePaneRef?.nativeElement;
    if (!pane || !guideCanvas || !paneEl) return;
    // Match guide canvas backing store to the pane canvas (uvToCanvas returns backing-store px)
    const dpr = window.devicePixelRatio || 1;
    const cssW = paneEl.clientWidth;
    const cssH = paneEl.clientHeight;
    if (!cssW || !cssH) return;
    const physW = Math.round(cssW * dpr);
    const physH = Math.round(cssH * dpr);
    guideCanvas.width  = physW;
    guideCanvas.height = physH;
    guideCanvas.style.width  = cssW + 'px';
    guideCanvas.style.height = cssH + 'px';
    const ctx = guideCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, physW, physH);

    // Dim-outside-the-net: fill the texture area minus each panel rect (evenodd)
    const panels: any[] = pane.panels ?? [];
    if (panels.length) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      const [bx0, by0] = pane.uvToCanvas(0, 0);
      const [bx1, by1] = pane.uvToCanvas(1, 1);
      ctx.rect(bx0, by0, bx1 - bx0, by1 - by0);
      for (const p of panels) {
        const r = p.uvRect;
        const [x0, y0] = pane.uvToCanvas(r.u0, r.v0);
        const [x1, y1] = pane.uvToCanvas(r.u1, r.v1);
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
      }
      ctx.fill('evenodd');
      ctx.restore();
    }

    // Guide lines (types filtered by user toggles)
    const guides: any[] = pane.guides ?? [];
    for (const g of guides) {
      if (!this.pkgGuideTypes.has(g.type)) continue;
      ctx.strokeStyle = g.color ?? '#888888';
      ctx.lineWidth = g.type === 'panel' ? dpr : 2 * dpr;
      ctx.setLineDash(g.type === 'fold' ? [6 * dpr, 4 * dpr] : []);
      ctx.globalAlpha = g.type === 'panel' ? 0.5 : 1;
      ctx.beginPath();
      for (const [a, b] of (g.segments ?? [])) {
        const [x0, y0] = pane.uvToCanvas(a[0] / pane.canvasWidth, a[1] / pane.canvasHeight);
        const [x1, y1] = pane.uvToCanvas(b[0] / pane.canvasWidth, b[1] / pane.canvasHeight);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Panel labels centred on each panel rect
    if (panels.length) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.font = `${11 * dpr}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of panels) {
        const r = p.uvRect;
        const [cx, cy] = pane.uvToCanvas((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2);
        ctx.fillText(p.label, cx, cy);
      }
    }
    ctx.globalAlpha = 1;
  }

  private _worldParams(): Record<string, unknown> {
    const p: Record<string, unknown> = {
      seed: this.worldSeed,
      border: this.worldBorder,
      radius: this.worldRadius,
      pattern: this.worldPattern,
      streetWidth: this.worldStreetWidth,
      plazaRadius: this.worldPlazaRadius,
      lotsRadial: this.worldLotsRadial,
      lotsAngular: this.worldLotsAngular,
      parkChance: this.worldParkChance,
      waterChance: this.worldWaterChance,
      elevation: this.worldElevation,
      warp: this.worldWarp,
      clouds: this.worldClouds,
      cloudDensity: this.worldCloudDensity,
      holograms: this.worldHolograms,
      sidewalks: this.worldSidewalks,
      roadPaint: this.worldRoadPaint,
      streetLights: this.worldStreetLights,
      trafficLights: this.worldTrafficLights,
      cornerStyle: this.worldCornerStyle,
      roofStyle: this.worldRoofStyle,
      signage: this.worldSignage,
      landmarks: this.worldLandmarks,
      awnings: this.worldAwnings,
      streetFurniture: this.worldStreetFurniture,
      powerLines: this.worldPowerLines,
      parkedCars: this.worldParkedCars,
      nightMode: this.worldNightMode,
      streetTrees: this.worldStreetTrees,
      bicycles: this.worldBicycles,
      lanterns: this.worldLanterns,
      railway: this.worldRailway,
      rooftops: this.worldRooftops,
      facadeDetail: this.worldFacadeDetail,
      detailedBuildings: this.worldDetailedBuildings,
      pedestrians: this.worldPedestrians,
      pedestrianDensity: this.worldPedestrianDensity,
      fog: this.worldFog,
      palette: this.worldPalette,
      leafColor: this.worldLeafColor !== '#ffffff' ? this.worldLeafColor : undefined,
      leafColorVar: this.worldLeafColorVar,
      traffic: this.worldTrafficRunning,
      weather: this.worldWeather,
      worldMode: this.worldMode,
      tileRadius: this.worldTileRadius,
      tileDetail: this.worldTileDetail,
      voidGrid: this.worldVoidGrid,
      borderGlow: this.worldBorderGlow,
      terrainApron: this.worldTerrainApron,
      voidExtent: this.worldVoidExtent,
      voidLineWidth: this.worldVoidLineWidth,
      borderGlowHeight: this.worldBorderGlowHeight,
    };
    if (this.worldPattern === 'radial') {
      p['spokeCount'] = this.worldSpokeCount;
      p['ringCount'] = this.worldRingCount;
    } else {
      p['gridCols'] = this.worldGridCols;
      p['gridRows'] = this.worldGridRows;
      p['junctionVariety'] = this.worldJunctionVariety;
      p['terraces'] = this.worldTerraces;
      p['shotengai'] = this.worldShotengai;
    }
    return p;
  }

  worldGenerate(): void {
    // Re-enters the mode → reframes the camera. Use for Generate button.
    const sm = this.shapeManager as any;
    sm.world?.enterCityMode(this._worldParams());
    this.worldHasWorld = true;
    this.worldEnabledRegions = null;
    this.worldRefreshRegions();
    this.scene3dMarkDirty();
  }

  worldRefreshRegions(): void {
    const regions = (this.shapeManager as any).world?.regions;
    this.worldRegions = Array.isArray(regions) ? regions : [];
    this.worldEnabledRegions = null;
  }

  worldToggleRegion(id: number): void {
    const sm = this.shapeManager as any;
    sm.world?.toggleRegion(id);
    const active = sm.world?.activeRegions;
    this.worldEnabledRegions = Array.isArray(active) ? active : null;
    this.scene3dMarkDirty();
  }

  worldEnableAllRegions(): void {
    const sm = this.shapeManager as any;
    sm.world?.setActiveRegions(null);
    this.worldEnabledRegions = null;
    this.scene3dMarkDirty();
  }

  worldSetTimeOfDay(t: number): void {
    this.worldTimeOfDay = t;
    (this.shapeManager as any).world?.setTimeOfDay(t);
  }

  worldToggleDayCycle(): void {
    const sm = this.shapeManager as any;
    if (this.worldDayCyclePlaying) {
      sm.world?.stopDayCycle();
      this.worldDayCyclePlaying = false;
    } else {
      sm.world?.playDayCycle(this.worldDayCycleSec);
      this.worldDayCyclePlaying = true;
    }
  }

  worldApplyCycleSpeed(): void {
    if (!this.worldDayCyclePlaying) return;
    const sm = this.shapeManager as any;
    sm.world?.stopDayCycle();
    sm.world?.playDayCycle(this.worldDayCycleSec);
  }

  worldSetRenderStyle(style: string | null): void {
    this.worldRenderStyle = style;
    (this.shapeManager as any).world?.setRenderStyle(style);
  }

  worldInitGradeKeys(): void {
    const keys = (this.shapeManager as any).world?.timeGradeKeys;
    if (keys) {
      this.worldGradeKeys = {
        night: { ...this.worldGradeKeys['night'], ...(keys['night'] ?? {}) },
        dawn:  { ...this.worldGradeKeys['dawn'],  ...(keys['dawn']  ?? {}) },
        noon:  { ...this.worldGradeKeys['noon'],  ...(keys['noon']  ?? {}) },
        dusk:  { ...this.worldGradeKeys['dusk'],  ...(keys['dusk']  ?? {}) },
      };
    }
  }

  worldSetCinematicGrade(on: boolean): void {
    this.worldCinematicGrade = on;
    (this.shapeManager as any).world?.setCinematicGrade(on);
  }

  worldSetOverrideLighting(on: boolean): void {
    this.worldOverrideGlobalLighting = on;
    (this.shapeManager as any).world?.setOverrideGlobalLighting(on);
  }

  worldSetGradeKey(field: string, value: number): void {
    const phase = this.worldGradePhase;
    this.worldGradeKeys = {
      ...this.worldGradeKeys,
      [phase]: { ...this.worldGradeKeys[phase], [field]: value },
    };
    (this.shapeManager as any).world?.setTimeGradeKey(phase, { [field]: value });
  }

  worldApplyStyle(name: string): void {
    const sm = this.shapeManager as any;
    sm.world?.applyStyle(name);
    // Sync sliders back from the pack's merged params
    const p = sm.world?.params;
    if (!p) return;
    if (p.border != null) this.worldBorder = p.border;
    if (p.pattern != null) this.worldPattern = p.pattern;
    if (p.seed != null) this.worldSeed = p.seed;
    if (p.radius != null) this.worldRadius = p.radius;
    if (p.elevation != null) this.worldElevation = p.elevation;
    if (p.warp != null) this.worldWarp = p.warp;
    if (p.palette != null) this.worldPalette = p.palette;
    if (p.leafColor != null) this.worldLeafColor = p.leafColor;
    if (p.leafColorVar != null) this.worldLeafColorVar = p.leafColorVar;
    if (p.fog != null) this.worldFog = p.fog;
    if (p.clouds != null) this.worldClouds = p.clouds;
    if (p.cloudDensity != null) this.worldCloudDensity = p.cloudDensity;
    if (p.holograms != null) this.worldHolograms = p.holograms;
    if (p.worldMode != null) this.worldMode = p.worldMode;
    if (p.tileRadius != null) this.worldTileRadius = p.tileRadius;
    if (p.tileDetail != null) this.worldTileDetail = p.tileDetail;
    if (p.voidGrid != null) this.worldVoidGrid = p.voidGrid;
    if (p.borderGlow != null) this.worldBorderGlow = p.borderGlow;
    if (p.terrainApron != null) this.worldTerrainApron = p.terrainApron;
    if (p.voidExtent != null) this.worldVoidExtent = p.voidExtent;
    if (p.voidLineWidth != null) this.worldVoidLineWidth = p.voidLineWidth;
    if (p.borderGlowHeight != null) this.worldBorderGlowHeight = p.borderGlowHeight;
    if (p.weather != null) this.worldWeather = p.weather;
    if (p.nightMode != null) this.worldNightMode = p.nightMode;
    if (p.streetWidth != null) this.worldStreetWidth = p.streetWidth;
    if (p.parkChance != null) this.worldParkChance = p.parkChance;
    if (p.waterChance != null) this.worldWaterChance = p.waterChance;
    if (p.powerLines != null) this.worldPowerLines = p.powerLines;
    if (p.railway != null) this.worldRailway = p.railway;
    if (p.signage != null) this.worldSignage = p.signage;
    const t = sm.world?.timeOfDay;
    if (t != null) this.worldTimeOfDay = t;
  }

  worldToggleTraffic(): void {
    this.worldTrafficRunning = !this.worldTrafficRunning;
    this.worldParamChanged();
  }

  worldToggleTurntable(): void {
    this.worldTurntableOn = !this.worldTurntableOn;
    (this.shapeManager as any).world?.setTurntable(this.worldTurntableOn ? 6 : 0);
  }

  worldClear(): void {
    const sm = this.shapeManager as any;
    sm.world?.exitCityMode();
    sm.world?.clear?.();
    this.worldHasWorld = false;
    this._worldMeshIdsKey = '';
    this.worldEnabledRegions = null;
    this.worldRegions = [];
    this.worldTimeOfDay = null;
    this.worldDayCyclePlaying = false;
    this.worldRenderStyle = null;
    this.worldTrafficRunning = false;
    if (this.worldTurntableOn) {
      (this.shapeManager as any).world?.setTurntable(0);
      this.worldTurntableOn = false;
    }
    this.scene3dWorldPanelOpen = false;
    this.scene3dRefreshMeshes();
    this.scene3dMarkDirty();
  }

  worldRandomizeSeed(): void {
    this.worldSeed = (Math.random() * 1e9) | 0 || 1;
    (this.shapeManager as any).world?.updateCity({ seed: this.worldSeed });
    this.scene3dMarkDirty();
  }

  worldToggleStreamFollow(): void {
    this.worldStreamFollow = !this.worldStreamFollow;
    (this.shapeManager as any).world?.setStreamFollow(this.worldStreamFollow);
    if (this.worldStreamFollow) {
      this._startStreamStats();
    } else {
      this._stopStreamStats();
    }
  }

  private _startStreamStats(): void {
    this._stopStreamStats();
    this._streamStatsTimer = setInterval(() => {
      const s = (this.shapeManager as any).world?.getStreamStats?.();
      if (!s) return;
      const pending = s.pending ? ` (+${s.pending})` : '';
      const workers = s.workers != null ? ` · workers ${s.workers ? 'on' : 'off'}` : '';
      this.worldStreamStats = `focus ${s.focusTile?.[0] ?? 0},${s.focusTile?.[1] ?? 0} · window ${s.window} · live ${s.live}${pending}${workers}`;
    }, 500);
  }

  private _stopStreamStats(): void {
    if (this._streamStatsTimer != null) { clearInterval(this._streamStatsTimer); this._streamStatsTimer = null; }
    this.worldStreamStats = '';
  }

  worldParamChanged(): void {
    if (this._worldDebounce) clearTimeout(this._worldDebounce);
    if (!this.worldHasWorld) return;
    if (this.worldMode !== 'tiled' && this.worldStreamFollow) {
      this.worldStreamFollow = false;
      (this.shapeManager as any).world?.setStreamFollow(false);
      this._stopStreamStats();
    }
    this._worldDebounce = setTimeout(() => {
      (this.shapeManager as any).world?.updateCity(this._worldParams());
      this.scene3dMarkDirty();
      // Skip the O(n) mesh rebuild for selective regens that don't change mesh IDs.
      const s3d = (this.shapeManager as any).scene3d;
      const newIds = (s3d?.getAllMeshes?.() ?? [] as any[]).map((m: any) => m.id ?? m.nodeId).join('\n');
      if (newIds !== this._worldMeshIdsKey) {
        this._worldMeshIdsKey = newIds;
        this.scene3dWorldPanelOpen = false;
        this.scene3dRefreshMeshes();
        this.scene3dWorldPanelOpen = true;
      }
    }, 10);
  }

  scene3dSetArrayToolMode(mode: 'line' | 'grid' | 'radial'): void {
    this.scene3dArrayToolMode = mode;
    if (this.scene3dArrayToolActive) {
      (this.shapeManager as any).setArrayToolMode?.(mode);
      if (mode === 'radial') this._scene3dSyncRadialToolStrip();
    }
  }

  scene3dSetArrayToolCount(count: number): void {
    this.scene3dArrayToolCount = count;
    if (this.scene3dArrayToolActive) (this.shapeManager as any).setArrayToolCount?.(count);
  }

  scene3dSetArrayToolRadius(r: number | null): void {
    this.scene3dArrayToolRadius = r;
    (this.shapeManager as any).setArrayToolRadius?.(r);
  }

  scene3dSetArrayToolArc(deg: number): void {
    this.scene3dArrayToolArc = deg;
    (this.shapeManager as any).setArrayToolArc?.(deg);
  }

  scene3dSetArrayToolAxis(axis: 'x' | 'y' | 'z'): void {
    this.scene3dArrayToolAxis = axis;
    (this.shapeManager as any).setArrayToolAxis?.(axis);
  }

  private _scene3dSyncRadialToolStrip(): void {
    const sm = this.shapeManager as any;
    this.scene3dArrayToolAxis   = sm.getArrayToolAxis?.()   ?? 'y';
    this.scene3dArrayToolRadius = sm.getArrayToolRadius?.() ?? null;
    this.scene3dArrayToolArc    = sm.getArrayToolArc?.()    ?? 360;
  }

  private _scene3dGetActiveAxis(s: [number, number, number]): 'x' | 'y' | 'z' | null {
    if (Math.abs(s[1]) < 1e-4 && Math.abs(s[2]) < 1e-4) return 'x';
    if (Math.abs(s[0]) < 1e-4 && Math.abs(s[2]) < 1e-4) return 'y';
    if (Math.abs(s[0]) < 1e-4 && Math.abs(s[1]) < 1e-4) return 'z';
    return null;
  }

  private _scene3dSyncArrayPanel(groupId: string): void {
    const sm = this.shapeManager as any;
    const params = sm.getArrayParams3D?.(groupId);
    if (!params) return;
    this.scene3dArrayMode = params.mode ?? 'linear';
    if (params.mode === 'radial') {
      this.scene3dArrayRadialCount = params.count ?? 6;
      this.scene3dArrayRadius = params.radius ?? 3;
      this.scene3dArrayArc = params.arcDeg ?? 360;
      this.scene3dArrayRadialAxis = params.axis ?? 'y';
    } else if (params.mode === 'grid') {
      this.scene3dArrayCountX = params.countX ?? 3;
      this.scene3dArrayCountY = params.countY ?? 3;
      const sx: [number,number,number] = params.spacingX ?? [2, 0, 0];
      const sy: [number,number,number] = params.spacingY ?? [0, 0, 2];
      this.scene3dArraySpacingX = Math.sqrt(sx[0]**2 + sx[1]**2 + sx[2]**2);
      this.scene3dArraySpacingY = Math.sqrt(sy[0]**2 + sy[1]**2 + sy[2]**2);
      this.scene3dArrayAxisX = this._scene3dGetActiveAxis(sx) ?? 'x';
      this.scene3dArrayAxisY = this._scene3dGetActiveAxis(sy) ?? 'z';
    } else {
      this.scene3dArrayCountX = params.countX ?? 3;
      const s: [number,number,number] = params.spacing ?? [2, 0, 0];
      this.scene3dArraySpacingX = Math.sqrt(s[0]**2 + s[1]**2 + s[2]**2);
      this.scene3dArrayAxisX = this._scene3dGetActiveAxis(s) ?? 'x';
    }
    // Object offset and merge-bake options (linear mode only)
    this.scene3dArrayObjectOffsetId = params.objectOffsetId ?? '';
    this.scene3dArrayGapFill = params.gapFill ?? false;
    this.scene3dArrayWeldThreshold = params.weldThreshold ?? 0.001;
    // Phase 5: sync per-instance overrides
    const rawOverrides: Array<{index: number; override: any}> = sm.getInstanceOverrides3D?.(groupId) ?? [];
    this.scene3dInstanceOverrides = rawOverrides.map(e => {
      const sc: [number,number,number] = e.override.scale ?? [1, 1, 1];
      return {
        index: e.index,
        rotX: e.override.rotationEulerDeg?.[0] ?? 0,
        rotY: e.override.rotationEulerDeg?.[1] ?? 0,
        rotZ: e.override.rotationEulerDeg?.[2] ?? 0,
        scaleX: sc[0] ?? 1,
        scaleY: sc[1] ?? 1,
        scaleZ: sc[2] ?? 1,
        visible: e.override.visible ?? true,
      };
    });
  }

  scene3dUpdateArrayCountX(v: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayCountX = v;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { countX: v });
  }

  scene3dUpdateArrayCountY(v: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayCountY = v;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { countY: v });
  }

  scene3dUpdateArraySpacingX(mag: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArraySpacingX = mag;
    const sm = this.shapeManager as any;
    const params = sm.getArrayParams3D?.(this.scene3dSelectedMeshId);
    if (!params) return;
    const s: [number,number,number] = params.mode === 'grid' ? (params.spacingX ?? [2,0,0]) : (params.spacing ?? [2,0,0]);
    const oldMag = Math.sqrt(s[0]**2 + s[1]**2 + s[2]**2) || 1;
    const scale = mag / oldMag;
    const newS: [number,number,number] = [s[0]*scale, s[1]*scale, s[2]*scale];
    sm.updateArrayParams3D?.(this.scene3dSelectedMeshId, params.mode === 'grid' ? { spacingX: newS } : { spacing: newS });
  }

  scene3dUpdateArraySpacingY(mag: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArraySpacingY = mag;
    const sm = this.shapeManager as any;
    const params = sm.getArrayParams3D?.(this.scene3dSelectedMeshId);
    if (!params || params.mode !== 'grid') return;
    const s: [number,number,number] = params.spacingY ?? [0, 0, 2];
    const oldMag = Math.sqrt(s[0]**2 + s[1]**2 + s[2]**2) || 1;
    const scale = mag / oldMag;
    sm.updateArrayParams3D?.(this.scene3dSelectedMeshId, { spacingY: [s[0]*scale, s[1]*scale, s[2]*scale] as [number,number,number] });
  }

  scene3dSetArrayAxisX(axis: 'x' | 'y' | 'z'): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayAxisX = axis;
    const mag = this.scene3dArraySpacingX || 2;
    const vec: [number,number,number] = axis === 'x' ? [mag,0,0] : axis === 'y' ? [0,mag,0] : [0,0,mag];
    const params = (this.shapeManager as any).getArrayParams3D?.(this.scene3dSelectedMeshId);
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId,
      params?.mode === 'grid' ? { spacingX: vec } : { spacing: vec });
  }

  scene3dSetArrayAxisY(axis: 'x' | 'y' | 'z'): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayAxisY = axis;
    const mag = this.scene3dArraySpacingY || 2;
    const vec: [number,number,number] = axis === 'x' ? [mag,0,0] : axis === 'y' ? [0,mag,0] : [0,0,mag];
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { spacingY: vec });
  }

  scene3dUpdateArrayRadialCount(v: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayRadialCount = v;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { count: Math.max(1, v) });
  }

  scene3dUpdateArrayRadius(v: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayRadius = v;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { radius: Math.max(0.1, v) });
  }

  scene3dUpdateArrayArc(v: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayArc = v;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { arcDeg: Math.min(360, Math.max(1, v)) });
  }

  scene3dSetArrayRadialAxis(axis: 'x' | 'y' | 'z'): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayRadialAxis = axis;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { axis });
  }

  scene3dSetArrayMode(mode: 'linear' | 'grid' | 'radial'): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayMode = mode;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { mode });
    this._scene3dSyncArrayPanel(this.scene3dSelectedMeshId);
  }

  scene3dEditArraySource(): void {
    if (!this.scene3dSelectedMeshId) return;
    const sm = this.shapeManager as any;
    const sourceId = sm.getArraySourceId?.(this.scene3dSelectedMeshId);
    if (!sourceId) return;
    const canvas = this.canvasRef?.nativeElement;
    sm.enterMeshEditMode3D?.(sourceId);
    this.scene3dIsEditingMesh = true;
    if (canvas) sm.attachMeshEditPointerHandlers?.(canvas, sourceId, () => this.ngZone.run(() => {}));
  }

  scene3dBakeArray(): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    const confirmed = window.confirm(
      'Convert to independent meshes? The source and all instances will become separate, editable meshes in one group. Changes to one mesh will no longer affect the others. (Undo will restore the linked array.)'
    );
    if (!confirmed) return;
    (this.shapeManager as any).bakeArray3D?.(this.scene3dSelectedMeshId);
    this.scene3dIsArrayGroup = false;
  }

  scene3dBakeArrayMerged(): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup || this.scene3dArrayMode !== 'linear') return;
    const confirmed = window.confirm(
      'Merge all copies into a single mesh with welded vertices? (Undo will restore the linked array.)'
    );
    if (!confirmed) return;
    (this.shapeManager as any).bakeArrayMerged3D?.(this.scene3dSelectedMeshId);
    this.scene3dIsArrayGroup = false;
  }

  scene3dSetArrayGapFill(v: boolean): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayGapFill = v;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { gapFill: v });
  }

  scene3dSetArrayWeldThreshold(v: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayWeldThreshold = v;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { weldThreshold: v });
  }

  scene3dApplyInstanceOverride(idx: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    const o = this.scene3dInstanceOverrides.find(x => x.index === idx);
    if (!o) return;
    (this.shapeManager as any).setInstanceOverride3D?.(this.scene3dSelectedMeshId, idx, {
      rotationEulerDeg: [o.rotX, o.rotY, o.rotZ] as [number, number, number],
      scale: [o.scaleX, o.scaleY, o.scaleZ] as [number, number, number],
      visible: o.visible,
    });
  }

  scene3dAddInstanceOverride(): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    const idx = Math.max(0, Math.floor(this.scene3dNewOverrideIdx));
    if (this.scene3dInstanceOverrides.some(x => x.index === idx)) return;
    (this.shapeManager as any).setInstanceOverride3D?.(this.scene3dSelectedMeshId, idx, {
      visible: true,
      scale: [1, 1, 1] as [number, number, number],
      rotationEulerDeg: [0, 0, 0] as [number, number, number],
    });
    this._scene3dSyncArrayPanel(this.scene3dSelectedMeshId);
  }

  scene3dSetObjectOffset(id: string): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayObjectOffsetId = id;
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { objectOffsetId: id || undefined });
  }

  scene3dClearObjectOffset(): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    this.scene3dArrayObjectOffsetId = '';
    (this.shapeManager as any).updateArrayParams3D?.(this.scene3dSelectedMeshId, { objectOffsetId: undefined });
  }

  scene3dClearInstanceOverride(idx: number): void {
    if (!this.scene3dSelectedMeshId || !this.scene3dIsArrayGroup) return;
    (this.shapeManager as any).clearInstanceOverride3D?.(this.scene3dSelectedMeshId, idx);
    this.scene3dInstanceOverrides = this.scene3dInstanceOverrides.filter(x => x.index !== idx);
  }

  scene3dResetCamera(): void {
    (this.shapeManager as any).scene3d?.resetCamera?.();
  }

  scene3dSetCameraMode(mode: 'perspective' | 'orthographic'): void {
    this.scene3dCameraMode = mode;
    (this.shapeManager as any).scene3d?.setCameraMode?.(mode);
    this.scene3dMarkDirty();
  }

  scene3dSetFOV(v: number): void {
    this.scene3dFOV = +v;
    (this.shapeManager as any).scene3d?.setFOV?.(+v);
    this.scene3dMarkDirty();
  }

  scene3dToggleOrbit(): void {
    const s3d = (this.shapeManager as any).scene3d;
    if (!s3d) return;
    this.scene3dOrbitEnabled = !this.scene3dOrbitEnabled;
    if (s3d.toggleOrbitControls) {
      s3d.toggleOrbitControls(this.scene3dOrbitEnabled);
    } else if (this.scene3dOrbitEnabled) {
      s3d.enableOrbitControls({ radius: 5, elevation: 0.4, azimuth: 0, enableDamping: true, dampingFactor: 0.08 });
    } else {
      s3d.disableOrbitControls();
    }
  }

  scene3dUndo(): void {
    const sm = this.shapeManager as any;
    if (sm.canUndo3D) {
      sm.undo3D?.();
      this.scene3dRefreshMeshes();
      this.uiRefreshLayers();
    }
  }

  scene3dRedo(): void {
    const sm = this.shapeManager as any;
    if (sm.canRedo3D) {
      sm.redo3D?.();
      this.scene3dRefreshMeshes();
      this.uiRefreshLayers();
    }
  }

  scene3dToggleShadows(enabled: boolean): void {
    this.scene3dShadowsEnabled = enabled;
    const sm = this.shapeManager as any;
    if (enabled) {
      sm.scene3d?.enableShadows?.(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias)
        ?? sm.enableShadows3D?.(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias);
    } else {
      sm.scene3d?.disableShadows?.() ?? sm.disableShadows3D?.();
    }
    this.scene3dMarkDirty();
  }

  scene3dApplyShadowsSettings(): void {
    if (!this.scene3dShadowsEnabled) return;
    const sm = this.shapeManager as any;
    sm.scene3d?.enableShadows?.(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias)
      ?? sm.enableShadows3D?.(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias);
    sm.scene3d?.setShadowStrength3D?.(this.scene3dShadowStrength);
    this.scene3dMarkDirty();
  }

  scene3dSetFrustumCulling(enabled: boolean): void {
    this.scene3dFrustumCulling = enabled;
    const sm = this.shapeManager as any;
    if (sm.scene3d) sm.scene3d.frustumCulling = enabled;
    if ('frustumCulling3D' in sm) sm.frustumCulling3D = enabled;
    this.scene3dMarkDirty();
  }

  scene3dApplyRetroPreset(preset: 'wobble' | 'pocket' | 'off'): void {
    (this.shapeManager as any).setRetroPreset3D?.(preset);
    const cfg = (this.shapeManager as any).scene3d?.getPS1Config?.() ?? {};
    this.scene3dPS1Jitter        = cfg.vertexJitter        ?? this.scene3dPS1Jitter;
    this.scene3dPS1Snap          = cfg.snapGridSize        ?? this.scene3dPS1Snap;
    this.scene3dPS1Affine        = cfg.affineStrength ?? cfg.affineWarp ?? this.scene3dPS1Affine;
    this.scene3dPS1ColorDepth    = cfg.colorDepth          ?? this.scene3dPS1ColorDepth;
    this.scene3dPS1Dither        = cfg.dither              ?? false;
    this.scene3dPS1DitherStrength = cfg.ditherStrength     ?? 0.45;
    this.scene3dPS1UVQuantize    = cfg.uvQuantize          ?? false;
    this.scene3dPS1UVSteps       = cfg.uvQuantizeSteps     ?? 64;
    if (cfg.renderResolution) {
      this.scene3dPS1LoRes = true;
      this.scene3dPS1ResW  = cfg.renderResolution[0];
      this.scene3dPS1ResH  = cfg.renderResolution[1];
    } else {
      this.scene3dPS1LoRes = false;
    }
    this.scene3dMarkDirty();
  }

  scene3dApplyPS1(): void {
    const cfg: any = {
      vertexJitter:    +this.scene3dPS1Jitter,
      snapGridSize:    +this.scene3dPS1Snap,
      affineStrength:  +this.scene3dPS1Affine,
      colorDepth:      +this.scene3dPS1ColorDepth,
      dither:          this.scene3dPS1Dither,
      ditherStrength:  +this.scene3dPS1DitherStrength,
      uvQuantize:      this.scene3dPS1UVQuantize,
      uvQuantizeSteps: +this.scene3dPS1UVSteps,
      renderResolution: this.scene3dPS1LoRes
        ? [+this.scene3dPS1ResW, +this.scene3dPS1ResH] as [number, number]
        : null,
    };
    (this.shapeManager as any).scene3d?.setPS1Config(cfg);
    this.scene3dMarkDirty();
  }

  scene3dApplyLighting(): void {
    const sm = this.shapeManager as any;
    const s3d = sm.scene3d;
    if (!s3d) return;
    sm.setLightAngles3D?.(this.scene3dLightAzimuth, this.scene3dLightElevation);
    sm.setLightIntensity3D?.(+this.scene3dLightIntensity);
    const kc = this.hexToRgba01(this.scene3dKeyLightColorHex);
    sm.setLightColor3D?.(kc[0], kc[1], kc[2]);
    const ac = this.hexToRgba01(this.scene3dAmbientColorHex);
    this.scene3dAmbientR = ac[0]; this.scene3dAmbientG = ac[1]; this.scene3dAmbientB = ac[2];
    s3d.setAmbientLight?.(ac[0], ac[1], ac[2], +this.scene3dAmbientIntensity);
    this.scene3dMarkDirty();
  }

  scene3dApplyWind(): void {
    (this.shapeManager as any).setSceneWind3D?.({
      dirDeg:   this.sceneWindDirDeg,
      strength: +this.sceneWindStrength,
      speed:    +this.sceneWindSpeed,
    });
    this.scene3dMarkDirty();
  }

  scene3dApplySceneBg(): void {
    const c1 = this._hexToRgba01(this.scene3dBgColor1);
    const c2 = this._hexToRgba01(this.scene3dBgColor2);
    (this.shapeManager as any).setSceneBg3D?.({
      mode: this.scene3dBgMode,
      color1: [c1.r, c1.g, c1.b, 1],
      color2: [c2.r, c2.g, c2.b, 1],
    });
  }

  scene3dApplyFog(): void {
    const c = this._hexToRgba01(this.scene3dFogColor);
    (this.shapeManager as any).setFog3D?.({
      mode: this.scene3dFogMode,
      color: [c.r, c.g, c.b],
      near: +this.scene3dFogNear,
      far: +this.scene3dFogFar,
      density: +this.scene3dFogDensity,
    });
  }

  scene3dSetEnhancedVisuals(on: boolean): void {
    this.scene3dEnhancedVisuals = on;
    (this.shapeManager as any).setEnhancedVisuals3D?.(on);
    if (on) {
      this.scene3dGlassQuality = true;
    }
  }

  scene3dSetGlassQuality(on: boolean): void {
    this.scene3dGlassQuality = on;
    (this.shapeManager as any).setGlassQuality3D?.(on);
  }

  scene3dSetAerialPerspective(v: number): void {
    this.scene3dAerialPerspective = v;
    (this.shapeManager as any).setAerialPerspective3D?.(v);
  }

  scene3dSetTextureFilter(filter: 'nearest' | 'linear'): void {
    this.scene3dTextureFilter = filter;
    (this.shapeManager as any).setTextureFilterMode3D?.(filter);
  }

  scene3dEnsureAnimationPlayer(): void {
    const sm = this.shapeManager as any;
    if (!sm.getAnimationPlayer3D?.()) {
      sm.createAnimationPlayer3D?.({
        startFrame: this.scene3dAnimStartFrame,
        endFrame: this.scene3dAnimEndFrame,
        fps: this.scene3dAnimFps,
        loop: this.scene3dAnimLoop,
      });
    }
  }

  scene3dApplyAnimationConfig(): void {
    this.scene3dEnsureAnimationPlayer();
    const player = (this.shapeManager as any).getAnimationPlayer3D?.();
    if (!player) return;
    player.startFrame = +this.scene3dAnimStartFrame;
    player.endFrame = +this.scene3dAnimEndFrame;
    player.fps = +this.scene3dAnimFps;
    player.loop = !!this.scene3dAnimLoop;
    this.scene3dMarkDirty();
  }

  scene3dToggleAnimationSync(sync: boolean): void {
    this.scene3dAnimSyncWithTimeline = sync;
    if (sync) {
      (this.shapeManager as any).scene3d?.stopSyncedPlayback?.();
    }
    this.scene3dMarkDirty();
  }

  scene3dAnimationPlay(): void {
    this.scene3dEnsureAnimationPlayer();
    const sm = this.shapeManager as any;
    if (this.scene3dAnimSyncWithTimeline) {
      sm.scene3d?.startSyncedPlayback?.();
      return;
    }
    sm.getAnimationPlayer3D?.()?.play?.();
  }

  scene3dAnimationPause(): void {
    const sm = this.shapeManager as any;
    if (this.scene3dAnimSyncWithTimeline) {
      sm.scene3d?.pauseSyncedPlayback?.();
      return;
    }
    sm.getAnimationPlayer3D?.()?.pause?.();
  }

  scene3dAnimationStop(): void {
    const sm = this.shapeManager as any;
    if (this.scene3dAnimSyncWithTimeline) {
      sm.scene3d?.stopSyncedPlayback?.();
      return;
    }
    sm.getAnimationPlayer3D?.()?.stop?.();
  }

  scene3dRecordKeyframe(): void {
    const sm = this.shapeManager as any;
    const frame = this.animationService.getCurrentFrame?.() ?? 1;
    const count = sm.recordKeyframesForSelectedMeshes3D?.(frame);
    if (!count && this.scene3dSelectedMeshId) {
      sm.recordKeyframeForMesh3D?.(this.scene3dSelectedMeshId, frame);
    }
    this.scene3dRefreshKeyframeTracks();
    this.scene3dKeyframeFlash = true;
    clearTimeout(this._scene3dFlashTimer);
    this._scene3dFlashTimer = setTimeout(() => { this.scene3dKeyframeFlash = false; }, 600);
    this.scene3dMarkDirty();
  }

  scene3dRefreshKeyframeTracks(): void {
    const sm = this.shapeManager as any;
    const s3d = sm.scene3d;

    // Always fetch fresh mesh objects so keyframeTracks reflects the latest recorded data.
    const freshMeshes: any[] = s3d?.getAllMeshes?.() ?? this.scene3dMeshes;

    // Build one row per mesh. Priority order for track data:
    //   1. mesh.keyframeTracks  — live property on the mesh object, always up to date
    //   2. getMeshKeyframeTracks3D(id) — Salsa public API
    //   3. getAllMeshKeyframeTracks3D() entry — batch API
    //   4. {} — empty (mesh exists, no keyframes yet)
    const fromSalsa: { meshId: string; name: string; tracks: any }[] =
      sm.getAllMeshKeyframeTracks3D?.() ?? [];
    const salsaknownTracks = new Map(fromSalsa.map(e => [e.meshId, e.tracks]));

    const allRows: { meshId: string; name: string; tracks: any }[] = freshMeshes
      .filter((m: any) => m.id ?? m.nodeId)
      .map((m: any) => {
        const id = m.id ?? m.nodeId;
        const tracks =
          (m.keyframeTracks && Object.keys(m.keyframeTracks).length ? m.keyframeTracks : null)
          ?? sm.getMeshKeyframeTracks3D?.(id)
          ?? salsaknownTracks.get(id)
          ?? {};
        return { meshId: id, name: m.name ?? m.meshPrimitive ?? 'Mesh3D', tracks };
      });

    // Prepend a synthetic camera row if camera tracks exist
    const camTracks = sm.getCameraKeyframeTracks3D?.() ?? {};
    if (Object.keys(camTracks).some(k => (camTracks[k]?.length ?? 0) > 0)) {
      allRows.unshift({ meshId: '__camera__', name: '📷 Camera', tracks: camTracks, isCamera: true } as any);
    }

    this.scene3dAllMeshTracks = allRows;

    // Keep single-selected-mesh state in sync for anything that still reads it.
    if (this.scene3dSelectedMeshId) {
      const entry = allRows.find(e => e.meshId === this.scene3dSelectedMeshId);
      this.scene3dSelectedMeshTracks = entry?.tracks ?? null;
      if (!this.scene3dSelectedMeshName && entry) {
        this.scene3dSelectedMeshName = entry.name;
      }
    } else {
      this.scene3dSelectedMeshTracks = null;
      this.scene3dSelectedMeshName = '';
    }
    this._refreshBlendKeyframeTracks();
  }

  get scene3dAutoKey(): boolean {
    return !!(this.shapeManager as any).autoKey3D;
  }

  scene3dSetAutoKey(enabled: boolean): void {
    (this.shapeManager as any).autoKey3D = enabled;
  }

  // ── Arrowheads ──────────────────────────────────────────
  onArrowheadStartChange(style: ArrowheadStyle): void {
    this.arrowheadStart = style;
    this.shapeManager.setDefaultArrowheads?.(this.arrowheadStart, this.arrowheadEnd);
  }
  onArrowheadEndChange(style: ArrowheadStyle): void {
    this.arrowheadEnd = style;
    this.shapeManager.setDefaultArrowheads?.(this.arrowheadStart, this.arrowheadEnd);
  }
  onArrowheadSizeChange(v: number): void {
    this.arrowheadSize = +v;
  }

  // ── Raster Text tool ─────────────────────────────────────
  private _enableRasterText(): void {
    this.shapeManager.enableRasterText?.();
    this._rasterTextSub = this.shapeManager.onRasterTextStateChanged?.((state: RasterTextState) => {
      this.rasterTextState = state;
    }) ?? null;
  }
  private _disableRasterText(): void {
    this.shapeManager.disableRasterText?.();
    this._rasterTextSub?.unsubscribe();
    this._rasterTextSub = null;
    this.rasterTextState = null;
  }
  onRasterTextFontChange(font: string): void {
    this.rasterTextFont = font;
    this._updateRasterTextProps();
  }
  onRasterTextFontSizeChange(size: number): void {
    this.rasterTextFontSize = +size;
    this._updateRasterTextProps();
  }
  toggleRasterTextBold(): void {
    this.rasterTextBold = !this.rasterTextBold;
    this._updateRasterTextProps();
  }
  toggleRasterTextItalic(): void {
    this.rasterTextItalic = !this.rasterTextItalic;
    this._updateRasterTextProps();
  }
  onRasterTextAlignChange(align: 'left' | 'center' | 'right'): void {
    this.rasterTextAlign = align;
    this._updateRasterTextProps();
  }
  onRasterTextColorChange(color: string): void {
    this.rasterTextColor = color;
    // Convert hex to RGBA 0-1
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;
    this.shapeManager.updateRasterTextProperties?.({ color: [r, g, b, 1] });
  }
  commitRasterText(): void {
    this.shapeManager.commitRasterText?.();
  }
  cancelRasterText(): void {
    this.shapeManager.cancelRasterText?.();
  }
  private _updateRasterTextProps(): void {
    this.shapeManager.updateRasterTextProperties?.({
      font: this.rasterTextFont,
      fontSize: this.rasterTextFontSize,
      bold: this.rasterTextBold,
      italic: this.rasterTextItalic,
      align: this.rasterTextAlign,
    });
  }

  public layerSearchTerm = '';
  // Raster layers from ShapeManager (renderer)
  public rasterLayers: Array<any> = [];
  public selectedRasterLayerId: string | null = null;
  public get filteredLayers(): LayerTreeNode[] {
    return this.filterLayers(this.layerTree?.children ?? []).slice().reverse();
  }

  filterLayers(layers: LayerTreeNode[] | undefined): LayerTreeNode[] {
    if (!layers) return [];
    if (!this.layerSearchTerm.trim()) return layers;

    const term = this.layerSearchTerm.toLowerCase();
    const matches = (layer: LayerTreeNode) => layer.name.toLowerCase().includes(term);

    const filterRecursively = (nodes: LayerTreeNode[]): LayerTreeNode[] =>
      nodes
        .map(n => {
          const kids = n.children ? filterRecursively(n.children) : [];
          return (matches(n) || kids.length) ? { ...n, children: kids } : null;
        })
        .filter(Boolean) as LayerTreeNode[];

    return filterRecursively(layers);
  }

  hoverLayer(event: MouseEvent, layer: LayerTreeNode) {
    event.stopPropagation();
    this.hoveredLayerId = layer.id;
    this.shapeManager.addSelectedNode(layer.id);
  }

  selectLayer(layer: LayerTreeNode, event?: MouseEvent) {
    event?.stopPropagation();
    this.closeContextMenu();
    const isCtrl = event?.ctrlKey || event?.metaKey;

    if (!isCtrl) {
      for (const id of this.selectedLayerIds) this.shapeManager.deselectNode(id);
      this.selectedLayerIds.clear();
    }

    if (this.selectedLayerIds.has(layer.id)) {
      this.selectedLayerIds.delete(layer.id);
      this.shapeManager.deselectNode(layer.id);
    } else {
      this.selectedLayerIds.add(layer.id);
      this.shapeManager.addSelectedNode(layer.id);
    }
  }

  unhoverLayer(event: MouseEvent, layer: LayerTreeNode) {
    event.stopPropagation();
    if (!this.selectedLayerIds.has(layer.id)) {
      if (this.hoveredLayerId === layer.id) this.hoveredLayerId = null;
      this.shapeManager.deselectNode(layer.id);
    }
  }

  toggleVisibility(layer: LayerTreeNode) {
    layer.visible = !layer.visible;
    this.shapeManager?.setNodeVisibility(layer.id, layer.visible);
  }
  toggleLock(layer: LayerTreeNode) {
    layer.locked = !layer.locked;
    this.shapeManager?.setNodeLocked(layer.id, layer.locked);
  }

  openBgColorPicker() {
    if (!this.showBgColorPicker) {
      setTimeout(() => {
        this.showBgColorPicker = true;
        setTimeout(() => this.bgColorPickerRef?.setColor(this.bgColor.startsWith('#') ? this.bgColor : '#' + this.bgColor));
      }, 0);
    } else this.showBgColorPicker = false;
  }
  openDotColorPicker() {
    if (!this.showDotColorPicker) {
      setTimeout(() => {
        this.showDotColorPicker = true;
        setTimeout(() => this.dotColorPickerRef?.setColor(this.dotColor.startsWith('#') ? this.dotColor : '#' + this.dotColor));
      }, 0);
    } else this.showDotColorPicker = false;
  }
  openShapeColorPicker() {
    if (!this.showShapeColorPicker) {
      setTimeout(() => {
        this.showShapeColorPicker = true;
        setTimeout(() => this.shapeColorPickerRef?.setColor(this.shapeColor.startsWith('#') ? this.shapeColor : '#' + this.shapeColor));
      }, 0);
    } else this.showShapeColorPicker = false;
  }

  onShapeHexInputChange(v: string) { this.shapeHexInputDraft = v; }
  onBgHexInputChange(v: string) { this.bgHexInputDraft = v; }
  onDotHexInputChange(v: string) { this.dotHexInputDraft = v; }
  onHexInputEnter(event: Event) { (event.target as HTMLInputElement).blur(); }

  onBgHexInputBlur() {
    const raw = this.bgHexInputDraft.trim();
    const hex = '#' + raw;
    const isValid = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex);
    if (isValid) { this.bgColor = hex; this.bgHexInputDraft = raw; this.onBgColorSelected(hex); }
    else this.bgHexInputDraft = this.bgColor.replace('#', '');
  }
  onDotHexInputBlur() {
    const raw = this.dotHexInputDraft.trim();
    const hex = '#' + raw;
    const isValid = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex);
    if (isValid) { this.dotColor = hex; this.dotHexInputDraft = raw; this.onDotColorSelected(hex); }
    else this.dotHexInputDraft = this.dotColor.replace('#', '');
  }
  onShapeHexInputBlur(layerId: string) {
    const raw = this.shapeHexInputDraft.trim();
    const hex = '#' + raw;
    const isValid = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex);
    if (isValid) { this.shapeHexInputDraft = raw; this.onNodeFillColorSelected(layerId, hex); }
    else this.shapeHexInputDraft = this.rgbaToHex(this.shapeManager.getNodeFillColor(layerId));
  }

  private rgbaToHex(rgba: { r: number; g: number; b: number; a: number }): string {
    const toHex = (v: number) => {
      const scaled = Math.round(v * 255);
      const hex = scaled.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;
  }

  // ---- color appliers ----
  onBgColorSelected(color: string) {
    this.bgColor = color;
    this.bgHexInputDraft = color.replace('#', '');
    const { r, g, b, a } = this.parseAnyColor(color);
    this.shapeManager?.setBackgroundColor(r / 255, g / 255, b / 255, a);
    this._markStateDirty();
  }
  onDotColorSelected(color: string) {
    this.dotColor = color;
    this.dotHexInputDraft = color.replace('#', '');
    const { r, g, b, a } = this.parseAnyColor(color);
    this.shapeManager?.setDotColor(r / 255, g / 255, b / 255, a);
    this._markStateDirty();
  }
  onNodeFillColorSelected(layerId: string, color: string) {
    this.shapeColor = color;
    this.shapeHexInputDraft = color.replace('#', '');
    const { r, g, b, a } = this.parseAnyColor(color);
    this.shapeManager?.setNodeFillColor(layerId, { r: r / 255, g: g / 255, b: b / 255, a });
  }

  private parseAnyColor(color: string) {
    let r = 255, g = 255, b = 255, a = 1;
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      if (hex.length === 3) { r = parseInt(hex[0] + hex[0], 16); g = parseInt(hex[1] + hex[1], 16); b = parseInt(hex[2] + hex[2], 16); }
      else if (hex.length === 6 || hex.length === 8) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
        if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
      }
    } else if (color.startsWith('rgb')) {
      const vals = color.match(/\d+(\.\d+)?/g);
      if (vals) { r = +vals[0]; g = +vals[1]; b = +vals[2]; if (vals[3]) a = +vals[3]; }
    } else {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.fillStyle = color;
      const computed = ctx.fillStyle;
      if (computed.startsWith('rgb')) {
        const vals = computed.match(/\d+(\.\d+)?/g)!;
        r = +vals[0]; g = +vals[1]; b = +vals[2]; if (vals[3]) a = +vals[3];
      }
    }
    return { r, g, b, a };
  }

  // Pen/Highlight/Pattern
  showPenColorPicker = false;
  customPenColor = '#fff';
  private readonly _defaultPenPalette = ['#000000','#E74C3C','#F39C12','#ffff00','#2ECC71','#3498DB','#9B59B6','#FFFFFF'];
  penColorPalette: string[] = [...this._defaultPenPalette];

  // ── Palette context menu (Q2) ──────────────────────────────────
  paletteCtxMenuVisible = false;
  paletteCtxMenuX = 0;
  paletteCtxMenuY = 0;
  paletteCtxMenuIndex = -1;

  onPaletteCtxMenu(e: MouseEvent, i: number): void {
    e.preventDefault();
    e.stopPropagation();
    this.paletteCtxMenuIndex = i;
    this.paletteCtxMenuX = e.clientX;
    this.paletteCtxMenuY = e.clientY;
    this.paletteCtxMenuVisible = true;
  }

  replacePaletteWithCurrentColor(): void {
    if (this.paletteCtxMenuIndex < 0) return;
    this.penColorPalette = [...this.penColorPalette];
    this.penColorPalette[this.paletteCtxMenuIndex] = this.selectedPenColor;
    try { localStorage.setItem('frog-pen-palette', JSON.stringify(this.penColorPalette)); } catch {}
    this.paletteCtxMenuVisible = false;
  }

  resetPaletteToDefault(): void {
    this.penColorPalette = [...this._defaultPenPalette];
    try { localStorage.removeItem('frog-pen-palette'); } catch {}
    this.paletteCtxMenuVisible = false;
  }

  closePaletteCtxMenu(): void {
    this.paletteCtxMenuVisible = false;
  }

  private _loadPaletteFromStorage(): void {
    try {
      const stored = localStorage.getItem('frog-pen-palette');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === 8) {
          this.penColorPalette = parsed;
        }
      }
    } catch {}
  }
  highlightColorPalette: string[] = ['#A8A8A8','#FFADAD','#FFD6A5','#FDFFB6','#CAFFBF','#a0fdff','#DAB6FC','#FFFFFF'];
  highlightColorMapping: Map<string, string> = new Map([
    ['#A8A8A8', '#828282'],
    ['#FFADAD', '#ff80dd'],
    ['#FFD6A5', '#FFB766'],
    ['#FDFFB6', '#03ff9e'],
    ['#CAFFBF', '#8EEA87'],
    ['#a0fdff', '#59faff'],
    ['#DAB6FC', '#B48CF9'],
    ['#FFFFFF', '#FFFFFF']
  ]);

  patternPalette: string[] = [
    'assets/patterns/webp/checker.webp',
    'assets/patterns/webp/flowers.webp',
    'assets/patterns/webp/leaves.webp',
    'assets/patterns/webp/plaid.webp',
    'assets/patterns/webp/plaid-2.webp',
    'assets/patterns/webp/polka.webp',
    'assets/patterns/webp/caution-tape.webp',
    'assets/patterns/webp/plants.webp'
  ];

  private onMouseMove!: (e: MouseEvent) => void;
  private onClick!: (e: MouseEvent) => void;
  private onDblClick!: (e: MouseEvent) => void;
  private onKeyDown!: (e: KeyboardEvent) => void;
  private onDocMousedown!: (e: MouseEvent) => void;
  private onPaste!: (e: ClipboardEvent) => void;

  private sceneChanged$ = new Subject<string>();
  private _metaFlush$ = new Subject<void>();
  private _metaFlushSub?: Subscription;

  // Sync mode for current illustration: 0=CloudSync, 1=NoCloud, 2=LocalOnly
  syncMode = 0;
  isLocalMode = false;
  isViewerMode = false;
  viewerTitle = '';
  isPublishing = false;

  // ── Grease Pencil ──────────────────────────────────────────────
  gpPanelVisible = false;

  openGpPanel(): void  { this._exitAllScene3dModes(); this.gpPanelVisible = true; }

  closeGpPanel(): void {
    this.gpPanelVisible = false;
    // Panel's ngOnDestroy handles draw mode / face-select cleanup; belt-and-suspenders here.
    const sm = this.shapeManager as any;
    sm.exitGpDrawMode3D?.();
    sm.exitGpFaceSelectMode3D?.();
    sm.clearGpDrawPlane3D?.();
  }

  onGpDrawSettingsChange(_s: GpDrawSettings): void {
    // The panel component now owns the full GP draw lifecycle (face-select → draw mode).
    // This handler is kept as a no-op so the template binding compiles without changes.
  }
  showPublishShareDialog = false;
  publishShareViewUrl = '';
  publishShareEmbedCode = '';

  // ── Export Modal ──────────────────────────────────────────────
  showExportModal = false;
  exportModalTab: 'image' | 'scene' | 'workfile' = 'image';
  exportCartTitle = '';
  exportCartAuthor = '';
  exportCartDescription = '';
  exportCartBusy = false;
  exportCartSounds: string[] = [];

  // ── Screencast Keys ───────────────────────────────────────────
  screenscastKeysEnabled = false;
  screenscastKeyEntries: { text: string; id: number }[] = [];
  private _screenscastKeyIdCounter = 0;

  toggleScreencastKeys(): void {
    this.screenscastKeysEnabled = !this.screenscastKeysEnabled;
    if (!this.screenscastKeysEnabled) this.screenscastKeyEntries = [];
  }

  trackScreencastKey(_: number, entry: { text: string; id: number }): number {
    return entry.id;
  }

  private _pushScreenscastKey(text: string): void {
    if (!this.screenscastKeysEnabled) return;
    const id = ++this._screenscastKeyIdCounter;
    this.ngZone.run(() => {
      this.screenscastKeyEntries = [{ text, id }, ...this.screenscastKeyEntries.slice(0, 4)];
    });
    setTimeout(() => {
      this.ngZone.run(() => {
        this.screenscastKeyEntries = this.screenscastKeyEntries.filter(e => e.id !== id);
      });
    }, 2500);
  }

  private _formatKeyForScreencast(e: KeyboardEvent): string | null {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
    const parts: string[] = [];
    const isMac = navigator.userAgent.includes('Mac');
    if (isMac ? e.metaKey : e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    const keyMap: Record<string, string> = {
      ' ': 'Space', 'ArrowLeft': '←', 'ArrowRight': '→',
      'ArrowUp': '↑', 'ArrowDown': '↓',
      'Delete': 'Del', 'Backspace': '⌫', 'Escape': 'Esc', 'Enter': '↵',
    };
    parts.push(keyMap[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key));
    return parts.join('+');
  }
  noCloudEmptyState = false;
  showSyncModePanel = false;
  syncModePanelSelection = 0;
  syncModePanelStep: 'select' | 'confirm' = 'select';
  showExportReminder = false;
  opfsSizeLabel = '';

  constructor(
    private route: ActivatedRoute,
    private illustrationService: IllustrationService, // ⬅️ swapped
    private router: Router,
    private authService: AuthService,
    private notifyService: NotifyService,
    public rasterBrushService: RasterBrushService,
    public rasterSelectionService: RasterSelectionService,
    public animationService: RasterAnimationService,
    public autoSaveService: RasterAutoSaveService,
    public frogFileService: FrogFileService,
    private ngZone: NgZone,
    private opfsMetadataService: OpfsMetadataService,
    private localIllustrationService: LocalIllustrationService,
  ) { }

  ngOnInit() {
    if (this.retroThemeActive) document.body.classList.add('theme-retro-chrome');
    this._loadPaletteFromStorage();
    // React whenever /illustrate/:id changes
    this.routeSub = this.route.paramMap
      .pipe(
        map(p => p.get('id')),
        filter((id): id is string => !!id),
        distinctUntilChanged()
      )
      .subscribe((illustrationUid) => {
        this.initForIllustration(illustrationUid);
      });
  }

  private async initForIllustration(illustrationUid: string) {
    this.isLoading = true;
    this.illustrationUid = illustrationUid;
    this.isLocalMode  = this.route.snapshot.data?.['local']   === true;
    this.isViewerMode = this.route.snapshot.data?.['viewer']  === true;
    this.syncMode = this.isLocalMode ? 2 : 0;

    // cleanup
    this.autoSaveSubscription?.unsubscribe();
    this._metaFlushSub?.unsubscribe();
    this.thumbnailSaveSubscription?.unsubscribe();
    this.selectionChangedSubscription?.unsubscribe();
    this.rasterStrokeSubscription?.unsubscribe();
    this.resetSceneState();
    this.lastSavedThumbnailJSON = '';
    this.lastThumbnailTime = 0;

    // WebGPU bootstrap — run outside Angular's zone so Salsa's canvas.addEventListener
    // calls don't get Zone.js-wrapped and trigger CD on every pointer event.
    // afterRendererBoot is explicitly re-entered into the zone because the await
    // continuation resumes in the outer (non-Angular) zone context.
    if (!isRendererLive) {
      await this.ngZone.runOutsideAngular(() => startWebGPURendering('webgpuCanvas'));
      this.ngZone.run(() => this.afterRendererBoot(false));
    } else {
      await this.ngZone.runOutsideAngular(() => reinitializeWebGPURendering('webgpuCanvas'));
      this.ngZone.run(() => this.afterRendererBoot(true));
    }

    this.canvas = this.canvasRef.nativeElement;
    this.shapeManager.setStrokeWidth(this.strokeWidth);

    this.illustrationUid = this.route.snapshot.paramMap.get('id');

    if (this.illustrationUid) {
      const navState = (window.history.state as any);
      const stateIllustration = navState?.illustration;
      if (navState?.isNew) this._focusTitleOnLoad = true;
      if (navState?.startAnimation) this._startAnimationOnLoad = true;

      if (this.isViewerMode) {
        await this._initViewerMode(this.illustrationUid);
      } else if (this.isLocalMode) {
        // Local-only: resolve from IndexedDB, not the API
        const fromState = stateIllustration?.syncMode === 2 && stateIllustration?.uuid === this.illustrationUid
          ? stateIllustration
          : await this.localIllustrationService.getByUuid(this.illustrationUid);
        if (fromState) {
          await this.initWithIllustration(fromState as any);
        } else {
          this.notifyService.error('Local illustration not found');
          this.markLoaded('illustration');
          requestAnimationFrame(() => this.markLoaded('sceneApplied'));
        }
      } else if (stateIllustration?.id && stateIllustration?.uuid === this.illustrationUid) {
        // If we navigated here from the dashboard the illustration object is already in
        // router state — use it directly and skip the API round-trip.
        await this.initWithIllustration(stateIllustration);
      } else {
        this.illustrationService.getIllustrationByUid(this.illustrationUid).subscribe(async (res: any) => {
          if (res.resultType === ResultType.Success) {
            await this.initWithIllustration(res.resultObject);
          }
        });
      }

      // Initialize SDF & stamp defaults
      if (this.shapeManager) {
        this.setSDFTextColor(this.selectedSDFTextColor);
        this.setSDFTextOutlineColor(this.selectedSDFTextOutlineColor);
        this.setSDFTextFontSize(this.selectedSDFTextFontSize);
        this.setSDFTextFont(this.selectedSDFTextFont);
        this.setSDFTextThreshold(this.selectedSDFTextThreshold);
        this.setSDFTextSmoothing(this.selectedSDFTextSmoothing);
        this.setSDFTextOutlineWidth(this.selectedSDFTextOutlineWidth);

        this.setStamp(this.selectedStamp);
        this.setStampColor(this.selectedStampColor);
        this.setStampSize(this.selectedStampSize);
      }
    } else {
      this.markLoaded('illustration');
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
    }

    // input listeners
    this.onMouseMove = (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      // Skip zone entry when nothing needs Angular CD (e.g. city mode, no active tool).
      if (!this.selectedShapeType && !this.showBrushCursor) return;
      this.ngZone.run(() => {
        if (this.selectedShapeType) this.shapeManager.updatePreviewShapePosition(event);
        if (this.showBrushCursor) {
          this.brushCursorX = event.clientX;
          this.brushCursorY = event.clientY;
        }
      });
    };
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.onMouseMove);
    });

    this.onClick = (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      if (this.selectedShapeType) {
        this.shapeManager.confirmPreviewShape();
        this.shapeManager.setPreviewShape(this.selectedShapeType, event);
      }
      // Speech Balloon tool — place balloon at click position
      if (this.controlPanelActiveTool === 'balloon') {
        const worldPos = (this.shapeManager as any).interactionService?.toWorldCoords?.(event);
        if (worldPos) this.placeBalloon(worldPos.x, worldPos.y);
      }
      // Live Text tool — canvas interactions are driven by setRectDrawCallback;
      // document click only handles ending editing when clicking outside the canvas.
      if (this.controlPanelActiveTool === 'live-text' && this.liveTextIsEditing && event.target !== this.canvas) {
        this.endLiveTextEditing();
      }
      // Flood Fill tool — fill at click position
      if (this.controlPanelActiveTool === 'fill') {
        this.onCanvasClickForFill(event);
      }
    };
    document.addEventListener('click', this.onClick);

    // Double-click on canvas: enter edit mode on selected LiveTextNode
    this.onDblClick = (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      const selectedIds = this._getSelectedShapeIds();
      if (selectedIds.length !== 1) return;
      const nodeId = selectedIds[0];
      const sm = this.shapeManager as any;
      const liveNode = sm.getLiveTextNode?.(nodeId);
      if (liveNode && !this.liveTextIsEditing) {
        this.liveTextNodeId = nodeId;
        this._syncLiveTextSidebar(nodeId);
        sm.enterLiveTextEditingAt?.(nodeId, event.clientX, event.clientY);
        this.liveTextIsEditing = true;
        // Switch to live-text tool so the sidebar panel is visible
        if (this.controlPanelActiveTool !== 'live-text') {
          this.controlPanelActiveTool = 'live-text';
          this.hasHtmlInCanvas = !!sm.isHtmlInCanvasAvailable?.();
        }
        event.preventDefault();
      }
    };
    this.canvas!.addEventListener('dblclick', this.onDblClick);

    this.onKeyDown = this.handleHotkeys.bind(this);
    window.addEventListener('keydown', this.onKeyDown);

    this.onDocMousedown = this.handleBgColorPickerClick.bind(this);
    document.addEventListener('mousedown', this.onDocMousedown);

    this.onPaste = this.handlePasteImage.bind(this);
    document.addEventListener('paste', this.onPaste);

    this.getBackgroundColor();
    this.getDotColor();

    this.setShapeColor('#9B59B6');
    this.setHighlightColor('#DAB6FC');
    this.setPenColor('#9B59B6');
  }

  private _updateGizmoPosition(delayMs = 320): void {
    clearTimeout(this._gizmoPosTimer);
    this._gizmoPosTimer = setTimeout(() => {
      const panelOpen = this.scene3dWorldPanelOpen || this.scene3dArrayToolActive || this.scene3dEditCharPanelOpen || this.scene3dEditBuildingPanelOpen || this.scene3dEditFoliagePanelOpen || this.scene3dEditBlockPanelOpen || this.scene3dPkgCreatorOpen || this.scene3dCreatorPanelOpen;
      (this.shapeManager as any)?.setViewGizmoPosition3D?.({
        corner: 'top-left',
        offsetX: panelOpen ? 337 : 82,
        offsetY: 52,
      });
    }, delayMs);
  }

  private afterRendererBoot(isReinit = false) {
    // Prefer getting WorldManager first so we can extract any renderer/device it holds
    this.worldManager = WorldManager.getInstance();

    // Try to construct or re-get ShapeManager with the renderer/device so raster layers are seeded.
    try {
      const wmAny = this.worldManager as any;
      const possibleRenderer = wmAny?.renderer ?? wmAny?.getRenderer?.() ?? (window as any).__salsaRenderer ?? (window as any).salsaRenderer ?? null;
      // If ShapeManager supports being constructed/returned with a renderer argument, prefer that.
      if (possibleRenderer) {
        this.shapeManager = (ShapeManager as any).getInstance?.(possibleRenderer) ?? ShapeManager.getInstance();
      } else {
        this.shapeManager = ShapeManager.getInstance();
      }
    } catch (e) {
      // Fallback to default singleton
      this.shapeManager = ShapeManager.getInstance();
    }

    // On reinit (shell→illustration nav) startWebGPURendering's overlay is bound to the
    // old destroyed canvas. Recreate it against the live canvas so ephemera renders.
    // Must run after shapeManager is assigned above.
    if (isReinit) this._setupEphemeraOverlay();

    this.authoringApi = new SceneAuthoringAPI(this.shapeManager);

    if (isDevMode()) {
      (window as any).salsa = this.authoringApi;
    }

    this.loadPolygonPresets();
    this.markLoaded('renderer');

    // Must run before any render frame — enables the preRenderCallback that syncs
    // the 2D illustration camera to the 3D orthographic projection each frame.
    (this.shapeManager as any).enableAutoSyncIllustrationCamera3D?.();
    this._updateGizmoPosition(0);

    const sceneAppliedOnce = this.shapeManager.interactionService.onSceneGraphChanged
      .subscribe(() => {
        this.ngZone.run(() => {
          this.markLoaded('sceneApplied');
          sceneAppliedOnce.unsubscribe();
          if (!this.isViewerMode && !this.illustration?.isCustomThumbnail) {
            this.saveThumbnail();
          }
        });
      });

    this._cityBuildSub?.unsubscribe();
    this._cityBuildSub = (this.shapeManager as any).world?.onCityBuildStateChange?.subscribe(
      ({ building, reason }: { building: boolean; reason: 'load' | 'edit' }) => {
        this.ngZone.run(() => {
          this.cityBuilding = building;
          this.cityBuildReason = reason;
        });
      }
    ) ?? null;

    this.selectionChangedSubscription = this.shapeManager.interactionService.onSelectionChanged.subscribe((selectedIds: string[]) => {
      this.ngZone.run(() => {
        if (this.selectedLayerIds.has(this.hoveredLayerId!)) {
          this.selectedLayerIds = new Set(selectedIds);
          const selectedId = this.selectedLayerIds.values().next().value;
          this.selectedNode = this.getNodeById(selectedId);
        } else {
          selectedIds = selectedIds.filter(id => id !== this.hoveredLayerId);
          this.selectedLayerIds = new Set(selectedIds);
          const selectedId = this.selectedLayerIds.values().next().value;
          this.selectedNode = this.getNodeById(selectedId);
        }

        if (selectedIds.length === 1) {
          const nodeColor = this.rgbaToHex(this.shapeManager.getNodeFillColor(selectedIds[0]));
          this.shapeColor = '#' + nodeColor;
          this.shapeHexInputDraft = nodeColor;

          // Sync balloon sidebar when an existing speech balloon is selected
          this._syncBalloonSidebar(selectedIds[0]);

          // Sync live text sidebar when an existing LiveTextNode is selected
          this._syncLiveTextSidebar(selectedIds[0]);
        }

        // 3D type-flag detection — covers viewport clicks (which don't go through scene3dSelectMesh).
        // Same id space as scene3dSelectMesh; isPackageNode resolves root/panel/pivot ids.
        // Loop rather than just [0] so multi-select finds whichever element is typed.
        const sm3d = this.shapeManager as any;
        let pkgFound = false, charFound = false;
        for (const sid of selectedIds) {
          if (!pkgFound) {
            const pkgId = sm3d.packaging?.isPackageNode?.(sid);
            if (pkgId) {
              this.scene3dSelectedIsPackage = true;
              this.pkgSelectedId = pkgId;
              pkgFound = true;
            }
          }
          if (!charFound && sm3d.isProceduralBody3D?.(sid)) {
            this.scene3dSelectedIsCharacter = true;
            charFound = true;
          }
          if (pkgFound && charFound) break;
        }
        if (!pkgFound) { this.scene3dSelectedIsPackage = false; this.pkgSelectedId = null; }
        if (!charFound) { this.scene3dSelectedIsCharacter = false; }

        // Particle emitter selection
        const firstId = selectedIds[0] ?? null;
        if (firstId && sm3d.getParticleEmitter3D?.(firstId)) {
          this.selectedParticleEmitterId = firstId;
        } else {
          this.selectedParticleEmitterId = null;
        }
      });
    });

    // Sync controlPanelActiveTool when the selection toolbar component changes the tool
    this.selectionToolSubscription = this.rasterSelectionService.tool$.subscribe((tool: string) => {
      if (this.controlPanelActiveTool.startsWith('select:')) {
        const newTool = `select:${tool}`;
        if (this.controlPanelActiveTool !== newTool) {
          this.controlPanelActiveTool = newTool;
          this.activeSelectionTool = tool as any;
          this.shapeManager.enableRasterSelection?.(tool as any);
          if (tool === 'magic-wand') this._syncMagicWandOptions();
        }
      }
    });

    this._sceneGraphChangedSub = this.shapeManager.interactionService.onSceneGraphChanged.subscribe(() => {
      this.ngZone.run(() => {
        if (this.scene3dWorldPanelOpen) return;
        if (this.controlPanelActiveTool.startsWith('drawing') || this.controlPanelActiveTool.startsWith('shape')) {
          this._addRecentColor(this.selectedPenColor);
        }
        if (!this._suppressLayerTreeRebuild) {
          // Use lightweight structure JSON when available — avoids re-serializing 3D mesh geometry
          const sm2 = this.shapeManager as any;
          const structJSON = sm2.getSceneStructureJSON?.() ?? this.shapeManager.getSceneGraphJSON();
          const parsed = JSON.parse(structJSON);
          this.layerTree = this.buildLayerTree(parsed.root);
          this.refreshRasterLayers();
          this.sceneChanged$.next('__scene_' + Date.now());
        }

        // Array panel: re-sync params when gizmo drags update an active array group
        if (this.scene3dIsArrayGroup && this.scene3dSelectedMeshId) {
          this._scene3dSyncArrayPanel(this.scene3dSelectedMeshId);
        }

        // Blend shapes: keep weights in sync when mesh is selected
        if (this.scene3dSelectedMeshId && !this.scene3dIsArrayGroup) {
          const freshShapes = (this.shapeManager as any).getBlendShapes3D?.(this.scene3dSelectedMeshId);
          if (freshShapes) this.scene3dBlendShapes = freshShapes;
        }

        // Array tool: sync count drift from scroll wheel; sync radial params if in radial mode
        if (this.scene3dArrayToolActive) {
          const liveCount = (this.shapeManager as any).getArrayToolCount?.();
          if (typeof liveCount === 'number') this.scene3dArrayToolCount = liveCount;
          if (this.scene3dArrayToolMode === 'radial') this._scene3dSyncRadialToolStrip();
        }

        // Decal tool: refresh Id set when ghost mode places a new decal
        if (this.scene3dDecalToolActive) {
          this.scene3dRefreshMeshes();
        }

        // Array tool: detect post-commit — ArrayToolController internally creates & selects an ArrayGroup3D
        if (this.scene3dArrayToolActive) {
          const sm = this.shapeManager as any;
          const selectedId: string | null = sm.getSelectedNode3D?.() ?? sm.getSelectedMeshId3D?.() ?? null;
          if (selectedId && sm.isArrayGroup3D?.(selectedId)) {
            this.scene3dArrayToolActive = false;
            sm.disableArrayTool?.();
            this.scene3dRefreshMeshes();
            this.scene3dSelectMesh(selectedId);
          }
        }

        // Sync camera node list whenever the scene graph changes
        this.scene3dRefreshCameraNodes();

        // Vector outliner: refresh when a shape is committed (e.g. freeform polygon)
        if (this.activeVectorLayerId) this.refreshVectorShapes();
      });
    });

    this._rasterLayersSub = this.rasterBrushService.layers$.subscribe(layers => {
      this.rasterLayers = Array.isArray(layers) ? layers : [];
      const selectedIsRaster = this.rasterLayers.some((layer: any) => layer.id === this.selectedRasterLayerId && layer.type === 'layer');
      if (!selectedIsRaster) {
        this.selectedRasterLayerId = this.rasterLayers.find((layer: any) => layer.type === 'layer')?.id ?? null;
      }
    });

    // Keep selectedRasterLayerId in sync with the raster-layers panel
    this._rasterActiveLayerSub = this.rasterBrushService.activeLayerId$.subscribe(id => {
      this.selectedRasterLayerId = id;
    });

    // Keep current animation frame in sync for menu helpers
    this._currentFrameSub = this.animationService.currentFrame$.subscribe(f => {
      this._currentAnimFrame = f;
    });

    // View state — drives camera mode bar + 2D panel visibility
    this._viewStateSub = (this.shapeManager as any).onViewStateChanged3D?.subscribe?.(() => {
      this.applyViewUI3D((this.shapeManager as any).getViewRules3D?.() ?? {});
    });
    this.applyViewUI3D((this.shapeManager as any).getViewRules3D?.() ?? {});
    this._playStateSub = (this.shapeManager as any).onPlayStateChanged3D?.subscribe?.(() => {
      this.scene3dViewIsPlaying = (this.shapeManager as any).isPlaying3D ?? false;
    });
    this._cameraCutsSub = (this.shapeManager as any).onCameraCutsChanged3D?.subscribe?.(() => {
      this.ngZone.run(() => this.scene3dRefreshCuts());
    });
    this._uiEventOff = (this.shapeManager as any).onUIEvent?.((e: any) => {
      this.ngZone.run(() => this._handleUIEvent(e));
    }) ?? null;
    this._uiSelectionOff = (this.shapeManager as any).onShapeSelectionChanged?.((ids: string[]) => {
      this.ngZone.run(() => {
        this.uiSelectedShapeId = ids[0] ?? null;
        if (this.activeVectorLayerId) this.refreshVectorShapes();
      });
    }) ?? null;
    this._pathEditedOff = (this.shapeManager as any).onPathEdited?.((path: any) => {
      this.ngZone.run(() => { this.isPathEditActive = path != null; });
    }) ?? null;

    // Subscribe to raster stroke end to trigger auto-save (raster drawing bypasses scene graph events)
    try {
      const rasterSub = (this.shapeManager as any).onRasterStrokeEnd?.(async () => {
        if (!this.illustration) return;
        // Mark the painted layer dirty so uploadPixelData re-uploads only it
        if (this.selectedRasterLayerId) {
          this._dirtyLayerIds.add(this.selectedRasterLayerId);
        }
        this._addRecentColor(this.rasterBrushColor);
        // Notify OPFS auto-save service of stroke end
        this.autoSaveService.notifyStrokeEnd();
        if (this.scene3dPkgCreatorOpen) {
          (this.shapeManager as any).syncLiveTextures3D?.();
        }
        try {
          const enrichedJson = (this.shapeManager as any).getSceneGraphJSONWithRasterData
            ? await (this.shapeManager as any).getSceneGraphJSONWithRasterData('image/webp')
            : this.shapeManager.getSceneGraphJSON();
          this.sceneChanged$.next(enrichedJson);
        } catch (e) {
          console.warn('Failed to trigger raster auto-save', e);
        }
      });
      if (rasterSub) this.rasterStrokeSubscription = rasterSub;
    } catch (e) {
      console.warn('Failed to subscribe to raster stroke end', e);
    }

    this.onDotColorSelected('#191919');
    this.onBgColorSelected('#191919');

    this.shapeManager.setIllustrationMode(true);

    // Apply document size from query params (set by the New Illustration dialog).
    // For brand-new illustrations there is no saved state yet, so query params are
    // the only source. For existing illustrations, loadIllustrationV2 will call
    // _applyDocumentSize again with the persisted value — that's fine, it's idempotent.
    const qp = this.route.snapshot.queryParamMap;
    const docW = Number(qp.get('docW'));
    const docH = Number(qp.get('docH'));
    this._setupArtboardOverlay();
    if (docW > 0 && docH > 0) {
      this._applyDocumentSize({ w: docW, h: docH });
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
      this.shapeManager.enableRasterDrawing?.();
      this.shapeManager.disableRasterTool?.();
      this.shapeManager.setRasterBrushSize?.(this.rasterBrushSize);
      this.shapeManager.setRasterBrushColor?.(this.rasterBrushColor);
      this.showRasterControls = true;
      // initial raster layers load
      this.refreshRasterLayers();
      // Sync persistent color picker to current pen color
      this._syncPersistentPickerFromHex(this.selectedPenColor);
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
        const layers = this.shapeManager?.getRasterLayers?.() ?? [];
        this.rasterLayers = Array.isArray(layers) ? layers : [];
        // Only keep paintable raster layers selected.
        const stillExists = this.rasterLayers.some((l: any) => l.id === this.selectedRasterLayerId && l.type === 'layer');
        if (!stillExists) {
          this.selectedRasterLayerId = this.rasterLayers.find((l: any) => l.type === 'layer')?.id ?? null;
        }
        // Push to the raster-layers panel component (subscribes to rasterBrushService.layers$)
        this.rasterBrushService.refreshLayers();
        // Keep animation timeline layer list in sync
        this.animationService.refreshTimeline();
      } catch (e) {
        console.warn('Failed to load raster layers from ShapeManager', e);
        this.rasterLayers = [];
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
      this.shapeManager?.selectRasterLayer?.(layerId);
      this.selectedRasterLayerId = layerId;
    } catch (e) {
      console.warn('Failed to select raster layer on ShapeManager', e);
    }
  }

  handleBgColorPickerClick(event: MouseEvent) {
    const picker = document.querySelector('app-color-picker');
    const square = document.querySelector('.left-panel-bg-square');
    if (this.showBgColorPicker && picker && !picker.contains(event.target as Node) && square && !square.contains(event.target as Node)) {
      this.showBgColorPicker = false;
    }
  }

  handleHotkeys(event: KeyboardEvent) {
    if (this.scene3dViewIsPlaying) return; // game loop owns the keyboard during Play Mode
    const target = event.target as HTMLElement;
    const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Escape must reach Frogmarks even during LiveText editing so we can
    // update our own state. Salsa's overlay textarea also handles Escape
    // internally, but we need to sync liveTextIsEditing.
    if (event.key === 'Escape' && this.liveTextIsEditing) {
      this.endLiveTextEditing();
      event.preventDefault();
      return;
    }

    if (isEditable || this.shapeManager.isInputActive?.()) return;

    const label = this._formatKeyForScreencast(event);
    if (label) this._pushScreenscastKey(label);

    const isMac = navigator.userAgent.includes('Mac');
    const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

    // Global undo/redo routing by active context.
    if (ctrlKey && (event.key === 'z' || event.key === 'Z')) {
      // 2D object stack takes priority — engine already consumed via stopImmediatePropagation
      const sm2d = this.shapeManager as any;
      if (!event.shiftKey && sm2d.canUndo2DShapes) { event.preventDefault(); return; }
      if (event.shiftKey && sm2d.canRedo2DShapes) { event.preventDefault(); return; }
      // Ctrl+Z or Cmd+Z -> undo; if Shift pressed, do redo.
      if (this.is3DContextActive) {
        if (event.shiftKey) {
          this.scene3dRedo();
        } else {
          this.scene3dUndo();
        }
      } else {
        if (event.shiftKey) {
          this.rasterRedo();
        } else {
          this.rasterUndo();
        }
      }
      event.preventDefault();
      return;
    }

    if (ctrlKey && (event.key === 'y' || event.key === 'Y')) {
      // 2D object stack takes priority
      const sm2d = this.shapeManager as any;
      if (sm2d.canRedo2DShapes) { event.preventDefault(); return; }
      // Ctrl+Y or Cmd+Y -> redo
      if (this.is3DContextActive) {
        this.scene3dRedo();
      } else {
        this.rasterRedo();
      }
      event.preventDefault();
      return;
    }

    // Ctrl+0 — fit artboard to view
    if (ctrlKey && event.key === '0') {
      this.fitArtboard(); event.preventDefault(); return;
    }
    // Ctrl+S — save now
    if (ctrlKey && (event.key === 's' || event.key === 'S') && !event.shiftKey) {
      this.saveNow(); event.preventDefault(); return;
    }
    // Ctrl+Shift+H — flip horizontal
    if (ctrlKey && event.shiftKey && (event.key === 'h' || event.key === 'H')) {
      this.rasterFlipHorizontal(); event.preventDefault(); return;
    }
    // Ctrl+Shift+V — flip vertical (only with shift so plain Ctrl+V still pastes)
    if (ctrlKey && event.shiftKey && (event.key === 'v' || event.key === 'V')) {
      this.rasterFlipVertical(); event.preventDefault(); return;
    }
    // Ctrl+Shift+E — export .frog file
    if (ctrlKey && event.shiftKey && (event.key === 'e' || event.key === 'E')) {
      this.exportFrogFile(); event.preventDefault(); return;
    }
    // Ctrl+Shift+O — open/import .frog file
    if (ctrlKey && event.shiftKey && (event.key === 'o' || event.key === 'O')) {
      this.importFrogFile(); event.preventDefault(); return;
    }
    // Ctrl+\ — toggle bleed guides
    if (ctrlKey && event.key === '\\') {
      this.onPanelShowBleedGuidesChange(!this.panelShowBleedGuides); event.preventDefault(); return;
    }
    // Ctrl+; — toggle gutter guides
    if (ctrlKey && event.key === ';') {
      this.onPanelShowGutterGuidesChange(!this.panelShowGutterGuides); event.preventDefault(); return;
    }

    // Selection shortcuts (Ctrl combos)
    if (ctrlKey && (event.key === 'a' || event.key === 'A') && !event.shiftKey) {
      this.rasterSelectionService.selectAll(); event.preventDefault(); return;
    }
    if (ctrlKey && (event.key === 'd' || event.key === 'D') && !event.shiftKey) {
      if (this.scene3dPanelVisible && this.scene3dSelectedMeshId) {
        this.scene3dDuplicateMesh(this.scene3dSelectedMeshId);
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        this.rasterSelectionService.deselectAll();
        event.preventDefault();
      }
      return;
    }
    if (ctrlKey && event.shiftKey && (event.key === 'i' || event.key === 'I')) {
      this.rasterSelectionService.invertSelection(); event.preventDefault(); return;
    }
    if (ctrlKey && (event.key === 'x' || event.key === 'X') && !event.shiftKey) {
      this.rasterSelectionService.cut(); event.preventDefault(); return;
    }
    if (ctrlKey && (event.key === 'c' || event.key === 'C') && !event.shiftKey) {
      this.rasterSelectionService.copy(); event.preventDefault(); return;
    }
    if (ctrlKey && (event.key === 'v' || event.key === 'V') && !event.shiftKey) {
      this.rasterSelectionService.paste(); event.preventDefault(); return;
    }
    if (ctrlKey && (event.key === 't' || event.key === 'T') && !event.shiftKey) {
      if (this.rasterSelectionService.info.hasSelection) {
        this.rasterSelectionService.beginTransform(); event.preventDefault(); return;
      }
    }
    if (event.key === 'Enter' && this.rasterSelectionService.info.isTransforming) {
      this.rasterSelectionService.commitTransform(); event.preventDefault(); return;
    }

    // Alt+Backspace -> fill selection with foreground color
    if (this._handleFillShortcut(event)) return;

    switch (event.key) {
      case 'Escape':
        if (this.scene3dDecalToolActive) {
          this.scene3dDecalToolActive = false;
          (this.shapeManager as any).exitDecalPlaceMode3D?.();
          break;
        }
        if (this.scene3dIsEditingMesh && this.scene3dEditTool === 'knife') {
          this.scene3dEditTool = 'select';
          this._knifeStart = null;
          this._clearKnifePreview();
          break;
        }
        if (this.rasterSelectionService.info.isTransforming) {
          this.rasterSelectionService.cancelTransform(); break;
        }
        this.selectCursor('cursor'); break;
      case 'v': this.selectCursor('cursor'); break;
      case 'h': this.selectCursor('panhand'); break;
      case 'l': this.setActiveTool('arrow'); break;
      case 't': this.setActiveTool('raster:text'); break;
      case 'T': if (event.shiftKey) this.setActiveTool('balloon'); break;
      case 'Y': if (event.shiftKey) this.setActiveTool('live-text'); break;
      case 'p': this.setActiveTool('drawing:pen'); break;
      case 'e': this.setActiveTool('drawing:eraser'); break;
      case 'i': this.setActiveTool('drawing:highlighter'); break;
      case 's': this.setActiveTool('section'); break;
      case '+':
      case '=': this.zoomIn(); break;
      case '-':
      case '_': this.zoomOut(); break;
  case 'Delete':
  case 'Backspace':
        if (this.rasterSelectionService.info.hasSelection) {
          this.rasterSelectionService.deleteSelection();
        } else {
          // Clean up local layer-tree state for any selected nodes
          this.layerTree!.children = this.pruneDeletedLayers(this.layerTree!.children, this.selectedLayerIds);
          this.selectedLayerIds.forEach(id => {
            this.layerDitherConfigs.delete(id);
            this.layerFrameLinkConfigs.delete(id);
          });
          // deleteSelectedShapes() removed — engine owns the Delete key for 2D canvas shapes
        }
        break;
      case 'f': this.toggleFullscreen(); break;
      case 'x': this.toggleUI(); break;
      case 'M': if (event.shiftKey) { this.setActiveTool('select:rect'); break; } this.setActiveTool('stamp'); break;
      case 'm': this.setActiveTool('stamp'); break;
      case 'O': if (event.shiftKey) { this.setActiveTool('select:ellipse'); break; } break;
      case 'L': if (event.shiftKey) { this.setActiveTool('select:lasso'); break; } break;
      case 'b': this.setActiveTool('raster:brush'); break;
      case 'B': if (event.shiftKey) { this.setActiveTool('raster:airbrush'); } else { this.setActiveTool('raster:brush'); } break;
      case 'E': if (event.shiftKey) { this.setActiveTool('raster:eraser'); } break;
      case 'g': this.setActiveTool('fill'); break;
      case 'G': if (event.shiftKey) { this.setActiveTool('panel-layout'); } else { this.setActiveTool('fill'); } break;
      case 'w': this.setActiveTool('select:magic-wand'); break;
      case 'W': if (event.shiftKey) { this.setActiveTool('select:magic-wand'); } else { this.setActiveTool('select:magic-wand'); } break;
      case 'q': this.setActiveTool('raster:move'); break;
      case '5':
        if (this.scene3dPanelVisible) {
          this.scene3dSetIllustrationProjection(
            this.scene3dIllustrationProjection === 'orthographic' ? 'perspective' : 'orthographic'
          );
          event.preventDefault();
          break;
        }
        return;
      case 'k':
      case 'K':
        if (this.scene3dPanelVisible && this.scene3dIsEditingMesh) {
          this.scene3dEditTool = this.scene3dEditTool === 'knife' ? 'select' : 'knife';
          if (this.scene3dEditTool === 'select') this._clearKnifePreview();
          break;
        }
        if (this.scene3dPanelVisible) {
          this.scene3dRecordKeyframe();
          break;
        }
        return;
      case 'Tab':
        if (this.scene3dPanelVisible) {
          if (event.shiftKey) {
            if (this.scene3dArmaturePanelOpen) {
              this.closeArmaturePanel();
            } else {
              this.openArmaturePanel();
            }
            break;
          }
          if (this.scene3dSelectedMeshId) {
            if (this.scene3dIsEditingMesh) {
              this.exitMeshEditMode();
            } else {
              this.enterMeshEditMode();
            }
            break;
          }
        }
        return;
      default: return;
    }
    event.preventDefault();
  }

  /** Alt+Backspace fill selection with foreground color */
  private _handleFillShortcut(event: KeyboardEvent): boolean {
    if (event.altKey && event.key === 'Backspace') {
      const color = this.selectedPenColor;
      this.animationService.fillSelection(color);
      event.preventDefault();
      return true;
    }
    return false;
  }

  private pruneDeletedLayers(nodes: LayerTreeNode[], selectedIds: Set<string>): LayerTreeNode[] {
    return nodes
      .map(node => ({ ...node, children: this.pruneDeletedLayers(node.children ?? [], selectedIds) }))
      .filter(node => !selectedIds.has(node.id));
  }

  // SDF setters
  setSDFTextColor(color: string) { this.selectedSDFTextColor = color; this.shapeManager.setSDFTextColor(color); }
  setSDFTextOutlineColor(color: string) { this.selectedSDFTextOutlineColor = color; this.shapeManager.setSDFTextOutlineColor(color); }
  setSDFTextFontSize(size: number) { this.selectedSDFTextFontSize = size; this.shapeManager.setSDFTextFontSize(size); }
  setSDFTextFont(font: string) { this.selectedSDFTextFont = font; this.shapeManager.setSDFTextFont(font); }
  setSDFTextThreshold(threshold: number) { this.selectedSDFTextThreshold = threshold; this.shapeManager.setSDFTextThreshold(threshold); }
  setSDFTextSmoothing(smoothing: number) { this.selectedSDFTextSmoothing = smoothing; this.shapeManager.setSDFTextSmoothing(smoothing); }
  setSDFTextOutlineWidth(width: number) { this.selectedSDFTextOutlineWidth = width; this.shapeManager.setSDFTextOutlineWidth(width); }

  openSDFTextColorPicker() {
    this.showSDFTextColorPicker = !this.showSDFTextColorPicker;
    if (this.showSDFTextColorPicker) this.showSDFTextOutlineColorPicker = false;
  }
  openSDFTextOutlineColorPicker() {
    this.showSDFTextOutlineColorPicker = !this.showSDFTextOutlineColorPicker;
    if (this.showSDFTextOutlineColorPicker) this.showSDFTextColorPicker = false;
  }
  onSDFTextColorSelected(color: string) { this.setSDFTextColor(color); this.showSDFTextColorPicker = false; }
  onSDFTextOutlineColorSelected(color: string) { this.setSDFTextOutlineColor(color); this.showSDFTextOutlineColorPicker = false; }

  sdfTextFonts: string[] = ['Arial','Helvetica','Times New Roman','Courier New','Verdana','Georgia','Palatino','Garamond','Bookman','Comic Sans MS','Trebuchet MS','Arial Black','Impact'];
  sdfTextFontSizes: number[] = [8,10,12,14,16,18,20,24,28,32,36,48,64,72];

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

  setStrokeWidth(w: number) { this.strokeWidth = w; this.shapeManager.setRasterBrushSize(w); }
  setPenColor(c: string) {
    this.showPenColorPicker = false;
    this.selectedPenColor = c;

    // update raster brush for illustrations
    this.rasterBrushColor = c;
    this.shapeManager.setRasterBrushColor(c);

    // sync persistent picker state
    this._syncPersistentPickerFromHex(c);
  }

  swapColors(): void {
    const prev = this.selectedPenColor;
    this.setPenColor(this.secondaryPenColor);
    this.secondaryPenColor = prev;
  }

  resetToDefaultColors(): void {
    this.secondaryPenColor = '#ffffff';
    this.setPenColor('#000000');
  }
  onColorPickerSelection(c: string) { this.selectedPenColor = c; this.shapeManager.setStrokeColor(c); this._syncPersistentPickerFromHex(c); }

  // ── Persistent (always-visible) color picker ──────────────────
  persistentHue = 0;
  persistentSbX = 100;
  persistentSbY = 0;
  persistentOpacity = 100;
  private _hueSelecting = false;
  private _sbSelecting = false;

  /** Sync internal HSB state from a hex color */
  private _syncPersistentPickerFromHex(hex: string): void {
    const hsl = this._hexToHSL(hex);
    this.persistentHue = hsl.h;
    this.persistentSbX = hsl.s;
    this.persistentSbY = this._lightnessToSbY(hsl.l, hsl.s);
  }

  /** Emit updated color from current HSB state */
  private _persistentPickerEmit(): void {
    const l = this._sbYToLightness(this.persistentSbY, this.persistentSbX);
    const hex = this._hslToHex(this.persistentHue, this.persistentSbX, l);
    this.selectedPenColor = hex;
    this.rasterBrushColor = hex;
    this.shapeManager?.setRasterBrushColor?.(hex);
    this.shapeManager?.setStrokeColor?.(hex);
  }

  onHueRingMouseDown(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this._hueSelecting = true;
    this._updateHueFromEvent(e);
    const moveHandler = (ev: MouseEvent) => { if (this._hueSelecting) this._updateHueFromEvent(ev); };
    const upHandler = () => { this._hueSelecting = false; document.removeEventListener('mousemove', moveHandler); document.removeEventListener('mouseup', upHandler); };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  private _updateHueFromEvent(e: MouseEvent): void {
    const ring = (e.target as HTMLElement).closest('.hue-ring') as HTMLElement;
    if (!ring) return;
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
    this.persistentHue = ((angle % 360) + 360) % 360;
    this._persistentPickerEmit();
  }

  onSbSquareMouseDown(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this._sbSelecting = true;
    this._updateSbFromEvent(e);
    const moveHandler = (ev: MouseEvent) => { if (this._sbSelecting) this._updateSbFromEvent(ev); };
    const upHandler = () => { this._sbSelecting = false; document.removeEventListener('mousemove', moveHandler); document.removeEventListener('mouseup', upHandler); };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  private _updateSbFromEvent(e: MouseEvent): void {
    const sq = document.querySelector('.sb-square') as HTMLElement;
    if (!sq) return;
    const rect = sq.getBoundingClientRect();
    this.persistentSbX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    this.persistentSbY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    this._persistentPickerEmit();
  }

  onPersistentHexInput(hex: string): void {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      this._syncPersistentPickerFromHex(hex);
      this.selectedPenColor = hex;
      this.rasterBrushColor = hex;
      this.shapeManager?.setRasterBrushColor?.(hex);
      this.shapeManager?.setStrokeColor?.(hex);
    }
  }

  onPersistentOpacityChange(event: Event): void {
    const val = Math.min(100, Math.max(0, +(event.target as HTMLInputElement).value));
    this.persistentOpacity = val;
    this.rasterBrushService.updateOpacity(val / 100);
  }

  // Color conversion helpers for persistent picker
  private _hexToHSL(hex: string): { h: number; s: number; l: number } {
    let r = parseInt(hex.substring(1, 3), 16) / 255;
    let g = parseInt(hex.substring(3, 5), 16) / 255;
    let b = parseInt(hex.substring(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  private _hslToHex(h: number, s: number, l: number): string {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return '#' + [r + m, g + m, b + m].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  private _lightnessToSbY(l: number, s: number): number {
    const Lleft = l / (1 - s / 200);
    return 100 - Lleft;
  }

  private _sbYToLightness(sbY: number, s: number): number {
    const Lleft = 100 - sbY;
    return Lleft * (1 - s / 200);
  }
  setShapeColor(c: string) { this.selectedShapeColor = c; this.shapeManager.setShapeColor(c); }
  setTextColor(c: string) { this.selectedTextColor = c; this.shapeManager.setTextColor(c); }
  setHighlightColor(c: string) { this.selectedHighlightColor = c; const mapped = this.highlightColorMapping.get(c) ?? c; this.shapeManager.setHighlightColor(mapped); }
  setPattern(p: string) { this.selectedPattern = p; this.shapeManager.setPattern(this.selectedPattern); }

  // --- Raster drawing support (wiring to ShapeManager raster APIs) ---
  showRasterControls = false;
  // Raster is the default drawing path for illustrations
  rasterEnabled = true;
  rasterBrushSize = 16; // px (UI-friendly)
  rasterBrushColor = '#74fc88';
  activeRasterTool: 'brush' | 'airbrush' | 'eraser' = 'brush';
  activeSelectionTool: SelectionTool = 'rect';
  showBrushCursor = false;
  brushCursorX = 0;
  brushCursorY = 0;

  toggleRasterTool(event?: MouseEvent) {
    // Toggle control-panel UI for raster options; raster drawing remains enabled by default
    this.controlPanelActiveTool = this.controlPanelActiveTool === 'drawing:raster' ? '' : 'drawing:raster';
    this.showRasterControls = !this.showRasterControls;
    // Ensure raster tool is enabled when toggling controls (no-op if already active)
    try {
      this.shapeManager?.enableRasterTool?.();
      this.shapeManager?.setRasterBrushSize?.(this.rasterBrushSize);
      this.shapeManager?.setRasterBrushColor?.(this.rasterBrushColor);
    } catch (e) {
      console.warn('Failed to enable raster tool on toggle', e);
    }
  }

  setRasterBrushSize(size: number) {
    this.rasterBrushSize = size;
    this.shapeManager?.setRasterBrushSize?.(size);
  }

  setRasterBrushColor(color: string) {
    this.rasterBrushColor = color;
    this.shapeManager?.setRasterBrushColor?.(color);
  }

  async rasterUndo() {
    try {
      const ok = await this.shapeManager?.rasterUndo?.();
      if (!ok) this.notifyService.error('Raster undo returned false');
    } catch (e) {
      this.notifyService.error('Raster undo failed');
      console.error(e);
    }
  }

  async rasterRedo() {
    try {
      const ok = await this.shapeManager?.rasterRedo?.();
      if (!ok) this.notifyService.error('Raster redo returned false');
    } catch (e) {
      this.notifyService.error('Raster redo failed');
      console.error(e);
    }
  }

  pushRasterSnapshot() {
    try {
      this.shapeManager?.rasterPushSnapshot?.();
      this.notifyService.success('Raster snapshot pushed');
    } catch (e) {
      this.notifyService.error('Failed to push raster snapshot');
      console.error(e);
    }
  }

  private isSubpanelTool(tool: string): boolean {
    return tool.startsWith('drawing') || tool.startsWith('shape') ||
      tool.startsWith('select') || tool.startsWith('polygon') ||
      tool === 'fill' || tool === 'stamp' || tool === 'arrow' ||
      tool === 'raster:text' || tool === 'balloon' || tool === 'live-text' ||
      tool === 'panel-layout' || tool === 'misc';
  }

  private ditherRevealSubpanel(): void {
    if (!document.body.classList.contains('theme-retro-chrome')) return;
    // Find panel without requiring .visible — called synchronously before Angular renders
    // the class change, so the canvas lands on body before the panel snaps into view.
    const panel = document.querySelector('.tool-subpanel') as HTMLElement;
    if (!panel) return;

    const cs = getComputedStyle(panel);
    const left = parseFloat(cs.left) || 70;
    const top  = (parseFloat(cs.top) || 0) + (parseFloat(cs.marginTop) || 0);
    const cellSize = 8;
    // offsetWidth is layout-based (not affected by translateX transform)
    const w = panel.offsetWidth || 250;
    // Use max-height value: calc(100vh - 242px)
    const h = window.innerHeight - 242;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    Object.assign(canvas.style, {
      position: 'fixed',
      top:  top  + 'px',
      left: left + 'px',
      width:  w + 'px',
      height: h + 'px',
      pointerEvents: 'none',
      zIndex: '10001',
    });

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    document.body.appendChild(canvas);

    const cols = Math.ceil(w / cellSize);
    const rows = Math.ceil(h / cellSize);
    const total = cols * rows;
    const cells = Array.from({length: total}, (_, i) => i);
    for (let i = total - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    const duration = 300;
    let revealed = 0;
    const startTime = performance.now();
    // r slightly > half-diagonal of cell to overlap corners and avoid seam flashes
    const r = cellSize * 0.78;

    const frame = (now: number) => {
      if (!canvas.isConnected) return;
      const elapsed = now - startTime;
      const targetRevealed = Math.min(total, Math.floor(total * (elapsed / duration)));

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      while (revealed < targetRevealed) {
        const cell = cells[revealed];
        const col = cell % cols;
        const row = Math.floor(cell / cols);
        const cx = (col + 0.5) * cellSize;
        const cy = (row + 0.5) * cellSize;
        ctx.beginPath();
        ctx.moveTo(cx,     cy - r);
        ctx.lineTo(cx + r, cy    );
        ctx.lineTo(cx,     cy + r);
        ctx.lineTo(cx - r, cy    );
        ctx.closePath();
        ctx.fill();
        revealed++;
      }
      ctx.restore();

      if (revealed < total) {
        requestAnimationFrame(frame);
      } else {
        // Fade out instead of hard-remove to dissolve any inter-diamond seam pixels
        canvas.style.transition = 'opacity 80ms linear';
        canvas.style.opacity = '0';
        setTimeout(() => canvas.remove(), 100);
      }
    };

    requestAnimationFrame(frame);
  }

  setActiveTool(activeTool: string, event?: MouseEvent) {
    if (activeTool && activeTool === this.controlPanelActiveTool) activeTool = '';
    if (activeTool) this.showEphemeraPanel = false;
    const prevTool = this.controlPanelActiveTool;
    if (activeTool !== this.controlPanelActiveTool) {
      this.controlPanelActiveTool = activeTool;
      if (this.controlPanelActiveTool) {
        this.cursorSelected = false; this.panHandSelected = false; this.shapeManager.disablePanningTool();
      }
    }

    // tools
    this.controlPanelActiveTool === 'arrow' ? this.shapeManager.enableLineDrawing() : this.shapeManager.disableLineDrawing();
    this.controlPanelActiveTool === 'text' ? this.shapeManager.enableTextDrawing() : this.shapeManager.disableTextDrawing();
    // Pen -> enable raster tool (tool-only) for illustrations; otherwise disable raster tool
    if (this.controlPanelActiveTool === 'drawing:pen') {
      this.setRasterBrushColor(this.selectedPenColor); // Sync colors
      this.shapeManager.enableRasterTool();
    }
    // Use raster eraser for illustrations (renderer already raster). Fall back to raster eraser API.
    else if (this.controlPanelActiveTool === 'drawing:eraser') {
      this.shapeManager.enableRasterClearEraserTool?.();
    }
    else {
      this.shapeManager.disableRasterTool?.();
    }

    this.controlPanelActiveTool === 'drawing:highlighter' ? this.shapeManager.enableHighlightDrawing() : this.shapeManager.disableHighlightDrawing();
    
    this.controlPanelActiveTool === 'drawing:pattern' ? this.shapeManager.enablePatternDrawing() : this.shapeManager.disablePatternDrawing();
    this.controlPanelActiveTool === 'section' ? this.shapeManager.enableSectionDrawing() : this.shapeManager.disableSectionDrawing();
    // sdftext removed from Illustration — vector only, lives in Board
    this.controlPanelActiveTool === 'stamp' ? this.shapeManager.enableStampDrawing() : this.shapeManager.disableStampDrawing();

    // ── Raster text tool ──
    if (this.controlPanelActiveTool === 'raster:text') {
      this._enableRasterText();
    } else {
      this._disableRasterText();
    }

    // ── Arrow tool (line with default arrowheads) ──
    if (this.controlPanelActiveTool === 'arrow') {
      this.shapeManager.setDefaultArrowheads?.(this.arrowheadStart, this.arrowheadEnd);
      this.shapeManager.enableLineDrawing();
    }

    // ── Raster brush / airbrush / eraser (new structured tools) ──
    if (this.controlPanelActiveTool === 'raster:brush') {
      this.activeRasterTool = 'brush';
      this.showBrushCursor = true;
      this.rasterBrushService.enableBrushTool();
      this.rasterBrushService.setColor(this.rasterBrushColor);
      this.rasterBrushService.setSize(this.rasterBrushSize);
    } else if (this.controlPanelActiveTool === 'raster:airbrush') {
      this.activeRasterTool = 'airbrush';
      this.showBrushCursor = true;
      this.rasterBrushService.enableBrushTool();
      this.rasterBrushService.setColor(this.rasterBrushColor);
      this.rasterBrushService.setSize(this.rasterBrushSize);
    } else if (this.controlPanelActiveTool === 'raster:eraser') {
      this.activeRasterTool = 'eraser';
      this.showBrushCursor = true;
      this.rasterBrushService.enableEraserTool('fade');
      this.rasterBrushService.setSize(this.rasterBrushSize);
    } else if (this.controlPanelActiveTool === 'drawing:pen' || this.controlPanelActiveTool === 'drawing:eraser') {
      // drawing:pen and drawing:eraser already manage raster state above — just hide cursor
      this.showBrushCursor = false;
    } else {
      this.showBrushCursor = false;
      this.rasterBrushService.disableRasterTool();
    }

    // ── Raster move / grab tool ──
    if (this.controlPanelActiveTool === 'raster:move') {
      (this.shapeManager as any).enableRasterMove?.();
      if (this.canvas) this.canvas.style.cursor = 'grab';
    } else {
      (this.shapeManager as any).disableRasterMove?.();
      // Reset cursor when leaving move tool (other tools set their own)
      if (this.canvas && this.canvas.style.cursor === 'grab') {
        this.canvas.style.cursor = '';
      }
    }

    // ── Selection tools ──
    if (this.controlPanelActiveTool.startsWith('select:')) {
      const tool = this.controlPanelActiveTool.replace('select:', '') as SelectionTool;
      this.activeSelectionTool = tool;
      // Activate engine-side selection (creates service, starts pointer capture, renders overlays)
      this.shapeManager.enableRasterSelection?.(tool);
      this.rasterSelectionService.enable();
      this.rasterSelectionService.setTool(tool);
      // Sync magic wand options when switching to wand
      if (tool === 'magic-wand') {
        this._syncMagicWandOptions();
      }
    } else {
      // Deactivate engine-side selection and switch back to drawing
      this.shapeManager.disableRasterSelection?.();
      this.rasterSelectionService.disable();
    }

    // shapes
    if (this.controlPanelActiveTool.startsWith('shape')) {
      this.shapeManager.setShapeColor(this.selectedPenColor);
    }
    if (this.controlPanelActiveTool === 'shape:square') this.setPreviewShapeSelected(ShapeType.Rectangle, event!);
    else if (this.controlPanelActiveTool === 'shape:circle') this.setPreviewShapeSelected(ShapeType.Circle, event!);
    else if (this.controlPanelActiveTool === 'shape:triangle') this.setPreviewShapeSelected(ShapeType.Triangle, event!);
    else if (this.controlPanelActiveTool === 'shape:polygon') {
      (this.shapeManager as any).defaultPolygonSides = this.defaultPolygonSides;
      this.setPreviewShapeSelected(ShapeType.Polygon, event!);
    }
    else this.setPreviewShapeSelected(null, event!);

    // Freeform polygon drawing
    if (this.controlPanelActiveTool === 'polygon:freeform') {
      this.shapeManager.setShapeColor(this.selectedPenColor);
      this.shapeManager.enablePolygonDrawing?.();
    } else {
      this.shapeManager.disablePolygonDrawing?.();
    }

    // ── Flood fill tool ──
    if (this.controlPanelActiveTool === 'fill') {
      (this.shapeManager as any).enableFloodFillTool?.();
    } else {
      (this.shapeManager as any).disableFloodFillTool?.();
    }

    // ── Speech Balloon tool ──
    if (this.controlPanelActiveTool === 'balloon') {
      (this.shapeManager as any).enableSpeechBalloonTool?.();
    } else {
      (this.shapeManager as any).disableSpeechBalloonTool?.();
    }

    // ── Live Text tool ──
    if (this.controlPanelActiveTool === 'live-text') {
      this.hasHtmlInCanvas = !!(this.shapeManager as any).isHtmlInCanvasAvailable?.();
      (this.shapeManager as any).setRectDrawCallback?.((rect: any, clientX: number, clientY: number) => {
        const sm = this.shapeManager as any;
        if (this.liveTextIsEditing) {
          this.endLiveTextEditing();
          return;
        }
        const DRAG_MIN = 0.02;
        const isClick = rect.w < DRAG_MIN && rect.h < DRAG_MIN;
        if (isClick) {
          const selectedIds = this._getSelectedShapeIds();
          const hitNodeId = selectedIds.length === 1 ? selectedIds[0] : null;
          const hitNode = hitNodeId ? sm.getLiveTextNode?.(hitNodeId) : null;
          if (hitNode) {
            this.liveTextNodeId = hitNodeId;
            this._syncLiveTextSidebar(hitNodeId!);
            sm.enterLiveTextEditingAt?.(hitNodeId, clientX, clientY);
            this.liveTextIsEditing = true;
            return;
          }
        }
        const node = isClick
          ? sm.createLiveText?.(rect.x + rect.w / 2, rect.y + rect.h / 2, this._buildLiveTextOptions())
          : sm.createLiveTextInRect?.(rect, this._buildLiveTextOptions());
        if (node) {
          this.liveTextNodeId = node.id ?? node.getId?.();
          sm.enterLiveTextEditingAt?.(this.liveTextNodeId, clientX, clientY);
          this.liveTextIsEditing = true;
        }
      });
    } else {
      (this.shapeManager as any).setRectDrawCallback?.(null);
      if (this.liveTextIsEditing) this.endLiveTextEditing();
    }

    // ── Panel Layout tool ──
    if (this.controlPanelActiveTool === 'panel-layout') {
      (this.shapeManager as any).enablePanelLayoutTool?.();
    } else {
      (this.shapeManager as any).disablePanelLayoutTool?.();
    }

    // Diamond dither reveal when subpanel transitions from hidden to visible
    const subpanelBecameVisible =
      !this.scene3dPanelVisible &&
      !this.isSubpanelTool(prevTool) &&
      this.isSubpanelTool(this.controlPanelActiveTool);
    if (subpanelBecameVisible) {
      this.ditherRevealSubpanel();
    }
  }

  // ── Flood Fill ─────────────────────────────────────────────

  onFillToleranceChange(v: number): void { this.fillTolerance = Math.round(v); }
  onFillGapClosingChange(v: number): void { this.fillGapClosing = Math.round(v); }
  onFillContiguousChange(v: boolean): void { this.fillContiguous = v; }
  onFillReferenceLayerChange(id: string): void { this.fillReferenceLayerId = id; }

  async onCanvasClickForFill(event: MouseEvent): Promise<void> {
    if (this.controlPanelActiveTool !== 'fill') return;
    // Convert screen coords → world coords via Salsa's interaction service
    const worldPos = (this.shapeManager as any).interactionService?.toWorldCoords?.(event);
    if (!worldPos) return;
    const color = this.selectedPenColor;
    await (this.shapeManager as any).floodFillWorld?.(worldPos.x, worldPos.y, color, {
      tolerance: this.fillTolerance,
      gapClosing: this.fillGapClosing,
      contiguous: this.fillContiguous,
      referenceLayerId: this.fillReferenceLayerId || undefined,
    });
  }

  // ── Magic Wand ─────────────────────────────────────────────

  onWandToleranceChange(v: number): void {
    this.wandTolerance = Math.round(v);
    this._syncMagicWandOptions();
  }
  onWandContiguousChange(v: boolean): void {
    this.wandContiguous = v;
    this._syncMagicWandOptions();
  }
  onWandModeChange(mode: WandSelectionMode): void {
    this.wandMode = mode;
    this._syncMagicWandOptions();
  }
  onWandReferenceLayerChange(id: string): void {
    this.wandReferenceLayerId = id;
    this._syncMagicWandOptions();
  }
  private _syncMagicWandOptions(): void {
    (this.shapeManager as any).setMagicWandOptions?.({
      tolerance: this.wandTolerance,
      contiguous: this.wandContiguous,
      mode: this.wandMode,
      referenceLayerId: this.wandReferenceLayerId || undefined,
    });
  }

  // ══════════════════════════════════════════════════════════
  //  Speech Balloon Tool
  // ══════════════════════════════════════════════════════════

  /** Get IDs of currently selected shapes from the interaction service. */
  private _getSelectedShapeIds(): string[] {
    const is = (this.shapeManager as any).interactionService;
    if (is?.selectedNodes?.size) {
      return Array.from(is.selectedNodes).map((n: any) => n.id ?? n.getId?.()).filter(Boolean);
    }
    return (this.shapeManager as any).getSelectedShapeIds?.() ?? [];
  }

  /** Convert any Salsa color format ([0..1] triple, [0..255] triple, {r,g,b}, or hex) → CSS hex for color inputs. */
  private _buildingColorToHex(v: unknown): string {
    if (typeof v === 'string') return v.startsWith('#') ? v : `#${v}`;
    const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n)) * (n <= 1 ? 255 : 1)).toString(16).padStart(2, '0');
    if (Array.isArray(v) && v.length >= 3) return `#${toHex(v[0])}${toHex(v[1])}${toHex(v[2])}`;
    if (v && typeof v === 'object') {
      const o = v as any;
      return `#${toHex(o.r ?? 0)}${toHex(o.g ?? 0)}${toHex(o.b ?? 0)}`;
    }
    return '#000000';
  }

  private _hexToRgba01(hex: string): { r: number; g: number; b: number; a: number } {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255,
      a: 1,
    };
  }

  fxColorToHex(color: number[] | undefined | null): string {
    if (!color || color.length < 3) return '#000000';
    const toH = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
    return `#${toH(color[0])}${toH(color[1])}${toH(color[2])}`;
  }

  fxHexToColor(hex: string, existingAlpha = 1): [number, number, number, number] {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16) / 255,
      parseInt(h.substring(2, 4), 16) / 255,
      parseInt(h.substring(4, 6), 16) / 255,
      existingAlpha,
    ];
  }

  onBalloonStyleChange(style: BalloonStyle): void {
    this.balloonStyle = style;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      (this.shapeManager as any).setSpeechBalloonStyle?.(sel[0], style);
    }
  }

  onBalloonWritingModeChange(mode: WritingMode): void {
    this.balloonWritingMode = mode;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      (this.shapeManager as any).setSpeechBalloonWritingMode?.(sel[0], mode);
    }
  }

  onBalloonTailSideChange(side: TailSide): void {
    this.balloonTailSide = side;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      (this.shapeManager as any).setSpeechBalloonTail?.(sel[0], side, this.balloonTailPosition, this.balloonTailLength);
    }
  }

  onBalloonTailPositionChange(pos: number): void {
    this.balloonTailPosition = +pos;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      (this.shapeManager as any).setSpeechBalloonTail?.(sel[0], this.balloonTailSide, this.balloonTailPosition, this.balloonTailLength);
    }
  }

  onBalloonShowTailChange(show: boolean): void {
    this.balloonShowTail = show;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      const balloon = (this.shapeManager as any).getSpeechBalloon?.(sel[0]);
      balloon?.setShowTail?.(show);
    }
  }

  onBalloonFontSizeChange(size: number): void {
    this.balloonFontSize = +size;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      const balloon = (this.shapeManager as any).getSpeechBalloon?.(sel[0]);
      balloon?.setFontSize?.(+size);
    }
  }

  onBalloonMaxWidthChange(width: number): void {
    this.balloonMaxWidth = +width;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      const balloon = (this.shapeManager as any).getSpeechBalloon?.(sel[0]);
      balloon?.setMaxWidth?.(+width);
    }
  }

  onBalloonFontFamilyChange(font: string): void {
    this.balloonFontFamily = font;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      const balloon = (this.shapeManager as any).getSpeechBalloon?.(sel[0]);
      balloon?.setFont?.(font);
    }
  }

  onBalloonTextColorChange(hex: string): void {
    this.balloonTextColor = hex;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      const balloon = (this.shapeManager as any).getSpeechBalloon?.(sel[0]);
      balloon?.setTextColor?.(this._hexToRgba01(hex));
    }
  }

  onBalloonFillColorChange(hex: string): void {
    this.balloonFillColor = hex;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      const balloon = (this.shapeManager as any).getSpeechBalloon?.(sel[0]);
      balloon?.setFillColor?.(this._hexToRgba01(hex));
    }
  }

  onBalloonStrokeColorChange(hex: string): void {
    this.balloonStrokeColor = hex;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      const balloon = (this.shapeManager as any).getSpeechBalloon?.(sel[0]);
      balloon?.setStrokeColor?.(this._hexToRgba01(hex));
    }
  }

  /** Populate the balloon sidebar from an existing selected balloon's state. */
  private _syncBalloonSidebar(nodeId: string): void {
    const balloon = (this.shapeManager as any).getSpeechBalloon?.(nodeId);
    if (!balloon) return;
    // Style
    if (balloon.balloonStyle) this.balloonStyle = balloon.balloonStyle;
    // Writing mode
    if (balloon.writingMode) this.balloonWritingMode = balloon.writingMode;
    // Tail
    if (balloon.tailSide) this.balloonTailSide = balloon.tailSide;
    if (balloon.tailPosition != null) this.balloonTailPosition = balloon.tailPosition;
    if (balloon.showTail != null) this.balloonShowTail = balloon.showTail;
    if (balloon.tailLength != null) this.balloonTailLength = balloon.tailLength;
    // Font
    if (balloon.textNode?.font) this.balloonFontFamily = balloon.textNode.font;
    if (balloon.textNode?.fontSize) this.balloonFontSize = balloon.textNode.fontSize;
    // Max width
    if (balloon.maxWidth != null) this.balloonMaxWidth = balloon.maxWidth;
    // Stroke width
    if (balloon.balloonStrokeWidth != null) this.balloonStrokeWidth = balloon.balloonStrokeWidth;
    // Colors
    if (balloon.balloonFillColor) this.balloonFillColor = this._rgba01ToHex(balloon.balloonFillColor);
    if (balloon.balloonStrokeColor) this.balloonStrokeColor = this._rgba01ToHex(balloon.balloonStrokeColor);
    if (balloon.textNode?.fillColor) this.balloonTextColor = this._rgba01ToHex(balloon.textNode.fillColor);
  }

  /** Convert {r,g,b,a} (0–1) to '#rrggbb' hex string. */
  private _rgba01ToHex(c: { r: number; g: number; b: number; a?: number }): string {
    const r = Math.round((c.r ?? 0) * 255).toString(16).padStart(2, '0');
    const g = Math.round((c.g ?? 0) * 255).toString(16).padStart(2, '0');
    const b = Math.round((c.b ?? 0) * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  /** Called on canvas click when balloon tool is active */
  placeBalloon(worldX: number, worldY: number): void {
    const sm = this.shapeManager as any;
    if (!sm.createSpeechBalloon) return;
    const balloon = sm.createSpeechBalloon(worldX, worldY, {
      text: '',
      style: this.balloonStyle,
      writingMode: this.balloonWritingMode,
      tailSide: this.balloonTailSide,
      tailPosition: this.balloonTailPosition,
      tailLength: this.balloonTailLength,
      showTail: this.balloonShowTail,
      font: this.balloonFontFamily,
      fontSize: this.balloonFontSize,
      maxWidth: this.balloonMaxWidth,
      strokeWidth: this.balloonStrokeWidth,
      textColor: this._hexToRgba01(this.balloonTextColor),
      fillColor: this._hexToRgba01(this.balloonFillColor),
      strokeColor: this._hexToRgba01(this.balloonStrokeColor),
    });
    // Enter edit mode so the user can start typing immediately
    if (balloon) {
      const textNode = balloon.getTextNode?.();
      if (textNode?.beginTyping) textNode.beginTyping();
    }
  }

  cycleBalloonTailSide(): void {
    const sides: TailSide[] = ['bottom', 'right', 'top', 'left'];
    const idx = sides.indexOf(this.balloonTailSide);
    this.onBalloonTailSideChange(sides[(idx + 1) % sides.length]);
  }

  // ══════════════════════════════════════════════════════════
  //  Text Effects
  // ══════════════════════════════════════════════════════════

  addTextEffect(type?: TextEffectType): void {
    const entry = createEffectEntry(type ?? 'outline');
    this.textEffectChain = [...this.textEffectChain, entry];
  }

  removeTextEffect(id: number): void {
    this.textEffectChain = this.textEffectChain.filter(e => e.id !== id);
  }

  moveTextEffect(id: number, direction: -1 | 1): void {
    const idx = this.textEffectChain.findIndex(e => e.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= this.textEffectChain.length) return;
    const chain = [...this.textEffectChain];
    [chain[idx], chain[target]] = [chain[target], chain[idx]];
    this.textEffectChain = chain;
  }

  onTextEffectTypeChange(entry: TextEffectEntry, type: TextEffectType): void {
    entry.type = type;
    entry.params = createDefaultParams(type);
    this.textEffectChain = [...this.textEffectChain];
  }

  onTextEffectParamChange(entry: TextEffectEntry, key: string, value: any): void {
    entry.params[key] = value;
  }

  applyTextEffectPreset(preset: TextEffectPreset): void {
    let nextId = Date.now();
    this.textEffectChain = preset.effects.map(e => ({
      id: nextId++,
      type: e.type,
      params: { ...e.params },
    }));
  }

  /** Build the Salsa TextEffectConfig[] from the UI chain. */
  private _buildEffectChain(): { type: string; params: Record<string, any> }[] {
    return this.textEffectChain.map(e => ({ type: e.type, params: { ...e.params } }));
  }

  /** Build the Salsa TextCaptureConfig from the UI fields. */
  private _buildTextCaptureConfig(): any {
    const h = this.textEffectColor.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return {
      text: this.textEffectText,
      font: this.textEffectFont,
      fontSize: this.textEffectFontSize,
      color: [r, g, b, 1] as [number, number, number, number],
      bold: this.textEffectBold,
      italic: this.textEffectItalic,
      padding: this.textEffectPadding,
    };
  }

  /** Preview: capture + effects → display (non-destructive). */
  previewTextEffect(): void {
    const sm = this.shapeManager as any;
    if (!sm.createEffectedText) return;
    const result = sm.createEffectedText(this._buildTextCaptureConfig(), this._buildEffectChain());
    if (result) {
      // GPU texture is created; renderer will pick it up if needed.
      // For now this is a preview trigger — the texture lives until next call.
    }
  }

  /** Stamp the effected text onto the active raster layer at the viewport center. */
  async stampTextEffect(): Promise<void> {
    const sm = this.shapeManager as any;
    if (!sm.stampEffectedText) return;
    // Default to center of the canvas texture
    const canvasSize = sm.rasterLayerManager?.getCanvasSize?.() ?? { w: 1920, h: 1080 };
    const capture = this._buildTextCaptureConfig();
    // Estimate text size to center more accurately
    const estW = Math.min(capture.fontSize * capture.text.length * 0.6, canvasSize.w * 0.8);
    const estH = capture.fontSize * 1.4;
    const destX = Math.round((canvasSize.w - estW) / 2);
    const destY = Math.round((canvasSize.h - estH) / 2);
    await sm.stampEffectedText(destX, destY, capture, this._buildEffectChain());
  }

  /** Toggle animated effects (wave/glitch time param). */
  toggleTextEffectAnimation(): void {
    this.textEffectAnimating = !this.textEffectAnimating;
    if (this.textEffectAnimating) {
      const animate = (t: number) => {
        if (!this.textEffectAnimating) return;
        for (const entry of this.textEffectChain) {
          if (entry.type === 'wave' || entry.type === 'glitch') {
            entry.params['time'] = t * 0.001;
          }
        }
        this.previewTextEffect();
        this._textEffectAnimFrame = requestAnimationFrame(animate);
      };
      this._textEffectAnimFrame = requestAnimationFrame(animate);
    } else {
      if (this._textEffectAnimFrame != null) {
        cancelAnimationFrame(this._textEffectAnimFrame);
        this._textEffectAnimFrame = null;
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  Live Text Tool
  // ══════════════════════════════════════════════════════════

  /** Place a LiveTextNode at the given world position. */
  placeLiveText(worldX: number, worldY: number): void {
    const sm = this.shapeManager as any;
    if (!sm.createLiveText) return;
    const node = sm.createLiveText(worldX, worldY, this._buildLiveTextOptions());
    if (node) {
      this.liveTextNodeId = node.id ?? node.getId?.();
      sm.beginLiveTextEditing?.(this.liveTextNodeId);
      this.liveTextIsEditing = true;
    }
  }

  private _buildLiveTextOptions(): Record<string, any> {
    const h = this.liveTextColor.replace('#', '');
    return {
      text: '',
      font: this.liveTextFont,
      fontSize: this.liveTextFontSize,
      color: {
        r: parseInt(h.substring(0, 2), 16) / 255,
        g: parseInt(h.substring(2, 4), 16) / 255,
        b: parseInt(h.substring(4, 6), 16) / 255,
        a: 1,
      },
      bold: this.liveTextBold,
      italic: this.liveTextItalic,
      writingMode: this.liveTextWritingMode,
      padding: this.liveTextPadding,
      align: this.liveTextAlign,
      arcAngle: this.liveTextArcAngle,
      backgroundColor: this._liveTextBgRgba(),
      effects: this._buildLiveTextEffects(),
    };
  }

  private _liveTextBgRgba(): { r: number; g: number; b: number; a: number } | null {
    if (this.liveTextBgAlpha === 0) return null;
    const h = this.liveTextBgColor.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255,
      a: this.liveTextBgAlpha,
    };
  }

  onLiveTextBgChange(): void {
    const sm = this.shapeManager as any;
    if (!this.liveTextNodeId || !sm.setLiveTextStyle) return;
    sm.setLiveTextStyle(this.liveTextNodeId, { backgroundColor: this._liveTextBgRgba() });
  }

  onLiveTextAlignChange(align: 'left' | 'center' | 'right'): void {
    this.liveTextAlign = align;
    const sm = this.shapeManager as any;
    if (!this.liveTextNodeId || !sm.setLiveTextStyle) return;
    sm.setLiveTextStyle(this.liveTextNodeId, { align });
  }

  private _buildLiveTextEffects(): { type: string; params: Record<string, any> }[] {
    return this.liveTextEffectChain.map(e => ({ type: e.type, params: { ...e.params } }));
  }

  onLiveTextStyleChange(field: string, value: any): void {
    const sm = this.shapeManager as any;
    if (!this.liveTextNodeId || !sm.setLiveTextStyle) return;
    if (field === 'color') {
      sm.setLiveTextStyle(this.liveTextNodeId, { color: this._hexToRgba01(value) });
    } else {
      sm.setLiveTextStyle(this.liveTextNodeId, { [field]: value });
    }
  }

  endLiveTextEditing(): void {
    const sm = this.shapeManager as any;
    if (this.liveTextNodeId && sm.endLiveTextEditing) {
      sm.endLiveTextEditing(this.liveTextNodeId);
    }
    this.liveTextIsEditing = false;
  }

  async flattenLiveText(): Promise<void> {
    const sm = this.shapeManager as any;
    if (!this.liveTextNodeId || !sm.flattenLiveText) return;
    const success = await sm.flattenLiveText(this.liveTextNodeId);
    if (success) {
      this.liveTextNodeId = null;
      this.liveTextIsEditing = false;
    }
  }

  // Live text effect chain management
  addLiveTextEffect(type?: TextEffectType): void {
    const entry = createEffectEntry(type ?? 'outline');
    this.liveTextEffectChain = [...this.liveTextEffectChain, entry];
    this._pushLiveTextEffects();
  }

  removeLiveTextEffect(id: number): void {
    this.liveTextEffectChain = this.liveTextEffectChain.filter(e => e.id !== id);
    this._pushLiveTextEffects();
  }

  moveLiveTextEffect(id: number, direction: -1 | 1): void {
    const idx = this.liveTextEffectChain.findIndex(e => e.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= this.liveTextEffectChain.length) return;
    const chain = [...this.liveTextEffectChain];
    [chain[idx], chain[target]] = [chain[target], chain[idx]];
    this.liveTextEffectChain = chain;
    this._pushLiveTextEffects();
  }

  onLiveTextEffectTypeChange(entry: TextEffectEntry, type: TextEffectType): void {
    entry.type = type;
    entry.params = createDefaultParams(type);
    this.liveTextEffectChain = [...this.liveTextEffectChain];
    this._pushLiveTextEffects();
  }

  onLiveTextEffectParamChange(entry: TextEffectEntry, key: string, value: any): void {
    entry.params[key] = value;
    this._pushLiveTextEffects();
  }

  applyLiveTextEffectPreset(preset: TextEffectPreset): void {
    let nextId = Date.now();
    this.liveTextEffectChain = preset.effects.map(e => ({
      id: nextId++,
      type: e.type,
      params: { ...e.params },
    }));
    this._pushLiveTextEffects();
  }

  private _pushLiveTextEffects(): void {
    const sm = this.shapeManager as any;
    if (this.liveTextNodeId && sm.setLiveTextEffects) {
      sm.setLiveTextEffects(this.liveTextNodeId, this._buildLiveTextEffects());
    }
  }

  /** Populate sidebar from a selected LiveTextNode. */
  private _syncLiveTextSidebar(nodeId: string): void {
    const sm = this.shapeManager as any;
    const node = sm.getLiveTextNode?.(nodeId);
    if (!node) return;
    this.liveTextNodeId = nodeId;
    this.liveTextFont = node.font ?? 'Arial';
    this.liveTextFontSize = node.fontSize ?? 48;
    this.liveTextBold = node.bold ?? false;
    this.liveTextItalic = node.italic ?? false;
    this.liveTextWritingMode = node.writingMode ?? 'horizontal-tb';
    this.liveTextPadding = node.padding ?? 16;
    this.liveTextAlign = node.align ?? 'left';
    this.liveTextArcAngle = node.arcAngle ?? 0;
    if (node.textColor) this.liveTextColor = this._rgba01ToHex(node.textColor);
    if (node.maxWidth != null) this.liveTextMaxWidth = node.maxWidth;
    if (node.backgroundColor) {
      this.liveTextBgColor = this._rgba01ToHex(node.backgroundColor);
      this.liveTextBgAlpha = node.backgroundColor.a ?? 0;
    } else {
      this.liveTextBgColor = '#ffffff';
      this.liveTextBgAlpha = 0;
    }
    // Sync effects
    const effects = node.effects;
    if (effects?.length) {
      let nextId = Date.now();
      this.liveTextEffectChain = effects.map((e: any) => ({
        id: nextId++,
        type: e.type,
        params: { ...e.params },
      }));
    } else {
      this.liveTextEffectChain = [];
    }
  }

  // ══════════════════════════════════════════════════════════
  //  Custom Shader Editor
  // ══════════════════════════════════════════════════════════

  async validateCustomShader(): Promise<void> {
    const sm = this.shapeManager as any;
    if (!sm.validateCustomShader) return;
    const result = await sm.validateCustomShader(this.customShaderCode, this.customShaderAdvanced);
    if (result.success) {
      this.customShaderStatus = 'Compiled successfully';
      this.customShaderStatusType = 'success';
    } else {
      this.customShaderStatus = (result.errors ?? ['Unknown error']).join('\n');
      this.customShaderStatusType = 'error';
    }
  }

  async applyCustomShader(): Promise<void> {
    const sm = this.shapeManager as any;
    if (!this.liveTextNodeId || !sm.setCustomShader) return;
    const params: [number, number, number, number] = [
      this.customShaderParamA, this.customShaderParamB,
      this.customShaderParamC, this.customShaderParamD,
    ];
    const result = await sm.setCustomShader(
      this.liveTextNodeId, this.customShaderCode, this.customShaderAdvanced, params,
    );
    if (result.success) {
      this.customShaderStatus = 'Shader applied';
      this.customShaderStatusType = 'success';
    } else {
      this.customShaderStatus = (result.errors ?? ['Unknown error']).join('\n');
      this.customShaderStatusType = 'error';
    }
  }

  removeCustomShader(): void {
    const sm = this.shapeManager as any;
    if (this.liveTextNodeId && sm.removeCustomShader) {
      sm.removeCustomShader(this.liveTextNodeId);
    }
    this.customShaderStatus = '';
    this.customShaderStatusType = '';
    this.customShaderParamA = 0;
    this.customShaderParamB = 0;
    this.customShaderParamC = 0;
    this.customShaderParamD = 0;
    this.customShaderParamCount = 1;
  }

  onCustomShaderParamChange(): void {
    const sm = this.shapeManager as any;
    if (!this.liveTextNodeId || !sm.setCustomShaderParams) return;
    sm.setCustomShaderParams(this.liveTextNodeId, [
      this.customShaderParamA, this.customShaderParamB,
      this.customShaderParamC, this.customShaderParamD,
    ]);
  }

  loadShaderSnippet(snippet: ShaderSnippet): void {
    this.customShaderCode = snippet.code;
    this.customShaderAdvanced = false;
    [this.customShaderParamA, this.customShaderParamB,
     this.customShaderParamC, this.customShaderParamD] = snippet.params;
  }

  // ══════════════════════════════════════════════════════════
  //  Balloon Presets + Missing Controls
  // ══════════════════════════════════════════════════════════

  applyBalloonPreset(preset: BalloonPreset): void {
    this.balloonStyle = preset.style as any;
    this.balloonTailSide = preset.tailSide as any;
    this.balloonTailPosition = preset.tailPosition;
    this.balloonShowTail = preset.showTail;
    if (preset.fontSize != null) this.balloonFontSize = preset.fontSize;
    if (preset.strokeWidth != null) this.balloonStrokeWidth = preset.strokeWidth;
    if (preset.fillColor != null) this.balloonFillColor = preset.fillColor;
    // Apply to selected balloon if one exists
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      this.onBalloonStyleChange(this.balloonStyle);
      this.onBalloonTailSideChange(this.balloonTailSide);
      this.onBalloonShowTailChange(this.balloonShowTail);
      this.onBalloonFontSizeChange(this.balloonFontSize);
      this.onBalloonFillColorChange(this.balloonFillColor);
    }
  }

  onBalloonStrokeWidthChange(width: number): void {
    this.balloonStrokeWidth = +width;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      const balloon = (this.shapeManager as any).getSpeechBalloon?.(sel[0]);
      if (balloon) balloon.balloonStrokeWidth = +width;
    }
  }

  onBalloonTailLengthChange(length: number): void {
    this.balloonTailLength = +length;
    const sel = (this.shapeManager as any).getSelectedShapeIds?.();
    if (sel?.length === 1) {
      const balloon = (this.shapeManager as any).getSpeechBalloon?.(sel[0]);
      balloon?.setTailLength?.(+length);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  Panel Layout Tool
  // ══════════════════════════════════════════════════════════

  onPanelTemplateChange(template: PanelTemplate): void {
    this.panelTemplate = template;
    if (this.activePanelLayoutId) {
      (this.shapeManager as any).applyPanelTemplate?.(this.activePanelLayoutId, template);
    }
  }

  onPanelPageSizeChange(index: number): void {
    this.panelPageSizeIndex = +index;
  }

  onPanelGutterWidthChange(v: number): void {
    this.panelGutterWidth = +v;
    if (this.activePanelLayoutId) {
      (this.shapeManager as any).setPanelGutter?.(this.activePanelLayoutId, this.panelGutterWidth);
      this._refreshPanelGuides();
    }
  }

  onPanelBleedMarginChange(v: number): void {
    this.panelBleedMargin = +v;
    if (this.activePanelLayoutId) {
      (this.shapeManager as any).setPanelBleed?.(this.activePanelLayoutId, this.panelBleedMargin);
      this._refreshPanelGuides();
    }
  }

  onPanelBorderWidthChange(v: number): void {
    this.panelBorderWidth = +v;
  }

  onPanelShowBleedGuidesChange(show: boolean): void {
    this.panelShowBleedGuides = show;
    this._refreshPanelGuides();
  }

  onPanelShowGutterGuidesChange(show: boolean): void {
    this.panelShowGutterGuides = show;
    this._refreshPanelGuides();
  }

  /** Create a panel layout fitted to the illustration bounds */
  createPanelLayout(): void {
    const sm = this.shapeManager as any;
    // Prefer the illustration-aware API that auto-fits to the canvas bounds
    const useFit = typeof sm.createPanelLayoutForIllustration === 'function';
    let layout: any;
    if (useFit) {
      layout = sm.createPanelLayoutForIllustration({
        template: this.panelTemplate,
        gutterWidth: this.panelGutterWidth,
        bleedMargin: this.panelBleedMargin,
        borderWidth: this.panelBorderWidth,
        borderColor: this._hexToRgba01(this.panelBorderColor),
        backgroundColor: this._hexToRgba01(this.panelBackgroundColor),
      });
    } else if (sm.createPanelLayout) {
      // Fallback: manual positioning from page-size presets
      const ps = PAGE_SIZE_PRESETS[this.panelPageSizeIndex];
      layout = sm.createPanelLayout(0, 0, ps.width, ps.height, {
        template: this.panelTemplate,
        gutterWidth: this.panelGutterWidth,
        bleedMargin: this.panelBleedMargin,
        borderWidth: this.panelBorderWidth,
        borderColor: this._hexToRgba01(this.panelBorderColor),
        backgroundColor: this._hexToRgba01(this.panelBackgroundColor),
      });
    }
    this.activePanelLayoutId = layout?.getId?.() ?? null;
    this._refreshPanelGuides();
  }

  /** Refresh bleed/gutter guide geometry from the engine. */
  private _refreshPanelGuides(): void {
    const sm = this.shapeManager as any;
    if (!this.activePanelLayoutId) {
      this.bleedGuideRect = null;
      this.gutterGuideLines = null;
      return;
    }
    if (this.panelShowBleedGuides && sm.getPanelBleedGuide) {
      this.bleedGuideRect = sm.getPanelBleedGuide(this.activePanelLayoutId) ?? null;
    } else {
      this.bleedGuideRect = null;
    }
    if (this.panelShowGutterGuides && sm.getPanelGutterGuides) {
      this.gutterGuideLines = sm.getPanelGutterGuides(this.activePanelLayoutId) ?? null;
    } else {
      this.gutterGuideLines = null;
    }
  }

  // ── Transform operations ───────────────────────────────────

  async rasterFlipHorizontal(): Promise<void> {
    if (!this.rasterSelectionService.info.hasSelection) return;
    await (this.shapeManager as any).rasterFlipHorizontal?.();
    this.rasterSelectionService.refreshInfo();
  }

  async rasterFlipVertical(): Promise<void> {
    if (!this.rasterSelectionService.info.hasSelection) return;
    await (this.shapeManager as any).rasterFlipVertical?.();
    this.rasterSelectionService.refreshInfo();
  }

  async rasterRotate(degrees: number): Promise<void> {
    if (!this.rasterSelectionService.info.hasSelection) return;
    await (this.shapeManager as any).rasterRotate?.(degrees);
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
  closeEditMenu(): void {
    this.closeAllMenus();
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
    this.animationService.addCelAtCurrentFrame(this.selectedRasterLayerId ?? '');
  }

  // ── Auto-save ──────────────────────────────────────────────

  onAutoSaveIntervalChange(ms: number): void {
    this.selectedAutoSaveInterval = ms;
    this.autoSaveService.setInterval(ms);
  }

  async saveNow(): Promise<void> {
    await this.autoSaveService.saveNow();
  }

  zoomIn() { this.worldManager.zoomIn(); }
  zoomOut() { this.worldManager.zoomOut(); }

  get currentZoomPercent(): string {
    try { return Math.round((this.worldManager?.getZoomFactor?.() ?? 1) * 100) + '%'; }
    catch { return '100%'; }
  }

  // ── Canvas resize dialog (M2) ──────────────────────────────────
  showResizeDialog = false;
  resizeDialogWidth = 1920;
  resizeDialogHeight = 1080;
  resizeDialogAnchor: 'top-left' | 'center' = 'center';

  openResizeDialog(): void {
    const sm = this.shapeManager as any;
    const size = sm?.getDocumentSize?.();
    this.resizeDialogWidth = size?.w ?? 1920;
    this.resizeDialogHeight = size?.h ?? 1080;
    this.resizeDialogAnchor = 'center';
    this.showResizeDialog = true;
  }

  confirmResize(): void {
    const w = Math.round(this.resizeDialogWidth);
    const h = Math.round(this.resizeDialogHeight);
    if (!w || !h || w < 1 || h < 1) return;
    const sm = this.shapeManager as any;
    sm?.resizeDocument?.(w, h, this.resizeDialogAnchor);
    this.showResizeDialog = false;
  }

  // ── Color history ──────────────────────────────────────────────
  recentColors: string[] = [];

  private _addRecentColor(color: string): void {
    this.recentColors = [color, ...this.recentColors.filter(c => c !== color)].slice(0, 8);
  }

  // ── Shortcut cheatsheet ───────────────────────────────────────
  showShortcutCheatsheet = false;

  // ── Artboard overlay ────────────────────────────────────────

  private _applyDocumentSize(docSize: { w: number; h: number } | null): void {
    const sm = this.shapeManager as any;
    if (docSize?.w > 0 && docSize?.h > 0) {
      sm.setDocumentSize?.(docSize.w, docSize.h);
      sm.fitArtboard?.();
    } else {
      sm.clearDocumentSize?.();
    }
    this._updateArtboardOverlay();
  }

  private _setupArtboardOverlay(): void {
    this._artboardViewportSub?.unsubscribe?.();
    const is = (this.shapeManager as any).interactionService;
    if (is?.onViewportChanged) {
      this._artboardViewportSub = is.onViewportChanged.subscribe(() => {
        this._updateArtboardOverlay();
      });
    }
    this._updateArtboardOverlay();
  }

  _updateArtboardOverlay(): void {
    const sm = this.shapeManager as any;
    const scissor = sm.webgpuRenderer?.getArtboardScissor?.();
    if (!scissor) {
      this.artboardShadowStyle = {};
      this.artboardLabelStyle = {};
      this.artboardLabelText = '';
      return;
    }
    const cv = this.canvas;
    const scaleX = (cv && cv.width) ? cv.clientWidth / cv.width : 1 / (window.devicePixelRatio || 1);
    const scaleY = (cv && cv.height) ? cv.clientHeight / cv.height : 1 / (window.devicePixelRatio || 1);
    const x = scissor.x * scaleX;
    const y = scissor.y * scaleY;
    const w = scissor.w * scaleX;
    const h = scissor.h * scaleY;
    this.artboardShadowStyle = { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' };
    const docSize = sm.getDocumentSize?.();
    if (docSize) {
      this.artboardLabelText = `${docSize.w} × ${docSize.h} px`;
      this.artboardLabelStyle = { left: x + 'px', top: Math.max(0, y - 22) + 'px' };
    }
  }

  fitArtboard(): void {
    const sm = this.shapeManager as any;
    if (!sm.getDocumentSize?.()) return;
    sm.fitArtboard?.();
  }

  spawnShape(shape: string) {
    switch (shape) {
      case 'circle': this.shapeManager.createCircle(0, 0, .5, { r: 0, g: 0, b: 0, a: 1 }, 1); break;
      case 'rectangle': this.shapeManager.createRectangle(0, 0, .5, .5, { r: 0, g: 0, b: 0, a: 1 }, 1); break;
      case 'triangle': this.shapeManager.createTriangle(0, 0, .5, .5, { r: 0, g: 0, b: 0, a: 1 }, 1); break;
      case 'stickynote': this.shapeManager.createStickyNote(0, 0, 'Type anything!', { r: 1, g: 1, b: 0.56, a: 1 }, 'Zain S.'); break;
      case 'polygon': this.shapeManager.createRegularPolygon?.(0, 0, 0.3, this.defaultPolygonSides, { r: 0, g: 0, b: 0, a: 1 }, 1); break;
    }
  }

  downloadCanvasViewAsPng() {
    const canvas = this.canvas;
    if (!canvas) return console.error('Canvas element not found!');
    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = image;
    link.download = 'frogmarks_snapshot.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ── Export Modal ──────────────────────────────────────────────

  openExportModal(): void {
    this.exportCartTitle = this.illustrationTitle ?? this.illustration?.name ?? 'Untitled';
    this.exportCartAuthor = '';
    this.exportCartDescription = '';
    this.exportCartBusy = false;
    this.exportModalTab = 'image';
    this.refreshExportCartSounds();
    this.showExportModal = true;
  }

  private refreshExportCartSounds(): void {
    const sounds: { assetId: string }[] = (this.shapeManager as any).listUISounds?.() ?? [];
    this.exportCartSounds = sounds.map((s: any) => s.assetId ?? s);
  }

  closeExportModal(): void {
    this.showExportModal = false;
  }

  exportModalImage(): void {
    this.downloadCanvasViewAsPng();
    this.closeExportModal();
  }

  async exportModalFrogcart(): Promise<void> {
    if (this.exportCartBusy) return;
    this.exportCartBusy = true;
    try {
      const sm = this.shapeManager as any;
      const blob: Blob | undefined = await sm.exportFrogcart?.({
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
      this.closeExportModal();
    } catch (e) {
      console.error('[Export] frogcart failed', e);
    }
    this.exportCartBusy = false;
  }

  async exportModalWorkfile(): Promise<void> {
    await this.exportFrogFile();
    this.closeExportModal();
  }

  async exportTransparentPng(): Promise<void> {
    const sm = this.shapeManager as any;
    const blob: Blob | null = await sm.exportIllustrationTransparentPNG?.();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'frogmarks_transparent.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  setPreviewShapeSelected(shapeType: ShapeType | null, event: MouseEvent) {
    this.selectedShapeType = shapeType;
    this.shapeManager.setPreviewShape(shapeType as any, event);
  }

  openColorPicker() { this.showPenColorPicker = !this.showPenColorPicker; }

  // (kept for future websocket flow; renamed)
  private saveIllustrationIfChanged() {
    if (!this.illustration) return;
    void this.saveIllustrationV2();
  }

  /** Resolve a pixelDataUrl to an absolute URL. Relative paths (from local blob storage) need the API server origin prepended. */
  private resolvePixelDataUrl(url: string): string {
    if (!url) return url;
    // Already absolute (Azure SAS URLs or full URLs)
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    // Relative path — prepend the API base URL
    const apiOrigin = this.illustrationService.apiUrl.replace(/\/+$/, '');
    return `${apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  // Convert a Blob to a data URL (base64). Returns a Promise<string> like 'data:image/webp;base64,...'
  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  // ── V2 Save ──────────────────────────────────────────────────

  /** Build the full v2 state payload from current engine + animation state, save it, then upload dirty pixel data. */
  async saveIllustrationV2(): Promise<void> {
    if (!this.illustration?.id) return;
    if (this.isLoading) return; // suppress saves triggered by the load/restore sequence

    // Fix 1: concurrent save guard — queue at most one pending save
    if (this._saveRunning) { this._saveQueued = true; return; }
    this._saveRunning = true;

    try {
      await this._doSaveIllustrationV2();
    } finally {
      this._saveRunning = false;
      if (this._saveQueued) {
        this._saveQueued = false;
        void this.saveIllustrationV2();
      }
    }
  }

  private async _doSaveIllustrationV2(): Promise<void> {
    // Local-only: save full scene state to OPFS, update IndexedDB metadata
    if (this.syncMode === 2) {
      const { state } = await this.frogFileService.buildStatePayload(this.illustrationTitle);
      state.ditherConfig = { ...this.ditherConfig };
      state.documentSize = (this.shapeManager as any).getDocumentSize?.() ?? null;
      state.bgColor = this.bgColor;
      state.dotColor = this.dotColor;
      state.paperGrain = { type: this.paperGrainType, scale: this.paperGrainScale, strength: this.paperGrainStrength };
      state.savedAt = Date.now();
      const opfsKey = 'local-' + (this.illustration?.uuid ?? '');
      void this.opfsMetadataService.write(opfsKey, state);
      if (this.illustration?.uuid) {
        const docSize = (this.shapeManager as any).getDocumentSize?.() as { w: number; h: number } | null | undefined;
        const docAspect = docSize?.w && docSize?.h ? docSize.w / docSize.h : undefined;
        await this.localIllustrationService.update({
          uuid: this.illustration.uuid,
          name: this.illustrationTitle ?? this.illustration.name ?? 'Untitled',
          ...(docAspect !== undefined ? { documentAspect: docAspect } : {}),
        }).catch(() => {});
      }
      return;
    }

    const { state } = await this.frogFileService.buildStatePayload(this.illustrationTitle);

    // Attach dither config (held locally on the component)
    state.ditherConfig = { ...this.ditherConfig };

    // Override per-layer dither from the component's authoritative map.
    // buildStatePayload reads from the engine, but the engine getter may return undefined
    // for layers whose dither was set via the optional-chaining set path. The component
    // map is always kept in sync by the handlers and is the ground truth.
    for (const layer of state.layers) {
      const cfg = this.layerDitherConfigs.get(layer.layerId);
      if (cfg !== undefined) layer.ditherConfig = { ...cfg } as any;
    }

    // Attach document size (null = infinite canvas)
    state.documentSize = (this.shapeManager as any).getDocumentSize?.() ?? null;

    // Attach canvas and global UI settings not covered by the Salsa scene graph
    state.bgColor = this.bgColor;
    state.dotColor = this.dotColor;
    state.paperGrain = { type: this.paperGrainType, scale: this.paperGrainScale, strength: this.paperGrainStrength };
    state.scene3dGlobalSettings = {
      cameraMode: this.scene3dCameraMode,
      illustrationProjection: this.scene3dIllustrationProjection,
      fov: this.scene3dFOV,
      shadowsEnabled: this.scene3dShadowsEnabled,
      shadowMapSize: this.scene3dShadowMapSize,
      shadowExtent: this.scene3dShadowExtent,
      shadowBias: this.scene3dShadowBias,
      shadowStrength: this.scene3dShadowStrength,
      ssaoEnabled: this.scene3dSSAOEnabled,
      ssaoRadius: this.scene3dSSAORadius, ssaoIntensity: this.scene3dSSAOIntensity,
      ssaoPower: this.scene3dSSAOPower, ssaoBias: this.scene3dSSAOBias,
      ssaoResolutionScale: this.scene3dSSAOResolutionScale, ssaoSamples: this.scene3dSSAOSamples,
      lightAzimuth: this.scene3dLightAzimuth, lightElevation: this.scene3dLightElevation,
      lightIntensity: this.scene3dLightIntensity, keyLightColor: this.scene3dKeyLightColorHex,
      ambientR: this.scene3dAmbientR, ambientG: this.scene3dAmbientG, ambientB: this.scene3dAmbientB,
      ambientIntensity: this.scene3dAmbientIntensity, ambientColor: this.scene3dAmbientColorHex,
      ps1Jitter: this.scene3dPS1Jitter, ps1Snap: this.scene3dPS1Snap,
      ps1Affine: this.scene3dPS1Affine, ps1ColorDepth: this.scene3dPS1ColorDepth,
      frustumCulling: this.scene3dFrustumCulling,
      animSyncWithTimeline: this.scene3dAnimSyncWithTimeline,
      animStartFrame: this.scene3dAnimStartFrame,
      animEndFrame: this.scene3dAnimEndFrame,
      animFps: this.scene3dAnimFps,
      animLoop: this.scene3dAnimLoop,
      snapMode: this.scene3dSnapMode,
      snapGridSize: this.scene3dSnapGridSize,
      snapAngleDeg: this.scene3dSnapAngleDeg,
      snapScaleStep: this.scene3dSnapScaleStep,
      gridVisible: this.scene3dGridVisible,
      gridOpacity: this.scene3dGridOpacity,
      gridColor: [...this.scene3dGridColor] as [number, number, number],
      // Post-processing
      bloomEnabled: this.scene3dBloomEnabled, bloomThreshold: this.scene3dBloomThreshold, bloomIntensity: this.scene3dBloomIntensity,
      colorGradeEnabled: this.scene3dColorGradeEnabled, colorGradeBrightness: this.scene3dColorGradeBrightness,
      colorGradeContrast: this.scene3dColorGradeContrast, colorGradeSaturation: this.scene3dColorGradeSaturation,
      colorGradeTint: this.scene3dColorGradeTint,
      vignetteEnabled: this.scene3dVignetteEnabled, vignetteIntensity: this.scene3dVignetteIntensity,
      vignetteRadius: this.scene3dVignetteRadius, vignetteSoftness: this.scene3dVignetteSoftness,
      // Fog
      fogMode: this.scene3dFogMode, fogColor: this.scene3dFogColor,
      fogNear: this.scene3dFogNear, fogFar: this.scene3dFogFar, fogDensity: this.scene3dFogDensity,
      // Background
      bgMode: this.scene3dBgMode, bgColor1: this.scene3dBgColor1, bgColor2: this.scene3dBgColor2,
      // Visual quality
      enhancedVisuals: this.scene3dEnhancedVisuals, glassQuality: this.scene3dGlassQuality,
      aerialPerspective: this.scene3dAerialPerspective, textureFilter: this.scene3dTextureFilter,
      // Wind
      windDirDeg: this.sceneWindDirDeg, windStrength: this.sceneWindStrength, windSpeed: this.sceneWindSpeed,
      // IBL intensity (image itself is not serializable — user must re-upload; intensity is preserved)
      iblIntensity: this.scene3dIblIntensity,
      // PS1 extended
      ps1LoRes: this.scene3dPS1LoRes, ps1ResW: this.scene3dPS1ResW, ps1ResH: this.scene3dPS1ResH,
      ps1Dither: this.scene3dPS1Dither, ps1DitherStrength: this.scene3dPS1DitherStrength,
      ps1UVQuantize: this.scene3dPS1UVQuantize, ps1UVSteps: this.scene3dPS1UVSteps,
      // Cinematic cuts (host owns persistence)
      cameraCuts: this.scene3dCameraCuts.length ? this.scene3dCameraCuts : undefined,
    };

    const sm3d = this.shapeManager as any;
    const illId = this.illustration!.id;

    if (this.syncMode === 0) {
      // Cloud-sync only: upload blobs to Azure

      // Opt 2+3: per-mesh dirty upload using getMeshState3D — avoids serializing the full scene
      const dirtyMeshIds: string[] = sm3d.getDirtyMeshIds3D?.() ?? [];

      // Always keep the full mesh ID list in state so the load path knows which blobs exist
      const allNodes: any[] = sm3d.getScene3DNodeStates?.() ?? [];
      const allMeshIds = allNodes.map((n: any) => n.id ?? n.nodeId).filter(Boolean) as string[];
      state.meshIds = allMeshIds.length > 0 ? allMeshIds : undefined;

      const hierarchy: any[] = sm3d.getScene3DHierarchy?.() ?? [];
      const groupsMeta = hierarchy
        .filter((n: any) => n.type === '3DMeshGroup')
        .map((g: any) => ({ name: g.name as string, children: ((g.children ?? []) as any[]).map((c: any) => c.id as string).filter(Boolean) }));
      state.scene3dGroups = groupsMeta.length ? groupsMeta : undefined;

      const bucketKeys = Object.keys(this.scene3dAllGroupBuckets).filter(k => this.scene3dAllGroupBuckets[k]?.length);
      state.scene3dFrameLinkBuckets = bucketKeys.length
        ? Object.fromEntries(bucketKeys.map(k => [k, this.scene3dAllGroupBuckets[k]]))
        : undefined;

      if (dirtyMeshIds.length > 0) {
        // getMeshState3D(id) serializes only that mesh — O(1 mesh) instead of O(all meshes)
        const meshUploadTasks = dirtyMeshIds.map(async (id) => {
          try {
            const meshState = sm3d.getMeshState3D?.(id);
            if (!meshState) return;
            const blob = await gzipToBlob(meshState);
            await firstValueFrom(this.illustrationService.uploadMeshBlob(illId, id, blob));
          } catch (e) { console.warn(`[V2 Save] mesh upload failed for ${id}`, e); }
        });
        await Promise.all(meshUploadTasks);
        sm3d.clearDirtyMeshState3D?.(dirtyMeshIds);
      }

      // Opt 1: only re-upload texture library when textures changed
      if (this._texLibDirty) {
        this._texLibDirty = false;
        try {
          const texLib = sm3d.getTextureLibrarySnapshot?.();
          if (texLib) {
            const blob = await gzipToBlob(texLib);
            await firstValueFrom(this.illustrationService.uploadTextureLibraryBlob(illId, blob));
          }
        } catch (e) { console.warn('[V2 Save] texture library upload failed', e); }
      }
    }
    // No-cloud: meshIds stays undefined so the load path never tries to fetch blobs

    // Stamp savedAt so OPFS and DB share the same timestamp for freshness comparison
    state.savedAt = Date.now();

    // Step 1: Save state metadata to DB (no pixel/blob URLs in no-cloud mode)
    try {
      await firstValueFrom(this.illustrationService.saveState(illId, state));
    } catch (e) {
      console.error('[V2 Save] state save failed', e);
      return;
    }

    // Sync documentAspect back to the illustration model if it changed
    if (this.illustration && state.documentSize) {
      const newAspect = state.documentSize.w / state.documentSize.h;
      if (this.illustration.documentAspect !== newAspect) {
        this.illustration.documentAspect = newAspect;
        this.illustrationService.updateIllustration(this.illustration).subscribe({ error: e => console.warn('[V2 Save] documentAspect update failed', e) });
      }
    }

    // Step 2: Write metadata to OPFS — scene graph, animation config, canvas settings
    (state as any).backendSynced = true;
    void this.opfsMetadataService.write(illId.toString(), state);

    // Step 3: Upload pixel data for dirty layers only (cloud-sync only)
    if (this.syncMode === 0) {
      await this.uploadPixelData(state.layers);
    }
  }

  // ── .frog File Export / Import ─────────────────────────────

  async exportFrogFile(): Promise<void> {
    try {
      await this.frogFileService.exportFrogFile(
        this.illustrationTitle ?? this.illustration?.name ?? 'Untitled',
        this.canvas
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
  private async applyFrogImport(result: FrogImportResult): Promise<void> {
    const { manifest, sceneGraph, layerPixelData } = result;

    // 1. Apply scene graph
    if (sceneGraph) {
      await this.shapeManager.setSceneGraphJSON(sceneGraph);
      try {
        const raw = JSON.parse(sceneGraph);
        this.layerTree = this.buildLayerTree(raw.root);
      } catch { /* root may not exist */ }
    }

    // 2. Import pixel data
    if (layerPixelData.length > 0 && (this.shapeManager as any)?.importRasterLayersFromDataURLs) {
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
        (this.shapeManager as any)?.rasterLayerManager?.clearAllLayers?.();
        await (this.shapeManager as any).importRasterLayersFromDataURLs(importPayload);
      } catch (e) {
        console.warn('[FrogFile] importRasterLayersFromDataURLs failed', e);
      }
    }

    // 3. Apply layer properties
    const sm = this.shapeManager as any;
    for (const layer of manifest.layers) {
      if (sm?.setRasterLayerBlendMode) sm.setRasterLayerBlendMode(layer.layerId, layer.blendMode);
      if (sm?.setRasterLayerOpacity) sm.setRasterLayerOpacity(layer.layerId, layer.opacity);
      if (sm?.setRasterLayerVisibility) sm.setRasterLayerVisibility(layer.layerId, layer.visible);
      if (sm?.setRasterLayerLockTransparency) sm.setRasterLayerLockTransparency(layer.layerId, layer.lockTransparency);
      if (sm?.setRasterLayerClipping) sm.setRasterLayerClipping(layer.layerId, layer.clipped);
      if (layer.ditherConfig && sm?.setLayerDitherConfig) {
        sm.setLayerDitherConfig(layer.layerId, layer.ditherConfig);
        this.layerDitherConfigs.set(layer.layerId, { ...layer.ditherConfig } as DitherConfig);
      }
      if (layer.frameLinkAnimation && sm?.setLayerFrameLinkAnimation) {
        sm.setLayerFrameLinkAnimation(layer.layerId, layer.frameLinkAnimation);
      }
    }

    // 4. Restore animation state
    if (manifest.animation?.enabled) {
      const anim = manifest.animation;
      this.animationService.setAnimationEnabled(true);
      this.animationEnabled = true;
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
    this._applyDocumentSize(manifest.documentSize ?? null);

    // 6. Update UI
    this.illustrationTitle = manifest.name;
    this.refreshRasterLayers();

    // 6. Restore dither config from frog import (if present)
    if (result.ditherConfig) {
      this._applyDitherConfig(result.ditherConfig);
    }

    // After a full restore, treat all layers as needing re-upload
    this._invalidateUploadedLayers();
  }

  /** Upload pixel data for layers that have been painted since the last successful upload. */
  private async uploadPixelData(layers: LayerStateDto[]): Promise<void> {
    if (!this.illustration?.id) return;
    const sm = this.shapeManager as any;
    const illId = this.illustration.id;
    const texSize = sm?.getRasterTextureSize?.() ?? { w: this.canvas?.width ?? 1024, h: this.canvas?.height ?? 768 };

    // Fix 3: snapshot dirty set before upload so concurrent strokes during upload are preserved
    const dirtySnapshot = new Set(this._dirtyLayerIds);

    const uploadLayer = async (layer: LayerStateDto): Promise<number> => {
      // Skip layers that have already been uploaded and haven't been painted since
      const alreadyUploaded = this._uploadedLayerIds.has(layer.layerId);
      const isDirty = dirtySnapshot.has(layer.layerId);
      if (alreadyUploaded && !isDirty) return 0;

      if (layer.animated) {
        const counts = await Promise.all(layer.cels.map(async (cel) => {
          try {
            let blob: Blob | null = null;
            if (sm?.getCelPixelDataBlob) {
              blob = await sm.getCelPixelDataBlob(layer.layerId, cel.celId, 'image/webp');
            } else if (sm?.exportRasterLayerToBlob) {
              blob = await sm.exportRasterLayerToBlob(layer.layerId, 'image/webp');
            }
            if (!blob) { console.warn(`[V2 Save] no blob for cel ${cel.celId}`); return 0; }
            await firstValueFrom(this.illustrationService.uploadCelPixelData(illId, cel.celId, blob, texSize.w, texSize.h, 'webp'));
            return 1;
          } catch (e) { console.warn(`[V2 Save] cel upload failed for ${cel.celId}`, e); return 0; }
        }));
        return counts.reduce((a, b) => a + b, 0);
      } else {
        try {
          const blob: Blob | null = sm?.exportRasterLayerToBlob
            ? await sm.exportRasterLayerToBlob(layer.layerId, 'image/webp')
            : null;
          if (!blob) { console.warn(`[V2 Save] exportRasterLayerToBlob returned null for ${layer.layerId}`); return 0; }
          await firstValueFrom(this.illustrationService.uploadLayerPixelData(illId, layer.layerId, blob, texSize.w, texSize.h, 'webp'));
          return 1;
        } catch (e) { console.warn(`[V2 Save] layer upload failed for ${layer.layerId}`, e); return 0; }
      }
    };

    await Promise.all(layers.map(uploadLayer));

    // Mark uploaded layers clean (only remove IDs from the snapshot, preserving any added during upload)
    for (const id of dirtySnapshot) {
      this._dirtyLayerIds.delete(id);
      this._uploadedLayerIds.add(id);
    }
    // Register any newly seen layers as uploaded (first save after load, all layers are clean)
    for (const layer of layers) {
      this._uploadedLayerIds.add(layer.layerId);
    }

  }

  /** Call after a restore/import to mark all layers as needing re-upload. */
  private _invalidateUploadedLayers(): void {
    this._uploadedLayerIds.clear();
    this._dirtyLayerIds.clear();
  }

  // ── V2 Load ──────────────────────────────────────────────────

  private async loadIllustrationV2(): Promise<void> {
    // Local-only: OPFS is the only source — no SQL state, no blob downloads
    if (this.syncMode === 2) {
      const opfsDocId = 'local-' + (this.illustration?.uuid ?? '');
      try {
        this.animationService.beginBulkRestore();
        const result = await this.autoSaveService.loadDocument(opfsDocId).finally(() => {
          this.animationService.endBulkRestore();
        });
        if (result?.success) {
          this.refreshRasterLayers();
          const stillExists = this.rasterLayers.some(l => l.id === this.selectedRasterLayerId);
          if (!stillExists) this.selectedRasterLayerId = this.rasterLayers[0]?.id ?? null;
          this._syncLayerDitherConfigsFromEngine();
          const opfsMeta = await this.opfsMetadataService.read(opfsDocId);
          if (opfsMeta?.sceneGraph) {
            try {
              await this.shapeManager.setSceneGraphJSON(opfsMeta.sceneGraph);
              const raw = JSON.parse(opfsMeta.sceneGraph);
              this.layerTree = this.buildLayerTree(raw.root);
            } catch (e) {
              console.warn('[V2 Load] local-only sceneGraph restore failed', e);
            }
          }
          if (opfsMeta) {
            await this._syncAnimationStateFromBackend(opfsMeta);
            this._applyDocumentSize(opfsMeta.documentSize ?? null);
            this._updateArtboardOverlay();
            if (opfsMeta.bgColor) this.onBgColorSelected(opfsMeta.bgColor);
            if (opfsMeta.dotColor) this.onDotColorSelected(opfsMeta.dotColor);
            if (opfsMeta.paperGrain) {
              this.paperGrainType = (opfsMeta.paperGrain.type as any) ?? 'none';
              this.paperGrainScale = opfsMeta.paperGrain.scale ?? 1.0;
              this.paperGrainStrength = opfsMeta.paperGrain.strength ?? 0.3;
              this._applyPaperGrain();
            }
          }
        }
      } catch (e) {
        console.warn('[V2 Load] local-only OPFS load failed', e);
      }
      requestAnimationFrame(() => {
        (this.shapeManager as any).fitArtboard?.();
        this.markLoaded('sceneApplied');
      });
      return;
    }

    if (!this.illustration?.id) {
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
      return;
    }

    // ── Pending .frog import (from dashboard) ──
    if (this.frogFileService.pendingImport) {
      const pending = this.frogFileService.pendingImport;
      this.frogFileService.pendingImport = null; // consume it
      await this.applyFrogImport(pending);
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
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
        stateRes = await firstValueFrom(this.illustrationService.loadState(this.illustration.id));
      } catch (e) {
        console.warn('[V2 Load] loadState failed', e);
      }
    }


    if (useOpfs) {
      try {
        // Suppress timeline refreshes fired by Salsa's internal sceneGraphChanged events
        // during restore — each layer add fires an event, causing redundant full-layer scans.
        // endBulkRestore() fires exactly one refreshTimeline() after loadDocument() returns.
        this.animationService.beginBulkRestore();
        const result = await this.autoSaveService.loadDocument(docId).finally(() => {
          this.animationService.endBulkRestore();
        });
        if (result.success) {

          this.refreshRasterLayers();

          const stillExists = this.rasterLayers.some(l => l.id === this.selectedRasterLayerId);
          if (!stillExists) {
            this.selectedRasterLayerId = this.rasterLayers[0]?.id ?? null;
          }
          this._syncLayerDitherConfigsFromEngine();

          // If OPFS metadata file exists use it directly; otherwise fall back to backend
          // state for extended metadata (bgColor, ditherConfig, 3D nodes, etc.).
          // This handles pre-migration illustrations that have OPFS pixels but no meta file.
          let effectiveMeta: IllustrationStateDto | null = opfsMeta;
          if (!effectiveMeta) {
            try {
              const r = await firstValueFrom(this.illustrationService.loadState(this.illustration.id));
              effectiveMeta = r?.resultObject ?? null;
            } catch (e) {
              console.warn('[V2 Load] Could not fetch backend state for extended metadata', e);
            }
          }

          await this._syncAnimationStateFromBackend(effectiveMeta);
          const sm = this.shapeManager as any;
          const opfsDocSize = sm.getDocumentSize?.() as { w: number; h: number } | null | undefined;
          this._applyDocumentSize(effectiveMeta?.documentSize ?? opfsDocSize ?? null);
          this._updateArtboardOverlay();
          if (effectiveMeta) {
            if (effectiveMeta.bgColor) this.onBgColorSelected(effectiveMeta.bgColor);
            if (effectiveMeta.dotColor) this.onDotColorSelected(effectiveMeta.dotColor);
            if (effectiveMeta.paperGrain) {
              this.paperGrainType = (effectiveMeta.paperGrain.type as any) ?? 'none';
              this.paperGrainScale = effectiveMeta.paperGrain.scale ?? 1.0;
              this.paperGrainStrength = effectiveMeta.paperGrain.strength ?? 0.3;
              this._applyPaperGrain();
            }
            if (effectiveMeta.ditherConfig) this._applyDitherConfig(effectiveMeta.ditherConfig);
            if (effectiveMeta.scene3dGlobalSettings) {
              this._applyScene3dGlobalSettings(effectiveMeta.scene3dGlobalSettings);
            }
            // Per-layer metadata — dither config and frame link animation are not stored
            // in Salsa OPFS pixels, so apply them from the saved state.
            if (effectiveMeta.layers?.length) {
              for (const layer of effectiveMeta.layers) {
                if (layer.ditherConfig && sm?.setLayerDitherConfig) {
                  sm.setLayerDitherConfig(layer.layerId, layer.ditherConfig);
                  this.layerDitherConfigs.set(layer.layerId, { ...layer.ditherConfig } as any);
                }
                if (layer.frameLinkAnimation && sm?.setLayerFrameLinkAnimation) {
                  sm.setLayerFrameLinkAnimation(layer.layerId, layer.frameLinkAnimation);
                }
              }
            }
          } else {
            // No metadata at all — read bgColor from the engine to keep UI in sync.
            this.getBackgroundColor();
          }
          console.timeLog('[V2 Load] total', 'raster-layers-restored (OPFS)');
          if ((result as any).scene3dRestored) {
            // Salsa's loadDocument() already restored 3D from OPFS — just refresh the hierarchy UI
            console.timeLog('[V2 Load] total', 'scene3d-restored-by-salsa');
            this.scene3dRefreshMeshes?.();
          } else if (effectiveMeta?.meshIds?.length) {
            // New path: per-mesh blobs — fetch fresh SAS URLs then download in parallel
            try {
              console.timeLog('[V2 Load] total', 'scene3d-restore-start');
              const urlRes = await firstValueFrom(
                this.illustrationService.getMeshReadUrls(this.illustration!.id, effectiveMeta.meshIds)
              );
              const sasMap: Record<string, string> = urlRes?.resultObject ?? {};
              const nodeBlobs = await Promise.all(
                effectiveMeta.meshIds.map(async (id: string) => {
                  if (!sasMap[id]) return null;
                  const buf = await fetch(sasMap[id]).then(r => r.arrayBuffer());
                  return gunzipFromBinary(buf);
                })
              );
              const nodes3d = nodeBlobs.filter(Boolean);
              if (nodes3d.length) {
                await sm.restoreScene3DNodes?.(nodes3d, {});
                this._scene3dReconstructGroups(sm, effectiveMeta.scene3dGroups ?? []);
                this.scene3dAllGroupBuckets = effectiveMeta.scene3dFrameLinkBuckets ?? {};
              }
              if (effectiveMeta.texLibSasUrl) {
                const buf = await fetch(effectiveMeta.texLibSasUrl).then(r => r.arrayBuffer());
                sm.restoreTextureLibrary3D?.(await gunzipFromBinary(buf));
                console.timeLog('[V2 Load] total', 'texture-lib-restored');
              }
              this.scene3dRefreshMeshes?.();
              this.uiRefreshLayers?.();
              console.timeLog('[V2 Load] total', 'scene3d-restore-done');
            } catch (e) {
              console.warn('[V2 Load] Failed to restore 3D node state from OPFS meta (per-mesh)', e);
            }
          } else if (effectiveMeta?.scene3dNodesGzip) {
            // Legacy path: monolithic base64 blob
            try {
              console.timeLog('[V2 Load] total', 'scene3d-restore-start');
              const nodes3d = await gunzipFromBase64(effectiveMeta.scene3dNodesGzip) as any[];
              await sm.restoreScene3DNodes?.(nodes3d, {});
              this._scene3dReconstructGroups(sm, effectiveMeta.scene3dGroups ?? []);
              this.scene3dAllGroupBuckets = effectiveMeta.scene3dFrameLinkBuckets ?? {};
              if (effectiveMeta.textureLibrary3dGzip) {
                sm.restoreTextureLibrary3D?.(await gunzipFromBase64(effectiveMeta.textureLibrary3dGzip));
                console.timeLog('[V2 Load] total', 'texture-lib-restored');
              }
              this.scene3dRefreshMeshes?.();
              this.uiRefreshLayers?.();
              console.timeLog('[V2 Load] total', 'scene3d-restore-done');
            } catch (e) {
              console.warn('[V2 Load] Failed to restore 3D node state from OPFS meta', e);
            }
          }
          (this.shapeManager as any).restoreProceduralFromSave3D?.();
          this._scene3dLoadSnapSettings();
          this._loadScene3dGrid();
          console.timeEnd('[V2 Load] total');
          requestAnimationFrame(() => {
            (this.shapeManager as any).fitArtboard?.();
            this.markLoaded('sceneApplied');
          });
          return;
        }
        console.warn('[V2 Load] loadDocument() returned false despite listing — falling through to backend');
      } catch (e) {
        console.warn('[V2 Load] loadDocument() threw — falling through to backend', e);
      }
    }

    // ══════════════════════════════════════════════════════════
    //  Backend Path — fetch state + pixel data from server
    // ══════════════════════════════════════════════════════════

    // No-cloud: OPFS is the only source — no blob downloads exist on the server.
    // If OPFS had no data on this device, surface an empty-state prompt so the
    // user knows they need to import a .frogmarks file to restore their work.
    if (this.syncMode === 1) {
      this.noCloudEmptyState = true;
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
      return;
    }

    // OPFS was chosen but loadDocument() failed — need the full state now
    if (useOpfs && !stateRes) {
      try {
        stateRes = await firstValueFrom(this.illustrationService.loadState(this.illustration.id));
      } catch (e) {
        console.warn('[V2 Load] loadState fallback failed', e);
      }
    }

    const state: IllustrationStateDto | null = stateRes?.resultObject ?? null;

    // ── V2 path ──
    if (state && state.version >= 2 && state.layers?.length > 0) {

      // 1. Apply scene graph
      if (state.sceneGraph) {
        await this.shapeManager.setSceneGraphJSON(state.sceneGraph);
        try {
          const raw = JSON.parse(state.sceneGraph);
          this.layerTree = this.buildLayerTree(raw.root);
        } catch { /* scene graph may not have root for layer tree */ }
      }

      // 2. Download pixel data for all layers/cels in parallel
      console.timeLog('[V2 Load] total', 'scene-graph-applied');
      const illId = this.illustration!.id;
      const downloadLayer = async (layer: LayerStateDto): Promise<any[]> => {
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
        } else {
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
      };
      const importPayload = (await Promise.all(state.layers.map(downloadLayer))).flat();
      console.timeLog('[V2 Load] total', 'raster-layers-fetched');

      // 3. Import raster layers into engine
      if (importPayload.length > 0 && (this.shapeManager as any)?.importRasterLayersFromDataURLs) {
        try {
          // Clear the auto-created "Background" layer before importing saved layers
          (this.shapeManager as any)?.rasterLayerManager?.clearAllLayers?.();
          await (this.shapeManager as any).importRasterLayersFromDataURLs(importPayload);
        } catch (e) {
          console.warn('[V2 Load] importRasterLayersFromDataURLs failed', e);
        }
      }

      // 4. Apply layer properties
      const sm = this.shapeManager as any;
      for (const layer of state.layers) {
        if (sm?.setRasterLayerBlendMode) sm.setRasterLayerBlendMode(layer.layerId, layer.blendMode);
        if (sm?.setRasterLayerOpacity) sm.setRasterLayerOpacity(layer.layerId, layer.opacity);
        if (sm?.setRasterLayerVisibility) sm.setRasterLayerVisibility(layer.layerId, layer.visible);
        if (sm?.setRasterLayerLockTransparency) sm.setRasterLayerLockTransparency(layer.layerId, layer.lockTransparency);
        if (sm?.setRasterLayerClipping) sm.setRasterLayerClipping(layer.layerId, layer.clipped);
        if (layer.ditherConfig && sm?.setLayerDitherConfig) {
          sm.setLayerDitherConfig(layer.layerId, layer.ditherConfig);
          this.layerDitherConfigs.set(layer.layerId, { ...layer.ditherConfig } as DitherConfig);
        }
        if (layer.frameLinkAnimation && sm?.setLayerFrameLinkAnimation) {
          sm.setLayerFrameLinkAnimation(layer.layerId, layer.frameLinkAnimation);
        }
      }

      // 5. Restore animation state
      if (state.animation) {
        const anim = state.animation;
        if (anim.enabled) {
          this.animationService.setAnimationEnabled(true);
          this.animationEnabled = true;
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
      }

      this.refreshRasterLayers();
      console.timeLog('[V2 Load] total', 'raster-layers-restored');

      // If OPFS metadata has local changes not yet synced to backend (backendSynced === false),
      // prefer it for non-pixel settings so a quick refresh doesn't lose them.
      const settingsMeta: any = ((opfsMeta as any)?.backendSynced === false) ? opfsMeta : state;

      // Per-layer settings override when OPFS meta is ahead of backend state
      if (settingsMeta !== state && settingsMeta?.layers?.length) {
        for (const sl of settingsMeta.layers) {
          if (sl.ditherConfig && sm?.setLayerDitherConfig) {
            sm.setLayerDitherConfig(sl.layerId, sl.ditherConfig);
            this.layerDitherConfigs.set(sl.layerId, { ...sl.ditherConfig } as DitherConfig);
          }
          if (sl.frameLinkAnimation && sm?.setLayerFrameLinkAnimation) {
            sm.setLayerFrameLinkAnimation(sl.layerId, sl.frameLinkAnimation);
          }
        }
      }

      // 6. Restore dither config
      if (settingsMeta.ditherConfig) {
        this._applyDitherConfig(settingsMeta.ditherConfig);
      }

      // 7. Restore document size (bounded artboard vs infinite canvas)
      this._applyDocumentSize(settingsMeta.documentSize ?? state.documentSize ?? null);

      // 7b. Restore canvas / global UI settings
      if (settingsMeta.bgColor) this.onBgColorSelected(settingsMeta.bgColor);
      if (settingsMeta.dotColor) this.onDotColorSelected(settingsMeta.dotColor);
      if (settingsMeta.paperGrain) {
        this.paperGrainType = (settingsMeta.paperGrain.type as any) ?? 'none';
        this.paperGrainScale = settingsMeta.paperGrain.scale ?? 1.0;
        this.paperGrainStrength = settingsMeta.paperGrain.strength ?? 0.3;
        this._applyPaperGrain();
      }
      if (settingsMeta.scene3dGlobalSettings) {
        this._applyScene3dGlobalSettings(settingsMeta.scene3dGlobalSettings);
      }

      // 8. Restore 3D mesh state
      const smAny = this.shapeManager as any;
      if (state.meshSasUrls && Object.keys(state.meshSasUrls).length > 0) {
        // New path: per-mesh blobs downloaded directly from blob storage
        try {
          console.timeLog('[V2 Load] total', 'scene3d-restore-start');
          const nodeBlobs = await Promise.all(
            Object.entries(state.meshSasUrls).map(async ([, url]) => {
              const buf = await fetch(url).then(r => r.arrayBuffer());
              return gunzipFromBinary(buf);
            })
          );
          await smAny.restoreScene3DNodes?.(nodeBlobs, {});
          this._scene3dReconstructGroups(smAny, state.scene3dGroups ?? []);
          this.scene3dAllGroupBuckets = state.scene3dFrameLinkBuckets ?? {};
          if (state.texLibSasUrl) {
            const buf = await fetch(state.texLibSasUrl).then(r => r.arrayBuffer());
            smAny.restoreTextureLibrary3D?.(await gunzipFromBinary(buf));
            console.timeLog('[V2 Load] total', 'texture-lib-restored');
          }
          this.scene3dRefreshMeshes?.();
          this.uiRefreshLayers?.();
          console.timeLog('[V2 Load] total', 'scene3d-restore-done');
        } catch (e) {
          console.warn('[V2 Load] Failed to restore 3D node state (per-mesh)', e);
        }
      } else if (state.scene3dNodesGzip) {
        // Legacy path: monolithic base64 blob
        try {
          console.timeLog('[V2 Load] total', 'scene3d-restore-start');
          const nodes3d = await gunzipFromBase64(state.scene3dNodesGzip) as any[];
          await smAny.restoreScene3DNodes?.(nodes3d, {});
          this._scene3dReconstructGroups(smAny, state.scene3dGroups ?? []);
          this.scene3dAllGroupBuckets = state.scene3dFrameLinkBuckets ?? {};
          if (state.textureLibrary3dGzip) {
            smAny.restoreTextureLibrary3D?.(await gunzipFromBase64(state.textureLibrary3dGzip));
            console.timeLog('[V2 Load] total', 'texture-lib-restored');
          }
          this.scene3dRefreshMeshes?.();
          this.uiRefreshLayers?.();
          console.timeLog('[V2 Load] total', 'scene3d-restore-done');
        } catch (e) {
          console.warn('[V2 Load] Failed to restore 3D node state', e);
        }
      }
      (this.shapeManager as any).restoreProceduralFromSave3D?.();
      this._scene3dLoadSnapSettings();
      this._loadScene3dGrid();
      console.timeEnd('[V2 Load] total');
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
      return;
    }

    // V2 block was skipped (new illustration with no layers yet).
    // resetSceneState() cleared the engine background; re-apply the component's current
    // bgColor so the engine matches and getBackgroundColor() doesn't overwrite it with white.
    this.onBgColorSelected(state?.bgColor ?? this.bgColor);
    requestAnimationFrame(() => this.markLoaded('sceneApplied'));
  }

  /**
   * After loadDocument() restores from OPFS, sync the animation/timeline UI state
   * from the backend metadata so the UI reflects the saved settings.
   * Pass the already-fetched state to avoid a redundant loadState() HTTP call.
   */
  private async _syncAnimationStateFromBackend(preloadedState?: IllustrationStateDto | null): Promise<void> {
    if (!this.illustration?.id) return;
    try {
      let state: IllustrationStateDto | null = preloadedState ?? null;
      if (!state) {
        const stateRes = await firstValueFrom(this.illustrationService.loadState(this.illustration.id));
        state = stateRes?.resultObject ?? null;
      }
      if (!state?.animation) return;

      const anim = state.animation;
      if (anim.enabled) {
        this.animationService.setAnimationEnabled(true);
        this.animationEnabled = true;
        this.animationService.setFrameCount(anim.frameCount);
        this.animationService.setFps(anim.fps);
        this.animationService.setLoopMode(anim.loopMode as LoopMode);
        this.animationService.setPlayRange(anim.playRangeStart, anim.playRangeEnd);
        if (anim.onionSkin) {
          this.animationService.setOnionSkin(anim.onionSkin as OnionSkinConfig);
        }
        this.animationService.refreshTimeline();
      }

      // Also rebuild the layer tree from the scene graph
      if (state.sceneGraph) {
        try {
          const raw = JSON.parse(state.sceneGraph);
          if (raw.root) this.layerTree = this.buildLayerTree(raw.root);
        } catch { /* scene graph may not have root */ }
      }

    } catch (e) {
      console.warn('[V2 Load] _syncAnimationStateFromBackend failed (non-fatal)', e);
    }
  }

  private _applyScene3dGlobalSettings(s: NonNullable<IllustrationStateDto['scene3dGlobalSettings']>): void {
    const sm = this.shapeManager as any;
    const s3d = sm.scene3d;
    if (s.cameraMode !== undefined) { this.scene3dCameraMode = s.cameraMode as any; s3d?.setCameraMode?.(s.cameraMode); }
    if (s.illustrationProjection !== undefined) {
      this.scene3dIllustrationProjection = s.illustrationProjection as any;
      sm.setIllustrationProjection3D?.(s.illustrationProjection);
    }
    if (s.fov !== undefined) { this.scene3dFOV = s.fov; s3d?.setFOV?.(s.fov); }
    if (s.shadowsEnabled !== undefined) {
      this.scene3dShadowsEnabled = s.shadowsEnabled;
      this.scene3dShadowMapSize = s.shadowMapSize ?? this.scene3dShadowMapSize;
      this.scene3dShadowExtent = s.shadowExtent ?? this.scene3dShadowExtent;
      this.scene3dShadowBias = s.shadowBias ?? this.scene3dShadowBias;
      this.scene3dShadowStrength = s.shadowStrength ?? this.scene3dShadowStrength;
      if (s.shadowsEnabled) {
        s3d?.enableShadows?.(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias)
          ?? sm.enableShadows3D?.(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias);
        s3d?.setShadowStrength3D?.(this.scene3dShadowStrength);
      } else {
        s3d?.disableShadows?.() ?? sm.disableShadows3D?.();
      }
    }
    if (s.ssaoEnabled !== undefined) {
      this.scene3dSSAOEnabled         = s.ssaoEnabled;
      this.scene3dSSAORadius          = s.ssaoRadius          ?? this.scene3dSSAORadius;
      this.scene3dSSAOIntensity       = s.ssaoIntensity       ?? this.scene3dSSAOIntensity;
      this.scene3dSSAOPower           = s.ssaoPower           ?? this.scene3dSSAOPower;
      this.scene3dSSAOBias            = s.ssaoBias            ?? this.scene3dSSAOBias;
      this.scene3dSSAOResolutionScale = s.ssaoResolutionScale ?? this.scene3dSSAOResolutionScale;
      this.scene3dSSAOSamples         = s.ssaoSamples         ?? this.scene3dSSAOSamples;
      s3d?.setSSAO3D?.(s.ssaoEnabled, {
        radius: this.scene3dSSAORadius, intensity: this.scene3dSSAOIntensity,
        power: this.scene3dSSAOPower, bias: this.scene3dSSAOBias,
        resolutionScale: this.scene3dSSAOResolutionScale, samples: this.scene3dSSAOSamples,
      });
    }
    if (s.lightAzimuth !== undefined || s.lightElevation !== undefined || s.lightIntensity !== undefined
        || s.lightDirX !== undefined) {
      this.scene3dLightIntensity = s.lightIntensity ?? this.scene3dLightIntensity;
      if (s.keyLightColor) this.scene3dKeyLightColorHex = s.keyLightColor;
      this.scene3dAmbientR = s.ambientR ?? this.scene3dAmbientR;
      this.scene3dAmbientG = s.ambientG ?? this.scene3dAmbientG;
      this.scene3dAmbientB = s.ambientB ?? this.scene3dAmbientB;
      this.scene3dAmbientIntensity = s.ambientIntensity ?? this.scene3dAmbientIntensity;
      if (s.ambientColor) {
        this.scene3dAmbientColorHex = s.ambientColor;
      } else {
        // back-compat: derive hex from the RGB floats for docs saved before ambientColor existed
        const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
        this.scene3dAmbientColorHex = `#${toHex(this.scene3dAmbientR)}${toHex(this.scene3dAmbientG)}${toHex(this.scene3dAmbientB)}`;
      }
      if (s.lightAzimuth !== undefined || s.lightElevation !== undefined) {
        this.scene3dLightAzimuth = s.lightAzimuth ?? this.scene3dLightAzimuth;
        this.scene3dLightElevation = s.lightElevation ?? this.scene3dLightElevation;
        sm.setLightAngles3D?.(this.scene3dLightAzimuth, this.scene3dLightElevation);
        sm.setLightIntensity3D?.(this.scene3dLightIntensity);
        const kc = this.hexToRgba01(this.scene3dKeyLightColorHex);
        sm.setLightColor3D?.(kc[0], kc[1], kc[2]);
      } else if (s.lightDirX !== undefined) {
        s3d?.setDirectionalLight?.(s.lightDirX, s.lightDirY, s.lightDirZ, 1, 1, 1, this.scene3dLightIntensity);
      }
      s3d?.setAmbientLight?.(
        this.scene3dAmbientR, this.scene3dAmbientG, this.scene3dAmbientB, this.scene3dAmbientIntensity);
    }
    if (s.ps1Jitter !== undefined || s.ps1Snap !== undefined) {
      this.scene3dPS1Jitter         = s.ps1Jitter         ?? this.scene3dPS1Jitter;
      this.scene3dPS1Snap           = s.ps1Snap           ?? this.scene3dPS1Snap;
      this.scene3dPS1Affine         = s.ps1Affine         ?? this.scene3dPS1Affine;
      this.scene3dPS1ColorDepth     = s.ps1ColorDepth     ?? this.scene3dPS1ColorDepth;
      this.scene3dPS1LoRes          = s.ps1LoRes          ?? this.scene3dPS1LoRes;
      this.scene3dPS1ResW           = s.ps1ResW           ?? this.scene3dPS1ResW;
      this.scene3dPS1ResH           = s.ps1ResH           ?? this.scene3dPS1ResH;
      this.scene3dPS1Dither         = s.ps1Dither         ?? this.scene3dPS1Dither;
      this.scene3dPS1DitherStrength = s.ps1DitherStrength ?? this.scene3dPS1DitherStrength;
      this.scene3dPS1UVQuantize     = s.ps1UVQuantize     ?? this.scene3dPS1UVQuantize;
      this.scene3dPS1UVSteps        = s.ps1UVSteps        ?? this.scene3dPS1UVSteps;
      this.scene3dApplyPS1();
    }
    if (s.frustumCulling !== undefined) this.scene3dSetFrustumCulling(s.frustumCulling);
    if (s.animSyncWithTimeline !== undefined) this.scene3dAnimSyncWithTimeline = s.animSyncWithTimeline;
    if (s.animStartFrame !== undefined) this.scene3dAnimStartFrame = s.animStartFrame;
    if (s.animEndFrame !== undefined) this.scene3dAnimEndFrame = s.animEndFrame;
    if (s.animFps !== undefined) this.scene3dAnimFps = s.animFps;
    if (s.animLoop !== undefined) this.scene3dAnimLoop = s.animLoop;
    this.scene3dApplyAnimationConfig();
    // Snap settings
    if (s.snapMode !== undefined) {
      this.scene3dSnapMode = s.snapMode as any;
      (this.shapeManager as any).snapMode3D = s.snapMode;
    }
    if (s.snapGridSize !== undefined || s.snapAngleDeg !== undefined || s.snapScaleStep !== undefined) {
      if (s.snapGridSize !== undefined) this.scene3dSnapGridSize = s.snapGridSize;
      if (s.snapAngleDeg !== undefined) this.scene3dSnapAngleDeg = s.snapAngleDeg;
      if (s.snapScaleStep !== undefined) this.scene3dSnapScaleStep = s.snapScaleStep;
      const smSnap = this.shapeManager as any;
      smSnap.snapGridSize3D  = this.scene3dSnapGridSize;
      smSnap.snapAngle3D     = this.scene3dSnapAngleDeg * Math.PI / 180;
      smSnap.snapScaleStep3D = this.scene3dSnapScaleStep;
    }
    // Ground grid
    if (s.gridVisible !== undefined || s.gridOpacity !== undefined || s.gridColor !== undefined) {
      if (s.gridVisible !== undefined) this.scene3dGridVisible = s.gridVisible;
      if (s.gridOpacity !== undefined) this.scene3dGridOpacity = s.gridOpacity;
      if (s.gridColor !== undefined) this.scene3dGridColor = [...s.gridColor] as [number, number, number];
      this.applyScene3dGrid();
    }
    // Post-processing
    if (s.bloomEnabled !== undefined || s.colorGradeEnabled !== undefined || s.vignetteEnabled !== undefined) {
      this.scene3dBloomEnabled         = s.bloomEnabled         ?? this.scene3dBloomEnabled;
      this.scene3dBloomThreshold       = s.bloomThreshold       ?? this.scene3dBloomThreshold;
      this.scene3dBloomIntensity       = s.bloomIntensity       ?? this.scene3dBloomIntensity;
      this.scene3dColorGradeEnabled    = s.colorGradeEnabled    ?? this.scene3dColorGradeEnabled;
      this.scene3dColorGradeBrightness = s.colorGradeBrightness ?? this.scene3dColorGradeBrightness;
      this.scene3dColorGradeContrast   = s.colorGradeContrast   ?? this.scene3dColorGradeContrast;
      this.scene3dColorGradeSaturation = s.colorGradeSaturation ?? this.scene3dColorGradeSaturation;
      if (s.colorGradeTint)            this.scene3dColorGradeTint = s.colorGradeTint;
      this.scene3dVignetteEnabled      = s.vignetteEnabled      ?? this.scene3dVignetteEnabled;
      this.scene3dVignetteIntensity    = s.vignetteIntensity    ?? this.scene3dVignetteIntensity;
      this.scene3dVignetteRadius       = s.vignetteRadius       ?? this.scene3dVignetteRadius;
      this.scene3dVignetteSoftness     = s.vignetteSoftness     ?? this.scene3dVignetteSoftness;
      this.scene3dApplyPostProcessing();
    }
    // Fog
    if (s.fogMode !== undefined) {
      this.scene3dFogMode    = s.fogMode as any;
      this.scene3dFogColor   = s.fogColor   ?? this.scene3dFogColor;
      this.scene3dFogNear    = s.fogNear    ?? this.scene3dFogNear;
      this.scene3dFogFar     = s.fogFar     ?? this.scene3dFogFar;
      this.scene3dFogDensity = s.fogDensity ?? this.scene3dFogDensity;
      this.scene3dApplyFog();
    }
    // Background
    if (s.bgMode !== undefined) {
      this.scene3dBgMode   = s.bgMode as any;
      this.scene3dBgColor1 = s.bgColor1 ?? this.scene3dBgColor1;
      this.scene3dBgColor2 = s.bgColor2 ?? this.scene3dBgColor2;
      this.scene3dApplySceneBg();
    }
    // Visual quality / texture
    if (s.enhancedVisuals !== undefined) this.scene3dSetEnhancedVisuals(s.enhancedVisuals);
    if (s.glassQuality !== undefined) this.scene3dSetGlassQuality(s.glassQuality);
    if (s.aerialPerspective !== undefined) this.scene3dSetAerialPerspective(s.aerialPerspective);
    if (s.textureFilter !== undefined) this.scene3dSetTextureFilter(s.textureFilter as any);
    // Wind
    if (s.windDirDeg !== undefined || s.windStrength !== undefined || s.windSpeed !== undefined) {
      this.sceneWindDirDeg   = s.windDirDeg   ?? this.sceneWindDirDeg;
      this.sceneWindStrength = s.windStrength  ?? this.sceneWindStrength;
      this.sceneWindSpeed    = s.windSpeed     ?? this.sceneWindSpeed;
      this.scene3dApplyWind();
    }
    // IBL intensity (UI state only — image must be re-uploaded)
    if (s.iblIntensity !== undefined) this.scene3dIblIntensity = s.iblIntensity;
    // Cinematic cuts (host owns persistence)
    if (s.cameraCuts?.length) {
      const sm = this.shapeManager as any;
      sm.setCameraCuts3D?.(s.cameraCuts);
      this.scene3dCameraCuts = s.cameraCuts;
      this.scene3dRefreshCameraNodes();
    }
  }

  /**
   * Apply a saved dither configuration to both the local UI state and the engine.
   */
  private _applyDitherConfig(config: any): void {
    this.ditherConfig = {
      enabled: config.enabled ?? false,
      algorithm: config.algorithm ?? 'halftone_dot',
      colorLevels: config.colorLevels ?? 2,
      bayerLevel: config.bayerLevel ?? 2,
      halftoneAngle: config.halftoneAngle ?? 45,
      halftoneFrequency: config.halftoneFrequency ?? 40,
      strength: config.strength ?? 1.0,
      patternScale: config.patternScale ?? 0.25,
      perChannel: config.perChannel ?? false,
      colorMode: config.colorMode ?? 'duotone',
      foregroundColor: config.foregroundColor ?? [0, 0, 0, 1],
      backgroundColor: config.backgroundColor ?? [1, 1, 1, 0],
      invertPattern: config.invertPattern ?? false,
      duotoneBias: config.duotoneBias ?? 0.5,
      tintOpacity: config.tintOpacity ?? 1.0,
      edgeWidth: config.edgeWidth ?? 0,
      edgeFade: config.edgeFade ?? 0,
      edgeShrink: config.edgeShrink ?? 0,
      edgeDensity: config.edgeDensity ?? 0,
      edgeSeed: config.edgeSeed ?? 0,
      edgeMode: config.edgeMode ?? 'content',
    };

    const sm = this.shapeManager;
    sm.setDitherEnabled?.(this.ditherConfig.enabled);
    sm.setDitherAlgorithm?.(this.ditherConfig.algorithm);
    sm.setDitherColorLevels?.(this.ditherConfig.colorLevels);
    sm.setDitherBayerLevel?.(this.ditherConfig.bayerLevel);
    sm.setDitherHalftoneAngle?.(this.ditherConfig.halftoneAngle);
    sm.setDitherHalftoneFrequency?.(this.ditherConfig.halftoneFrequency);
    sm.setDitherStrength?.(this.ditherConfig.strength);
    sm.setDitherPatternScale?.(this.ditherConfig.patternScale);
    sm.setDitherPerChannel?.(this.ditherConfig.perChannel);
    sm.setDitherColorMode?.(this.ditherConfig.colorMode);
    const fg = this.ditherConfig.foregroundColor;
    sm.setDitherForegroundColor?.(fg[0], fg[1], fg[2], fg[3]);
    const bg = this.ditherConfig.backgroundColor;
    sm.setDitherBackgroundColor?.(bg[0], bg[1], bg[2], bg[3]);
    sm.setDitherInvertPattern?.(this.ditherConfig.invertPattern);
    sm.setDitherDuotoneBias?.(this.ditherConfig.duotoneBias);
    sm.setDitherTintOpacity?.(this.ditherConfig.tintOpacity);
  }


  // Helper: convert Blob -> HTMLCanvasElement by drawing the image into a canvas
  private async blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
    const img = await (self as any).createImageBitmap(blob).catch(() => null);
    if (!img) throw new Error('createImageBitmap failed');
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  lastThumbnailTime = 0;
  THUMBNAIL_UPDATE_INTERVAL = 60000;
  lastSavedThumbnailJSON = '';

  private saveThumbnailIfChanged() {
    const current = this.shapeManager.getSceneGraphJSON();
    const now = Date.now();
    if (current !== this.lastSavedThumbnailJSON) {
      this.saveThumbnail();
      this.lastSavedThumbnailJSON = current;
      this.lastThumbnailTime = now;
    }
  }

  async saveThumbnail() {
    if (!this.illustrationUid) return;
    const sm = this.shapeManager as any;
    let blob: Blob;
    if (sm.captureDocumentBoundsToBlob) {
      blob = await sm.captureDocumentBoundsToBlob('jpeg', 512);
    } else {
      blob = await this.shapeManager.captureThumbnailBlob(300);
    }

    if (this.syncMode === 2) {
      // Local-only: store thumbnail as a data URL in IndexedDB
      const reader = new FileReader();
      reader.onload = () => {
        if (this.illustration?.uuid) {
          this.localIllustrationService.updateThumbnail(this.illustration.uuid, reader.result as string).catch(() => {});
        }
      };
      reader.readAsDataURL(blob);
    } else {
      this.illustrationService.uploadThumbnail(this.illustrationUid, blob).subscribe();
    }
  }

  async returnToDashboard(): Promise<void> {
    // Save and refresh the shell project index before going home.
    // Falls back to the HTML dashboard if the shell isn't available.
    try {
      await this.saveThumbnail();
      if (this.illustrationUid) await (this.shapeManager as any).shell?.recordProjectSave?.(this.illustrationUid);
    } catch { /* non-fatal */ }
    this.router.navigate(['/']);
  }

  resetSceneState() {
    if (this.shapeManager) this.shapeManager.clear();
    if (this.worldManager) this.worldManager.resetWorldState();
  }

  buildLayerTree(data: any): LayerTreeNode {
    const isSticky = data.type === 'Sticky Note';
    return {
      id: data.id,
      type: data.type || 'Unknown',
      name: data.name || data.type || 'Untitled',
      visible: data.visible !== false,
      locked: data.locked,
      children: isSticky ? [] : (Array.isArray(data.children) ? data.children.map((c: any) => this.buildLayerTree(c)) : [])
    };
  }

  illustrationTitle = '';
  updateIllustrationTitle() {
    if (this.syncMode === 2) {
      if (this.illustration?.uuid) {
        this.localIllustrationService.rename(this.illustration.uuid, this.illustrationTitle).catch(() => {});
      }
    } else {
      this.illustrationService.renameIllustration(this.illustration!.id, this.illustrationTitle).subscribe(() => {});
    }
  }

  trackById(index: number, item: LayerTreeNode): string { return item.id; }

  private async initWithIllustration(illustration: Illustration): Promise<void> {
    this.illustration = illustration;
    this.illustrationTitle = illustration.name ?? 'Untitled';
    this.syncMode = illustration.syncMode ?? (this.isLocalMode ? 2 : 0);

    this.resetSceneState();
    await this.loadIllustrationV2();

    this.autoSaveSubscription = this.sceneChanged$
      .pipe(auditTime(2000), distinctUntilChanged())
      .subscribe(async () => {
        if (!this.illustration) return;
        try {
          await this.saveIllustrationV2();
        } catch (e) {
          console.warn('[V2 Save] autosave failed', e);
        }
      });

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
        { intervalMs: this.selectedAutoSaveInterval, strokeDebounceMs: 100 }
      );
      this.autoSaveService.state$.subscribe(s => this.autoSaveState = s);
    }

    this.thumbnailSaveSubscription = this.sceneChanged$
      .pipe(auditTime(5000))
      .subscribe(() => {
        if (!this.illustration?.isCustomThumbnail) {
          this.saveThumbnailIfChanged();
        }
      });

    this.markLoaded('illustration');
  }

  private async _initViewerMode(uid: string): Promise<void> {
    try {
      const viewDto = await firstValueFrom(this.illustrationService.getPublicView(uid));
      this.viewerTitle = viewDto.name;

      const response = await fetch(viewDto.bundleUrl);
      if (!response.ok) throw new Error(`Bundle fetch failed: ${response.status}`);
      const bundle = await response.blob();

      await (this.shapeManager as any).unpackProject(bundle);
      this._disableAllViewerTools();
      // Safety fallback: if unpackProject doesn't fire onSceneGraphChanged, unblock the loader
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
    } catch (e) {
      console.error('[Viewer] failed to load bundle', e);
      this.notifyService.error('Could not load this illustration.');
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
    }
    this.markLoaded('illustration');
  }

  private _disableAllViewerTools(): void {
    const sm = this.shapeManager as any;
    sm.disableLineDrawing?.();
    sm.disablePolygonDrawing?.();
    sm.disableRasterDrawing?.();
    sm.disableRasterTool?.();
    sm.disableRasterEraserTool?.();
    sm.disableStampDrawing?.();
    sm.disableSectionDrawing?.();
    sm.disableHighlightDrawing?.();
    sm.disablePatternDrawing?.();
    sm.disableEraserTool?.();
    sm.disableSDFTextDrawing?.();
    sm.disableRasterSelection?.();
    sm.disableRasterMove?.();
    sm.disableRasterText?.();
    sm.disableScribbleDrawing?.();
    sm.disableTextDrawing?.();
  }

  async publishIllustration(): Promise<void> {
    if (!this.illustration?.id || this.isPublishing) return;
    this.isPublishing = true;
    this.closeContextMenu();
    try {
      const sm = this.shapeManager as any;
      if (!sm?.packProject) throw new Error('packProject not available');
      const bundle: Blob = await sm.packProject();
      await new Promise<void>((resolve, reject) => {
        this.illustrationService.publishIllustration(
          this.illustration!.id!,
          bundle,
          this.illustrationTitle || this.illustration!.name
        ).subscribe({
          next: (res: any) => {
            const updated = res?.resultObject ?? res;
            if (updated?.isPublic !== undefined) {
              this.illustration!.isPublic = updated.isPublic;
              this.illustration!.publishedVersion = updated.publishedVersion;
              this.illustration!.publishedAt = updated.publishedAt;
            }
            const uid = this.illustration!.uuid ?? updated?.uuid ?? '';
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
    if (!this.illustration?.id) return;
    this.illustrationService.unpublishIllustration(this.illustration.id).subscribe({
      next: () => {
        this.illustration!.isPublic = false;
        this.notifyService.success('Illustration is now private.');
      },
      error: () => this.notifyService.error('Unpublish failed.')
    });
    this.closeContextMenu();
  }

  closePublishShareDialog(): void {
    this.showPublishShareDialog = false;
  }

  copyPublishUrl(): void {
    navigator.clipboard.writeText(this.publishShareViewUrl).then(() => {
      this.notifyService.success('Link copied!');
    });
  }

  copyEmbedCode(): void {
    navigator.clipboard.writeText(this.publishShareEmbedCode).then(() => {
      this.notifyService.success('Embed code copied!');
    });
  }

  private _setupEphemeraOverlay(): void {
    if (this._ephemeraOverlay) {
      (this.shapeManager as any).setEphemeraOverlayCanvas?.(null);
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

    (this.shapeManager as any)?.setEphemeraOverlayCanvas?.(overlay);
    this._ephemeraOverlay = overlay;
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this._cityBuildSub?.unsubscribe();
    this.autoSaveSubscription?.unsubscribe();
    this._metaFlushSub?.unsubscribe();
    this.thumbnailSaveSubscription?.unsubscribe();
    this.selectionChangedSubscription?.unsubscribe();
    this.selectionToolSubscription?.unsubscribe();
    this._sceneGraphChangedSub?.unsubscribe();
    this._rasterLayersSub?.unsubscribe();
    this._rasterActiveLayerSub?.unsubscribe();
    this._currentFrameSub?.unsubscribe();
    this._cameraCutsSub?.unsubscribe();
    this._uiEventOff?.();
    this._uiSelectionOff?.();
    this._pathEditedOff?.();
    this._stopUiTick();
    this._scene3dViewportSub?.unsubscribe?.();
    this._scene3dResizeObserver?.disconnect();
    this._artboardViewportSub?.unsubscribe?.();
    this.autoSaveService.disable();

    this._stopStreamStats();
    if (this._pkgFoldRaf != null) { cancelAnimationFrame(this._pkgFoldRaf); this._pkgFoldRaf = undefined; }
    if (this._pkgDimDebounce) clearTimeout(this._pkgDimDebounce);
    this._scene3dStopGizmoLoop();
    this._scene3dStopHandleLoop();
    if (this._textEffectAnimFrame != null) { cancelAnimationFrame(this._textEffectAnimFrame); this._textEffectAnimFrame = null; }

    this.scene3dEndPlacePick();
    this._hideCharmPreview();
    if (this.scene3dIdleEnabled && this.scene3dEditCharBodyId) {
      (this.shapeManager as any).setIdleAnimation3D?.(this.scene3dEditCharBodyId, false);
    }
    clearInterval(this._statsInterval);
    clearTimeout(this._snapFadeTimer);
    clearTimeout(this._charPreviewTimer);
    clearTimeout(this._bodyParamTimer);
    clearTimeout(this._hairParamTimer);
    clearTimeout(this._clothingParamTopTimer);
    clearTimeout(this._clothingParamBottomTimer);
    clearTimeout(this._clothingParamShoesTimer);
    clearTimeout(this._clothingParamSocksTimer);
    clearTimeout(this._clothingParamUndershirtTimer);
    clearTimeout(this._clothingParamUnderpantsTimer);
    clearTimeout(this._scene3dHtmlDebounce);
    clearTimeout(this._scene3dFlashTimer);
    clearTimeout(this._toolsSwapTimer);
    Object.values(this._eyeParamTimers).forEach(t => clearTimeout(t));

    if (this.onMouseMove) document.removeEventListener('mousemove', this.onMouseMove);
    if (this.onClick) document.removeEventListener('click', this.onClick);
    if (this.onDblClick) this.canvas?.removeEventListener('dblclick', this.onDblClick);
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    if (this.onDocMousedown) document.removeEventListener('mousedown', this.onDocMousedown);
    if (this.onPaste) document.removeEventListener('paste', this.onPaste);

    this._clearExportReminder();
    this.resetSceneState();

    if (this._ephemeraOverlay) {
      (this.shapeManager as any).setEphemeraOverlayCanvas?.(null);
      this._ephemeraOverlay.remove();
      this._ephemeraOverlayObserver?.disconnect();
      this._ephemeraOverlay = null;
      this._ephemeraOverlayObserver = null;
    }
  }

  getNodePosition(nodeId: string) { return this.shapeManager.getNodePosition(nodeId); }
  setNodePosition(nodeId: string, x?: number, y?: number) { this.shapeManager.setNodePosition(nodeId, x, y); }
  getNodeById(nodeId: string): any { return this.shapeManager.getNodeById(nodeId); }

  onNameBlur(layer: LayerTreeNode) {
    layer.name = layer.name.trim();
    this.shapeManager.setNodeName(layer.id, layer.name);
  }
  onEnter(input: HTMLInputElement, layer: LayerTreeNode) { this.onNameBlur(layer); input.blur(); }

  updateSDFText(change: Partial<{
    text: string; font: string; fontSize: number; lineHeight: number; maxWidth: number; fill: string; outline: string; outlineWidth: number; threshold: number; smoothing: number;
  }>) {
    if (!this.selectedNode) return;
    this.shapeManager.updateSDFText(this.selectedNode.id, change);
    const type = this.selectedNode.getType?.();
    if (type === 'Sticky Note') {
      if (change.text !== undefined) this.selectedNode.text.text = change.text;
    } else {
      Object.assign(this.selectedNode, change);
    }
  }

  openColorPickerFor(kind: 'fill' | 'outline'): void {
    if (kind === 'fill') this.openSDFTextColorPicker();
    else this.openSDFTextOutlineColorPicker();
  }

  isLoading = true;
  private _focusTitleOnLoad = false;
  private _startAnimationOnLoad = false;
  private loadingState = {
    renderer: false,
    illustration: false,
    sceneApplied: false
  };
  private markLoaded(key: keyof typeof this.loadingState) {
    this.loadingState[key] = true;
    if (Object.values(this.loadingState).every(Boolean)) {
      this.isLoading = false;
      this._startExportReminder();
      void this._initPixelFormat();
      this._loadCanvasGrid();
      if (this._startAnimationOnLoad) {
        this._startAnimationOnLoad = false;
        this.animationService.setAnimationEnabled(true);
        this.animationEnabled = true;
      }
      if (this._focusTitleOnLoad) {
        this._focusTitleOnLoad = false;
        setTimeout(() => {
          this.titleInputRef?.nativeElement?.select();
          this.titleInputRef?.nativeElement?.focus();
        }, 150);
      }
      // Trigger Salsa's resize → setCanvasSize path after document load.
      // Required when the canvas doesn't physically resize (e.g. fixed full-viewport
      // placement) so the raster compositor recalculates against the loaded doc.
      window.dispatchEvent(new Event('resize'));
    }
  }

  onTextChange(val: string) {
    if (!this.selectedNode) return;
    this.shapeManager.updateSDFText(this.selectedNode.id, { text: val });
    const type = this.selectedNode.getType?.();
    if (type === 'Sticky Note') this.selectedNode.text.text = val;
    else this.selectedNode.text = val;
  }

  // ---- context menu actions (renamed) ----
  newIllustrationButtonClicked(): void {
    this.closeContextMenu();
    if (!this.illustration) return;
    const newIllustration: Illustration = {
      id: 0,
      name: 'Untitled Illustration',
      description: '',
      teamId: this.illustration.teamId
    } as Illustration;

    this.illustrationService.createIllustration(newIllustration).subscribe({
      next: (res: any) => {
        if (res.resultType === ResultType.Success) {
          this.router.navigate(['/illustrate', res.resultObject.uuid]);
          this.saveThumbnailIfChanged();
        } else {
          this.notifyService.error('There was an error creating a new illustration :(');
        }
      },
      error: () => this.notifyService.error('There was an error creating a new illustration :(')
    });
  }

  duplicateIllustrationButtonClicked(): void {
    this.closeContextMenu();
    if (!this.illustration) {
      this.notifyService.error('No illustration loaded to duplicate.');
      return;
    }

    const payload = {
      name: `Copy of ${this.illustration.name}`,
      teamId: this.illustration.teamId,
      copyThumbnail: false
    };

    this.illustrationService.duplicateIllustration(this.illustration.id, payload).subscribe({
      next: (res: any) => {
        if (res.resultType === ResultType.Success) {
          const newUuid = res.resultObject.uuid;
          this.router.navigate(['/illustrate', newUuid]);
        } else {
          this.notifyService.error('There was an error duplicating the illustration :(');
        }
      },
      error: (err) => {
        console.error(err);
        this.notifyService.error('There was an error duplicating the illustration :(');
      }
    });
  }

  async setCurrentViewAsThumbnail() {
    if (!this.illustrationUid || !this.illustration || !this.shapeManager) return;
    try {
      const blob = await this.shapeManager.captureThumbnailBlob(300);
      if (this.syncMode === 2) {
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            this.localIllustrationService.updateThumbnail(this.illustration!.uuid!, reader.result as string)
              .then(() => resolve()).catch(reject);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } else {
        await firstValueFrom(this.illustrationService.uploadThumbnail(this.illustrationUid, blob, true));
      }
      this.lastSavedThumbnailJSON = this.shapeManager.getSceneGraphJSON();
      this.notifyService.success('Thumbnail updated to the current view.');
    } catch (e) {
      console.error(e);
      this.notifyService.error('Could not set the thumbnail. Try again.');
    } finally {
      this.closeContextMenu();
    }
  }

  // ── .frogmarks project file ────────────────────────────────────────────────

  frogmarksSaving = false;
  frogmarksRestoreModal: {
    currentThumbnailUrl: string;
    currentDate: string;
    fileThumbnailUrl: string;
    fileDate: string;
  } | null = null;
  private _pendingRestoreFile: File | null = null;
  private _pendingRestoreFileUuid: string | null = null;

  async frogmarksSave(): Promise<void> {
    if (this.frogmarksSaving) return;
    this.frogmarksSaving = true;
    try {
      const sm = this.shapeManager as any;

      const { default: JSZip } = await import('jszip');
      const salsaBlob: Blob = await sm.packProject();
      const zip = await JSZip.loadAsync(salsaBlob);

      zip.file('frogmarks-state.json', JSON.stringify({
        formatVersion: 1,
        packedAt: new Date().toISOString(),
        name: this.illustration?.name ?? 'Untitled',
        uuid: this.illustrationUid,
        illustrationId: this.illustration?.id ?? null,
        teamId: this.illustration?.teamId ?? null,
        deviceName: localStorage.getItem('frogmarks-device-name') ?? null,
      }, null, 2));

      try {
        const thumbBlob = await this.shapeManager.captureThumbnailBlob(300);
        if (thumbBlob) zip.file('thumbnail.png', thumbBlob);
      } catch { /* non-fatal */ }

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const safeName = (this.illustration?.name ?? 'untitled').replace(/[^a-z0-9_\-]/gi, '_');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.frogmarks`;
      a.click();
      URL.revokeObjectURL(url);
      this._startExportReminder();
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
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      const frogmarksRaw = await zip.file('frogmarks-state.json')?.async('string');
      const meta = frogmarksRaw ? JSON.parse(frogmarksRaw) : null;

      if (meta?.formatVersion > 1)
        throw new Error('This .frogmarks file requires a newer version of Frogmarks.');

      const fileUuid: string | null = meta?.uuid ?? null;
      const fileName: string = meta?.name ?? file.name;

      if (fileUuid && fileUuid !== this.illustrationUid) {
        // Different illustration — simple confirm
        const ok = window.confirm(
          `"${fileName}" is from a different illustration.\n\nThis will replace the current content of "${this.illustration?.name ?? 'this illustration'}". Continue?`
        );
        if (!ok) return;
        await this._doFrogmarksRestore(file, fileUuid);
      } else {
        // Same illustration (or no UUID in file) — show thumbnail comparison modal
        const thumbEntry = zip.file('thumbnail.png');
        const fileThumbBlob = thumbEntry ? await thumbEntry.async('blob') : null;
        const fileThumbnailUrl = fileThumbBlob ? URL.createObjectURL(fileThumbBlob) : '';
        const fileDate = meta?.packedAt
          ? new Date(meta.packedAt).toLocaleString()
          : 'Unknown date';

        const currentThumbBlob = await this.shapeManager.captureThumbnailBlob(300).catch(() => null);
        const currentThumbnailUrl = currentThumbBlob ? URL.createObjectURL(currentThumbBlob) : '';
        const currentDate = new Date().toLocaleString();

        this._pendingRestoreFile = file;
        this._pendingRestoreFileUuid = fileUuid;
        this.frogmarksRestoreModal = { currentThumbnailUrl, currentDate, fileThumbnailUrl, fileDate };
      }
    } catch (e) {
      console.error('[frogmarksLoad]', e);
      this.notifyService.error('Could not load project. The file may be corrupted or from a newer version of Frogmarks.');
    }
  }

  async confirmFrogmarksRestore(): Promise<void> {
    const file = this._pendingRestoreFile;
    const uuid = this._pendingRestoreFileUuid;
    this._closeFrogmarksRestoreModal();
    if (file) await this._doFrogmarksRestore(file, uuid);
  }

  cancelFrogmarksRestore(): void {
    this._closeFrogmarksRestoreModal();
  }

  private _closeFrogmarksRestoreModal(): void {
    if (this.frogmarksRestoreModal) {
      URL.revokeObjectURL(this.frogmarksRestoreModal.currentThumbnailUrl);
      URL.revokeObjectURL(this.frogmarksRestoreModal.fileThumbnailUrl);
    }
    this.frogmarksRestoreModal = null;
    this._pendingRestoreFile = null;
    this._pendingRestoreFileUuid = null;
  }

  private _exportReminderTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _exportReminderIntervalMs = 20 * 60 * 1000; // 20 min

  private _startExportReminder(): void {
    if (this.syncMode === 0) return;
    this._clearExportReminder();
    void this._refreshOpfsSize();
    this._exportReminderTimer = setTimeout(() => {
      this.showExportReminder = true;
    }, this._exportReminderIntervalMs);
  }

  private async _refreshOpfsSize(): Promise<void> {
    const salsaKey = this.syncMode === 2
      ? 'local-' + (this.illustrationUid ?? '')
      : (this.illustration?.id?.toString() ?? '');
    if (!salsaKey) return;
    const bytes = await this.opfsMetadataService.getSceneSizeBytes(salsaKey);
    if (bytes <= 0) { this.opfsSizeLabel = ''; return; }
    if (bytes >= 1024 * 1024) {
      this.opfsSizeLabel = (bytes / 1024 / 1024).toFixed(1) + ' MB';
    } else if (bytes >= 1024) {
      this.opfsSizeLabel = Math.round(bytes / 1024) + ' KB';
    } else {
      this.opfsSizeLabel = bytes + ' B';
    }
  }

  private _clearExportReminder(): void {
    if (this._exportReminderTimer !== null) {
      clearTimeout(this._exportReminderTimer);
      this._exportReminderTimer = null;
    }
  }

  dismissExportReminder(): void {
    this.showExportReminder = false;
    this._startExportReminder();
  }

  exportNowFromReminder(): void {
    this.showExportReminder = false;
    this._clearExportReminder();
    void this.frogmarksSave().then(() => this._startExportReminder());
  }

  openSyncModeDialog(): void {
    this.syncModePanelSelection = this.syncMode;
    this.syncModePanelStep = 'select';
    this.showSyncModePanel = true;
  }

  closeSyncModeDialog(): void {
    this.showSyncModePanel = false;
    this.syncModePanelStep = 'select';
  }

  requestSyncModeChange(): void {
    const newMode = this.syncModePanelSelection;
    if (newMode === this.syncMode) { this.closeSyncModeDialog(); return; }
    if (newMode > this.syncMode) {
      this.syncModePanelStep = 'confirm';
    } else {
      this._applySyncModeChange();
    }
  }

  async _applySyncModeChange(): Promise<void> {
    const newMode = this.syncModePanelSelection;
    this.syncMode = newMode;
    this.closeSyncModeDialog();

    if (this.illustration?.id && newMode < 2) {
      firstValueFrom(
        this.illustrationService.updateIllustration({ ...this.illustration, syncMode: newMode })
      ).catch(e => console.warn('[SyncMode] update failed', e));
    }

    this.saveNow();
  }

  private async _doFrogmarksRestore(file: File, fileUuid: string | null): Promise<void> {
    try {
      const sm = this.shapeManager as any;
      this.animationService.beginBulkRestore();
      await sm.unpackProject(file).finally(() => this.animationService.endBulkRestore());
      if (fileUuid && fileUuid !== this.illustrationUid) {
        sm.setCurrentDocId(this.illustrationUid, this.illustration?.name);
        await sm.persist?.saveNow();
      }
      this.noCloudEmptyState = false;
      this.animationService.refreshTimeline();
      this.scene3dRefreshMeshes();
      this._invalidateUploadedLayers();
      this.notifyService.success('Project loaded successfully.');
    } catch (e) {
      console.error('[frogmarksLoad]', e);
      this.notifyService.error('Could not load project. The file may be corrupted or from a newer version of Frogmarks.');
    }
  }

  // ── GARP Skins ────────────────────────────────────────────────────────────

  scene3dToggleGarpPanel(): void {
    this.garpPanelOpen = !this.garpPanelOpen;
    if (this.garpPanelOpen) this._refreshGarpPools();
  }

  private _refreshGarpPools(): void {
    const sm = this.shapeManager as any;
    const rawPools: any[] = sm.garp?.listPools?.() ?? [];
    this.garpPools = rawPools.map((p: any) => {
      // listPools() returns skins as a count (number); getPool() may return the full skin list
      const full = sm.garp?.getPool?.(p.id);
      const skinsRaw = Array.isArray(full?.skins) ? full.skins
                     : Array.isArray(p.skins)      ? p.skins
                     : [];
      return { ...p, skins: skinsRaw };
    });
    if (this.garpPools.length > 0 && !this.garpPools.find((p: any) => p.id === this.garpActivePoolId)) {
      this.garpActivePoolId = this.garpPools[0].id;
    }
  }

  get garpActivePool(): { id: string; name: string; slots: Array<{ name: string; live: boolean }>; skins: Array<{ name: string }> } | null {
    return this.garpPools.find(p => p.id === this.garpActivePoolId) ?? null;
  }

  get garpCanSave(): boolean {
    return !!this.garpNewSkinName.trim() && !this.garpSaving && Object.keys(this.garpSlotSources).length > 0;
  }

  async garpUploadSlotImage(slotName: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.garpSlotSources = { ...this.garpSlotSources, [slotName]: reader.result as string };
    };
    reader.readAsDataURL(file);
  }

  async garpUseCanvas(slotName: string): Promise<void> {
    const sm = this.shapeManager as any;
    const dataUrl: string | null = await sm.exportActiveLayerDataUrl?.() ?? null;
    if (!dataUrl) { console.warn('[GARP] exportActiveLayerDataUrl: no active raster layer'); return; }
    this.garpSlotSources = { ...this.garpSlotSources, [slotName]: dataUrl };
  }

  garpGetSlotRegions(slotName: string): Array<{ label: string; u0: number; v0: number; u1: number; v1: number }> {
    const key = `${this.garpActivePoolId}:${slotName}`;
    if (!this.garpSlotRegionsCache[key]) {
      const sm = this.shapeManager as any;
      this.garpSlotRegionsCache[key] = sm.garpSlotRegions3D?.(this.garpActivePoolId, slotName) ?? [];
    }
    return this.garpSlotRegionsCache[key];
  }

  garpStartPaint(slotName: string): void {
    const sm = this.shapeManager as any;
    const meshId: string | null = sm.paintGarpSlot3D?.(this.garpActivePoolId, slotName) ?? null;
    if (!meshId) return;
    this.garpPaintMeshId = meshId;
    this.garpPaintSlot = slotName;
    this.garpPaintSkinName = '';
    // Open UV Editor on the paint preview so the user can see what they're painting
    this.scene3dSelectedMeshId = meshId;
    this.openUVEditor();
  }

  async garpSaveFromPaint(): Promise<void> {
    if (!this.garpPaintMeshId || this.garpSaving) return;
    const name = this.garpPaintSkinName.trim();
    if (!name) return;
    const pool = this.garpActivePool;
    const existingNames = (Array.isArray(pool?.skins) ? pool.skins : []).map((s: any) => s.name as string);
    if (existingNames.includes(name)) {
      if (!confirm(`A skin named "${name}" already exists. Overwrite?`)) return;
    }
    this.garpSaving = true;
    try {
      const sm = this.shapeManager as any;
      const errs: string[] = await sm.saveMeshAsGarpSkin3D?.(this.garpPaintMeshId, name) ?? [];
      if (errs.length) console.warn('[GARP] saveMeshAsGarpSkin3D warnings:', errs);
      this.garpPaintMeshId = null;
      this.garpPaintSlot = null;
      this.garpPaintSkinName = '';
      this.closeUVEditor();
      this._refreshGarpPools();
      this.scene3dMarkDirty();
    } finally {
      this.garpSaving = false;
    }
  }

  garpCancelPaint(): void {
    (this.shapeManager as any).cancelGarpPaint3D?.();
    this.garpPaintMeshId = null;
    this.garpPaintSlot = null;
    this.garpPaintSkinName = '';
    this.closeUVEditor();
  }

  async garpSaveSkin(): Promise<void> {
    const name = this.garpNewSkinName.trim();
    if (!name || !this.garpActivePoolId || this.garpSaving) return;
    const pool = this.garpActivePool;
    if (!pool) return;

    const slots: Record<string, { kind: 'image'; dataUrl: string }> = {};
    for (const slot of pool.slots) {
      const src = this.garpSlotSources[slot.name];
      if (src) slots[slot.name] = { kind: 'image', dataUrl: src };
    }
    if (Object.keys(slots).length === 0) return;

    const existingNames = (Array.isArray(pool.skins) ? pool.skins : []).map((s: any) => s.name as string);
    if (existingNames.includes(name)) {
      if (!confirm(`A skin named "${name}" already exists. Overwrite?`)) return;
    }

    this.garpSaving = true;
    try {
      const sm = this.shapeManager as any;
      const errs: string[] = await sm.addGarpSkin3D?.(this.garpActivePoolId, name, slots) ?? [];
      if (errs.length) console.warn('[GARP] addGarpSkin3D warnings:', errs);
      this.garpNewSkinName = '';
      this.garpSlotSources = {};
      this._refreshGarpPools();
      this.scene3dMarkDirty();
    } finally {
      this.garpSaving = false;
    }
  }

  async garpDeleteSkin(poolId: string, skinName: string): Promise<void> {
    if (!confirm(`Delete skin "${skinName}"?`)) return;
    const sm = this.shapeManager as any;
    await sm.removeGarpSkin3D?.(poolId, skinName);
    this._refreshGarpPools();
    this.scene3dMarkDirty();
  }

  garpRegenerateCity(): void {
    (this.shapeManager as any).world?.updateCity(this._worldParams());
    this.scene3dMarkDirty();
  }
}
