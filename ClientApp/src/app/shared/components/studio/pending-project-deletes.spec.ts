import { PendingProjectDeletes } from './pending-project-deletes';

/** A manual timer queue. */
function fakeTimers() {
  let t = 0;
  let timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let next = 1;
  return {
    set: (fn: () => void, ms: number) => { const id = next++; timers.push({ at: t + ms, fn, id }); return id as any; },
    clear: (id: any) => { timers = timers.filter(x => x.id !== id); },
    advance(ms: number) {
      t += ms;
      const due = timers.filter(x => x.at <= t);
      timers = timers.filter(x => x.at > t);
      for (const x of due) x.fn();
    },
    get pending() { return timers.length; },
  };
}

const flush = () => new Promise<void>(r => setTimeout(r, 0));

describe('PendingProjectDeletes (Shell card ✕ = delete with Undo)', () => {
  function setup(commitImpl?: (id: string) => Promise<void>) {
    const timers = fakeTimers();
    const deleted: string[] = [];
    const errors: string[] = [];
    let changes = 0;
    const q = new PendingProjectDeletes(
      commitImpl ?? (async id => { deleted.push(id); }),
      () => { changes++; },
      8000, timers.set, timers.clear,
      (id) => errors.push(id),
    );
    return { q, timers, deleted, errors, changes: () => changes };
  }

  it('hides the card at once and deletes only after the delay', async () => {
    const { q, timers, deleted, changes } = setup();
    q.schedule({ id: 'a', name: 'Alpha', dashboardKind: 'illustration' });
    expect(q.isHidden('a')).toBeTrue();
    expect(q.list.map(e => e.name)).toEqual(['Alpha']);
    expect(changes()).toBe(1);
    timers.advance(7999);
    expect(deleted).toEqual([]);
    timers.advance(1);
    await flush();
    expect(deleted).toEqual(['a']);
    expect(q.list.length).toBe(0);
    expect(q.isHidden('a')).toBeFalse();   // gone from storage now; the list no longer has it anyway
  });

  it('Undo brings the card back and never deletes', async () => {
    const { q, timers, deleted } = setup();
    q.schedule({ id: 'a', name: 'Alpha', dashboardKind: 'packaging' });
    expect(q.undo('a')).toBeTrue();
    expect(q.isHidden('a')).toBeFalse();
    expect(q.list.length).toBe(0);
    expect(timers.pending).toBe(0);
    timers.advance(20000);
    await flush();
    expect(deleted).toEqual([]);
    expect(q.undo('a')).toBeFalse();
  });

  it('leaving the Shell cancels every waiting delete without deleting', async () => {
    const { q, timers, deleted } = setup();
    q.schedule({ id: 'a', name: 'A', dashboardKind: 'illustration' });
    q.schedule({ id: 'b', name: 'B', dashboardKind: 'illustration' });
    q.cancelAll();
    expect(timers.pending).toBe(0);
    expect(q.isHidden('a') || q.isHidden('b')).toBeFalse();
    timers.advance(20000);
    await flush();
    expect(deleted).toEqual([]);
  });

  it('a second ✕ on the same card is ignored; several cards each have their own timer + Undo', async () => {
    const { q, timers, deleted } = setup();
    q.schedule({ id: 'a', name: 'A', dashboardKind: 'illustration' });
    timers.advance(4000);
    q.schedule({ id: 'a', name: 'A', dashboardKind: 'illustration' });   // ignored (keeps the first timer)
    q.schedule({ id: 'b', name: 'B', dashboardKind: 'illustration' });
    expect(q.list.map(e => e.id)).toEqual(['a', 'b']);
    q.undo('b');
    timers.advance(4000);
    await flush();
    expect(deleted).toEqual(['a']);
    timers.advance(8000);
    await flush();
    expect(deleted).toEqual(['a']);
  });

  it('while the delete runs the card stays hidden and Undo is no longer offered', async () => {
    let finish!: () => void;
    const { q, timers } = setup(() => new Promise<void>(r => { finish = r; }));
    q.schedule({ id: 'a', name: 'A', dashboardKind: 'illustration' });
    timers.advance(8000);
    expect(q.isHidden('a')).toBeTrue();
    expect(q.list.length).toBe(0);
    expect(q.undo('a')).toBeFalse();
    finish();
    await flush();
    expect(q.isHidden('a')).toBeFalse();
  });

  it('a failed delete shows the card again and reports it', async () => {
    const { q, timers, errors } = setup(() => Promise.reject(new Error('quota')));
    q.schedule({ id: 'a', name: 'A', dashboardKind: 'illustration' });
    timers.advance(8000);
    await flush();
    expect(errors).toEqual(['a']);
    expect(q.isHidden('a')).toBeFalse();
  });
});
