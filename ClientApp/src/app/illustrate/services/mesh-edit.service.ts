import { Injectable, NgZone, Optional } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { BEVEL_ACTIONS, type BevelState } from '../components/illustration/editor-keymap';
import {
  DEFAULT_EDIT_BG_MODE, DEFAULT_MESH_TOOL_PARAMS, PREVIEW_OPS, PREVIEW_PARAMS, editBgOptions, meshChromeApi, meshChromeCaps,
  meshToolAppliesTo, planMeshTool,
  type MeshBgMode, type MeshPreviewKind, type MeshToolId, type MeshToolParams, type MeshVerbId,
} from '../components/mesh-edit-chrome/mesh-edit-chrome.logic';
import * as ops from './mesh-edit-ops';
import { NotifyService } from '../../shared/services/notify/notify.service';
import { ModeUndoScope } from './mode-undo-scope';

import { EditorStateService } from './editor-state.service';

export type MeshEditSelectMode = 'vertex' | 'edge' | 'face';

/** Exactly the editor state mesh edit mode uses. */
export type MeshEditHost = Pick<IllustrationComponent, 'shapeManager' |
  '_exitAllScene3dModes' | 'canvasRef' | 'handleCanvasRef'
> & Partial<Pick<IllustrationComponent, 'scene3dGizmoMode' | 'activeModeChrome' | 'hud'>>;

