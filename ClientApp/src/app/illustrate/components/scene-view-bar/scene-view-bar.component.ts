import { Component, EventEmitter, Input, Output } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { TouchUiService } from '../../services/touch-ui.service';

/** Salsa's TOUCH-3 host switch (ShapeManager.setTouchNavigate3D), typed locally until the dist ships it. */
type TouchNavigateApi = { setTouchNavigate3D?: (on: boolean) => void } | null;

type CameraMode ='ortho2D' | 'perspective2D' | 'free3D';

/**
 * Top-bar 3D view controls: camera mode, Illustration / Scene target, artboard frame, fly, 1P / 3P, the
 * play-settings popover and Play. Extracted from illustration.component (refactor-plan 2.7d). The editor owns
 * the view state (many areas read it); this bar shows it and asks for changes.
 */
@Component({
  selector: 'app-scene-view-bar',
  templateUrl: './scene-view-bar.component.html',
  styleUrls: ['./scene-view-bar.component.scss'],
})
export class SceneViewBarComponent {
  @Input() shapeManager: ShapeManager = null;
  /** A city exists — play distances are in city metres. */
  @Input() hasWorld = false;
  @Input() scene3dViewCameraMode: CameraMode = 'ortho2D';
  @Input() scene3dViewTarget: 'illustration' | 'scene' = 'illustration';
  @Input() scene3dViewArtboardFrame = true;
  @Input() scene3dViewFly = false;
  @Input() scene3dViewIsPlaying = false;
  @Input() scene3dPlayCameraMode: 'first' | 'third' = 'first';
  @Output() setCameraMode = new EventEmitter<CameraMode>();
  @Output() setTarget = new EventEmitter<'illustration' | 'scene'>();
  @Output() setArtboardFrame = new EventEmitter<boolean>();
  @Output() setFly = new EventEmitter<boolean>();
  @Output() togglePlay = new EventEmitter<void>();
  @Output() playCameraModeChange = new EventEmitter<'first' | 'third'>();
  @Output() dirty = new EventEmitter<void>();

  constructor(public touchUi: TouchUiService) {}

  // ── Touch "Navigate" (mobile-parity TOUCH-3 + the Frogmarks toggle): one finger orbits / pans the camera even in
  // tool modes (City / Edit Mesh / paint use alt-orbit, unreachable by touch). Salsa's setTouchNavigate3D(on) is new:
  // until the dist that has it is built the button stays hidden (a guarded call, not a hard one).
  scene3dTouchNavigate = false;

  private get _touchNavApi(): TouchNavigateApi { return this.shapeManager as unknown as TouchNavigateApi; }

  get touchNavAvailable(): boolean { return typeof this._touchNavApi?.setTouchNavigate3D === 'function'; }

  scene3dToggleTouchNavigate(): void {
    const api = this._touchNavApi;
    if (typeof api?.setTouchNavigate3D !== 'function') return;
    this.scene3dTouchNavigate = !this.scene3dTouchNavigate;
    api.setTouchNavigate3D(this.scene3dTouchNavigate);
  }

  // ── Play settings (Salsa polish round 3 T5) ──
  scene3dPlaySettingsOpen = false;

  scene3dPlayEyeHeightM: number | null = null;   // null = automatic

  scene3dPlayEyeHeightAutoM = 1.6;

  scene3dPlayAutoChar = true;

  /** Metres per scene unit: city scale when a city exists, else 1 unit = 1 m. */
  private _playMpu(): number | undefined { return this.hasWorld ? this.shapeManager.cityMetresPerUnit() : undefined; }

  scene3dTogglePlaySettings(): void {
    this.scene3dPlaySettingsOpen = !this.scene3dPlaySettingsOpen;
    if (this.scene3dPlaySettingsOpen) this._syncPlaySettings();
  }

  private _syncPlaySettings(): void {
    const sm = this.shapeManager, mpu = this._playMpu();
    this.scene3dPlayEyeHeightM = sm.getPlayerEyeHeight3D(mpu) ?? null;
    const auto = sm.getDefaultPlayerEyeHeight3D() ?? 1.6;
    this.scene3dPlayEyeHeightAutoM = mpu ? auto * mpu : auto;
    this.scene3dPlayAutoChar = sm.getAutoDefaultPlayer3D() ?? true;
    this.scene3dPlayMoveSpeed = sm.getPlayerMoveSpeed3D() ?? 5.2;
    this.scene3dPlayWalkSpeed = sm.getPlayerWalkSpeed3D() ?? 1.6;
    this.scene3dPlayCamDist = sm.getPlayCameraDistance3D() ?? null;
    this.scene3dPlayFov = Math.round(sm.getPlayCameraFov3D() ?? 72);
    this.scene3dPlayJumpVariety = sm.getPlayJumpVariety3D() ?? true;
    this.scene3dPlayLooseness = sm.getPlayMotionLooseness3D() ?? 0.5;
    this.scene3dPlayWalkStyle = sm.getPlayWalkStyle3D() === 'stomp' ? 'stomp' : 'natural';
    this.scene3dPlayLandingDust = sm.getPlayLandingDust3D() ?? true;
    this.scene3dPlayIdleVariety = sm.getPlayIdleVariety3D() ?? true;
  }

