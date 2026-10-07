/**
 * Coalesces bursts of work to ONE call per animation frame (zone audit 2026-10-07). Callers mark what changed
 * (`mark(key)`) as often as they like; the flush runs once, on the next frame, with every key marked since the last
 * flush. `flushNow()` runs a pending flush at once — e.g. on pointerup, so the final state is exact without waiting.
 *
 * requestAnimationFrame is not patched by zone.js here (src/zone-flags.ts): the flush runs OUTSIDE Angular's zone,
 * so a flush that changes bound state wraps itself in `ngZone.run` — one change detection per frame instead of one
 * per engine event / pointer move.
 */
export class FrameCoalescer<K extends string = string> {
  private readonly _dirty = new Set<K>();
  private _raf = 0;

  constructor(
    private readonly flush: (dirty: ReadonlySet<K>) => void,
    private readonly raf: (cb: FrameRequestCallback) => number = cb => requestAnimationFrame(cb),
    private readonly caf: (id: number) => void = id => cancelAnimationFrame(id),
  ) {}

  /** A flush is scheduled (something is marked and not yet flushed). */
  get pending(): boolean { return this._dirty.size > 0; }

  /** Mark `key` dirty and make sure a flush is scheduled for the next frame. */
  mark(key: K): void {
    this._dirty.add(key);
    if (!this._raf) this._raf = this.raf(() => { this._raf = 0; this._run(); });
  }

  /** Run the pending flush now (no-op when nothing is marked). */
  flushNow(): void {
    if (this._raf) { this.caf(this._raf); this._raf = 0; }
    this._run();
  }

  /** Drop everything marked; nothing runs. */
  cancel(): void {
    if (this._raf) { this.caf(this._raf); this._raf = 0; }
    this._dirty.clear();
  }

  private _run(): void {
    if (this._dirty.size === 0) return;
    // Copy then clear first: a flush that marks again (an engine event fired by the flush itself) schedules a new one.
    const dirty = new Set(this._dirty);
    this._dirty.clear();
    this.flush(dirty);
  }
}
