import { Injectable } from '@angular/core';

/** localStorage key: '1' = the edit-mode focus backgrounds' wavy themes animate; absent / anything else = frozen (the
 *  default: a still frame, so the backdrop never holds the render loop live). */
export const FOCUS_BG_ANIMATE_STORAGE_KEY = 'fm-focus-bg-animate';

/** The engine's ONE switch for every focus background (Salsa ShapeManager.setFocusBgAnimate3D: Edit Mesh, Armature,
 *  UV, the package creator stage). Absent on an older Salsa build (there the wavy theme always animates). */
export interface FocusBgAnimateEngine { setFocusBgAnimate3D?(on: boolean | null): void }

/**
 * View › Toggle Animations: the Wavy / Wavy Sage focus background behind Edit Mesh, Armature, UV and the package
 * creator stage animates, or is drawn frozen — the same in every mode. Remembered on this device. The editor's
 * menubar applies it to each ShapeManager it sees (apply), so it holds from the first frame of any mode.
 */
@Injectable({ providedIn: 'root' })
export class FocusBgAnimationService {
  private _on = FocusBgAnimationService.read();

  /** The wavy backgrounds animate. */
  get on(): boolean { return this._on; }

  /** This engine build has the switch (an older one: the menu item is greyed out). */
  supported(sm: unknown): boolean {
    return typeof (sm as FocusBgAnimateEngine | null | undefined)?.setFocusBgAnimate3D === 'function';
  }

  toggle(sm?: unknown): void { this.set(!this._on, sm); }

  set(on: boolean, sm?: unknown): void {
    this._on = on;
    try { localStorage.setItem(FOCUS_BG_ANIMATE_STORAGE_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
    this.apply(sm);
  }

  /** Push the setting into an engine (no-op on an older Salsa build). Returns whether it was applied. */
  apply(sm: unknown): boolean {
    const f = (sm as FocusBgAnimateEngine | null | undefined)?.setFocusBgAnimate3D;
    if (typeof f !== 'function') return false;
    try { f.call(sm, this._on); return true; } catch { return false; }
  }

  private static read(): boolean {
    try { return localStorage.getItem(FOCUS_BG_ANIMATE_STORAGE_KEY) === '1'; } catch { return false; }
  }
}
