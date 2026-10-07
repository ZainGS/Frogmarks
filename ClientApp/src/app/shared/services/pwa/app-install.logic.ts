/**
 * "Install app" (UI review 2026-10-07 §3 #23): the storage notice says "Install Frogmarks", so Settings offers a way
 * to do it — the browser's own install prompt where there is one (Chromium's `beforeinstallprompt`), otherwise the
 * steps for this browser. Pure helpers; AppInstallService holds the captured event.
 */

/** Chromium's `beforeinstallprompt` event (not in the DOM typings). */
export interface BeforeInstallPromptEventLike extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export type InstallPlatform =
  | 'ios'               // iPhone / iPad (any browser: they all install through Safari's Share sheet)
  | 'android'           // Chrome / Samsung Internet / Edge on Android
  | 'firefox-android'
  | 'desktop-chromium'  // Chrome / Edge / Opera on a computer
  | 'safari-mac'
  | 'firefox'           // Firefox on a computer: no web-app install
  | 'other';

/** Which install steps fit this browser. `maxTouchPoints` tells an iPad (which reports a Mac user agent) apart. */
export function installPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return /Firefox\//i.test(ua) ? 'firefox-android' : 'android';
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/Edg\/|OPR\/|Chrome\/|Chromium\//i.test(ua)) return 'desktop-chromium';
  if (/Macintosh/i.test(ua) && /Safari\//i.test(ua)) return 'safari-mac';
  return 'other';
}

/** The manual steps for a platform (shown when the browser gives no install prompt to call). */
export function installInstructions(p: InstallPlatform): string {
  switch (p) {
    case 'ios': return 'Open Frogmarks in Safari, tap the Share button, then "Add to Home Screen".';
    case 'android': return 'Open the browser menu (⋮), then "Install app" or "Add to Home screen".';
    case 'firefox-android': return 'Open the Firefox menu (⋮), then "Install" or "Add to Home screen".';
    case 'desktop-chromium': return 'Click the install icon at the right end of the address bar, or open the browser menu and choose "Install Frogmarks" (in Edge: Apps › Install this site as an app).';
    case 'safari-mac': return 'In Safari, choose File › Add to Dock.';
    case 'firefox': return 'Firefox can\'t install web apps on a computer. Open Frogmarks in Chrome, Edge or Safari to install it.';
    default: return 'Use your browser\'s menu to install this site as an app, or add it to your home screen.';
  }
}

/** What the Settings "Install app" section shows. */
export type InstallState = 'installed' | 'prompt' | 'instructions';

export function installState(s: { installed: boolean; canPrompt: boolean }): InstallState {
  if (s.installed) return 'installed';
  return s.canPrompt ? 'prompt' : 'instructions';
}
