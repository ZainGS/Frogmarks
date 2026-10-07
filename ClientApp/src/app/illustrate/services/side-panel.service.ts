import { Injectable } from '@angular/core';

/** localStorage key: '0' = the right panel column is hidden; absent / anything else = shown (the default). */
export const SIDE_PANEL_STORAGE_KEY = 'fm-side-panel-visible';
/** localStorage key: '0' = the zoom control box (percent, − / +, Fit) is hidden; absent = shown (the default). */
export const ZOOM_CONTROLS_STORAGE_KEY = 'fm-zoom-controls-visible';

/**
 * View › Side Panel: shows / hides the editor's right panel column (Scene / Global / UI tabs + Layers, or the CD
 * designer panel that replaces them). Remembered per machine (localStorage), so a tablet can keep it folded away
 * while the desktop keeps it open. Hiding only takes the column out of the layout (display: none); every panel inside
 * stays mounted, so code that updates or "opens" a panel while it is hidden keeps working and the panel is simply not
 * shown until the column is turned back on. The one exception is a mode whose only exit lives in that column (the
 * CD designer): the editor calls show() when it starts one.
 */
@Injectable({ providedIn: 'root' })
export class SidePanelService {
  private _visible = SidePanelService.read();

  private _zoomControls = SidePanelService.readKey(ZOOM_CONTROLS_STORAGE_KEY);

  /** Touch screens narrower than this (tablet portrait, phones) get the column as an overlay DRAWER (ui-review
   *  2026-10-07 #10): a handle on the right edge opens / closes it, so the artboard can have the whole width. */
  static readonly DRAWER_QUERY = '(pointer: coarse) and (max-width: 1023.98px)';
  /** The drawer starts closed when, with it open, less than this many CSS px of canvas would be left beside it
   *  (viewport − 70 px rail − 284 px column). */
  static readonly DRAWER_MIN_CANVAS_PX = 560;

  private _drawerMode = false;
  private _drawerOpen = false;

  constructor() {
    try {
      const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(SidePanelService.DRAWER_QUERY) : null;
      if (mq) {
        this.updateDrawerMode(mq.matches, window.innerWidth);
        mq.addEventListener?.('change', e => this.updateDrawerMode(e.matches, window.innerWidth));
      }
    } catch { /* no matchMedia: always the docked column */ }
  }

  /** The column is on screen. In drawer mode: the drawer is open (a session state, not the stored preference). */
  get visible(): boolean { return this._drawerMode ? this._drawerOpen : this._visible; }

  /** The column is an overlay drawer with a handle (touch, narrow). */
  get drawerMode(): boolean { return this._drawerMode; }

  /** Enter / leave drawer mode (the media query changed: rotation, resize). Entering picks the default: open only
   *  when the canvas beside it would still be roomy. Leaving restores the docked column's stored preference. */
  updateDrawerMode(isDrawer: boolean, viewportWidth: number): void {
    if (isDrawer === this._drawerMode) return;
    this._drawerMode = isDrawer;
    if (isDrawer) this._drawerOpen = this._visible && viewportWidth - 70 - 284 >= SidePanelService.DRAWER_MIN_CANVAS_PX;
  }

  /** View › Zoom Controls: the floating zoom box (remembered per machine). Pinch / wheel zoom keep working. */
  get zoomControlsVisible(): boolean { return this._zoomControls; }
  toggleZoomControls(): void {
    this._zoomControls = !this._zoomControls;
    try {
      if (this._zoomControls) localStorage.removeItem(ZOOM_CONTROLS_STORAGE_KEY);
      else localStorage.setItem(ZOOM_CONTROLS_STORAGE_KEY, '0');
    } catch { /* storage blocked: the toggle still works for this session */ }
  }

  toggle(): void { this.set(!this.visible); }
  show(): void { this.set(true); }

  set(visible: boolean): void {
    if (this._drawerMode) { this._drawerOpen = visible; return; }   // open / close the drawer; the stored choice stays
    this._visible = visible;
    try {
      if (visible) localStorage.removeItem(SIDE_PANEL_STORAGE_KEY);
      else localStorage.setItem(SIDE_PANEL_STORAGE_KEY, '0');
    } catch { /* storage blocked (private mode): the toggle still works for this session */ }
  }

  private static read(): boolean { return SidePanelService.readKey(SIDE_PANEL_STORAGE_KEY); }

  private static readKey(key: string): boolean {
    try { return localStorage.getItem(key) !== '0'; } catch { return true; }
  }
}
