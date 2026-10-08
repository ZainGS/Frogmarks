import { Component, Input, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import type { IllustrationComponent } from '../illustration/illustration.component';
import { BEVEL_ACTIONS, TOOL3D_ACTIONS } from '../illustration/editor-keymap';
import { LongPressDetector, type LongPressPointer } from '../mode-chrome/long-press';
import { acquireAdditiveLatch, releaseAdditiveLatch } from '../mode-chrome/additive-latch-scope';
import type { ModeOpParamChange, ModeRadialItem } from '../mode-chrome/mode-chrome.types';
import * as ops from '../../services/mesh-edit-ops';
import { NotifyService } from '../../../shared/services/notify/notify.service';
import {
  RADIAL_TITLES, buildMeshOp, meshChromeApi, meshChromeCaps, meshRadialItems,
  type MeshChromeCaps, type MeshLastOp, type MeshOpView, type MeshRadialId, type MeshSelCounts,
  type MeshSelectMode, type MeshToolId,
} from './mesh-edit-chrome.logic';

/** The editor members the Edit Mesh chrome uses. */
export type MeshEditChromeHost = Pick<IllustrationComponent,
  'shapeManager' | 'editorState' | 'meshEdit' | 'uv' | 'hud' | 'animationEnabled' | 'touchUi' |
  'canvasRef' | 'scene3dUndo' | 'scene3dMarkDirty' | '_updateGizmoPosition'>;

/** The tool param a last-op param also sets (the next run of that tool uses the adjusted value). */
const LAST_OP_TO_TOOL: Readonly<Record<string, Readonly<Record<string, 'extrudeDistance' | 'insetAmount' | 'insetDepth' | 'loopCutCount' | 'loopCutPosition'>>>> = {
  extrudeRegion: { distance: 'extrudeDistance' },
  insetRegion: { amount: 'insetAmount', depth: 'insetDepth' },
  loopCut: { count: 'loopCutCount', position: 'loopCutPosition' },
};

/**
 * Edit Mesh on the shared mode chrome (UI review 2026-10-07 §4, reworked to the round-2 tablet feedback 2026-10-08;
 * mode-chrome/README.md): the op pill (Frame, then the active tool's live parameters + Apply, "adjust last
 * operation"), the right panel (<app-mesh-edit-props>: Vertex / Edge / Face, the tools, modifiers…) and the long-press
 * radial menu. No header bar / tool strip: the main toolbar's Select / Pan / Move / Rotate / Scale stay (another rail
 * tool leaves the mode — mode-chrome/mode-toolbar-scope.ts), the top bar's Undo / Redo are scoped to Edit Mesh
 * (MeshEditService.takeUndoStep), Esc leaves. On touch / pen, taps add to the selection (the engine's additive latch,
 * on while this is mounted). Mounted by the editor while Edit Mesh is active with useModeChrome.meshEdit on
 * (Experimental › Classic Edit Mesh panel turns it off). The state lives in MeshEditService.
 */
@Component({
  selector: 'app-mesh-edit-chrome',
  templateUrl: './mesh-edit-chrome.component.html',
  styleUrls: ['./mesh-edit-chrome.component.scss'],
})
export class MeshEditChromeComponent implements OnInit, OnDestroy {
  @Input() ed!: MeshEditChromeHost;

  private readonly ngZone = inject(NgZone);
  private readonly notify = inject(NotifyService, { optional: true });

  radial: { open: boolean; x: number; y: number; items: ModeRadialItem[]; title: string; kind: MeshSelectMode } =
    { open: false, x: 0, y: 0, items: [], title: '', kind: 'face' };

  private readonly longPress = new LongPressDetector({
    onLongPress: p => this.ngZone.run(() => this.openRadialAt(p)),
  });
  private detachLongPress: (() => void) | null = null;

  /** The adjust-last op the user closed (Apply) or moved on from (a tool change) — not shown again until another op. */
  private dismissedLastOp: string | null = null;
  /** The tool the pill last saw: a tool change (the panel, the rail, a key) dismisses "adjust last". */
  private seenTool: MeshToolId | null = null;
  /** The engine whose additive latch this turned on (touch / pen: taps add / remove); the latch scope puts it back
   *  when the last mode using it leaves (additive-latch-scope.ts). */
  private latchSm: object | null = null;
  /** Pill scrubs of "adjust last" waiting for the next animation frame (one re-run per frame). */
  private pendingRedo: Record<string, number | boolean | string> | null = null;
  private redoRaf = 0;

  ngOnInit(): void {
    const sm = this.sm;
    // One selection mode for the header, the keys and the engine picker (they disagreed after re-entering once)
    sm?.setMeshEditSelectionMode(this.ed.meshEdit.selectionMode);
    const canvas = this.ed.canvasRef?.nativeElement;
    if (canvas) this.detachLongPress = this.ngZone.runOutsideAngular(() => this.longPress.attach(canvas));
    // Multi-select by default on touch / pen (round-2 feedback): every tap adds; a desktop click replaces, Shift adds
    const api = meshChromeApi(sm);
    if (this.ed.touchUi.coarse && typeof api.setAdditiveSelect3D === 'function' && acquireAdditiveLatch(sm, this)) {
      this.latchSm = sm;
      api.setAdditiveSelect3D.call(sm, true);
    }
    this.ed._updateGizmoPosition();
  }

  ngOnDestroy(): void {
    this.detachLongPress?.();
    this.detachLongPress = null;
    releaseAdditiveLatch(this.latchSm, this);
    this.latchSm = null;
    if (this.redoRaf) cancelAnimationFrame(this.redoRaf);
    this.ed?._updateGizmoPosition();
  }

  private get sm() { return this.ed?.shapeManager; }
  private get meshId(): string | null { return this.ed?.editorState.scene3dSelectedMeshId ?? null; }
  get meshName(): string { return this.ed.editorState.scene3dSelectedMeshName || this.meshId || 'Mesh'; }

  // ── Feature detection (memoised per ShapeManager: the editor swaps it on a renderer re-init) ──

  private capsFor: unknown = null;
  private _caps!: MeshChromeCaps;
  get caps(): MeshChromeCaps {
    if (this.capsFor !== this.sm || !this._caps) {
      this.capsFor = this.sm;
      this._caps = meshChromeCaps(this.sm);
    }
    return this._caps;
  }

  /** The pill's Frame: frame the selection — faces facing one way (one face, a flat panel): the camera turns to look
   *  straight at them (a newer Salsa's frameEditSelection3D, animated), else centre + zoom (frameSelected3D); nothing
   *  selected: the whole mesh with the Edit Mesh entry framing (frameEditView3D — the same 60 % fit as on entering; an
   *  older dist: frameMesh3D). */
  frame(): void {
    const id = this.meshId, sm = this.sm;
    if (!id || !sm) return;
    const s = this.counts;
    const api = meshChromeApi(sm);
    if (s.vertices + s.edges + s.faces > 0 && typeof api.frameEditSelection3D === 'function') { api.frameEditSelection3D.call(sm); return; }
    const f = api.frameSelected3D;
    if (s.vertices + s.edges + s.faces > 0 && typeof f === 'function') { f.call(sm); return; }
    const fv = (sm as unknown as { frameEditView3D?: () => boolean }).frameEditView3D;
    if (typeof fv === 'function' && fv.call(sm)) return;
    sm.frameMesh3D(id, 1.4);
  }

  /** A tool change (the radial's Extrude / Inset). */
  setTool(id: MeshToolId): void {
    this.dismissLastOp();
    this.ed.meshEdit.setTool(id);
  }

  // ── Op pill ──

  get counts(): MeshSelCounts {
    const s = this.ed.meshEdit.selection;
    return { vertices: s.vertices.length, edges: s.edges.length, faces: s.faces.length };
  }

  /** The engine's last parametric op (a newer dist), unless dismissed. */
  private lastOp(): { op: MeshLastOp; sig: string } | null {
    const f = meshChromeApi(this.sm).getMeshEditLastOp3D;
    const op = typeof f === 'function' && this.caps.lastOp ? f.call(this.sm) : null;
    if (!op) return null;
    const sig = JSON.stringify(op);
    // (a live preview's Apply kept it: no "adjust last" for it — the preview was the adjusting)
    return sig === this.dismissedLastOp || sig === this.ed.meshEdit.appliedOpSig ? null : { op, sig };
  }
  private dismissLastOp(): void {
    const f = meshChromeApi(this.sm).getMeshEditLastOp3D;
    const op = typeof f === 'function' ? f.call(this.sm) : null;
    this.dismissedLastOp = op ? JSON.stringify(op) : null;
  }
  /** The chrome ran an op: its "adjust last" shows even when it repeats the previous one exactly. */
  private opRan(): void { this.dismissedLastOp = null; this.ed.meshEdit.appliedOpSig = null; }

  private _opSig = '';
  private _op: MeshOpView | null = null;
  /** The pill for the current state (rebuilt only when something it shows changed: stable params for the pill). */
  get op(): MeshOpView | null {
    const sm = this.sm;
    if (!sm) return null;
    const me = this.ed.meshEdit;
    const transform = sm.isShortcutActive3D && sm.shortcutMode3D
      ? { mode: sm.shortcutMode3D, axis: sm.shortcutAxis3D, display: sm.shortcutNumericDisplay3D ?? '' } : null;
    const bevel = BEVEL_ACTIONS.state(this.ed);
    if (me.tool !== this.seenTool) {   // a new tool (the panel, the rail, a key): its own pill, not the last op's
      if (this.seenTool !== null) this.dismissLastOp();
      this.seenTool = me.tool;
    }
    const last = this.lastOp();
    const counts = this.counts;
    const sel = me.selection;
    const input = {
      tool: me.tool, caps: this.caps, mode: me.selectionMode, sel: counts, params: { ...me.params }, transform, bevel,
      knifePoints: me.knifePointCount, lastOp: last?.op ?? null, canBridge: ops.canBridge(sm, sel), preview: me.previewKind,
    };
    const sig = JSON.stringify(input);
    if (sig !== this._opSig) { this._opSig = sig; this._op = buildMeshOp(input); }
    return this._op;
  }

  setOpParam(e: ModeOpParamChange): void {
    const op = this._op;
    if (!op) return;
    const me = this.ed.meshEdit, sm = this.sm;
    switch (op.kind) {
      case 'transform':
        if (e.id === 'axis' && (e.value === 'x' || e.value === 'y' || e.value === 'z')) TOOL3D_ACTIONS.axis(this.ed, e.value);
        else if (e.id === 'amount') TOOL3D_ACTIONS.setValue(this.ed, String(e.value));
        return;
      case 'bevel': {
        const s = BEVEL_ACTIONS.state(this.ed);
        if (e.id === 'amount') BEVEL_ACTIONS.setAmount(this.ed, String(e.value));
        else if (e.id === 'segments' && s) BEVEL_ACTIONS.stepSegments(this.ed, Number(e.value) - s.segments);
        else if (e.id === 'snap') BEVEL_ACTIONS.toggleSnap(this.ed);
        return;
      }
      case 'adjust': this.queueRedo(e.id, e.value); return;
      case 'preview': me.setPreviewParam(e.id, e.value); return;
      case 'extrude': if (e.id === 'distance') me.params.extrudeDistance = Number(e.value); return;
      case 'inset':
        if (e.id === 'amount') me.params.insetAmount = Number(e.value);
        else if (e.id === 'depth') me.params.insetDepth = Number(e.value);
        return;
      case 'loopcut': {
        if (e.id === 'count') me.params.loopCutCount = Number(e.value);
        else if (e.id === 'position') me.params.loopCutPosition = Number(e.value);
        const f = meshChromeApi(sm).setMeshEditLoopCutOptions3D;
        if (typeof f === 'function') f.call(sm, { count: me.params.loopCutCount, position: me.params.loopCutPosition });
        return;
      }
    }
  }

  /** "Adjust last": re-run the op with the scrubbed value, at most once per animation frame (each re-run compiles). */
  private queueRedo(id: string, value: number | boolean | string): void {
    const last = this.lastOp();
    if (!last) return;
    const toolKey = LAST_OP_TO_TOOL[last.op.op]?.[id];
    if (toolKey && typeof value === 'number') this.ed.meshEdit.params[toolKey] = value;
    this.pendingRedo = { ...(this.pendingRedo ?? {}), [id]: value };
    if (this.redoRaf) return;
    this.redoRaf = requestAnimationFrame(() => this.ngZone.run(() => {
      this.redoRaf = 0;
      const p = this.pendingRedo;
      this.pendingRedo = null;
      const f = meshChromeApi(this.sm).redoMeshEditLastOp3D;
      if (p && typeof f === 'function') f.call(this.sm, p);
      this.opRan();
    }));
  }

  applyOp(): void {
    const op = this._op;
    if (!op) return;
    const me = this.ed.meshEdit;
    switch (op.kind) {
      case 'transform': TOOL3D_ACTIONS.commit(this.ed); return;
      case 'bevel': me.applyBevel(); return;
      case 'preview': me.applyPreview(); return;
      case 'adjust': this.dismissLastOp(); return;
      case 'extrude': if (me.runExtrude()) this.opRan(); return;
      case 'inset': if (me.runInset()) this.opRan(); return;
      case 'loopcut': if (me.loopCutSelectedEdge()) this.opRan(); return;
      case 'knife': me.applyKnifePoints(); return;
    }
  }

  cancelOp(): void {
    const op = this._op;
    if (!op) return;
    const me = this.ed.meshEdit;
    switch (op.kind) {
      case 'transform': TOOL3D_ACTIONS.cancel(this.ed); return;
      case 'bevel': if (me.tool === 'bevel') me.cancelBevelTool(); else BEVEL_ACTIONS.cancel(this.ed); return;
      case 'preview': me.cancelPreview(); return;
      case 'adjust': this.dismissLastOp(); this.ed.scene3dUndo(); this.ed.scene3dMarkDirty(); return;
      case 'knife': if (!me.cancelKnifePoints()) this.setTool('select'); return;
      default: this.setTool('select');
    }
  }

  /** The pill's button: Bevel's Start (after an Esc dropped the running Chamfer). */
  opAction(id: string): void {
    if (!this.sm || !this.meshId) return;
    if (id === 'start' && this.ed.meshEdit.tool === 'bevel' && !BEVEL_ACTIONS.active(this.ed)) this.ed.meshEdit.beginBevelPreview();
  }

  /** A radial menu pick: an op on the selection. */
  private runElementOp(id: MeshRadialId): void {
    const me = this.ed.meshEdit, sm = this.sm, meshId = this.meshId;
    if (!sm || !meshId) return;
    // Extrude / Inset / Subdivide: their live preview (a newer Salsa); any other op cancels a preview showing first
    if ((id === 'extrude' || id === 'inset') && me.previewSupported) { this.dismissLastOp(); me.toolKey(id); return; }
    if (id !== 'subdivide') me.cancelPreview();
    switch (id) {
      case 'extrude': this.setTool('extrude'); if (me.runExtrude()) this.opRan(); return;
      case 'inset': this.setTool('inset'); if (me.runInset()) this.opRan(); return;
      case 'subdivide': if (me.runVerb('subdivide')) this.opRan(); return;
      case 'delete': me.runVerb('delete'); return;
      case 'loopcut': if (me.loopCutSelectedEdge()) this.opRan(); return;
      case 'bevel': if (!BEVEL_ACTIONS.active(this.ed)) BEVEL_ACTIONS.begin(this.ed); return;
      case 'merge': me.runVerb('merge'); return;
      case 'fill': {
        const n = ops.fillHoles(sm, meshId);
        this.notify?.success(n ? (n === 1 ? '1 hole filled' : `${n} holes filled`) : 'No open holes here');
        return;
      }
    }
  }

  // ── Long-press radial ──

  /** A long press (touch / pen) on the canvas: the element under the finger (selected if it wasn't), then its ops. */
  openRadialAt(p: LongPressPointer): void {
    const sm = this.sm, meshId = this.meshId, me = this.ed.meshEdit;
    if (!sm || !meshId || !me.scene3dIsEditingMesh) return;
    if (sm.isShortcutActive3D || BEVEL_ACTIONS.active(this.ed)) return;   // a modal op owns the finger
    me.cancelMirrorFacePick?.();   // the menu ends Mirror's "tap a face"
    // A live preview: cancelled first, so the element is picked on the mesh before it (the menu's ops act on that)
    if (me.previewKind) me.cancelPreview();
    const pick = meshChromeApi(sm).pickMeshEditElementAt3D;
    const hit = typeof pick === 'function' ? pick.call(sm, p.clientX, p.clientY, true) : null;
    let kind: MeshSelectMode = me.selectionMode;
    if (hit) {
      kind = hit.kind;
      if (!hit.selected) {
        const additive = TOOL3D_ACTIONS.additiveOn(this.ed);
        if (kind === 'vertex') sm.selectVertex3D(meshId, hit.index, additive);
        else if (kind === 'edge') sm.selectEdge3D(meshId, hit.index, additive);
        else sm.selectFace3D(meshId, hit.index, additive);
        sm.requestRender3D?.();
      }
    } else {
      const s = this.counts;
      if (s.vertices + s.edges + s.faces === 0) return;   // nothing under the finger, nothing selected
    }
    // The press that opened the menu must not also tap-select, drag the selection or start a knife point / loop cut
    this.cancelCanvasPress(p);
    this.radial = { open: true, x: p.clientX, y: p.clientY, kind, title: RADIAL_TITLES[kind], items: meshRadialItems(kind, this.caps, this.counts) };
  }

  /** The canvas handlers (the engine's pointer controller, the editor's tap / knife) drop the press: a pointercancel. */
  private cancelCanvasPress(p: LongPressPointer): void {
    const canvas = this.ed.canvasRef?.nativeElement;
    if (!canvas || typeof PointerEvent !== 'function') return;
    try {
      canvas.dispatchEvent(new PointerEvent('pointercancel', {
        pointerId: p.pointerId, pointerType: p.pointerType, clientX: p.clientX, clientY: p.clientY, bubbles: true,
      }));
    } catch { /* an old browser without the constructor: the lift may also select */ }
  }

  runRadial(id: string): void {
    this.radial = { ...this.radial, open: false };
    this.runElementOp(id as MeshRadialId);
  }
  closeRadial(): void { this.radial = { ...this.radial, open: false }; }
}
