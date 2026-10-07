import { Injectable, NgZone, Optional } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { BEVEL_ACTIONS, type BevelState } from '../components/illustration/editor-keymap';
import {
  DEFAULT_MESH_TOOL_PARAMS, meshChromeApi, meshChromeCaps, planMeshTool, type MeshBgMode, type MeshToolId, type MeshToolParams,
} from '../components/mesh-edit-chrome/mesh-edit-chrome.logic';
import * as ops from './mesh-edit-ops';
import { NotifyService } from '../../shared/services/notify/notify.service';

import { EditorStateService } from './editor-state.service';

export type MeshEditSelectMode = 'vertex' | 'edge' | 'face';

/** Exactly the editor state mesh edit mode uses. */
export type MeshEditHost = Pick<IllustrationComponent, 'shapeManager' |
  '_exitAllScene3dModes' | 'canvasRef' | 'handleCanvasRef'
> & Partial<Pick<IllustrationComponent, 'scene3dGizmoMode' | 'activeModeChrome' | 'hud'>>;

/**
 * 3D mesh edit mode: enter / exit (engine edit mode + its pointer controller on the canvas), the edit tool, and the
 * knife (start / preview on the handle canvas / cut). The editor's canvas pointer handlers ask knifePointerDown / Move /
 * Up first. Component-scoped (provided by IllustrationComponent). Bodies moved verbatim from illustration.component
 * (refactor-plan 2.9G).
 */
