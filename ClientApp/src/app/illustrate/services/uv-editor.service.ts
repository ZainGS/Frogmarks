import { Injectable, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state the UV editor session uses. */
export type UvEditorHost = Pick<IllustrationComponent, 'shapeManager' | 'character' |
  '_exitAllScene3dModes' | 'skinsPanel' | 'uvCanvasRef'
>;

/**
 * UV Editor session: open / close (engine UV session + 2D canvas renderer), the UV canvas pointer handlers (hover,
 * face select, zoom), paint target, stamp tool state and the UV pane toggle. Component-scoped (provided by
 * IllustrationComponent). Bodies moved verbatim from illustration.component (refactor-plan 2.9F).
 */
@Injectable()
export class UvEditorService {
  private host!: UvEditorHost;
  constructor(private editorState: EditorStateService, private ngZone: NgZone) {}
  bind(host: UvEditorHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  uvEditorOpen = false;
  private _uvSession: any = null;
  private _uvRenderer: any = null;
  private _uvHandlersBound = false;
  uvPaintMode = false;
  showUVPane  = false;
  // Stamp tool (Mode B decals — bake into mesh texture while in UV Paint)
  uvStampActive = false;
  uvStampSize   = 0.25;
  uvStampRotationRad = 0;

  get uvRendererRef(): any { return this._uvRenderer; }

  get uvSession(): any { return this._uvSession; }

  /** The mesh the UV panel paints when it isn't the selection (clothing paint: the garment — the panel used to get
   *  the character body's id, so GARP / export targeted the wrong mesh). */
  uvPaintTargetId: string | null = null;
  /** Clothing paint (character garments): which slot's garment the UV editor paints. */
  scene3dClothingPaintActive: 'top' | 'bottom' | 'shoes' | 'socks' | null = null;

  openUVEditor(): void {
    if (!this.editorState.scene3dSelectedMeshId) return;
    this.host._exitAllScene3dModes();
    const sm = this.shapeManager;
    // openUVEditor3D handles orbit setup internally — no enterMeshEditMode3D needed
    this._uvSession = sm.openUVEditor3D(this.editorState.scene3dSelectedMeshId);
    if (!this._uvSession) return;
    this.uvEditorOpen = true;
    setTimeout(() => {
      const uvCanvas = this.host.uvCanvasRef?.nativeElement;
      if (!uvCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      uvCanvas.width  = Math.round((window.innerWidth * 0.5 - 280) * dpr);
      uvCanvas.height = Math.round(window.innerHeight * dpr);
      this._uvRenderer = sm.createUVCanvasRenderer(uvCanvas);
      this.uvPaintMode = true;  // paint is always active in UV Editor
      this._uvDraw();
      this._attachUVPointerHandlers(uvCanvas);
    });
  }

  closeUVEditor(): void {
    const sm = this.shapeManager;
    // If closing with an active GARP paint preview, the Skins panel discards it
    this.host.skinsPanel?.handleUvEditorClosed();
    // No-arg exit is idempotent and safe — don't gate on mesh ID (wrong mesh = skipped exit)
    sm.exitUVPaintMode3D();
    if (!this.scene3dClothingPaintActive) {
      sm.closeUVEditor3D(this.editorState.scene3dSelectedMeshId);
    }
    this.scene3dClothingPaintActive = null;
    this.uvPaintTargetId = null;
    this._uvSession = null;
    this._uvRenderer = null;
    this._uvHandlersBound = false;
    this.uvEditorOpen = false;
    this.uvPaintMode  = false;
    this.showUVPane   = false;
    this.uvStampActive = false;
  }

  uvDraw(): void { this._uvDraw(); }

  onUvStampToolChange(evt: {active: boolean; size: number; rotationRad: number}): void {
    this.uvStampActive     = evt.active;
    this.uvStampSize       = evt.size;
    this.uvStampRotationRad = evt.rotationRad;
  }

  onShowUVPaneChange(show: boolean): void {
    this.showUVPane = show;
  }

  private _uvDraw(): void {
    if (!this._uvRenderer || !this._uvSession) return;
    if (this.uvPaintMode) return;  // Salsa redraws after every dab; don't stomp it
    const em = this.shapeManager.getEditMesh3D(this.editorState.scene3dSelectedMeshId);
    if (!em) return;
    this._uvRenderer.draw(this._uvSession, em);
  }

  private _uvCssCoords(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private _attachUVPointerHandlers(canvas: HTMLCanvasElement): void {
    if (this._uvHandlersBound) return;
    this._uvHandlersBound = true;
    const sm = this.shapeManager;

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this._uvRenderer || !this._uvSession) return;
      const { x, y } = this._uvCssCoords(canvas, e);
      const em = sm.getEditMesh3D(this.editorState.scene3dSelectedMeshId);
      const fi = em ? this._uvRenderer.hitTestFace?.(x, y, this._uvSession, em) : null;
      sm.setUVHoverFace3D(this.editorState.scene3dSelectedMeshId, fi ?? null);
      this._uvDraw();
    });

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!this._uvRenderer || !this._uvSession) return;
      const { x, y } = this._uvCssCoords(canvas, e);
      const em = sm.getEditMesh3D(this.editorState.scene3dSelectedMeshId);
      if (!em) return;
      const fi = this._uvRenderer.hitTestFace?.(x, y, this._uvSession, em);
      if (fi != null) {
        this._uvSession.selectFace?.(fi, e.shiftKey);
        this.ngZone.run(() => this._uvDraw());
      }
    });

    canvas.addEventListener('pointerleave', () => {
      sm.setUVHoverFace3D(this.editorState.scene3dSelectedMeshId, null);
      this._uvDraw();
    });

    canvas.addEventListener('wheel', (e: WheelEvent) => {
      if (!this._uvSession) return;
      e.preventDefault();
      this._uvSession.zoom = Math.max(0.1, Math.min(20, (this._uvSession.zoom ?? 1) * (1 - e.deltaY * 0.001)));
      this._uvDraw();
    }, { passive: false });
  }

  /** Character panel: paint a garment slot in UV paint mode (toggle off when it is already the active slot). */
  scene3dToggleClothingPaint(slot: 'top' | 'bottom' | 'shoes' | 'socks'): void {
    const sm = this.shapeManager;
    const id = this.host.character.scene3dEditCharBodyId;   // via the host: CharacterEditService injects this service
    if (!id) return;

    if (this.scene3dClothingPaintActive === slot) {
      // Exit paint mode — no-arg exit is idempotent, avoids wrong-mesh-ID pitfalls
      if (this.uvEditorOpen) this.closeUVEditor();
      else {
        sm.exitUVPaintMode3D();
        this.scene3dClothingPaintActive = null;
        this.uvPaintTargetId = null;
        this.uvPaintMode = false;
      }
    } else {
      // Exit any active paint first
      if (this.scene3dClothingPaintActive) {
        sm.exitUVPaintMode3D();
      }
      const meshId = sm.getClothingMeshId3D(id, slot);
      if (!meshId) return;
      sm.enterUVPaintMode3D(meshId);
      this.scene3dClothingPaintActive = slot;
      this.uvPaintTargetId = meshId;   // the panel targets the garment, not the selected body
      this.uvPaintMode = true;
      // Show the UV paint panel on the right for brush controls
      if (!this.uvEditorOpen) this.uvEditorOpen = true;
    }
  }
}
