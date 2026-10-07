/**
 * The Shell's GPU device-lost banner (UI review 2026-10-07 §1 #8: after a device loss the Shell stayed black for good,
 * with no message). Same states + words as the editor's banner (EngineStatusService): 'recovering' while the engine
 * gets a new device, 'recovered' briefly after (the Shell scene is then rebuilt on the new device), 'failed' with
 * Retry / Reload. Pure: StudioComponent feeds it Salsa's sm.onDeviceStatusChange infos.
 */

export type ShellDeviceBanner = null | 'recovering' | 'recovered' | 'failed';

export interface ShellDeviceStatusLike {
  status?: string;
  message?: string | null;
  unrecovered?: string[];
}

export interface ShellDeviceBannerStep {
  banner: ShellDeviceBanner;
  /** What the recovery couldn't bring back ('recovered'), or why it failed ('failed'). */
  detail: string[];
  /** The device came back: rebuild the Shell scene (its GPU objects belonged to the lost device). */
  remount: boolean;
  /** Hide the banner after this many ms (0 = keep it). */
  autoHideMs: number;
}

/** The next banner state for a status info, or null = no change (keep the banner + its detail as they are). */
export function nextShellDeviceBanner(prev: ShellDeviceBanner, info: ShellDeviceStatusLike | null | undefined): ShellDeviceBannerStep | null {
  const st = info?.status;
  if (st === 'lost' || st === 'recovering') return { banner: 'recovering', detail: [], remount: false, autoHideMs: 0 };
  if (st === 'failed' || st === 'unavailable') {
    return { banner: 'failed', detail: info?.message ? [String(info.message)] : [], remount: false, autoHideMs: 0 };
  }
  if (st === 'ok' && (prev === 'recovering' || prev === 'failed')) {
    const u = info?.unrecovered;
    const detail = Array.isArray(u) ? u.map(String) : [];
    return { banner: 'recovered', detail, remount: true, autoHideMs: detail.length ? 8000 : 2500 };
  }
  // 'ok' with no loss seen (or a repeat), 'initializing', unknown: leave the banner as it is.
  return null;
}
