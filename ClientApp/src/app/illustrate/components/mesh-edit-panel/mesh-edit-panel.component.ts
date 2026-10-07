import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { meshEditTools, BEVEL_ACTIONS, type BevelState } from '../illustration/editor-keymap';
import { meshEditKeyLabels } from '../illustration/mode-keymap';
import { MeshEditService, type MeshEditSelectMode } from '../../services/mesh-edit.service';

export interface MeshModifier {
  type: 'mirror' | 'subdivision' | 'displace';
  enabled: boolean;
  index: number;
  axis?: 'x' | 'y' | 'z';
  iterations?: number;
  strength?: number;
  frequency?: number;
  octaves?: number;
  seed?: number;
  direction?: 'x' | 'y' | 'z' | 'normal';
}

/** Salsa region ops newer than the dist Frogmarks type-checks against (UI review 2026-10-07): feature-detected. */
export interface RegionOpsApi {
  extrudeRegion3D?(meshId: string, faces: Iterable<number> | null, distance: number): boolean;
  insetRegion3D?(meshId: string, faces: Iterable<number> | null, amount: number): boolean;
  subdivideFaces3D?(meshId: string, faces: Iterable<number> | null): boolean;
  fillHoles3D?(meshId: string): number;
  bridgeLoops3D?(meshId: string, verts: Iterable<number> | null): boolean;
}