  // ── Play polish (Salsa 2026-10-04): landing dust + idle variety ──
  scene3dPlayLandingDust = true;

  scene3dPlayIdleVariety = true;

  scene3dSetPlayLandingDust(on: boolean): void {
    this.scene3dPlayLandingDust = on;
    this.shapeManager.setPlayLandingDust3D(on);
    this.dirty.emit();
  }

  scene3dSetPlayIdleVariety(on: boolean): void {
    this.scene3dPlayIdleVariety = on;
    this.shapeManager.setPlayIdleVariety3D(on);
    this.dirty.emit();
  }

  // ── Walk style (Salsa 2026-10-03): the default character's walk — Natural (heel-to-toe) or Stomp (heavy tread) ──
  scene3dPlayWalkStyle: 'natural' | 'stomp' = 'natural';

  scene3dSetPlayWalkStyle(style: 'natural' | 'stomp'): void {
    const sm = this.shapeManager;
    sm.setPlayWalkStyle3D(style);
    this.scene3dPlayWalkStyle = sm.getPlayWalkStyle3D() === 'stomp' ? 'stomp' : 'natural';
    this.dirty.emit();
  }

  // ── Animation feel (Salsa 2026-10-03): jump variety + motion looseness of the default gaits ──
  scene3dPlayJumpVariety = true;

  scene3dPlayLooseness = 0.5;   // 0 = the clips exactly, 0.5 = default, 1 = loosest

  scene3dSetPlayJumpVariety(on: boolean): void {
    this.scene3dPlayJumpVariety = on;
    this.shapeManager.setPlayJumpVariety3D(on);
    this.dirty.emit();
  }

  scene3dSetPlayLooseness(v: number | null): void {
    const sm = this.shapeManager;
    sm.setPlayMotionLooseness3D(v);
    this.scene3dPlayLooseness = sm.getPlayMotionLooseness3D() ?? (v ?? 0.5);
    this.dirty.emit();
  }

  scene3dPlayCamDist: number | null = null;   // metres; null = auto (2.6 x avatar height)

  scene3dPlayFov = 72;

  scene3dSetPlayCamDist(m: number | null): void {
    this.shapeManager.setPlayCameraDistance3D(m);
    this.scene3dPlayCamDist = m;
    this.dirty.emit();
  }

  scene3dSetPlayFov(deg: number | null): void {
    const sm = this.shapeManager;
    sm.setPlayCameraFov3D(deg);
    this.scene3dPlayFov = Math.round(sm.getPlayCameraFov3D() ?? (deg ?? 72));
    this.dirty.emit();
  }

  scene3dPlayMoveSpeed = 5.2;   // m/s, RUN speed (Shift toggles run) — Salsa converts to city units itself

  scene3dPlayWalkSpeed = 1.6;   // m/s, the default gait

  scene3dSetPlayWalkSpeed(mps: number | null): void {
    const sm = this.shapeManager;
    sm.setPlayerWalkSpeed3D(mps);
    this.scene3dPlayWalkSpeed = sm.getPlayerWalkSpeed3D() ?? (mps ?? 1.6);
    this.dirty.emit();
  }

  scene3dSetPlayMoveSpeed(mps: number | null): void {
    const sm = this.shapeManager;
    sm.setPlayerMoveSpeed3D(mps);
    this.scene3dPlayMoveSpeed = sm.getPlayerMoveSpeed3D() ?? (mps ?? 5.2);
    this.dirty.emit();
  }

  scene3dSetPlayEyeHeight(m: number | null): void {
    this.shapeManager.setPlayerEyeHeight3D(m, this._playMpu());
    this.scene3dPlayEyeHeightM = m;
    this.dirty.emit();
  }

  scene3dSetPlayAutoChar(on: boolean): void {
    this.scene3dPlayAutoChar = on;
    this.shapeManager.setAutoDefaultPlayer3D(on);
    this.dirty.emit();
  }
}
