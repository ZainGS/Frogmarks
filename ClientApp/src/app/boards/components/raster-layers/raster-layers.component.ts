import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Subscription } from 'rxjs';
import { RasterBrushService } from '../../../shared/services/raster/raster-brush.service';
import {
  RasterLayer,
  LayerBlendMode,
  BlendModeInfo,
  BLEND_MODE_OPTIONS,
  BLEND_MODE_CATEGORIES,
} from '../../models/brush-preset.model';

@Component({
  selector: 'app-raster-layers',
  standalone: false,
  templateUrl: './raster-layers.component.html',
  styleUrl: './raster-layers.component.scss',
})
export class RasterLayersComponent implements OnInit, OnDestroy {

  layers: RasterLayer[] = [];
  activeLayerId: string | null = null;
  searchTerm = '';

  /** Blend mode dropdown helpers */
  blendModeOptions = BLEND_MODE_OPTIONS;
  blendModeCategories = BLEND_MODE_CATEGORIES;

  /** Inline-editing layer name */
  renamingLayerId: string | null = null;
  renameValue = '';

  /** Which layer's blend dropdown is open (null = none) */
  openBlendDropdownId: string | null = null;

  /** Drag state */
  dragIndex: number | null = null;
  dragOverIndex: number | null = null;

  private subs: Subscription[] = [];

  constructor(private rasterService: RasterBrushService) {}

  // ── Lifecycle ─────────────────────────────────────────────────

  ngOnInit(): void {
    this.rasterService.refreshLayers();
    this.subs.push(
      this.rasterService.layers$.subscribe(l => (this.layers = l)),
      this.rasterService.activeLayerId$.subscribe(id => (this.activeLayerId = id))
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ── Keyboard shortcuts ────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.key === '/' && !this._isInputFocused()) {
      e.preventDefault();
      this.toggleLockTransparencyOnActive();
    }
  }

  // ── Computed ──────────────────────────────────────────────────

  get filteredLayers(): RasterLayer[] {
    const ordered = this.layers.slice().reverse();
    if (!this.searchTerm.trim()) return ordered;
    const term = this.searchTerm.toLowerCase();
    return ordered.filter(l => l.name.toLowerCase().includes(term));
  }

  /** Get blend mode label for display */
  getBlendLabel(mode: LayerBlendMode): string {
    return BLEND_MODE_OPTIONS.find(o => o.value === mode)?.label ?? 'Normal';
  }

  /** Group options by category for the dropdown */
  optionsForCategory(cat: string): BlendModeInfo[] {
    return BLEND_MODE_OPTIONS.filter(o => o.category === cat);
  }

  /** Whether this layer is the bottom-most (index 0) — can't clip */
  isBottomLayer(layer: RasterLayer): boolean {
    return this.layers.length > 0 && this.layers[this.layers.length - 1]?.id === layer.id;
  }

  /** Whether the active layer can be deleted (must have more than 1 layer) */
  get canDeleteLayer(): boolean {
    return this.layers.length > 1;
  }

  /** Index of the currently active layer */
  get activeLayerIndex(): number {
    return this.layers.findIndex(l => l.id === this.activeLayerId);
  }

  // ── Selection ─────────────────────────────────────────────────

  selectLayer(id: string): void {
    this.rasterService.selectLayer(id);
  }

  // ── Add / Delete ──────────────────────────────────────────────

  addLayer(): void {
    this.rasterService.addLayer('Layer ' + (this.layers.length + 1));
  }

  deleteLayer(id: string): void {
    this.rasterService.deleteLayer(id);
  }

  // ── Visibility ────────────────────────────────────────────────

  toggleVisibility(layer: RasterLayer, e: MouseEvent): void {
    e.stopPropagation();
    this.rasterService.setLayerVisibility(layer.id, !layer.visible);
  }

  // ── Blend mode ────────────────────────────────────────────────

  /** Position for the fixed blend dropdown */
  blendDropdownStyle: { [key: string]: string } = {};