@Component({
  selector: 'app-mesh-edit-panel',
  templateUrl: './mesh-edit-panel.component.html',
  styleUrls: ['./mesh-edit-panel.component.scss'],
})
export class MeshEditPanelComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Input() meshName = '';
  @Input() activeTool: 'select' | 'knife' = 'select';
  @Output() exitRequest = new EventEmitter<void>();
  @Output() toolChange = new EventEmitter<'select' | 'knife'>();

  /** The editor's mesh edit state (the 1 / 2 / 3 keys switch the same mode); absent when the panel is used alone. */
  private readonly meshEditState = inject(MeshEditService, { optional: true });
  private _localMode: MeshEditSelectMode = 'face';
  get selectionMode(): MeshEditSelectMode { return this.meshEditState?.selectionMode ?? this._localMode; }
  /** The key chips, generated from the Edit Mesh keymap (mode-keymap.ts). */
  readonly keys = meshEditKeyLabels();
  /** The calm gradient by default (UI review 2026-10-07 §3 #18); Wavy stays in the list. */
  bgMode: 'wavy' | 'checkers' | 'gradient' | 'dim' | 'solid' | 'none' = 'gradient';

  extrudeDistance = 0.3;
  insetAmount = 0.1;

  paintColorHex = '#ff4444';
  paintAlpha = 1;

  modifiers: MeshModifier[] = [];

  weldV1Input = '';
  weldV2Input = '';

  // Vertex bevel
  bevelVertexIndex = '';
  bevelVertexAmount = 0.1;

  // Edge ops
  halfEdgeInput = '';
  loopCutT = 0.5;
  bevelAmount = 0.3;

  // Displace modifier params
  displaceStrength = 0.3;
  displaceFrequency = 2.0;
  displaceOctaves = 3;
  displaceSeed = 42;
  displaceDirection: 'x' | 'y' | 'z' | 'normal' = 'y';

  // Decimate
  decimateRatio = 0.3;
  decimateTrisBefore = 0;
  decimateTrisAfter = 0;

  // Phase 2 — mesh cleanup
  mergeThreshold = 0.001;
  mergeRemovedCount: number | null = null;

  // Phase 2 — proportional edit
  proportionalEnabled = false;
  proportionalRadius = 1.0;
  proportionalFalloff: 'smooth' | 'linear' | 'sharp' = 'smooth';

  private get sm(): ShapeManager { return this.shapeManager; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId'] && this.meshId) {
      this.refreshModifiers();
      if (!this.meshEditState) this._localMode = 'face';   // the service resets it on every entry
      this.sm?.setMeshEditBgMode3D({ mode: this.bgMode });
    }
    if (changes['shapeManager'] && this.shapeManager && this.meshId) {
      this.sm?.setMeshEditBgMode3D({ mode: this.bgMode });
    }
  }

  updateBgMode(): void {
    this.sm?.setMeshEditBgMode3D({ mode: this.bgMode });
  }

  // ── Selection state ─────────────────────────────────────────────

  get selection(): { vertices: Set<number>; faces: Set<number> } | null {
    if (!this.meshId) return null;
    return this.sm?.getEditSelection3D(this.meshId) ?? null;
  }

  get selectedFaces(): number[] {
    const sel = this.selection;
    return sel ? [...sel.faces] : [];
  }

  get selectedVertices(): number[] {
    const sel = this.selection;
    return sel ? [...sel.vertices] : [];
  }

  get selectedEdges(): number[] {
    if (!this.meshId) return [];
    const sel: any = this.sm?.getEditSelection3D(this.meshId);
    return sel?.edges ? [...sel.edges] : [];
  }

  // ── Tool & mode ──────────────────────────────────────────────────

  exit(): void {
    this.sm?.setMeshEditBgMode3D({ mode: 'none' });
    this.exitRequest.emit();
  }

  activateTool(tool: 'select' | 'knife'): void {
    this.toolChange.emit(tool);
  }

  setMode(mode: MeshEditSelectMode): void {
    if (this.meshEditState) { this.meshEditState.setSelectionMode(mode); return; }
    this._localMode = mode;
    this.sm?.setMeshEditSelectionMode(mode);
    if (this.meshId) this.sm?.clearEditSelection3D(this.meshId);
  }

  clearSelection(): void {
    if (this.meshId) this.sm?.clearEditSelection3D(this.meshId);
  }

  clearEdgeSelection(): void {
    if (this.meshId) this.sm?.clearEditSelection3D(this.meshId);
  }

  selectEdge(): void {
    if (!this.meshId || !this.hasHalfEdgeInput) return;
    this.sm?.selectEdge3D(this.meshId, parseInt(String(this.halfEdgeInput), 10));
  }

  // ── Shading (feature-detected: hidden on a Salsa dist without the API) ──

  /** Shade Smooth / Flat available (sm.setFacesSmooth3D). */
  get hasShading(): boolean { return typeof meshEditTools(this.sm).setFacesSmooth3D === 'function'; }
  /** Mark / Clear Sharp available (sm.setSharpEdges3D). */
  get hasSharp(): boolean { return typeof meshEditTools(this.sm).setSharpEdges3D === 'function'; }

  /** Shade the selected faces smooth / flat — every face when none is selected (one undo step). */
  shade(smooth: boolean): void {
    const t = meshEditTools(this.sm);
    if (!this.meshId || typeof t.setFacesSmooth3D !== 'function') return;
    const faces = this.selectedFaces;
    t.setFacesSmooth3D(this.meshId, faces.length ? new Set(faces) : null, smooth);
  }

  /** Mark / clear the selected edges sharp (drawn cyan; one undo step). */
  markSharp(sharp: boolean): void {
    const t = meshEditTools(this.sm);
    const edges = this.selectedEdges;
    if (!this.meshId || typeof t.setSharpEdges3D !== 'function' || edges.length === 0) return;
    t.setSharpEdges3D(this.meshId, edges, sharp);
  }

  // ── Chamfer / Bevel (the engine's interactive tool; hidden on a Salsa dist without it) ──

  get hasBevel(): boolean { return !!this.sm && BEVEL_ACTIONS.has({ shapeManager: this.sm }); }
  /** The running Chamfer (null = not running). */
  get bevel(): BevelState | null { return this.sm ? BEVEL_ACTIONS.state({ shapeManager: this.sm }) : null; }
  /** Chamfer the selected corners (Vertex mode) / bevel the selected edges (Edge mode); nothing selected: tap one. */
  startBevel(): void { if (this.sm) { if (this.activeTool === 'knife') this.toolChange.emit('select'); BEVEL_ACTIONS.begin({ shapeManager: this.sm }); } }
  setBevelAmount(text: string): void { if (this.sm) BEVEL_ACTIONS.setAmount({ shapeManager: this.sm }, text); }
  stepBevelSegments(delta: number): void { if (this.sm) BEVEL_ACTIONS.stepSegments({ shapeManager: this.sm }, delta); }
  toggleBevelSnap(): void { if (this.sm) BEVEL_ACTIONS.toggleSnap({ shapeManager: this.sm }); }
  applyBevel(): void { if (this.sm) BEVEL_ACTIONS.commit({ shapeManager: this.sm }); }
  cancelBevel(): void { if (this.sm) BEVEL_ACTIONS.cancel({ shapeManager: this.sm }); }

  // ── Operations ───────────────────────────────────────────────────

  /** The region ops (a newer Salsa dist; feature-detected, else the per-face fallbacks below). */
  private get regionOps(): RegionOpsApi { return (this.sm ?? {}) as unknown as RegionOpsApi; }

  /** Extrude: connected selected faces move as ONE region (one ring of walls, a welded top) and stay selected, ready
   *  for the next extrude / G. Older Salsa: each face on its own. */
  extrudeSelected(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    const r = this.regionOps;
    if (typeof r.extrudeRegion3D === 'function') { r.extrudeRegion3D(this.meshId, new Set(this.selectedFaces), this.extrudeDistance); return; }
    for (const fi of this.selectedFaces) {
      this.sm?.extrudeEditFace3D(this.meshId, fi, this.extrudeDistance);
    }
    this.sm?.clearEditSelection3D(this.meshId);
  }

  /** Inset: one border around each connected group of selected faces (the inner faces stay selected). */
  insetSelected(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    const r = this.regionOps;
    if (typeof r.insetRegion3D === 'function') { r.insetRegion3D(this.meshId, new Set(this.selectedFaces), this.insetAmount); return; }
    for (const fi of this.selectedFaces) {
      this.sm?.insetEditFace3D(this.meshId, fi, this.insetAmount);
    }
    this.sm?.clearEditSelection3D(this.meshId);
  }

  deleteSelected(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    // Delete highest indices first to avoid index shifting
    for (const fi of [...this.selectedFaces].sort((a, b) => b - a)) {
      this.sm?.deleteEditFace3D(this.meshId, fi);
    }
    this.sm?.clearEditSelection3D(this.meshId);
  }

  // ── Phase 2 face ops ────────────────────────────────────────────

  flipNormals(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    this.sm?.flipFaces3D(this.meshId, new Set(this.selectedFaces));
    this.sm?.clearEditSelection3D(this.meshId);
  }

  /** Subdivide every selected face at once (shared midpoints: a selected grid stays a grid; one undo step). Older
   *  Salsa: one by one, highest index first (each subdivide removes its face, so lower indices stay valid). */
  subdivideFaceSelected(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    const r = this.regionOps;
    if (typeof r.subdivideFaces3D === 'function') { r.subdivideFaces3D(this.meshId, new Set(this.selectedFaces)); this.sm?.clearEditSelection3D(this.meshId); return; }
    for (const fi of [...this.selectedFaces].sort((a, b) => b - a)) {
      this.sm?.subdivideFace3D(this.meshId, fi);
    }
    this.sm?.clearEditSelection3D(this.meshId);
  }

  separateFaces(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    this.sm?.separateFaces3D(this.meshId, new Set(this.selectedFaces));
    this.sm?.clearEditSelection3D(this.meshId);
  }

  // ── Phase 2 mesh cleanup ─────────────────────────────────────────

  mergeByDistance(): void {
    if (!this.meshId) return;
    const removed = this.sm?.mergeByDistance3D(this.meshId, this.mergeThreshold);
    this.mergeRemovedCount = typeof removed === 'number' ? removed : null;
  }

  /** How many holes the last Fill Holes capped (null = not run since entering). */
  holesFilled: number | null = null;

  /** Fill Holes: EVERY hole (or, with vertices / edges selected on holes, just those) in one undo step. Older Salsa:
   *  the first hole, again and again until none is left. */
  fillHole(): void {
    if (!this.meshId) return;
    const r = this.regionOps;
    if (typeof r.fillHoles3D === 'function') { this.holesFilled = r.fillHoles3D(this.meshId); return; }
    let filled = 0;
    for (let guard = 0; guard < 256; guard++) {
      const em = this.sm?.getMesh3D(this.meshId)?.editMesh;
      const boundaryIdx = em ? (em.halfEdges as Array<{ twin: number }>).findIndex(he => he.twin === -1) : -1;
      if (boundaryIdx === -1 || !this.sm?.fillHole3D(this.meshId, boundaryIdx)) break;
      filled++;
    }
    this.holesFilled = filled;
  }

  // ── Phase 2 proportional edit ────────────────────────────────────

  toggleProportional(): void {
    this.proportionalEnabled = !this.proportionalEnabled;
    this.sm?.setProportionalEdit3D(this.meshId, this.proportionalEnabled, this.proportionalRadius, this.proportionalFalloff);
  }

  applyProportionalSettings(): void {
    if (!this.proportionalEnabled) return;
    this.sm?.setProportionalEdit3D(this.meshId, true, this.proportionalRadius, this.proportionalFalloff);
  }

  weldVertices(): void {
    if (!this.meshId) return;
    const v1 = parseInt(this.weldV1Input, 10);
    const v2 = parseInt(this.weldV2Input, 10);
    if (isNaN(v1) || isNaN(v2)) return;
    this.sm?.weldEditVertices3D(this.meshId, v1, v2);
    this.weldV1Input = '';
    this.weldV2Input = '';
  }

  bevelVertex(): void {
    if (!this.meshId) return;
    const idx = parseInt(this.bevelVertexIndex, 10);
    if (isNaN(idx)) return;
    this.sm?.bevelVertex3D(this.meshId, idx, this.bevelVertexAmount);
  }

  autoUnwrap(): void {
    if (!this.meshId) return;
    this.sm?.autoUnwrap3D(this.meshId);
  }

  // ── Paint ────────────────────────────────────────────────────────

  paintFaces(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    const [r, g, b] = this._hexToRgb(this.paintColorHex);
    for (const fi of this.selectedFaces) {
      this.sm?.paintFaceColor3D(this.meshId, fi, r, g, b, this.paintAlpha);
    }
  }

  paintVertices(): void {
    if (!this.meshId || this.selectedVertices.length === 0) return;
    const [r, g, b] = this._hexToRgb(this.paintColorHex);
    for (const vi of this.selectedVertices) {
      this.sm?.paintVertexColor3D(this.meshId, vi, r, g, b, this.paintAlpha);
    }
  }

  // ── Bridge loops ─────────────────────────────────────────────────

  /** Bridge Loops is possible: ≥ 4 vertices selected (or, on a newer Salsa, ≥ 4 edges — their ends). */
  get canBridge(): boolean {
    return this.selectedVertices.length >= 4 || (typeof this.regionOps.bridgeLoops3D === 'function' && this.selectedEdges.length >= 4);
  }

  /** Bridge the two loops the selection forms, whatever order they were picked in (the engine orders them by their
   *  edges). Older Salsa: the selection split in half by pick order. */
  bridgeLoops(): void {
    if (!this.meshId || !this.canBridge) return;
    const r = this.regionOps;
    if (typeof r.bridgeLoops3D === 'function') { r.bridgeLoops3D(this.meshId, null); return; }
    const verts = this.selectedVertices;
    const half = Math.floor(verts.length / 2);
    const loopA = verts.slice(0, half);
    const loopB = verts.slice(half);
    if (loopA.length !== loopB.length) return;
    this.sm?.bridgeEdgeLoops3D(this.meshId, loopA, loopB);
    this.sm?.clearEditSelection3D(this.meshId);
  }

  // ── Edge operations ───────────────────────────────────────────────

  /** A typed half-edge index is there (0 is a valid index: `!halfEdgeInput` used to treat it as empty). */
  get hasHalfEdgeInput(): boolean { return this.halfEdgeInput !== '' && this.halfEdgeInput !== null && !isNaN(parseInt(String(this.halfEdgeInput), 10)); }
  /** Loop Cut / Dissolve act on the selected edges (what Ctrl+R / X do), else on the typed half-edge index. */
  get canEdgeOp(): boolean { return this.selectedEdges.length > 0 || this.hasHalfEdgeInput; }

  loopCut(): void {
    if (!this.meshId) return;
    if (this.selectedEdges.length > 0 && this.meshEditState) { this.meshEditState.loopCutSelectedEdge(this.loopCutT); return; }
    if (!this.hasHalfEdgeInput) return;
    const idx = parseInt(String(this.halfEdgeInput), 10);
    this.sm?.loopCut3D(this.meshId, idx, this.loopCutT);
  }

  bevelEdge(): void {
    if (!this.meshId || !this.hasHalfEdgeInput) return;
    this.sm?.bevelEdge3D(this.meshId, parseInt(String(this.halfEdgeInput), 10), this.bevelAmount);
  }

  dissolveEdge(): void {
    if (!this.meshId) return;
    if (this.selectedEdges.length > 0 && this.meshEditState) { this.meshEditState.dissolveSelectedEdges(); return; }
    if (!this.hasHalfEdgeInput) return;
    const idx = parseInt(String(this.halfEdgeInput), 10);
    this.sm?.dissolveEdge3D(this.meshId, idx);
  }

  // ── Modifiers ────────────────────────────────────────────────────

  refreshModifiers(): void {
    if (!this.meshId) { this.modifiers = []; return; }
    const raw: any[] = this.sm?.getModifiers3D(this.meshId) ?? [];
    this.modifiers = raw.map((m, i) => ({
      type: m.type,
      enabled: m.enabled,
      index: i,
      axis: m.axis,
      iterations: m.iterations,
      strength: m.strength,
      frequency: m.frequency,
      octaves: m.octaves,
      seed: m.seed,
      direction: m.direction,
    }));
    const geom = this.sm?.getMesh3D(this.meshId)?.geometry;
    this.decimateTrisBefore = geom ? Math.round(geom.indices.length / 3) : 0;
    this.decimateTrisAfter = 0;
  }

  addMirror(axis: 'x' | 'y' | 'z'): void {
    if (!this.meshId) return;
    this.sm?.addMirrorModifier3D(this.meshId, axis);
    this.refreshModifiers();
  }

  addSubdivision(iterations: 1 | 2): void {
    if (!this.meshId) return;
    this.sm?.addSubdivisionModifier3D(this.meshId, iterations);
    this.refreshModifiers();
  }

  addDisplace(): void {
    if (!this.meshId) return;
    this.sm?.addDisplaceModifier3D(this.meshId, {
      strength: this.displaceStrength,
      frequency: this.displaceFrequency,
      seed: this.displaceSeed,
      octaves: this.displaceOctaves,
      direction: this.displaceDirection,
    });
    this.refreshModifiers();
  }

  toggleModifier(mod: MeshModifier): void {
    if (!this.meshId) return;
    this.sm?.setModifierEnabled3D(this.meshId, mod.index, !mod.enabled);
    mod.enabled = !mod.enabled;
  }

  applyModifier(mod: MeshModifier): void {
    if (!this.meshId) return;
    this.sm?.applyModifier3D(this.meshId, mod.index);
    this.refreshModifiers();
  }

  removeModifier(mod: MeshModifier): void {
    if (!this.meshId) return;
    this.sm?.removeModifier3D(this.meshId, mod.index);
    this.refreshModifiers();
  }

  decimateMesh(): void {
    if (!this.meshId) return;
    this.sm?.simplifyMesh3D(this.meshId, this.decimateRatio);
    const geomAfter = this.sm?.getMesh3D(this.meshId)?.geometry;
    this.decimateTrisAfter = geomAfter ? Math.round(geomAfter.indices.length / 3) : 0;
  }

  private _hexToRgb(hex: string): [number, number, number] {
    if (!hex || hex.length < 7) return [1, 0, 0];
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  }
}
