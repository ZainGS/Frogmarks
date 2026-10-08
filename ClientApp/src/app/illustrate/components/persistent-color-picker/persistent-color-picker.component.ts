import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FrameCoalescer } from '../../../shared/utilities/frame-coalescer';
import { NotifyService } from '../../../shared/services/notify/notify.service';
import { hexToHSL, hslToHex, lightnessToSbY, sbYToLightness } from '../../utils/color-utils';
import { PaletteBook, PalettesService, SquareGesture } from './palette-book';

/** Always-visible colour picker: hue ring + saturation / brightness square, hex + opacity inputs, recent colours,
 *  swap and reset. The editor owns the pen colours; this picks them. Extracted from illustration.component
 *  (refactor-plan 2.10c). */
@Component({
  selector: 'app-persistent-color-picker',
  templateUrl: './persistent-color-picker.component.html',
  styleUrls: ['./persistent-color-picker.component.scss'],
})
export class PersistentColorPickerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() color = '#000000';
  @Input() secondaryColor = '#ffffff';
  @Input() recentColors: string[] = [];
  @Output() colorPicked = new EventEmitter<string>();
  /** 0..1 */
  @Output() opacityChange = new EventEmitter<number>();
  @Output() pickRecent = new EventEmitter<string>();
  @Output() swap = new EventEmitter<void>();
  @Output() resetColors = new EventEmitter<void>();
  /** The eyedropper is armed: the next canvas tap / click samples a colour (shown pressed). */
  @Input() eyedropperArmed = false;
  /** The eyedropper button: arm / disarm the one-shot canvas sample (the editor owns the canvas input). */
  @Output() eyedropper = new EventEmitter<void>();
  @ViewChild('hueRing') hueRingRef?: ElementRef<HTMLElement>;
  @ViewChild('sbSquare') sbSquareRef?: ElementRef<HTMLElement>;
  @ViewChild('hueThumb') hueThumbRef?: ElementRef<HTMLElement>;
  @ViewChild('sbIndicator') sbIndicatorRef?: ElementRef<HTMLElement>;

  constructor(private ngZone: NgZone) {}

  // ── Palettes popup (the Palettes button): rows of 8 squares, global for the user (palette-book.ts) ──

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly notify = inject(NotifyService, { optional: true });
  readonly palettes: PaletteBook = inject(PalettesService);
  palettesOpen = false;
  private readonly _gesture = new SquareGesture({
    tap: (row, col) => {
      const c = this.palettes.tap(row, col, this.color);
      if (c) this.pickRecent.emit(c);   // a filled square: the picker takes its colour (not linked)
    },
    link: (row, col) => {
      const c = this.palettes.link(row, col);
      if (c && c !== this.color) this.pickRecent.emit(c);   // edit on from the square's own colour
    },
  });
  private _popupEl: HTMLElement | null = null;
  private readonly _placePopup = (): void => { if (this._popupEl) this._placePalettesPopup(this._popupEl); };
  private readonly _onPopupMoveOutsideZone = (e: PointerEvent): void => this._gesture.move(e.clientX, e.clientY);

  /** The popup element while it is open: placed by the picker, re-placed on resize / when the picker slides. */
  @ViewChild('palettesPopup') set palettesPopupRef(ref: ElementRef<HTMLElement> | undefined) {
    const el = ref?.nativeElement ?? null;
    if (el === this._popupEl) return;
    this._detachPopup();
    this._popupEl = el;
    if (!el) return;
    this._placePalettesPopup(el);
    this.ngZone.runOutsideAngular(() => {
      el.addEventListener('pointermove', this._onPopupMoveOutsideZone);
      window.addEventListener('resize', this._placePopup);
      this.hostRef.nativeElement.addEventListener('transitionend', this._placePopup);
      requestAnimationFrame(this._placePopup);
    });
  }

  togglePalettes(): void {
    if (this.palettesOpen) this.closePalettes();
    else this.palettesOpen = true;
  }

  closePalettes(): void {
    this.palettesOpen = false;
    this._gesture.cancel();
    this.palettes.deselect();
  }

  @HostListener('document:keydown.escape') onEscape(): void {
    if (this.palettesOpen) this.closePalettes();
  }

  onSquarePointerDown(e: PointerEvent, row: number, col: number): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this._capture(e);
    this._gesture.down(row, col, e.clientX, e.clientY);
  }

  onSquarePointerUp(): void { this._gesture.up(); }

  onSquarePointerCancel(): void { this._gesture.cancel(); }

  addPaletteRow(row: number): void { this.palettes.addRowBelow(row); }

  /** "✕": the row goes, with an Undo toast that puts it back at the same place. */
  deletePaletteRow(row: number): void {
    const deleted = this.palettes.deleteRow(row);
    if (!deleted) return;
    const ref = this.notify?.success('Palette row deleted', 'Undo');
    ref?.onAction().subscribe(() => this.palettes.restoreRow(deleted));
  }

  readonly trackByIndex = (i: number): number => i;

  /** Above the picker, left edges together, clamped inside the viewport (many rows scroll inside the popup). */
  private _placePalettesPopup(el: HTMLElement): void {
    const m = 8;
    const host = this.hostRef.nativeElement.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    el.style.maxWidth = Math.max(0, vw - 2 * m) + 'px';
    el.style.bottom = Math.max(0, vh - host.top) + 'px';
    el.style.maxHeight = Math.max(60, host.top - m) + 'px';
    const w = el.offsetWidth;
    el.style.left = Math.max(m, Math.min(host.left, vw - w - m)) + 'px';
  }

  private _detachPopup(): void {
    this._popupEl?.removeEventListener('pointermove', this._onPopupMoveOutsideZone);
    window.removeEventListener('resize', this._placePopup);
    this.hostRef.nativeElement.removeEventListener('transitionend', this._placePopup);
  }

  /** M3 (zone audit): the ring / square pointermove is listened OUTSIDE the zone — as template bindings every hover
   *  move ran an app change detection. While dragging, the thumb / indicator / square hue move by direct style writes
   *  per move, and the colour is emitted (colorPicked: the editor applies it live) in ONE zone entry per frame;
   *  pointerup emits the last one at once. */
  private readonly _dragFrame = new FrameCoalescer(() => this.ngZone.run(() => this._persistentPickerEmit()));
  private readonly _onRingMoveOutsideZone = (e: PointerEvent): void => {
    if (!this._hueSelecting) return;
    if (!this._setHueFromEvent(e)) return;
    const thumb = this.hueThumbRef?.nativeElement;
    if (thumb) thumb.style.transform = 'rotate(' + this.persistentHue + 'deg) translateY(-63px)';
    const sq = this.sbSquareRef?.nativeElement;
    if (sq) sq.style.background = 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(' + this.persistentHue + ', 100%, 50%))';
    this._dragFrame.mark('hue');
  };
  private readonly _onSquareMoveOutsideZone = (e: PointerEvent): void => {
    if (!this._sbSelecting) return;
    e.stopPropagation();   // (the square sits inside the ring)
    if (!this._setSbFromEvent(e)) return;
    const ind = this.sbIndicatorRef?.nativeElement;
    if (ind) { ind.style.left = this.persistentSbX + '%'; ind.style.top = this.persistentSbY + '%'; }
    this._dragFrame.mark('sb');
  };

  ngAfterViewInit(): void {
    const ring = this.hueRingRef?.nativeElement;
    const sq = this.sbSquareRef?.nativeElement;
    this.ngZone.runOutsideAngular(() => {
      ring?.addEventListener('pointermove', this._onRingMoveOutsideZone);
      sq?.addEventListener('pointermove', this._onSquareMoveOutsideZone);
    });
  }

  ngOnDestroy(): void {
    this.hueRingRef?.nativeElement.removeEventListener('pointermove', this._onRingMoveOutsideZone);
    this.sbSquareRef?.nativeElement.removeEventListener('pointermove', this._onSquareMoveOutsideZone);
    this._dragFrame.cancel();
    this._detachPopup();
    this._gesture.cancel();
    this.palettes.deselect();
  }
  /** The last colour this picker emitted — re-deriving hue from it would snap greys to hue 0 mid-drag. */
  private _lastEmitted: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['color'] && this.color && this.color !== this._lastEmitted) this._syncPersistentPickerFromHex(this.color);
    // A selected (live-linked) palette square follows every picker change.
    if (changes['color'] && this.color) this.palettes.pickerChanged(this.color);
  }

  persistentHue = 0;

  persistentSbX = 100;

  persistentSbY = 0;

  persistentOpacity = 100;

  private _hueSelecting = false;

  private _sbSelecting = false;

  /** Sync internal HSB state from a hex color */
  _syncPersistentPickerFromHex(hex: string): void {
    const hsl = hexToHSL(hex);
    this.persistentHue = hsl.h;
    this.persistentSbX = hsl.s;
    this.persistentSbY = lightnessToSbY(hsl.l, hsl.s);
  }

  /** Emit updated color from current HSB state */
  _persistentPickerEmit(): void {
    const l = sbYToLightness(this.persistentSbY, this.persistentSbX);
    const hex = hslToHex(this.persistentHue, this.persistentSbX, l);
    this._lastEmitted = hex;
    this.colorPicked.emit(hex);
  }

  // Pointer events + capture (mobile-parity TOUCH-1): mouse, pen and touch all drag; the captured element keeps
  // receiving moves off its bounds, so no document listeners. touch-action:none on the areas (scss) stops the
  // browser from turning a finger drag into a scroll.
  onHueRingPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    this._hueSelecting = true;
    this._sbSelecting = false;
    this._capture(e);
    this._updateHueFromEvent(e);
  }

  onHueRingPointerMove(e: PointerEvent): void {
    if (this._hueSelecting) this._updateHueFromEvent(e);
  }

  /** pointerup / pointercancel / lostpointercapture on either area (the square's bubble up to the ring). The drag's
   *  last colour is emitted first. */
  onPickerPointerEnd(): void {
    this._dragFrame.flushNow();
    this._hueSelecting = false;
    this._sbSelecting = false;
  }

  private _capture(e: PointerEvent): void {
    try { (e.currentTarget as HTMLElement | null)?.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  }

  _updateHueFromEvent(e: MouseEvent): void {
    if (this._setHueFromEvent(e)) this._persistentPickerEmit();
  }

  private _setHueFromEvent(e: MouseEvent): boolean {
    const ring = this.hueRingRef?.nativeElement;   // (was e.target.closest('.hue-ring') — lost the drag off the ring)
    if (!ring) return false;
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
    this.persistentHue = ((angle % 360) + 360) % 360;
    return true;
  }

  onSbSquarePointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();   // the square sits inside the hue ring
    this._sbSelecting = true;
    this._hueSelecting = false;
    this._capture(e);
    this._updateSbFromEvent(e);
  }

  onSbSquarePointerMove(e: PointerEvent): void {
    if (!this._sbSelecting) return;
    e.stopPropagation();
    this._updateSbFromEvent(e);
  }

  _updateSbFromEvent(e: MouseEvent): void {
    if (this._setSbFromEvent(e)) this._persistentPickerEmit();
  }

  private _setSbFromEvent(e: MouseEvent): boolean {
    const sq = this.sbSquareRef?.nativeElement;
    if (!sq) return false;
    const rect = sq.getBoundingClientRect();
    this.persistentSbX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    this.persistentSbY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return true;
  }

  onPersistentHexInput(hex: string): void {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      this._syncPersistentPickerFromHex(hex);
      this._lastEmitted = hex;
      this.colorPicked.emit(hex);
    }
  }

  onPersistentOpacityChange(event: Event): void {
    const val = Math.min(100, Math.max(0, +(event.target as HTMLInputElement).value));
    this.persistentOpacity = val;
    this.opacityChange.emit(val / 100);
  }
}
