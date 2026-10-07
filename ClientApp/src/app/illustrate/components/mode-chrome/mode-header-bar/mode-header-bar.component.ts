import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostBinding, Input, NgZone, OnDestroy, OnInit, Output, ViewChild, inject,
} from '@angular/core';
import { OverlayManagerService, insideElement } from '../../../../shared/services/overlay/overlay-manager.service';
import { MODE_CHROME_VARS, ModeMenuItem, ModeSegment } from '../mode-chrome.types';
import { releaseRootVar, setRootVar } from '../root-css-vars';

let nextMenuId = 0;

/**
 * Mode header bar (UI review 2026-10-07 §4 item 1): across the top of the viewport, directly below the editor's top
 * bar. Mode title (+ subtitle) · selection-mode segmented control · Multi latch · a second tab group (Rig | Animate) ·
 * Undo / Redo / Frame · "⋯" menu · a large Done. Presentational: the mode owns every state and handles the outputs.
 *
 * While mounted it publishes --fm-modebar-h on <html> (its measured height: 40 px, 48 px on a coarse pointer, twice
 * that when it wraps to two rows on a phone) so other overlays can sit below it. The "⋯" menu is an overlay of the
 * OverlayManagerService: Esc and a tap outside close it, and opening it closes any other menu.
 */
@Component({
  selector: 'app-mode-header-bar',
  templateUrl: './mode-header-bar.component.html',
  styleUrls: ['./mode-header-bar.component.scss'],
})
export class ModeHeaderBarComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() title = '';
  /** The `title` input must not also become the host's tooltip (a static title="…" attribute stays on the host). */
  @HostBinding('attr.title') readonly hostTitle = null;
  @Input() subtitle?: string;
  @Input() segments: ModeSegment[] = [];
  @Input() activeSegment: string | null = null;
  @Input() segments2?: ModeSegment[];
  @Input() activeSegment2?: string | null;
  /** The Multi (add to selection) latch: null hides it. */
  @Input() multiLatch: boolean | null = null;
  @Input() canUndo = true;
  @Input() canRedo = true;
  @Input() showFrame = true;
  @Input() menuItems: ModeMenuItem[] = [];
  @Input() doneLabel = 'Done';

  @Output() segmentChange = new EventEmitter<string>();
  @Output() segment2Change = new EventEmitter<string>();
  @Output() multiLatchChange = new EventEmitter<boolean>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() frame = new EventEmitter<void>();
  @Output() menuAction = new EventEmitter<string>();
  @Output() done = new EventEmitter<void>();

  menuOpen = false;

  @ViewChild('bar', { static: true }) private barEl?: ElementRef<HTMLElement>;

  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;
  private readonly overlays = inject(OverlayManagerService, { optional: true });
  private readonly zone = inject(NgZone, { optional: true });
  private unregister: (() => void) | null = null;
  private resizeObs: ResizeObserver | null = null;
  private coarseMql: MediaQueryList | null = null;
  private readonly menuId = `mode-header-menu-${++nextMenuId}`;
  private readonly onCoarseChange = (): void => this.publishHeight();

  ngOnInit(): void {
    try {
      this.coarseMql = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
      this.coarseMql?.addEventListener?.('change', this.onCoarseChange);
    } catch { this.coarseMql = null; }
    this.publishHeight();
    this.unregister = this.overlays?.register({
      id: this.menuId,
      isOpen: () => this.menuOpen,
      close: () => { this.menuOpen = false; },
      contains: insideElement(() => this.host.nativeElement),
    }) ?? null;
  }

  ngAfterViewInit(): void {
    const el = this.barEl?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const run = (fn: () => void) => (this.zone ? this.zone.runOutsideAngular(fn) : fn());
    run(() => {
      this.resizeObs = new ResizeObserver(() => this.publishHeight());
      this.resizeObs.observe(el);
    });
    this.publishHeight();
  }

  ngOnDestroy(): void {
    this.unregister?.();
    this.unregister = null;
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.coarseMql?.removeEventListener?.('change', this.onCoarseChange);
    releaseRootVar(MODE_CHROME_VARS.modebarH, this);
  }

  /** --fm-modebar-h: the bar's real height once laid out, else the single-row default. */
  private publishHeight(): void {
    const h = this.barEl?.nativeElement.getBoundingClientRect().height ?? 0;
    const px = h >= 1 ? Math.round(h) : (this.coarseMql?.matches ? 48 : 40);
    setRootVar(MODE_CHROME_VARS.modebarH, this, `${px}px`);
  }

  segmentTitle(s: ModeSegment): string {
    return s.title ?? (s.key ? `${s.label} (${s.key})` : s.label);
  }

  pickSegment(s: ModeSegment): void {
    if (s.id !== this.activeSegment) this.segmentChange.emit(s.id);
  }

  pickSegment2(s: ModeSegment): void {
    if (s.id !== this.activeSegment2) this.segment2Change.emit(s.id);
  }

  toggleMulti(): void {
    if (this.multiLatch === null) return;
    this.multiLatchChange.emit(!this.multiLatch);
  }

  toggleMenu(): void { this.menuOpen = !this.menuOpen; }

  pickMenu(item: ModeMenuItem): void {
    if (item.disabled) return;
    this.menuOpen = false;
    this.menuAction.emit(item.id);
  }

  trackId(_: number, x: { id: string }): string { return x.id; }
}
