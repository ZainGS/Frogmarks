import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, AfterViewInit, SimpleChanges, NgZone, HostListener, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import ShapeManager from '@zaings/salsa/shape-manager';
import {
  ephemeraPlacementLabels, formatEphemeraSize, clampEphemeraSize, placementOriginForCentre, visibleCanvasCentre,
  EPHEMERA_MIN_SIZE, isEphemeraParamShown, EphemeraParamCondition,
} from './ephemera-panel.util';

/** Placement blend mode, derived from the engine's updateEphemeraPlacement signature. */
type EphemeraBlendMode = NonNullable<Parameters<ShapeManager['updateEphemeraPlacement']>[2]['blendMode']>;

export interface EphemeraCategory {
  id: string;
  displayName: string;
}

export interface EphemeraGenerator {
  typeId: string;
  displayName: string;
  description?: string;
}

export interface EphemeraParamOption {
  value: string;
  label: string;
}

export interface EphemeraParamSchemaEntry {
  key: string;
  label: string;
  type: 'select' | 'text' | 'range' | 'toggle' | 'color' | 'seed';
  default: any;
  options?: EphemeraParamOption[];
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  /** Show the row only while this holds against the current params (Salsa 2026-10-09; older dists omit it). */
  showIf?: EphemeraParamCondition | EphemeraParamCondition[];
}

export interface EphemeraGlow {
  radius: number;
  color: string;
  opacity: number;
}

export interface EphemeraFeather {
  mode: 'radial' | 'linear';
  start: number;
  end: number;
  angle?: number;
}

export interface EphemeraPlacement {
  id: string;
  typeId: string;
  params: Record<string, any>;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  blendMode?: string;
  glow?: EphemeraGlow | null;
  feather?: EphemeraFeather | null;
}

/** Glow + feather controls (shared by "place" and "edit"): `enabled` flags + values. */
export interface EphemeraFxState {
  glowEnabled: boolean;
  glowRadius: number;
  glowColor: string;
  glowOpacity: number;
  featherEnabled: boolean;
  featherMode: 'radial' | 'linear';
  featherStart: number;
  featherEnd: number;
  featherAngle: number;
}

function defaultFx(): EphemeraFxState {
  return {
    glowEnabled: false, glowRadius: 6, glowColor: '#ffffff', glowOpacity: 0.8,
    featherEnabled: false, featherMode: 'radial', featherStart: 0.6, featherEnd: 1.0, featherAngle: 0,
  };
}

function fxGlow(fx: EphemeraFxState): EphemeraGlow | null {
  return fx.glowEnabled ? { radius: fx.glowRadius, color: fx.glowColor, opacity: fx.glowOpacity } : null;
}

function fxFeather(fx: EphemeraFxState): EphemeraFeather | null {
  if (!fx.featherEnabled) return null;
  return { mode: fx.featherMode, start: fx.featherStart, end: fx.featherEnd, ...(fx.featherMode === 'linear' ? { angle: fx.featherAngle } : {}) };
}

/** Engine calls newer than the Salsa dist this host may be built against (each is optional — feature-detected). */
interface EphemeraEngineExtras {
  onEphemeraPlacementsChanged?: { subscribe(cb: (layerId: string) => void): { unsubscribe(): void } };
  interactionService?: { toWorldCoordsFromCanvas?(x: number, y: number): { x: number; y: number }; canvas?: HTMLCanvasElement };
}

