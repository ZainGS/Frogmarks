import { Component, OnInit, ViewChild, HostListener, ElementRef, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ResultType } from '../../../shared/models/error-result.model';

import { IllustrationService, IllustrationStateDto, AnimationStateDto, LayerStateDto, CelStateDto } from 'app/shared/services/illustrate/illustration.service';
import { FrogFileService, FrogImportResult } from 'app/shared/services/illustrate/frog-file.service';

import { Illustration } from 'app/illustrate/models/illustration.model';

import ShapeManager from '@zaings/salsa/shape-manager';
import WorldManager from '@zaings/salsa/world-manager';
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering } from '@zaings/salsa';

import { ShapeType } from '../../../shared/enums/shape-type';
import { auditTime, distinctUntilChanged, filter, firstValueFrom, map, Subject, Subscription } from 'rxjs';
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

@Component({
  selector: 'app-illustration',
  standalone: false,
  templateUrl: './illustration.component.html',
  styleUrl: './illustration.component.scss'
})
export class IllustrationComponent implements OnInit {

  private routeSub?: Subscription;

  @ViewChild('webgpuCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
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

  toggleAnimationMode(): void {
    this.animationEnabled = !this.animationEnabled;
    this.animationService.setAnimationEnabled(this.animationEnabled);
    this.closeContextMenu();
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
  }

  onDitherAlgorithmChange(algorithm: DitherAlgorithm): void {
    this.ditherConfig.algorithm = algorithm;
    this.shapeManager.setDitherAlgorithm?.(algorithm);
  }

  onDitherColorLevelsChange(levels: number): void {
    this.ditherConfig.colorLevels = +levels;
    this.shapeManager.setDitherColorLevels?.(+levels);
  }

  onDitherStrengthChange(strength: number): void {
    this.ditherConfig.strength = +strength;
    this.shapeManager.setDitherStrength?.(+strength / 100);
  }

  onDitherPatternScaleChange(scale: number): void {
    this.ditherConfig.patternScale = +scale;
    this.shapeManager.setDitherPatternScale?.(+scale);
  }

  onDitherPerChannelChange(perChannel: boolean): void {
    this.ditherConfig.perChannel = perChannel;
    this.shapeManager.setDitherPerChannel?.(perChannel);
  }

  onDitherBayerLevelChange(level: number): void {
    this.ditherConfig.bayerLevel = +level;
    this.shapeManager.setDitherBayerLevel?.(+level);
  }

  onDitherHalftoneAngleChange(angle: number): void {
    this.ditherConfig.halftoneAngle = +angle;
    this.shapeManager.setDitherHalftoneAngle?.(+angle);
  }

  onDitherHalftoneFrequencyChange(freq: number): void {
    this.ditherConfig.halftoneFrequency = +freq;
    this.shapeManager.setDitherHalftoneFrequency?.(+freq);
  }

  onDitherHalftoneShapeChange(algorithm: DitherAlgorithm): void {
    this.ditherConfig.algorithm = algorithm;
    this.shapeManager.setDitherAlgorithm?.(algorithm);
  }

  get ditherStrengthPercent(): number {
    return Math.round(this.ditherConfig.strength * 100);
  }

  set ditherStrengthPercent(val: number) {
    this.ditherConfig.strength = val / 100;
    this.shapeManager.setDitherStrength?.(val / 100);
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
  }

  onDitherForegroundColorChange(hex: string): void {
    const c = this.hexToRgba01(hex);
    this.ditherConfig.foregroundColor = c;
    this.shapeManager.setDitherForegroundColor?.(c[0], c[1], c[2], c[3]);
  }

  onDitherBackgroundColorChange(hex: string): void {
    const c = this.hexToRgba01(hex);
    this.ditherConfig.backgroundColor = c;
    this.shapeManager.setDitherBackgroundColor?.(c[0], c[1], c[2], c[3]);
  }

  onDitherSwapColors(): void {
    const tmp = [...this.ditherConfig.foregroundColor] as [number, number, number, number];
    this.ditherConfig.foregroundColor = [...this.ditherConfig.backgroundColor] as [number, number, number, number];
    this.ditherConfig.backgroundColor = tmp;
    this.shapeManager.swapDitherColors?.();
  }

  onDitherInvertPatternChange(invert: boolean): void {
    this.ditherConfig.invertPattern = invert;
    this.shapeManager.setDitherInvertPattern?.(invert);
  }

  onDitherDuotoneBiasChange(value: number): void {
    this.ditherConfig.duotoneBias = +value / 100;
    this.shapeManager.setDitherDuotoneBias?.(+value / 100);
  }

  onDitherTintOpacityChange(opacity: number): void {
    this.ditherConfig.tintOpacity = +opacity / 100;
    this.shapeManager.setDitherTintOpacity?.(+opacity / 100);
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
  }

  onDitherBgAlphaChange(alpha: number): void {
    this.ditherConfig.backgroundColor[3] = +alpha / 100;
    const c = this.ditherConfig.backgroundColor;
    this.shapeManager.setDitherBackgroundColor?.(c[0], c[1], c[2], c[3]);
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

  /** Canvas drop — import dropped image file as new layer */
  async onCanvasDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = Array.from(event.dataTransfer?.files ?? []).find(f => f.type.startsWith('image/'));
    if (!file) return;
    const sm = this.shapeManager as any;
    const layerId = await sm.importImageAsNewLayer?.(file, file.name.replace(/\.[^.]+$/, ''));
    if (layerId) {
      console.log('[ImageImport] Dropped image → new layer:', layerId);
      this.selectRasterLayer(layerId);
      this.refreshRasterLayers();
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
  }
  onDotColorSelected(color: string) {
    this.dotColor = color;
    this.dotHexInputDraft = color.replace('#', '');
    const { r, g, b, a } = this.parseAnyColor(color);
    this.shapeManager?.setDotColor(r / 255, g / 255, b / 255, a);
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
  penColorPalette: string[] = ['#000000','#E74C3C','#F39C12','#ffff00','#2ECC71','#3498DB','#9B59B6','#FFFFFF'];
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
    private ngZone: NgZone
  ) { }

  ngOnInit() {
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

    // cleanup
    this.autoSaveSubscription?.unsubscribe();
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
      this.illustrationService.getIllustrationByUid(this.illustrationUid).subscribe(async (res: any) => {
        if (res.resultType === ResultType.Success) {
          this.illustration = res.resultObject;
          this.illustrationTitle = res.resultObject.name;

          this.resetSceneState();

          // ── V2 State Load (with v1 legacy fallback) ──
          await this.loadIllustrationV2();

          // autosave: use v2 state save
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

          // ── OPFS auto-save (engine-side, covers crash recovery) ──
          if (this.illustration?.id) {
            this.autoSaveService.enable(
              this.illustration.id.toString(),
              this.illustration.name ?? 'Untitled',
              { intervalMs: this.selectedAutoSaveInterval, strokeDebounceMs: 5000 }
            );
            this.autoSaveService.state$.subscribe(s => this.autoSaveState = s);
          }

          // thumbnail saver (debounced)
          this.thumbnailSaveSubscription = this.sceneChanged$
            .pipe(auditTime(5000))
            .subscribe(() => {
              if (!this.illustration?.isCustomThumbnail) {
                this.saveThumbnailIfChanged();
              }
            });

          this.markLoaded('illustration');
        }
      });

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

    const sceneAppliedOnce = this.shapeManager.interactionService.onSceneGraphChanged
      .subscribe(() => {
        this.markLoaded('sceneApplied');
        sceneAppliedOnce.unsubscribe();
        if (!this.illustration?.isCustomThumbnail) {
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
    this.shapeManager.setIllustrationBounds(1,1.417); // Aspect ratio of B4 paper
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
        console.log('Loaded raster layers from ShapeManager:', layers);
        this.rasterLayers = Array.isArray(layers) ? layers : [];
        // Only reset selection if the current layer no longer exists
        const stillExists = this.rasterLayers.some(l => l.id === this.selectedRasterLayerId);
        if (!stillExists) {
          this.selectedRasterLayerId = this.rasterLayers[0]?.id ?? null;
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

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

    // Global undo/redo: prefer raster undo/redo for illustrations
    if (ctrlKey && (event.key === 'z' || event.key === 'Z')) {
      // Ctrl+Z or Cmd+Z -> undo; if Shift pressed, do redo
      if (event.shiftKey) {
        this.rasterRedo();
      } else {
        this.rasterUndo();
      }
      event.preventDefault();
      return;
    }

    if (ctrlKey && (event.key === 'y' || event.key === 'Y')) {
      // Ctrl+Y or Cmd+Y -> redo
      this.rasterRedo();
      event.preventDefault();
      return;
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
      this.rasterSelectionService.deselectAll(); event.preventDefault(); return;
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
  onColorPickerSelection(c: string) { this.selectedPenColor = c; this.shapeManager.setStrokeColor(c); this._syncPersistentPickerFromHex(c); }

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

    const { state } = await this.frogFileService.buildStatePayload(this.illustrationTitle);

    // Attach dither config (held locally on the component)
    state.ditherConfig = { ...this.ditherConfig };

    // Step 1: Save state metadata
    try {
      await firstValueFrom(this.illustrationService.saveState(this.illustration.id, state));
      console.log('[V2 Save] state saved successfully');
    } catch (e) {
      console.error('[V2 Save] state save failed', e);
      return;
    }

    // Step 2: Upload pixel data for each layer/cel
    await this.uploadPixelData(state.layers);
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
      await this.setIllustrationSceneGraph(sceneGraph);
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

    // 5. Update UI
    this.illustrationTitle = manifest.name;
    this.refreshRasterLayers();

    // 6. Restore dither config from frog import (if present)
    if (result.ditherConfig) {
      this._applyDitherConfig(result.ditherConfig);
    }
  }

  /** Upload pixel data for dirty layers and cels. */
  private async uploadPixelData(layers: LayerStateDto[]): Promise<void> {
    if (!this.illustration?.id) return;
    const sm = this.shapeManager as any;
    let uploaded = 0;

    for (const layer of layers) {
      if (layer.animated) {
        // Upload each cel's pixel data
        for (const cel of layer.cels) {
          try {
            let blob: Blob | null = null;
            if (sm?.getCelPixelDataBlob) {
              blob = await sm.getCelPixelDataBlob(layer.layerId, cel.celId, 'image/webp');
            } else if (sm?.exportRasterLayerToBlob) {
              blob = await sm.exportRasterLayerToBlob(layer.layerId, 'image/webp');
            }
            if (blob) {
              const texSize = sm?.getRasterTextureSize?.() ?? { w: this.canvas?.width ?? 1024, h: this.canvas?.height ?? 768 };
              await firstValueFrom(this.illustrationService.uploadCelPixelData(
                this.illustration.id, cel.celId, blob,
                texSize.w, texSize.h, 'webp'
              ));
              uploaded++;
            } else {
              console.warn(`[V2 Save] no blob for cel ${cel.celId} (getCelPixelDataBlob and exportRasterLayerToBlob unavailable or returned null)`);
            }
          } catch (e) {
            console.warn(`[V2 Save] cel upload failed for ${cel.celId}`, e);
          }
        }
      } else {
        // Static layer — full-resolution export via exportRasterLayerToBlob
        try {
          let blob: Blob | null = null;
          if (sm?.exportRasterLayerToBlob) {
            blob = await sm.exportRasterLayerToBlob(layer.layerId, 'image/webp');
          }
          if (!blob) {
            console.warn(`[V2 Save] exportRasterLayerToBlob returned null for ${layer.layerId}, skipping pixel upload`);
            continue;
          }
          const texSize = sm?.getRasterTextureSize?.() ?? { w: this.canvas?.width ?? 1024, h: this.canvas?.height ?? 768 };
          await firstValueFrom(this.illustrationService.uploadLayerPixelData(
            this.illustration.id, layer.layerId, blob,
            texSize.w, texSize.h, 'webp'
          ));
          uploaded++;
        } catch (e) {
          console.warn(`[V2 Save] layer upload failed for ${layer.layerId}`, e);
        }
      }
    }
    console.log(`[V2 Save] pixel data uploads complete: ${uploaded}/${layers.length} layer(s)`);
  }

  // ── V2 Load ──────────────────────────────────────────────────

  /** Load illustration using v2 state API, with fallback to v1 canvasData. */
  private async loadIllustrationV2(): Promise<void> {
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

    // ══════════════════════════════════════════════════════════
    //  Determine freshest source: OPFS (local) vs Backend (remote)
    //  Compare timestamps to avoid loading stale data.
    // ══════════════════════════════════════════════════════════
    const docId = this.illustration.id.toString();

    // 1. Probe OPFS for saved timestamp (cheap — no full load yet)
    let opfsSavedAt = 0;
    try {
      const docs = await this.autoSaveService.listDocuments();
      const match = docs.find(d => d.docId === docId);
      if (match) {
        // savedAt may be epoch ms (number) or ISO string — normalize to epoch ms
        opfsSavedAt = typeof match.savedAt === 'number' ? match.savedAt : new Date(match.savedAt).getTime();
        if (isNaN(opfsSavedAt)) opfsSavedAt = 0;
        console.log('[V2 Load] OPFS doc found, savedAt:', opfsSavedAt, opfsSavedAt ? new Date(opfsSavedAt).toISOString() : '(invalid)');
      } else {
        console.log('[V2 Load] No OPFS doc for docId:', docId);
      }
    } catch (e) {
      console.warn('[V2 Load] listDocuments() failed', e);
    }

    // 2. Fetch backend state metadata (needed for timestamp + fallback data)
    let stateRes: any = null;
    let backendSavedAt = 0;
    try {
      stateRes = await firstValueFrom(this.illustrationService.loadState(this.illustration.id));
      const raw = stateRes?.resultObject?.savedAt;
      backendSavedAt = typeof raw === 'number' ? raw : (raw ? new Date(raw).getTime() : 0);
      if (isNaN(backendSavedAt)) backendSavedAt = 0;
      console.log('[V2 Load] Backend state fetched, savedAt:', backendSavedAt,
        backendSavedAt ? new Date(backendSavedAt).toISOString() : '(not set)');
    } catch (e) {
      console.warn('[V2 Load] loadState failed', e);
    }

    // 3. Decide: use OPFS if it exists AND is at least as fresh as backend
    const useOpfs = opfsSavedAt > 0 && opfsSavedAt >= backendSavedAt;
    console.log(`[V2 Load] Decision: OPFS=${opfsSavedAt}, Backend=${backendSavedAt} → ${useOpfs ? 'OPFS' : 'Backend'}`);

    if (useOpfs) {
      try {
        const result = await this.autoSaveService.loadDocument(docId);
        if (result.success) {
          console.log('[V2 Load] ✅ loadDocument() restored from OPFS, layers:', result.layers.length);

          // Salsa fires a single onSceneGraphChanged after restore completes,
          // which triggers refreshRasterLayers(). Use the return value as well
          // in case it arrives before the event.
          if (result.layers.length > 0) {
            this.rasterLayers = result.layers;
          } else {
            this.refreshRasterLayers();
          }

          const stillExists = this.rasterLayers.some(l => l.id === this.selectedRasterLayerId);
          if (!stillExists) {
            this.selectedRasterLayerId = this.rasterLayers[0]?.id ?? null;
          }
          this._syncLayerDitherConfigsFromEngine();
          this.animationService.refreshTimeline();
          await this._syncAnimationStateFromBackend();
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

    const state: IllustrationStateDto | null = stateRes?.resultObject ?? null;

    // ── V2 path ──
    if (state && state.version >= 2 && state.layers?.length > 0) {
      console.log('[V2 Load] restoring v2 state, layers:', state.layers.length,
        state.layers.map(l => ({ id: l.layerId, pixelDataUrl: l.pixelDataUrl, animated: l.animated,
          cels: l.cels?.map(c => ({ celId: c.celId, pixelDataUrl: c.pixelDataUrl })) })));

      // 1. Apply scene graph
      if (state.sceneGraph) {
        await this.setIllustrationSceneGraph(state.sceneGraph);
        try {
          const raw = JSON.parse(state.sceneGraph);
          this.layerTree = this.buildLayerTree(raw.root);
        } catch { /* scene graph may not have root for layer tree */ }
      }

      // 2. Download & import pixel data for each layer
      const importPayload: any[] = [];
      for (const layer of state.layers) {
        if (layer.animated && layer.cels.length > 0) {
          // For animated layers, download each cel
          for (const cel of layer.cels) {
            // Use server-provided URL, or construct one from the known upload endpoint
            const celUrl = cel.pixelDataUrl
              || `/api/illustration/${this.illustration!.id}/cel/${cel.celId}`;
            try {
              const resp = await fetch(this.resolvePixelDataUrl(celUrl));
              if (!resp.ok) { console.warn(`[V2 Load] cel ${cel.celId} fetch returned ${resp.status}`); continue; }
              const blob = await resp.blob();
              if (blob.size === 0) { console.warn(`[V2 Load] cel ${cel.celId} returned empty blob`); continue; }
              const dataUrl = await this.blobToDataUrl(blob);
              importPayload.push({
                id: layer.layerId,
                celId: cel.celId,
                name: layer.name,
                imageData: dataUrl,
                width: cel.width,
                height: cel.height,
                blendMode: layer.blendMode,
                opacity: layer.opacity,
                visible: layer.visible,
                locked: layer.locked,
                clipped: layer.clipped,
                lockTransparency: layer.lockTransparency,
              });
            } catch (e) {
              console.warn(`[V2 Load] failed to download cel ${cel.celId}`, e);
            }
          }
        } else {
          // Static layer — use server URL or construct one
          const layerUrl = layer.pixelDataUrl
            || `/api/illustration/${this.illustration!.id}/layer/${layer.layerId}`;
          try {
            const resp = await fetch(this.resolvePixelDataUrl(layerUrl));
            if (!resp.ok) { console.warn(`[V2 Load] layer ${layer.layerId} fetch returned ${resp.status}`); continue; }
            const blob = await resp.blob();
            if (blob.size === 0) { console.warn(`[V2 Load] layer ${layer.layerId} returned empty blob`); continue; }
            const dataUrl = await this.blobToDataUrl(blob);
            importPayload.push({
              id: layer.layerId,
              name: layer.name,
              imageData: dataUrl,
              blendMode: layer.blendMode,
              opacity: layer.opacity,
              visible: layer.visible,
              locked: layer.locked,
              clipped: layer.clipped,
              lockTransparency: layer.lockTransparency,
            });
          } catch (e) {
            console.warn(`[V2 Load] failed to download layer ${layer.layerId}`, e);
          }
        }
      }

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

      // 6. Restore dither config
      if (state.ditherConfig) {
        this._applyDitherConfig(state.ditherConfig);
      }

      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
      return;
    }

    // ── V1 Legacy Fallback ──
    console.log('[V2 Load] no v2 state found, using v1 canvasData fallback');
    const legacyData = this.illustration.sceneGraphData || this.illustration.canvasData;
    if (legacyData?.length) {
      await this.setIllustrationSceneGraph(legacyData);
      try {
        const raw = JSON.parse(legacyData);
        this.layerTree = this.buildLayerTree(raw.root);

        if (raw.rasterLayers && Array.isArray(raw.rasterLayers) && raw.rasterLayers.length > 0) {
          if ((this.shapeManager as any)?.importRasterLayersFromDataURLs) {
            try {
              // Clear the auto-created "Background" layer before importing saved layers
              (this.shapeManager as any)?.rasterLayerManager?.clearAllLayers?.();
              await (this.shapeManager as any).importRasterLayersFromDataURLs(raw.rasterLayers);
            } catch (e) {
              console.warn('shapeManager.importRasterLayersFromDataURLs failed', e);
            }
          }
        } else if (raw.embeddedRaster && raw.embeddedRaster.imageData) {
          if ((this.shapeManager as any)?.importRasterLayersFromDataURLs) {
            try {
              // Clear the auto-created "Background" layer before importing saved layers
              (this.shapeManager as any)?.rasterLayerManager?.clearAllLayers?.();
              await (this.shapeManager as any).importRasterLayersFromDataURLs([{
                name: 'Raster',
                imageData: raw.embeddedRaster.imageData,
                width: raw.embeddedRaster.width,
                height: raw.embeddedRaster.height
              }]);
            } catch (e) {
              console.warn('Failed to import legacy embeddedRaster', e);
            }
          }
        }
        this.refreshRasterLayers();
      } catch (e) {
        console.warn('Failed to parse canvasData when importing rasters', e);
      }
    }
    requestAnimationFrame(() => this.markLoaded('sceneApplied'));
  }

  /**
   * After loadDocument() restores from OPFS, sync the animation/timeline UI state
   * from the backend metadata so the UI reflects the saved settings.
   */
  private async _syncAnimationStateFromBackend(): Promise<void> {
    if (!this.illustration?.id) return;
    try {
      const stateRes = await firstValueFrom(this.illustrationService.loadState(this.illustration.id));
      const state: IllustrationStateDto | null = stateRes?.resultObject ?? null;
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

      // Restore dither config
      if (state.ditherConfig) {
        this._applyDitherConfig(state.ditherConfig);
      }
    } catch (e) {
      console.warn('[V2 Load] _syncAnimationStateFromBackend failed (non-fatal)', e);
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

  /** @deprecated Kept for v1 compat only */
  private async saveIllustrationWithRaster(sceneJson: string) {
    if (!this.illustration) return;
    try {
      // Try to capture a high-res raster snapshot. Use shapeManager.captureThumbnailBlob which wraps renderer snapshot.
      // Pass 0 or undefined to request native canvas size if supported; fallback to 1024px if not.
      let blob: Blob | null = null;
      try {
        // Use the raster texture size if available to request similar resolution
        const texSize = (this.shapeManager as any)?.getRasterTextureSize?.() ?? { w: this.canvas.width, h: this.canvas.height };
        const maxDim = Math.max(texSize.w || this.canvas.width, texSize.h || this.canvas.height) || 1024;
        // limit to a reasonable size to avoid massive payloads
        const reqSize = Math.min(Math.max(512, Math.round(maxDim)), 2048);
        blob = await this.shapeManager.captureThumbnailBlob?.(reqSize);
      } catch (e) {
        console.warn('captureThumbnailBlob failed for save; attempting fallback snapshotToBlob', e);
        try {
          // last resort: call renderer snapshot directly if exposed
          const renderer = (this.shapeManager as any)?.webgpuRenderer;
          if (renderer?.snapshotToBlob) blob = await renderer.snapshotToBlob(1024);
        } catch (e2) {
          console.warn('renderer.snapshotToBlob fallback failed', e2);
        }
      }

      let enriched = null;
      try {
        enriched = JSON.parse(sceneJson);
      } catch (e) {
        // if scene JSON is not valid, bail
        console.error('Invalid scene JSON; aborting enriched save');
        return;
      }

      if (blob) {
        try {
          const dataUrl = await this.blobToDataUrl(blob);
          // Attach top-level embeddedRaster (migration-friendly key)
          (enriched as any).embeddedRaster = {
            imageData: dataUrl,
            mime: blob.type,
            timestamp: Date.now()
          };
        } catch (e) {
          console.warn('Failed to convert snapshot blob to data URL', e);
        }
      }

      const payload = JSON.stringify(enriched);
      this.illustrationService.saveIllustration(this.illustration.id, payload).subscribe(() => {
        // no-op
      }, err => console.warn('Failed to save enriched illustration', err));
    } catch (e) {
      console.error('saveIllustrationWithRaster failed', e);
    }
  }

  loadIllustrationSceneGraph() {
    this.illustrationService.loadIllustrationSceneGraph(this.illustration!.id).subscribe(res => {
      this.shapeManager.setSceneGraphJSON(res);
    });
  }

  async setIllustrationSceneGraph(sceneGraphJSON: string) {
    await this.shapeManager.setSceneGraphJSON(sceneGraphJSON);
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
    const blob = await this.shapeManager.captureThumbnailBlob(300);
    this.illustrationService.uploadThumbnail(this.illustrationUid, blob).subscribe();
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
    this.illustrationService.renameIllustration(this.illustration!.id, this.illustrationTitle).subscribe(() => {});
  }

  trackById(index: number, item: LayerTreeNode): string { return item.id; }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.autoSaveSubscription?.unsubscribe();
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
  private loadingState = {
    renderer: false,
    illustration: false,
    sceneApplied: false
  };
  private markLoaded(key: keyof typeof this.loadingState) {
    this.loadingState[key] = true;
    if (Object.values(this.loadingState).every(Boolean)) this.isLoading = false;
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
      await firstValueFrom(this.illustrationService.uploadThumbnail(this.illustrationUid, blob, true));
      this.lastSavedThumbnailJSON = this.shapeManager.getSceneGraphJSON();
      this.notifyService.success('Thumbnail updated to the current view.');
    } catch (e) {
      console.error(e);
      this.notifyService.error('Could not set the thumbnail. Try again.');
    } finally {
      this.closeContextMenu();
    }
  }
}
