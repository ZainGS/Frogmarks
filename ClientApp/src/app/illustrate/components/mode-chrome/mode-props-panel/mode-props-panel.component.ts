import { Component, DoCheck, EventEmitter, HostBinding, Input, OnDestroy, Output, inject } from '@angular/core';
import { SidePanelService } from '../../../services/side-panel.service';
import { MODE_CHROME_VARS } from '../mode-chrome.types';
import { releaseRootVar, setRootVar } from '../root-css-vars';

/** localStorage key: '1' = the mode properties panel is collapsed (docked layout; the drawer keeps a session state). */
export const MODE_PROPS_COLLAPSED_KEY = 'fm.modeProps.collapsed';
/** Panel width incl. its 4 px left border (the editor's right column: 280 + 4). */
export const MODE_PROPS_WIDTH_PX = 284;

/**
 * Right properties panel host for a mode (UI review 2026-10-07 §4 item 4): settings only, no verbs. Sits in the
 * editor's right-column slot (280 px + 4 px border, top = top bar + header bar, bottom = the timeline when
 * class="above-timeline"); the right column itself is hidden while a mode with the chrome is active.
 *
 * Collapsible with the handle on its left edge. Docked (desktop, tablet landscape): the state is remembered in
 * localStorage (fm.modeProps.collapsed). Touch + narrow (SidePanelService.drawerMode, tablet portrait / phone): it is an
 * overlay drawer like the editor's right column — open only when the canvas beside it stays roomy, session state.
 * Publishes --fm-modeprops-w (284px open, 0px collapsed) so the op pill / hint line keep clear of it.
 *
 * Content is projected; style it with the shared classes in styles/_mode-chrome.scss (.mode-props-section …).
 */
@Component({
  selector: 'app-mode-props-panel',
  templateUrl: './mode-props-panel.component.html',
  styleUrls: ['./mode-props-panel.component.scss'],
})
export class ModePropsPanelComponent implements DoCheck, OnDestroy {
  @Input() title = '';
  @HostBinding('attr.title') readonly hostTitle = null;
  /** Emitted when the user collapses (true) / expands (false) it. */
  @Output() collapsedChange = new EventEmitter<boolean>();

  private readonly sidePanel = inject(SidePanelService, { optional: true });
  private storedCollapsed = ModePropsPanelComponent.readStored();
  /** Drawer mode: open (session only). Default: open when the canvas beside it stays roomy. */
  private drawerOpen = typeof window === 'undefined' ? true
    : window.innerWidth - 70 - MODE_PROPS_WIDTH_PX >= SidePanelService.DRAWER_MIN_CANVAS_PX;
  private publishedW: string | null = null;

  get drawerMode(): boolean { return !!this.sidePanel?.drawerMode; }

  get collapsed(): boolean { return this.drawerMode ? !this.drawerOpen : this.storedCollapsed; }

  toggle(): void { this.setCollapsed(!this.collapsed); }

  setCollapsed(collapsed: boolean): void {
    if (collapsed === this.collapsed) return;
    if (this.drawerMode) this.drawerOpen = !collapsed;
    else {
      this.storedCollapsed = collapsed;
      try {
        if (collapsed) localStorage.setItem(MODE_PROPS_COLLAPSED_KEY, '1');
        else localStorage.removeItem(MODE_PROPS_COLLAPSED_KEY);
      } catch { /* storage blocked: the toggle still works for this session */ }
    }
    this.publishWidth();
    this.collapsedChange.emit(collapsed);
  }

  /** Every check: keep --fm-modeprops-w in step (the drawer mode follows the media query live). */
  ngDoCheck(): void { this.publishWidth(); }

  ngOnDestroy(): void { releaseRootVar(MODE_CHROME_VARS.propsW, this); }

  private publishWidth(): void {
    const w = this.collapsed ? '0px' : `${MODE_PROPS_WIDTH_PX}px`;
    if (w === this.publishedW) return;
    this.publishedW = w;
    setRootVar(MODE_CHROME_VARS.propsW, this, w);
  }

  static readStored(): boolean {
    try { return localStorage.getItem(MODE_PROPS_COLLAPSED_KEY) === '1'; } catch { return false; }
  }
}
