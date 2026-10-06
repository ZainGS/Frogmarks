/**
 * "Hide UI" wake-up gesture (mobile-parity UI-1 / UI-13): while the editor UI is hidden, a pointer press on a canvas
 * reveals the floating "Show UI" button. Listens in the CAPTURE phase on `target` (the window), so it runs before the
 * engine's canvas listeners.
 *
 * - **Touch** press while the button is NOT showing: the press only wakes the button. The whole gesture
 *   (pointerdown / move / up / cancel of every finger that lands before all are lifted, plus the click that follows)
 *   is swallowed, so it never paints, fills or selects.
 * - Touch while the button IS showing, and **pen / mouse** always: passes through to the canvas (a stylus stroke or a
 *   mouse drag is never eaten) and just (re)starts the button's fade-out timer.
 * - Presses on anything that isn't a `<canvas>` (the button itself, the Play touch controls, ...) are ignored.
 */
export interface HiddenUiWakeOptions {
  /** Is the "Show UI" button currently showing? (A touch then passes through.) */
  isButtonShowing(): boolean;
  /** Never swallow (e.g. during Play, where a touch drives the camera). Pointers still wake the button. */
  passThrough?(): boolean;
  /** Show the button / restart its fade timer. Called outside Angular's zone. */
  onWake(): void;
}

const CLICK_SWALLOW_MS = 600;

export class HiddenUiWake {
  private _attached = false;
  /** Touch pointers of the gesture being swallowed. */
  private readonly _swallowed = new Set<number>();
  private _swallowClickUntil = 0;

  constructor(private readonly target: EventTarget, private readonly opts: HiddenUiWakeOptions) {}

  get attached(): boolean { return this._attached; }

  attach(): void {
    if (this._attached) return;
    this._attached = true;
    const o = { capture: true, passive: false } as AddEventListenerOptions;
    this.target.addEventListener('pointerdown', this._onDown as EventListener, o);
    this.target.addEventListener('pointermove', this._onMoveOrUp as EventListener, o);
    this.target.addEventListener('pointerup', this._onMoveOrUp as EventListener, o);
    this.target.addEventListener('pointercancel', this._onMoveOrUp as EventListener, o);
    this.target.addEventListener('click', this._onClick as EventListener, o);
  }

  detach(): void {
    if (!this._attached) return;
    this._attached = false;
    const o = { capture: true } as EventListenerOptions;
    this.target.removeEventListener('pointerdown', this._onDown as EventListener, o);
    this.target.removeEventListener('pointermove', this._onMoveOrUp as EventListener, o);
    this.target.removeEventListener('pointerup', this._onMoveOrUp as EventListener, o);
    this.target.removeEventListener('pointercancel', this._onMoveOrUp as EventListener, o);
    this.target.removeEventListener('click', this._onClick as EventListener, o);
    this._swallowed.clear();
    this._swallowClickUntil = 0;
  }

  private static _onCanvas(e: Event): boolean {
    const t = e.target as { tagName?: string } | null;
    return !!t && typeof t.tagName === 'string' && t.tagName.toUpperCase() === 'CANVAS';
  }

  private static _swallow(e: Event): void {
    e.preventDefault();               // also suppresses the compatibility mousedown / mouseup of a touch
    e.stopImmediatePropagation();     // capture on window: the canvas (engine) listeners never see it
  }

  private readonly _onDown = (e: PointerEvent): void => {
    // A finger landing while a wake gesture is in progress joins it (no stray one-finger paint from a pinch).
    if (this._swallowed.size > 0 && e.pointerType === 'touch') {
      this._swallowed.add(e.pointerId);
      HiddenUiWake._swallow(e);
      return;
    }
    if (!HiddenUiWake._onCanvas(e)) return;
    const swallow = e.pointerType === 'touch' && !this.opts.isButtonShowing() && !this.opts.passThrough?.();
    if (swallow) {
      this._swallowed.add(e.pointerId);
      HiddenUiWake._swallow(e);
    }
    this.opts.onWake();
  };

  private readonly _onMoveOrUp = (e: PointerEvent): void => {
    if (!this._swallowed.has(e.pointerId)) return;
    HiddenUiWake._swallow(e);
    if (e.type === 'pointerup' || e.type === 'pointercancel') {
      this._swallowed.delete(e.pointerId);
      if (this._swallowed.size === 0) this._swallowClickUntil = performance.now() + CLICK_SWALLOW_MS;
    }
  };

  private readonly _onClick = (e: MouseEvent): void => {
    if (this._swallowClickUntil === 0) return;
    if (performance.now() > this._swallowClickUntil) { this._swallowClickUntil = 0; return; }
    this._swallowClickUntil = 0;
    if (HiddenUiWake._onCanvas(e)) HiddenUiWake._swallow(e);   // e.g. the Fill tool fills on a document click
  };
}
