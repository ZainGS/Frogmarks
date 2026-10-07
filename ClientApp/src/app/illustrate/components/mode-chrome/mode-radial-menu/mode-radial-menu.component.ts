import {
  Component, ElementRef, EventEmitter, HostBinding, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges,
  inject,
} from '@angular/core';
import { OverlayManagerService, insideElement } from '../../../../shared/services/overlay/overlay-manager.service';
import type { ModeRadialItem } from '../mode-chrome.types';
import { modeIconPaths } from '../mode-icons';
import { RADIAL_CENTER_R, RADIAL_ITEM_H, RADIAL_ITEM_W, RadialLayout, computeRadialLayout, radialPickIndex } from '../radial-layout';

/** A release this far (CSS px) from the press point, or more, can pick (less = the finger just lifted). */
const RELEASE_PICK_MIN_MOVE_PX = 12;
const TITLE_H = 28;

let nextRadialId = 0;

/**
 * Long-press radial (pie) menu (UI review 2026-10-07 §4 item 6): items on a ring around the press point (kept inside
 * the viewport), 52 px targets, a centre ✕. Two ways to pick:
 *  - drag + release: the press that opened it keeps going — slide toward an item and lift (the item in that
 *    direction highlights while dragging);
 *  - tap: lift first, then tap an item.
 * Esc, a tap outside (on the dimmed backdrop, which eats that tap) or the ✕ close it (`closed`). Controlled: the mode
 * sets `open` back to false on pick / closed. Use LongPressDetector (../long-press.ts) on the canvas to open it.
 */
@Component({
  selector: 'app-mode-radial-menu',
  templateUrl: './mode-radial-menu.component.html',
  styleUrls: ['./mode-radial-menu.component.scss'],
})
export class ModeRadialMenuComponent implements OnInit, OnChanges, OnDestroy {
  @Input() open = false;
  /** The press point (client px). */
  @Input() x = 0;
  @Input() y = 0;
  @Input() items: ModeRadialItem[] = [];
  @Input() title?: string;
  @HostBinding('attr.title') readonly hostTitle = null;

  @Output() pick = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  layout: RadialLayout = { cx: 0, cy: 0, radius: 0, items: [] };
  /** The item the dragging pointer points at (-1 = none). */
  hoverIndex = -1;
  readonly itemW = RADIAL_ITEM_W;
  readonly itemH = RADIAL_ITEM_H;
  readonly titleH = TITLE_H;

  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;
  private readonly overlays = inject(OverlayManagerService, { optional: true });
  private readonly zone = inject(NgZone, { optional: true });
  private unregister: (() => void) | null = null;
  /** Closed by Esc / outside / ✕ / a pick, until `open` is set again. */
  private dismissed = false;
  /** The press that opened the menu is still down (drag-to-pick armed) — until any new pointerdown. */
  private gestureLive = false;
  /** A pointerdown landed on the menu since it opened. Until then a pointer click is the opening press's own lift (a
   *  touch's compatibility click lands on the ✕ under the finger) and is ignored; keyboard clicks (detail 0) are not. */
  private pressedSinceOpen = false;
  private maxMove = 0;
  private listening = false;
  private readonly overlayId = `mode-radial-menu-${++nextRadialId}`;

  get visible(): boolean { return this.open && !this.dismissed; }

