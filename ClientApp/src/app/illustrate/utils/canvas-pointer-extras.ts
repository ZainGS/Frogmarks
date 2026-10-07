/**
 * Two canvas inputs the engine doesn't own (UI review 2026-10-07):
 *  - EYEDROPPER (§3 #10): Alt+click (mouse / pen) samples the canvas colour; on touch the colour picker's eyedropper
 *    button ARMS a one-shot sample — the next press on the canvas samples instead of drawing. The press is taken
 *    before the engine sees it (window capture phase), and its click is swallowed (the editor's document click
 *    would otherwise place a shape / fill).
 *  - CONTEXT MENU (§2b): right-click (desktop) and long-press (touch, ~550 ms without moving) open the canvas menu.
 *    A long-press takes back the stroke it began (the engine's cancelRasterStroke, when the dist has it), and the
 *    click after the release is swallowed so it doesn't close the menu it just opened.
 * Listeners run outside the Angular zone; the host re-enters the zone in its callbacks.
 */
export interface CanvasPointerExtrasHost {
  canvas(): HTMLCanvasElement | null;
  /** The canvas menu may open now (2D editing: not Play / the 3D view / hidden UI / a line mid-draw …). */
  menuAllowed(): boolean;
  openMenu(clientX: number, clientY: number): void;
  /** Alt+click samples now (2D: Alt-drag orbits in 3D, Alt bends handles in the path editor). */
  altSampleAllowed(): boolean;
  /** Sample the canvas colour at a viewport point (async; the host applies it). */
  sample(clientX: number, clientY: number): void;
  /** The armed state changed (the picker button shows it). */
  armedChanged(armed: boolean): void;
  /** A long-press opened the menu: take back the stroke / mark the finger's press made. */
  cancelPress(): void;
}

export class CanvasPointerExtras {
  static readonly LONG_PRESS_MS = 550;
  static readonly LONG_PRESS_SLOP = 10;
  /** How long after a sample / long-press the next click on the canvas is swallowed. */
  static readonly SWALLOW_CLICK_MS = 800;

  private _armed = false;
  private _win: Window | null = null;
  private _lp: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private _swallowClickUntil = 0;
  private _lastTouchAt = -Infinity;
  private _right: { x: number; y: number; allowed: boolean } | null = null;

  constructor(private readonly host: CanvasPointerExtrasHost, private readonly now: () => number = () => performance.now()) {}

  /** The one-shot eyedropper is armed (the next canvas press samples). */
  get armed(): boolean { return this._armed; }

  arm(on: boolean): void {
    if (this._armed === on) return;
    this._armed = on;
    const cv = this.host.canvas();
    if (cv) cv.style.cursor = on ? 'crosshair' : (cv.style.cursor === 'crosshair' ? '' : cv.style.cursor);
    this.host.armedChanged(on);
  }

  toggleArmed(): void { this.arm(!this._armed); }

  attach(win: Window): void {
    if (this._win === win) return;
    this.detach();
    this._win = win;
    win.addEventListener('pointerdown', this._onDown, true);
    win.addEventListener('pointermove', this._onMove, true);
    win.addEventListener('pointerup', this._onEnd, true);
    win.addEventListener('pointercancel', this._onEnd, true);
    win.addEventListener('click', this._onClick, true);
    win.addEventListener('contextmenu', this._onContextMenu);
    win.addEventListener('keydown', this._onKey, true);
  }

  detach(): void {
    const win = this._win;
    this._cancelLongPress();
    if (!win) return;
    win.removeEventListener('pointerdown', this._onDown, true);
    win.removeEventListener('pointermove', this._onMove, true);
    win.removeEventListener('pointerup', this._onEnd, true);
    win.removeEventListener('pointercancel', this._onEnd, true);
    win.removeEventListener('click', this._onClick, true);
    win.removeEventListener('contextmenu', this._onContextMenu);
    win.removeEventListener('keydown', this._onKey, true);
    this._win = null;
  }

  private _onCanvas(e: Event): boolean {
    const cv = this.host.canvas();
    return !!cv && e.target === cv;
  }

  private readonly _onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this._lastTouchAt = this.now();
    // A second finger: a pinch, never a long-press
    if (this._lp && e.pointerId !== this._lp.id) { this._cancelLongPress(); return; }
    if (!this._onCanvas(e)) return;

    // Eyedropper: armed (any pointer, primary press) or Alt+click (mouse / pen left button)
    const primary = e.button === 0 || e.pointerType === 'touch';
    const alt = e.altKey && e.pointerType !== 'touch' && e.button === 0 && this.host.altSampleAllowed();
    if ((this._armed && primary) || alt) {
      e.preventDefault();
      e.stopImmediatePropagation();   // the engine's canvas listeners never see this press
      this._swallowClickUntil = this.now() + CanvasPointerExtras.SWALLOW_CLICK_MS;
      if (this._armed) this.arm(false);
      this.host.sample(e.clientX, e.clientY);
      return;
    }

    if (e.button === 2 && e.pointerType !== 'touch') {
      // Decided at the press: the arrow tool cancels its line on a right press, so the menu must not open then
      this._right = { x: e.clientX, y: e.clientY, allowed: this.host.menuAllowed() };
      return;
    }

    if (e.pointerType === 'touch' && e.isPrimary !== false) {
      const id = e.pointerId, x = e.clientX, y = e.clientY;
      const timer = setTimeout(() => {
        this._lp = null;
        if (!this.host.menuAllowed()) return;
        this.host.cancelPress();
        this._swallowClickUntil = this.now() + CanvasPointerExtras.SWALLOW_CLICK_MS;
        this.host.openMenu(x, y);
      }, CanvasPointerExtras.LONG_PRESS_MS);
      this._lp = { id, x, y, timer };
    }
  };

  private readonly _onMove = (e: PointerEvent): void => {
    const lp = this._lp;
    if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > CanvasPointerExtras.LONG_PRESS_SLOP) {
      this._cancelLongPress();
    }
    const r = this._right;
    if (r && Math.hypot(e.clientX - r.x, e.clientY - r.y) > CanvasPointerExtras.LONG_PRESS_SLOP) r.allowed = false;   // a right-drag
  };

  private readonly _onEnd = (e: PointerEvent): void => {
    if (this._lp && e.pointerId === this._lp.id) this._cancelLongPress();
  };

  private readonly _onClick = (e: MouseEvent): void => {
    if (this.now() > this._swallowClickUntil) return;
    if (!this._onCanvas(e)) return;
    this._swallowClickUntil = 0;
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  private readonly _onContextMenu = (e: MouseEvent): void => {
    if (!this._onCanvas(e)) return;
    // (defaultPrevented says nothing here: index.html prevents every contextmenu. The 3D modes that use the right
    //  button — orbit / free-look / Edit Mesh — are ruled out by menuAllowed: the 3D view.)
    e.preventDefault();                             // no browser "Save image as…" menu over the canvas
    // A touch long-press also fires contextmenu (Android): our timer handles touch
    const fromTouch = (e as PointerEvent).pointerType === 'touch' || this.now() - this._lastTouchAt < 1000;
    if (fromTouch) return;
    const r = this._right;
    this._right = null;
    if (r ? !r.allowed : !this.host.menuAllowed()) return;
    this.host.openMenu(e.clientX, e.clientY);
  };

  private readonly _onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this._armed) this.arm(false);
  };

  private _cancelLongPress(): void {
    if (this._lp) clearTimeout(this._lp.timer);
    this._lp = null;
  }
}
