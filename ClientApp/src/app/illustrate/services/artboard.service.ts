import { Injectable, NgZone, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

import { EditorStateService } from './editor-state.service';
import { FrameCoalescer } from '../../shared/utilities/frame-coalescer';
import { CanvasInsets, RectLike, computeArtboardFitFallback, fitInsetsWithFloating } from '../utils/artboard-fit-insets';
/** The edit camera of Edit Mesh / UV / Armature (Salsa newer than the dist Frogmarks type-checks against). */
type EditViewApi = {
  isEditViewActive3D?(): boolean;
  frameEditView3D?(): boolean;
  zoomEditView3D?(factor: number): boolean;
  getEditViewZoom3D?(): number | null;
};
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
  constructor(private editorState: EditorStateService, private ngZone: NgZone) {}
  bind(host: ArtboardHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    this._artboardViewportSub?.unsubscribe?.();
    this._overlayFrame.cancel();
  }

  /** Wheel / pinch / pan move the viewport from the engine's zoneless listeners (and nothing else entered the zone
   *  for a wheel or pinch once rAF stopped being patched): the shadow + label + zoom % follow in ONE zone entry per
   *  frame. A change made from Angular code (zoom buttons, fit) still updates at once. */
  private readonly _overlayFrame = new FrameCoalescer(() => this.ngZone.run(() => this.updateOverlay()));
  /** An overlay update is queued for the next frame (it runs that frame's change detection). */
  get overlayUpdatePending(): boolean { return this._overlayFrame.pending; }

  artboardShadowStyle: Record<string, string> = {};
  artboardLabelStyle: Record<string, string> = {};
  artboardLabelText = '';
  private _artboardViewportSub: any = null;

  /** The zoom % readout: in Edit Mesh / UV / Armature it frames the mode's mesh; in 3D free mode it returns to the scene
   *  view; otherwise it fits the artboard. */
  zoomFitClick(): void {
    if (this._editView()) { this.fitView(); return; }
    if (this.editorState.scene3dViewCameraMode === 'free3D') this.host.scene3dFrameScene(); else this.fitArtboard();
  }

  /** The zoom box's Fit (and Ctrl+0): in an edit mode, frame its mesh with the mode's entry framing; else fit the artboard. */
  fitView(): void {
    const ev = this._editView();
    if (ev?.frameEditView3D?.()) return;
    this.fitArtboard();
  }

  /** One zoom-box step in an edit mode (the 3D edit camera's own zoom; ×1.25 like a 2D step). */
  static readonly EDIT_ZOOM_STEP = 1.25;

  zoomIn() {
    if (this._editView()?.zoomEditView3D?.(ArtboardService.EDIT_ZOOM_STEP)) return;
    this.host.worldManager.zoomIn();
  }

  zoomOut() {
    if (this._editView()?.zoomEditView3D?.(1 / ArtboardService.EDIT_ZOOM_STEP)) return;
    this.host.worldManager.zoomOut();
  }

  /** In an edit mode: the 3D edit camera's zoom relative to its framing (100 % = as framed on entry / by Fit). */
  get currentZoomPercent(): string {
    try {
      const z = this._editView()?.getEditViewZoom3D?.();
      if (typeof z === 'number' && Number.isFinite(z)) return Math.round(z * 100) + '%';
      return Math.round((this.host.worldManager?.getZoomFactor?.() ?? 1) * 100) + '%';
    }
    catch { return '100%'; }
  }

  /** The engine's edit-camera API while Edit Mesh / the UV editor / the Armature owns the 3D camera (a newer Salsa;
   *  an older dist has none — the zoom box stays the 2D canvas zoom), else null. */
  private _editView(): EditViewApi | null {
    const sm = this.shapeManager as unknown as EditViewApi | null | undefined;
    try { return sm && typeof sm.isEditViewActive3D === 'function' && sm.isEditViewActive3D() ? sm : null; }
    catch { return null; }
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
      this.fitArtboard();
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
        if (NgZone.isInAngularZone()) this.updateOverlay();
        else this._overlayFrame.mark('viewport');
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

  /** Fit (button, zoom readout, Ctrl+0, document open / resize): the artboard is centred in, and fills, the part of
   *  the canvas the editor UI leaves visible (ui-review 2026-10-07 #10), not the whole canvas under the panels. */
  fitArtboard(): void {
    const sm = this.shapeManager;
    const doc = sm?.getDocumentSize();
    if (!doc) return;
    const cv = this.host.canvas;
    const insets = cv ? fitInsetsWithFloating(cv.getBoundingClientRect(), this._uiRects(ArtboardService.DOCKED_UI),
      this._uiRects(ArtboardService.FLOATING_UI), doc.w / doc.h) : null;
    // Salsa's fitArtboard(insets) (2026-10-07); an older linked engine build ignores arguments, so it gets the old fit
    // and the same math is applied here on top (artboard-fit-insets.ts mirrors salsa artboard-fit.ts).
    const fit = sm.fitArtboard as (insets?: CanvasInsets | null) => void;
    if (fit.length >= 1) { fit.call(sm, insets); }
    else {
      sm.fitArtboard();
      const is = sm.interactionService;
      if (cv && insets && is) {
        const r = computeArtboardFitFallback({
          cssWidth: cv.clientWidth, cssHeight: cv.clientHeight, pxWidth: cv.width, pxHeight: cv.height,
          docWidth: doc.w, docHeight: doc.h, insets,
        });
        is.setPanOffset(r.panX, r.panY);
        is.setZoom(r.zoom);
        sm.scheduleRender?.();
      }
    }
    this.updateOverlay();
  }

  /** The editor UI docked over the canvas: rail, top bar, open tool sub-panel(s), right panel, timeline, colour picker,
   *  and a mode's chrome (header bar, tool strip, props panel — components/mode-chrome; collapsed = off-screen). */
  private static readonly DOCKED_UI = '.vertical-control-panel, .left-panel, .tool-subpanel.visible, .right-column, '
    + '.animation-timeline-wrapper, .persistent-color-picker, .mode-header-bar, .mode-tool-strip, .mode-props-panel';
  /** Small floating UI, avoided only when the page would sit under it: the zoom box (and the Undo / Redo box above
   *  it), the side drawer's handle, a mode's op pill and props-panel handle. */
  private static readonly FLOATING_UI = '.zoom-control, .zoom-history, .side-drawer-handle, .mode-op-pill, .mode-props-handle';

  /** On-screen rects of the UI matching `sel`. Hidden ones (display:none) measure 0 × 0 and are dropped by
   *  visibleCanvasInsets. A tool sub-panel is measured where it is going (without its slide transform), so a fit
   *  right after it opens is right. */
  private _uiRects(sel: string): RectLike[] {
    if (typeof document === 'undefined') return [];
    const out: RectLike[] = [];
    document.querySelectorAll<HTMLElement>(sel).forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      let dx = 0;
      if (el.classList.contains('tool-subpanel') && typeof DOMMatrixReadOnly !== 'undefined') {
        try { dx = new DOMMatrixReadOnly(getComputedStyle(el).transform).e; } catch { dx = 0; }
      }
      out.push({ left: r.left - dx, right: r.right - dx, top: r.top, bottom: r.bottom });
    });
    return out;
  }
}
