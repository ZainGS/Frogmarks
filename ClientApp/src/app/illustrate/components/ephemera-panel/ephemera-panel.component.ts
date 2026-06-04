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

  // ── Existing placements ──────────────────────────────────────
  placements: EphemeraPlacement[] = [];
  editingPlacementId: string | null = null;
  editParams: Record<string, any> = {};
  editParamSchemaList: EphemeraParamSchemaEntry[] = [];

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
    const gen = this.sm?.getEphemeraGenerator?.(p.typeId);
    this.editParamSchemaList = gen?.getParamSchema?.() ?? [];
  }

  commitEdit(): void {
    if (!this.editingPlacementId || !this.vectorLayerId) return;
    this.sm?.updateEphemeraPlacement?.(this.vectorLayerId, this.editingPlacementId, { params: { ...this.editParams } });
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
