import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { CharacterPanelComponent } from './character-panel.component';
import { EYE_PARAM_DEFAULTS } from '../../utils/character-randomizer';

/** What CharFaceService reads / writes on the panel. */
export type CharFaceHost = Pick<CharacterPanelComponent,
  'shapeManager' | 'exitEyeDraw' | 'eyeDrawExprId' | 'eyeDrawMode' | 'faceExpressionsChange' | 'scene3dEditCharBodyId'
>;

/**
 * Character face + eyes: face kit (brows / nose / mouth), expressions + preview + resting face, blink (expression and auto), procedural / drawn eyes, gaze pad.
 * Panel-scoped (provided by CharacterPanelComponent, bound in its constructor). Bodies moved verbatim from
 * character-panel.component (audit Phase 5.5).
 */
@Injectable()
export class CharFaceService implements OnDestroy {
  private host!: CharFaceHost;
  bind(host: CharFaceHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    clearTimeout(this._faceKitTimer);
    Object.values(this._eyeParamTimers).forEach(t => clearTimeout(t));
  }

  /** Expressions of the edited face; mirrored to the editor for the eye-draw overlay strip. */
  private _faceExpressions: Array<{ id: string; name: string; isBlink?: boolean }> = [];

  get scene3dFaceExpressions() { return this._faceExpressions; }

  set scene3dFaceExpressions(v: Array<{ id: string; name: string; isBlink?: boolean }>) {
    this._faceExpressions = v;
    this.host.faceExpressionsChange.emit(v);
  }

  scene3dFaceActiveExprId: string | null = null;

  scene3dFaceBlinkExprId: string | null = null;

  scene3dFaceBlinkMode: 'fixed' | 'random' = 'random';

  scene3dFaceBlinkMin = 2.5;

  scene3dFaceBlinkMax = 6.0;

  scene3dFaceBlinkHold = 110;

  // Auto-blink
  scene3dAutoBlinkEnabled = false;

  scene3dAutoBlinkMinSec = 2.5;

  scene3dAutoBlinkMaxSec = 6.0;

  scene3dAutoBlinkHoldMs = 110;

  scene3dAutoBlinkDoubleProb = 15;

  scene3dAutoBlinkDoubleGapMin = 150;

  scene3dAutoBlinkDoubleGapMax = 320;

  // Procedural eye params per expression
  scene3dEyeModeMap: Record<string, 'draw' | 'procedural'> = {};

  scene3dEyeParamsMap: Record<string, any> = {};

  private _eyeParamTimers: Record<string, any> = {};

  scene3dGazeX = 0;

  scene3dGazeY = 0;

  private _gazePointerActive = false;

  /** The edited character's face-kit params (null = the kit is off / never turned on for this face). */
  scene3dFaceKit: any = null;

  /** Cached option lists for the Face section's *ngFor (never re-created per change detection). */
  scene3dFaceBrowStyles: string[] = ['soft', 'straight', 'arched', 'angled', 'short'];

  scene3dFaceNoseStyles: string[] = ['none', 'tick', 'shadow', 'dot', 'button'];

  scene3dFaceExpressionNames: string[] = ['neutral', 'smile', 'open', 'frown', 'surprised'];

  /** The expression being previewed (runtime only; the resting one is scene3dFaceKit.expression). */
  scene3dFacePreviewExpr = 'neutral';

  private _faceKitTimer: any = null;

