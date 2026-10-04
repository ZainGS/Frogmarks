import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state the artboard / zoom controls use. */
export type ArtboardHost = Pick<IllustrationComponent, 'shapeManager' |
  'canvas' | 'scene3dFrameScene' | 'worldManager'
>;

/**
 * Artboard: document size (apply / resize dialog), the shadow + size-label overlay that tracks the viewport, fit,
 * and zoom in / out / readout. Component-scoped (provided by IllustrationComponent). Bodies moved verbatim from
 * illustration.component (refactor-plan 2.9H).
 */
@Injectable()
export class ArtboardService implements OnDestroy {
  private host!: ArtboardHost;
  constructor(private editorState: EditorStateService) {}
  bind(host: ArtboardHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    this._artboardViewportSub?.unsubscribe?.();
  }

  artboardShadowStyle: Record<string, string> = {};
  artboardLabelStyle: Record<string, string> = {};
  artboardLabelText = '';
  private _artboardViewportSub: any = null;

  /** The zoom % readout: in 3D free mode it returns to the scene view, otherwise it fits the artboard. */
  zoomFitClick(): void { if (this.editorState.scene3dViewCameraMode === 'free3D') this.host.scene3dFrameScene(); else this.fitArtboard(); }

  zoomIn() { this.host.worldManager.zoomIn(); }

  zoomOut() { this.host.worldManager.zoomOut(); }

  get currentZoomPercent(): string {
    try { return Math.round((this.host.worldManager?.getZoomFactor?.() ?? 1) * 100) + '%'; }
    catch { return '100%'; }
  }

  showResizeDialog = false;
  resizeDialogWidth = 1920;
  resizeDialogHeight = 1080;
  resizeDialogAnchor: 'top-left' | 'center' = 'center';

  openResizeDialog(): void {
    const sm = this.shapeManager;
    const size = sm?.getDocumentSize();
    this.resizeDialogWidth = size?.w ?? 1920;
    this.resizeDialogHeight = size?.h ?? 1080;
    this.resizeDialogAnchor = 'center';
    this.showResizeDialog = true;
  }

  confirmResize(): void {
    const w = Math.round(this.resizeDialogWidth);
    const h = Math.round(this.resizeDialogHeight);
    if (!w || !h || w < 1 || h < 1) return;
    const sm = this.shapeManager;
    void sm?.resizeDocument(w, h, this.resizeDialogAnchor);
    this.showResizeDialog = false;
  }

  applyDocumentSize(docSize: { w: number; h: number } | null): void {
    const sm = this.shapeManager;
    if (docSize?.w > 0 && docSize?.h > 0) {
      sm.setDocumentSize(docSize.w, docSize.h);
      sm.fitArtboard();
    } else {
      sm.clearDocumentSize();
    }
    this.updateOverlay();
  }

  setupOverlay(): void {
    this._artboardViewportSub?.unsubscribe?.();
    const is = this.shapeManager.interactionService;
    if (is?.onViewportChanged) {
      this._artboardViewportSub = is.onViewportChanged.subscribe(() => {
        this.updateOverlay();
      });
    }
    this.updateOverlay();
  }

  updateOverlay(): void {
    const sm = this.shapeManager;
    const scissor = sm.webgpuRenderer?.getArtboardScissor();
    if (!scissor) {
      this.artboardShadowStyle = {};
      this.artboardLabelStyle = {};
      this.artboardLabelText = '';
      return;
    }
    const cv = this.host.canvas;
    const scaleX = (cv && cv.width) ? cv.clientWidth / cv.width : 1 / (window.devicePixelRatio || 1);
    const scaleY = (cv && cv.height) ? cv.clientHeight / cv.height : 1 / (window.devicePixelRatio || 1);
    const x = scissor.x * scaleX;
    const y = scissor.y * scaleY;
    const w = scissor.w * scaleX;
    const h = scissor.h * scaleY;
    this.artboardShadowStyle = { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' };
    const docSize = sm.getDocumentSize();
    // Size label is a 2D-editing affordance — only show in 2D Ortho / 2D Persp views
    if (docSize && this.editorState.scene3dViewCameraMode !== 'free3D') {
      this.artboardLabelText = `${docSize.w} × ${docSize.h} px`;
      this.artboardLabelStyle = { left: x + 'px', top: Math.max(0, y - 22) + 'px' };
    } else {
      this.artboardLabelText = '';
      this.artboardLabelStyle = {};
    }
  }

  fitArtboard(): void {
    const sm = this.shapeManager;
    if (!sm.getDocumentSize()) return;
    sm.fitArtboard();
  }
}
