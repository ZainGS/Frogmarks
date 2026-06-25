import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

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

@Component({
  selector: 'app-ephemera-panel',
  templateUrl: './ephemera-panel.component.html',
  styleUrls: ['./ephemera-panel.component.scss'],
})
export class EphemeraPanel implements OnInit, OnChanges {
  @Input() shapeManager: any = null;
  @Input() vectorLayerId = '';
  @Output() closeRequest = new EventEmitter<void>();

  private get sm(): any { return this.shapeManager; }

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
  placeX = 0;
  placeY = 0;
  placeWidth = 200;
  placeHeight = 100;
  placeRotation = 0;
  placeOpacity = 1;
  placeBlendMode = 'source-over';

  // ── Existing placements ──────────────────────────────────────
  placements: EphemeraPlacement[] = [];
  editingPlacementId: string | null = null;
  editParams: Record<string, any> = {};
  editParamSchemaList: EphemeraParamSchemaEntry[] = [];
  editBlendMode = 'source-over';

  // ── Edit glow ────────────────────────────────────────────────
  editGlowEnabled = false;
  editGlowRadius = 6;
  editGlowColor = '#ffffff';
  editGlowOpacity = 0.8;

  // ── Edit feather ─────────────────────────────────────────────
  editFeatherEnabled = false;
  editFeatherMode: 'radial' | 'linear' = 'radial';
  editFeatherStart = 0.6;
  editFeatherEnd = 1.0;
  editFeatherAngle = 0;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    this.refresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['shapeManager'] || changes['vectorLayerId']) {
      this.refresh();
    }
  }

  refresh(): void {
    if (!this.sm) return;
    this.refreshCategories();
    this.refreshPlacements();
  }

  // ── Category / generator ─────────────────────────────────────

  refreshCategories(): void {
    this.categories = this.sm?.getEphemeraCategories?.() ?? [];
    if (this.categories.length > 0 && !this.activeCategoryId) {
      this.selectCategory(this.categories[0].id);
    }
  }

  selectCategory(id: string): void {
    this.activeCategoryId = id;
    this.generators = this.sm?.getEphemeraGeneratorsByCategory?.(id) ?? [];
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
    const gen = this.sm?.getEphemeraGenerator?.(typeId);
    this.paramSchemaList = gen?.getParamSchema?.() ?? [];
    this.params = {};
    for (const s of this.paramSchemaList) {
      this.params[s.key] = s.default;
    }
    const size = this.sm?.getDefaultPlacementSize?.(typeId);
    if (size) {
      this.placeWidth = size.width;
      this.placeHeight = size.height;
    }
    this.updatePreview();
  }

  updatePreview(): void {
    if (!this.activeGeneratorTypeId) { this.previewSvg = ''; return; }
    const svg: string = this.sm?.generateEphemera?.(this.activeGeneratorTypeId, this.params) ?? '';
    this.previewSvg = svg ? this.sanitizer.bypassSecurityTrustHtml(svg) : '';
  }

  // ── Schema helpers ────────────────────────────────────────────

  private schemaFor(list: EphemeraParamSchemaEntry[], key: string): EphemeraParamSchemaEntry | undefined {
    return list.find(s => s.key === key);
  }

  paramKeys(): string[] { return this.paramSchemaList.map(s => s.key); }
  paramLabel(key: string): string { return this.schemaFor(this.paramSchemaList, key)?.label ?? key; }
  paramType(key: string): string { return this.schemaFor(this.paramSchemaList, key)?.type ?? 'text'; }
  paramOptions(key: string): EphemeraParamOption[] { return this.schemaFor(this.paramSchemaList, key)?.options ?? []; }
  paramMin(key: string): number { return this.schemaFor(this.paramSchemaList, key)?.min ?? 0; }
  paramMax(key: string): number { return this.schemaFor(this.paramSchemaList, key)?.max ?? 100; }
  paramStep(key: string): number { return this.schemaFor(this.paramSchemaList, key)?.step ?? 1; }

  editParamKeys(): string[] { return this.editParamSchemaList.map(s => s.key); }
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

  // ── Place ─────────────────────────────────────────────────────

  placeCurrent(): void {
    if (!this.vectorLayerId || !this.activeGeneratorTypeId) return;
    this.sm?.addEphemeraPlacement?.(
      this.vectorLayerId,
      this.activeGeneratorTypeId,
      { ...this.params },
      this.placeX, this.placeY,
      this.placeWidth, this.placeHeight,
      this.placeRotation,
      this.placeOpacity,
      { blendMode: this.placeBlendMode },
    );
    this.refreshPlacements();
  }

  // ── Placements list ───────────────────────────────────────────

  refreshPlacements(): void {
    if (!this.vectorLayerId || !this.sm) { this.placements = []; return; }
    this.placements = this.sm?.getEphemeraPlacementsForLayer?.(this.vectorLayerId) ?? [];
  }

  startEdit(p: EphemeraPlacement): void {
    this.editingPlacementId = p.id;
    this.editParams = { ...p.params };
    this.editBlendMode = p.blendMode ?? 'source-over';
    this.editGlowEnabled = !!p.glow;
    this.editGlowRadius = p.glow?.radius ?? 6;
    this.editGlowColor = p.glow?.color ?? '#ffffff';
    this.editGlowOpacity = p.glow?.opacity ?? 0.8;
    this.editFeatherEnabled = !!p.feather;
    this.editFeatherMode = p.feather?.mode ?? 'radial';
    this.editFeatherStart = p.feather?.start ?? 0.6;
    this.editFeatherEnd = p.feather?.end ?? 1.0;
    this.editFeatherAngle = p.feather?.angle ?? 0;
    const gen = this.sm?.getEphemeraGenerator?.(p.typeId);
    this.editParamSchemaList = gen?.getParamSchema?.() ?? [];
  }

  commitEdit(): void {
    if (!this.editingPlacementId || !this.vectorLayerId) return;
    const glow = this.editGlowEnabled
      ? { radius: this.editGlowRadius, color: this.editGlowColor, opacity: this.editGlowOpacity }
      : null;
    const feather = this.editFeatherEnabled
      ? { mode: this.editFeatherMode, start: this.editFeatherStart, end: this.editFeatherEnd, ...(this.editFeatherMode === 'linear' ? { angle: this.editFeatherAngle } : {}) }
      : null;
    this.sm?.updateEphemeraPlacement?.(this.vectorLayerId, this.editingPlacementId, {
      params: { ...this.editParams },
      blendMode: this.editBlendMode,
      glow,
      feather,
    });
    this.editingPlacementId = null;
    this.refreshPlacements();
  }

  cancelEdit(): void { this.editingPlacementId = null; }

  deletePlacement(id: string, e: Event): void {
    e.stopPropagation();
    if (!this.vectorLayerId) return;
    this.sm?.deleteEphemeraPlacement?.(this.vectorLayerId, id);
    if (this.editingPlacementId === id) this.editingPlacementId = null;
    this.refreshPlacements();
  }

  rasterize(): void {
    this.sm?.rasterizeEphemeraLayer?.(this.vectorLayerId);
  }

  close(): void {
    this.closeRequest.emit();
  }
}
