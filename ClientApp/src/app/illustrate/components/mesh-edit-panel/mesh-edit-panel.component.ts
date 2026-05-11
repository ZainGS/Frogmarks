import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

export interface MeshModifier {
  type: 'mirror' | 'subdivision';
  enabled: boolean;
  index: number;
  axis?: 'x' | 'y' | 'z';
  iterations?: number;
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

  extrudeDistance = 0.3;
  insetAmount = 0.1;

  paintColorHex = '#ff4444';
  paintAlpha = 1;

  modifiers: MeshModifier[] = [];

  weldV1Input = '';
  weldV2Input = '';

  // Edge ops
  halfEdgeInput = '';
  loopCutT = 0.5;
  bevelAmount = 0.3;

  private get sm(): any { return this.shapeManager; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId'] && this.meshId) {
      this.refreshModifiers();
      this.selectionMode = 'face';
    }
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

  weldVertices(): void {
    if (!this.meshId) return;
    const v1 = parseInt(this.weldV1Input, 10);
    const v2 = parseInt(this.weldV2Input, 10);
    if (isNaN(v1) || isNaN(v2)) return;
    this.sm?.weldEditVertices3D?.(this.meshId, v1, v2);
    this.weldV1Input = '';
    this.weldV2Input = '';
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
    }));
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

  private _hexToRgb(hex: string): [number, number, number] {
    if (!hex || hex.length < 7) return [1, 0, 0];
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  }
}
