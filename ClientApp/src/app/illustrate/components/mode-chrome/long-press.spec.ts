import { LongPressDetector, LongPressPointer, LongPressTimers } from './long-press';

/** Manual timers: run() fires whatever is due at `now`. */
function fakeTimers() {
  let now = 0, seq = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  const timers: LongPressTimers = {
    set: (fn, ms) => { const id = ++seq; due.set(id, { at: now + ms, fn }); return id; },
    clear: (h) => { due.delete(h as number); },
  };
  return {
    timers,
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...due]) if (t.at <= now) { due.delete(id); t.fn(); }
    },
  };
}

const p = (id: number, x = 100, y = 100, type = 'touch', button = 0): LongPressPointer =>
  ({ pointerId: id, clientX: x, clientY: y, pointerType: type, button });

describe('LongPressDetector', () => {
  function setup(extra: Partial<ConstructorParameters<typeof LongPressDetector>[0]> = {}) {
    const t = fakeTimers();
    const fired: LongPressPointer[] = [];
    let cancels = 0;
    const lp = new LongPressDetector({ onLongPress: e => fired.push(e), onCancel: () => cancels++, timers: t.timers, ...extra });
    return { lp, t, fired, cancels: () => cancels };
  }

  it('fires after 450 ms for a still finger, at the press point', () => {
    const { lp, t, fired } = setup();
    lp.pointerDown(p(1, 40, 60));
    t.advance(449);
    expect(fired.length).toBe(0);
    expect(lp.pending).toBeTrue();
    t.advance(1);
    expect(fired.length).toBe(1);
    expect(fired[0].clientX).toBe(40);
    expect(fired[0].clientY).toBe(60);
    expect(lp.fired).toBeTrue();
    expect(lp.pending).toBeFalse();
  });

  it('tolerates small jitter but cancels past 8 px', () => {
    const { lp, t, fired, cancels } = setup();
    lp.pointerDown(p(1));
    lp.pointerMove(p(1, 105, 105));   // ~7 px
    t.advance(200);
    expect(lp.pending).toBeTrue();
    lp.pointerMove(p(1, 109, 100));   // 9 px
    expect(lp.pending).toBeFalse();
    expect(cancels()).toBe(1);
    t.advance(1000);
    expect(fired.length).toBe(0);
  });

  it('cancels when lifted early', () => {
    const { lp, t, fired } = setup();
    lp.pointerDown(p(1));
    t.advance(300);
    lp.pointerUp(p(1));
    t.advance(1000);
    expect(fired.length).toBe(0);
    expect(lp.fired).toBeFalse();
  });

  it('a second finger cancels, and no press starts again until every finger is up', () => {
    const { lp, t, fired } = setup();
    lp.pointerDown(p(1));
    t.advance(200);
    lp.pointerDown(p(2, 300, 300));
    expect(lp.pending).toBeFalse();
    lp.pointerUp(p(1));
    // Finger 2 is still down: it must not turn into a long press on its own.
    t.advance(1000);
    expect(fired.length).toBe(0);
    lp.pointerUp(p(2));
    expect(lp.pointersDown).toBe(0);
    lp.pointerDown(p(3));
    t.advance(450);
    expect(fired.length).toBe(1);
  });

  it('ignores the mouse (and non-primary buttons) by default; pen works', () => {
    const { lp, t, fired } = setup();
    lp.pointerDown(p(1, 0, 0, 'mouse'));
    t.advance(1000);
    lp.pointerUp(p(1, 0, 0, 'mouse'));
    lp.pointerDown(p(2, 0, 0, 'pen', 2));
    t.advance(1000);
    lp.pointerUp(p(2, 0, 0, 'pen', 2));
    expect(fired.length).toBe(0);
    lp.pointerDown(p(3, 0, 0, 'pen'));
    t.advance(450);
    expect(fired.length).toBe(1);
  });

  it('accepts the mouse when asked, with a custom delay / tolerance', () => {
    const { lp, t, fired } = setup({ pointerTypes: ['mouse'], delayMs: 600, moveTolerancePx: 20 });
    lp.pointerDown(p(1, 0, 0, 'mouse'));
    lp.pointerMove(p(1, 15, 0, 'mouse'));
    t.advance(599);
    expect(fired.length).toBe(0);
    t.advance(1);
    expect(fired.length).toBe(1);
  });

  it('`fired` resets when the next press starts', () => {
    const { lp, t } = setup();
    lp.pointerDown(p(1));
    t.advance(450);
    lp.pointerUp(p(1));
    expect(lp.fired).toBeTrue();
    lp.pointerDown(p(2));
    expect(lp.fired).toBeFalse();
  });

  it('attach() wires an element + window; detach removes the listeners and forgets pointers', () => {
    const t = fakeTimers();
    let n = 0;
    const lp = new LongPressDetector({ onLongPress: () => n++, timers: t.timers });
    const el = new EventTarget(), win = new EventTarget();
    const ev = (type: string, id: number) => Object.assign(new Event(type), { pointerId: id, clientX: 5, clientY: 5, pointerType: 'touch', button: 0 });
    const detach = lp.attach(el, win);
    el.dispatchEvent(ev('pointerdown', 1));
    t.advance(450);
    expect(n).toBe(1);
    win.dispatchEvent(ev('pointerup', 1));
    expect(lp.pointersDown).toBe(0);
    detach();
    el.dispatchEvent(ev('pointerdown', 2));
    t.advance(450);
    expect(n).toBe(1);
  });
});
