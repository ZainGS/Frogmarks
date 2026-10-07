import { FrameCoalescer } from './frame-coalescer';

/** A manual frame clock: requested callbacks run only when step() is called. */
function fakeFrames() {
  let next = 1;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    raf: (cb: FrameRequestCallback) => { const id = next++; queue.set(id, cb); return id; },
    caf: (id: number) => { queue.delete(id); },
    get scheduled() { return queue.size; },
    step() { const cbs = [...queue.values()]; queue.clear(); for (const cb of cbs) cb(0); },
  };
}

describe('FrameCoalescer (one flush per animation frame)', () => {
  it('many marks in one frame → one flush with every key, on the next frame', () => {
    const f = fakeFrames();
    const flushes: string[][] = [];
    const c = new FrameCoalescer<'scene' | 'selection'>(d => flushes.push([...d].sort()), f.raf, f.caf);
    for (let i = 0; i < 20; i++) c.mark('scene');
    c.mark('selection');
    expect(flushes.length).toBe(0);
    expect(f.scheduled).toBe(1);
    expect(c.pending).toBeTrue();
    f.step();
    expect(flushes).toEqual([['scene', 'selection']]);
    expect(c.pending).toBeFalse();
    f.step();
    expect(flushes.length).toBe(1);   // nothing marked → no second flush
  });

  it('flushNow runs the pending flush at once and cancels the frame', () => {
    const f = fakeFrames();
    let n = 0;
    const c = new FrameCoalescer(() => n++, f.raf, f.caf);
    c.mark('a');
    c.flushNow();
    expect(n).toBe(1);
    expect(f.scheduled).toBe(0);
    c.flushNow();   // nothing pending
    expect(n).toBe(1);
  });

  it('a mark made by the flush itself schedules the next frame (not lost, not re-entrant)', () => {
    const f = fakeFrames();
    const seen: number[] = [];
    let first = true;
    const c: FrameCoalescer = new FrameCoalescer(d => {
      seen.push(d.size);
      if (first) { first = false; c.mark('again'); }
    }, f.raf, f.caf);
    c.mark('a');
    f.step();
    expect(seen).toEqual([1]);
    expect(f.scheduled).toBe(1);
    f.step();
    expect(seen).toEqual([1, 1]);
  });

  it('cancel drops the marks', () => {
    const f = fakeFrames();
    let n = 0;
    const c = new FrameCoalescer(() => n++, f.raf, f.caf);
    c.mark('a');
    c.cancel();
    f.step();
    c.flushNow();
    expect(n).toBe(0);
  });
});
