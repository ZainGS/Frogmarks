import {
  AfterViewInit,
  Component,
  ElementRef,
  Output,
  EventEmitter,
  NgZone,
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
  BrushTexture,
} from '../../models/brush-preset.model';
import { SIZE_SLIDER_STEPS, sizeFromSlider, sliderFromSize } from './brush-size-slider';

export type BrushPanelView = 'grid' | 'editor';

/**
 * Presets kept out of the brush list. The built-in "Eraser" preset (category 'Eraser', erases by its category) was a
 * second "Eraser" entry next to the Eraser row. The row is the eraser TOOL: it erases with the current brush tip,
 * has Fade / Clear + Soft / Hard, and is what UV / decal / packaging / garment painting read as "erasing" (a
 * category-erase preset there painted black on garments). The preset still exists in the engine (saved documents
 * carry it); while it is the active preset the panel shows the Eraser row as selected.
 */
export const HIDDEN_BRUSH_PRESET_IDS: ReadonlySet<string> = new Set(['default_eraser']);

/** Where a brush's own Texture comes from: an uploaded image, or one of the engine's built-in paper patterns. */
export type BrushTextureSource = 'image' | Exclude<CanvasGrainType, 'none'>;

/** An image for an <img> preview: engine presets may hold raw base64 (brush packs) or a data: URL (uploads). */
export function imagePreviewSrc(data: string | undefined | null): string {
  if (!data) return '';
  return data.startsWith('data:') ? data : `data:image/png;base64,${data}`;
}

