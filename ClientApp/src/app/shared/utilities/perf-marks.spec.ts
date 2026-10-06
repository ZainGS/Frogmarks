import { CREATE_MARKS, createTimeline, parseShellPerfFlags, perfMark } from './perf-marks';

describe('perf marks (Shell → editor instrumentation)', () => {
  it('parses ?shellperf and ?shellskip= (defaults: off, nothing skipped)', () => {
    expect(parseShellPerfFlags('')).toEqual({ perf: false, skip: new Set() });
    expect(parseShellPerfFlags(null).perf).toBeFalse();
    expect(parseShellPerfFlags('?docW=1080&docH=1080').perf).toBeFalse();
    expect(parseShellPerfFlags('?shellperf').perf).toBeTrue();
    expect(parseShellPerfFlags('?shellperf=0').perf).toBeFalse();
    const f = parseShellPerfFlags('?shellperf&shellskip=Warmup, grain');
    expect(f.perf).toBeTrue();
    expect(f.skip.has('warmup')).toBeTrue();
    expect(f.skip.has('grain')).toBeTrue();
    expect(f.skip.has('specks')).toBeFalse();
  });

  it('layers the URL over a stored base without mutating it', () => {
    const base = parseShellPerfFlags('shellskip=warmup');
    const f = parseShellPerfFlags('?shellperf', base);
    expect(f.perf).toBeTrue();
    expect(f.skip.has('warmup')).toBeTrue();
    expect(base.perf).toBeFalse();
  });

  it('the create timeline lists the marks reached after the click, with the delta to the previous one', () => {
    const at: Record<string, number> = {
      'create:click': 1000, 'dialog-closed': 2500, 'doc-created': 2520, 'nav-start': 2521,
      'editor:ctor': 2600, 'reinit-done': 2700, 'blank-done': 2760, 'doc-loaded': 2900, 'editor:first-frame': 2933,
      'chunk-loaded': 400,   // preloaded before the click: not part of this run
    };
    const rows = createTimeline(n => at[n] ?? null);
    expect(rows.map(r => r.step)).toEqual(CREATE_MARKS.filter(m => m !== 'chunk-loaded'));
    expect(rows[0]).toEqual({ step: 'create:click', atMs: 0, deltaMs: 0 });
    expect(rows.find(r => r.step === 'doc-created')).toEqual({ step: 'doc-created', atMs: 1520, deltaMs: 20 });
    expect(rows[rows.length - 1]).toEqual({ step: 'editor:first-frame', atMs: 1933, deltaMs: 33 });
    expect(createTimeline(() => null)).toEqual([]);
  });

  it('perfMark writes a User Timing mark and never throws', () => {
    performance.clearMarks('spec:mark');
    perfMark('spec:mark');
    expect(performance.getEntriesByName('spec:mark', 'mark').length).toBe(1);
    performance.clearMarks('spec:mark');
  });
});
