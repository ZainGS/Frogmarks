import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { RasterBrushService } from '../../../shared/services/raster/raster-brush.service';
import { ColorPickerComponent } from '../../../shared/components/color-picker/color-picker.component';
import {
  BrushPreset,
  StabilizationMethod,
  CanvasGrainType,
  CanvasGrainOption,
  CANVAS_GRAIN_OPTIONS,
  BrushBleed,
  BrushSmudge,
} from '../../models/brush-preset.model';

export type BrushPanelView = 'grid' | 'editor';

@Component({
  selector: 'app-brush-options',
  standalone: false,
  templateUrl: './brush-options.component.html',
  styleUrl: './brush-options.component.scss',
})
export class BrushOptionsComponent implements OnInit, OnDestroy {
  /** The current raster tool mode set by the parent */
  @Input() activeRasterTool: 'brush' | 'airbrush' | 'eraser' = 'brush';
  @Output() presetChanged = new EventEmitter<string>();
  @ViewChild('gridColorPicker') gridColorPickerRef!: ColorPickerComponent;
  @ViewChild('editorColorPicker') editorColorPickerRef!: ColorPickerComponent;

  /** Returns whichever color picker ref is currently in the DOM */
  private get activeColorPicker(): ColorPickerComponent | null {
    return this.gridColorPickerRef ?? this.editorColorPickerRef ?? null;
  }

  // ── View state ────────────────────────────────────────────────
  view: BrushPanelView = 'grid';
  isCreating = false;
  editingPresetId: string | null = null;
  editingPresetName = '';
  /** Snapshot of the preset at the moment the editor was opened — for Reset to Default */
  private _editSnapshot: string | null = null;

  // ── Preset state ──────────────────────────────────────────────
  presets: BrushPreset[] = [];
  activePresetId: string | null = null;

  // ── Core controls ─────────────────────────────────────────────
  brushColor = '#9B58B6';
  showColorPicker = false;
  minSize = 2;
  maxSize = 64;
  opacity = 100;
  flow = 80;

  // ── Stabilization ─────────────────────────────────────────────
  stabilizationMethod: StabilizationMethod = 'none';
  stabilizationLevel = 3;
  pullStringLength = 30;
  stabilizationMethods: { value: StabilizationMethod; label: string; tooltip: string }[] = [
    { value: 'none', label: 'None', tooltip: 'No smoothing. Raw input. Good for rough sketching.' },
    { value: 'moving-average', label: 'Moving Average', tooltip: 'Weighted average. Low latency, general-purpose.' },
    { value: 'predictive', label: 'Predictive', tooltip: 'Dampens jitter, tracks fast movements. Good for sketching.' },
    { value: 'catmull-rom', label: 'Catmull-Rom', tooltip: 'Smoothest curves via spline fitting. Best for inking.' },
    { value: 'pull-string', label: 'Pull-String', tooltip: 'Deliberate, controlled lines. The cursor drags a virtual string.' },
  ];

  // ── Advanced collapsible sections ─────────────────────────────
  showTipShape = false;
  showDynamics = false;
  showSpacing = false;
  showTexture = false;

  // Tip shape
  tipHardness = 1;
  tipRoundness = 1;
  tipAngleDeg = 0;

  // Spacing / scatter
  spacing = 0.15;
  scatterDistance = 0;
  sizeJitter = 0;
  rotationJitterDeg = 0;

  // Texture
  textureEnabled = false;
  textureScale = 1;
  textureStrength = 0.5;
  textureMode: 'multiply' | 'subtract' = 'multiply';
  textureFixed = false;

  // ── Canvas Grain (Paper Texture) ──────────────────────────────
  showCanvasGrain = false;
  canvasGrainType: CanvasGrainType = 'none';
  canvasGrainScale = 1.0;
  canvasGrainStrength = 0.6;
  canvasGrainOptions: CanvasGrainOption[] = CANVAS_GRAIN_OPTIONS;

  // ── Eraser sub-options ────────────────────────────────────────
  eraserHardness: 'soft' | 'hard' = 'soft';
  eraserStyle: 'fade' | 'clear' = 'fade';

