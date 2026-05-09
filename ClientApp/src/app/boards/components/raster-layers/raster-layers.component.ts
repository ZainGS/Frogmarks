import { Component, OnInit, OnDestroy, HostListener, ElementRef, AfterViewInit, Output, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs';
import { RasterBrushService } from '../../../shared/services/raster/raster-brush.service';
import {
  RasterLayer,
  RasterLayerType,
  LayerBlendMode,
  BlendModeInfo,
  BLEND_MODE_OPTIONS,
  BLEND_MODE_CATEGORIES,
} from '../../models/brush-preset.model';

/** Flat display entry with computed depth for indentation */
export interface LayerDisplayEntry extends RasterLayer {
  depth: number;
}

@Component({
  selector: 'app-raster-layers',
  standalone: false,
  templateUrl: './raster-layers.component.html',
  styleUrl: './raster-layers.component.scss',
})
export class RasterLayersComponent implements OnInit, OnDestroy, AfterViewInit {

  constructor(private rasterService: RasterBrushService, private elRef: ElementRef) {}

  layers: RasterLayer[] = [];
  activeLayerId: string | null = null;
  selected3DSceneId: string | null = null;
  searchTerm = '';

  /** Emitted when the 3D scene entry is selected/deselected in the layer list */
  @Output() scene3dSelected = new EventEmitter<boolean>();

  /** Track layers by id for stable DOM nodes */
  trackById = (_: number, layer: RasterLayer) => layer.id;

  /** Blend mode dropdown helpers */
  blendModeOptions = BLEND_MODE_OPTIONS;
  blendModeCategories = BLEND_MODE_CATEGORIES;

  /** Inline-editing layer name */
  renamingLayerId: string | null = null;
  renameValue = '';

  /** Which layer's blend dropdown is open (null = none) */
  openBlendDropdownId: string | null = null;

  /** Add-layer dropdown */
  showAddMenu = false;

  /** Drag state */
  dragIndex: number | null = null;
  dragOverIndex: number | null = null;

  private subs: Subscription[] = [];

  ngAfterViewInit(): void {
  }

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

  get filteredLayers(): LayerDisplayEntry[] {
    const ordered = this.layers.slice().reverse();
    const entries = this._buildFlatTree(ordered);
    if (!this.searchTerm.trim()) return entries;
    const term = this.searchTerm.toLowerCase();
    return entries.filter(l => l.name.toLowerCase().includes(term));
  }

  /** Build a depth-annotated flat list from parent/child relationships */
  private _buildFlatTree(ordered: RasterLayer[]): LayerDisplayEntry[] {
    const result: LayerDisplayEntry[] = [];
    const depthMap = new Map<string, number>();

    // First pass: compute depth for each entry
    for (const l of ordered) {
      if (!l.parentId) {
        depthMap.set(l.id, 0);
      }
    }
    // Multi-pass for nested children (handles arbitrary nesting)
    let changed = true;
    while (changed) {
      changed = false;
      for (const l of ordered) {
        if (l.parentId && !depthMap.has(l.id) && depthMap.has(l.parentId)) {
          depthMap.set(l.id, (depthMap.get(l.parentId) ?? 0) + 1);
          changed = true;
        }
      }
    }

    // Build flat list, skipping children of collapsed folders
    const collapsedIds = new Set(ordered.filter(l => l.type === 'folder' && l.collapsed).map(l => l.id));

    for (const l of ordered) {
      // Check if any ancestor is collapsed
      let hidden = false;
      let pid = l.parentId;
      while (pid) {
        if (collapsedIds.has(pid)) { hidden = true; break; }
        const parent = ordered.find(p => p.id === pid);
        pid = parent?.parentId ?? null;
      }
      if (hidden) continue;

      result.push({ ...l, depth: depthMap.get(l.id) ?? 0 });
    }
    return result;
  }

  /** Whether a layer entry is paintable (only real layers are) */
  isPaintable(layer: RasterLayer): boolean {
    return !layer.type || layer.type === 'layer';
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

  /** Whether the active layer can be deleted (must have more than 1 real layer) */
  get canDeleteLayer(): boolean {
    return this.layers.filter(l => this.isPaintable(l)).length > 1;
  }

  /** Index of the currently active layer */
  get activeLayerIndex(): number {
    return this.layers.findIndex(l => l.id === this.activeLayerId);
  }

  // ── Selection ─────────────────────────────────────────────────

  selectLayer(id: string): void {
    const layer = this.layers.find(l => l.id === id);
    // 3D scene: highlight in UI and emit event, but don't select in engine
    if (layer?.type === '3d-scene') {
      this.selected3DSceneId = layer.id;
      this.activeLayerId = null;  // deselect raster layer visually
      this.scene3dSelected.emit(true);
      return;
    }
    // Folders are not selectable
    if (layer?.type === 'folder') return;
    // Deselect 3D scene when switching to a raster layer
    if (this.selected3DSceneId) {
      this.selected3DSceneId = null;
      this.scene3dSelected.emit(false);
    }
    this.rasterService.selectLayer(id);
  }

  // ── Add / Delete ──────────────────────────────────────────────

  addLayer(): void {
    this.rasterService.addLayer('Layer ' + (this.layers.length + 1));
  }

  deleteLayer(id: string): void {
    const layer = this.layers.find(l => l.id === id);
    if (layer?.type === '3d-scene') {
      this.rasterService.remove3DScene();
      this.selected3DSceneId = null;
      this.scene3dSelected.emit(false);
      return;
    }
    this.rasterService.deleteLayer(id);
  }

  // ── Folders ───────────────────────────────────────────────────

  addFolder(): void {
    this.rasterService.addFolder('Folder');
  }

  toggleFolderCollapse(layer: RasterLayer, e: MouseEvent): void {
    e.stopPropagation();
    this.rasterService.setFolderCollapsed(layer.id, !layer.collapsed);
  }

  // ── 3D Scene ──────────────────────────────────────────────────

  add3DScene(): void {
    this.rasterService.add3DScene();
    // Auto-select on the next layers$ emission (after service microtask)
    const sub = this.rasterService.layers$.subscribe(layers => {
      const scene = layers.find(l => l.type === '3d-scene');
      if (scene) {
        sub.unsubscribe();
        // Update local layers first so selectLayer's find works
        this.layers = layers;
        this.selectLayer(scene.id);
      }
    });
  }

  remove3DScene(e: MouseEvent): void {
    e.stopPropagation();
    this.rasterService.remove3DScene();
    this.selected3DSceneId = null;
    this.scene3dSelected.emit(false);
  }

  get has3DScene(): boolean {
    return this.layers.some(l => l.type === '3d-scene');
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
    if (layer.type === 'folder') {
      this.toggleFolderCollapse(layer, e);
      return;
    }
    if (layer.type === '3d-scene') {
      this.selectLayer(layer.id);
      return;
    }
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
      this.rasterService.setLayerName(layer.id, newName);
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
    const displayed = this.filteredLayers;
    const dragEntry = displayed[this.dragIndex];
    const dropEntry = displayed[dropIndex];
    if (!dragEntry || !dropEntry) { this.dragIndex = null; this.dragOverIndex = null; return; }

    // If dropped onto a folder → move layer into/out of the folder
    if (dropEntry.type === 'folder' && dragEntry.type !== 'folder' && dragEntry.type !== '3d-scene') {
      // If already a child of this folder, remove from folder
      if (dragEntry.parentId === dropEntry.id) {
        this.rasterService.setLayerParent(dragEntry.id, null);
      } else {
        this.rasterService.setLayerParent(dragEntry.id, dropEntry.id);
      }
      this.dragIndex = null;
      this.dragOverIndex = null;
      return;
    }

    // Otherwise reorder in the flat list
    const ids = this.layers.map(l => l.id);
    const realDrag = ids.indexOf(dragEntry.id);
    const realDrop = ids.indexOf(dropEntry.id);
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
