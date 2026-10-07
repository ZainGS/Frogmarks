import { StatusThrottle } from './status-throttle';

/** A manual clock + timer queue. */
function fakeClock() {
  let t = 0;
  let timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let next = 1;
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => { const id = next++; timers.push({ at: t + ms, fn, id }); return id as any; },
    clearTimer: (id: any) => { timers = timers.filter(x => x.id !== id); },
    advance(ms: number) {
      t += ms;
      const due = timers.filter(x => x.at <= t);
      timers = timers.filter(x => x.at > t);
      for (const x of due) x.fn();
    },
    get pending() { return timers.length; },
  };
}

describe('StatusThrottle (M6: the engine status pill at most 4 Hz)', () => {
  it('shows the first text at once, then paces changes to one per interval with the newest text', () => {
    const c = fakeClock();
    const shown: string[] = [];
    const s = new StatusThrottle(t => shown.push(t), 250, c.now, c.setTimer, c.clearTimer);
    s.set('Preparing shaders… 1/40');
    expect(shown).toEqual(['Preparing shaders… 1/40']);
    for (let i = 2; i <= 10; i++) { c.advance(10); s.set(`Preparing shaders… ${i}/40`); }
    expect(shown.length).toBe(1);   // 90 ms in: still the first
    c.advance(160);                 // 250 ms after the first show
    expect(shown).toEqual(['Preparing shaders… 1/40', 'Preparing shaders… 10/40']);
  });

  it('going idle (empty text) shows at once and drops the scheduled update', () => {
    const c = fakeClock();
    const shown: string[] = [];
    const s = new StatusThrottle(t => shown.push(t), 250, c.now, c.setTimer, c.clearTimer);
    s.set('Building city…');
    c.advance(50);
    s.set('Building city… 3/9');   // scheduled
    s.set('');                      // done
    expect(shown).toEqual(['Building city…', '']);
    expect(c.pending).toBe(0);
    expect(s.shown).toBe('');
    s.set('Preparing shaders… 1/2');   // appearing from idle: at once
    expect(shown[shown.length - 1]).toBe('Preparing shaders… 1/2');
  });

  it('the last text always lands (no update lost at the end of a burst)', () => {
    const c = fakeClock();
    const shown: string[] = [];
    const s = new StatusThrottle(t => shown.push(t), 250, c.now, c.setTimer, c.clearTimer);
    s.set('a');
    c.advance(100);
    s.set('b');
    c.advance(100);
    s.set('c');
    c.advance(1000);
    expect(shown).toEqual(['a', 'c']);
    expect(s.shown).toBe('c');
  });

  it('repeating the shown text does nothing; dispose cancels', () => {
    const c = fakeClock();
    let n = 0;
    const s = new StatusThrottle(() => n++, 250, c.now, c.setTimer, c.clearTimer);
    s.set('x'); s.set('x');
    expect(n).toBe(1);
    c.advance(10);
    s.set('y');
    s.dispose();
    c.advance(1000);
    expect(n).toBe(1);
  });
});
