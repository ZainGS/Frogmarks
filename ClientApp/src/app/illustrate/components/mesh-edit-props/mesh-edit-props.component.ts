import { Component, DoCheck, Input, OnDestroy, inject } from '@angular/core';
import type { IllustrationComponent } from '../illustration/illustration.component';
import * as ops from '../../services/mesh-edit-ops';
import type { MeshModifier, ProportionalFalloff } from '../../services/mesh-edit-ops';
import { ExperimentalSettingsService } from '../../services/experimental-settings.service';
import { NotifyService } from '../../../shared/services/notify/notify.service';
import { modeIconPaths } from '../mode-chrome/mode-icons';
import {
  MESH_BG_OPTIONS, MESH_PANEL_ICONS, MESH_SELECT_SEGMENTS, NEEDS_ENGINE_UPDATE, meshChromeCaps, meshPanelTools,
  type MeshBgMode, type MeshChromeCaps, type MeshPanelTool, type MeshSelectMode, type MeshToolId, type MeshVerbId,
} from '../mesh-edit-chrome/mesh-edit-chrome.logic';

/** The editor members the properties use. */
export type MeshEditPropsHost = Pick<IllustrationComponent, 'shapeManager' | 'editorState' | 'meshEdit' | 'scene3dUndo' | 'scene3dMarkDirty'>;

/**
 * Edit Mesh right panel (the mode chrome's props panel; round-2 feedback 2026-10-08, the old Edit Mesh panel's look:
 * green section titles, the classic buttons). Top: Vertex / Edge / Face + Deselect all. Then the mode's tools as
 * icon-only buttons in the main toolbar's style, only the ones that apply to the selection type (tapping the active
 * tool again turns it off). Then Modifiers (Mirror across a face / bisect, Subdivision; Bake / ✕), Cleanup,
 * Proportional editing, the Developer (typed-index) tools behind Experimental › Developer buttons, and the focus
 * background. The ops are services/mesh-edit-ops.ts (shared with the classic panel).
 */
@Component({
  selector: 'app-mesh-edit-props',
  templateUrl: './mesh-edit-props.component.html',
  styleUrls: ['./mesh-edit-props.component.scss'],
})
export class MeshEditPropsComponent implements DoCheck, OnDestroy {
  @Input() ed!: MeshEditPropsHost;

  readonly exp = inject(ExperimentalSettingsService);
  private readonly notify = inject(NotifyService, { optional: true });
  readonly segments = MESH_SELECT_SEGMENTS;
  readonly bgOptions = MESH_BG_OPTIONS;

  modifiers: MeshModifier[] = [];
  /** Per modifier index: the plane mode of a mirror (getMirrorPlane3D; 'axis' on an older Salsa / an X / Y / Z mirror). */
  private mirrorModes = new Map<number, 'face' | 'bisect' | 'axis'>();
  private _modSig = '';
  private toolSeen: MeshToolId | undefined = undefined;

  /** "+ Mirror" is open: Use Face / Bisect Mesh. */
  mirrorChoice = false;
  /** The mirror whose plane handle is on the canvas (Rotate plane), else null. */
  rotatingMirror: number | null = null;