  // ── Dynamics curves ───────────────────────────────────────────
  sizeCurve: { x: number; y: number }[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  opacityCurve: { x: number; y: number }[] = [{ x: 0, y: 1 }, { x: 1, y: 1 }];
  flowCurve: { x: number; y: number }[] = [{ x: 0, y: 1 }, { x: 1, y: 1 }];
  velocitySizeCurve: { x: number; y: number }[] = [];
  scatterPressureCurve: { x: number; y: number }[] = [];

  // ── Brush blend mode ─────────────────────────────────────────────
  brushBlendMode: 'normal' | 'multiply' | 'screen' | 'overlay' = 'normal';
  brushBlendModeOptions = [
    { value: 'normal' as const, label: 'Normal', tooltip: 'Standard paint — covers what\u2019s underneath based on opacity.' },
    { value: 'multiply' as const, label: 'Multiply', tooltip: 'Darkens existing colors by multiplying. Painting white has no effect.' },
    { value: 'screen' as const, label: 'Screen', tooltip: 'Lightens existing colors. Painting black has no effect.' },
    { value: 'overlay' as const, label: 'Overlay', tooltip: 'Combines Multiply and Screen based on existing pixel brightness.' },
  ];

  // ── Dual Brush (Texture) ──────────────────────────────────────
  showDualBrush = false;
  dualBrushEnabled = false;
  dualBrushTileMode: 'dab-local' | 'canvas-tiling' = 'dab-local';
  dualBrushScale = 1.0;
  dualBrushBlendOp: 'multiply' | 'subtract' | 'minimum' = 'multiply';
  dualBrushStrength = 0.7;
  dualBrushRandomRotation = true;
  dualBrushTextureData = '';
  dualBrushTextureSize = 256;
  dualBrushTexturePreview = '';

  // ── Color Jitter ──────────────────────────────────────────────
  showColorJitter = false;
  hueJitter = 0;
  saturationJitter = 0;
  brightnessJitter = 0;
  opacityJitter = 0;

  // ── Wet Edges ─────────────────────────────────────────────────
  showWetEdges = false;
  wetEdgesEnabled = false;
  wetEdgeDarkness = 0.4;
  wetEdgeWidth = 2;
  wetEdgeStrength = 0.5;

  // ── Bleed ─────────────────────────────────────────────────────
  showBleed = false;
  bleedEnabled = false;
  bleedPerDab = true;
  bleedRadius = 4;
  bleedStrength = 0.3;

  // ── Smudge ────────────────────────────────────────────────────
  showSmudge = false;
  smudgeEnabled = false;
  smudgeStrength = 0.5;

  // ── Stroke Texture ────────────────────────────────────────────
  showStrokeTexture = false;
  strokeTextureEnabled = false;
  strokeTextureTilingDensity = 0.5;
  strokeTextureEdgeSoftness = 0.2;
  strokeTextureData = '';
  strokeTextureSize = 256;
  strokeTexturePreview = '';

  // ── Brush Pack Import ─────────────────────────────────────────
  showImportDialog = false;
  importPackName = '';
  importPackAuthor = '';
  importPresetCount = 0;
  private _pendingPackJson = '';

  // ── New brush name ────────────────────────────────────────────
  newPresetName = '';

  private subs: Subscription[] = [];

  constructor(public rasterService: RasterBrushService) {}

  ngOnInit(): void {
    this.rasterService.refreshPresets();

    this.subs.push(
      this.rasterService.presets$.subscribe(presets => {
        this.presets = presets;
      }),
      this.rasterService.activePresetId$.subscribe(id => {
        this.activePresetId = id;
        this._syncFromPreset();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ═══════════════════════════════════════════════════════════════
  //  GRID VIEW actions
  // ═══════════════════════════════════════════════════════════════

  /** Quick-select a brush from the grid (just activates it, stays on grid) */
  quickSelectBrush(id: string): void {
    this.rasterService.setActivePreset(id);
    this.presetChanged.emit(id);
  }

  /** Gear icon clicked — open editor for an existing preset */
  openEditor(id: string, event: MouseEvent): void {
    event.stopPropagation(); // don't trigger quickSelect
    this.isCreating = false;
    this.editingPresetId = id;
    this.rasterService.setActivePreset(id);

    // Take a JSON snapshot for reset
    const json = this.rasterService.exportPreset(id);
    this._editSnapshot = json;

    const preset = this.presets.find(p => p.id === id);
    this.editingPresetName = preset?.name ?? 'Brush';
    this._syncFromPreset();
    this.view = 'editor';
  }

  /** + cell clicked — open editor in create mode */
  startCreateBrush(): void {
    this.isCreating = true;
    this.editingPresetId = null;
    this._editSnapshot = null;
    this.newPresetName = '';
    this._resetEditorDefaults();
    this.view = 'editor';
  }

  // ═══════════════════════════════════════════════════════════════
  //  EDITOR VIEW actions
  // ═══════════════════════════════════════════════════════════════

  closeEditor(): void {
    this.view = 'grid';
    this.isCreating = false;
    this.editingPresetId = null;
    this._editSnapshot = null;
    this.showColorPicker = false;
  }

  /** Save a brand-new brush built from the editor's current values */
  saveNewBrush(): void {
    const name = this.newPresetName.trim() || 'Custom Brush';
    const preset = {
      name,
      category: 'Custom',
      tip: {
        type: 'parametric' as const,
        hardness: this.tipHardness,
        roundness: this.tipRoundness,
        angle: this.tipAngleDeg * Math.PI / 180,
      },
      spacing: this.spacing,
      dynamics: {
        sizePressureCurve: [...this.sizeCurve],
        opacityPressureCurve: [...this.opacityCurve],
        flowPressureCurve: [...this.flowCurve],
        sizeVelocityCurve: this.velocitySizeCurve.length ? [...this.velocitySizeCurve] : undefined,
        scatterPressureCurve: this.scatterPressureCurve.length ? [...this.scatterPressureCurve] : undefined,
        sizeRandomJitter: this.sizeJitter,
        rotationRandomJitter: this.rotationJitterDeg * Math.PI / 180,
        scatterDistance: this.scatterDistance,
      },
      blending: {
        mode: this.brushBlendMode,
        opacity: this.opacity / 100,
        flow: this.flow / 100,
      },
      stabilization: {
        method: this.stabilizationMethod,
        level: this.stabilizationLevel,
        pullStringLength: this.stabilizationMethod === 'pull-string' ? this.pullStringLength : undefined,
      },
      antiAliasing: true,
      minSize: this.minSize,
      maxSize: this.maxSize,
      version: 1,
    };
    const newId = this.rasterService.createPreset(preset);
    if (newId) {
      this.rasterService.setActivePreset(newId);
      this.presetChanged.emit(newId);
    }
    this.closeEditor();
  }

  /** Cancel new brush creation */
  cancelCreate(): void {
    this.closeEditor();
  }

  /** Save edits to an existing brush */
  saveEdits(): void {
    // Edits are applied live via the service, so just close
    this._editSnapshot = null;
    this.closeEditor();
  }

  /** Reset the currently-editing preset to its snapshot */
  resetToDefault(): void {
    if (!this._editSnapshot || !this.editingPresetId) return;
    this.rasterService.importPreset(this._editSnapshot);
    this.rasterService.setActivePreset(this.editingPresetId);
    this._syncFromPreset();
  }

  /** Delete the currently-editing preset */
  deleteBrush(): void {
    if (!this.editingPresetId) return;
    this.rasterService.deletePreset(this.editingPresetId);
    this.closeEditor();
  }

  // ═══════════════════════════════════════════════════════════════
  //  Color
  // ═══════════════════════════════════════════════════════════════

  toggleColorPicker(): void {
    this.showColorPicker = !this.showColorPicker;
    if (this.showColorPicker) {
      setTimeout(() => this.activeColorPicker?.setColor(this.brushColor));
    }
  }

  onColorSelected(color: string): void {
    this.brushColor = color;
    this.rasterService.setColor(color);
  }

  onHexInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const hex = raw.startsWith('#') ? raw : '#' + raw;
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex)) {
      this.brushColor = hex;
      this.rasterService.setColor(hex);
      if (this.showColorPicker) {
        this.activeColorPicker?.setColor(hex);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Size / Opacity / Flow
  // ═══════════════════════════════════════════════════════════════

  onMinSizeChange(v: number): void {
    this.minSize = Math.min(v, this.maxSize);
    this.rasterService.updatePresetSize(this.minSize, this.maxSize);
  }

  onMaxSizeChange(v: number): void {
    this.maxSize = Math.max(v, this.minSize);
    this.rasterService.updatePresetSize(this.minSize, this.maxSize);
    this.rasterService.setSize(this.maxSize);
  }

  onOpacityChange(v: number): void {
    this.opacity = v;
    this.rasterService.updateOpacity(v / 100);
  }

  onFlowChange(v: number): void {
    this.flow = v;
    this.rasterService.updateFlow(v / 100);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Stabilization
  // ═══════════════════════════════════════════════════════════════

  onStabilizationMethodChange(m: StabilizationMethod): void {
    this.stabilizationMethod = m;
    this.rasterService.updateStabilization(m, this.stabilizationLevel, m === 'pull-string' ? this.pullStringLength : undefined);
  }

  onStabilizationLevelChange(v: number): void {
    this.stabilizationLevel = v;
    this.rasterService.updateStabilization(this.stabilizationMethod, v, this.stabilizationMethod === 'pull-string' ? this.pullStringLength : undefined);
  }

  onPullStringLengthChange(v: number): void {
    this.pullStringLength = v;
    this.rasterService.updateStabilization(this.stabilizationMethod, this.stabilizationLevel, v);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Tip Shape
  // ═══════════════════════════════════════════════════════════════

  onHardnessChange(v: number): void { this.tipHardness = v; this.rasterService.updateTipHardness(v); }
  onRoundnessChange(v: number): void { this.tipRoundness = v; this.rasterService.updateTipRoundness(v); }
  onAngleChange(deg: number): void { this.tipAngleDeg = deg; this.rasterService.updateTipAngle(deg * Math.PI / 180); }

  // ═══════════════════════════════════════════════════════════════
  //  Dynamics Curves
  // ═══════════════════════════════════════════════════════════════

  onSizeCurveChange(pts: { x: number; y: number }[]): void { this.sizeCurve = pts; this.rasterService.updateSizeCurve(pts); }
  onOpacityCurveChange(pts: { x: number; y: number }[]): void { this.opacityCurve = pts; this.rasterService.updateOpacityCurve(pts); }
  onFlowCurveChange(pts: { x: number; y: number }[]): void { this.flowCurve = pts; this.rasterService.updateFlowCurve(pts); }
  onVelocitySizeCurveChange(pts: { x: number; y: number }[]): void { this.velocitySizeCurve = pts; this.rasterService.updateVelocitySizeCurve(pts); }
  onScatterPressureCurveChange(pts: { x: number; y: number }[]): void { this.scatterPressureCurve = pts; this.rasterService.updateScatterPressureCurve(pts); }
  onBrushBlendModeChange(mode: 'normal' | 'multiply' | 'screen' | 'overlay'): void { this.brushBlendMode = mode; this.rasterService.updateBrushBlendMode(mode); }

  // ═══════════════════════════════════════════════════════════════
  //  Spacing / Scatter
  // ═══════════════════════════════════════════════════════════════

  onSpacingChange(v: number): void { this.spacing = v; this.rasterService.updateSpacing(v); }
  onScatterChange(v: number): void { this.scatterDistance = v; this.rasterService.updateScatterDistance(v); }
  onSizeJitterChange(v: number): void { this.sizeJitter = v; this.rasterService.updateSizeJitter(v); }
  onRotJitterChange(deg: number): void { this.rotationJitterDeg = deg; this.rasterService.updateRotationJitter(deg * Math.PI / 180); }

  // ═══════════════════════════════════════════════════════════════
  //  Texture
  // ═══════════════════════════════════════════════════════════════

  onTextureToggle(enabled: boolean): void {
    this.textureEnabled = enabled;
    if (!enabled) { this.rasterService.updateTexture(null); return; }
    this.rasterService.updateTexture({
      scale: this.textureScale, strength: this.textureStrength,
      mode: this.textureMode, fixedToCanvas: this.textureFixed,
    });
  }

  onTextureScaleChange(v: number): void { this.textureScale = v; this.rasterService.updateTexture({ scale: v }); }
  onTextureStrengthChange(v: number): void { this.textureStrength = v; this.rasterService.updateTexture({ strength: v }); }
  onTextureModeChange(m: 'multiply' | 'subtract'): void { this.textureMode = m; this.rasterService.updateTexture({ mode: m }); }
  onTextureFixedChange(f: boolean): void { this.textureFixed = f; this.rasterService.updateTexture({ fixedToCanvas: f }); }

  onTextureFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.rasterService.updateTexture({ imageData: reader.result as string }); };
    reader.readAsDataURL(file);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Brush Grain (per-brush dab texture)
  // ═══════════════════════════════════════════════════════════════

  onCanvasGrainTypeChange(type: CanvasGrainType): void {
    this.canvasGrainType = type;
    this._applyBrushGrain();
  }

  onCanvasGrainScaleChange(v: number): void {
    this.canvasGrainScale = v;
    this._applyBrushGrain();
  }

  onCanvasGrainStrengthChange(v: number): void {
    this.canvasGrainStrength = v;
    this._applyBrushGrain();
  }

  private _applyBrushGrain(): void {
    this.rasterService.setBrushGrain({
      type: this.canvasGrainType,
      scale: this.canvasGrainScale,
      strength: this.canvasGrainStrength,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Eraser
  // ═══════════════════════════════════════════════════════════════

  onEraserStyleChange(style: 'fade' | 'clear'): void {
    this.eraserStyle = style;
    this.rasterService.enableEraserTool(style);
  }

  onEraserHardnessChange(h: 'soft' | 'hard'): void {
    this.eraserHardness = h;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Dual Brush (Texture)
  // ═══════════════════════════════════════════════════════════════

  onDualBrushToggle(enabled: boolean): void {
    this.dualBrushEnabled = enabled;
    this._applyDualBrush();
  }

  onDualBrushTileModeChange(mode: 'dab-local' | 'canvas-tiling'): void {
    this.dualBrushTileMode = mode;
    this._applyDualBrush();
  }

  onDualBrushScaleChange(v: number): void { this.dualBrushScale = v; this._applyDualBrush(); }
  onDualBrushBlendOpChange(op: 'multiply' | 'subtract' | 'minimum'): void { this.dualBrushBlendOp = op; this._applyDualBrush(); }
  onDualBrushStrengthChange(v: number): void { this.dualBrushStrength = v; this._applyDualBrush(); }
  onDualBrushRandomRotationChange(v: boolean): void { this.dualBrushRandomRotation = v; this._applyDualBrush(); }

  onDualBrushTextureSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.dualBrushTextureData = reader.result as string;
      this.dualBrushTexturePreview = this.dualBrushTextureData;
      this._applyDualBrush();
    };
    reader.readAsDataURL(file);
  }

  private _applyDualBrush(): void {
    this.rasterService.setDualBrush({
      enabled: this.dualBrushEnabled,
      textureData: this.dualBrushTextureData,
      textureSize: this.dualBrushTextureSize,
      tileMode: this.dualBrushTileMode,
      scale: this.dualBrushScale,
      blendOp: this.dualBrushBlendOp,
      strength: this.dualBrushStrength,
      randomRotation: this.dualBrushRandomRotation,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Color Jitter
  // ═══════════════════════════════════════════════════════════════

  onHueJitterChange(v: number): void { this.hueJitter = v; this._applyColorJitter(); }
  onSaturationJitterChange(v: number): void { this.saturationJitter = v; this._applyColorJitter(); }
  onBrightnessJitterChange(v: number): void { this.brightnessJitter = v; this._applyColorJitter(); }
  onOpacityJitterChange(v: number): void { this.opacityJitter = v; this._applyColorJitter(); }

  private _applyColorJitter(): void {
    this.rasterService.setColorJitter({
      hueJitter: this.hueJitter,
      saturationJitter: this.saturationJitter,
      brightnessJitter: this.brightnessJitter,
      opacityJitter: this.opacityJitter,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Wet Edges
  // ═══════════════════════════════════════════════════════════════

  onWetEdgesToggle(enabled: boolean): void {
    this.wetEdgesEnabled = enabled;
    this._applyWetEdges();
  }

  onWetEdgeDarknessChange(v: number): void { this.wetEdgeDarkness = v; this._applyWetEdges(); }
  onWetEdgeWidthChange(v: number): void { this.wetEdgeWidth = Math.round(v); this._applyWetEdges(); }
  onWetEdgeStrengthChange(v: number): void { this.wetEdgeStrength = v; this._applyWetEdges(); }

  private _applyWetEdges(): void {
    this.rasterService.setWetEdges({
      enabled: this.wetEdgesEnabled,
      edgeDarkness: this.wetEdgeDarkness,
      edgeWidth: this.wetEdgeWidth,
      strength: this.wetEdgeStrength,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Stroke Texture
  // ═══════════════════════════════════════════════════════════════

  onStrokeTextureToggle(enabled: boolean): void {
    this.strokeTextureEnabled = enabled;
    this._applyStrokeTexture();
  }

  onStrokeTextureTilingChange(v: number): void { this.strokeTextureTilingDensity = v; this._applyStrokeTexture(); }
  onStrokeTextureEdgeSoftnessChange(v: number): void { this.strokeTextureEdgeSoftness = v; this._applyStrokeTexture(); }

  onStrokeTextureFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.strokeTextureData = reader.result as string;
      this.strokeTexturePreview = this.strokeTextureData;
      this._applyStrokeTexture();
    };
    reader.readAsDataURL(file);
  }

  private _applyStrokeTexture(): void {
    this.rasterService.setStrokeTexture({
      enabled: this.strokeTextureEnabled,
      textureData: this.strokeTextureData,
      textureSize: this.strokeTextureSize,
      texelsPerUnit: this.strokeTextureTilingDensity,
      edgeSoftness: this.strokeTextureEdgeSoftness,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Brush Pack Import
  // ═══════════════════════════════════════════════════════════════

  onBrushPackFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = reader.result as string;
        const pack = JSON.parse(json);
        this.importPackName = pack.packName ?? 'Unknown Pack';
        this.importPackAuthor = pack.author ?? 'Unknown';
        this.importPresetCount = pack.presets?.length ?? 0;
        this._pendingPackJson = json;
        this.showImportDialog = true;
      } catch {
        console.error('Invalid brush pack file');
      }
    };
    reader.readAsText(file);
  }

  confirmImportPack(): void {
    if (this._pendingPackJson) {
      this.rasterService.importBrushPack(this._pendingPackJson);
      this.presetChanged.emit('pack-imported');
    }
    this.cancelImport();
  }

  // ── Bleed handlers ────────────────────────────────────────────

  onBleedChange(): void {
    const settings: BrushBleed = {
      enabled: this.bleedEnabled,
      perDab: this.bleedPerDab,
      radius: this.bleedRadius,
      strength: this.bleedStrength,
    };
    this.rasterService.setBrushBleed(settings);
  }

  // ── Smudge handlers ───────────────────────────────────────────

  onSmudgeChange(): void {
    const settings: BrushSmudge = {
      enabled: this.smudgeEnabled,
      strength: this.smudgeStrength,
      sampleRadius: 0,
    };
    this.rasterService.setBrushSmudge(settings);
  }

  exportAllPresets(): void {
    const json = this.rasterService.exportAll();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brushes.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  cancelImport(): void {
    this.showImportDialog = false;
    this._pendingPackJson = '';
  }

  // ═══════════════════════════════════════════════════════════════
  //  Private helpers
  // ═══════════════════════════════════════════════════════════════

  private _syncFromPreset(): void {
    const preset = this.rasterService.getActivePreset();
    if (!preset) return;
    this.minSize = preset.minSize;
    this.maxSize = preset.maxSize;
    this.opacity = Math.round(preset.blending.opacity * 100);
    this.flow = Math.round(preset.blending.flow * 100);
    this.stabilizationMethod = preset.stabilization.method;
    this.stabilizationLevel = preset.stabilization.level;
    this.pullStringLength = preset.stabilization.pullStringLength ?? 30;
    this.spacing = preset.spacing;

    if (preset.tip.type === 'parametric') {
      this.tipHardness = preset.tip.hardness;
      this.tipRoundness = preset.tip.roundness;
      this.tipAngleDeg = Math.round(preset.tip.angle * 180 / Math.PI);
    }

    this.sizeCurve = [...preset.dynamics.sizePressureCurve];
    this.opacityCurve = [...preset.dynamics.opacityPressureCurve];
    this.flowCurve = [...preset.dynamics.flowPressureCurve];
    this.velocitySizeCurve = [...(preset.dynamics.sizeVelocityCurve ?? [])];
    this.scatterPressureCurve = [...(preset.dynamics.scatterPressureCurve ?? [])];

    this.brushBlendMode = preset.blending?.mode ?? 'normal';

    this.scatterDistance = preset.dynamics.scatterDistance ?? 0;
    this.sizeJitter = preset.dynamics.sizeRandomJitter ?? 0;
    this.rotationJitterDeg = Math.round((preset.dynamics.rotationRandomJitter ?? 0) * 180 / Math.PI);

    if (preset.texture) {
      this.textureEnabled = true;
      this.textureScale = preset.texture.scale;
      this.textureStrength = preset.texture.strength;
      this.textureMode = preset.texture.mode;
      this.textureFixed = preset.texture.fixedToCanvas;
    } else {
      this.textureEnabled = false;
    }

    // Sync brush grain from engine (per-brush)
    const grain = this.rasterService.getBrushGrain();
    if (grain) {
      this.canvasGrainType = grain.type ?? 'none';
      this.canvasGrainScale = grain.scale ?? 1.0;
      this.canvasGrainStrength = grain.strength ?? 0.6;
    }

    // Bleed
    if (preset.bleed) {
      this.bleedEnabled = preset.bleed.enabled;
      this.bleedPerDab = preset.bleed.perDab;
      this.bleedRadius = preset.bleed.radius ?? 4;
      this.bleedStrength = preset.bleed.strength;
    } else {
      this.bleedEnabled = false;
      this.bleedPerDab = true;
      this.bleedRadius = 4;
      this.bleedStrength = 0.3;
    }

    // Smudge
    if (preset.smudge) {
      this.smudgeEnabled = preset.smudge.enabled;
      this.smudgeStrength = preset.smudge.strength;
    } else {
      this.smudgeEnabled = false;
      this.smudgeStrength = 0.5;
    }
  }

  private _resetEditorDefaults(): void {
    this.brushColor = '#9B58B6';
    this.minSize = 2;
    this.maxSize = 24;
    this.opacity = 100;
    this.flow = 80;
    this.stabilizationMethod = 'none';
    this.stabilizationLevel = 3;
    this.tipHardness = 1;
    this.tipRoundness = 1;
    this.tipAngleDeg = 0;
    this.spacing = 0.15;
    this.scatterDistance = 0;
    this.sizeJitter = 0;
    this.rotationJitterDeg = 0;
    this.textureEnabled = false;
    this.showTipShape = false;
    this.showDynamics = false;
    this.showSpacing = false;
    this.showTexture = false;
    this.showCanvasGrain = false;
    this.canvasGrainType = 'none';
    this.canvasGrainScale = 1.0;
    this.canvasGrainStrength = 0.6;
    this.sizeCurve = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    this.opacityCurve = [{ x: 0, y: 1 }, { x: 1, y: 1 }];
    this.flowCurve = [{ x: 0, y: 1 }, { x: 1, y: 1 }];
    this.velocitySizeCurve = [];
    this.scatterPressureCurve = [];
    this.brushBlendMode = 'normal';
    // New sections
    this.showDualBrush = false;
    this.dualBrushEnabled = false;
    this.dualBrushTileMode = 'dab-local';
    this.dualBrushScale = 1.0;
    this.dualBrushBlendOp = 'multiply';
    this.dualBrushStrength = 0.7;
    this.dualBrushRandomRotation = true;
    this.dualBrushTextureData = '';
    this.dualBrushTexturePreview = '';
    this.showColorJitter = false;
    this.hueJitter = 0;
    this.saturationJitter = 0;
    this.brightnessJitter = 0;
    this.opacityJitter = 0;
    this.showWetEdges = false;
    this.wetEdgesEnabled = false;
    this.wetEdgeDarkness = 0.4;
    this.wetEdgeWidth = 2;
    this.wetEdgeStrength = 0.5;
    this.showStrokeTexture = false;
    this.strokeTextureEnabled = false;
    this.strokeTextureTilingDensity = 0.5;
    this.strokeTextureEdgeSoftness = 0.2;
    this.strokeTextureData = '';
    this.strokeTexturePreview = '';
    this.showBleed = false;
    this.bleedEnabled = false;
    this.bleedPerDab = true;
    this.bleedRadius = 4;
    this.bleedStrength = 0.3;
    this.showSmudge = false;
    this.smudgeEnabled = false;
    this.smudgeStrength = 0.5;
  }
}
