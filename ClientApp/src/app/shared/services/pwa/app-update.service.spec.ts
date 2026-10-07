import { NgZone } from '@angular/core';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdateService, DocumentSaveGuard } from './app-update.service';
import { reloadDecision, updateButtonLabel, updateCheckDue, updatePromptFor, updatePromptText, UPDATE_CHECK_MIN_GAP_MS } from './app-update.logic';

/** A zone stand-in that just runs the callback (the service only uses run / runOutsideAngular). */
const zone = { run: <T>(fn: () => T): T => fn(), runOutsideAngular: <T>(fn: () => T): T => fn() } as unknown as NgZone;

class TestUpdateService extends AppUpdateService {
  reloads = 0;
  protected override reloadPage(): void { this.reloads++; }
}

function fakeSw(enabled = true) {
  const versionUpdates = new Subject<VersionEvent>();
  const unrecoverable = new Subject<UnrecoverableStateEvent>();
  const sw = {
    isEnabled: enabled,
    versionUpdates,
    unrecoverable,
    checkForUpdate: jasmine.createSpy('checkForUpdate').and.resolveTo(false),
    activateUpdate: jasmine.createSpy('activateUpdate').and.resolveTo(true),
  };
  return { sw, versionUpdates, unrecoverable };
}

function ready(hash = 'b', version = '0.02'): VersionEvent {
  return {
    type: 'VERSION_READY',
    currentVersion: { hash: 'a', appData: { version: '0.01' } },
    latestVersion: { hash, appData: { version } },
  };
}

function make(enabled = true) {
  const f = fakeSw(enabled);
  const svc = new TestUpdateService(f.sw as unknown as SwUpdate, zone, document);
  svc.start();
  return { svc, ...f };
}

/** A document whose save clears its unsaved flag (or fails to, with `saves: false`). */
function guard(unsaved: boolean, saves = true): DocumentSaveGuard & { flushes: number } {
  const g = {
    unsaved, flushes: 0,
    hasUnsavedChanges: () => g.unsaved,
    flushPendingSave: async () => { g.flushes++; if (saves) g.unsaved = false; },
  };
  return g;
}

describe('app-update.logic', () => {
  it('the Shell shows a popup, the editor only its menubar button (never a popup)', () => {
    expect(updatePromptFor('shell', 'ready', false)).toBe('popup');
    expect(updatePromptFor('editor', 'ready', false)).toBe('menubar-button');
    expect(updatePromptFor('editor', 'unrecoverable', false)).toBe('menubar-button');
    expect(updatePromptFor('shell', 'none', false)).toBe('none');
    expect(updatePromptFor('editor', 'none', false)).toBe('none');
  });

  it('"Later" hides the Shell popup for a ready version, but not for an unrecoverable state', () => {
    expect(updatePromptFor('shell', 'ready', true)).toBe('none');
    expect(updatePromptFor('shell', 'unrecoverable', true)).toBe('popup');
  });

  it('never reloads while something is still unsaved', () => {
    expect(reloadDecision('ready', true)).toBe('unsaved');
    expect(reloadDecision('unrecoverable', true)).toBe('unsaved');
    expect(reloadDecision('ready', false)).toBe('reload');
    expect(reloadDecision('none', false)).toBe('none');
  });

  it('texts: versions when known, a retry label after a blocked reload', () => {
    expect(updatePromptText('ready', '0.02', '0.01')).toBe('New version available: v0.01 → v0.02');
    expect(updatePromptText('ready', null, '0.01')).toBe('New version available');
    expect(updatePromptText('ready', '0.01', '0.01')).toBe('New version available');
    expect(updatePromptText('unrecoverable', null, '0.01')).toContain('reload');
    expect(updateButtonLabel('ready', false, false)).toBe('Update ready');
    expect(updateButtonLabel('ready', true, false)).toBe('Saving…');
    expect(updateButtonLabel('ready', false, true)).toContain('retry');
  });

  it('a focus check is due only after the minimum gap', () => {
    expect(updateCheckDue(1000, null)).toBeTrue();
    expect(updateCheckDue(1000 + UPDATE_CHECK_MIN_GAP_MS - 1, 1000)).toBeFalse();
    expect(updateCheckDue(1000 + UPDATE_CHECK_MIN_GAP_MS, 1000)).toBeTrue();
  });
});

