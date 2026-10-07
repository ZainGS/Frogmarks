import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, NgZone, OnDestroy, Optional } from '@angular/core';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subscription } from 'rxjs';
import { APP_VERSION } from '../../../app-version';
import {
  ApplyUpdateResult, reloadDecision, UPDATE_CHECK_INTERVAL_MS, updateCheckDue, UpdateState,
} from './app-update.logic';

/** An open document that must be saved before the page reloads (registered by each live editor). */
export interface DocumentSaveGuard {
  /** Something is still unsaved (a change in the autosave debounce, a save running or queued). */
  hasUnsavedChanges(): boolean;
  /** Save the pending change now (never throws). */
  flushPendingSave(): Promise<void>;
}

/** One flush may take this long before the update gives up on it (the save keeps running; the reload waits). */
const FLUSH_TIMEOUT_MS = 15_000;

/**
 * App updates through Angular's service worker (ngsw-config.json; registered in production builds only).
 *
 * The worker downloads a new deploy in the background; VERSION_READY then sets `state = 'ready'` and the Shell shows a
 * popup, the editor a small "Update ready" menubar button (app-update.logic.ts). Nothing reloads by itself:
 * applyUpdate() (the user's tap) saves every open document first, and reloads only when nothing is left unsaved.
 * Checks for a new version: at start, when the tab becomes visible again, and every 30 minutes.
 * A fresh launch of the app always starts on the newest downloaded version (the worker's own rule).
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService implements OnDestroy {
  state: UpdateState = 'none';
  /** APP_VERSION of the running build / of the downloaded one (ngsw.json appData, written by scripts/build.mjs). */
  readonly currentVersion = APP_VERSION;
  latestVersion: string | null = null;
  unrecoverableReason: string | null = null;
  /** applyUpdate() is saving / reloading. */
  applying = false;
  /** The last applyUpdate() stopped because a document still had unsaved changes after the flush. */
  blockedByUnsaved = false;
  /** The user put the Shell popup off ("Later") for the version waiting now. */
  dismissedOnShell = false;

  private readonly guards = new Set<DocumentSaveGuard>();
  private readonly subs: Subscription[] = [];
  private started = false;
  private lastCheckMs: number | null = null;
  private interval: ReturnType<typeof setInterval> | undefined;
  private readyHash: string | null = null;
  private readonly onVisibility = (): void => {
    if (this.doc.visibilityState === 'visible' && updateCheckDue(Date.now(), this.lastCheckMs)) this.checkNow();
  };

  constructor(@Optional() private readonly sw: SwUpdate | null, private readonly zone: NgZone, @Inject(DOCUMENT) private readonly doc: Document) {}

  /** The service worker is active in this build (production, a secure context, a browser that supports it). */
  get enabled(): boolean { return !!this.sw?.isEnabled; }

  /** Begin listening and checking (AppComponent, once). A no-op without a service worker (dev server, tests). */
  start(): void {
    if (this.started || !this.sw?.isEnabled) return;
    this.started = true;
    this.subs.push(this.sw.versionUpdates.subscribe((e) => this.onVersionEvent(e)));
    this.subs.push(this.sw.unrecoverable.subscribe((e) => this.zone.run(() => {
      console.warn('[update] unrecoverable state:', e.reason);
      this.state = 'unrecoverable';
      this.unrecoverableReason = e.reason;
    })));
    // Outside the zone: a pending interval would keep the app from ever being "stable" (the worker registers then).
    this.zone.runOutsideAngular(() => {
      this.doc.addEventListener('visibilitychange', this.onVisibility);
      this.interval = setInterval(() => this.checkNow(), UPDATE_CHECK_INTERVAL_MS);
    });
    this.checkNow();
  }

  /** Ask the worker to look for a new deploy now (it downloads one in the background; VERSION_READY follows). */
  checkNow(): void {
    if (!this.sw?.isEnabled) return;
    this.lastCheckMs = Date.now();
    this.zone.runOutsideAngular(() => {
      this.sw!.checkForUpdate().catch((err) => console.warn('[update] check failed', err));
    });
  }

  /** Every live editor registers its document; the returned function unregisters it (ngOnDestroy). */
  registerDocumentGuard(guard: DocumentSaveGuard): () => void {
    this.guards.add(guard);
    return () => { this.guards.delete(guard); };
  }

  /** Some registered document has unsaved changes right now. */
  hasUnsavedChanges(): boolean {
    for (const g of this.guards) { try { if (g.hasUnsavedChanges()) return true; } catch { return true; } }
    return false;
  }

  /** Shell popup → Later: hidden until a newer version is ready (or the next launch). */
  dismissShellPrompt(): void { this.dismissedOnShell = true; }

  /**
   * The user's Reload / Update ready: flush every open document's pending save, then (only if nothing is left
   * unsaved) activate the waiting version and reload. 'unsaved' = nothing happened; the button says so.
   */
  async applyUpdate(): Promise<ApplyUpdateResult> {
    if (this.state === 'none') return 'none';
    if (this.applying) return 'busy';
    this.applying = true;
    this.blockedByUnsaved = false;
    try {
      await Promise.all([...this.guards].map((g) => Promise.race([
        g.flushPendingSave().catch((err) => console.warn('[update] save before reload failed', err)),
        new Promise<void>((r) => setTimeout(r, FLUSH_TIMEOUT_MS)),
      ])));
      const decision = reloadDecision(this.state, this.hasUnsavedChanges());
      if (decision === 'unsaved') { this.blockedByUnsaved = true; return 'unsaved'; }
      if (decision === 'none') return 'none';
      if (this.state === 'ready') {
        try { await this.sw?.activateUpdate(); } catch (err) { console.warn('[update] activateUpdate failed; reloading anyway', err); }
      }
      this.reloadPage();
      return 'reloading';
    } finally {
      this.applying = false;
    }
  }

  /** Separate so the specs can replace it. */
  protected reloadPage(): void { this.doc.defaultView?.location.reload(); }

  private onVersionEvent(e: VersionEvent): void {
    switch (e.type) {
      case 'VERSION_DETECTED':
        console.info('[update] downloading a new version', e.version.hash);
        break;
      case 'VERSION_READY':
        this.zone.run(() => {
          if (this.state === 'unrecoverable') return;   // a reload is needed anyway; keep that prompt
          if (this.readyHash !== e.latestVersion.hash) this.dismissedOnShell = false;
          this.readyHash = e.latestVersion.hash;
          const appData = e.latestVersion.appData as { version?: unknown } | undefined;
          this.latestVersion = typeof appData?.version === 'string' && appData.version ? appData.version : null;
          this.state = 'ready';
          this.blockedByUnsaved = false;
        });
        break;
      case 'VERSION_INSTALLATION_FAILED':
        console.warn('[update] new version failed to install:', e.error);
        break;
      default:
        break;
    }
  }

  ngOnDestroy(): void {
    for (const s of this.subs) s.unsubscribe();
    clearInterval(this.interval);
    this.doc.removeEventListener('visibilitychange', this.onVisibility);
  }
}
