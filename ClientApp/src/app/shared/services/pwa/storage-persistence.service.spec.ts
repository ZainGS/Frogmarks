import { NgZone } from '@angular/core';
import { StoragePersistenceService } from './storage-persistence.service';
import {
  formatBytes, parseDismissal, shouldShowStorageNotice, STORAGE_NOTICE_DISMISS_KEY, storageLevel, storageNoticeText, storageUsageLabel,
} from './storage-notice.logic';

const zone = { run: <T>(fn: () => T): T => fn(), runOutsideAngular: <T>(fn: () => T): T => fn() } as unknown as NgZone;
const MB = 1024 * 1024, GB = 1024 * MB;

/** A document whose window has a fake navigator.storage, a localStorage map and event listeners we can fire. */
function fakeDoc(opts: { persisted?: boolean; grant?: boolean; usage?: number; quota?: number; noStorage?: boolean; stored?: Record<string, string> } = {}) {
  const store: Record<string, string> = { ...(opts.stored ?? {}) };
  const winListeners: Record<string, (() => void)[]> = {};
  let persisted = opts.persisted ?? false;
  const storage = {
    persisted: jasmine.createSpy('persisted').and.callFake(async () => persisted),
    persist: jasmine.createSpy('persist').and.callFake(async () => { if (opts.grant) persisted = true; return persisted; }),
    estimate: jasmine.createSpy('estimate').and.callFake(async () => ({ usage: opts.usage ?? 10 * MB, quota: opts.quota ?? 10 * GB })),
  };
  const win = {
    navigator: opts.noStorage ? {} : { storage },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
    addEventListener: (t: string, fn: () => void) => { (winListeners[t] ??= []).push(fn); },
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
  };
  const doc = { defaultView: win, visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
  return { doc: doc as unknown as Document, storage, store, fire: (t: string) => winListeners[t]?.forEach((f) => f()), setGrant: (g: boolean) => { opts.grant = g; } };
}

describe('storage-notice.logic', () => {
  it('storage level: fine / low (80 % or < 512 MB left) / critical (95 % or < 128 MB left)', () => {
    expect(storageLevel(10 * MB, 10 * GB)).toBe(0);
    expect(storageLevel(8.1 * GB, 10 * GB)).toBe(1);
    expect(storageLevel(9.6 * GB, 10 * GB)).toBe(2);
    expect(storageLevel(100 * MB, 500 * MB)).toBe(1);   // only 400 MB left
    expect(storageLevel(100 * MB, 200 * MB)).toBe(2);   // only 100 MB left
    expect(storageLevel(null, null)).toBe(0);
  });

  it('shows only when persistence is known to be refused', () => {
    expect(shouldShowStorageNotice({ supported: true, persisted: false, level: 0, dismissal: null })).toBeTrue();
    expect(shouldShowStorageNotice({ supported: true, persisted: true, level: 2, dismissal: null })).toBeFalse();
    expect(shouldShowStorageNotice({ supported: true, persisted: null, level: 0, dismissal: null })).toBeFalse();
    expect(shouldShowStorageNotice({ supported: false, persisted: false, level: 2, dismissal: null })).toBeFalse();
  });

  it('after Dismiss it stays hidden on later launches, and comes back only when storage gets lower', () => {
    const dismissedFine = { at: 1, level: 0 as const };
    expect(shouldShowStorageNotice({ supported: true, persisted: false, level: 0, dismissal: dismissedFine })).toBeFalse();
    expect(shouldShowStorageNotice({ supported: true, persisted: false, level: 1, dismissal: dismissedFine })).toBeTrue();
    const dismissedLow = { at: 1, level: 1 as const };
    expect(shouldShowStorageNotice({ supported: true, persisted: false, level: 1, dismissal: dismissedLow })).toBeFalse();
    expect(shouldShowStorageNotice({ supported: true, persisted: false, level: 2, dismissal: dismissedLow })).toBeTrue();
  });

  it('parses a stored dismissal defensively', () => {
    expect(parseDismissal(null)).toBeNull();
    expect(parseDismissal('garbage')).toBeNull();
    expect(parseDismissal('{"at":5,"level":1}')).toEqual({ at: 5, level: 1 });
    expect(parseDismissal('{"at":5,"level":9}')).toEqual({ at: 5, level: 0 });
  });

  it('texts: install + export advice, no cloud sync; human-readable sizes', () => {
    expect(storageNoticeText(0)).toContain('Install Frogmarks');
    expect(storageNoticeText(0)).toContain('Save .frogmarks');
    expect(storageNoticeText(0).toLowerCase()).not.toContain('cloud');
    expect(storageNoticeText(1)).toContain('running low');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(12.34 * MB)).toBe('12.3 MB');
    expect(formatBytes(4.07 * GB)).toBe('4.07 GB');
    expect(storageUsageLabel(10 * MB, 10 * GB)).toBe('10.0 MB of 10.0 GB (0.1 %)');
    expect(storageUsageLabel(null, 5)).toBe('');
  });
});

