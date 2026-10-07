import { Component, OnInit, OnDestroy, HostListener, ElementRef, AfterViewInit, Input, Output, EventEmitter, NgZone, ChangeDetectorRef, inject } from '@angular/core';
import { OverlayManagerService, insideElement } from '../../../shared/services/overlay/overlay-manager.service';
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
import ShapeManager from '@zaings/salsa/shape-manager';
import { TouchUiService } from '../../../illustrate/services/touch-ui.service';

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

  constructor(private rasterService: RasterBrushService, private elRef: ElementRef, private ngZone: NgZone, private cdr: ChangeDetectorRef,
              /** `touchUi.coarse` (primary pointer is a finger) swaps each row's inline opacity slider for a % button. */
              readonly touchUi: TouchUiService) {}

  layers: RasterLayer[] = [];
  activeLayerId: string | null = null;
  selected3DSceneId: string | null = null;
  searchTerm = '';

  @Input() shapeManager: ShapeManager = null;
  /** The host editor's Play mode owns the keyboard: skip the layer hotkeys. */
  @Input() hotkeysSuspended = false;

  /** Emitted when the 3D scene entry is selected/deselected in the layer list */
  @Output() scene3dSelected = new EventEmitter<boolean>();

  /** Emitted when a vector layer is selected (null = deselected) */
  @Output() vectorLayerSelected = new EventEmitter<string | null>();

  vectorLayers: RasterLayer[] = [];
  /**
   * The EDITOR's active vector layer — the single source of truth (UI review 2026-10-07 #6). This panel sits in an
   * *ngIf, so a right-panel tab switch re-creates it; its own copy used to restart at null while the editor stayed in
   * vector mode (highlight on Background, vector tools on the rail) and a Background click then did nothing.
   * Written locally only together with a vectorLayerSelected emit, so the binding confirms the same value.
   */
  @Input() activeVectorLayerId: string | null = null;
  /** The editor's 3D-scene selection (editorState.scene3dPanelVisible) — same reason as activeVectorLayerId. */
  @Input() scene3dActive = false;

  /** Undo toast for the last vector-layer ✕ (the engine records the removal as one 2D undo step). */
  removedVectorLayer: { id: string; name: string; wasActive: boolean } | null = null;
  private _removedToastTimer: ReturnType<typeof setTimeout> | null = null;
  /** Older Salsa dist (a removal it can't undo): the ✕ first turns into "Remove?" for this layer id. */
  confirmRemoveVectorLayerId: string | null = null;
  /** How long the Undo toast stays up. */
  static readonly REMOVED_TOAST_MS = 8000;

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
  dragOverPosition: 'before' | 'after' = 'before';

  private subs: Subscription[] = [];

  ngAfterViewInit(): void {
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  ngOnInit(): void {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('resize', this._onWinResize);
      document.addEventListener('keydown', this._onDocKeyDownOutsideZone);
    });
    this.rasterService.refreshLayers();
    this.subs.push(
      this.rasterService.layers$.subscribe(l => {
        this.vectorLayers = l.filter(x => x.type === 'vector' && !x.systemOwner);
        this.layers = l.filter(x => x.type !== 'vector' && !x.systemOwner);
        this._pruneOpenOpacitySliders();
        setTimeout(() => {
          this._reconcileActiveVectorLayer();
          if (!this._hasRasterRowSelection() && !this.selected3DSceneId && !this.scene3dActive && !this.activeVectorLayerId) this._autoSelectDefault();
        }, 0);
      }),
      this.rasterService.activeLayerId$.subscribe(id => (this.activeLayerId = id))
    );
    // "+ Add" and the blend-mode dropdown join the overlay manager: Esc / a tap outside the panel closes them (the
    // canvas swallows the click the document listener below waits for), one overlay at a time (UI review §3 item 2).
    this._unregisterOverlay = this.overlays.register({
      id: 'raster-layers',
      isOpen: () => this.showAddMenu || this.openBlendDropdownId !== null,
      close: () => { this.showAddMenu = false; this.openBlendDropdownId = null; },
      contains: insideElement(() => this.elRef.nativeElement as HTMLElement),
    });
  }

  private readonly overlays = inject(OverlayManagerService);
  private _unregisterOverlay: (() => void) | null = null;

  /** The service's active layer is one of this panel's rows. An id it doesn't list (the Vector entry an older
   *  RasterBrushService auto-picked as `layers[0]` in a new document) highlighted nothing and painted nowhere. */
  private _hasRasterRowSelection(): boolean {
    if (!this.activeLayerId) return false;
    return !this.layers.length || this.layers.some(l => l.id === this.activeLayerId);
  }

  private _autoSelectDefault(): void {
    // topmost PAINT layer (last in array = visually highest). Never a folder: selectLayer ignores folders, so
    // picking one selected nothing and left no row highlighted.
    const paintable = this.layers.filter(l => this.isPaintable(l));
    if (paintable.length) { this.selectLayer(paintable[paintable.length - 1].id); return; }
    // fallback: any other non-vector, non-folder entry (3D scene, reference)
    const other = this.layers.filter(l => l.type !== 'folder');
    if (other.length) { this.selectLayer(other[other.length - 1].id); return; }
    // fallback: vector layer
    if (this.vectorLayers.length) { this.selectVectorLayer(this.vectorLayers[0].id); }
  }

  /** The active vector layer left the stack (a redo of its removal, another document): leave vector mode, so the
   *  editor doesn't stay on vector tools for a layer that no longer exists. Checked against the engine, which also
   *  knows the package-owned vector layers this panel filters out. */
  private _reconcileActiveVectorLayer(): void {
    const id = this.activeVectorLayerId;
    const sm = this.shapeManager as unknown as { getVectorLayers?: () => Array<{ id: string }> } | null;
    if (!id || typeof sm?.getVectorLayers !== 'function') return;
    if (!sm.getVectorLayers().some(v => v.id === id)) this.deselectVectorLayer();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this._onWinResize);
    document.removeEventListener('keydown', this._onDocKeyDownOutsideZone);
    this.subs.forEach(s => s.unsubscribe());
    this._clearRemovedToastTimer();
    this._unregisterOverlay?.(); this._unregisterOverlay = null;
  }

  // A tap / click anywhere else closes the add menu, the blend-mode dropdown and a pending "Remove?" (their own
  // clicks stopPropagation).
  @HostListener('document:click') onDocClick() { this.showAddMenu = false; this.openBlendDropdownId = null; this.confirmRemoveVectorLayerId = null; }
  /** Window resize closes the blend dropdown. Listened outside the zone (mobile URL bars fire resizes constantly);
   *  re-enter only when a dropdown is open. */
  private readonly _onWinResize = (): void => {
    if (this.openBlendDropdownId !== null) this.ngZone.run(() => { this.openBlendDropdownId = null; });
  };

  // ── Keyboard shortcuts ────────────────────────────────────────

  /** Document keydown, listened OUTSIDE the zone (registered in ngOnInit; zone audit item 2): as a @HostListener every
   *  key in the editor — each WASD auto-repeat in Play too — ran an app change detection. Enters only for the two
   *  shortcuts below; a repeat only claims Ctrl+J (no state change), so it stays outside. */
  private readonly _onDocKeyDownOutsideZone = (e: KeyboardEvent): void => {
    if (this.hotkeysSuspended) return;
    if (e.key !== '/' && !((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J'))) return;
    if (e.repeat) this.onKeyDown(e);
    else this.ngZone.run(() => this.onKeyDown(e));
  };

  onKeyDown(e: KeyboardEvent): void {
    if (this.hotkeysSuspended) return;
    // Both shortcuts act once per press: a held / toggled lock transparency on and off, a held Ctrl+J duplicated the
    // layer ~30×/s. (A held Ctrl+J stays claimed below.)
    if (e.repeat) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J') && !this._isInputFocused()) e.preventDefault();
      return;
    }
    if (e.key === '/' && !this._isInputFocused()) {
      e.preventDefault();
      this.toggleLockTransparencyOnActive();
    }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === 'j' || e.key === 'J') && !this._isInputFocused()) {
      e.preventDefault();
      this.duplicateActiveLayer();
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

  /** Whether the active layer can be merged down (needs a paintable layer below it) */
  get canMergeDown(): boolean {
    if (!this.activeLayerId) return false;
    const idx = this.layers.findIndex(l => l.id === this.activeLayerId);
    if (idx < 0 || idx >= this.layers.length - 1) return false;
    return this.isPaintable(this.layers[idx + 1]);
  }

  /** Index of the currently active layer */
  get activeLayerIndex(): number {
    return this.layers.findIndex(l => l.id === this.activeLayerId);
  }

  // ── Selection ─────────────────────────────────────────────────

  /** Is this raster-list row the highlighted one? Only one row (vector, 3D scene or raster) reads as active. */
  isRowActive(layer: RasterLayer): boolean {
    if (layer.type === '3d-scene') return this.selected3DSceneId === layer.id || (this.scene3dActive && !this.activeVectorLayerId);
    return !this.activeVectorLayerId && !this.selected3DSceneId && !this.scene3dActive && this.activeLayerId === layer.id;
  }

  selectLayer(id: string): void {
    const layer = this.layers.find(l => l.id === id);
    // 3D scene: highlight in UI and emit event, but don't select in engine
    if (layer?.type === '3d-scene') {
      this.selected3DSceneId = layer.id;
      this.activeLayerId = null;
      // Clear vector layer so only one row appears active at a time
      this.deselectVectorLayer();
      this.scene3dSelected.emit(true);
      return;
    }
    // Folders are not selectable
    if (layer?.type === 'folder') return;
    this._leave3DAndVector();
    this.rasterService.selectLayer(id);
  }

  /** A raster pick ALWAYS takes the editor out of vector / 3D mode — whatever this panel's own copy says (a
   *  re-created panel used to skip the emit, leaving the editor on vector tools: UI review 2026-10-07 #6). */
  private _leave3DAndVector(): void {
    if (this.selected3DSceneId || this.scene3dActive) {
      this.selected3DSceneId = null;
      this.scene3dSelected.emit(false);
    }
    this.deselectVectorLayer();
  }

  // ── Add / Delete ──────────────────────────────────────────────

  addLayer(): void {
    // Deselect 3D scene / vector layer so the new 2D layer becomes active
    this._leave3DAndVector();
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

  duplicateActiveLayer(): void {
    if (!this.activeLayerId) return;
    this.rasterService.duplicateLayer(this.activeLayerId);
  }

  mergeActiveLayerDown(): void {
    if (!this.activeLayerId || !this.canMergeDown) return;
    this.rasterService.mergeLayerDown(this.activeLayerId);
  }

  triggerReferenceImagePicker(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        this.rasterService.addReferenceImageLayer(file.name.replace(/\.[^.]+$/, ''), file);
      }
    };
    input.click();
    this.showAddMenu = false;
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

  scene3dVisible = true;

  toggle3DSceneVisible(e: MouseEvent): void {
    e.stopPropagation();
    this.scene3dVisible = !this.scene3dVisible;
    const sm = this.shapeManager;
    sm.scene3DVisible = this.scene3dVisible;
    // A hidden scene must not stay hoverable/pickable — detach pointer handling.
    if (!this.scene3dVisible) {
      sm.disableTransformControls3D();
      sm.setHoveredMesh3D(null);
    } else if (this.selected3DSceneId) {
      sm.enableTransformControls3D();
    }
  }

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

  // ── Vector Layers ─────────────────────────────────────────────

  addVectorLayer(): void {
    const id: string | undefined = this.shapeManager?.addVectorLayer('Vector Layer');
    if (id) {
      this.shapeManager?.setActiveVectorLayer(id);
      this.activeVectorLayerId = id;
      this.vectorLayerSelected.emit(id);
    }
    this.showAddMenu = false;
  }

  selectVectorLayer(id: string): void {
    this.activeVectorLayerId = id;
    this.activeLayerId = null;
    this.selected3DSceneId = null;
    this.scene3dSelected.emit(false);
    this.shapeManager?.setActiveVectorLayer(id);
    this.vectorLayerSelected.emit(id);
  }

  deselectVectorLayer(): void {
    this.activeVectorLayerId = null;
    this.shapeManager?.setActiveVectorLayer(null);
    this.vectorLayerSelected.emit(null);
  }

  /** The engine removes a vector layer WITH its shapes + placements as one undoable step (Salsa 2026-10-07). An older
   *  dist dropped only the entry + placements and recorded nothing, so there the ✕ asks first instead. */
  get vectorRemovalUndoable(): boolean {
    const rlm = (this.shapeManager as unknown as { rasterLayerManager?: { takeVectorLayer?: unknown } } | null)?.rasterLayerManager;
    return typeof rlm?.takeVectorLayer === 'function';
  }

  /** The row's ✕: removes the layer (Undo toast + Ctrl+Z), or on an older engine first asks "Remove?". */
  removeVectorLayer(id: string, e: Event): void {
    e.stopPropagation();
    this.showAddMenu = false;
    this.openBlendDropdownId = null;
    if (!this.vectorRemovalUndoable && this.confirmRemoveVectorLayerId !== id) {
      this.confirmRemoveVectorLayerId = id;
      return;
    }
    this.confirmRemoveVectorLayerId = null;
    const name = this.vectorLayers.find(v => v.id === id)?.name ?? 'Vector layer';
    const wasActive = this.activeVectorLayerId === id;
    const ok = this.shapeManager?.removeVectorLayer(id) ?? false;
    if (wasActive) this.deselectVectorLayer();
    // Drop the row now (no ghost row while the list refresh is pending) and refresh from the engine
    this.vectorLayers = this.vectorLayers.filter(v => v.id !== id);
    this.rasterService.refreshLayers();
    if (ok && this.vectorRemovalUndoable) this._showRemovedToast({ id, name, wasActive });
  }

  /** The toast's Undo: the same step Ctrl+Z takes — only while that step is still the next undo. */
  undoRemoveVectorLayer(e: Event): void {
    e.stopPropagation();
    const t = this.removedVectorLayer;
    this.dismissRemovedToast();
    const sm = this.shapeManager as unknown as {
      canUndo2DShapes?: boolean; undoDescription2DShapes?: string | null; undo2DShapes?: () => boolean;
      getVectorLayers?: () => Array<{ id: string }>;
    } | null;
    if (!t || !sm?.canUndo2DShapes || sm.undoDescription2DShapes !== 'Remove vector layer') return;
    if (sm.getVectorLayers?.().some(v => v.id === t.id)) return;   // already back (Ctrl+Z)
    sm.undo2DShapes?.();
    this.rasterService.refreshLayers();
    if (t.wasActive) this.selectVectorLayer(t.id);
  }

  dismissRemovedToast(e?: Event): void {
    e?.stopPropagation();
    this._clearRemovedToastTimer();
    this.removedVectorLayer = null;
  }

  private _showRemovedToast(t: { id: string; name: string; wasActive: boolean }): void {
    this._clearRemovedToastTimer();
    this.removedVectorLayer = t;
    this._removedToastTimer = setTimeout(() => {
      this._removedToastTimer = null;
      this.removedVectorLayer = null;
      this.cdr.markForCheck();
    }, RasterLayersComponent.REMOVED_TOAST_MS);
  }

  private _clearRemovedToastTimer(): void {
    if (this._removedToastTimer) { clearTimeout(this._removedToastTimer); this._removedToastTimer = null; }
  }

  toggleVectorVisibility(layer: RasterLayer, e: MouseEvent): void {
    e.stopPropagation();
    const newVisible = !(layer.visible ?? true);
    this.shapeManager?.setVectorLayerVisible(layer.id, newVisible);
    // layers$ doesn't reflect vector visibility changes, so update local state immediately
    const vl = this.vectorLayers.find(v => v.id === layer.id);
    if (vl) vl.visible = newVisible;
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
    // Keep the 130 px+ list on screen horizontally (a narrow / touch viewport).
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - 160));
    // Try to open upward from button
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceAbove >= maxHeight || spaceAbove > spaceBelow) {
      // Open upward
      const bottom = window.innerHeight - rect.top + 2;
      this.blendDropdownStyle = {
        left: left + 'px',
        bottom: bottom + 'px',
        top: 'auto',
        'max-height': Math.min(spaceAbove - 8, maxHeight) + 'px',
      };
      this._correctFixedOffset(left, null, rect.top - 2);
    } else {
      // Open downward
      const top = rect.bottom + 2;
      this.blendDropdownStyle = {
        left: left + 'px',
        top: top + 'px',
        bottom: 'auto',
        'max-height': Math.min(spaceBelow - 8, maxHeight) + 'px',
      };
      this._correctFixedOffset(left, top, null);
    }
  }

  /**
   * The dropdown is position:fixed with viewport coords, but an ancestor with transform / filter / backdrop-filter /
   * contain becomes its containing block and shifts it: the editor's Layers panel blur once put it ~a panel-width
   * off-screen, so tapping "Normal ▾" looked dead. After it renders, measure where it landed and cancel any shift.
   */
  private _correctFixedOffset(wantLeft: number, wantTop: number | null, wantBottom: number | null): void {
    setTimeout(() => {
      // With event coalescing (main.ts) the click's change detection can still be pending: render the dropdown first
      this.cdr.detectChanges();
      const el = (this.elRef.nativeElement as HTMLElement).querySelector('.blend-dropdown') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = r.left - wantLeft;
      const dy = wantTop !== null ? r.top - wantTop : wantBottom !== null ? r.bottom - wantBottom : 0;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.left = (parseFloat(el.style.left) - dx) + 'px';
      if (wantTop !== null) el.style.top = (parseFloat(el.style.top) - dy) + 'px';
      else el.style.bottom = (parseFloat(el.style.bottom) + dy) + 'px';
    });
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

  /**
   * Touch only (`touchUi.coarse`): an inline range input swallows taps meant for the row, so on a tablet the row
   * shows its opacity as a % button and the slider appears only while that button is toggled on. Per layer, several
   * can be open at once, and none persist: the set lives in this component (a recreated panel starts all closed) and
   * ids that leave the layer list are pruned (a newly opened document's layers start closed).
   */
  private readonly _openOpacitySliderIds = new Set<string>();

  isOpacitySliderOpen(layerId: string): boolean {
    return this._openOpacitySliderIds.has(layerId);
  }

  /** The row's % button: opens / closes only this layer's slider. Never selects the layer (no row click). */
  toggleOpacitySlider(layer: RasterLayer, e: Event): void {
    e.stopPropagation();
    if (!this._openOpacitySliderIds.delete(layer.id)) this._openOpacitySliderIds.add(layer.id);
    // stopPropagation also skips the document click that closes these menus
    this.showAddMenu = false;
    this.openBlendDropdownId = null;
  }

  opacityPercent(layer: RasterLayer): number {
    return Math.round((layer.opacity ?? 1) * 100);
  }

  opacityButtonLabel(layer: RasterLayer): string {
    return `Layer opacity ${this.opacityPercent(layer)}%, ${this.isOpacitySliderOpen(layer.id) ? 'hide' : 'show'} slider`;
  }

  private _pruneOpenOpacitySliders(): void {
    if (!this._openOpacitySliderIds.size) return;
    const live = new Set(this.layers.map(l => l.id));
    for (const id of this._openOpacitySliderIds) if (!live.has(id)) this._openOpacitySliderIds.delete(id);
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
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.dragOverPosition = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    this.dragOverIndex = index;
  }

  onDragLeave(): void {
    this.dragOverIndex = null;
  }

  onDrop(dropIndex: number): void {
    if (this.dragIndex === null) { this.dragOverIndex = null; return; }
    const displayed = this.filteredLayers;
    const dragEntry = displayed[this.dragIndex];
    const dropEntry = displayed[dropIndex];
    if (!dragEntry || !dropEntry) { this.dragIndex = null; this.dragOverIndex = null; return; }

    // Folder drop: hovering the label of a folder (before position) moves layer into/out of it
    if (this.dragOverPosition === 'before' && dropEntry.type === 'folder'
        && dragEntry.type !== 'folder' && dragEntry.type !== '3d-scene') {
      if (dragEntry.parentId === dropEntry.id) {
        this.rasterService.setLayerParent(dragEntry.id, null);
      } else {
        this.rasterService.setLayerParent(dragEntry.id, dropEntry.id);
      }
      this.dragIndex = null; this.dragOverIndex = null;
      return;
    }

    // Reorder: this.layers is in reverse display order, so:
    //   "before in display" → insert AFTER dropEntry in ids (ids[realDrop + 1])
    //   "after in display"  → insert BEFORE dropEntry in ids (ids[realDrop])
    const ids = this.layers.map(l => l.id);
    const realDrag = ids.indexOf(dragEntry.id);
    const realDrop = ids.indexOf(dropEntry.id);
    if (realDrag < 0 || realDrop < 0) { this.dragIndex = null; this.dragOverIndex = null; return; }

    const [moved] = ids.splice(realDrag, 1);
    // Adjust drop index after removal
    let insertAt = realDrop > realDrag ? realDrop - 1 : realDrop;
    if (this.dragOverPosition === 'before') insertAt += 1; // after in layers array = above in display
    ids.splice(insertAt, 0, moved);
    this.rasterService.reorderLayers(ids);
    this.dragIndex = null; this.dragOverIndex = null;
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
