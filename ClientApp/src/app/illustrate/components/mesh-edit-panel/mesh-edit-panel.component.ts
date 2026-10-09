import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { BEVEL_ACTIONS, type BevelState } from '../illustration/editor-keymap';
import { meshEditKeyLabels } from '../illustration/mode-keymap';
import { MeshEditService, type MeshEditSelectMode } from '../../services/mesh-edit.service';
import * as ops from '../../services/mesh-edit-ops';
import type { MeshModifier } from '../../services/mesh-edit-ops';
import {
  DEFAULT_EDIT_BG_MODE, DEFAULT_MESH_TOOL_PARAMS, editBgOptions, type MeshBgMode, type MeshToolParams,
} from '../mesh-edit-chrome/mesh-edit-chrome.logic';

export type { MeshModifier, RegionOpsApi } from '../../services/mesh-edit-ops';

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
  /** Wavy Sage by default (DEFAULT_EDIT_BG_MODE). Shared with the mode chrome through the editor's MeshEditService (the
   *  panel alone keeps its own). */
  private _bgMode: MeshBgMode = DEFAULT_EDIT_BG_MODE;
  get bgMode(): MeshBgMode { return this.meshEditState?.bgMode ?? this._bgMode; }
  set bgMode(v: MeshBgMode) { if (this.meshEditState) this.meshEditState.bgMode = v; else this._bgMode = v; }

  // The tool amounts: the editor's (MeshEditService.params, the chrome's op pill edits the same) or the panel's own
  private readonly _params: MeshToolParams = { ...DEFAULT_MESH_TOOL_PARAMS };
  private get params(): MeshToolParams { return this.meshEditState?.params ?? this._params; }
  get extrudeDistance(): number { return this.params.extrudeDistance; }
  set extrudeDistance(v: number) { this.params.extrudeDistance = v; }
  get insetAmount(): number { return this.params.insetAmount; }
  set insetAmount(v: number) { this.params.insetAmount = v; }

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
  get loopCutT(): number { return this.params.loopCutPosition; }
  set loopCutT(v: number) { this.params.loopCutPosition = v; }
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
    if ((changes['meshId'] || changes['shapeManager']) && this.meshId) {
      // the proportional settings are saved on the mesh: show them (not the panel's defaults)
      const p = ops.readProportional(this.sm, this.meshId);
      if (p) { this.proportionalEnabled = p.enabled; this.proportionalRadius = p.radius; this.proportionalFalloff = p.falloff; }
    }
    if (changes['meshId'] && this.meshId) {
      this.refreshModifiers();
      if (!this.meshEditState) this._localMode = 'face';   // the service resets it on every entry
      this.sm?.setMeshEditBgMode3D(editBgOptions(this.bgMode));
    }
    if (changes['shapeManager'] && this.shapeManager && this.meshId) {
      this.sm?.setMeshEditBgMode3D(editBgOptions(this.bgMode));
    }
  }

  updateBgMode(): void {
    if (this.meshEditState) this.meshEditState.setBgMode(this.bgMode);
    else this.sm?.setMeshEditBgMode3D(editBgOptions(this.bgMode));
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
  get hasShading(): boolean { return ops.hasShading(this.sm); }
  /** Mark / Clear Sharp available (sm.setSharpEdges3D). */
  get hasSharp(): boolean { return ops.hasSharp(this.sm); }

  /** Shade the selected faces smooth / flat — every face when none is selected (one undo step). */
  shade(smooth: boolean): void {
    if (this.meshId && this.sm) ops.shadeFaces(this.sm, this.meshId, this.selectedFaces, smooth);
  }

  /** Mark / clear the selected edges sharp (drawn cyan; one undo step). */
  markSharp(sharp: boolean): void {
    if (this.meshId && this.sm) ops.markSharpEdges(this.sm, this.meshId, this.selectedEdges, sharp);
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

  // ── Operations (services/mesh-edit-ops.ts: shared with the mode chrome) ──────

  extrudeSelected(): void {
    if (this.meshId && this.sm) ops.extrudeFaces(this.sm, this.meshId, this.selectedFaces, this.extrudeDistance);
  }

  insetSelected(): void {
    if (this.meshId && this.sm) ops.insetFaces(this.sm, this.meshId, this.selectedFaces, this.insetAmount);
  }

  deleteSelected(): void {
    if (this.meshId && this.sm) ops.deleteFaces(this.sm, this.meshId, this.selectedFaces);
  }

  flipNormals(): void {
    if (this.meshId && this.sm) ops.flipFaces(this.sm, this.meshId, this.selectedFaces);
  }

  subdivideFaceSelected(): void {
    if (this.meshId && this.sm) ops.subdivideFaces(this.sm, this.meshId, this.selectedFaces);
  }

  separateFaces(): void {
    if (this.meshId && this.sm) ops.separateFaces(this.sm, this.meshId, this.selectedFaces);
  }

  mergeByDistance(): void {
    if (this.meshId && this.sm) this.mergeRemovedCount = ops.mergeByDistance(this.sm, this.meshId, this.mergeThreshold);
  }

  /** How many holes the last Fill Holes capped (null = not run since entering). */
  holesFilled: number | null = null;

  fillHole(): void {
    if (this.meshId && this.sm) this.holesFilled = ops.fillHoles(this.sm, this.meshId);
  }

  toggleProportional(): void {
    this.proportionalEnabled = !this.proportionalEnabled;
    if (this.sm) ops.setProportional(this.sm, this.meshId, this.proportionalEnabled, this.proportionalRadius, this.proportionalFalloff);
  }

  applyProportionalSettings(): void {
    if (!this.proportionalEnabled || !this.sm) return;
    ops.setProportional(this.sm, this.meshId, true, this.proportionalRadius, this.proportionalFalloff);
  }

  weldVertices(): void {
    const v1 = ops.parseIndex(this.weldV1Input), v2 = ops.parseIndex(this.weldV2Input);
    if (!this.meshId || v1 === null || v2 === null) return;
    this.sm?.weldEditVertices3D(this.meshId, v1, v2);
    this.weldV1Input = '';
    this.weldV2Input = '';
  }

  bevelVertex(): void {
    const idx = ops.parseIndex(this.bevelVertexIndex);
    if (!this.meshId || idx === null) return;
    this.sm?.bevelVertex3D(this.meshId, idx, this.bevelVertexAmount);
  }

  autoUnwrap(): void {
    if (!this.meshId) return;
    this.sm?.autoUnwrap3D(this.meshId);
  }

  // ── Paint ────────────────────────────────────────────────────────

  paintFaces(): void {
    if (!this.meshId || this.selectedFaces.length === 0) return;
    const [r, g, b] = ops.hexToRgb(this.paintColorHex);
    for (const fi of this.selectedFaces) this.sm?.paintFaceColor3D(this.meshId, fi, r, g, b, this.paintAlpha);
  }

  paintVertices(): void {
    if (!this.meshId || this.selectedVertices.length === 0) return;
    const [r, g, b] = ops.hexToRgb(this.paintColorHex);
    for (const vi of this.selectedVertices) this.sm?.paintVertexColor3D(this.meshId, vi, r, g, b, this.paintAlpha);
  }

  // ── Bridge loops ─────────────────────────────────────────────────

  get canBridge(): boolean {
    return ops.canBridge(this.sm, { vertices: this.selectedVertices, edges: this.selectedEdges, faces: [] });
  }

  bridgeLoops(): void {
    if (!this.meshId || !this.sm) return;
    ops.bridgeLoops(this.sm, this.meshId, { vertices: this.selectedVertices, edges: this.selectedEdges, faces: [] });
  }

  // ── Edge operations ───────────────────────────────────────────────

  /** A typed half-edge index is there (0 is a valid index: `!halfEdgeInput` used to treat it as empty). */
  get hasHalfEdgeInput(): boolean { return ops.parseIndex(this.halfEdgeInput) !== null; }
  /** Loop Cut / Dissolve act on the selected edges (what Ctrl+R / X do), else on the typed half-edge index. */
  get canEdgeOp(): boolean { return this.selectedEdges.length > 0 || this.hasHalfEdgeInput; }

  loopCut(): void {
    if (!this.meshId) return;
    if (this.selectedEdges.length > 0 && this.meshEditState) { this.meshEditState.loopCutSelectedEdge(this.loopCutT, 1); return; }
    const idx = ops.parseIndex(this.halfEdgeInput);
    if (idx !== null) this.sm?.loopCut3D(this.meshId, idx, this.loopCutT);
  }

  bevelEdge(): void {
    const idx = ops.parseIndex(this.halfEdgeInput);
    if (this.meshId && idx !== null) this.sm?.bevelEdge3D(this.meshId, idx, this.bevelAmount);
  }

  dissolveEdge(): void {
    if (!this.meshId) return;
    if (this.selectedEdges.length > 0 && this.meshEditState) { this.meshEditState.dissolveSelectedEdges(); return; }
    const idx = ops.parseIndex(this.halfEdgeInput);
    if (idx !== null) this.sm?.dissolveEdge3D(this.meshId, idx);
  }

  // ── Modifiers ────────────────────────────────────────────────────

  refreshModifiers(): void {
    this.modifiers = ops.readModifiers(this.sm, this.meshId);
    this.decimateTrisBefore = ops.triangleCount(this.sm, this.meshId);
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
    if (this.meshId && this.sm) this.decimateTrisAfter = ops.decimate(this.sm, this.meshId, this.decimateRatio);
  }
}
