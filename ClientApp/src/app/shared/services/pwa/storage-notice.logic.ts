/**
 * Pure rules of the "this device may clear your work" notice (StoragePersistenceService). Specs:
 * storage-notice.logic.spec.ts.
 *
 * Local documents live in OPFS / IndexedDB. Without persistent storage (navigator.storage.persist(), granted by
 * Chrome's own heuristics: installed app, engagement, … there is no prompt) the browser may evict them when the device
 * runs low on space. The notice says so once; after "Dismiss" it comes back only when storage gets low (or lower).
 */

/** 0 = fine, 1 = low, 2 = critical. */
export type StorageLevel = 0 | 1 | 2;

/** Used / quota from navigator.storage.estimate() at or above these fractions: low / critical. */
export const STORAGE_LOW_RATIO = 0.8;
export const STORAGE_CRITICAL_RATIO = 0.95;
/** …or less than this much room left under the quota: low (critical below a quarter of it). */
export const STORAGE_LOW_FREE_BYTES = 512 * 1024 * 1024;

export function storageLevel(usage: number | null, quota: number | null): StorageLevel {
  if (usage == null || quota == null || !(quota > 0)) return 0;
  const ratio = usage / quota;
  const free = quota - usage;
  if (ratio >= STORAGE_CRITICAL_RATIO || free < STORAGE_LOW_FREE_BYTES / 4) return 2;
  if (ratio >= STORAGE_LOW_RATIO || free < STORAGE_LOW_FREE_BYTES) return 1;
  return 0;
}

/** What "Dismiss" remembers (localStorage, per device). */
export interface StorageNoticeDismissal {
  /** ms since epoch */
  at: number;
  /** The storage level when it was dismissed: the notice returns only above it. */
  level: StorageLevel;
}

export const STORAGE_NOTICE_DISMISS_KEY = 'fm-storage-notice-dismissed';

export function parseDismissal(raw: string | null | undefined): StorageNoticeDismissal | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StorageNoticeDismissal>;
    const level = v?.level === 1 || v?.level === 2 ? v.level : 0;
    return typeof v?.at === 'number' ? { at: v.at, level } : null;
  } catch {
    return null;
  }
}

export interface StorageNoticeInput {
  /** navigator.storage.persist / persisted exist. */
  supported: boolean;
  /** null = not known yet. */
  persisted: boolean | null;
  level: StorageLevel;
  dismissal: StorageNoticeDismissal | null;
}

/** Show it when storage is known NOT to be persistent, and either it was never dismissed or storage got lower since. */
export function shouldShowStorageNotice(s: StorageNoticeInput): boolean {
  if (!s.supported || s.persisted !== false) return false;
  if (!s.dismissal) return true;
  return s.level > s.dismissal.level;
}

/** The notice text. Local-first: there is no cloud copy to fall back on. */
export function storageNoticeText(level: StorageLevel): string {
  const lead = level >= 1
    ? 'Storage on this device is running low, and the browser may clear locally saved work.'
    : 'This device may clear locally saved work when storage runs low.';
  return `${lead} Install Frogmarks to keep it, and export a backup of important work (File › Save .frogmarks…).`;
}

/** "512 KB", "12.3 MB", "4.07 GB". */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const digits = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

/** "12.3 MB of 4.07 GB (0.3 %)", or '' when unknown. */
export function storageUsageLabel(usage: number | null, quota: number | null): string {
  if (usage == null || quota == null || !(quota > 0)) return '';
  const pct = (100 * usage) / quota;
  return `${formatBytes(usage)} of ${formatBytes(quota)} (${pct < 1 ? pct.toFixed(1) : Math.round(pct)} %)`;
}
