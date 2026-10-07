import { ApplicationRef, Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { UvEditorService } from './uv-editor.service';
import { CharacterGenerated } from '../components/character-panel/character-panel.component';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state character editing uses. */
export type CharacterEditHost = Pick<IllustrationComponent, 'shapeManager' |
  '_updateGizmoPosition' | 'uvCanvasRef'
>;

/**
 * Procedural character editing glue: the Edit Character panel (open for which body; follows the selection, hair
 * simulation moves with it), the last generated character's params, eye drawing (expression, face reframe), and the
 * procedural idle (+ breaks). The panel's own controls live in <app-character-panel>. Component-scoped (provided by
 * IllustrationComponent). Bodies moved verbatim from illustration.component (refactor-plan 2.9H).
 */
@Injectable()
export class CharacterEditService {
  private host!: CharacterEditHost;
  constructor(private editorState: EditorStateService, private uv: UvEditorService, private appRef: ApplicationRef) {}
  bind(host: CharacterEditHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  /** Set by scene3dGenerateCharacter; <app-character-panel> mirrors it into its controls. */
  scene3dCharGenerated: CharacterGenerated | null = null;

  // Edit Character panel
  scene3dEditCharPanelOpen = false;
  scene3dSelectedIsCharacter = false;
  scene3dEditCharBodyId: string | null = null;
  eyeDrawMode = false;
  eyeDrawExprId: string | null = null;
  scene3dFaceExpressions: Array<{ id: string; name: string; isBlink?: boolean }> = [];

  // Clothing
  // Procedural idle animation
  scene3dIdleEnabled = false;
  scene3dIdleBreaksEnabled = false;
  scene3dIdleBreaksMinSec = 8;
  scene3dIdleBreaksMaxSec = 20;

  scene3dToggleEditCharPanel(): void {
    this.scene3dEditCharPanelOpen = !this.scene3dEditCharPanelOpen;
    this.host._updateGizmoPosition();
    const sm = this.shapeManager;
    if (this.scene3dEditCharPanelOpen) {
      this.scene3dEditCharBodyId = this.editorState.scene3dSelectedMeshId;   // <app-character-panel> loads on open
      // Enable hair jiggle simulation while the character is being edited
      if (this.scene3dEditCharBodyId) sm.setHairSimulation3D(this.scene3dEditCharBodyId, true);
    } else {
      if (this.eyeDrawMode) this.scene3dExitEyeDraw();
      if (this.uv.scene3dClothingPaintActive) this.uv.scene3dToggleClothingPaint(this.uv.scene3dClothingPaintActive);
      // Disable hair simulation when panel closes (idle characters cost 0 sims/frame)
      if (this.scene3dEditCharBodyId) sm.setHairSimulation3D(this.scene3dEditCharBodyId, false);
    }
  }

  scene3dDrawEyes(exprId: string): void {
    const sm = this.shapeManager;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.ensureFace3D(id);
    this.eyeDrawMode  = true;
    this.eyeDrawExprId = exprId;
    setTimeout(() => {
      // The pane canvas is *ngIf'd on eyeDrawMode; with event coalescing (main.ts) the click's change detection can still
      // be pending here — render first when the canvas isn't there yet.
      if (!this.host.uvCanvasRef) this.appRef.tick();
      const uvCanvas = this.host.uvCanvasRef?.nativeElement;
      if (!uvCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      uvCanvas.width  = Math.round((window.innerWidth * 0.5 - 280) * dpr);
      uvCanvas.height = Math.round(window.innerHeight * dpr);
      const renderer = sm.createUVCanvasRenderer(uvCanvas);
      sm.enterEyeDrawMode3D(id, exprId, renderer);
      sm.frameFace3D(id);
    });
  }

  scene3dSwitchEyeDrawExpr(exprId: string): void {
    const sm = this.shapeManager;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    const uvCanvas = this.host.uvCanvasRef?.nativeElement;
    if (!uvCanvas) return;
    const renderer = sm.createUVCanvasRenderer(uvCanvas);
    sm.enterEyeDrawMode3D(id, exprId, renderer);
    this.eyeDrawExprId = exprId;
  }

  scene3dReframeFace(): void {
    if (this.scene3dEditCharBodyId) {
      this.shapeManager.frameFace3D(this.scene3dEditCharBodyId);
    }
  }

  scene3dExitEyeDraw(): void {
    this.shapeManager.exitEyeDrawMode3D();
    this.eyeDrawMode   = false;
    this.eyeDrawExprId = null;
  }

  scene3dToggleIdle(): void {
    const sm = this.shapeManager;
    const id = this.scene3dEditCharBodyId ?? this.editorState.scene3dSelectedMeshId;
    if (!id) return;
    this.scene3dIdleEnabled = !this.scene3dIdleEnabled;
    sm.setIdleAnimation3D(id, this.scene3dIdleEnabled);
    if (!this.scene3dIdleEnabled) {
      this.scene3dIdleBreaksEnabled = false;
      sm.setIdleBreaks3D(id, { enabled: false });
    }
  }

  scene3dToggleIdleBreaks(): void {
    const sm = this.shapeManager;
    const id = this.scene3dEditCharBodyId ?? this.editorState.scene3dSelectedMeshId;
    if (!id) return;
    this.scene3dIdleBreaksEnabled = !this.scene3dIdleBreaksEnabled;
    sm.setIdleBreaks3D(id, {
      enabled: this.scene3dIdleBreaksEnabled,
      minSec: this.scene3dIdleBreaksMinSec,
      maxSec: this.scene3dIdleBreaksMaxSec,
    });
  }

  /** Character body: the Edit Character panel follows the selection (hair sim moves with it) or closes. */
  _syncCharacterSelection(id: string): void {
    this.scene3dSelectedIsCharacter = !!this.shapeManager.isProceduralBody3D(id);
    if (!this.scene3dSelectedIsCharacter) {
      if (this.scene3dEditCharPanelOpen) this.scene3dToggleEditCharPanel();   // real close: hair sim off, eye-draw exited
    } else if (this.scene3dEditCharPanelOpen && this.scene3dEditCharBodyId !== id) {
      const prevCharId = this.scene3dEditCharBodyId;
      this.scene3dEditCharBodyId = id;   // <app-character-panel> resets to its menu + reloads on id change
      const sm2 = this.shapeManager;
      if (prevCharId) sm2.setHairSimulation3D(prevCharId, false);
      sm2.setHairSimulation3D(id, true);
    }
  }
}