  /** Read the edited character's face kit + the option lists. */
  scene3dInitFaceKit(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!sm || !id) { this.scene3dFaceKit = null; return; }
    const opts = sm.getFaceFeatureOptions3D();
    if (opts) {
      if (Array.isArray(opts.browStyles) && opts.browStyles.join() !== this.scene3dFaceBrowStyles.join()) this.scene3dFaceBrowStyles = opts.browStyles;
      if (Array.isArray(opts.noseStyles) && opts.noseStyles.join() !== this.scene3dFaceNoseStyles.join()) this.scene3dFaceNoseStyles = opts.noseStyles;
      if (Array.isArray(opts.expressions) && opts.expressions.join() !== this.scene3dFaceExpressionNames.join()) this.scene3dFaceExpressionNames = opts.expressions;
    }
    const p = sm.getFaceFeatures3D(id) ?? null;
    this.scene3dFaceKit = p && p.enabled ? { ...p } : null;
    this.scene3dFacePreviewExpr = sm.getCharacterExpression3D(id)?.name ?? (p?.expression ?? 'neutral');
  }

  /** Turn the kit on (the defaults — brows follow the hair) or off (params kept). A face saved before the kit starts off. */
  scene3dSetFaceKitEnabled(on: boolean): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.setFaceFeatures3D(id, { enabled: on });
    this.scene3dInitFaceKit();
  }

  /** A Face slider / dropdown changed: push the whole param set (throttled to one engine call per frame). */
  scene3dFaceKitChanged(): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id || !this.scene3dFaceKit) return;
    if (this._faceKitTimer) return;
    this._faceKitTimer = requestAnimationFrame(() => {
      this._faceKitTimer = null;
      if (this.scene3dFaceKit) this.shapeManager.setFaceFeatures3D(id, { ...this.scene3dFaceKit });
    });
  }

  /** Brow colour: '' = follow the hair. */
  scene3dFaceBrowFollowHair(on: boolean): void {
    if (!this.scene3dFaceKit) return;
    this.scene3dFaceKit.browColor = on ? '' : '#3a2418';
    this.scene3dFaceKitChanged();
  }

  /** Preview an expression on the live face (blends; not saved — set "Resting" to keep one). */
  scene3dPreviewFaceExpression(e: string): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dFacePreviewExpr = e;
    this.shapeManager.setCharacterExpression3D(id, e as Parameters<ShapeManager['setCharacterExpression3D']>[1], { blendMs: 200 });
  }

  /** Make the previewed expression the resting one (persists with the character). */
  scene3dSetRestingFaceExpression(): void {
    if (!this.scene3dFaceKit) return;
    this.scene3dFaceKit.expression = this.scene3dFacePreviewExpr;
    this.scene3dFaceKitChanged();
  }

  _refreshFaceExpressions(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) { this.scene3dFaceExpressions = []; return; }
    const face = sm.getFaceExpressions3D(id);
    if (!face) { this.scene3dFaceExpressions = []; return; }
    this.scene3dFaceExpressions = face.expressions ?? [];
    this.scene3dFaceActiveExprId = face.activeId ?? null;
    this.scene3dFaceBlinkExprId  = face.blinkId  ?? null;
    if (face.blink) {
      this.scene3dFaceBlinkMode = face.blink.mode   ?? 'random';
      this.scene3dFaceBlinkMin  = face.blink.minSec ?? 2.5;
      this.scene3dFaceBlinkMax  = face.blink.maxSec ?? 6.0;
      this.scene3dFaceBlinkHold = face.blink.holdMs ?? 110;
      this.scene3dAutoBlinkEnabled      = face.blink.enabled          ?? false;
      this.scene3dAutoBlinkMinSec       = face.blink.minSec           ?? 2.5;
      this.scene3dAutoBlinkMaxSec       = face.blink.maxSec           ?? 6.0;
      this.scene3dAutoBlinkHoldMs       = face.blink.holdMs           ?? 110;
      this.scene3dAutoBlinkDoubleProb   = Math.round((face.blink.doubleProbability ?? 0.15) * 100);
      this.scene3dAutoBlinkDoubleGapMin = face.blink.doubleGapMinMs   ?? 150;
      this.scene3dAutoBlinkDoubleGapMax = face.blink.doubleGapMaxMs   ?? 320;
    }
  }

  scene3dAddFaceExpression(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.ensureFace3D(id);
    sm.createFaceExpression3D(id, 'New');
    this._refreshFaceExpressions();
  }

  scene3dSetActiveFaceExpr(exprId: string): void {
    const sm = this.shapeManager;
    if (!this.host.scene3dEditCharBodyId) return;
    sm.setActiveFaceExpression3D(this.host.scene3dEditCharBodyId, exprId);
    this.scene3dFaceActiveExprId = exprId;
  }

  scene3dToggleBlinkExpr(exprId: string): void {
    const newBlink = this.scene3dFaceBlinkExprId === exprId ? null : exprId;
    const sm = this.shapeManager;
    if (!this.host.scene3dEditCharBodyId) return;
    sm.setFaceBlinkExpression3D(this.host.scene3dEditCharBodyId, newBlink);
    this.scene3dFaceBlinkExprId = newBlink;
  }

  scene3dDeleteFaceExpr(exprId: string): void {
    const sm = this.shapeManager;
    if (!this.host.scene3dEditCharBodyId) return;
    sm.deleteFaceExpression3D(this.host.scene3dEditCharBodyId, exprId);
    delete this.scene3dEyeModeMap[exprId];
    delete this.scene3dEyeParamsMap[exprId];
    clearTimeout(this._eyeParamTimers[exprId]);
    delete this._eyeParamTimers[exprId];
    this._refreshFaceExpressions();
  }

  scene3dApplyFaceBlinkConfig(): void {
    const sm = this.shapeManager;
    if (!this.host.scene3dEditCharBodyId) return;
    sm.setFaceBlinkConfig3D(this.host.scene3dEditCharBodyId, {
      mode:    this.scene3dFaceBlinkMode,
      minSec:  this.scene3dFaceBlinkMin,
      maxSec:  this.scene3dFaceBlinkMax,
      holdMs:  this.scene3dFaceBlinkHold,
    });
  }

  scene3dSetEyeMode(exprId: string, mode: 'draw' | 'procedural'): void {
    this.scene3dEyeModeMap[exprId] = mode;
    if (mode === 'procedural') {
      if (this.host.eyeDrawMode && this.host.eyeDrawExprId === exprId) this.host.exitEyeDraw.emit();   // the editor owns eye-draw mode
      const sm = this.shapeManager;
      const id = this.host.scene3dEditCharBodyId;
      if (!id) return;
      const existing = sm.getFaceExpressionParams3D(id, exprId);
      const base = sm.getDefaultEyeParams3D() ?? {};
      this.scene3dEyeParamsMap[exprId] = existing ?? { ...base, ...EYE_PARAM_DEFAULTS };
      this._applyProceduralEyes(exprId);
    }
  }

  scene3dEyeParamChanged(exprId: string): void {
    clearTimeout(this._eyeParamTimers[exprId]);
    this._eyeParamTimers[exprId] = setTimeout(() => this._applyProceduralEyes(exprId), 50);
  }

  private _applyProceduralEyes(exprId: string): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    const p = this.scene3dEyeParamsMap[exprId];
    if (!id || !p) return;
    sm.setFaceExpressionProcedural3D(id, exprId, p);
  }

  scene3dGazePadPointerDown(event: PointerEvent, el: HTMLElement): void {
    this._gazePointerActive = true;
    el.setPointerCapture(event.pointerId);
    this._updateGaze(event, el);
  }

  scene3dGazePadPointerMove(event: PointerEvent, el: HTMLElement): void {
    if (!this._gazePointerActive) return;
    this._updateGaze(event, el);
  }

  scene3dGazePadPointerUp(): void {
    this._gazePointerActive = false;
  }

  scene3dGazeCenter(): void {
    this.scene3dGazeX = 0;
    this.scene3dGazeY = 0;
    this.shapeManager.setFaceGaze3D(this.host.scene3dEditCharBodyId, 0, 0);
  }

  private _updateGaze(event: PointerEvent, el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    this.scene3dGazeX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    this.scene3dGazeY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    this.shapeManager.setFaceGaze3D(this.host.scene3dEditCharBodyId, this.scene3dGazeX, this.scene3dGazeY);
  }

  scene3dApplyAutoBlink(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.setAutoBlink3D(id, {
      enabled:           this.scene3dAutoBlinkEnabled,
      minSec:            this.scene3dAutoBlinkMinSec,
      maxSec:            this.scene3dAutoBlinkMaxSec,
      holdMs:            this.scene3dAutoBlinkHoldMs,
      doubleProbability: this.scene3dAutoBlinkDoubleProb / 100,
      doubleGapMinMs:    this.scene3dAutoBlinkDoubleGapMin,
      doubleGapMaxMs:    this.scene3dAutoBlinkDoubleGapMax,
    });
  }
}
