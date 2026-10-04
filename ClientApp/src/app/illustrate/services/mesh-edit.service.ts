import { Injectable, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

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
      canvas.setPointerCapture(event.pointerId);
    }
    return true;
  }

  /** Knife drag: draw the cut preview. True = handled. */
  knifePointerMove(event: PointerEvent): boolean {
    if (!(this.scene3dIsEditingMesh && this.scene3dEditTool === 'knife' && this._knifeStart)) return false;
    this._drawKnifePreview(this._knifeStart.x, this._knifeStart.y, event.offsetX, event.offsetY);
    return true;
  }

  /** Knife release: cut along the dragged line. True = handled. */
  knifePointerUp(event: PointerEvent): boolean {
    if (!(this.scene3dIsEditingMesh && this.scene3dEditTool === 'knife' && this._knifeStart)) return false;
    const canvas = this.host.canvasRef?.nativeElement;
    if (canvas && this.editorState.scene3dSelectedMeshId) {
      const dpr = window.devicePixelRatio || 1;
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
    this._clearKnifePreview();
  }

  toggleKnifeTool(): void {
    this.scene3dEditTool = this.scene3dEditTool === 'knife' ? 'select' : 'knife';
    if (this.scene3dEditTool === 'select') this._clearKnifePreview();
  }
}
