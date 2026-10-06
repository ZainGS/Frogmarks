import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { stickFromOffset } from '../../utils/touch-stick';

/** Stick base radius (px): the knob travels this far for full speed. */
const STICK_RADIUS = 56;
/** Look-drag sensitivity, radians per CSS pixel (≈ 175 px of drag per radian). */
const LOOK_RAD_PER_PX = 0.0057;

/**
 * Play touch controls (mobile-parity TOUCH-4; salsa docs/specs/mobile-parity.md §4). Shown by the editor while
 * playing on a coarse (touch) pointer:
 *  - LEFT half: a floating virtual stick (it centres where the finger lands) → setPlayInput3D({ forward, right });
 *  - RIGHT half: drag to look → setPlayInput3D({ lookYaw, lookPitch }) deltas, coalesced to one call per frame
 *    (the engine consumes the host deltas once per render frame and a call REPLACES the pending value);
 *  - buttons: Jump (held = higher, the engine edge-detects the press), Run (walk / run toggle), Use (held =
 *    `interact`), Sneak (toggle), Stop.
 * Each zone tracks its own pointerId with pointer capture, so stick + look + a button work at the same time.
 * Moves run OUTSIDE Angular's zone (no change detection per touch move); the knob moves by direct style writes.
 */
@Component({
  selector: 'app-play-touch-controls',
  templateUrl: './play-touch-controls.component.html',
  styleUrls: ['./play-touch-controls.component.scss'],
})
export class PlayTouchControlsComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  /** Screen px the overlay keeps clear on the left (the tool rail) and right (the right panel column). */
  @Input() leftInset = 0;
  @Input() rightInset = 0;
  @Output() stop = new EventEmitter<void>();

  @ViewChild('stickZone', { static: true }) stickZoneRef!: ElementRef<HTMLElement>;
  @ViewChild('stickBase', { static: true }) stickBaseRef!: ElementRef<HTMLElement>;
  @ViewChild('stickKnob', { static: true }) stickKnobRef!: ElementRef<HTMLElement>;
  @ViewChild('lookZone', { static: true }) lookZoneRef!: ElementRef<HTMLElement>;

  running = false;
  sneaking = false;
  jumpHeld = false;
  useHeld = false;

  private _stickId: number | null = null;
  private _stickCx = 0;
  private _stickCy = 0;
  private _lookId: number | null = null;
  private _lookX = 0;
  private _lookY = 0;
  private _lookAccX = 0;
  private _lookAccY = 0;
  private _lookRaf = 0;
  private _subs: { unsubscribe(): void }[] = [];
  private _off: (() => void)[] = [];

  constructor(private zone: NgZone) {}

  ngOnInit(): void {
    const sm = this.shapeManager;
    if (!sm) return;
    this.running = !!sm.getPlayerRunning3D();
    this.sneaking = !!sm.getPlayerSneaking3D();
    this._subs.push(sm.onPlayerRunChanged3D.subscribe((on: boolean) => this.zone.run(() => { this.running = on; })));
    this._subs.push(sm.onPlayerSneakChanged3D.subscribe((on: boolean) => this.zone.run(() => { this.sneaking = on; })));
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const stick = this.stickZoneRef.nativeElement, look = this.lookZoneRef.nativeElement;
      this._listen(stick, 'pointerdown', this._stickDown);
      this._listen(stick, 'pointermove', this._stickMove);
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) this._listen(stick, t, this._stickEnd);
      this._listen(look, 'pointerdown', this._lookDown);
      this._listen(look, 'pointermove', this._lookMove);
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) this._listen(look, t, this._lookEnd);
    });
  }

  ngOnDestroy(): void {
    for (const off of this._off) off();
    this._off = [];
    for (const s of this._subs) s.unsubscribe();
    this._subs = [];
    if (this._lookRaf) cancelAnimationFrame(this._lookRaf);
    this._lookRaf = 0;
    // Never leave the character walking / holding jump after the overlay goes (Stop, or the pointer turned fine).
    this.shapeManager?.setPlayInput3D({ forward: 0, right: 0, jump: false, interact: false });
  }

  private _listen(el: HTMLElement, type: string, fn: (e: PointerEvent) => void): void {
    const h = fn as EventListener;
    el.addEventListener(type, h, { passive: false });
    this._off.push(() => el.removeEventListener(type, h));
  }

  private _capture(e: PointerEvent): void {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  }

  // ── Left stick ──
  private readonly _stickDown = (e: PointerEvent): void => {
    if (this._stickId !== null) return;
    e.preventDefault();
    this._stickId = e.pointerId;
    this._capture(e);
    this._stickCx = e.clientX; this._stickCy = e.clientY;
    const base = this.stickBaseRef.nativeElement;
    base.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    base.classList.add('active');
    this._setKnob(0, 0);
  };

  private readonly _stickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this._stickId) return;
    e.preventDefault();
    const s = stickFromOffset(e.clientX - this._stickCx, e.clientY - this._stickCy, STICK_RADIUS);
    this._setKnob(s.knobX, s.knobY);
    this.shapeManager?.setPlayInput3D({ forward: s.forward, right: s.right });
  };

  private readonly _stickEnd = (e: PointerEvent): void => {
    if (e.pointerId !== this._stickId) return;
    this._stickId = null;
    this.stickBaseRef.nativeElement.classList.remove('active');
    this._setKnob(0, 0);
    this.shapeManager?.setPlayInput3D({ forward: 0, right: 0 });
  };

  private _setKnob(x: number, y: number): void {
    this.stickKnobRef.nativeElement.style.transform = `translate(${x}px, ${y}px)`;
  }

  // ── Right-half look drag ──
  private readonly _lookDown = (e: PointerEvent): void => {
    if (this._lookId !== null) return;
    e.preventDefault();
    this._lookId = e.pointerId;
    this._capture(e);
    this._lookX = e.clientX; this._lookY = e.clientY;
  };

  private readonly _lookMove = (e: PointerEvent): void => {
    if (e.pointerId !== this._lookId) return;
    e.preventDefault();
    this._lookAccX += e.clientX - this._lookX;
    this._lookAccY += e.clientY - this._lookY;
    this._lookX = e.clientX; this._lookY = e.clientY;
    if (!this._lookRaf) this._lookRaf = requestAnimationFrame(this._flushLook);
  };

  private readonly _lookEnd = (e: PointerEvent): void => {
    if (e.pointerId !== this._lookId) return;
    this._lookId = null;
  };

  /** One look delta per frame: drag right = turn right, drag up = look up (as the built-in mouse-look). */
  private readonly _flushLook = (): void => {
    this._lookRaf = 0;
    const dx = this._lookAccX, dy = this._lookAccY;
    this._lookAccX = 0; this._lookAccY = 0;
    if (dx === 0 && dy === 0) return;
    this.shapeManager?.setPlayInput3D({ lookYaw: dx * LOOK_RAD_PER_PX, lookPitch: -dy * LOOK_RAD_PER_PX });
  };

  // ── Buttons (template bindings: a press is rare, change detection is fine) ──
  jumpDown(e: PointerEvent): void {
    e.preventDefault();
    this._capture(e);
    this.jumpHeld = true;
    this.shapeManager?.setPlayInput3D({ jump: true });
  }

  jumpUp(): void {
    if (!this.jumpHeld) return;
    this.jumpHeld = false;
    this.shapeManager?.setPlayInput3D({ jump: false });
  }

  useDown(e: PointerEvent): void {
    e.preventDefault();
    this._capture(e);
    this.useHeld = true;
    this.shapeManager?.setPlayInput3D({ interact: true });
  }

  useUp(): void {
    if (!this.useHeld) return;
    this.useHeld = false;
    this.shapeManager?.setPlayInput3D({ interact: false });
  }

  toggleRun(): void {
    const sm = this.shapeManager;
    if (!sm) return;
    sm.setPlayerRunning3D(!sm.getPlayerRunning3D());
    this.running = !!sm.getPlayerRunning3D();
  }

  toggleSneak(): void {
    const sm = this.shapeManager;
    if (!sm) return;
    sm.setPlayerSneaking3D(!sm.getPlayerSneaking3D());
    this.sneaking = !!sm.getPlayerSneaking3D();
  }
}