/** Edit Mesh Drag Lock, remembered on this device (MeshEditService.dragLock). */
const DRAG_LOCK_KEY = 'fm-mesh-drag-lock';
function readDragLock(): boolean {
  try { return localStorage.getItem(DRAG_LOCK_KEY) === '1'; } catch { return false; }
}

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
  /** The focus background (both layouts: the classic panel's dropdown, the chrome's ⋯ menu). Wavy Sage by default. */
  bgMode: MeshBgMode = DEFAULT_EDIT_BG_MODE;
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
  /** Undo scope (round-2 feedback): undo stops at the 3D step on top when Edit Mesh was entered, redo after the steps
   *  undone in it (ModeUndoScope — shared with the Armature). */
  private readonly _undoScope = new ModeUndoScope(() => this.host?.shapeManager);

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
    this._undoScope.enter();
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
    // Every entry starts with no tool (user request 2026-10-08): Select — the engine's tool too (its default was 'move',
    // the selection gizmo), so the rail shows no Move / Rotate / Scale until one is picked
    const setTool = meshChromeApi(sm).setMeshEditActiveTool3D;
    if (typeof setTool === 'function') setTool.call(sm, 'select');
    this.tool = 'select';
    // The selection gizmo (a newer Salsa dist): the rail's Move / Rotate / Scale show (and pick) its mode
    const gizmo = sm as unknown as { getMeshEditGizmoMode3D?(): 'move' | 'rotate' | 'scale' | null };
    if (typeof gizmo.getMeshEditGizmoMode3D === 'function' && 'scene3dGizmoMode' in this.host) {
      this.host.scene3dGizmoMode = gizmo.getMeshEditGizmoMode3D();
    }
    sm.setMeshEditBgMode3D?.(editBgOptions(this.bgMode));
    this._applyDragLock();
  }

  /** Drag Lock (user request 2026-10-08): dragging the selection never moves it (a drag orbits instead), so a wobbly
   *  pen tap can't nudge geometry. Remembered on this device; applied on every Edit Mesh entry. Engine:
   *  setMeshEditDragMovesSelection3D (guarded — an older dist has no drag-to-move to lock). */
  dragLock = readDragLock();
  setDragLock(on: boolean): void {
    this.dragLock = on;
    try { localStorage.setItem(DRAG_LOCK_KEY, on ? '1' : '0'); } catch { /* storage unavailable: session only */ }
    this._applyDragLock();
  }
  private _applyDragLock(): void {
    const sm = this.shapeManager as unknown as { setMeshEditDragMovesSelection3D?(on: boolean): void } | null;
    if (typeof sm?.setMeshEditDragMovesSelection3D === 'function') sm.setMeshEditDragMovesSelection3D(!this.dragLock);
  }

  /** Change the focus background (the classic panel's dropdown / the chrome's ⋯ menu). */
  setBgMode(mode: MeshBgMode): void {
    this.bgMode = mode;
    this.shapeManager?.setMeshEditBgMode3D?.(editBgOptions(mode));
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
    this.cancelMirrorFacePick();   // picking a tool ends Mirror's "tap a face"
    const caps = this._caps;
    // Another tool (or the active one re-tapped: Select) while a live preview shows: the preview is cancelled
    const showing = this.previewKind;
    if (showing && showing !== tool) this._revertPreview();
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
    if (plan.beginBevel && !BEVEL_ACTIONS.active(this.host)) this.beginBevelPreview();
    // The main toolbar's Move / Rotate / Scale show the Edit Mesh tool (Select and the panel tools: none of them)
    if (this.chromeOn && 'scene3dGizmoMode' in this.host) {
      this.host.scene3dGizmoMode = tool === 'move' || tool === 'rotate' || tool === 'scale' ? tool : null;
    }
    // Extrude / Inset picked with faces selected: they run at once as a live preview (next Edit Mesh batch §4)
    if ((tool === 'extrude' || tool === 'inset') && !this.previewKind) this.startPreview(tool);
    sm.requestRender3D?.();
  }

  // ── Live preview: Extrude / Inset / Subdivide (+ the Chamfer's start amount) — next Edit Mesh batch §4 ──

  /** The preview showing: the op it ran on which mesh. Only while the engine's last op is still it (an undo / another
   *  edit ends it — the op then stays, as any other step). */
  private _preview: { kind: MeshPreviewKind; meshId: string } | null = null;
  /** Pill changes waiting for the next frame (one re-run per frame: each compiles the mesh). */
  private _previewPending: Record<string, number> | null = null;
  private _previewRaf = 0;
  /** The last op an Apply kept: the chrome doesn't offer "adjust last" for it (the preview was the adjusting). */
  appliedOpSig: string | null = null;

  /** The engine runs the previews (getMeshEditLastOp3D + redo + cancelMeshEditLastOp3D) and the chrome is the layout. */
  get previewSupported(): boolean { return this.chromeOn && this._caps.preview; }

  private _lastOpOf(sm: ShapeManager | null | undefined): { op: string; params: Record<string, unknown> } | null {
    const f = meshChromeApi(sm).getMeshEditLastOp3D;
    return sm && typeof f === 'function' ? (f.call(sm) ?? null) : null;
  }

  /** Which live preview shows (null = none). */
  get previewKind(): MeshPreviewKind | null {
    const p = this._preview;
    if (!p) return null;
    const sm = this.host?.shapeManager;
    if (!this.scene3dIsEditingMesh || this._editId !== p.meshId || this._lastOpOf(sm)?.op !== PREVIEW_OPS[p.kind]) {
      this._dropPreview();   // undone / edited since / Edit Mesh left: no preview any more (the op stays as a step)
      return null;
    }
    return p.kind;
  }

  /**
   * Run `kind` on the selected faces as a LIVE PREVIEW with the last-used params (one undo step that the params re-run
   * in place). The engine then re-targets it on face taps (resolved against the mesh before it). False (nothing run) on
   * an older Salsa, outside the chrome, or with no face selected.
   */
  startPreview(kind: MeshPreviewKind): boolean {
    const sm = this.shapeManager, id = this._editId;
    if (!sm || !id || !this.previewSupported) return false;
    this._revertPreview();
    const faces = this.selection.faces;
    if (!faces.length) return false;
    const api = meshChromeApi(sm);
    let ok: boolean;
    if (kind === 'extrude') ok = ops.extrudeFaces(sm, id, faces, this.params.extrudeDistance);
    else if (kind === 'inset') ok = ops.insetFaces(sm, id, faces, this.params.insetAmount, this._caps.insetDepth ? this.params.insetDepth : 0);
    else ok = typeof api.subdivideFaces3D === 'function' && !!api.subdivideFaces3D.call(sm, id, new Set(faces), this.params.subdivideLevels);
    if (!ok || this._lastOpOf(sm)?.op !== PREVIEW_OPS[kind]) return false;   // (not recorded: it stays a plain step)
    this._preview = { kind, meshId: id };
    this.appliedOpSig = null;
    api.setMeshEditOpPreview3D?.call(sm, true);
    sm.requestRender3D?.();
    return true;
  }

  /** A pill param of the preview changed: kept for the next run, the preview re-runs with it (once per frame). */
  setPreviewParam(id: string, value: unknown): void {
    const kind = this.previewKind;
    const key = kind ? PREVIEW_PARAMS[kind][id] : undefined;
    const v = Number(value);
    if (!kind || !key || !Number.isFinite(v)) return;
    this.params[key] = v;
    this._previewPending = { ...(this._previewPending ?? {}), [id]: v };
    if (this._previewRaf) return;
    this._previewRaf = requestAnimationFrame(() => this.ngZone.run(() => { this._previewRaf = 0; this._flushPreview(); }));
  }

  private _flushPreview(): void {
    if (this._previewRaf) { cancelAnimationFrame(this._previewRaf); this._previewRaf = 0; }
    const p = this._previewPending, sm = this.shapeManager;
    this._previewPending = null;
    const f = meshChromeApi(sm).redoMeshEditLastOp3D;
    if (p && this.previewKind && typeof f === 'function') f.call(sm, p);
  }

  /** Apply: the preview stays as its one undo step; the tool stays on. False = no preview showing. */
  applyPreview(): boolean {
    if (!this.previewKind) return false;
    this._flushPreview();
    const last = this._lastOpOf(this.shapeManager);
    this.appliedOpSig = last ? JSON.stringify(last) : null;
    this._dropPreview();
    return true;
  }

  /**
   * Cancel (the pill, Esc, the Subdivide button again, any other edit in the panel): the preview is reverted — no undo
   * step, no redo entry — and Extrude / Inset go off (Select). A running Chamfer / Bevel is the Bevel tool's preview:
   * it is cancelled and the tool goes off too. False = nothing to cancel.
   */
  cancelPreview(): boolean {
    const kind = this._revertPreview();
    if (kind) {
      if (kind !== 'subdivide' && this.tool === kind) this.setTool('select');
      return true;
    }
    if (this.chromeOn && this.tool === 'bevel' && BEVEL_ACTIONS.active(this.host)) { this.cancelBevelTool(); return true; }
    return false;
  }

  /** Revert the preview showing (no step left), the tool unchanged. The kind it was, or null. */
  private _revertPreview(): MeshPreviewKind | null {
    const kind = this.previewKind;
    if (!kind) return null;
    if (this._previewRaf) { cancelAnimationFrame(this._previewRaf); this._previewRaf = 0; }
    this._previewPending = null;
    const sm = this.shapeManager;
    meshChromeApi(sm).cancelMeshEditLastOp3D?.call(sm);
    this._dropPreview();
    sm?.requestRender3D?.();
    return kind;
  }

  /** Forget the preview (the engine's re-targeting off) without touching the mesh. */
  private _dropPreview(): void {
    if (!this._preview) return;
    this._preview = null;
    this._previewPending = null;
    if (this._previewRaf) { cancelAnimationFrame(this._previewRaf); this._previewRaf = 0; }
    const sm = this.host?.shapeManager;
    meshChromeApi(sm).setMeshEditOpPreview3D?.call(sm, false);
  }

  /** Enter: apply the preview showing, or the Chamfer (chrome). False = neither (Enter goes on to the other keys). */
  applyPreviewKey(): boolean {
    if (this.shapeManager?.isShortcutActive3D) return false;
    if (this.applyPreview()) return true;
    if (this.chromeOn && this.tool === 'bevel' && BEVEL_ACTIONS.state(this.host)?.phase === 'adjust') { this.applyBevel(); return true; }
    return false;
  }

  /** Esc: cancel Mirror's "tap a face", the preview showing / the Chamfer (chrome). False = none of them. */
  cancelPreviewKey(): boolean {
    if (this.cancelMirrorFacePick()) return true;
    if (this.shapeManager?.isShortcutActive3D) return false;
    return this.cancelPreview();
  }

  /** The Bevel tool's start: the Chamfer on the selection, previewed at once with the last applied amount (it waits
   *  for a tap on a corner / edge when nothing fits). */
  beginBevelPreview(): void {
    if (!BEVEL_ACTIONS.begin(this.host)) return;
    if (this.chromeOn && BEVEL_ACTIONS.state(this.host)?.phase === 'adjust' && this.params.bevelAmount > 0) {
      BEVEL_ACTIONS.setAmount(this.host, String(this.params.bevelAmount));
    }
  }

  /** The Chamfer's Apply (pill / Enter): one undo step; its amount is the next start amount. */
  applyBevel(): void {
    const s = BEVEL_ACTIONS.state(this.host);
    if (s && s.phase === 'adjust' && s.amount > 0) this.params.bevelAmount = s.amount;
    BEVEL_ACTIONS.commit(this.host);
    const last = this._lastOpOf(this.shapeManager);
    this.appliedOpSig = last ? JSON.stringify(last) : null;
  }

  /** The Chamfer's Cancel: the mesh back exactly, and the Bevel tool goes off. */
  cancelBevelTool(): void {
    BEVEL_ACTIONS.cancel(this.host);
    if (this.chromeOn && this.tool === 'bevel') this.setTool('select');
  }

  /** Esc while a Loop Cut press is held: nothing is cut (a newer Salsa). False = no press. */
  cancelLoopCutPress(): boolean {
    const f = meshChromeApi(this.shapeManager).cancelMeshEditLoopCut3D;
    return typeof f === 'function' && !!f.call(this.shapeManager);
  }

  /** A one-shot op on the selection (the right panel's verb buttons, the radial menu). False = nothing to act on. */
  runVerb(id: MeshVerbId | 'fill'): boolean {
    const sm = this.shapeManager, id3 = this._editId;
    if (!sm || !id3) return false;
    this.cancelMirrorFacePick();
    // Subdivide is a live preview on a newer Salsa (tapping it again while it shows = Cancel); any other verb first
    // cancels a preview showing (its revert must not undo the verb's step)
    if (id === 'subdivide' && this.previewSupported) {
      if (this.previewKind === 'subdivide') return this.cancelPreview();
      return this.startPreview('subdivide');
    }
    this.cancelPreview();
    const sel = this.selection;
    switch (id) {
      case 'delete': case 'dissolve': return this.deleteSelectedElements();
      case 'subdivide': if (!sel.faces.length) return false; ops.subdivideFaces(sm, id3, sel.faces); return true;
      case 'flip': if (!sel.faces.length) return false; ops.flipFaces(sm, id3, sel.faces); return true;
      case 'separate': if (!sel.faces.length) return false; ops.separateFaces(sm, id3, sel.faces); return true;
      case 'merge': return ops.mergeVertices(sm, id3, sel.vertices);
      case 'bridge': return ops.bridgeLoops(sm, id3, sel);
      case 'fill': return ops.fillHoles(sm, id3) > 0;
    }
  }

  // ── Undo / Redo while in Edit Mesh (the top bar's buttons, Ctrl+Z / Ctrl+Y, two- / three-finger taps) ──

  /**
   * Edit Mesh owns undo / redo while it is on: only the steps made in it. Undo stops at the step that was on top when
   * Edit Mesh was entered (an older Salsa without peekUndoCommand3D: no floor); redo only re-does what was undone in
   * Edit Mesh. Returns whether the step may run (the caller runs it: scene3dUndo / scene3dRedo) and counts it.
   */
  takeUndoStep(redo: boolean): boolean { return this._undoScope.takeStep(redo); }

  /** E / I: the Extrude / Inset tool (chrome), run at once on the selected faces with the tool's amount — as the live
   *  preview on a newer Salsa (picking the tool starts it; again with the tool on: a new preview if none shows). */
  toolKey(tool: 'extrude' | 'inset'): void {
    if (this.previewSupported) {
      if (this.tool !== tool) this.setTool(tool);
      else if (!this.previewKind) this.startPreview(tool);
      return;
    }
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

  // ── Mirror "Use Face": tap the button, then tap a face (notes 2026-10-08 #2) ──

  /** The one-shot face pick is armed: the Use Face button shows pressed; the next face tap is the mirror plane. */
  mirrorFacePicking = false;
  /** Runs after the picked face's mirror was added (the panel closes its + Mirror choice). */
  private _mirrorPickDone: (() => void) | null = null;

  /** The engine takes the "tap a face" pick (a newer Salsa: armMeshEditFacePick3D). */
  get mirrorFacePickSupported(): boolean {
    const api = ops.mirrorPlaneApi(this.host?.shapeManager);
    return typeof api.armMeshEditFacePick3D === 'function' && typeof api.addMirrorFromFace3D === 'function';
  }

  /**
   * Use Face. Exactly one face selected: the mirror across it at once. Otherwise (a newer Salsa) arm a one-shot pick:
   * the tool goes back to Select (a running preview is cancelled), Face mode is forced, and the next face TAP becomes
   * the plane — it doesn't change the selection; drags still orbit, two fingers pan / zoom. Tapped again while armed:
   * cancelled. 'mirrored' | 'armed' | 'cancelled' | null (nothing done).
   */
  useMirrorFace(onDone?: () => void): 'mirrored' | 'armed' | 'cancelled' | null {
    if (this.cancelMirrorFacePick()) return 'cancelled';
    const sm = this.shapeManager, id = this._editId;
    const api = ops.mirrorPlaneApi(sm);
    if (!sm || !id || typeof api.addMirrorFromFace3D !== 'function') return null;
    const faces = this.selection.faces;
    if (faces.length === 1) {
      this.cancelPreview();
      api.addMirrorFromFace3D.call(sm, id, faces[0]);
      sm.requestRender3D?.();
      return 'mirrored';
    }
    if (!this.mirrorFacePickSupported) return null;
    this.setTool('select');                                         // (cancels a running preview / Chamfer / knife)
    if (this.selectionMode !== 'face') this.setSelectionMode('face');
    const ok = api.armMeshEditFacePick3D!.call(sm, (face: number | null) => this.ngZone.run(() => this._mirrorFacePicked(id, face)));
    this.mirrorFacePicking = !!ok;
    this._mirrorPickDone = ok ? onDone ?? null : null;
    return ok ? 'armed' : null;
  }

  /** Cancel the armed "tap a face" (Esc, the button again, another tool / mode / modifier button, leaving). False = it
   *  wasn't armed. */
  cancelMirrorFacePick(): boolean {
    if (!this.mirrorFacePicking) return false;
    this.mirrorFacePicking = false;
    this._mirrorPickDone = null;
    const sm = this.host?.shapeManager;
    ops.mirrorPlaneApi(sm).cancelMeshEditFacePick3D?.call(sm);
    return true;
  }

  /** The engine's pick: a face → the mirror across it (one undo step); null → cancelled engine-side. */
  private _mirrorFacePicked(meshId: string, face: number | null): void {
    if (!this.mirrorFacePicking) return;
    this.mirrorFacePicking = false;
    const done = this._mirrorPickDone;
    this._mirrorPickDone = null;
    const sm = this.host?.shapeManager;
    const add = ops.mirrorPlaneApi(sm).addMirrorFromFace3D;
    if (face === null || !sm || this._editId !== meshId || typeof add !== 'function') return;
    add.call(sm, meshId, face);
    sm.requestRender3D?.();
    done?.();
  }

  /** Leave Edit Mesh from the mode itself (Esc, the main toolbar's other tools): the focus background goes too. */
  leave(): void {
    if (!this.scene3dIsEditingMesh) return;
    this.shapeManager?.setMeshEditBgMode3D?.({ mode: 'none' });
    this.exitMeshEditMode();
  }

  exitMeshEditMode(): void {
    const sm = this.shapeManager;
    this.cancelMirrorFacePick();
    // Leaving with a live preview: it is cancelled (nothing is applied without Apply). Then no tool stays selected — the
    // engine's tool back to Select too — so the next entry starts clean (user request 2026-10-08).
    this._revertPreview();
    const setTool = meshChromeApi(sm).setMeshEditActiveTool3D;
    if (typeof setTool === 'function') setTool.call(sm, 'select');
    this.tool = 'select';
    sm.detachMeshEditPointerHandlers();
    sm.exitMeshEditMode3D();
    // (a newer dist: the rail showed the selection gizmo's mode — the object gizmo takes it over, so the rail stays true)
    if (typeof (sm as unknown as { getMeshEditGizmoMode3D?: unknown }).getMeshEditGizmoMode3D === 'function'
        && this.host.scene3dGizmoMode !== undefined) {
      sm.setGizmoMode3D(this.host.scene3dGizmoMode);
    }
    this.scene3dIsEditingMesh = false;
    this._undoScope.leave();
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
    this.cancelMirrorFacePick();   // Vertex / Edge / Face ends Mirror's "tap a face"
    if (mode !== this.selectionMode && this.previewKind) this.cancelPreview();   // (the face ops' preview)
    this.selectionMode = mode;
    // The chrome: a panel tool the new selection type doesn't offer goes off (Select)
    if (this.chromeOn && !meshToolAppliesTo(this.tool, mode)) this.setTool('select');
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
    if (this.previewKind) this.cancelPreview();   // (X while a preview shows: on the mesh before it)
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
    if (this.previewKind) this.cancelPreview();
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
