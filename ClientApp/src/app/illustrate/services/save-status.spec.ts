import { SaveStatusInput, saveStatusOf } from './save-status';

const base: SaveStatusInput = { autoSave: 'idle', pending: false, loading: false, missing: false, paused: false, syncMode: 2 };
const st = (o: Partial<SaveStatusInput>) => saveStatusOf({ ...base, ...o });

describe('saveStatusOf (top bar: Saved ✓ / Saving… / Not saved)', () => {
  it('nothing waiting = Saved ✓ (idle, or just saved), saying where', () => {
    expect(st({}).label).toBe('Saved ✓');
    expect(st({ autoSave: 'saved' }).kind).toBe('saved');
    expect(st({}).title).toContain('on this device');
    expect(st({ syncMode: 0 }).title).toContain('to the cloud');
  });

  it('a running save, or a change waiting in the debounce = Saving…', () => {
    expect(st({ autoSave: 'saving' }).label).toBe('Saving…');
    expect(st({ pending: true }).kind).toBe('saving');
  });

  it('a failed save = Not saved, and a tap retries', () => {
    const s = st({ autoSave: 'error', pending: true });
    expect(s.label).toBe('Not saved');
    expect(s.retry).toBeTrue();
  });

  it('paused / missing document / autosave unavailable = Not saved (no retry)', () => {
    for (const s of [st({ paused: true, pending: true }), st({ missing: true }), st({ autoSave: 'unavailable' })]) {
      expect(s.kind).toBe('not-saved');
      expect(s.retry).toBeFalse();
    }
  });

  it('a cloud document without the local copy still saves to the server', () => {
    expect(st({ autoSave: 'unavailable', syncMode: 0 }).kind).toBe('saved');
  });

  it('while loading: no alarm', () => {
    expect(st({ loading: true, pending: true }).kind).toBe('saved');
  });
});