@Component({
  selector: 'app-ephemera-panel',
  templateUrl: './ephemera-panel.component.html',
  styleUrls: ['./ephemera-panel.component.scss'],
})
export class EphemeraPanel implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @Input() shapeManager: ShapeManager = null;
  @Input() vectorLayerId = '';
  /** Dock beside the right column (Layers stays visible) instead of over it — wide screens only (see the SCSS). */
  @Input() besideRightPanel = false;
  @Output() closeRequest = new EventEmitter<void>();

  private get sm(): ShapeManager { return this.shapeManager; }
  private get engine(): EphemeraEngineExtras { return (this.shapeManager ?? {}) as unknown as EphemeraEngineExtras; }

  readonly minSize = EPHEMERA_MIN_SIZE;

  // ── Browse ───────────────────────────────────────────────────
  categories: EphemeraCategory[] = [];
  generators: EphemeraGenerator[] = [];
  activeCategoryId = '';
  activeGeneratorTypeId = '';

  readonly blendModeOptions = [
    { value: 'source-over', label: 'Normal' },
    { value: 'multiply',    label: 'Multiply' },
    { value: 'screen',      label: 'Screen' },
    { value: 'overlay',     label: 'Overlay' },
    { value: 'darken',      label: 'Darken' },
    { value: 'lighten',     label: 'Lighten' },
    { value: 'color-dodge', label: 'Color Dodge' },
    { value: 'color-burn',  label: 'Color Burn' },
  ];

  // ── New placement params ─────────────────────────────────────
  params: Record<string, any> = {};
  paramSchemaList: EphemeraParamSchemaEntry[] = [];
  previewSvg: SafeHtml = '';
  placeWidth = 0.5;
  placeHeight = 0.5;
  placeRotation = 0;
  placeOpacity = 1;
  placeBlendMode: EphemeraBlendMode = 'source-over';
  placeFx: EphemeraFxState = defaultFx();

  // ── Existing placements ──────────────────────────────────────
  placements: EphemeraPlacement[] = [];
  placementLabels: string[] = [];
  editingPlacementId: string | null = null;
  editParams: Record<string, any> = {};
  editParamSchemaList: EphemeraParamSchemaEntry[] = [];
  editBlendMode: EphemeraBlendMode = 'source-over';
  editFx: EphemeraFxState = defaultFx();

  private _placementsSub: { unsubscribe(): void } | null = null;

  constructor(private sanitizer: DomSanitizer, private zone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.refresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['shapeManager'] || changes['vectorLayerId']) {
      this.refresh();
    }
    if (changes['shapeManager']) this._subscribePlacements();
    if (changes['besideRightPanel'] && !changes['besideRightPanel'].firstChange) this._scheduleMeasure();
  }

  ngAfterViewInit(): void {
    this._scheduleMeasure();   // after the first layout (and outside this change-detection pass)
  }

  private _destroyed = false;
  private _scheduleMeasure(): void { setTimeout(() => { if (!this._destroyed) this._measureDock(); }); }

  /** Viewport px from the right edge to dock at: the right column's real left edge (its width varies with the theme
   *  and drawer mode). null = the stylesheet's position (over the column on narrow screens). */
  dockRight: number | null = null;

  @HostListener('window:resize')
  onWindowResize(): void { this._scheduleMeasure(); }

  private _measureDock(): void {
    let next: number | null = null;
    if (this.besideRightPanel && typeof window !== 'undefined' && window.innerWidth >= 900) {
      const rc = document.querySelector('.right-column') as HTMLElement | null;
      if (rc && rc.getClientRects().length > 0) next = Math.max(0, Math.round(window.innerWidth - rc.getBoundingClientRect().left));
    }
    if (next === this.dockRight) return;
    this.dockRight = next;
    this.cdr.detectChanges();   // the editor runs change detection sparingly; this is a layout-only update
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    this._placementsSub?.unsubscribe();
    this._placementsSub = null;
  }

  /** Ctrl+Z / Ctrl+Y (and canvas moves) change placements behind the panel's back: refresh the list when the engine
   *  says so (newer Salsa; an older dist has no event and the list refreshes on the panel's own actions). */
  private _subscribePlacements(): void {
    this._placementsSub?.unsubscribe();
    this._placementsSub = null;
    const ev = this.engine.onEphemeraPlacementsChanged;
    if (!ev || typeof ev.subscribe !== 'function') return;
    this._placementsSub = ev.subscribe((layerId: string) => {
      if (layerId !== this.vectorLayerId) return;
      this.zone.run(() => { this.refreshPlacements(); this.cdr.markForCheck(); });
    });
  }

  refresh(): void {
    if (!this.sm) return;
    this.refreshCategories();
    this.refreshPlacements();
  }

  // ── Category / generator ─────────────────────────────────────

  refreshCategories(): void {
    this.categories = this.sm?.getEphemeraCategories() ?? [];
    if (this.categories.length > 0 && !this.activeCategoryId) {
      this.selectCategory(this.categories[0].id);
    }
  }

  selectCategory(id: string): void {
    this.activeCategoryId = id;
    this.generators = this.sm?.getEphemeraGeneratorsByCategory(id) ?? [];
    if (this.generators.length > 0) {
      this.selectGenerator(this.generators[0].typeId);
    } else {
      this.activeGeneratorTypeId = '';
      this.params = {};
      this.paramSchemaList = [];
      this.previewSvg = '';
    }
  }

  selectGenerator(typeId: string): void {
    this.activeGeneratorTypeId = typeId;
    const gen = this.sm?.getEphemeraGenerator(typeId);
    this.paramSchemaList = (gen?.getParamSchema?.() ?? []) as any;
    this.params = {};
    for (const s of this.paramSchemaList) {
      this.params[s.key] = s.default;
    }
    const size = this.sm?.getDefaultPlacementSize(typeId);
    if (size) {
      // World units at the current zoom; 3 decimals is plenty and keeps the inputs readable
      this.placeWidth = Math.max(EPHEMERA_MIN_SIZE, +size.width.toFixed(3));
      this.placeHeight = Math.max(EPHEMERA_MIN_SIZE, +size.height.toFixed(3));
    }
    this.updatePreview();
  }

  get activeGeneratorName(): string {
    return this.generators.find(g => g.typeId === this.activeGeneratorTypeId)?.displayName ?? '';
  }

  updatePreview(): void {
    if (!this.activeGeneratorTypeId) { this.previewSvg = ''; return; }
    const svg: string = this.sm?.generateEphemera(this.activeGeneratorTypeId, this.params) ?? '';
    this.previewSvg = svg ? this.sanitizer.bypassSecurityTrustHtml(svg) : '';
  }

  // ── Schema helpers ────────────────────────────────────────────

  private schemaFor(list: EphemeraParamSchemaEntry[], key: string): EphemeraParamSchemaEntry | undefined {
    return list.find(s => s.key === key);
  }

  /** Rows to show: the generator's params minus the ones it ignores in the current state (schema `showIf`). */
  paramKeys(): string[] {
    return this.paramSchemaList.filter(s => isEphemeraParamShown(s, this.params, this.paramSchemaList)).map(s => s.key);
  }
  paramLabel(key: string): string { return this.schemaFor(this.paramSchemaList, key)?.label ?? key; }
  paramType(key: string): string { return this.schemaFor(this.paramSchemaList, key)?.type ?? 'text'; }
  paramOptions(key: string): EphemeraParamOption[] { return this.schemaFor(this.paramSchemaList, key)?.options ?? []; }
  paramMin(key: string): number { return this.schemaFor(this.paramSchemaList, key)?.min ?? 0; }
  paramMax(key: string): number { return this.schemaFor(this.paramSchemaList, key)?.max ?? 100; }
  paramStep(key: string): number { return this.schemaFor(this.paramSchemaList, key)?.step ?? 1; }

  editParamKeys(): string[] {
    return this.editParamSchemaList.filter(s => isEphemeraParamShown(s, this.editParams, this.editParamSchemaList)).map(s => s.key);
  }
  editParamLabel(key: string): string { return this.schemaFor(this.editParamSchemaList, key)?.label ?? key; }
  editParamType(key: string): string { return this.schemaFor(this.editParamSchemaList, key)?.type ?? 'text'; }
  editParamOptions(key: string): EphemeraParamOption[] { return this.schemaFor(this.editParamSchemaList, key)?.options ?? []; }
  editParamMin(key: string): number { return this.schemaFor(this.editParamSchemaList, key)?.min ?? 0; }
  editParamMax(key: string): number { return this.schemaFor(this.editParamSchemaList, key)?.max ?? 100; }
  editParamStep(key: string): number { return this.schemaFor(this.editParamSchemaList, key)?.step ?? 1; }

  // ── Param change ──────────────────────────────────────────────

  onParamChange(key: string, value: any, type: string): void {
    this.params[key] = type === 'range' || type === 'seed' ? +value : value;
    this.updatePreview();
  }

  onEditParamChange(key: string, value: any, type: string): void {
    this.editParams[key] = type === 'range' || type === 'seed' ? +value : value;
  }

  // ── Color + alpha helpers ─────────────────────────────────────

  getColorHex(key: string): string { return this._hex6(this.params[key]); }
  getColorAlpha(key: string): number { return this._alpha(this.params[key]); }
  onColorChange(key: string, hex6: string): void {
    this.params[key] = this._hex8(hex6, this._alpha(this.params[key]));
    this.updatePreview();
  }
  onColorAlphaChange(key: string, alpha: number): void {
    this.params[key] = this._hex8(this._hex6(this.params[key]), alpha);
    this.updatePreview();
  }

  getEditColorHex(key: string): string { return this._hex6(this.editParams[key]); }
  getEditColorAlpha(key: string): number { return this._alpha(this.editParams[key]); }
  onEditColorChange(key: string, hex6: string): void {
    this.editParams[key] = this._hex8(hex6, this._alpha(this.editParams[key]));
  }
  onEditColorAlphaChange(key: string, alpha: number): void {
    this.editParams[key] = this._hex8(this._hex6(this.editParams[key]), alpha);
  }

  private _hex6(val: string): string {
    if (!val || !val.startsWith('#')) return '#000000';
    return val.slice(0, 7);
  }

  private _alpha(val: string): number {
    if (!val || val.length < 9) return 1;
    const n = parseInt(val.slice(7, 9), 16);
    return isNaN(n) ? 1 : +(n / 255).toFixed(2);
  }

  private _hex8(hex6: string, alpha: number): string {
    const aa = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
      .toString(16).padStart(2, '0');
    return (hex6 || '#000000').slice(0, 7) + aa;
  }

  // ── Size inputs ───────────────────────────────────────────────

  onPlaceWidthChange(v: unknown): void { this.placeWidth = clampEphemeraSize(v, this.placeWidth); }
  onPlaceHeightChange(v: unknown): void { this.placeHeight = clampEphemeraSize(v, this.placeHeight); }

  // ── Place ─────────────────────────────────────────────────────

  /** The world point at the centre of what the user can see of the canvas (the right column / this panel excluded). */
  private _viewCentreWorld(): { x: number; y: number } {
    const is = this.engine.interactionService;
    const canvas = is?.canvas;
    if (!canvas || typeof is?.toWorldCoordsFromCanvas !== 'function' || typeof canvas.getBoundingClientRect !== 'function') {
      return { x: 0, y: 0 };   // artboard centre
    }
    const r = canvas.getBoundingClientRect();
    const covered: number[] = [];
    for (const sel of ['.right-column', '.ep-panel']) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el || el.getClientRects().length === 0) continue;   // display:none (offsetParent is null for fixed too)
      const er = el.getBoundingClientRect();
      if (er.width > 0 && er.height > 0) covered.push(er.left);
    }
    const c = visibleCanvasCentre({ left: r.left, top: r.top, width: r.width, height: r.height }, covered);
    const w = is.toWorldCoordsFromCanvas(c.x, c.y);
    return Number.isFinite(w?.x) && Number.isFinite(w?.y) ? w : { x: 0, y: 0 };
  }

  placeCurrent(): void {
    if (!this.vectorLayerId || !this.activeGeneratorTypeId || !this.sm) return;
    const w = clampEphemeraSize(this.placeWidth, 0.5);
    const h = clampEphemeraSize(this.placeHeight, 0.5);
    const { x, y } = placementOriginForCentre(this._viewCentreWorld(), w, h);
    const style = { blendMode: this.placeBlendMode, glow: fxGlow(this.placeFx), feather: fxFeather(this.placeFx) };
    // The 10th argument (blend / glow / feather in the same undo step) is new in Salsa 2026-10-07; an older dist
    // ignores it, so whatever didn't land is applied after (as before: a second call)
    const add = this.sm.addEphemeraPlacement as unknown as (...a: unknown[]) => EphemeraPlacement | null;
    const placed = add.call(this.sm, this.vectorLayerId, this.activeGeneratorTypeId, { ...this.params },
      x, y, w, h, this.placeRotation, this.placeOpacity, style);
    if (placed) {
      const missing: Record<string, unknown> = {};
      if ((placed.blendMode ?? 'source-over') !== style.blendMode) missing['blendMode'] = style.blendMode;
      if (!!placed.glow !== !!style.glow) missing['glow'] = style.glow;
      if (!!placed.feather !== !!style.feather) missing['feather'] = style.feather;
      if (Object.keys(missing).length) this.sm.updateEphemeraPlacement(this.vectorLayerId, placed.id, missing as any);
    }
    this.refreshPlacements();
  }

  // ── Placements list ───────────────────────────────────────────

  refreshPlacements(): void {
    if (!this.vectorLayerId || !this.sm) { this.placements = []; this.placementLabels = []; return; }
    this.placements = [...((this.sm?.getEphemeraPlacementsForLayer(this.vectorLayerId) ?? []) as any)];
    this.placementLabels = ephemeraPlacementLabels(this.placements, (t) => this.sm?.getEphemeraGenerator(t)?.displayName);
    if (this.editingPlacementId && !this.placements.some(p => p.id === this.editingPlacementId)) this.editingPlacementId = null;
  }

  placementSize(p: EphemeraPlacement): string { return formatEphemeraSize(p.width, p.height); }

  trackPlacement(_i: number, p: EphemeraPlacement): string { return p.id; }

  startEdit(p: EphemeraPlacement): void {
    this.editingPlacementId = p.id;
    this.editParams = { ...p.params };
    // Host EphemeraPlacement types blendMode as string (TODO: align host interfaces with the engine's)
    this.editBlendMode = (p.blendMode ?? 'source-over') as EphemeraBlendMode;
    const d = defaultFx();
    this.editFx = {
      glowEnabled: !!p.glow,
      glowRadius: p.glow?.radius ?? d.glowRadius,
      glowColor: p.glow?.color ?? d.glowColor,
      glowOpacity: p.glow?.opacity ?? d.glowOpacity,
      featherEnabled: !!p.feather,
      featherMode: p.feather?.mode ?? d.featherMode,
      featherStart: p.feather?.start ?? d.featherStart,
      featherEnd: p.feather?.end ?? d.featherEnd,
      featherAngle: p.feather?.angle ?? d.featherAngle,
    };
    const gen = this.sm?.getEphemeraGenerator(p.typeId);
    this.editParamSchemaList = (gen?.getParamSchema?.() ?? []) as any;
  }

  commitEdit(): void {
    if (!this.editingPlacementId || !this.vectorLayerId) return;
    this.sm?.updateEphemeraPlacement(this.vectorLayerId, this.editingPlacementId, {
      params: { ...this.editParams },
      blendMode: this.editBlendMode,
      glow: fxGlow(this.editFx),
      feather: fxFeather(this.editFx),
    });
    this.editingPlacementId = null;
    this.refreshPlacements();
  }

  cancelEdit(): void { this.editingPlacementId = null; }

  deletePlacement(id: string, e: Event): void {
    e.stopPropagation();
    if (!this.vectorLayerId) return;
    this.sm?.deleteEphemeraPlacement(this.vectorLayerId, id);
    if (this.editingPlacementId === id) this.editingPlacementId = null;
    this.refreshPlacements();
  }

  async rasterize(): Promise<void> {
    await this.sm?.rasterizeEphemeraLayer(this.vectorLayerId);
    this.refreshPlacements();
  }

  close(): void {
    this.closeRequest.emit();
  }
}
