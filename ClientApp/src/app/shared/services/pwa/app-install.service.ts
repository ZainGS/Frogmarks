import { Injectable } from '@angular/core';
import {
  BeforeInstallPromptEventLike, installInstructions, installPlatform, installState, InstallPlatform, InstallState,
} from './app-install.logic';

// `beforeinstallprompt` fires once, early (often before any component exists), so it is caught when this module is
// first evaluated — the Shell (StudioComponent, in the main bundle) imports it. The event is only kept, not
// prevented: the browser's own install UI stays as it was; Settings › Install app calls prompt() on it later.
let deferredPrompt: BeforeInstallPromptEventLike | null = null;
let installedThisSession = false;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeinstallprompt', (e) => { deferredPrompt = e as BeforeInstallPromptEventLike; });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; installedThisSession = true; });
}

/** Settings › Install app: the browser's install prompt when it offered one, else the steps for this browser. */
@Injectable({ providedIn: 'root' })
export class AppInstallService {
  /** prompt() is running (the button is disabled meanwhile). */
  prompting = false;

  /** Running as the installed app (standalone / fullscreen window), or installed a moment ago. */
  get installed(): boolean {
    if (installedThisSession) return true;
    try {
      return !!window.matchMedia?.('(display-mode: standalone)').matches
        || !!window.matchMedia?.('(display-mode: fullscreen)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;   // iOS home-screen app
    } catch { return false; }
  }

  /** The browser handed us an install prompt (Chromium, when the app is installable and not installed). */
  get canPrompt(): boolean { return !!deferredPrompt; }

  get state(): InstallState { return installState({ installed: this.installed, canPrompt: this.canPrompt }); }

  get platform(): InstallPlatform {
    try { return installPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0); } catch { return 'other'; }
  }

  get instructions(): string { return installInstructions(this.platform); }

  /** Show the browser's install prompt (must run in a click). The event can be used once: it is dropped after. */
  async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const ev = deferredPrompt;
    if (!ev || this.prompting) return 'unavailable';
    this.prompting = true;
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      deferredPrompt = null;
      if (choice.outcome === 'accepted') installedThisSession = true;
      return choice.outcome;
    } catch (err) {
      console.warn('[install] prompt failed', err);
      deferredPrompt = null;
      return 'unavailable';
    } finally {
      this.prompting = false;
    }
  }
}