  mergeThreshold = 0.001;
  mergeRemovedCount: number | null = null;

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
    // Picking a tool (the panel, the rail, a key) turns Rotate plane off: the plane handle replaces the selection gizmo
    const tool = this.ed?.meshEdit?.tool;
    if (tool !== this.toolSeen) {
      if (this.toolSeen !== undefined) this.hidePlaneHandle();
      this.toolSeen = tool;
    }
    const next = ops.readModifiers(this.sm, this.meshId);
    const sig = JSON.stringify(next);
    if (sig === this._modSig) return;
    this._modSig = sig;
    this.modifiers = next;
    const get = ops.mirrorPlaneApi(this.sm).getMirrorPlane3D;
    this.mirrorModes = new Map();
    for (const m of next) {
      if (m.type !== 'mirror') continue;
      const plane = typeof get === 'function' && this.meshId ? get.call(this.sm, this.meshId, m.index) : null;
      this.mirrorModes.set(m.index, plane?.mode ?? 'axis');
    }
    // The handle's mirror went away (removed, baked, undone): hide the handle
    if (this.rotatingMirror !== null && !this.isPlaneMirror(this.modifiers[this.rotatingMirror])) this.hidePlaneHandle();
  }

  ngOnDestroy(): void { this.hidePlaneHandle(); }

  // ── Selection type + tools ──

  private capsFor: unknown = null;
  private _caps!: MeshChromeCaps;
  get caps(): MeshChromeCaps {
    if (this.capsFor !== this.sm || !this._caps) { this.capsFor = this.sm; this._caps = meshChromeCaps(this.sm); }
    return this._caps;
  }

  get sel(): ops.MeshEditSelectionLists { return this.ed.meshEdit.selection; }
  get mode(): MeshSelectMode { return this.ed.meshEdit.selectionMode; }
  get tool(): MeshToolId { return this.ed.meshEdit.tool; }
  get hasSelection(): boolean { const s = this.sel; return s.vertices.length + s.edges.length + s.faces.length > 0; }

  setMode(id: string): void { this.ed.meshEdit.setSelectionMode(id as MeshSelectMode); }
  deselectAll(): void { this.ed.meshEdit.deselectAll(); }

  private _toolsSig = '';
  private _tools: MeshPanelTool[] = [];
  /** The tools for the selection type (a stable array while nothing they show changed). */
  get tools(): MeshPanelTool[] {
    const s = this.sel, sm = this.sm;
    const counts = { vertices: s.vertices.length, edges: s.edges.length, faces: s.faces.length };
    const canBridge = ops.canBridge(sm, s);
    const caps = this.caps;
    const sig = `${this.mode}|${counts.vertices}|${counts.edges}|${counts.faces}|${canBridge}|${caps.bevel}`;
    if (sig !== this._toolsSig) { this._toolsSig = sig; this._tools = meshPanelTools(this.mode, caps, counts, canBridge); }
    return this._tools;
  }

  /** A tool button: a tool goes on (tapping the active one turns it off: Select); a verb runs on the selection. */
  tapTool(t: MeshPanelTool): void {
    if (t.disabled) return;
    const me = this.ed.meshEdit;
    if (t.kind === 'tool') me.setTool(me.tool === t.id ? 'select' : t.id as MeshToolId);
    else me.runVerb(t.id as MeshVerbId);
  }

  iconPaths(icon: string): readonly string[] { return modeIconPaths(icon) ?? MESH_PANEL_ICONS[icon] ?? []; }

  trackTool(_: number, t: MeshPanelTool): string { return t.id; }

  // ── Modifiers ──

  label(m: MeshModifier): string { return this.isPlaneMirror(m) ? 'Mirror' : ops.modifierLabel(m); }

  /** A mirror across a face / a bisect plane (Rotate plane, Flip side); an X / Y / Z mirror is not. */
  isPlaneMirror(m: MeshModifier | undefined): boolean {
    if (!m || m.type !== 'mirror') return false;
    const mode = this.mirrorModes.get(m.index);
    return mode === 'face' || mode === 'bisect';
  }

  get hasMirrorFace(): boolean { return typeof ops.mirrorPlaneApi(this.sm).addMirrorFromFace3D === 'function'; }
  get hasMirrorBisect(): boolean { return typeof ops.mirrorPlaneApi(this.sm).addMirrorBisect3D === 'function'; }
  /** Use Face needs exactly one selected face. */
  get canMirrorFace(): boolean { return this.hasMirrorFace && this.sel.faces.length === 1; }
  get mirrorFaceTitle(): string {
    if (!this.hasMirrorFace) return NEEDS_ENGINE_UPDATE;
    return this.sel.faces.length === 1 ? 'Mirror the mesh across the selected face' : 'Select exactly one face first';
  }
  get mirrorBisectTitle(): string {
    return this.hasMirrorBisect ? 'Mirror the mesh across a plane through its middle (Rotate plane turns it)' : NEEDS_ENGINE_UPDATE;
  }

  addMirrorFace(): void {
    const id = this.meshId, f = ops.mirrorPlaneApi(this.sm).addMirrorFromFace3D;
    if (!id || typeof f !== 'function' || this.sel.faces.length !== 1) return;
    f.call(this.sm, id, this.sel.faces[0]);
    this.mirrorChoice = false;
    this.ngDoCheck();
  }

  addMirrorBisect(): void {
    const id = this.meshId, f = ops.mirrorPlaneApi(this.sm).addMirrorBisect3D;
    if (!id || typeof f !== 'function') return;
    f.call(this.sm, id);
    this.mirrorChoice = false;
    this.ngDoCheck();
  }

  /** Rotate plane: the plane + its rotation handle on the canvas (again: hidden). One mirror's handle at a time. */
  toggleRotatePlane(m: MeshModifier): void {
    const id = this.meshId, f = ops.mirrorPlaneApi(this.sm).setMirrorPlaneHandle3D;
    if (!id || typeof f !== 'function') return;
    const next = this.rotatingMirror === m.index ? null : m.index;
    f.call(this.sm, id, next);
    this.rotatingMirror = next;
  }

  private hidePlaneHandle(): void {
    if (this.rotatingMirror === null) return;
    this.rotatingMirror = null;
    const id = this.meshId, f = ops.mirrorPlaneApi(this.sm).setMirrorPlaneHandle3D;
    if (id && typeof f === 'function') f.call(this.sm, id, null);
  }

  /** Flip side: the other side becomes the real half. */
  flipSide(m: MeshModifier): void {
    const id = this.meshId, f = ops.mirrorPlaneApi(this.sm).flipMirrorSide3D;
    if (id && typeof f === 'function') f.call(this.sm, id, m.index);
  }

  get canRotatePlane(): boolean { return typeof ops.mirrorPlaneApi(this.sm).setMirrorPlaneHandle3D === 'function'; }
  get canFlipSide(): boolean { return typeof ops.mirrorPlaneApi(this.sm).flipMirrorSide3D === 'function'; }

  addSubdivision(iterations: 1 | 2): void {
    const id = this.meshId;
    if (id) this.sm?.addSubdivisionModifier3D(id, iterations);
    this.ngDoCheck();
  }

  toggleModifier(m: MeshModifier): void {
    const id = this.meshId;
    if (id) this.sm?.setModifierEnabled3D(id, m.index, !m.enabled);
    this.ngDoCheck();
  }

  /** Bake: the modifier into the mesh (undoable). */
  bakeModifier(m: MeshModifier): void {
    const id = this.meshId;
    if (this.rotatingMirror === m.index) this.hidePlaneHandle();
    if (id) this.sm?.applyModifier3D(id, m.index);
    this.ngDoCheck();
  }

  /** Remove at once (one 3D undo step), with an Undo toast — the editor's remove convention (vector layer ✕). */
  removeModifier(m: MeshModifier): void {
    const id = this.meshId;
    if (!id || !this.sm) return;
    if (this.rotatingMirror === m.index) this.hidePlaneHandle();
    this.sm.removeModifier3D(id, m.index);
    this.ngDoCheck();
    const ref = this.notify?.success(`Removed ${this.label(m)}`, 'Undo');
    ref?.onAction().subscribe(() => { this.ed.scene3dUndo(); this.ed.scene3dMarkDirty(); });
  }

  // ── Cleanup ──

  mergeByDistance(): void {
    const id = this.meshId;
    if (id && this.sm) this.mergeRemovedCount = ops.mergeByDistance(this.sm, id, this.mergeThreshold);
  }
  fillHoles(): void {
    const id = this.meshId;
    if (id && this.sm) ops.fillHoles(this.sm, id);
  }

  // ── Proportional ──

  setProportional(on: boolean): void {
    this.proportionalEnabled = on;
    this.applyProportional();
  }
  applyProportional(): void {
    if (this.sm) ops.setProportional(this.sm, this.meshId, this.proportionalEnabled, this.proportionalRadius, this.proportionalFalloff);
  }

  // ── Background ──

  get bgMode(): MeshBgMode { return this.ed.meshEdit.bgMode; }
  setBgMode(mode: string): void { this.ed.meshEdit.setBgMode(mode as MeshBgMode); }

  // ── Developer buttons: typed indices (the tools act on the selection / a tap instead) ──

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
