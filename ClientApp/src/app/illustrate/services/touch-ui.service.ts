import { Injectable, NgZone, OnDestroy } from '@angular/core';

/**
 * Is the PRIMARY pointer coarse (a finger: phone / tablet)? Drives the touch-only UI (mobile-parity spec, salsa
 * docs/specs/mobile-parity.md §4/§5): the Play touch overlay + entering Play without pointer-lock mouse-look
 * (TOUCH-4), the Navigate toggle in the 3D view bar, the floating "show UI" button (UI-1), the contextual Apply /
 * Cancel pill and the brush list auto-close (TOUCH-10). `(pointer: coarse)` is the primary input, so a touchscreen laptop with a mouse/trackpad stays desktop.
 * Follows the media query live (a tablet docked to a keyboard + trackpad flips it).
 */
@Injectable({ providedIn: 'root' })
export class TouchUiService implements OnDestroy {
  private readonly _mql: MediaQueryList | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
  private _coarse = !!this._mql?.matches;
  private readonly _onChange = (e: MediaQueryListEvent): void => { this.zone.run(() => { this._coarse = e.matches; }); };

  constructor(private zone: NgZone) {
    this._mql?.addEventListener?.('change', this._onChange);
  }

  /** True on a touch-first device (primary pointer is a finger). */
  get coarse(): boolean { return this._coarse; }

  ngOnDestroy(): void {
    this._mql?.removeEventListener?.('change', this._onChange);
  }
}
