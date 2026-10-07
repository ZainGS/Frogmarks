import { Injectable, NgZone, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { ArmatureHost } from './arm-session';
import { pickArmatureJoint } from './arm-engine';

/** What ArmPickService reads on the panel. */
export type ArmPickHost = Pick<ArmatureHost, 'shapeManager' | 'rig' | 'cdr'>;

export interface ArmPickRequest {
  /** Which control armed it (its button shows pressed: isArmed(id)). */
  id: string;
  /** "Tap the pole joint" — shown as the hint while armed. */
  label: string;
  onPick(jointIndex: number, jointName: string): void;
}

/** A tap: released within this many CSS px of the press. */
const TAP_SLOP_PX = 10;
/** A finger tap's compat mouse events (mousedown / mouseup / click) follow its pointerup: swallowed this long after a
 *  taken press, or the engine's mouse path would still select the tapped joint. */
const COMPAT_MOUSE_MS = 800;

/**
 * One-shot "tap a joint" picks (UI review 2026-10-07 §4: constraint targets, the IK pole, the weight-brush joint are
 * picked by tapping a joint instead of typing an index). While armed, the next primary press on the 3D canvas is
 * taken BEFORE the engine sees it (window capture phase), so it neither paints, orbits nor changes the selection; its
 * release picks the joint under it (pickArmatureJoint: Salsa's pickArmatureJointAt3D, or the old dist's projected
 * joint positions). A miss keeps the pick armed; Esc, the same button again or cancel() disarms it.
 * Panel-scoped (provided by both Armature hosts, bound in their constructors).
 */
@Injectable()
export class ArmPickService implements OnDestroy {
  private host!: ArmPickHost;
  /** The 3D canvas (the host passes it; null = any <canvas> press counts). */
  canvas: HTMLElement | null = null;
  pending: ArmPickRequest | null = null;
  /** The last armed pick missed (no joint under the tap). */
  missed = false;

  private press: { id: number; x: number; y: number } | null = null;
  private detach: (() => void) | null = null;
  /** performance.now() until which the canvas's compat mouse events are swallowed. */
  private swallowUntil = 0;

  constructor(private zone: NgZone) {}

  bind(host: ArmPickHost): void { this.host = host; }
  private get sm(): ShapeManager { return this.host?.shapeManager; }

  isArmed(id: string): boolean { return this.pending?.id === id; }

  /** Arm a pick (the same id again disarms it: the button is a toggle). */
  arm(req: ArmPickRequest): void {
    if (this.pending?.id === req.id) { this.cancel(); return; }
    this.pending = req;
    this.missed = false;
    this.press = null;
    if (!this.detach) this.zone.runOutsideAngular(() => this.listen());
  }

  /** Disarm (the window listeners stay until destroy: a taken tap's compat mouse events still have to be swallowed). */
  cancel(): void {
    this.pending = null;
    this.press = null;
    this.missed = false;
  }

  ngOnDestroy(): void {
    this.cancel();
    this.detach?.();
    this.detach = null;
  }

  private isCanvasTarget(t: EventTarget | null): boolean {
    if (!(t instanceof Element)) return false;
    if (this.canvas) return t === this.canvas;
    return t.tagName === 'CANVAS';
  }

  private listen(): void {
    const opts: AddEventListenerOptions = { capture: true };
    const down = (e: PointerEvent): void => {
      if (!this.pending || !this.isCanvasTarget(e.target) || (e.button ?? 0) !== 0) return;
      if (this.press) { this.press = null; return; }   // a second finger: let the gesture through
      this.press = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.swallowUntil = performance.now() + COMPAT_MOUSE_MS;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const mouse = (e: MouseEvent): void => {
      if (performance.now() > this.swallowUntil || !this.isCanvasTarget(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const up = (e: PointerEvent): void => {
      const p = this.press;
      if (!p || e.pointerId !== p.id) return;
      this.press = null;
      this.swallowUntil = performance.now() + COMPAT_MOUSE_MS;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP_PX) return;
      this.zone.run(() => this.resolve(e.clientX, e.clientY));
    };
    const cancelPress = (e: PointerEvent): void => { if (this.press?.id === e.pointerId) this.press = null; };
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !this.pending) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.zone.run(() => this.cancel());
    };
    window.addEventListener('pointerdown', down, opts);
    window.addEventListener('pointerup', up, opts);
    window.addEventListener('pointercancel', cancelPress, opts);
    window.addEventListener('keydown', key, opts);
    for (const t of ['mousedown', 'mouseup', 'click'] as const) window.addEventListener(t, mouse, opts);
    this.detach = () => {
      for (const t of ['mousedown', 'mouseup', 'click'] as const) window.removeEventListener(t, mouse, opts);
      window.removeEventListener('pointerdown', down, opts);
      window.removeEventListener('pointerup', up, opts);
      window.removeEventListener('pointercancel', cancelPress, opts);
      window.removeEventListener('keydown', key, opts);
    };
  }

  /** The armed pick's release at a client point (public for the specs). */
  resolve(clientX: number, clientY: number): boolean {
    const req = this.pending;
    if (!req) return false;
    const hit = pickArmatureJoint(this.sm, this.host?.rig?.activeSkeleton?.id, clientX, clientY, this.canvas);
    if (!hit) { this.missed = true; this.host?.cdr?.markForCheck(); return false; }
    this.cancel();
    req.onPick(hit.jointIndex, hit.jointName);
    this.host?.cdr?.markForCheck();
    return true;
  }
}
