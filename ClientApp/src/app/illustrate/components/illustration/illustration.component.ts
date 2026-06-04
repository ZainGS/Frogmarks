import { Component, OnInit, ViewChild, HostListener, ElementRef, NgZone } from '@angular/core';
import JSZip from 'jszip';
import { ActivatedRoute, Router } from '@angular/router';
import { ResultType } from '../../../shared/models/error-result.model';

import { IllustrationService, IllustrationStateDto, AnimationStateDto, LayerStateDto, CelStateDto } from 'app/shared/services/illustrate/illustration.service';
import { OpfsMetadataService } from 'app/shared/services/illustrate/opfs-metadata.service';
import { LocalIllustrationService } from 'app/shared/services/illustrate/local-illustration.service';
import { FrogFileService, FrogImportResult } from 'app/shared/services/illustrate/frog-file.service';

import { Illustration } from 'app/illustrate/models/illustration.model';

import ShapeManager from '@zaings/salsa/shape-manager';
import WorldManager from '@zaings/salsa/world-manager';
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering } from '@zaings/salsa';

import { ShapeType } from '../../../shared/enums/shape-type';
import { auditTime, debounceTime, distinctUntilChanged, filter, firstValueFrom, map, Subject, Subscription } from 'rxjs';
import { ColorPickerComponent } from 'app/shared/components/color-picker/color-picker.component';

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
export class IllustrationComponent implements OnInit {

  private routeSub?: Subscription;
  private _scene3dViewportSub: any = null;
  private _scene3dResizeObserver: ResizeObserver | null = null;

