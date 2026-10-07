/**
 * Rate-limits a status line (zone audit M6): the engine reports shader-compile / worker-job progress many times a
 * second, and each new text entered Angular's zone (an app-wide change detection). This shows a new text at most every
 * `minIntervalMs` (default 250 ms = 4 Hz) — the newest one wins — and always shows the final one. Clearing the text
 * (the engine went idle) shows at once, so the pill never lingers after the work is done.
 */
export class StatusThrottle {
  private _shown = '';
  private _pending: string | null = null;
  private _lastShownAt = -Infinity;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly show: (text: string) => void,
    private readonly minIntervalMs = 250,
    private readonly now: () => number = () => performance.now(),
    private readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => setTimeout(fn, ms),
    private readonly clearTimer: (t: ReturnType<typeof setTimeout>) => void = t => clearTimeout(t),
  ) {}

  /** The text currently shown. */
  get shown(): string { return this._shown; }

  set(text: string): void {
    if (text === '') { this._cancel(); this._apply(''); return; }   // idle: at once
    if (this._timer) { this._pending = text; return; }              // a show is scheduled: it takes the newest text
    if (text === this._shown) return;
    // (Appearing from idle is immediate too; only changes of a showing text are paced.)
    const wait = this._shown === '' ? 0 : this._lastShownAt + this.minIntervalMs - this.now();
    if (wait <= 0) { this._apply(text); return; }
    this._pending = text;
    this._timer = this.setTimer(() => {
      this._timer = null;
      const t = this._pending;
      this._pending = null;
      if (t !== null) this._apply(t);
    }, wait);
  }

  /** Drop a scheduled show (teardown). */
  dispose(): void { this._cancel(); }

  private _cancel(): void {
    if (this._timer) { this.clearTimer(this._timer); this._timer = null; }
    this._pending = null;
  }

  private _apply(text: string): void {
    if (text === this._shown) return;
    this._shown = text;
    this._lastShownAt = this.now();
    this.show(text);
  }
}