  toggleBlendDropdown(layerId: string, e: MouseEvent): void {
    e.stopPropagation();
    if (this.openBlendDropdownId === layerId) {
      this.openBlendDropdownId = null;
      return;
    }
    this.openBlendDropdownId = layerId;
    // Calculate fixed position from the button element
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const maxHeight = Math.min(window.innerHeight * 0.6, 400);
    // Try to open upward from button
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceAbove >= maxHeight || spaceAbove > spaceBelow) {
      // Open upward
      this.blendDropdownStyle = {
        left: rect.left + 'px',
        bottom: (window.innerHeight - rect.top + 2) + 'px',
        top: 'auto',
        'max-height': Math.min(spaceAbove - 8, maxHeight) + 'px',
      };
    } else {
      // Open downward
      this.blendDropdownStyle = {
        left: rect.left + 'px',
        top: (rect.bottom + 2) + 'px',
        bottom: 'auto',
        'max-height': Math.min(spaceBelow - 8, maxHeight) + 'px',
      };
    }
  }

  setBlendMode(layer: RasterLayer, mode: LayerBlendMode, e: MouseEvent): void {
    e.stopPropagation();
    this.rasterService.setLayerBlendMode(layer.id, mode);
    this.openBlendDropdownId = null;
  }

  // ── Opacity ───────────────────────────────────────────────────

  onOpacityChange(layer: RasterLayer, event: Event): void {
    const val = +(event.target as HTMLInputElement).value;
    this.rasterService.setLayerOpacity(layer.id, val / 100);
  }

  // ── Clipping mask ─────────────────────────────────────────────

  toggleClipping(layer: RasterLayer, e: MouseEvent): void {
    e.stopPropagation();
    this.rasterService.setLayerClipping(layer.id, !layer.clipped);
  }

  /** Alt+Click on a layer row toggles clipping (Photoshop convention) */
  onLayerRowClick(layer: RasterLayer, e: MouseEvent): void {
    if (e.altKey) {
      this.toggleClipping(layer, e);
      return;
    }
    this.selectLayer(layer.id);
  }

  // ── Lock transparency ─────────────────────────────────────────

  toggleLockTransparency(layer: RasterLayer, e: MouseEvent): void {
    e.stopPropagation();
    this.rasterService.setLayerLockTransparency(layer.id, !layer.lockTransparency);
  }

  toggleLockTransparencyOnActive(): void {
    if (!this.activeLayerId) return;
    const layer = this.layers.find(l => l.id === this.activeLayerId);
    if (layer) {
      this.rasterService.setLayerLockTransparency(layer.id, !layer.lockTransparency);
    }
  }

  // ── Rename ────────────────────────────────────────────────────

  startRename(layer: RasterLayer, e: MouseEvent): void {
    e.stopPropagation();
    this.renamingLayerId = layer.id;
    this.renameValue = layer.name;
  }

  commitRename(layer: RasterLayer): void {
    const newName = this.renameValue.trim();
    if (newName && newName !== layer.name) {
      layer.name = newName;
      // Engine rename not exposed — name is UI-only for now
    }
    this.renamingLayerId = null;
  }

  cancelRename(): void {
    this.renamingLayerId = null;
  }

  // ── Reorder (buttons) ────────────────────────────────────────

  moveUp(index: number): void {
    if (index <= 0) return;
    const ids = this.layers.map(l => l.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    this.rasterService.reorderLayers(ids);
  }

  moveDown(index: number): void {
    if (index >= this.layers.length - 1) return;
    const ids = this.layers.map(l => l.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    this.rasterService.reorderLayers(ids);
  }

  // ── Reorder (drag & drop) ────────────────────────────────────

  onDragStart(index: number): void {
    this.dragIndex = index;
  }

  onDragOver(index: number, e: DragEvent): void {
    e.preventDefault();
    this.dragOverIndex = index;
  }

  onDragLeave(): void {
    this.dragOverIndex = null;
  }

  onDrop(dropIndex: number): void {
    if (this.dragIndex === null || this.dragIndex === dropIndex) {
      this.dragIndex = null;
      this.dragOverIndex = null;
      return;
    }
    // filteredLayers is reversed — map display indices back to this.layers indices
    const displayed = this.filteredLayers;
    const dragId = displayed[this.dragIndex]?.id;
    const dropId = displayed[dropIndex]?.id;
    if (!dragId || !dropId) { this.dragIndex = null; this.dragOverIndex = null; return; }
    const ids = this.layers.map(l => l.id);
    const realDrag = ids.indexOf(dragId);
    const realDrop = ids.indexOf(dropId);
    if (realDrag < 0 || realDrop < 0) { this.dragIndex = null; this.dragOverIndex = null; return; }
    const [moved] = ids.splice(realDrag, 1);
    ids.splice(realDrop, 0, moved);
    this.rasterService.reorderLayers(ids);
    this.dragIndex = null;
    this.dragOverIndex = null;
  }

  onDragEnd(): void {
    this.dragIndex = null;
    this.dragOverIndex = null;
  }

  // ── Helpers ───────────────────────────────────────────────────

  private _isInputFocused(): boolean {
    const tag = document.activeElement?.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }
}