@Injectable()
export class MeshEditService {
  private host!: MeshEditHost;
  constructor(private editorState: EditorStateService, private ngZone: NgZone, @Optional() private notify?: NotifyService) {}
  bind(host: MeshEditHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  scene3dIsEditingMesh = false;
  /** Frogmarks' own drag-a-line knife ('knife') — the classic panel, and the chrome on a Salsa without the engine Knife. */
  scene3dEditTool: 'select' | 'knife' = 'select';

  // ── Mode chrome state (UI review 2026-10-07 §4; components/mesh-edit-chrome) ──
  /** The focus background (both layouts: the classic panel's dropdown, the chrome's ⋯ menu). Calm Gradient by default. */
  bgMode: MeshBgMode = 'gradient';
  /** The tool strip's tool (the chrome only; the classic panel has Select / Knife through scene3dEditTool). */
  tool: MeshToolId = 'select';
  /** The tools' amounts for their next run (the op pill edits them; the classic panel's fields read them too). */
  readonly params: MeshToolParams = { ...DEFAULT_MESH_TOOL_PARAMS };
  /** The Edit Mesh mode chrome is the layout (IllustrationComponent.useModeChrome.meshEdit and Edit Mesh active). */
  get chromeOn(): boolean { return this.host?.activeModeChrome === 'meshEdit'; }
  /** Vertex / Edge / Face: ONE state for the Mesh Edit panel's tabs and the 1 / 2 / 3 keys (mode-keymap.ts). */
  selectionMode: MeshEditSelectMode = 'face';
  private _knifeStart: { x: number; y: number } | null = null;
  /** The pointer drawing the knife line: only it moves the preview and cuts on release (a 2nd finger used to restart
   *  the line at its own position and cut on ITS release). */
  private _knifePointerId: number | null = null;

  enterMeshEditMode(): void {
    if (!this.editorState.scene3dSelectedMeshId) return;
    this.host._exitAllScene3dModes();
    this.editMesh(this.editorState.scene3dSelectedMeshId);
  }

  /** Engine edit mode on `meshId` + its pointer controller on the canvas (no other mode is exited — the array
   *  group's "edit source" uses this directly). */
  editMesh(meshId: string): void {
    const sm = this.shapeManager;
    const canvas = this.host.canvasRef?.nativeElement;
    sm.enterMeshEditMode3D(meshId);
    this.scene3dIsEditingMesh = true;
    // Every entry starts in Face mode — the engine's picker too (it kept the last session's mode while the panel showed
    // Face, so taps picked vertices under a "Face" tab)
    this.selectionMode = 'face';
    sm.setMeshEditSelectionMode('face');
    if (canvas) {
      sm.attachMeshEditPointerHandlers(
        canvas,
        meshId,
        () => this.ngZone.run(() => { /* trigger change detection so panel re-reads selection */ }),
      );
    }
    // The selection gizmo (a newer Salsa dist): the rail's Move / Rotate / Scale show (and pick) its mode
    const gizmo = sm as unknown as { getMeshEditGizmoMode3D?(): 'move' | 'rotate' | 'scale' | null };
    if (typeof gizmo.getMeshEditGizmoMode3D === 'function' && 'scene3dGizmoMode' in this.host) {
      this.host.scene3dGizmoMode = gizmo.getMeshEditGizmoMode3D();
    }
    sm.setMeshEditBgMode3D?.({ mode: this.bgMode });
    // The chrome's tool strip shows the engine's tool (default 'move' = the selection gizmo); an older dist has no
    // tool state: Select.
    const getTool = meshChromeApi(sm).getMeshEditActiveTool3D;
    this.tool = typeof getTool === 'function' ? (getTool.call(sm) ?? 'select') : 'select';
  }

  /** Change the focus background (the classic panel's dropdown / the chrome's ⋯ menu). */
  setBgMode(mode: MeshBgMode): void {
    this.bgMode = mode;
    this.shapeManager?.setMeshEditBgMode3D?.({ mode });
  }

  // ── The tool strip (the chrome; salsa docs/reviews/section4-engine-api.md §D) ──

  private get _caps() { return meshChromeCaps(this.shapeManager); }

  /** The selection of the mesh being edited (arrays; empty outside Edit Mesh). */
  get selection(): ops.MeshEditSelectionLists { return ops.editSelection(this.shapeManager, this._editId); }

  /**
   * Pick a tool. A newer Salsa runs it (setMeshEditActiveTool3D: gizmo per tool, Loop Cut / Knife taps); an older one
   * gets the fallbacks (planMeshTool): Move / Rotate / Scale start the keyboard G / R / S on the selection (or show the
   * selection gizmo), the Knife is Frogmarks' drag-a-line knife. Bevel starts the Chamfer. Leaving a tool drops what it
   * had running (the Chamfer, the knife line, a keyboard transform).
   */
  setTool(tool: MeshToolId): void {
    const sm = this.shapeManager;
    if (!sm) return;
    const caps = this._caps;
    if (tool !== 'bevel' && BEVEL_ACTIONS.active(this.host)) BEVEL_ACTIONS.cancel(this.host);
    if (tool !== 'knife' && this.scene3dEditTool === 'knife') this.cancelKnifeCut();
    if (sm.isShortcutActive3D) { sm.cancelTransform3D(); this.host.hud?.syncShortcutHud(); }
    const sel = this.selection;
    const plan = planMeshTool(tool, caps, sel.vertices.length + sel.edges.length + sel.faces.length > 0);
    this.tool = tool;
    const api = meshChromeApi(sm);
    if (plan.engineTool) api.setMeshEditActiveTool3D?.call(sm, plan.engineTool);
    if (plan.gizmo !== undefined) api.setMeshEditGizmoMode3D?.call(sm, plan.gizmo);
    if (plan.beginTransform) { sm.beginTransform3D(plan.beginTransform); this.host.hud?.syncShortcutHud(); }
    this.scene3dEditTool = plan.legacyKnife ? 'knife' : 'select';
    if (plan.beginBevel && !BEVEL_ACTIONS.active(this.host)) BEVEL_ACTIONS.begin(this.host);
    sm.requestRender3D?.();
  }

  /** E / I: the Extrude / Inset tool (chrome), run at once on the selected faces with the tool's amount. */
  toolKey(tool: 'extrude' | 'inset'): void {
    if (this.chromeOn && this.tool !== tool) this.setTool(tool);
    if (tool === 'extrude') this.runExtrude(); else this.runInset();
  }

  /** Extrude the selected faces by params.extrudeDistance. False = no face selected. */
  runExtrude(): boolean {
    const id = this._editId;
    const faces = this.selection.faces;
    if (!id || !faces.length) return false;
    return ops.extrudeFaces(this.shapeManager, id, faces, this.params.extrudeDistance);
  }

  /** Inset the selected faces by params.insetAmount (+ depth on a newer Salsa). False = no face selected. */
  runInset(): boolean {
    const id = this._editId;
    const faces = this.selection.faces;
    if (!id || !faces.length) return false;
    return ops.insetFaces(this.shapeManager, id, faces, this.params.insetAmount, this._caps.insetDepth ? this.params.insetDepth : 0);
  }

  /** The Knife's tapped points (a newer Salsa), 0 otherwise. */
  get knifePointCount(): number {
    const f = meshChromeApi(this.shapeManager).getMeshEditKnifePointCount3D;
    return this.scene3dIsEditingMesh && typeof f === 'function' ? f.call(this.shapeManager) : 0;
  }

  /** Enter / the pill's Cut: cut along the tapped points. False = nothing to cut (Enter falls through). */
  applyKnifePoints(): boolean {
    const f = meshChromeApi(this.shapeManager).applyMeshEditKnife3D;
    if (!this.chromeOn || this.tool !== 'knife' || typeof f !== 'function' || this.knifePointCount < 2) return false;
    const split = f.call(this.shapeManager);
    if (!split) this.notify?.error("The knife couldn't cut there. Start and end on an edge, and don't cross a face twice.");
    return true;
  }

  /** Esc / the pill's Clear: drop the tapped points. False = none (Esc falls through). */
  cancelKnifePoints(): boolean {
    const f = meshChromeApi(this.shapeManager).cancelMeshEditKnife3D;
    if (!this.chromeOn || typeof f !== 'function' || this.knifePointCount === 0) return false;
    f.call(this.shapeManager);
    return true;
  }

  exitMeshEditMode(): void {
    const sm = this.shapeManager;
    sm.detachMeshEditPointerHandlers();
    sm.exitMeshEditMode3D();
    // (a newer dist: the rail showed the selection gizmo's mode — the object gizmo takes it over, so the rail stays true)
    if (typeof (sm as unknown as { getMeshEditGizmoMode3D?: unknown }).getMeshEditGizmoMode3D === 'function'
        && this.host.scene3dGizmoMode !== undefined) {
      sm.setGizmoMode3D(this.host.scene3dGizmoMode);
    }
    this.scene3dIsEditingMesh = false;
    this.scene3dEditTool = 'select';
    this._knifeStart = null;
    this._knifePointerId = null;
    this._clearKnifePreview();
  }

  private _drawKnifePreview(x0: number, y0: number, x1: number, y1: number): void {
    const hc = this.host.handleCanvasRef?.nativeElement;
    if (!hc) return;
    const ctx = hc.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, hc.width, hc.height);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = 'rgba(255, 255, 80, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    // Start dot
    ctx.beginPath();
    ctx.arc(x0, y0, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 80, 0.9)';
    ctx.fill();
    ctx.restore();
  }