describe('AppUpdateService', () => {
  afterEach(() => jasmine.clock().uninstall());

  it('checks for an update at start; VERSION_READY sets ready + the new APP_VERSION, and never reloads by itself', () => {
    const { svc, sw, versionUpdates } = make();
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    svc.registerDocumentGuard(guard(true));
    versionUpdates.next(ready());
    expect(svc.state).toBe('ready');
    expect(svc.latestVersion).toBe('0.02');
    expect(svc.reloads).toBe(0);
    expect(sw.activateUpdate).not.toHaveBeenCalled();
    svc.ngOnDestroy();
  });

  it('checks again every 30 minutes', () => {
    jasmine.clock().install();
    const { svc, sw } = make();
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    jasmine.clock().tick(30 * 60 * 1000);
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(2);
    svc.ngOnDestroy();
  });

  it('does nothing without a service worker (dev server / tests)', async () => {
    const { svc, sw } = make(false);
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
    expect(await svc.applyUpdate()).toBe('none');
    expect(svc.reloads).toBe(0);
  });

  it('Shell Reload with no open document: activates the new version, then reloads', async () => {
    const { svc, sw, versionUpdates } = make();
    versionUpdates.next(ready());
    expect(await svc.applyUpdate()).toBe('reloading');
    expect(sw.activateUpdate).toHaveBeenCalledTimes(1);
    expect(svc.reloads).toBe(1);
    svc.ngOnDestroy();
  });

  it('editor Update ready: saves the pending change FIRST, then activates and reloads', async () => {
    const { svc, sw, versionUpdates } = make();
    const order: string[] = [];
    const g = guard(true);
    const flush = g.flushPendingSave;
    g.flushPendingSave = async () => { order.push('flush'); await flush(); };
    sw.activateUpdate.and.callFake(async () => { order.push('activate'); return true; });
    svc.registerDocumentGuard(g);
    versionUpdates.next(ready());
    expect(await svc.applyUpdate()).toBe('reloading');
    expect(order).toEqual(['flush', 'activate']);
    expect(svc.reloads).toBe(1);
    svc.ngOnDestroy();
  });

  it('does NOT reload while a document is still unsaved after the flush (failed / blocked save)', async () => {
    const { svc, sw, versionUpdates } = make();
    const g = guard(true, false);
    svc.registerDocumentGuard(g);
    versionUpdates.next(ready());
    expect(await svc.applyUpdate()).toBe('unsaved');
    expect(g.flushes).toBe(1);
    expect(sw.activateUpdate).not.toHaveBeenCalled();
    expect(svc.reloads).toBe(0);
    expect(svc.blockedByUnsaved).toBeTrue();
    expect(svc.state).toBe('ready');   // the prompt stays; a later tap retries
    svc.ngOnDestroy();
  });

  it('flushes every registered editor (a reused, detached one too); an unregistered one is ignored', async () => {
    const { svc, versionUpdates } = make();
    const a = guard(true), b = guard(true), c = guard(true, false);
    svc.registerDocumentGuard(a);
    svc.registerDocumentGuard(b);
    const offC = svc.registerDocumentGuard(c);
    offC();
    versionUpdates.next(ready());
    expect(await svc.applyUpdate()).toBe('reloading');
    expect(a.flushes).toBe(1);
    expect(b.flushes).toBe(1);
    expect(c.flushes).toBe(0);
    svc.ngOnDestroy();
  });

  it('UNRECOVERABLE_STATE prompts a reload (no activateUpdate), still after saving', async () => {
    const { svc, sw, unrecoverable, versionUpdates } = make();
    const g = guard(true);
    svc.registerDocumentGuard(g);
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'files gone' });
    expect(svc.state).toBe('unrecoverable');
    versionUpdates.next(ready());
    expect(svc.state).toBe('unrecoverable');   // a later VERSION_READY doesn't hide the reload prompt
    expect(svc.reloads).toBe(0);
    expect(await svc.applyUpdate()).toBe('reloading');
    expect(g.flushes).toBe(1);
    expect(sw.activateUpdate).not.toHaveBeenCalled();
    expect(svc.reloads).toBe(1);
    svc.ngOnDestroy();
  });

  it('"Later" on the Shell lasts until a NEWER version is ready', () => {
    const { svc, versionUpdates } = make();
    versionUpdates.next(ready('b'));
    svc.dismissShellPrompt();
    expect(updatePromptFor('shell', svc.state, svc.dismissedOnShell)).toBe('none');
    versionUpdates.next(ready('b'));
    expect(svc.dismissedOnShell).toBeTrue();
    versionUpdates.next(ready('c', '0.03'));
    expect(svc.dismissedOnShell).toBeFalse();
    expect(updatePromptFor('shell', svc.state, svc.dismissedOnShell)).toBe('popup');
    svc.ngOnDestroy();
  });

  it('a second tap while saving does not start another reload', async () => {
    const { svc, versionUpdates } = make();
    let release!: () => void;
    svc.registerDocumentGuard({ hasUnsavedChanges: () => false, flushPendingSave: () => new Promise<void>((r) => { release = r; }) });
    versionUpdates.next(ready());
    const first = svc.applyUpdate();
    expect(await svc.applyUpdate()).toBe('busy');
    release();
    expect(await first).toBe('reloading');
    expect(svc.reloads).toBe(1);
    svc.ngOnDestroy();
  });
});
