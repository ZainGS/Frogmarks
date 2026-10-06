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

  get visible(): boolean { return this._visible; }

  /** View › Zoom Controls: the floating zoom box (remembered per machine). Pinch / wheel zoom keep working. */
  get zoomControlsVisible(): boolean { return this._zoomControls; }
  toggleZoomControls(): void {
    this._zoomControls = !this._zoomControls;
    try {
      if (this._zoomControls) localStorage.removeItem(ZOOM_CONTROLS_STORAGE_KEY);
      else localStorage.setItem(ZOOM_CONTROLS_STORAGE_KEY, '0');
    } catch { /* storage blocked: the toggle still works for this session */ }
  }

  toggle(): void { this.set(!this._visible); }
  show(): void { this.set(true); }

  set(visible: boolean): void {
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
