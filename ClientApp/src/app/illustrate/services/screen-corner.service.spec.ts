import { NgZone } from '@angular/core';
import {
  SCREEN_CORNER_CSS_VAR, SCREEN_CORNER_ROOT_CLASS, SCREEN_CORNER_STORAGE_KEY, ScreenCornerService,
  effectiveScreenCornerPx, parseScreenCornerSetting, resolveScreenCornerPx,
} from './screen-corner.service';

/** A media query whose `matches` the test flips, firing its change listeners like the browser does. */
class FakeMql {
  private listeners: Array<() => void> = [];
  constructor(public matches: boolean) {}
  addEventListener(_t: string, fn: () => void): void { this.listeners.push(fn); }
  removeEventListener(_t: string, fn: () => void): void { this.listeners = this.listeners.filter((l) => l !== fn); }
  set(m: boolean): void { this.matches = m; this.listeners.forEach((l) => l()); }
}

/** A stand-in document: real <html>-like element for the CSS variable / class, fake fullscreen + media queries. */
function makeEnv(opts: { coarse?: boolean; fullscreen?: boolean; standalone?: boolean } = {}) {
  const root = document.createElement('div');
  const mqls: Record<string, FakeMql> = {
    '(pointer: coarse)': new FakeMql(!!opts.coarse),
    '(display-mode: fullscreen)': new FakeMql(false),
    '(display-mode: standalone)': new FakeMql(!!opts.standalone),
  };
  const docListeners: Record<string, Array<() => void>> = {};
  const doc = {
    documentElement: root,
    fullscreenElement: opts.fullscreen ? root : null,
    defaultView: { matchMedia: (q: string) => mqls[q], localStorage },
    addEventListener: (t: string, fn: () => void) => { (docListeners[t] ??= []).push(fn); },
    removeEventListener: (t: string, fn: () => void) => { docListeners[t] = (docListeners[t] ?? []).filter((l) => l !== fn); },
  };
  const zone = { runOutsideAngular: <T>(fn: () => T): T => fn() } as unknown as NgZone;
  const make = () => new ScreenCornerService(doc as unknown as Document, zone);
  const setFullscreen = (on: boolean) => {
    doc.fullscreenElement = on ? root : null;
    (docListeners['fullscreenchange'] ?? []).forEach((l) => l());
  };
  const cssPx = () => root.style.getPropertyValue(SCREEN_CORNER_CSS_VAR);
  const hasClass = () => root.classList.contains(SCREEN_CORNER_ROOT_CLASS);
  return { root, mqls, make, setFullscreen, cssPx, hasClass, docListeners };
}

describe('Screen corner radius: setting logic', () => {
  it('parses stored values: absent / auto / junk = Auto, numbers clamped to 0..48 and rounded', () => {
    expect(parseScreenCornerSetting(null)).toBe('auto');
    expect(parseScreenCornerSetting('auto')).toBe('auto');
    expect(parseScreenCornerSetting('wide')).toBe('auto');
    expect(parseScreenCornerSetting('')).toBe('auto');
    expect(parseScreenCornerSetting('0')).toBe(0);
    expect(parseScreenCornerSetting('17.6')).toBe(18);
    expect(parseScreenCornerSetting('99')).toBe(48);
    expect(parseScreenCornerSetting('-5')).toBe(0);
  });

  it('Auto = 0 on desktop, 24 on a touch device; a number is used as is', () => {
    expect(resolveScreenCornerPx('auto', false)).toBe(0);
    expect(resolveScreenCornerPx('auto', true)).toBe(24);
    expect(resolveScreenCornerPx(12, false)).toBe(12);
    expect(resolveScreenCornerPx(12, true)).toBe(12);
  });

  it('is 0 unless the app is edge to edge (fullscreen / installed PWA)', () => {
    expect(effectiveScreenCornerPx('auto', true, false)).toBe(0);
    expect(effectiveScreenCornerPx(30, false, false)).toBe(0);
    expect(effectiveScreenCornerPx('auto', true, true)).toBe(24);
    expect(effectiveScreenCornerPx(30, false, true)).toBe(30);
  });
});

