import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import {
  parseDismissal, shouldShowStorageNotice, STORAGE_NOTICE_DISMISS_KEY, StorageLevel, storageLevel, StorageNoticeDismissal,
  storageNoticeText, storageUsageLabel,
} from './storage-notice.logic';

/** The parts of navigator.storage used here (all optional: older browsers / insecure contexts lack them). */
type StorageManagerLike = Partial<Pick<StorageManager, 'persist' | 'persisted' | 'estimate'>>;

/** Re-read the estimate on tab focus at most this often. */
const ESTIMATE_MIN_GAP_MS = 5 * 60 * 1000;

/**
 * Persistent storage (mobile-parity TIER-8). Local documents (OPFS / IndexedDB) are "best effort" storage until the
 * browser grants persistence; Chrome on Android may then evict them when the device runs low on space. At app start
 * this asks for persistence (navigator.storage.persist(): Chrome decides by heuristics, there is no prompt; an
 * installed app is granted), asks again after the app is installed (appinstalled), and keeps the quota estimate for
 * Shell › Settings. Not persistent → the Shell shows a dismissible notice (storage-notice.logic.ts: once, then only
 * when storage gets low).
 */
@Injectable({ providedIn: 'root' })
export class StoragePersistenceService implements OnDestroy {
  /** navigator.storage.persist / persisted exist. */
  supported = false;
  /** null until known. */
  persisted: boolean | null = null;
  usage: number | null = null;
  quota: number | null = null;
  level: StorageLevel = 0;
  noticeVisible = false;
  /** A persist() call is running (the Settings button). */
  requesting = false;

  private started = false;
  private lastEstimateMs = 0;
  private dismissal: StorageNoticeDismissal | null = null;
  private readonly win: (Window & typeof globalThis) | null;
  private readonly onInstalled = (): void => { void this.zone.run(() => this.requestPersistence()); };
  private readonly onVisibility = (): void => {
    if (this.doc.visibilityState === 'visible' && Date.now() - this.lastEstimateMs >= ESTIMATE_MIN_GAP_MS) {
      void this.zone.run(() => this.refreshEstimate());
    }
  };

  constructor(@Inject(DOCUMENT) private readonly doc: Document, private readonly zone: NgZone) {
    this.win = doc.defaultView as (Window & typeof globalThis) | null;
  }

  private get storage(): StorageManagerLike | null {
    return (this.win?.navigator?.storage as StorageManagerLike | undefined) ?? null;
  }

  /** At app start (AppComponent, once): read / request persistence and the estimate; listen for appinstalled. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.dismissal = this.readDismissal();
    const st = this.storage;
    this.supported = typeof st?.persist === 'function' && typeof st?.persisted === 'function';
    this.zone.runOutsideAngular(() => {
      this.win?.addEventListener('appinstalled', this.onInstalled);
      this.doc.addEventListener('visibilitychange', this.onVisibility);
    });
    if (this.supported) {
      try {
        this.persisted = await st!.persisted!();
        if (!this.persisted) this.persisted = await st!.persist!();
      } catch (err) {
        console.warn('[storage] persistence check failed', err);
      }
    }
    await this.refreshEstimate();
  }

  /** Ask again (after install, or the Settings button). Chrome answers from its heuristics; no prompt appears. */
  async requestPersistence(): Promise<boolean | null> {
    const st = this.storage;
    if (typeof st?.persist !== 'function') return this.persisted;
    this.requesting = true;
    try {
      this.persisted = await st.persist();
    } catch (err) {
      console.warn('[storage] persist() failed', err);
    } finally {
      this.requesting = false;
    }
    await this.refreshEstimate();
    return this.persisted;
  }

  /** navigator.storage.estimate() → usage / quota / level, and re-evaluate the notice. */
  async refreshEstimate(): Promise<void> {
    this.lastEstimateMs = Date.now();
    const st = this.storage;
    if (typeof st?.estimate === 'function') {
      try {
        const e = await st.estimate();
        this.usage = typeof e.usage === 'number' ? e.usage : null;
        this.quota = typeof e.quota === 'number' ? e.quota : null;
      } catch (err) {
        console.warn('[storage] estimate() failed', err);
      }
    }
    this.level = storageLevel(this.usage, this.quota);
    this.updateNotice();
  }

  /** "Dismiss": hidden until storage gets lower than it is now. */
  dismissNotice(): void {
    this.dismissal = { at: Date.now(), level: this.level };
    try { this.win?.localStorage.setItem(STORAGE_NOTICE_DISMISS_KEY, JSON.stringify(this.dismissal)); } catch { /* storage blocked: this session */ }
    this.updateNotice();
  }

  get noticeText(): string { return storageNoticeText(this.level); }
  /** "12.3 MB of 4.07 GB (0.3 %)", or ''. */
  get usageLabel(): string { return storageUsageLabel(this.usage, this.quota); }
  /** "yes" / "no" / "unknown" / "not supported". */
  get persistedLabel(): string {
    if (!this.supported) return 'not supported';
    return this.persisted === null ? 'unknown' : this.persisted ? 'yes' : 'no';
  }
  /** Running as an installed app (standalone / fullscreen window). */
  get installed(): boolean {
    try {
      return !!this.win?.matchMedia?.('(display-mode: standalone)').matches || !!this.win?.matchMedia?.('(display-mode: fullscreen)').matches;
    } catch { return false; }
  }

  private updateNotice(): void {
    this.noticeVisible = shouldShowStorageNotice({ supported: this.supported, persisted: this.persisted, level: this.level, dismissal: this.dismissal });
  }

  private readDismissal(): StorageNoticeDismissal | null {
    try { return parseDismissal(this.win?.localStorage.getItem(STORAGE_NOTICE_DISMISS_KEY)); } catch { return null; }
  }

  ngOnDestroy(): void {
    this.win?.removeEventListener('appinstalled', this.onInstalled);
    this.doc.removeEventListener('visibilitychange', this.onVisibility);
  }
}