  private _clearKnifePreview(): void {
    const hc = this.host.handleCanvasRef?.nativeElement;
    if (!hc) return;
    hc.getContext('2d')?.clearRect(0, 0, hc.width, hc.height);
  }

  /** Canvas pointerdown in mesh edit mode: the engine picks faces / vertices / edges; the knife records its start.
   *  True = edit mode owns the click (no mesh selection). */
  knifePointerDown(event: PointerEvent, canvas: HTMLCanvasElement): boolean {
    if (!(this.scene3dIsEditingMesh && this.editorState.scene3dSelectedMeshId)) return false;
    if (this.scene3dEditTool === 'knife') {
      this._knifeStart = { x: event.offsetX, y: event.offsetY };
      this._knifePointerId = event.pointerId;
      try { canvas.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    }
    return true;
  }

  /** Knife drag: draw the cut preview. True = handled. */
  knifePointerMove(event: PointerEvent): boolean {
    if (!(this.scene3dIsEditingMesh && this.scene3dEditTool === 'knife' && this._knifeStart)) return false;
    if (this._knifePointerId !== null && event.pointerId !== this._knifePointerId) return true;   // another finger
    this._drawKnifePreview(this._knifeStart.x, this._knifeStart.y, event.offsetX, event.offsetY);
    return true;
  }

  /** Knife release: cut along the dragged line. True = handled. */
  knifePointerUp(event: PointerEvent): boolean {
    if (!(this.scene3dIsEditingMesh && this.scene3dEditTool === 'knife' && this._knifeStart)) return false;
    if (this._knifePointerId !== null && event.pointerId !== this._knifePointerId) return true;   // another finger lifted
    this._knifePointerId = null;
    const canvas = this.host.canvasRef?.nativeElement;
    if (canvas && this.editorState.scene3dSelectedMeshId) {
      // The canvas BACKING ratio, not window.devicePixelRatio: on mobile the backing store is capped (e.g. 1.5 on a DPR-2
      // tablet), so devicePixelRatio put the cut at 2/1.5 of the finger position.
      const cssW = canvas.getBoundingClientRect().width || canvas.clientWidth;
      const dpr = cssW > 0 ? canvas.width / cssW : (window.devicePixelRatio || 1);
      this.shapeManager.knifeCut3D(
        this.editorState.scene3dSelectedMeshId,
        this._knifeStart.x * dpr, this._knifeStart.y * dpr,
        event.offsetX * dpr, event.offsetY * dpr,
        canvas.width, canvas.height,
      );
    }
    this._knifeStart = null;
    this._clearKnifePreview();
    return true;
  }

  /** Esc in mesh edit mode: drop the knife cut in progress and go back to select. */
  cancelKnifeCut(): void {
    // The chrome on an older Salsa (the drag knife is its Knife tool): Esc leaves the tool too
    if (this.scene3dEditTool === 'knife' && this.tool === 'knife' && this.chromeOn) this.tool = 'select';
    this.scene3dEditTool = 'select';
    this._knifeStart = null;
    this._knifePointerId = null;
    this._clearKnifePreview();
  }

  /** A second finger landed (pinch / two-finger orbit, TOUCH-5): the line being drawn is dropped — no cut — and the
   *  knife stays on for the next stroke. */
  knifeAbortForGesture(): void {
    if (!this._knifeStart) return;
    this._knifeStart = null;
    this._knifePointerId = null;
    this._clearKnifePreview();
  }

  /** pointercancel: the line's pointer is gone — drop the line (no cut). */
  knifePointerCancel(event: PointerEvent): void {
    if (this._knifeStart && (this._knifePointerId === null || event.pointerId === this._knifePointerId)) this.knifeAbortForGesture();
  }

  /** Edit › Delete in mesh edit mode: the selected faces of the mesh being edited (what the Mesh Edit panel's Delete
   *  button does — that panel edits the selected mesh too). */
  deleteSelectedFaces(): void {
    const id = this.editorState.scene3dSelectedMeshId;
    if (!this.scene3dIsEditingMesh || !id) return;
    const sm = this.shapeManager;
    const faces = [...(sm.getEditSelection3D(id)?.faces ?? [])];
    if (faces.length === 0) return;
    // One undo step for the whole selection (A then X deleted a cube face by face: six Ctrl+Z to get it back)
    if (typeof sm.deleteFaces3D === 'function') sm.deleteFaces3D(id, new Set(faces));
    else for (const fi of faces.sort((a, b) => b - a)) sm.deleteEditFace3D(id, fi);   // highest first: no index shifting
    sm.clearEditSelection3D(id);
  }

  // ── Element selection + the Edit Mesh keys (mode-keymap.ts: 1 / 2 / 3, A / Alt+A, X / Delete, Ctrl+R) ──

  /** The mesh being edited (null = not in Edit Mesh). */
  private get _editId(): string | null {
    return this.scene3dIsEditingMesh ? this.editorState.scene3dSelectedMeshId : null;
  }

  /** Vertex / Edge / Face (the panel's tabs, 1 / 2 / 3): the engine's picker switches and the selection is cleared. */
  setSelectionMode(mode: MeshEditSelectMode): void {
    this.selectionMode = mode;
    const sm = this.shapeManager, id = this._editId;
    sm.setMeshEditSelectionMode(mode);
    if (id) sm.clearEditSelection3D(id);
    sm.requestRender3D?.();
  }

  /** A: select every vertex / edge / face of the current mode; when all of them already are, deselect all. */
  toggleSelectAll(): void {
    const sm = this.shapeManager, id = this._editId;
    const em = id ? sm.getEditMesh3D(id) : null;
    if (!id || !em) return;
    const sel = sm.getEditSelection3D(id);
    const he = em.halfEdges;
    let all: number[];
    let isSelected: (i: number) => boolean;
    if (this.selectionMode === 'vertex') {
      all = em.vertices.map((_, i) => i);
      isSelected = i => !!sel?.vertices.has(i);
    } else if (this.selectionMode === 'edge') {
      // one half-edge per edge (a boundary edge has no twin); either half counts as the edge selected
      all = [];
      for (let i = 0; i < he.length; i++) if (he[i].twin < 0 || i < he[i].twin) all.push(i);
      isSelected = i => !!sel && (sel.edges.has(i) || (he[i].twin >= 0 && sel.edges.has(he[i].twin)));
    } else {
      all = em.faces.map((_, i) => i);
      isSelected = i => !!sel?.faces.has(i);
    }
    const everything = all.length > 0 && all.every(isSelected);
    sm.clearEditSelection3D(id);
    if (!everything) {
      const select = this.selectionMode === 'vertex' ? sm.selectVertex3D.bind(sm)
        : this.selectionMode === 'edge' ? sm.selectEdge3D.bind(sm) : sm.selectFace3D.bind(sm);
      for (const i of all) select(id, i, true);
    }
    sm.requestRender3D?.();
  }

  /** Select what is not selected (the current mode's elements; an edge counts once, either half-edge). */
  invertSelection(): void {
    const sm = this.shapeManager, id = this._editId;
    const em = id ? sm.getEditMesh3D(id) : null;
    if (!id || !em) return;
    const sel = sm.getEditSelection3D(id);
    const he = em.halfEdges;
    let next: number[];
    if (this.selectionMode === 'vertex') next = em.vertices.map((_, i) => i).filter(i => !sel?.vertices.has(i));
    else if (this.selectionMode === 'edge') {
      next = [];
      for (let i = 0; i < he.length; i++) {
        if (!(he[i].twin < 0 || i < he[i].twin)) continue;
        if (!(sel?.edges.has(i) || (he[i].twin >= 0 && sel?.edges.has(he[i].twin)))) next.push(i);
      }
    } else next = em.faces.map((_, i) => i).filter(i => !sel?.faces.has(i));
    sm.clearEditSelection3D(id);
    const select = this.selectionMode === 'vertex' ? sm.selectVertex3D.bind(sm)
      : this.selectionMode === 'edge' ? sm.selectEdge3D.bind(sm) : sm.selectFace3D.bind(sm);
    for (const i of next) select(id, i, true);
    sm.requestRender3D?.();
  }

  /** Alt+A: deselect everything. */
  deselectAll(): void {
    const id = this._editId;
    if (!id) return;
    this.shapeManager.clearEditSelection3D(id);
    this.shapeManager.requestRender3D?.();
  }

  /** X / Delete: the selected faces are deleted; else the selected edges dissolved (each merges its two faces). The
   *  engine has no vertex delete yet: a vertex selection does nothing. False = nothing to act on. */
  deleteSelectedElements(): boolean {
    const id = this._editId;
    const sel = id ? this.shapeManager.getEditSelection3D(id) : null;
    if (!sel) return false;
    if (sel.faces.size > 0) { this.deleteSelectedFaces(); return true; }
    if (sel.edges.size > 0) return this.dissolveSelectedEdges() > 0;
    return false;
  }

  /** Dissolve each selected interior edge (one undo step each). Every dissolve rebuilds the topology (half-edge
   *  indices move), so the edges are remembered by their end vertices and looked up again before each one. Returns
   *  how many were dissolved. */
  dissolveSelectedEdges(): number {
    const sm = this.shapeManager, id = this._editId;
    const em = id ? sm.getEditMesh3D(id) : null;
    const sel = id ? sm.getEditSelection3D(id) : null;
    if (!id || !em || !sel || sel.edges.size === 0) return 0;
    const he0 = em.halfEdges;
    const pairs = [...sel.edges].filter(i => i >= 0 && i < he0.length).map(i => [he0[he0[i].prev].vertex, he0[i].vertex] as const);
    sm.clearEditSelection3D(id);
    let done = 0;
    for (const [a, b] of pairs) {
      const hes = sm.getEditMesh3D(id)?.halfEdges ?? [];
      const idx = hes.findIndex(h => h.twin >= 0 && ((h.vertex === b && hes[h.prev].vertex === a) || (h.vertex === a && hes[h.prev].vertex === b)));
      if (idx >= 0 && sm.dissolveEdge3D(id, idx)) done++;
    }
    sm.requestRender3D?.();
    return done;
  }

  /** Ctrl+R: a loop cut through the (first) selected edge at `t` along it (0.5 = the middle); the selection is cleared
   *  (the cut rebuilds the topology). False = no edge selected. */
  loopCutSelectedEdge(t?: number, count?: number): boolean {
    const sm = this.shapeManager, id = this._editId;
    const sel = id ? sm.getEditSelection3D(id) : null;
    const edge = sel ? [...sel.edges][0] : undefined;
    if (!id || edge === undefined) return false;
    // The chrome: the Loop Cut tool's cuts / position (several cuts on a newer Salsa: loopCuts3D, the last op)
    const pos = t ?? (this.chromeOn ? this.params.loopCutPosition : 0.5);
    const n = count ?? (this.chromeOn ? this.params.loopCutCount : 1);
    const ok = ops.loopCutAt(sm, id, edge, n, pos);
    sm.clearEditSelection3D(id);
    sm.requestRender3D?.();
    return ok;
  }

  toggleKnifeTool(): void {
    // The chrome: the tool strip's Knife (the engine's tap knife on a newer Salsa, else the drag knife via setTool)
    if (this.chromeOn) { this.setTool(this.tool === 'knife' ? 'select' : 'knife'); return; }
    if (this.scene3dEditTool !== 'knife') BEVEL_ACTIONS.cancel(this.host);   // one tool at a time
    this.scene3dEditTool = this.scene3dEditTool === 'knife' ? 'select' : 'knife';
    if (this.scene3dEditTool === 'select') this._clearKnifePreview();
  }

  // ── Chamfer / Bevel (the engine's tool: salsa docs/specs/edit-mesh-topology.md §8) ──

  /** The Chamfer tool's state for the HUD readout / panel (null = not running, or an older Salsa dist). */
  get bevelState(): BevelState | null {
    return this.scene3dIsEditingMesh && this.host?.shapeManager ? BEVEL_ACTIONS.state(this.host) : null;
  }

  /** Start the Chamfer (on the selection, else wait for a tap on a corner / edge); drops the knife. */
  startBevel(): void {
    if (!this.scene3dIsEditingMesh) return;
    if (this.scene3dEditTool === 'knife') this.cancelKnifeCut();
    BEVEL_ACTIONS.begin(this.host);
  }
}