describe('ScreenCornerService', () => {
  let saved: string | null;
  beforeEach(() => { saved = localStorage.getItem(SCREEN_CORNER_STORAGE_KEY); localStorage.removeItem(SCREEN_CORNER_STORAGE_KEY); });
  afterEach(() => {
    if (saved === null) localStorage.removeItem(SCREEN_CORNER_STORAGE_KEY);
    else localStorage.setItem(SCREEN_CORNER_STORAGE_KEY, saved);
  });

  it('defaults to Auto and writes 0px (no class) outside fullscreen, even on a tablet', () => {
    const env = makeEnv({ coarse: true });
    const s = env.make();
    expect(s.isAuto).toBeTrue();
    expect(s.sliderPx).toBe(24);
    expect(s.effectivePx).toBe(0);
    expect(env.cssPx()).toBe('0px');
    expect(env.hasClass()).toBeFalse();
  });

  it('follows fullscreenchange: on a tablet Auto rounds to 24px in fullscreen and back to 0 on exit', () => {
    const env = makeEnv({ coarse: true });
    const s = env.make();
    env.setFullscreen(true);
    expect(s.effectivePx).toBe(24);
    expect(env.cssPx()).toBe('24px');
    expect(env.hasClass()).toBeTrue();
    env.setFullscreen(false);
    expect(env.cssPx()).toBe('0px');
    expect(env.hasClass()).toBeFalse();
  });

  it('Auto stays square on a desktop in fullscreen; a fixed value applies there live', () => {
    const env = makeEnv({ fullscreen: true });
    const s = env.make();
    expect(env.cssPx()).toBe('0px');
    expect(env.hasClass()).toBeFalse();
    s.setPx(36);
    expect(env.cssPx()).toBe('36px');
    expect(env.hasClass()).toBeTrue();
    s.setPx(0);
    expect(env.cssPx()).toBe('0px');
    expect(env.hasClass()).toBeFalse();
  });

  it('counts an installed PWA in standalone / fullscreen display mode as edge to edge, live', () => {
    const env = makeEnv({ coarse: true, standalone: true });
    env.make();
    expect(env.cssPx()).toBe('24px');
    env.mqls['(display-mode: standalone)'].set(false);
    expect(env.cssPx()).toBe('0px');
    env.mqls['(display-mode: fullscreen)'].set(true);
    expect(env.cssPx()).toBe('24px');
    env.mqls['(pointer: coarse)'].set(false);   // docked to a trackpad: Auto turns desktop
    expect(env.cssPx()).toBe('0px');
  });

  it('persists per device and reads it back in a new session; Auto is stored as "auto"', () => {
    const env = makeEnv({ fullscreen: true });
    const a = env.make();
    a.setPx(60);
    expect(a.setting).toBe(48);
    expect(localStorage.getItem(SCREEN_CORNER_STORAGE_KEY)).toBe('48');
    const b = env.make();
    expect(b.setting).toBe(48);
    expect(env.cssPx()).toBe('48px');
    b.setAuto();
    expect(localStorage.getItem(SCREEN_CORNER_STORAGE_KEY)).toBe('auto');
    expect(env.make().isAuto).toBeTrue();
  });

  it('keeps working when storage throws', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    const env = makeEnv({ fullscreen: true });
    const s = env.make();
    expect(s.isAuto).toBeTrue();
    expect(() => s.setPx(20)).not.toThrow();
    expect(env.cssPx()).toBe('20px');
  });

  it('removes its listeners on destroy', () => {
    const env = makeEnv({ coarse: true });
    const s = env.make();
    s.ngOnDestroy();
    expect(env.docListeners['fullscreenchange'].length).toBe(0);
    env.setFullscreen(true);
    expect(env.cssPx()).toBe('0px');
  });
});
