import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, NgZone, OnDestroy } from '@angular/core';

/** localStorage key: 'auto' (or absent) = Auto; '0'..'48' = a fixed radius in CSS px. Per device, never in documents. */
export const SCREEN_CORNER_STORAGE_KEY = 'fm-screen-corner-radius';
/** The CSS variable on :root holding the radius in effect right now ('0px' outside fullscreen). */
export const SCREEN_CORNER_CSS_VAR = '--fm-screen-corner-radius';
/** Class on <html> while the radius in effect is above 0. Every rounded-corner rule is gated on it, so at 0 the
 *  stylesheet is exactly what it was before this setting existed. */
export const SCREEN_CORNER_ROOT_CLASS = 'fm-screen-corners';
export const SCREEN_CORNER_MAX_PX = 48;
/** What Auto means on a touch-first device (primary pointer coarse: phone / tablet). Desktop Auto = 0. */
export const SCREEN_CORNER_AUTO_TOUCH_PX = 24;

export type ScreenCornerSetting = 'auto' | number;

/** A stored value back to a setting: anything that is not a number reads as Auto; numbers are clamped to 0..48. */
export function parseScreenCornerSetting(raw: string | null | undefined): ScreenCornerSetting {
  if (raw == null || raw.trim() === '' || raw === 'auto') return 'auto';
  const n = Number(raw);
  return Number.isFinite(n) ? clampScreenCornerPx(n) : 'auto';
}

export function clampScreenCornerPx(n: number): number {
  return Math.min(SCREEN_CORNER_MAX_PX, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));
}

/** The radius the setting asks for on this device, ignoring fullscreen. */
export function resolveScreenCornerPx(setting: ScreenCornerSetting, coarsePointer: boolean): number {
  return setting === 'auto' ? (coarsePointer ? SCREEN_CORNER_AUTO_TOUCH_PX : 0) : clampScreenCornerPx(setting);
}

/** The radius to draw: the app's corners only meet the screen's corners in fullscreen (or an installed fullscreen /
 *  standalone PWA), so anywhere else it is 0. */
export function effectiveScreenCornerPx(setting: ScreenCornerSetting, coarsePointer: boolean, edgeToEdge: boolean): number {
  return edgeToEdge ? resolveScreenCornerPx(setting, coarsePointer) : 0;
}

type FsDocument = Document & { webkitFullscreenElement?: Element | null };

/**
 * View › Screen corner radius. A tablet in fullscreen has rounded physical corners that clip the app's square ones
 * (the green screen-edge border's bottom-right, the tool rail's top-left). This rounds exactly those two corners by the
 * chosen radius while the app is edge to edge, through `--fm-screen-corner-radius` + the `fm-screen-corners` class on
 * <html> (styles: src/screen-corners.scss). The radius is re-applied on a setting change, fullscreenchange, and a
 * display-mode / pointer media change. It only writes the DOM, so its listeners run outside Angular.
 */
@Injectable({ providedIn: 'root' })
export class ScreenCornerService implements OnDestroy {
  private readonly win: (Window & typeof globalThis) | null;
  private readonly coarseMql: MediaQueryList | null;
  private readonly displayMqls: MediaQueryList[];
  private _setting: ScreenCornerSetting;
  private _effective = -1;
  private readonly onChange = (): void => this.apply();

  constructor(@Inject(DOCUMENT) private readonly doc: Document, zone: NgZone) {
    this.win = doc.defaultView as (Window & typeof globalThis) | null;
    const mm = (q: string): MediaQueryList | null => {
      try { return typeof this.win?.matchMedia === 'function' ? this.win.matchMedia(q) : null; } catch { return null; }
    };
    this.coarseMql = mm('(pointer: coarse)');
    this.displayMqls = [mm('(display-mode: fullscreen)'), mm('(display-mode: standalone)')].filter((m): m is MediaQueryList => !!m);
    this._setting = this.read();
    zone.runOutsideAngular(() => {
      doc.addEventListener('fullscreenchange', this.onChange);
      doc.addEventListener('webkitfullscreenchange', this.onChange);
      for (const m of [this.coarseMql, ...this.displayMqls]) m?.addEventListener?.('change', this.onChange);
    });
    this.apply();
  }

  /** 'auto' or the fixed radius in px. */
  get setting(): ScreenCornerSetting { return this._setting; }
  get isAuto(): boolean { return this._setting === 'auto'; }
  /** What the slider shows: the fixed value, or what Auto resolves to on this device. */
  get sliderPx(): number { return resolveScreenCornerPx(this._setting, this.coarse); }
  /** The radius drawn right now (0 outside fullscreen). */
  get effectivePx(): number { return Math.max(0, this._effective); }
  get coarse(): boolean { return !!this.coarseMql?.matches; }

  /** Fullscreen API element, or an installed PWA in fullscreen / standalone display mode. */
  get edgeToEdge(): boolean {
    const d = this.doc as FsDocument;
    return !!(d.fullscreenElement || d.webkitFullscreenElement) || this.displayMqls.some((m) => m.matches);
  }

  setAuto(): void { this.set('auto'); }
  setPx(px: number): void { this.set(clampScreenCornerPx(px)); }

  set(setting: ScreenCornerSetting): void {
    this._setting = setting === 'auto' ? 'auto' : clampScreenCornerPx(setting);
    try { this.win?.localStorage.setItem(SCREEN_CORNER_STORAGE_KEY, String(this._setting)); } catch { /* storage blocked: works for this session */ }
    this.apply();
  }

  /** Writes the radius in effect to :root. Called on every change source; cheap when nothing changed. */
  apply(): void {
    const px = effectiveScreenCornerPx(this._setting, this.coarse, this.edgeToEdge);
    if (px === this._effective) return;
    this._effective = px;
    const root = this.doc.documentElement;
    root.style.setProperty(SCREEN_CORNER_CSS_VAR, `${px}px`);
    root.classList.toggle(SCREEN_CORNER_ROOT_CLASS, px > 0);
  }

  ngOnDestroy(): void {
    this.doc.removeEventListener('fullscreenchange', this.onChange);
    this.doc.removeEventListener('webkitfullscreenchange', this.onChange);
    for (const m of [this.coarseMql, ...this.displayMqls]) m?.removeEventListener?.('change', this.onChange);
  }

  private read(): ScreenCornerSetting {
    try { return parseScreenCornerSetting(this.win?.localStorage.getItem(SCREEN_CORNER_STORAGE_KEY)); } catch { return 'auto'; }
  }
}
