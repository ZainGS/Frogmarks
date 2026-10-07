/**
 * Long-press detection for the mode chrome's radial menu (UI review 2026-10-07 §4 item 6): fires once a single touch
 * or pen pointer has stayed down ~450 ms without moving more than ~8 px. A second pointer landing (a two-finger
 * navigate / pinch) cancels it, and no new press starts until every pointer is up. Mouse presses are ignored unless
 * `pointerTypes` includes 'mouse' (a desktop gets the radial from right-click / a key instead).
 *
 * Plain TS, no Angular: feed it pointer events (attach() does that for an element) and handle onLongPress. It calls
 * back from inside the event loop (a timer), so an Angular caller that attached it outside the zone re-enters with
 * ngZone.run(). After it fires, `fired` stays true until the next press starts: check it on pointerup to swallow the
 * tap / selection the press would otherwise also make.
 */

export interface LongPressPointer {
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
  /** 0 = primary button / contact (default when missing). */
  button?: number;
}

export interface LongPressTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface LongPressOptions {
  /** The press point (where the pointer went down). */
  onLongPress(p: LongPressPointer): void;
  /** A started press ended without firing (moved, lifted early, a second finger, cancel()). */
  onCancel?(): void;
  /** Default 450 ms. */
  delayMs?: number;
  /** Default 8 CSS px from the press point. */
  moveTolerancePx?: number;
  /** Default ['touch', 'pen']. */
  pointerTypes?: readonly string[];
  /** Injected timers (specs); default window setTimeout / clearTimeout, looked up per call. */
  timers?: LongPressTimers;
}

const DEFAULT_TIMERS: LongPressTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class LongPressDetector {
  static readonly DEFAULT_DELAY_MS = 450;
  static readonly DEFAULT_MOVE_TOLERANCE_PX = 8;

  private readonly delay: number;
  private readonly tolerance: number;
  private readonly types: readonly string[];
  private readonly timers: LongPressTimers;
  /** Pointers currently down (any type). */
  private readonly down = new Set<number>();
  private start: LongPressPointer | null = null;
  private timer: unknown = null;
  /** More than one pointer went down during this gesture: no press until all are up. */
  private multi = false;
  private _fired = false;

  constructor(private readonly opts: LongPressOptions) {
    this.delay = opts.delayMs ?? LongPressDetector.DEFAULT_DELAY_MS;
    this.tolerance = opts.moveTolerancePx ?? LongPressDetector.DEFAULT_MOVE_TOLERANCE_PX;
    this.types = opts.pointerTypes ?? ['touch', 'pen'];
    this.timers = opts.timers ?? DEFAULT_TIMERS;
  }

  /** A press is waiting for its timer. */
  get pending(): boolean { return this.timer !== null; }

  /** The current / last press fired (reset when the next press starts). */
  get fired(): boolean { return this._fired; }

  /** Pointers the detector believes are down (specs / debugging). */
  get pointersDown(): number { return this.down.size; }

  pointerDown(ev: LongPressPointer): void {
    this.down.add(ev.pointerId);
    if (this.down.size > 1) {
      this.multi = true;
      this.cancel();
      return;
    }
    this.multi = false;
    this._fired = false;
    this.clearTimer();
    if (!this.types.includes(ev.pointerType) || (ev.button ?? 0) !== 0) return;
    this.start = { clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId, pointerType: ev.pointerType, button: ev.button ?? 0 };
    this.timer = this.timers.set(() => this.fire(), this.delay);
  }

  pointerMove(ev: LongPressPointer): void {
    const s = this.start;
    if (!s || !this.pending || ev.pointerId !== s.pointerId) return;
    if (Math.hypot(ev.clientX - s.clientX, ev.clientY - s.clientY) > this.tolerance) this.cancel();
  }

  pointerUp(ev: LongPressPointer): void {
    this.down.delete(ev.pointerId);
    if (this.start && ev.pointerId === this.start.pointerId && this.pending) this.cancel();
    if (!this.down.size) this.multi = false;
  }

  pointerCancel(ev: LongPressPointer): void { this.pointerUp(ev); }

  /** Abandon the waiting press (no-op when none). */
  cancel(): void {
    const was = this.pending;
    this.clearTimer();
    this.start = null;
    if (was) this.opts.onCancel?.();
  }

  /** Forget everything (pointers, press). Use when the element is torn down mid-gesture. */
  reset(): void {
    this.clearTimer();
    this.start = null;
    this.down.clear();
    this.multi = false;
    this._fired = false;
  }

  /**
   * Listen on `el` for pointerdown and on the window for move / up / cancel (so a pointer released off the element,
   * or captured by it, still ends). Returns the detach function. Passive listeners: it never blocks scrolling or the
   * element's own handling.
   */
  attach(el: EventTarget, win: EventTarget = typeof window !== 'undefined' ? window : el): () => void {
    const down = (e: Event) => this.pointerDown(e as PointerEvent);
    const move = (e: Event) => this.pointerMove(e as PointerEvent);
    const up = (e: Event) => this.pointerUp(e as PointerEvent);
    const cancel = (e: Event) => this.pointerCancel(e as PointerEvent);
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    el.addEventListener('pointerdown', down, opts);
    win.addEventListener('pointermove', move, opts);
    win.addEventListener('pointerup', up, opts);
    win.addEventListener('pointercancel', cancel, opts);
    return () => {
      el.removeEventListener('pointerdown', down, opts);
      win.removeEventListener('pointermove', move, opts);
      win.removeEventListener('pointerup', up, opts);
      win.removeEventListener('pointercancel', cancel, opts);
      this.reset();
    };
  }

  private fire(): void {
    this.timer = null;
    const s = this.start;
    this.start = null;
    if (!s || this.multi) return;
    this._fired = true;
    this.opts.onLongPress(s);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }
}