  ngOnInit(): void {
    this.unregister = this.overlays?.register({
      id: this.overlayId,
      isOpen: () => this.visible,
      close: () => this.close(),
      contains: insideElement(() => this.host.nativeElement),
    }) ?? null;
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['open'] && this.open && !ch['open'].previousValue) {
      this.dismissed = false;
      this.gestureLive = true;
      this.pressedSinceOpen = false;
      this.maxMove = 0;
      this.hoverIndex = -1;
      this.listen();
    }
    if (!this.open) this.unlisten();
    if (this.open && (ch['open'] || ch['x'] || ch['y'] || ch['items'] || ch['title'])) this.relayout();
  }

  ngOnDestroy(): void {
    this.unregister?.();
    this.unregister = null;
    this.unlisten();
  }

  relayout(): void {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    this.layout = computeRadialLayout({ count: this.items?.length ?? 0, x: this.x, y: this.y, viewportW: vw, viewportH: vh,
      titleH: this.title ? TITLE_H : 0 });
  }

  iconPaths(it: ModeRadialItem): readonly string[] | null { return modeIconPaths(it.icon); }

  choose(it: ModeRadialItem): void {
    if (it.disabled || !this.visible) return;
    this.dismissed = true;
    this.unlisten();
    this.pick.emit(it.id);
  }

  close(): void {
    if (!this.visible) return;
    this.dismissed = true;
    this.unlisten();
    this.closed.emit();
  }

  /** A pointerdown on the menu (an item, the ✕, the backdrop) is a new tap: the opening press is over. */
  onMenuPointerDown(): void { this.gestureLive = false; this.pressedSinceOpen = true; this.hoverIndex = -1; }

  /** An item / the ✕ was clicked: ignored when it is the opening press lifting (see pressedSinceOpen). */
  onItemClick(ev: MouseEvent, it: ModeRadialItem): void { if (!this.isOpeningLift(ev)) this.choose(it); }
  onCenterClick(ev: MouseEvent): void { if (!this.isOpeningLift(ev)) this.close(); }
  private isOpeningLift(ev: MouseEvent): boolean { return (ev?.detail ?? 0) > 0 && !this.pressedSinceOpen; }

  onBackdropDown(ev: PointerEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.close();
  }

  trackId(_: number, it: ModeRadialItem): string { return it.id; }

  // ── Drag-to-pick (the opening press), on the window: the canvas may hold pointer capture ─────────────────────

  /** Exposed for specs: the opening press moved to (px, py). */
  handleGestureMove(px: number, py: number): void {
    if (!this.gestureLive || !this.visible) return;
    this.maxMove = Math.max(this.maxMove, Math.hypot(px - this.x, py - this.y));
    const i = this.maxMove >= RELEASE_PICK_MIN_MOVE_PX ? this.pickIndexAt(px, py) : -1;
    if (i !== this.hoverIndex) this.inZone(() => { this.hoverIndex = i; });
  }

  /** Exposed for specs: the opening press was released at (px, py). */
  handleGestureUp(px: number, py: number): void {
    if (!this.gestureLive || !this.visible) return;
    this.gestureLive = false;
    this.maxMove = Math.max(this.maxMove, Math.hypot(px - this.x, py - this.y));
    const i = this.maxMove >= RELEASE_PICK_MIN_MOVE_PX ? this.pickIndexAt(px, py) : -1;
    this.inZone(() => {
      this.hoverIndex = -1;
      if (i >= 0) this.choose(this.items[i]);
    });
  }

  private pickIndexAt(px: number, py: number): number {
    return radialPickIndex(this.layout, px, py, RADIAL_CENTER_R, i => !!this.items[i]?.disabled);
  }

  private readonly onWinMove = (e: PointerEvent): void => this.handleGestureMove(e.clientX, e.clientY);
  private readonly onWinUp = (e: PointerEvent): void => this.handleGestureUp(e.clientX, e.clientY);
  private readonly onWinCancel = (): void => { this.gestureLive = false; this.inZone(() => { this.hoverIndex = -1; }); };
  private readonly onResize = (): void => this.inZone(() => this.relayout());

  private inZone(fn: () => void): void {
    const z = this.zone;
    if (z && !NgZone.isInAngularZone()) z.run(fn); else fn();
  }

  private listen(): void {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    const add = () => {
      window.addEventListener('pointermove', this.onWinMove, true);
      window.addEventListener('pointerup', this.onWinUp, true);
      window.addEventListener('pointercancel', this.onWinCancel, true);
      window.addEventListener('resize', this.onResize);
    };
    if (this.zone) this.zone.runOutsideAngular(add); else add();
  }

  private unlisten(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('pointermove', this.onWinMove, true);
    window.removeEventListener('pointerup', this.onWinUp, true);
    window.removeEventListener('pointercancel', this.onWinCancel, true);
    window.removeEventListener('resize', this.onResize);
  }
}
