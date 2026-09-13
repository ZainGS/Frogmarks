import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

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
  direction?: 'x' | 'y' | 'z' | 'xyz';
}

@Component({
  selector: 'app-mesh-edit-panel',
  templateUrl: './mesh-edit-panel.component.html',
  styleUrls: ['./mesh-edit-panel.component.scss'],
})
export class MeshEditPanelComponent implements OnChanges {
  @Input() shapeManager: any = null;
  @Input() meshId: string | null = null;
  @Input() meshName = '';
  @Input() activeTool: 'select' | 'knife' = 'select';
  @Output() exitRequest = new EventEmitter<void>();
  @Output() toolChange = new EventEmitter<'select' | 'knife'>();

  selectionMode: 'vertex' | 'face' | 'edge' = 'face';
  bgMode: 'wavy' | 'gradient' | 'dim' | 'solid' | 'none' = 'wavy';

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
  displaceDirection: 'x' | 'y' | 'z' | 'xyz' = 'y';

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

  private get sm(): any { return this.shapeManager; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId'] && this.meshId) {
      this.refreshModifiers();
      this.selectionMode = 'face';
      this.sm?.setMeshEditBgMode3D?.({ mode: this.bgMode });
    }
    if (changes['shapeManager'] && this.shapeManager && this.meshId) {
      this.sm?.setMeshEditBgMode3D?.({ mode: this.bgMode });
    }
  }

  updateBgMode(): void {
    this.sm?.setMeshEditBgMode3D?.({ mode: this.bgMode });
  }

  // ── Selection state ─────────────────────────────────────────────

  get selection(): { vertices: Set<number>; faces: Set<number> } | null {
    if (!this.meshId) return null;
    return this.sm?.getEditSelection3D?.(this.meshId) ?? null;
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
    const sel: any = this.sm?.getEditSelection3D?.(this.meshId);
    return sel?.edges ? [...sel.edges] : [];
  }

  // ── Tool & mode ──────────────────────────────────────────────────

  exit(): void {
    this.sm?.setMeshEditBgMode3D?.({ mode: 'none' });
    this.exitRequest.emit();
  }

  activateTool(tool: 'select' | 'knife'): void {
    this.toolChange.emit(tool);
  }

  setMode(mode: 'vertex' | 'face' | 'edge'): void {
    this.selectionMode = mode;
    this.sm?.setMeshEditSelectionMode?.(mode);
    if (this.meshId) this.sm?.clearEditSelection3D?.(this.meshId);
  }

  clearSelection(): void {
    if (this.meshId) this.sm?.clearEditSelection3D?.(this.meshId);
  }

  clearEdgeSelection(): void {
    if (this.meshId) this.sm?.clearEditSelection3D?.(this.meshId);
  }

  selectEdge(): void {
    if (!this.meshId || !this.halfEdgeInput) return;
    const idx = parseInt(this.halfEdgeInput, 10);
    if (isNaN(idx)) return;
    this.sm?.selectEdge3D?.(this.meshId, idx);
  }

  // ── Operations ───────────────────────────────────────────────────

  extrudeSelected(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    for (const fi of this.selectedFaces) {
      this.sm?.extrudeEditFace3D?.(this.meshId, fi, this.extrudeDistance);
    }
    this.sm?.clearEditSelection3D?.(this.meshId);
  }

  insetSelected(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    for (const fi of this.selectedFaces) {
      this.sm?.insetEditFace3D?.(this.meshId, fi, this.insetAmount);
    }
    this.sm?.clearEditSelection3D?.(this.meshId);
  }

  deleteSelected(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    // Delete highest indices first to avoid index shifting
    for (const fi of [...this.selectedFaces].sort((a, b) => b - a)) {
      this.sm?.deleteEditFace3D?.(this.meshId, fi);
    }
    this.sm?.clearEditSelection3D?.(this.meshId);
  }

  // ── Phase 2 face ops ────────────────────────────────────────────

  flipNormals(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    this.sm?.flipFaces3D?.(this.meshId, new Set(this.selectedFaces));
    this.sm?.clearEditSelection3D?.(this.meshId);
  }

  subdivideFaceSelected(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    for (const fi of this.selectedFaces) {
      this.sm?.subdivideFace3D?.(this.meshId, fi);
    }
    this.sm?.clearEditSelection3D?.(this.meshId);
  }

  separateFaces(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    this.sm?.separateFaces3D?.(this.meshId, new Set(this.selectedFaces));
    this.sm?.clearEditSelection3D?.(this.meshId);
  }

  // ── Phase 2 mesh cleanup ─────────────────────────────────────────

  mergeByDistance(): void {
    if (!this.meshId) return;
    const removed = this.sm?.mergeByDistance3D?.(this.meshId, this.mergeThreshold);
    this.mergeRemovedCount = typeof removed === 'number' ? removed : null;
  }

  fillHole(): void {
    if (!this.meshId) return;
    const em = this.sm?.getMesh3D?.(this.meshId)?.editMesh;
    if (!em) return;
    const boundaryIdx = (em.halfEdges as any[]).findIndex((he: any) => he.twin === -1);
    if (boundaryIdx === -1) return;
    this.sm?.fillHole3D?.(this.meshId, boundaryIdx);
  }

  // ── Phase 2 proportional edit ────────────────────────────────────

  toggleProportional(): void {
    this.proportionalEnabled = !this.proportionalEnabled;
    this.sm?.setProportionalEdit3D?.(this.meshId, this.proportionalEnabled, this.proportionalRadius, this.proportionalFalloff);
  }

  applyProportionalSettings(): void {
    if (!this.proportionalEnabled) return;
    this.sm?.setProportionalEdit3D?.(this.meshId, true, this.proportionalRadius, this.proportionalFalloff);
  }

  weldVertices(): void {
    if (!this.meshId) return;
    const v1 = parseInt(this.weldV1Input, 10);
    const v2 = parseInt(this.weldV2Input, 10);
    if (isNaN(v1) || isNaN(v2)) return;
    this.sm?.weldEditVertices3D?.(this.meshId, v1, v2);
    this.weldV1Input = '';
    this.weldV2Input = '';
  }

  bevelVertex(): void {
    if (!this.meshId) return;
    const idx = parseInt(this.bevelVertexIndex, 10);
    if (isNaN(idx)) return;
    this.sm?.bevelVertex3D?.(this.meshId, idx, this.bevelVertexAmount);
  }

  autoUnwrap(): void {
    if (!this.meshId) return;
    this.sm?.autoUnwrap3D?.(this.meshId);
  }

  // ── Paint ────────────────────────────────────────────────────────

  paintFaces(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    const [r, g, b] = this._hexToRgb(this.paintColorHex);
    for (const fi of this.selectedFaces) {
      this.sm?.paintFaceColor3D?.(this.meshId, fi, r, g, b, this.paintAlpha);
    }
  }

  paintVertices(): void {
    if (!this.meshId || this.selectedVertices.length === 0) return;
    const [r, g, b] = this._hexToRgb(this.paintColorHex);
    for (const vi of this.selectedVertices) {
      this.sm?.paintVertexColor3D?.(this.meshId, vi, r, g, b, this.paintAlpha);
    }
  }

  // ── Bridge loops ─────────────────────────────────────────────────

  bridgeLoops(): void {
    if (!this.meshId || this.selectedVertices.length < 4) return;
    const verts = this.selectedVertices;
    const half = Math.floor(verts.length / 2);
    const loopA = verts.slice(0, half);
    const loopB = verts.slice(half);
    if (loopA.length !== loopB.length) return;
    this.sm?.bridgeEdgeLoops3D?.(this.meshId, loopA, loopB);
    this.sm?.clearEditSelection3D?.(this.meshId);
  }

  // ── Edge operations ───────────────────────────────────────────────

  loopCut(): void {
    if (!this.meshId || !this.halfEdgeInput) return;
    const idx = parseInt(this.halfEdgeInput, 10);
    if (isNaN(idx)) return;
    this.sm?.loopCut3D?.(this.meshId, idx, this.loopCutT);
  }

  bevelEdge(): void {
    if (!this.meshId || !this.halfEdgeInput) return;
    const idx = parseInt(this.halfEdgeInput, 10);
    if (isNaN(idx)) return;
    this.sm?.bevelEdge3D?.(this.meshId, idx, this.bevelAmount);
  }

  dissolveEdge(): void {
    if (!this.meshId || !this.halfEdgeInput) return;
    const idx = parseInt(this.halfEdgeInput, 10);
    if (isNaN(idx)) return;
    this.sm?.dissolveEdge3D?.(this.meshId, idx);
  }

  // ── Modifiers ────────────────────────────────────────────────────

  refreshModifiers(): void {
    if (!this.meshId) { this.modifiers = []; return; }
    const raw: any[] = this.sm?.getModifiers3D?.(this.meshId) ?? [];
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
    const geom = this.sm?.getMesh3D?.(this.meshId)?.geometry;
    this.decimateTrisBefore = geom ? Math.round(geom.indices.length / 3) : 0;
    this.decimateTrisAfter = 0;
  }

  addMirror(axis: 'x' | 'y' | 'z'): void {
    if (!this.meshId) return;
    this.sm?.addMirrorModifier3D?.(this.meshId, axis);
    this.refreshModifiers();
  }

  addSubdivision(iterations: 1 | 2): void {
    if (!this.meshId) return;
    this.sm?.addSubdivisionModifier3D?.(this.meshId, iterations);
    this.refreshModifiers();
  }

  addDisplace(): void {
    if (!this.meshId) return;
    this.sm?.addDisplaceModifier3D?.(this.meshId, {
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
    this.sm?.setModifierEnabled3D?.(this.meshId, mod.index, !mod.enabled);
    mod.enabled = !mod.enabled;
  }

  applyModifier(mod: MeshModifier): void {
    if (!this.meshId) return;
    this.sm?.applyModifier3D?.(this.meshId, mod.index);
    this.refreshModifiers();
  }

  removeModifier(mod: MeshModifier): void {
    if (!this.meshId) return;
    this.sm?.removeModifier3D?.(this.meshId, mod.index);
    this.refreshModifiers();
  }

  decimateMesh(): void {
    if (!this.meshId) return;
    this.sm?.simplifyMesh3D?.(this.meshId, this.decimateRatio);
    const geomAfter = this.sm?.getMesh3D?.(this.meshId)?.geometry;
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
