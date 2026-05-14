import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SkinInspectorService {
  private _hoverZone  = new BehaviorSubject<string | null>(null);
  private _clickedZone = new Subject<string>();
  private _hoverToken = new BehaviorSubject<string | null>(null);
  private _popupPreview   = new BehaviorSubject<boolean>(false);
  private _galleryPreview = new BehaviorSubject<'hover' | 'selected' | null>(null);
  private _iconClicked    = new Subject<string>();
  private _iconsGroupActive = new BehaviorSubject<boolean>(false);

  readonly dashboardZone$  = this._hoverZone.asObservable();
  readonly zoneClicked$    = this._clickedZone.asObservable();
  readonly hoveredToken$   = this._hoverToken.asObservable();
  readonly popupPreview$   = this._popupPreview.asObservable();
  readonly galleryPreview$ = this._galleryPreview.asObservable();
  readonly iconClicked$    = this._iconClicked.asObservable();

  get isIconsGroupActive(): boolean { return this._iconsGroupActive.value; }

  private _ctrlDown = (e: KeyboardEvent) => {
    if (e.key === 'Control' && !e.repeat) document.body.classList.add('sb-inspecting-paused');
  };
  private _ctrlUp = (e: KeyboardEvent) => {
    if (e.key === 'Control') document.body.classList.remove('sb-inspecting-paused');
  };

  openPanel(): void {
    document.body.classList.add('sb-inspecting');
    document.addEventListener('keydown', this._ctrlDown);
    document.addEventListener('keyup', this._ctrlUp);
  }

  closePanel(): void {
    document.body.classList.remove('sb-inspecting');
    document.body.classList.remove('sb-inspecting-paused');
    document.removeEventListener('keydown', this._ctrlDown);
    document.removeEventListener('keyup', this._ctrlUp);
    this._applyZoneActive(null);
    this._applyTokenActive(null);
    this._applyIconActive(null);
    this._applyTokenPreview(null);
    this._hoverZone.next(null);
    this._hoverToken.next(null);
    this._popupPreview.next(false);
    this._galleryPreview.next(null);
    this._iconsGroupActive.next(false);
  }

  /** Dashboard hover — highlights zone + tab, no group switch. */
  setZoneFromDashboard(zone: string | null): void {
    this._applyZoneActive(zone);
    this._hoverZone.next(zone);
  }

  /** Dashboard click — activates group in editor. */
  clickZoneFromDashboard(zone: string): void { this._clickedZone.next(zone); }

  /** Dashboard element hover — highlights token row in editor. */
  setTokenFromDashboard(token: string | null): void { this._hoverToken.next(token); }

  /** Editor tab hover — highlights matching dashboard zone. */
  setZoneFromEditor(zone: string | null): void { this._applyZoneActive(zone); }

  /** Editor token row hover — highlights matching dashboard elements + previews interactive states. */
  setTokenFromEditor(token: string | null): void {
    this._applyTokenActive(token);
    this._applyTokenPreview(token);
  }

  /** Skin builder group 7 (Popup Card) activated → dashboard opens first item overlay. */
  setPopupPreview(active: boolean): void { this._popupPreview.next(active); }

  /** Set whether the Icons section is currently active in the skin builder. */
  setIconsGroupActive(active: boolean): void { this._iconsGroupActive.next(active); }

  /** Dashboard icon clicked while Icons section active → opens file picker for that slot. */
  clickIconFromDashboard(name: string): void { this._iconClicked.next(name); }

  /** Editor icon row hover → highlights matching dashboard icon element. */
  setIconFromEditor(name: string | null): void { this._applyIconActive(name); }

  private _applyZoneActive(zone: string | null): void {
    document.querySelectorAll<HTMLElement>('[data-fm-active]')
      .forEach(el => el.removeAttribute('data-fm-active'));
    if (zone) {
      document.querySelectorAll<HTMLElement>(`[data-fm-zone="${zone}"]`)
        .forEach(el => el.setAttribute('data-fm-active', ''));
    }
  }

  private _applyTokenActive(token: string | null): void {
    document.querySelectorAll<HTMLElement>('[data-fm-token-active]')
      .forEach(el => el.removeAttribute('data-fm-token-active'));
    if (token) {
      document.querySelectorAll<HTMLElement>(`[data-fm-token="${token}"]`)
        .forEach(el => el.setAttribute('data-fm-token-active', ''));
      this._applySpecialActive(token);
    }
  }

  /** Extra DOM elements to highlight for tokens that don't map to a single data-fm-token element. */
  private _applySpecialActive(token: string): void {
    const mark = (sel: string) =>
      document.querySelectorAll<HTMLElement>(sel)
        .forEach(el => el.setAttribute('data-fm-token-active', ''));

    switch (token) {
      // Search — placeholder can't sit on <input>, highlight the wrapper instead
      case '--fm-search-placeholder':
        mark('.search-wrapper'); break;

      // Chip text — highlight the chip elements by their active/inactive class
      case '--fm-chip-selected-text':
        mark('.selected-chip'); break;
      case '--fm-chip-unselected-text':
        mark('.unselected-chip'); break;

      // Popup primary button text
      case '--fm-popup-primary-btn-text':
        mark('.primary-btn'); break;

      // Popup icon-button icon color — fm-icon inside each icon-btn
      case '--fm-popup-icon-btn-icon':
        mark('.menu-card .icon-btn fm-icon'); break;

      // Popup glow → highlight the whole card wrapper
      case '--fm-popup-glow-color':
      case '--fm-popup-glow-size':
        mark('.menu-wrapper'); break;

      // Border runner controls → highlight the runner container
      case '--fm-popup-border-sprite-size':
      case '--fm-popup-border-sprite-spacing':
      case '--fm-popup-border-speed':
      case '--fm-popup-border-animate':
      case '--fm-popup-border-outer':
        mark('.border-runner, .menu-wrapper'); break;

      // ── Image slot tokens — each maps to its real DOM target(s) ─────────────
      case '--fm-app-bg-image':
        mark('.dashboard-container'); break;
      case '--fm-sidebar-bg-image':
        mark('.base-sidenav-column'); break;
      case '--fm-nav-item-hover-bg-image':
      case '--fm-nav-item-active-bg-image':
        mark('.list-item'); break;
      case '--fm-action-card-bg-image':
      case '--fm-action-card-border-image':
        mark('.new-design-item-container'); break;
      case '--fm-search-bg-image':
        mark('.search-bar'); break;
      case '--fm-chip-selected-bg-image':
        mark('.selected-chip'); break;
      case '--fm-chip-unselected-bg-image':
        mark('.unselected-chip'); break;
      case '--fm-grid-item-hover-border-image':
        mark('.grid-container'); break;
      case '--fm-context-bg-image':
        mark('.board-context-menu'); break;
      case '--fm-popup-bg-image':
        mark('.menu-card'); break;
      case '--fm-storage-track-bg-image':
        mark('.opfs-track'); break;
      case '--fm-storage-fill-bg-image':
        mark('.opfs-fill'); break;
    }
  }

  private _applyIconActive(name: string | null): void {
    document.querySelectorAll<HTMLElement>('[data-fm-icon-active]')
      .forEach(el => el.removeAttribute('data-fm-icon-active'));
    if (name) {
      document.querySelectorAll<HTMLElement>(`[data-fm-icon="${name}"]`)
        .forEach(el => el.setAttribute('data-fm-icon-active', ''));
    }
  }

  /** Forces interactive preview states on dashboard elements when editor token rows are hovered. */
  private _applyTokenPreview(token: string | null): void {
    // Clear all preview states — works for both grid and masonry view
    const firstItem = document.querySelector<HTMLElement>('.grid-container .grid-item, .masonry-container .masonry-item');
    firstItem?.classList.remove('fm-preview-hover', 'fm-preview-selected');
    document.querySelectorAll<HTMLElement>('.new-design-item-container.fm-preview-hover')
      .forEach(el => el.classList.remove('fm-preview-hover'));

    if (!token) { this._galleryPreview.next(null); return; }

    switch (token) {
      // Gallery hover state — also force overlay text visible for title/date tokens
      case '--fm-grid-item-hover-border':
      case '--fm-overlay-title-color':
      case '--fm-overlay-date-color':
      case '--fm-grid-hover-overlay':
        firstItem?.classList.add('fm-preview-hover');
        this._galleryPreview.next('hover');
        break;

      // Gallery selected border
      case '--fm-grid-item-selected-border':
      case '--fm-grid-selected-overlay':
        firstItem?.classList.add('fm-preview-selected');
        this._galleryPreview.next('selected');
        break;

      // Action card hover background — force all cards into hover appearance
      case '--fm-action-card-hover-bg':
        document.querySelectorAll<HTMLElement>('.new-design-item-container')
          .forEach(el => el.classList.add('fm-preview-hover'));
        this._galleryPreview.next(null);
        break;

      default:
        this._galleryPreview.next(null);
    }
  }

  /** Drives gallery tile preview — hover adds CSS class; selected signals dashboard via observable. */
  private _applyGalleryPreview(token: string | null): void {
    this._applyTokenPreview(token);
  }
}
