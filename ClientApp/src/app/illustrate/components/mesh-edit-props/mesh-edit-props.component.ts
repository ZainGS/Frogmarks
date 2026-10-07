import { Component, DoCheck, Input, inject } from '@angular/core';
import type { IllustrationComponent } from '../illustration/illustration.component';
import * as ops from '../../services/mesh-edit-ops';
import type { DisplaceParams, MeshModifier, ProportionalFalloff } from '../../services/mesh-edit-ops';
import { ExperimentalSettingsService } from '../../services/experimental-settings.service';
import { NotifyService } from '../../../shared/services/notify/notify.service';
import { selectionLabel } from '../mesh-edit-chrome/mesh-edit-chrome.logic';

/** The editor members the properties use. */
export type MeshEditPropsHost = Pick<IllustrationComponent, 'shapeManager' | 'editorState' | 'meshEdit' | 'scene3dUndo' | 'scene3dMarkDirty'>;

type Axis = 'x' | 'y' | 'z';

/**
 * Edit Mesh properties (the mode chrome's right panel, UI review 2026-10-07 §4 item 4): settings, not verbs — the
 * modifier stack as cards (Mirror X / Y / Z, Subdivision, Displace; Decimate), Shading, Cleanup, Proportional editing,
 * and (Experimental › Developer buttons) the old typed-index tools. The ops are services/mesh-edit-ops.ts (shared with
 * the classic panel).
 */
@Component({
  selector: 'app-mesh-edit-props',
  templateUrl: './mesh-edit-props.component.html',
  styleUrls: ['./mesh-edit-props.component.scss'],
})
export class MeshEditPropsComponent implements DoCheck {
  @Input() ed!: MeshEditPropsHost;

  readonly exp = inject(ExperimentalSettingsService);
  private readonly notify = inject(NotifyService, { optional: true });
  readonly axes: readonly Axis[] = ['x', 'y', 'z'];

  modifiers: MeshModifier[] = [];
  private _modSig = '';

  /** The Displace card being set up before it is added (null = closed). */
  displaceDraft: DisplaceParams | null = null;
  decimateOpen = false;
  decimateRatio = 0.3;
  decimateTrisAfter = 0;

  mergeThreshold = 0.001;
  mergeRemovedCount: number | null = null;
  holesFilled: number | null = null;

  proportionalEnabled = false;
  proportionalRadius = 1.0;
  proportionalFalloff: ProportionalFalloff = 'smooth';

  // Developer buttons (typed indices)
  devHalfEdge = '';
  devWeldV1 = '';
  devWeldV2 = '';
  devBevelVertexIdx = '';
  devBevelVertexAmount = 0.1;
  devBevelEdgeAmount = 0.3;

  private get sm() { return this.ed?.shapeManager; }
  get meshId(): string | null { return this.ed?.editorState.scene3dSelectedMeshId ?? null; }

  /** The modifier list follows the engine (undo / redo change it too): re-read, replaced only when it changed. */
  ngDoCheck(): void {
    const next = ops.readModifiers(this.sm, this.meshId);
    const sig = JSON.stringify(next);
    if (sig !== this._modSig) { this._modSig = sig; this.modifiers = next; }
  }

  get sel(): ops.MeshEditSelectionLists { return this.ed.meshEdit.selection; }
  get selectionLine(): string {
    const s = this.sel;
    return selectionLabel(this.ed.meshEdit.selectionMode, { vertices: s.vertices.length, edges: s.edges.length, faces: s.faces.length });
  }

  // ── Modifiers ──

  get mirrors(): MeshModifier[] { return this.modifiers.filter(m => m.type === 'mirror'); }
  get others(): MeshModifier[] { return this.modifiers.filter(m => m.type !== 'mirror'); }
  mirrorOn(axis: Axis): MeshModifier | undefined { return this.mirrors.find(m => (m.axis ?? 'x') === axis); }
  label(m: MeshModifier): string { return ops.modifierLabel(m); }

  /** Mirror card chips: an axis on adds a Mirror modifier for it, off removes it (undoable, with an Undo toast). */
  toggleMirror(axis: Axis): void {
    const id = this.meshId, sm = this.sm;
    if (!id || !sm) return;
    const on = this.mirrorOn(axis);
    if (on) this.removeModifier(on);
    else sm.addMirrorModifier3D(id, axis);
    this.ngDoCheck();
  }

  addSubdivision(iterations: 1 | 2): void {
    const id = this.meshId;
    if (id) this.sm?.addSubdivisionModifier3D(id, iterations);
    this.ngDoCheck();
  }