  @ViewChild('webgpuCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('handleCanvas') handleCanvasRef!: ElementRef<HTMLCanvasElement>;
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
  @HostListener('document:keydown.escape') onEsc() { this.closeContextMenu(); }
  @HostListener('document:keydown', ['$event']) onCtrlSnapKeyDown(e: KeyboardEvent) {
    if (e.key === 'Control') this.scene3dSnapActive = true;
  }
  @HostListener('document:keyup', ['$event']) onCtrlSnapKeyUp(e: KeyboardEvent) {
    if (e.key === 'Control') this.scene3dSnapActive = false;
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
  isCommentPanelActive = false;

  selectedPenColor = '#9B59B6';
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

  selectedStamp = 'assets/stamps/star.png';
  selectedStampColor = '#FFFFFF';
  selectedStampSize = 0.10;

  stampPalette: string[] = [
    'assets/stamps/star.png',
    'assets/stamps/heart.png',
    'assets/stamps/check.png',
    'assets/stamps/arrow.png',
    'assets/stamps/circle.png',
    'assets/stamps/x.png',
    'assets/stamps/thumbs_up.png',
    'assets/stamps/icecream/icecream_strawberry.png'
  ];

  iceCreamStamps: string[] = [
    'assets/stamps/icecream/icecream_chocolate.png',
    'assets/stamps/icecream/icecream_chocolate2.png',
    'assets/stamps/icecream/icecream_matcha.png',
    'assets/stamps/icecream/icecream_matcha2.png',
    'assets/stamps/icecream/icecream_strawberry.png',
    'assets/stamps/icecream/icecream_strawberry2.png',
    'assets/stamps/icecream/icecream_vanilla.png',
    'assets/stamps/icecream/icecream_vanilla2.png'
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

  showShapeColorPicker = false;
  shapeColor = '#fff';
  shapeHexInputDraft: string = this.bgColor.replace('#', '');

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
      console.log('[ImageImport] Created new layer:', layerId);
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
      console.log('[ImageImport] Dropped image → new layer:', layerId);
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
        this._scene3dAutoScale(meshes);
        this.scene3dRefreshMeshes();
        this.scene3dSelectMesh(meshes[0].id ?? meshes[0].nodeId);
        this.scene3dMarkTexLibDirty(); // GLTF may embed textures into the library
      }
    } else if (ext === 'obj') {
      const mesh = await sm.importObjFile3D?.(0, 0, 0, file);
      if (mesh) {
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
  liveTextEffectChain: TextEffectEntry[] = [];
  liveTextIsEditing: boolean = false;
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

  // Rotation drag readout
  scene3dDragAngleDeg: number | null = null;
  scene3dDragLabelPos: { x: number; y: number } | null = null;
  private _scene3dGizmoRafId: number | null = null;

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

  // Phase 4: shadows
  scene3dShadowsEnabled = false;
  scene3dShadowMapSize = 1024;
  scene3dShadowExtent = 15;
  scene3dShadowBias = 0.002;

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
  // Bucket state — persisted per group ID in the illustration save
  scene3dAllGroupBuckets: Record<string, string[][]> = {};
  scene3dBucketSelections: string[] = []; // per-bucket dropdown selection (transient)

  // ── Vector / Ephemera state ────────────────────────────────
  activeVectorLayerId: string | null = null;

  onVectorLayerSelected(id: string | null): void {
    this.activeVectorLayerId = id;
    const sm = this.shapeManager as any;
    sm?.webgpuRenderer?.setActiveVectorLayerId?.(id);
  }

  closeEphemeraPanel(): void {
    this.activeVectorLayerId = null;
    const sm = this.shapeManager as any;
    sm?.setActiveVectorLayer?.(null);
    sm?.webgpuRenderer?.setActiveVectorLayerId?.(null);
  }

  // Ribbon mesh
  // ── Armature state ─────────────────────────────────────────
  scene3dArmaturePanelOpen = false;

  openArmaturePanel(): void {
    this.scene3dArmaturePanelOpen = true;
    this.scene3dDeactivateArrayTool();
    this.scene3dGizmoMode = null;
    const sm = this.shapeManager as any;
    sm.scene3d?.setGizmoMode?.(null);
    sm.setGizmoMode3D?.(null);
  }

  closeArmaturePanel(): void {
    this.scene3dArmaturePanelOpen = false;
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

  enterMeshEditMode(): void {
    if (!this.scene3dSelectedMeshId) return;
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

  // Scene background / skybox
  scene3dBgMode: 'none' | 'solid' | 'gradient' | 'wavy' = 'none';
  scene3dBgColor1 = '#1a1a2e';
  scene3dBgColor2 = '#99aabb';

  // Fog
  scene3dFogMode: 'off' | 'linear' | 'exponential' = 'off';
  scene3dFogColor = '#cccccc';
  scene3dFogNear = 5;
  scene3dFogFar = 20;
  scene3dFogDensity = 0.08;

  // Texture sampling
  scene3dTextureFilter: 'nearest' | 'linear' = 'nearest';

  // Lighting (spec defaults)
  scene3dLightDirX = 0.3;
  scene3dLightDirY = -0.8;
  scene3dLightDirZ = -0.5;
  scene3dLightIntensity = 1.0;
  scene3dAmbientR = 0.15;
  scene3dAmbientG = 0.15;
  scene3dAmbientB = 0.2;
  scene3dAmbientIntensity = 1.0;

  // Mesh list from engine
  scene3dMeshes: Array<any> = [];

  // Selected mesh
  scene3dSelectedMeshId: string | null = null;
  scene3dMeshPosX = 0; scene3dMeshPosY = 0; scene3dMeshPosZ = 0;
  scene3dMeshRotX = 0; scene3dMeshRotY = 0; scene3dMeshRotZ = 0;
  scene3dMeshScaleX = 1; scene3dMeshScaleY = 1; scene3dMeshScaleZ = 1;
  scene3dMeshColor = '#ffffff';
  scene3dMeshOpacity = 1.0;

  // -- Multi-material submesh slots
  scene3dSubmeshes: Array<{ label: string; color: string; opacity: number; renderStyle: string }> = [];

  // -- Snap indicator
  scene3dSnapActive = false;
  scene3dSnapGridSize = 1.0;
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

    if (this._toolsSwapTimer) { clearTimeout(this._toolsSwapTimer); this._toolsSwapTimer = null; }
    if (selected) {
      this._scene3dLoadSnapSettings();
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
        });
        this._scene3dResizeObserver.observe(this.canvas);
      }
    } else {
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
  }

  scene3dRefreshMeshes(): void {
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
  }

  // Polygon / circle creation forms
  scene3dShowPolygonForm = false;
  scene3dShowCircleForm = false;
  scene3dPolygonSides = 6;
  scene3dPolygonRadius = 0.5;
  scene3dPolygonHeight = 0.2;
  scene3dCircleRadius = 0.5;
  scene3dCircleSegments = 16;
  scene3dCircleHeight = 0.2;

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

  scene3dSelectMesh(id: string): void {
    this.scene3dRenamingId = null;
    this._scene3dHideHandles();
    if (this.scene3dIsEditingMesh && id !== this.scene3dSelectedMeshId) {
      this.exitMeshEditMode();
    }
    this.scene3dSelectedMeshId = id;
    // Reset per-mesh state so switching between mesh types clears the flags
    this.scene3dSelectedIsGroup = false;
    this.scene3dIsArrayGroup = false;
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
    (this.shapeManager as any).setSelectedNode?.(id);
    // Detect array group before normal mesh loading — array groups use a separate panel
    if ((this.shapeManager as any).isArrayGroup3D?.(id)) {
      this.scene3dIsArrayGroup = true;
      this.scene3dSelectedIsGroup = true;
      this._scene3dSyncArrayPanel(id);
      return;
    }
    this.scene3dSelectedIsGroup = !!s3d.getMeshGroup?.(id);
    const mesh = s3d.getMesh(id);
    if (mesh) {
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
      this.scene3dRenderStyle = (mesh.material?.renderStyle ?? 'default') as any;
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
    }
  }

  scene3dCanvasPointerMove(event: PointerEvent): void {
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
    if (this._scene3dActiveDragIndex === null) return;
    (this.shapeManager as any).endRibbonHandleDrag3D?.(this.scene3dSelectedMeshId!, this._scene3dActiveDragIndex);
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

  scene3dDeleteMesh(id: string): void {
    (this.shapeManager as any).scene3d?.deleteMesh?.(id);
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
      this.scene3dRefreshMeshes();
      this.scene3dSelectMesh(copy.id ?? copy.nodeId);
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
  scene3dRenderStyle: 'default' | 'cel' | 'sketch' | 'ink' = 'default';

  scene3dSetRenderStyle(style: 'default' | 'cel' | 'sketch' | 'ink'): void {
    if (!this.scene3dSelectedMeshId) return;
    this.scene3dRenderStyle = style;
    (this.shapeManager as any).setRenderStyle3D?.(this.scene3dSelectedMeshId, style);
    this.scene3dMarkDirty();
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
    this.scene3dSnapGridSize = sm.snapGridSize3D ?? 1.0;
    this.scene3dSnapAngleDeg = Math.round(((sm.snapAngle3D ?? (Math.PI / 12)) * 180 / Math.PI) * 10) / 10;
    this.scene3dSnapScaleStep = sm.snapScaleStep3D ?? 0.25;
  }

  scene3dUpdateSnapSettings(): void {
    const sm = this.shapeManager as any;
    sm.snapGridSize3D   = this.scene3dSnapGridSize;
    sm.snapAngle3D      = this.scene3dSnapAngleDeg * Math.PI / 180;
    sm.snapScaleStep3D  = this.scene3dSnapScaleStep;
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
    const sm = this.shapeManager as any;
    console.log('[gizmo-orientation] method exists:', typeof sm.setGizmoOrientation3D);
    console.log('[gizmo-orientation] before:', sm.getGizmoOrientation3D?.());
    sm.setGizmoOrientation3D?.(this.scene3dGizmoOrientation);
    console.log('[gizmo-orientation] after:', sm.getGizmoOrientation3D?.());
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
  }

  scene3dDeactivateArrayTool(): void {
    if (!this.scene3dArrayToolActive) return;
    this.scene3dArrayToolActive = false;
    (this.shapeManager as any).disableArrayTool?.();
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
      'Convert to independent meshes? The copies will no longer update when the source changes. (Undo will restore the linked array.)'
    );
    if (!confirmed) return;
    (this.shapeManager as any).bakeArray3D?.(this.scene3dSelectedMeshId);
    this.scene3dIsArrayGroup = false;
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
    }
  }

  scene3dRedo(): void {
    const sm = this.shapeManager as any;
    if (sm.canRedo3D) {
      sm.redo3D?.();
      this.scene3dRefreshMeshes();
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
    this.scene3dMarkDirty();
  }

  scene3dSetFrustumCulling(enabled: boolean): void {
    this.scene3dFrustumCulling = enabled;
    const sm = this.shapeManager as any;
    if (sm.scene3d) sm.scene3d.frustumCulling = enabled;
    if ('frustumCulling3D' in sm) sm.frustumCulling3D = enabled;
    this.scene3dMarkDirty();
  }

  scene3dApplyPS1(): void {
    (this.shapeManager as any).scene3d?.setPS1Config({
      vertexJitter: +this.scene3dPS1Jitter,
      snapGridSize: +this.scene3dPS1Snap,
      affineWarp: +this.scene3dPS1Affine,
      colorDepth: +this.scene3dPS1ColorDepth,
    });
    this.scene3dMarkDirty();
  }

  scene3dApplyLighting(): void {
    const s3d = (this.shapeManager as any).scene3d;
    if (!s3d) return;
    s3d.setDirectionalLight(
      +this.scene3dLightDirX, +this.scene3dLightDirY, +this.scene3dLightDirZ,
      1, 1, 1, +this.scene3dLightIntensity);
    s3d.setAmbientLight(
      +this.scene3dAmbientR, +this.scene3dAmbientG, +this.scene3dAmbientB,
      +this.scene3dAmbientIntensity);
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
  showPublishShareDialog = false;
  publishShareViewUrl = '';
  publishShareEmbedCode = '';

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

    // WebGPU bootstrap
    if (!isRendererLive) {
      await startWebGPURendering('webgpuCanvas').then(() => this.afterRendererBoot());
    } else {
      await reinitializeWebGPURendering('webgpuCanvas').then(() => this.afterRendererBoot());
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
      if (this.selectedShapeType) this.shapeManager.updatePreviewShapePosition(event);
      // Update raster brush cursor position
      if (this.showBrushCursor) {
        this.brushCursorX = event.clientX;
        this.brushCursorY = event.clientY;
      }
    };
    document.addEventListener('mousemove', this.onMouseMove);

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
      // Live Text tool — place or re-select LiveTextNode
      if (this.controlPanelActiveTool === 'live-text') {
        if (this.liveTextIsEditing) {
          // Click away — end editing on current node
          this.endLiveTextEditing();
        } else {
          // Check if click hit an existing LiveTextNode (Salsa selects it via
          // hit-test before this handler runs). If so, enter edit mode on it
          // instead of creating a new node.
          const selectedIds = this._getSelectedShapeIds();
          const hitNodeId = selectedIds.length === 1 ? selectedIds[0] : null;
          const hitLiveText = hitNodeId ? (this.shapeManager as any).getLiveTextNode?.(hitNodeId) : null;
          if (hitLiveText) {
            this.liveTextNodeId = hitNodeId;
            this._syncLiveTextSidebar(hitNodeId!);
            (this.shapeManager as any).beginLiveTextEditing?.(hitNodeId);
            this.liveTextIsEditing = true;
          } else {
            const worldPos = (this.shapeManager as any).interactionService?.toWorldCoords?.(event);
            if (worldPos) this.placeLiveText(worldPos.x, worldPos.y);
          }
        }
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
        sm.beginLiveTextEditing?.(nodeId);
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

  private afterRendererBoot() {
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

    this.loadPolygonPresets();
    this.markLoaded('renderer');

    // Must run before any render frame — enables the preRenderCallback that syncs
    // the 2D illustration camera to the 3D orthographic projection each frame.
    (this.shapeManager as any).enableAutoSyncIllustrationCamera3D?.();

    const sceneAppliedOnce = this.shapeManager.interactionService.onSceneGraphChanged
      .subscribe(() => {
        this.markLoaded('sceneApplied');
        sceneAppliedOnce.unsubscribe();
        if (!this.isViewerMode && !this.illustration?.isCustomThumbnail) {
          this.saveThumbnail();
        }
      });

    this.selectionChangedSubscription = this.shapeManager.interactionService.onSelectionChanged.subscribe((selectedIds: string[]) => {
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

    this.shapeManager.interactionService.onSceneGraphChanged.subscribe(() => {
      const currentSceneJSON = this.shapeManager.getSceneGraphJSON();
      const parsed = JSON.parse(currentSceneJSON);
      this.layerTree = this.buildLayerTree(parsed.root);
      this.refreshRasterLayers();
      this.sceneChanged$.next(currentSceneJSON);

      // Array panel: re-sync params when gizmo drags update an active array group
      if (this.scene3dIsArrayGroup && this.scene3dSelectedMeshId) {
        this._scene3dSyncArrayPanel(this.scene3dSelectedMeshId);
      }

      // Array tool: sync count drift from scroll wheel; sync radial params if in radial mode
      if (this.scene3dArrayToolActive) {
        const liveCount = (this.shapeManager as any).getArrayToolCount?.();
        if (typeof liveCount === 'number') this.scene3dArrayToolCount = liveCount;
        if (this.scene3dArrayToolMode === 'radial') this._scene3dSyncRadialToolStrip();
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
    });

    this.rasterBrushService.layers$.subscribe(layers => {
      this.rasterLayers = Array.isArray(layers) ? layers : [];
      const selectedIsRaster = this.rasterLayers.some((layer: any) => layer.id === this.selectedRasterLayerId && layer.type === 'layer');
      if (!selectedIsRaster) {
        this.selectedRasterLayerId = this.rasterLayers.find((layer: any) => layer.type === 'layer')?.id ?? null;
      }
    });

    // Keep selectedRasterLayerId in sync with the raster-layers panel
    this.rasterBrushService.activeLayerId$.subscribe(id => {
      this.selectedRasterLayerId = id;
    });

    // Keep current animation frame in sync for menu helpers
    this.animationService.currentFrame$.subscribe(f => {
      this._currentAnimFrame = f;
    });

    // Subscribe to raster stroke end to trigger auto-save (raster drawing bypasses scene graph events)
    try {
      const rasterSub = (this.shapeManager as any).onRasterStrokeEnd?.(async () => {
        if (!this.illustration) return;
        // Mark the painted layer dirty so uploadPixelData re-uploads only it
        if (this.selectedRasterLayerId) {
          this._dirtyLayerIds.add(this.selectedRasterLayerId);
        }
        // Notify OPFS auto-save service of stroke end
        this.autoSaveService.notifyStrokeEnd();
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
      (this.shapeManager as any).clearDocumentSize?.();
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
        console.log(e);
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
          this.layerTree!.children = this.pruneDeletedLayers(this.layerTree!.children, this.selectedLayerIds);
          this.shapeManager.deleteSelectedShapes();
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
    this._addRecentColor(c);
  }
  onColorPickerSelection(c: string) { this.selectedPenColor = c; this.shapeManager.setStrokeColor(c); this._syncPersistentPickerFromHex(c); this._addRecentColor(c); }

  // ── Persistent (always-visible) color picker ──────────────────
  persistentHue = 0;
  persistentSbX = 100;
  persistentSbY = 0;
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
    const upHandler = () => { this._hueSelecting = false; document.removeEventListener('mousemove', moveHandler); document.removeEventListener('mouseup', upHandler); this._addRecentColor(this.selectedPenColor); };
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
    const upHandler = () => { this._sbSelecting = false; document.removeEventListener('mousemove', moveHandler); document.removeEventListener('mouseup', upHandler); this._addRecentColor(this.selectedPenColor); };
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
      this._addRecentColor(hex);
    }
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

  setActiveTool(activeTool: string, event?: MouseEvent) {
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
    if (this.controlPanelActiveTool === 'shape:square') this.setPreviewShapeSelected(ShapeType.Rectangle, event!);
    else if (this.controlPanelActiveTool === 'shape:circle') this.setPreviewShapeSelected(ShapeType.Circle, event!);
    else if (this.controlPanelActiveTool === 'shape:triangle') this.setPreviewShapeSelected(ShapeType.Triangle, event!);
    else if (this.controlPanelActiveTool === 'shape:polygon') {
      (this.shapeManager as any).defaultPolygonSides = this.defaultPolygonSides;
      this.setPreviewShapeSelected(ShapeType.Polygon, event!);
    }
    else this.setPreviewShapeSelected(null, event!);

    // Freeform polygon drawing
    this.controlPanelActiveTool === 'polygon:freeform'
      ? this.shapeManager.enablePolygonDrawing?.()
      : this.shapeManager.disablePolygonDrawing?.();

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
    } else {
      // End editing when switching away from live text
      if (this.liveTextIsEditing) this.endLiveTextEditing();
    }

    // ── Panel Layout tool ──
    if (this.controlPanelActiveTool === 'panel-layout') {
      (this.shapeManager as any).enablePanelLayoutTool?.();
    } else {
      (this.shapeManager as any).disablePanelLayoutTool?.();
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

  private _hexToRgba01(hex: string): { r: number; g: number; b: number; a: number } {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255,
      a: 1,
    };
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
      console.log('[TextEffect] preview created', result.width, '×', result.height);
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
    const success = await sm.stampEffectedText(destX, destY, capture, this._buildEffectChain());
    console.log('[TextEffect] stamped:', success);
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
    const h = this.liveTextColor.replace('#', '');
    const node = sm.createLiveText(worldX, worldY, {
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
      effects: this._buildLiveTextEffects(),
    });
    if (node) {
      this.liveTextNodeId = node.id ?? node.getId?.();
      sm.beginLiveTextEditing?.(this.liveTextNodeId);
      this.liveTextIsEditing = true;
    }
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
    if (node.textColor) this.liveTextColor = this._rgba01ToHex(node.textColor);
    if (node.maxWidth != null) this.liveTextMaxWidth = node.maxWidth;
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
    console.log('[PanelLayout] created', this.activePanelLayoutId);
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
  closeEditMenu(): void {
    this.closeAllMenus();
  }
  closeAllMenus(): void {
    this.showFileMenu = false;
    this.showEditMenu = false;
    this.showAnimationMenu = false;
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
    console.log('[V2 Save] ditherConfig:', this.ditherConfig.enabled,
      'layers with dither:', state.layers.filter(l => (l.ditherConfig as any)?.enabled).length);

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
      lightDirX: this.scene3dLightDirX, lightDirY: this.scene3dLightDirY, lightDirZ: this.scene3dLightDirZ,
      lightIntensity: this.scene3dLightIntensity,
      ambientR: this.scene3dAmbientR, ambientG: this.scene3dAmbientG, ambientB: this.scene3dAmbientB,
      ambientIntensity: this.scene3dAmbientIntensity,
      ps1Jitter: this.scene3dPS1Jitter, ps1Snap: this.scene3dPS1Snap,
      ps1Affine: this.scene3dPS1Affine, ps1ColorDepth: this.scene3dPS1ColorDepth,
      frustumCulling: this.scene3dFrustumCulling,
      animSyncWithTimeline: this.scene3dAnimSyncWithTimeline,
      animStartFrame: this.scene3dAnimStartFrame,
      animEndFrame: this.scene3dAnimEndFrame,
      animFps: this.scene3dAnimFps,
      animLoop: this.scene3dAnimLoop,
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
      console.log('[V2 Save] state saved successfully');
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

    const counts = await Promise.all(layers.map(uploadLayer));
    const uploaded = counts.reduce((a, b) => a + b, 0);

    // Mark uploaded layers clean (only remove IDs from the snapshot, preserving any added during upload)
    for (const id of dirtySnapshot) {
      this._dirtyLayerIds.delete(id);
      this._uploadedLayerIds.add(id);
    }
    // Register any newly seen layers as uploaded (first save after load, all layers are clean)
    for (const layer of layers) {
      this._uploadedLayerIds.add(layer.layerId);
    }

    console.log(`[V2 Save] pixel data uploads complete: ${uploaded}/${layers.length} layer(s)`);
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
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
      return;
    }

    if (!this.illustration?.id) {
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
      return;
    }

    // ── Pending .frog import (from dashboard) ──
    if (this.frogFileService.pendingImport) {
      console.log('[V2 Load] applying pending .frog import');
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
    const opfsMetaSavedAt = opfsMeta?.savedAt ?? 0;
    const backendSavedAt = savedAtRes?.savedAt ?? 0;
    console.log(`[V2 Load] OPFS pixels savedAt=${opfsSavedAt}, OPFS meta savedAt=${opfsMetaSavedAt}, Backend savedAt=${backendSavedAt}`);

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
        console.log('[V2 Load] Backend state fetched');
      } catch (e) {
        console.warn('[V2 Load] loadState failed', e);
      }
    }

    console.log(`[V2 Load] Decision: ${useOpfs ? 'OPFS (fully local)' : 'Backend'}`);

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
          console.log('[V2 Load] ✅ loadDocument() restored from OPFS, layers:', result.layers.length);

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
              if (effectiveMeta) console.log('[V2 Load] No OPFS meta — using backend state for extended metadata');
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
              console.timeLog('[V2 Load] total', 'scene3d-restore-done');
            } catch (e) {
              console.warn('[V2 Load] Failed to restore 3D node state from OPFS meta', e);
            }
          }
          console.timeEnd('[V2 Load] total');
          requestAnimationFrame(() => this.markLoaded('sceneApplied'));
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
      console.log('[V2 Load] no-cloud mode — no OPFS data on this device');
      this.noCloudEmptyState = true;
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
      return;
    }

    // OPFS was chosen but loadDocument() failed — need the full state now
    if (useOpfs && !stateRes) {
      try {
        stateRes = await firstValueFrom(this.illustrationService.loadState(this.illustration.id));
        console.log('[V2 Load] OPFS failed — fetched full backend state as fallback');
      } catch (e) {
        console.warn('[V2 Load] loadState fallback failed', e);
      }
    }

    const state: IllustrationStateDto | null = stateRes?.resultObject ?? null;

    // ── V2 path ──
    if (state && state.version >= 2 && state.layers?.length > 0) {
      console.log('[V2 Load] restoring v2 state, layers:', state.layers.length,
        state.layers.map(l => ({ id: l.layerId, pixelDataUrl: l.pixelDataUrl, animated: l.animated,
          cels: l.cels?.map(c => ({ celId: c.celId, pixelDataUrl: c.pixelDataUrl })) })));

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
      console.log(`[V2 Load] importPayload: ${importPayload.length} layer(s) to import`, importPayload.map(p => p.id));
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
          console.timeLog('[V2 Load] total', 'scene3d-restore-done');
        } catch (e) {
          console.warn('[V2 Load] Failed to restore 3D node state', e);
        }
      }

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
      if (s.shadowsEnabled) {
        s3d?.enableShadows?.(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias)
          ?? sm.enableShadows3D?.(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias);
      } else {
        s3d?.disableShadows?.() ?? sm.disableShadows3D?.();
      }
    }
    if (s.lightDirX !== undefined || s.lightIntensity !== undefined) {
      this.scene3dLightDirX = s.lightDirX ?? this.scene3dLightDirX;
      this.scene3dLightDirY = s.lightDirY ?? this.scene3dLightDirY;
      this.scene3dLightDirZ = s.lightDirZ ?? this.scene3dLightDirZ;
      this.scene3dLightIntensity = s.lightIntensity ?? this.scene3dLightIntensity;
      this.scene3dAmbientR = s.ambientR ?? this.scene3dAmbientR;
      this.scene3dAmbientG = s.ambientG ?? this.scene3dAmbientG;
      this.scene3dAmbientB = s.ambientB ?? this.scene3dAmbientB;
      this.scene3dAmbientIntensity = s.ambientIntensity ?? this.scene3dAmbientIntensity;
      s3d?.setDirectionalLight?.(
        this.scene3dLightDirX, this.scene3dLightDirY, this.scene3dLightDirZ,
        1, 1, 1, this.scene3dLightIntensity);
      s3d?.setAmbientLight?.(
        this.scene3dAmbientR, this.scene3dAmbientG, this.scene3dAmbientB, this.scene3dAmbientIntensity);
    }
    if (s.ps1Jitter !== undefined || s.ps1Snap !== undefined) {
      this.scene3dPS1Jitter = s.ps1Jitter ?? this.scene3dPS1Jitter;
      this.scene3dPS1Snap = s.ps1Snap ?? this.scene3dPS1Snap;
      this.scene3dPS1Affine = s.ps1Affine ?? this.scene3dPS1Affine;
      this.scene3dPS1ColorDepth = s.ps1ColorDepth ?? this.scene3dPS1ColorDepth;
      s3d?.setPS1Config?.({
        vertexJitter: this.scene3dPS1Jitter, snapGridSize: this.scene3dPS1Snap,
        affineWarp: this.scene3dPS1Affine, colorDepth: this.scene3dPS1ColorDepth,
      });
    }
    if (s.frustumCulling !== undefined) this.scene3dSetFrustumCulling(s.frustumCulling);
    if (s.animSyncWithTimeline !== undefined) this.scene3dAnimSyncWithTimeline = s.animSyncWithTimeline;
    if (s.animStartFrame !== undefined) this.scene3dAnimStartFrame = s.animStartFrame;
    if (s.animEndFrame !== undefined) this.scene3dAnimEndFrame = s.animEndFrame;
    if (s.animFps !== undefined) this.scene3dAnimFps = s.animFps;
    if (s.animLoop !== undefined) this.scene3dAnimLoop = s.animLoop;
    this.scene3dApplyAnimationConfig();
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
    console.log('[V2 Load] dither config restored:', this.ditherConfig.enabled ? 'ENABLED' : 'disabled', this.ditherConfig.algorithm);
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

  returnToDashboard() { this.router.navigate(['/dashboard']); }

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

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.autoSaveSubscription?.unsubscribe();
    this._metaFlushSub?.unsubscribe();
    this.thumbnailSaveSubscription?.unsubscribe();
    this.selectionChangedSubscription?.unsubscribe();
    this.selectionToolSubscription?.unsubscribe();
    this.autoSaveService.disable();

    if (this.onMouseMove) document.removeEventListener('mousemove', this.onMouseMove);
    if (this.onClick) document.removeEventListener('click', this.onClick);
    if (this.onDblClick) this.canvas?.removeEventListener('dblclick', this.onDblClick);
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    if (this.onDocMousedown) document.removeEventListener('mousedown', this.onDocMousedown);
    if (this.onPaste) document.removeEventListener('paste', this.onPaste);

    this._clearExportReminder();
    this.resetSceneState();
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
    this._exportReminderTimer = setTimeout(() => {
      this.showExportReminder = true;
    }, this._exportReminderIntervalMs);
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
}