@Component({
  selector: 'app-brush-options',
  standalone: false,
  templateUrl: './brush-options.component.html',
  styleUrl: './brush-options.component.scss',
})
export class BrushOptionsComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() presetChanged = new EventEmitter<string>();
  /** The user tapped a brush row in the list (not the Eraser row, whose options open below it; not an editor / import
   *  change). The illustration tool panel folds itself away on this, on touch only (mobile-parity TOUCH-10). */
  @Output() brushPicked = new EventEmitter<string>();
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
  get editingPresetIcon(): string | undefined {
    return this.presets.find(p => p.id === this.editingPresetId)?.icon;
  }
  /** Snapshot of the preset at the moment the editor was opened — for Revert */
  private _editSnapshot: string | null = null;
  /** Delete Brush was tapped: the footer asks to confirm (the delete can't be undone). */
  confirmingDelete = false;

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

  // Texture (the brush's own, per preset — BrushPreset.texture)
  textureEnabled = false;
  textureScale = 1;
  textureStrength = 0.5;
  textureMode: 'multiply' | 'subtract' = 'multiply';
  textureFixed = false;
  textureSource: BrushTextureSource = 'cold-press';
  textureImageData = '';
  readonly textureSourceOptions: { value: BrushTextureSource; label: string; tooltip: string }[] = [
    ...CANVAS_GRAIN_OPTIONS.filter(o => o.value !== 'none')
      .map(o => ({ value: o.value as BrushTextureSource, label: o.label, tooltip: o.tooltip })),
    { value: 'image', label: 'Image\u2026', tooltip: 'Your own tiling grayscale image (white = paint, black = none).' },
  ];

  /** The active brush has an IMAGE tip (from a brush pack): hardness / roundness / angle don't apply to it. */
  tipIsImage = false;

  // ── Canvas Grain (Paper Texture) ──────────────────────────────
  showCanvasGrain = false;
  canvasGrainType: CanvasGrainType = 'none';
  canvasGrainScale = 1.0;
  canvasGrainStrength = 0.6;
  canvasGrainOptions: CanvasGrainOption[] = CANVAS_GRAIN_OPTIONS;

  // ── Eraser sub-options ────────────────────────────────────────
  eraserHardness: 'soft' | 'hard' = 'soft';
  eraserStyle: 'fade' | 'clear' = 'fade';

  // ── What applies in the current state (controls that would do nothing are hidden) ──
  /** Wet Edges, Bleed and Stroke Texture run on the stroke layer, which only Normal blend paints into. */
  get normalBlend(): boolean { return this.brushBlendMode === 'normal'; }
  /** Stroke Texture draws ONE textured strip at pen-up instead of the dabs: the dab settings don't apply. */
  get strokeTextureActive(): boolean { return this.strokeTextureEnabled && this.normalBlend; }
  /** The Clear eraser removes everything the tip touches: Opacity and Flow don't apply. */
  get eraserClears(): boolean { return this.eraserActive && this.eraserStyle === 'clear'; }
  /** Grid quick Opacity: not for the Clear eraser. */
  get quickShowOpacity(): boolean { return !this.eraserClears; }
  /** Grid quick Flow: not for the Clear eraser, nor for a stroke-texture brush (the eraser still stamps dabs). */
  get quickShowFlow(): boolean { return this.eraserActive ? !this.eraserClears : !this.strokeTextureActive; }

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

  /** The editor is open on a NEW brush: its controls only edit the form (saved by Save), never the active brush. */
  private get live(): boolean { return !this.isCreating; }

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

  constructor(public rasterService: RasterBrushService, private host: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngOnInit(): void {
    this.rasterService.refreshPresets();

    this.subs.push(
      this.rasterService.presets$.subscribe(presets => {
        this.presets = presets.filter(p => !HIDDEN_BRUSH_PRESET_IDS.has(p.id));
      }),
      this.rasterService.activePresetId$.subscribe(id => {
        this.activePresetId = id;
        this._syncFromPreset();
      })
    );
    this._syncEraserFromEngine();
  }

  ngAfterViewInit(): void {
    // Fit the grid view to the host panel: only the brush list scrolls, so Size + Import / Export stay in view.
    // Outside the zone: the observer / rAF only write a style, never Angular state.
    this.zone.runOutsideAngular(() => {
      if (typeof ResizeObserver === 'undefined') return;
      this._fitObserver = new ResizeObserver(() => this._scheduleFitList());
      this._fitObserver.observe(this.host.nativeElement);
      const scroller = this._scrollParent();
      if (scroller) this._fitObserver.observe(scroller);
      window.addEventListener('resize', this._onFitResize);
      this._scheduleFitList();
    });
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this._fitObserver?.disconnect();
    window.removeEventListener('resize', this._onFitResize);
    if (this._fitRaf) cancelAnimationFrame(this._fitRaf);
    this.cancelRowLongPress();
  }

  // ── Grid view fit (only the brush list scrolls) ───────────────
  private _fitObserver: ResizeObserver | null = null;
  private _fitRaf = 0;
  private readonly _onFitResize = () => this._scheduleFitList();
  /** Smallest list height the fit will shrink to (about two rows); below that the host panel scrolls as before. */
  private static readonly MIN_LIST_PX = 96;

  private _scheduleFitList(): void {
    if (this._fitRaf) return;
    this._fitRaf = requestAnimationFrame(() => { this._fitRaf = 0; this._fitList(); });
  }

  /** The illustration tool sub-panel this panel sits in (the only host where the brush panel is the whole scrolling
   *  content), or null: other hosts (packaging sidebar, UV / eye-draw panels) have sections below it and keep the
   *  CSS list cap. */
  private _scrollParent(): HTMLElement | null {
    return this.host.nativeElement.closest<HTMLElement>('.tool-subpanel');
  }

  /** Size the brush list so the panel ends at the sub-panel's bottom edge: shrink it when the panel overflows, grow
   *  it into free space (up to its content) when there is room. Measured from the panel's real bottom (scrollHeight
   *  can't report free space). Converges in one pass; no-op while hidden. */
  private _fitList(): void {
    const list = this.host.nativeElement.querySelector<HTMLElement>('.brush-list');
    const scroller = this._scrollParent();
    if (!list || !scroller || scroller.clientHeight === 0) return;
    const sr = scroller.getBoundingClientRect();
    const padBottom = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
    const hostBottom = this.host.nativeElement.getBoundingClientRect().bottom - sr.top + scroller.scrollTop;
    const free = scroller.clientHeight - padBottom - hostBottom;   // < 0 = the sub-panel overflows by that much
    const cur = list.clientHeight;
    let next = cur + free;
    if (free > 0) next = Math.min(next, list.scrollHeight);       // never taller than the list's content
    next = Math.max(BrushOptionsComponent.MIN_LIST_PX, Math.floor(next));
    if (Math.abs(next - cur) >= 1) list.style.maxHeight = `${next}px`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  GRID VIEW actions
  // ═══════════════════════════════════════════════════════════════

  /** Is the eraser on? Read from the ENGINE (not a parent input) so the highlight is right however it was switched
   *  (this row, the rail, the keymap) and in every host panel. */
  get eraserActive(): boolean {
    return this.rasterService.isEraserActive()
      || (!!this.activePresetId && HIDDEN_BRUSH_PRESET_IDS.has(this.activePresetId));
  }

  /** A preset row is highlighted only while it is the brush actually painting (never alongside the Eraser row). */
  isPresetActive(id: string): boolean {
    return !this.eraserActive && this.activePresetId === id;
  }

  /** Quick-select a brush from the grid (activates it AND leaves the eraser, stays on grid) */
  quickSelectBrush(id: string): void {
    this.rasterService.selectBrush(id);
    this.presetChanged.emit(id);
  }

  /** A brush row tapped in the grid: select it, then tell the host (brushPicked). */
  pickBrush(id: string): void {
    this.quickSelectBrush(id);
    this.brushPicked.emit(id);
  }

  /** Eraser row: turn the eraser tool on (erasing with the current brush tip), or back off to that brush. */
  selectEraserTool(): void {
    if (this.eraserActive) {
      const id = this.activePresetId && !HIDDEN_BRUSH_PRESET_IDS.has(this.activePresetId)
        ? this.activePresetId
        : this.presets[0]?.id;
      if (id) this.quickSelectBrush(id);
    } else {
      this.rasterService.setEraserHardness(this.eraserHardness);
      this.rasterService.enableEraserTool(this.eraserStyle);
    }
  }

  // ── Long-press a brush row → editor (touch has no hover, so the gear is not the only way in) ──
  /** How long a row must be held to open its editor. */
  static readonly LONG_PRESS_MS = 500;
  /** A press that moves further than this (CSS px) is a scroll / drag, not a long-press. */
  private static readonly LONG_PRESS_SLOP_PX = 10;
  private _longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private _longPressStart: { x: number; y: number } | null = null;
  /** The last press opened the editor: swallow the click that follows its release (it would pick the brush and, on
   *  touch, fold the tool panel away). */
  private _suppressRowClick = false;

  onRowPointerDown(id: string, e: PointerEvent): void {
    this.cancelRowLongPress();
    this._suppressRowClick = false;
    if (e.button !== 0 || (e.target as HTMLElement | null)?.closest?.('.brush-row-gear')) return;
    this._longPressStart = { x: e.clientX, y: e.clientY };
    this._longPressTimer = setTimeout(() => {
      this._longPressTimer = null;
      this._suppressRowClick = true;
      this.openEditor(id);
    }, BrushOptionsComponent.LONG_PRESS_MS);
  }

  onRowPointerMove(e: PointerEvent): void {
    if (!this._longPressTimer || !this._longPressStart) return;
    if (Math.hypot(e.clientX - this._longPressStart.x, e.clientY - this._longPressStart.y) > BrushOptionsComponent.LONG_PRESS_SLOP_PX) {
      this.cancelRowLongPress();
    }
  }

  cancelRowLongPress(): void {
    if (this._longPressTimer) clearTimeout(this._longPressTimer);
    this._longPressTimer = null;
    this._longPressStart = null;
  }

  /** The OS long-press menu (Android) would pop over the editor: the long-press is ours. */
  onRowContextMenu(e: Event): void {
    if (this._longPressTimer || this._suppressRowClick) e.preventDefault();
  }

  onRowClick(id: string): void {
    if (this._suppressRowClick) { this._suppressRowClick = false; return; }
    this.pickBrush(id);
  }

  /** Gear icon clicked (or a row long-pressed) — open editor for an existing preset */
  openEditor(id: string, event?: Event): void {
    event?.stopPropagation(); // don't trigger quickSelect
    this.cancelRowLongPress();
    this.isCreating = false;
    this.editingPresetId = id;
    this.rasterService.selectBrush(id);   // editing a brush selects it (and leaves the eraser)

    // Take a JSON snapshot for reset
    const json = this.rasterService.exportPreset(id);
    this._editSnapshot = json;

    const preset = this.presets.find(p => p.id === id);
    this.editingPresetName = preset?.name ?? 'Brush';
    this._syncedPresetId = null;   // a fresh editor reads the preset as saved (no UI-only state carried over)
    this._syncFromPreset();
    this.view = 'editor';
    this._scrollHostToTop();
  }

  /** + cell clicked — open editor in create mode */
  startCreateBrush(): void {
    this.isCreating = true;
    this.editingPresetId = null;
    this._editSnapshot = null;
    this.newPresetName = '';
    this._resetEditorDefaults();
    this.view = 'editor';
    this._scrollHostToTop();
  }

  /** The editor starts at its top (the host sub-panel may have been scrolled down the brush list). */
  private _scrollHostToTop(): void {
    const scroller = this._scrollParent();
    if (scroller) scroller.scrollTop = 0;
  }

  // ═══════════════════════════════════════════════════════════════
  //  EDITOR VIEW actions
  // ═══════════════════════════════════════════════════════════════

  closeEditor(): void {
    const wasCreating = this.isCreating;
    this.view = 'grid';
    this.isCreating = false;
    this.editingPresetId = null;
    this._editSnapshot = null;
    this.showColorPicker = false;
    this.confirmingDelete = false;
    if (wasCreating) this._syncFromPreset();   // the grid's quick controls show the active brush again, not the form
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
      texture: this.textureEnabled ? this._textureSettings() : undefined,
      dualBrush: this._dualBrushSettings(),
      colorJitter: this._colorJitterSettings(),
      wetEdges: this._wetEdgesSettings(),
      strokeTexture: this._strokeTextureSettings(),
      bleed: this._bleedSettings(),
      smudge: this._smudgeSettings(),
    };
    const newId = this.rasterService.createPreset(preset);
    if (newId) {
      this.rasterService.selectBrush(newId);
      this.presetChanged.emit(newId);
    }
    this.closeEditor();
  }

  /** Cancel new brush creation */
  cancelCreate(): void {
    this.closeEditor();
  }

  /** Done: close the editor (edits to an existing brush are applied live) */
  saveEdits(): void {
    // Edits are applied live via the service, so just close
    this._editSnapshot = null;
    this.closeEditor();
  }

  /** Revert: put the currently-editing preset back to its snapshot from when the editor opened */
  resetToDefault(): void {
    if (!this._editSnapshot || !this.editingPresetId) return;
    this.rasterService.importPreset(this._editSnapshot);
    this.rasterService.setActivePreset(this.editingPresetId);
    this._syncFromPreset();
  }

  /** Delete Brush tapped: ask first (the footer turns into a Delete / Cancel confirm). */
  askDeleteBrush(): void {
    if (this.editingPresetId) this.confirmingDelete = true;
  }

  /** Delete the currently-editing preset (confirmed) */
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
    if (this.live) this.rasterService.updatePresetSize(this.minSize, this.maxSize);
  }

  onMaxSizeChange(v: number): void {
    this.maxSize = Math.max(v, this.minSize);
    if (!this.live) return;
    this.rasterService.updatePresetSize(this.minSize, this.maxSize);
    this.rasterService.setSize(this.maxSize);
  }

  /** Grid-view quick Size slider: non-linear (brush-size-slider.ts) so small sizes get most of the travel. */
  readonly sizeSliderSteps = SIZE_SLIDER_STEPS;
  get sizeSliderPos(): number { return sliderFromSize(this.maxSize); }
  onSizeSliderInput(pos: number | string): void { this.onMaxSizeChange(sizeFromSlider(+pos)); }

  onOpacityChange(v: number): void {
    this.opacity = v;
    if (this.live) this.rasterService.updateOpacity(v / 100);
  }

  onFlowChange(v: number): void {
    this.flow = v;
    if (this.live) this.rasterService.updateFlow(v / 100);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Stabilization
  // ═══════════════════════════════════════════════════════════════

  onStabilizationMethodChange(m: StabilizationMethod): void {
    this.stabilizationMethod = m;
    if (this.live) this.rasterService.updateStabilization(m, this.stabilizationLevel, m === 'pull-string' ? this.pullStringLength : undefined);
  }

  onStabilizationLevelChange(v: number): void {
    this.stabilizationLevel = v;
    if (this.live) this.rasterService.updateStabilization(this.stabilizationMethod, v, this.stabilizationMethod === 'pull-string' ? this.pullStringLength : undefined);
  }

  onPullStringLengthChange(v: number): void {
    this.pullStringLength = v;
    if (this.live) this.rasterService.updateStabilization(this.stabilizationMethod, this.stabilizationLevel, v);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Tip Shape
  // ═══════════════════════════════════════════════════════════════

  onHardnessChange(v: number): void { this.tipHardness = v; if (this.live) this.rasterService.updateTipHardness(v); }
  onRoundnessChange(v: number): void { this.tipRoundness = v; if (this.live) this.rasterService.updateTipRoundness(v); }
  onAngleChange(deg: number): void { this.tipAngleDeg = deg; if (this.live) this.rasterService.updateTipAngle(deg * Math.PI / 180); }

  // ═══════════════════════════════════════════════════════════════
  //  Dynamics Curves
  // ═══════════════════════════════════════════════════════════════

  onSizeCurveChange(pts: { x: number; y: number }[]): void { this.sizeCurve = pts; if (this.live) this.rasterService.updateSizeCurve(pts); }
  onOpacityCurveChange(pts: { x: number; y: number }[]): void { this.opacityCurve = pts; if (this.live) this.rasterService.updateOpacityCurve(pts); }
  onFlowCurveChange(pts: { x: number; y: number }[]): void { this.flowCurve = pts; if (this.live) this.rasterService.updateFlowCurve(pts); }
  onVelocitySizeCurveChange(pts: { x: number; y: number }[]): void { this.velocitySizeCurve = pts; if (this.live) this.rasterService.updateVelocitySizeCurve(pts); }
  onScatterPressureCurveChange(pts: { x: number; y: number }[]): void { this.scatterPressureCurve = pts; if (this.live) this.rasterService.updateScatterPressureCurve(pts); }
  onBrushBlendModeChange(mode: 'normal' | 'multiply' | 'screen' | 'overlay'): void { this.brushBlendMode = mode; if (this.live) this.rasterService.updateBrushBlendMode(mode); }

  // ═══════════════════════════════════════════════════════════════
  //  Spacing / Scatter
  // ═══════════════════════════════════════════════════════════════

  onSpacingChange(v: number): void { this.spacing = v; if (this.live) this.rasterService.updateSpacing(v); }
  onScatterChange(v: number): void { this.scatterDistance = v; if (this.live) this.rasterService.updateScatterDistance(v); }
  onSizeJitterChange(v: number): void { this.sizeJitter = v; if (this.live) this.rasterService.updateSizeJitter(v); }
  onRotJitterChange(deg: number): void { this.rotationJitterDeg = deg; if (this.live) this.rasterService.updateRotationJitter(deg * Math.PI / 180); }

  // ═══════════════════════════════════════════════════════════════
  //  Texture
  // ═══════════════════════════════════════════════════════════════

  onTextureToggle(enabled: boolean): void {
    this.textureEnabled = enabled;
    this._applyTexture();
  }

  onTextureScaleChange(v: number): void { this.textureScale = v; this._applyTexture(); }
  onTextureStrengthChange(v: number): void { this.textureStrength = v; this._applyTexture(); }
  onTextureModeChange(m: 'multiply' | 'subtract'): void { this.textureMode = m; this._applyTexture(); }
  onTextureFixedChange(f: boolean): void { this.textureFixed = f; this._applyTexture(); }
  /** A built-in pattern drops an uploaded image (the engine uses the image whenever there is one). */
  onTextureSourceChange(src: BrushTextureSource): void {
    this.textureSource = src;
    if (src !== 'image') this.textureImageData = '';
    this._applyTexture();
  }

  /** The image preview of the Texture section (Image source only). */
  get texturePreview(): string { return this.textureSource === 'image' ? imagePreviewSrc(this.textureImageData) : ''; }

  onTextureFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.textureSource = 'image';
      this.textureImageData = reader.result as string;
      this._applyTexture();
    };
    reader.readAsDataURL(file);
  }

  /** The Texture block as the engine reads it (BrushPreset.texture). */
  private _textureSettings(): BrushTexture {
    const image = this.textureSource === 'image' ? this.textureImageData : '';
    return {
      imageData: image,
      // the built-in pattern (also the stand-in while Image has no file yet)
      grain: this.textureSource === 'image' ? 'cold-press' : this.textureSource,
      scale: this.textureScale,
      strength: this.textureStrength,
      mode: this.textureMode,
      fixedToCanvas: this.textureFixed,
    };
  }

  private _applyTexture(): void {
    if (!this.live) return;
    this.rasterService.updateTexture(this.textureEnabled ? this._textureSettings() : null);
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
    this.rasterService.setEraserHardness(h);   // was UI-only: the radio never reached the engine
  }

  /** Mirror the engine's eraser mode into the Fade / Clear + Soft / Hard radios (the panel is re-created per host). */
  private _syncEraserFromEngine(): void {
    const mode = this.rasterService.getEraseMode();
    if (mode === 2) this.eraserStyle = 'clear';
    else if (mode === 1 || mode === 3) { this.eraserStyle = 'fade'; this.eraserHardness = mode === 3 ? 'hard' : 'soft'; }
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

  private _dualBrushSettings() {
    return {
      enabled: this.dualBrushEnabled,
      textureData: this.dualBrushTextureData,
      textureSize: this.dualBrushTextureSize,
      tileMode: this.dualBrushTileMode,
      scale: this.dualBrushScale,
      blendOp: this.dualBrushBlendOp,
      strength: this.dualBrushStrength,
      randomRotation: this.dualBrushRandomRotation,
    };
  }

  private _applyDualBrush(): void {
    if (this.live) this.rasterService.setDualBrush(this._dualBrushSettings());
  }

  // ═══════════════════════════════════════════════════════════════
  //  Color Jitter
  // ═══════════════════════════════════════════════════════════════

  onHueJitterChange(v: number): void { this.hueJitter = v; this._applyColorJitter(); }
  onSaturationJitterChange(v: number): void { this.saturationJitter = v; this._applyColorJitter(); }
  onBrightnessJitterChange(v: number): void { this.brightnessJitter = v; this._applyColorJitter(); }
  onOpacityJitterChange(v: number): void { this.opacityJitter = v; this._applyColorJitter(); }

  private _colorJitterSettings() {
    return {
      hueJitter: this.hueJitter,
      saturationJitter: this.saturationJitter,
      brightnessJitter: this.brightnessJitter,
      opacityJitter: this.opacityJitter,
    };
  }

  private _applyColorJitter(): void {
    if (this.live) this.rasterService.setColorJitter(this._colorJitterSettings());
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

  private _wetEdgesSettings() {
    return {
      enabled: this.wetEdgesEnabled,
      edgeDarkness: this.wetEdgeDarkness,
      edgeWidth: this.wetEdgeWidth,
      strength: this.wetEdgeStrength,
    };
  }

  private _applyWetEdges(): void {
    if (this.live) this.rasterService.setWetEdges(this._wetEdgesSettings());
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

  private _strokeTextureSettings() {
    return {
      enabled: this.strokeTextureEnabled,
      textureData: this.strokeTextureData,
      textureSize: this.strokeTextureSize,
      texelsPerUnit: this.strokeTextureTilingDensity,
      edgeSoftness: this.strokeTextureEdgeSoftness,
    };
  }

  private _applyStrokeTexture(): void {
    if (this.live) this.rasterService.setStrokeTexture(this._strokeTextureSettings());
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

  private _bleedSettings(): BrushBleed {
    return {
      enabled: this.bleedEnabled,
      perDab: this.bleedPerDab,
      radius: this.bleedRadius,
      strength: this.bleedStrength,
    };
  }

  onBleedChange(): void {
    if (this.live) this.rasterService.setBrushBleed(this._bleedSettings());
  }

  // ── Smudge handlers ───────────────────────────────────────────

  private _smudgeSettings(): BrushSmudge {
    return {
      enabled: this.smudgeEnabled,
      strength: this.smudgeStrength,
      sampleRadius: 0,
    };
  }

  onSmudgeChange(): void {
    if (this.live) this.rasterService.setBrushSmudge(this._smudgeSettings());
  }

  // ═══════════════════════════════════════════════════════════════
  //  Brush preview image  (stored in preset.icon as dataURL)
  // ═══════════════════════════════════════════════════════════════

  /** Called by the hidden file input on each brush row. */
  onBrushImageSelected(id: string, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.rasterService.updatePresetIcon(id, reader.result as string);
    };
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  /** Remove the preview image from a preset. */
  removeBrushImage(id: string, e: MouseEvent): void {
    e.stopPropagation();
    this.rasterService.updatePresetIcon(id, null);
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

  /** The preset _syncFromPreset last read (a re-sync of the SAME preset keeps UI-only state, e.g. Image picked but no
   *  file chosen yet). */
  private _syncedPresetId: string | null = null;

  private _syncFromPreset(): void {
    const preset = this.rasterService.getActivePreset();
    if (!preset) return;
    const samePreset = this._syncedPresetId === preset.id;
    this._syncedPresetId = preset.id;
    this.minSize = preset.minSize;
    this.maxSize = preset.maxSize;
    this.opacity = Math.round(preset.blending.opacity * 100);
    this.flow = Math.round(preset.blending.flow * 100);
    this.stabilizationMethod = preset.stabilization.method;
    this.stabilizationLevel = preset.stabilization.level;
    this.pullStringLength = preset.stabilization.pullStringLength ?? 30;
    this.spacing = preset.spacing;

    this.tipIsImage = preset.tip.type === 'image';
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
      this.textureImageData = preset.texture.imageData ?? '';
      // "Image" with no file yet stays picked while the same brush is edited (the pattern stands in meanwhile)
      const keepImage = samePreset && this.textureSource === 'image';
      this.textureSource = this.textureImageData || keepImage ? 'image' : (preset.texture.grain ?? 'cold-press');
    } else {
      this.textureEnabled = false;
      this.textureScale = 1;
      this.textureStrength = 0.5;
      this.textureMode = 'multiply';
      this.textureFixed = false;
      this.textureImageData = '';
      this.textureSource = 'cold-press';
    }

    // Dual Brush / Color Variation / Wet Edges / Stroke Texture: the preset's own values (or the defaults when it has
    // none), so the editor shows the preset as it is and touching one control writes back only what was changed.
    const dual = preset.dualBrush;
    this.dualBrushEnabled = dual?.enabled ?? false;
    this.dualBrushTileMode = dual?.tileMode ?? 'dab-local';
    this.dualBrushScale = dual?.scale ?? 1.0;
    this.dualBrushBlendOp = dual?.blendOp ?? 'multiply';
    this.dualBrushStrength = dual?.strength ?? 0.7;
    this.dualBrushRandomRotation = dual?.randomRotation ?? true;
    this.dualBrushTextureData = dual?.textureData ?? '';
    this.dualBrushTextureSize = dual?.textureSize ?? 256;
    this.dualBrushTexturePreview = imagePreviewSrc(this.dualBrushTextureData);

    const jitter = preset.colorJitter;
    this.hueJitter = jitter?.hueJitter ?? 0;
    this.saturationJitter = jitter?.saturationJitter ?? 0;
    this.brightnessJitter = jitter?.brightnessJitter ?? 0;
    this.opacityJitter = jitter?.opacityJitter ?? 0;

    const wet = preset.wetEdges;
    this.wetEdgesEnabled = wet?.enabled ?? false;
    this.wetEdgeDarkness = wet?.edgeDarkness ?? 0.4;
    this.wetEdgeWidth = wet?.edgeWidth ?? 2;
    this.wetEdgeStrength = wet?.strength ?? 0.5;

    const st = preset.strokeTexture;
    this.strokeTextureEnabled = st?.enabled ?? false;
    this.strokeTextureTilingDensity = st?.texelsPerUnit ?? 0.5;
    this.strokeTextureEdgeSoftness = st?.edgeSoftness ?? 0.2;
    this.strokeTextureData = st?.textureData ?? '';
    this.strokeTextureSize = st?.textureSize ?? 256;
    this.strokeTexturePreview = imagePreviewSrc(this.strokeTextureData);

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
    this.textureScale = 1;
    this.textureStrength = 0.5;
    this.textureMode = 'multiply';
    this.textureFixed = false;
    this.textureSource = 'cold-press';
    this.textureImageData = '';
    this.tipIsImage = false;
    this.pullStringLength = 30;
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