  openDisplace(): void { this.displaceDraft = { strength: 0.3, frequency: 2, octaves: 3, seed: 42, direction: 'y' }; }
  addDisplace(): void {
    const id = this.meshId, d = this.displaceDraft;
    if (!id || !d) return;
    this.sm?.addDisplaceModifier3D(id, { ...d });
    this.displaceDraft = null;
    this.ngDoCheck();
  }

  toggleModifier(m: MeshModifier): void {
    const id = this.meshId;
    if (id) this.sm?.setModifierEnabled3D(id, m.index, !m.enabled);
    this.ngDoCheck();
  }

  applyModifier(m: MeshModifier): void {
    const id = this.meshId;
    if (id) this.sm?.applyModifier3D(id, m.index);
    this.ngDoCheck();
  }

  /** Remove at once (one 3D undo step), with an Undo toast — the editor's remove convention (vector layer ✕). */
  removeModifier(m: MeshModifier): void {
    const id = this.meshId;
    if (!id || !this.sm) return;
    this.sm.removeModifier3D(id, m.index);
    this.ngDoCheck();
    const ref = this.notify?.success(`Removed ${ops.modifierLabel(m)}`, 'Undo');
    ref?.onAction().subscribe(() => { this.ed.scene3dUndo(); this.ed.scene3dMarkDirty(); });
  }

  get triangles(): number { return ops.triangleCount(this.sm, this.meshId); }
  decimate(): void {
    const id = this.meshId;
    if (id && this.sm) this.decimateTrisAfter = ops.decimate(this.sm, id, this.decimateRatio);
  }

  // ── Shading ──

  get hasShading(): boolean { return ops.hasShading(this.sm); }
  get hasSharp(): boolean { return ops.hasSharp(this.sm); }
  shade(smooth: boolean): void {
    const id = this.meshId;
    if (id && this.sm) ops.shadeFaces(this.sm, id, this.sel.faces, smooth);
  }
  markSharp(sharp: boolean): void {
    const id = this.meshId;
    if (id && this.sm) ops.markSharpEdges(this.sm, id, this.sel.edges, sharp);
  }

  // ── Cleanup ──

  mergeByDistance(): void {
    const id = this.meshId;
    if (id && this.sm) this.mergeRemovedCount = ops.mergeByDistance(this.sm, id, this.mergeThreshold);
  }
  fillHoles(): void {
    const id = this.meshId;
    if (id && this.sm) this.holesFilled = ops.fillHoles(this.sm, id);
  }

  // ── Proportional ──

  setProportional(on: boolean): void {
    this.proportionalEnabled = on;
    this.applyProportional();
  }
  applyProportional(): void {
    if (this.sm) ops.setProportional(this.sm, this.meshId, this.proportionalEnabled, this.proportionalRadius, this.proportionalFalloff);
  }

  // ── Developer buttons: typed indices (the chrome's tools act on the selection / a tap instead) ──

  devSelectEdge(): void {
    const id = this.meshId, he = ops.parseIndex(this.devHalfEdge);
    if (id && he !== null) this.sm?.selectEdge3D(id, he);
  }
  devLoopCut(): void {
    const id = this.meshId, he = ops.parseIndex(this.devHalfEdge);
    const p = this.ed.meshEdit.params;
    if (id && he !== null && this.sm) ops.loopCutAt(this.sm, id, he, p.loopCutCount, p.loopCutPosition);
  }
  devDissolve(): void {
    const id = this.meshId, he = ops.parseIndex(this.devHalfEdge);
    if (id && he !== null) this.sm?.dissolveEdge3D(id, he);
  }
  devBevelEdge(): void {
    const id = this.meshId, he = ops.parseIndex(this.devHalfEdge);
    if (id && he !== null) this.sm?.bevelEdge3D(id, he, this.devBevelEdgeAmount);
  }
  devWeld(): void {
    const id = this.meshId, a = ops.parseIndex(this.devWeldV1), b = ops.parseIndex(this.devWeldV2);
    if (!id || a === null || b === null) return;
    this.sm?.weldEditVertices3D(id, a, b);
    this.devWeldV1 = '';
    this.devWeldV2 = '';
  }
  devBevelVertex(): void {
    const id = this.meshId, v = ops.parseIndex(this.devBevelVertexIdx);
    if (id && v !== null) this.sm?.bevelVertex3D(id, v, this.devBevelVertexAmount);
  }
  idx(text: unknown): boolean { return ops.parseIndex(text) !== null; }

  trackIndex(_: number, m: MeshModifier): number { return m.index; }
}
