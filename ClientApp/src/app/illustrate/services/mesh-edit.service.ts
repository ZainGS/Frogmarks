import { Injectable, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { BEVEL_ACTIONS, type BevelState } from '../components/illustration/editor-keymap';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state mesh edit mode uses. */
export type MeshEditHost = Pick<IllustrationComponent, 'shapeManager' |
  '_exitAllScene3dModes' | 'canvasRef' | 'handleCanvasRef' 
>;

/**
 * 3D mesh edit mode: enter / exit (engine edit mode + its pointer controller on the canvas), the edit tool, and the
 * knife (start / preview on the handle canvas / cut). The editor's canvas pointer handlers ask knifePointerDown / Move /
 * Up first. Component-scoped (provided by IllustrationComponent). Bodies moved verbatim from illustration.component
 * (refactor-plan 2.9G).
 */
@Injectable()
export class MeshEditService {
  private host!: MeshEditHost;
  constructor(private editorState: EditorStateService, private ngZone: NgZone) {}
  bind(host: MeshEditHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  scene3dIsEditingMesh = false;
  scene3dEditTool: 'select' | 'knife' = 'select';
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
    if (canvas) {
      sm.attachMeshEditPointerHandlers(
        canvas,
        meshId,
        () => this.ngZone.run(() => { /* trigger change detection so panel re-reads selection */ }),
      );
    }
  }

  exitMeshEditMode(): void {
    const sm = this.shapeManager;
    sm.detachMeshEditPointerHandlers();
    sm.exitMeshEditMode3D();
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
    for (const fi of faces.sort((a, b) => b - a)) sm.deleteEditFace3D(id, fi);   // highest first: no index shifting
    sm.clearEditSelection3D(id);
  }

  toggleKnifeTool(): void {
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