describe('StoragePersistenceService', () => {
  it('at start: asks for persistence when not persisted yet, reads the estimate, shows the notice when refused', async () => {
    const f = fakeDoc({ persisted: false, grant: false });
    const svc = new StoragePersistenceService(f.doc, zone);
    await svc.start();
    expect(f.storage.persisted).toHaveBeenCalled();
    expect(f.storage.persist).toHaveBeenCalledTimes(1);
    expect(svc.persisted).toBeFalse();
    expect(svc.persistedLabel).toBe('no');
    expect(svc.usageLabel).toBe('10.0 MB of 10.0 GB (0.1 %)');
    expect(svc.noticeVisible).toBeTrue();
  });

  it('already persisted: no persist() call, no notice', async () => {
    const f = fakeDoc({ persisted: true });
    const svc = new StoragePersistenceService(f.doc, zone);
    await svc.start();
    expect(f.storage.persist).not.toHaveBeenCalled();
    expect(svc.persistedLabel).toBe('yes');
    expect(svc.noticeVisible).toBeFalse();
  });

  it('Dismiss is remembered across launches; it re-shows when storage gets low', async () => {
    const f = fakeDoc({ persisted: false });
    const svc = new StoragePersistenceService(f.doc, zone);
    await svc.start();
    svc.dismissNotice();
    expect(svc.noticeVisible).toBeFalse();
    expect(parseDismissal(f.store[STORAGE_NOTICE_DISMISS_KEY])?.level).toBe(0);

    const again = new StoragePersistenceService(fakeDoc({ persisted: false, stored: f.store }).doc, zone);
    await again.start();
    expect(again.noticeVisible).toBeFalse();   // not on every launch

    const low = new StoragePersistenceService(fakeDoc({ persisted: false, usage: 9 * GB, quota: 10 * GB, stored: f.store }).doc, zone);
    await low.start();
    expect(low.level).toBe(1);
    expect(low.noticeVisible).toBeTrue();
  });

  it('asks again after the app is installed (appinstalled), which can grant it', async () => {
    const f = fakeDoc({ persisted: false, grant: false });
    const svc = new StoragePersistenceService(f.doc, zone);
    await svc.start();
    expect(svc.noticeVisible).toBeTrue();
    f.setGrant(true);
    f.fire('appinstalled');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(f.storage.persist).toHaveBeenCalledTimes(2);
    expect(svc.persisted).toBeTrue();
    expect(svc.noticeVisible).toBeFalse();
  });

  it('without the Storage API: nothing to ask, no notice, no throw', async () => {
    const svc = new StoragePersistenceService(fakeDoc({ noStorage: true }).doc, zone);
    await expectAsync(svc.start()).toBeResolved();
    expect(svc.supported).toBeFalse();
    expect(svc.persistedLabel).toBe('not supported');
    expect(svc.noticeVisible).toBeFalse();
  });
});
