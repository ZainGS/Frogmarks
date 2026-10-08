import { Directive, ElementRef, EventEmitter, HostBinding, HostListener, Input, OnDestroy, Output } from '@angular/core';

/**
 * Press-and-hold auto-repeat for step buttons (− / +, zoom out / in), so a tablet user can hold instead of tapping.
 *
 * Use it INSTEAD of `(click)`:
 *   `<button type="button" [disabled]="atMin" (fmHoldRepeat)="step(-1)">−</button>`
 *
 *  - pointerdown (mouse primary button, pen, touch): one step right away; still held after `holdDelay` (400 ms) →
 *    repeats every `holdInterval` (80 ms), easing down to `holdMinInterval` (30 ms) by `holdRampEnd` (1.5 s) after
 *    the press.
 *  - Stops on pointerup / pointercancel / pointerleave / lostpointercapture / blur (element or window) / the host
 *    becoming disabled (checked before every repeat, so a step that disables the button ends the hold) / destroy.
 *  - The pointer is captured, so a finger sliding a little off the button keeps the hold going.
 *  - The click that follows a pointer press is swallowed (the press already stepped), so a tap is exactly one step.
 *    A keyboard click (Enter / Space on a button: `detail === 0`) is one step; holding Enter repeats via the key's
 *    own auto-repeat. A host that is not a native button also gets Enter / Space as one step each.
 *  - A disabled host (`disabled` property / `aria-disabled="true"`) does nothing.
 */
@Directive({ selector: '[fmHoldRepeat]', standalone: true })
export class HoldRepeatDirective implements OnDestroy {
  /** One step. Fired once on press, then repeatedly while held. */
  @Output('fmHoldRepeat') readonly repeat = new EventEmitter<void>();

  /** Hold this long (ms) before repeating starts. */
  @Input() holdDelay = 400;
  /** First repeat interval (ms). */
  @Input() holdInterval = 80;
  /** Fastest repeat interval (ms). */
  @Input() holdMinInterval = 30;
  /** Time after the press (ms) by which the interval has eased down to `holdMinInterval`. */
  @Input() holdRampEnd = 1500;

  /** No browser panning / long-press menu / text selection fighting the hold. */
  @HostBinding('style.touch-action') readonly touchAction = 'none';
  @HostBinding('style.user-select') readonly userSelect = 'none';
  @HostBinding('style.-webkit-user-select') readonly webkitUserSelect = 'none';
  @HostBinding('style.-webkit-touch-callout') readonly touchCallout = 'none';

  private timer: ReturnType<typeof setTimeout> | null = null;
  private pointerId: number | null = null;
  /** ms since the press at which the pending repeat fires. */
  private elapsed = 0;
  /** A pointer press stepped since the last click: that press's click must not step again. */
  private swallowClick = false;

  constructor(private el: ElementRef<HTMLElement>) {}

  /** A hold is in progress. */
  get holding(): boolean { return this.pointerId !== null; }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(ev: PointerEvent): void {
    if (this.isDisabled()) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (this.holding) return;   // a second finger on the same button: keep the first hold
    this.pointerId = ev.pointerId;
    this.swallowClick = true;
    try { this.el.nativeElement.setPointerCapture(ev.pointerId); } catch { /* no capture: pointerleave stops it */ }
    this.repeat.emit();
    if (this.isDisabled()) { this.stop(); return; }
    this.elapsed = this.holdDelay;
    this.timer = setTimeout(() => this.tick(), this.holdDelay);
  }

  @HostListener('pointerup', ['$event'])
  @HostListener('pointercancel', ['$event'])
  @HostListener('pointerleave', ['$event'])
  @HostListener('lostpointercapture', ['$event'])
  onPointerEnd(ev: PointerEvent): void {
    if (ev.pointerId === this.pointerId) this.stop();
  }

  @HostListener('blur')
  @HostListener('window:blur')
  onBlur(): void { this.stop(); }

  /** A pointer press already stepped; only a keyboard (or programmatic) click steps here. */
  @HostListener('click', ['$event'])
  onClick(ev: MouseEvent): void {
    if (this.swallowClick && ev.detail > 0) { this.swallowClick = false; return; }
    if (this.holding || this.isDisabled()) return;
    this.repeat.emit();
  }

  /** Enter / Space for a host that is not a native button (a button turns them into a click by itself). */
  @HostListener('keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (this.el.nativeElement instanceof HTMLButtonElement) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (ev.target !== this.el.nativeElement || this.isDisabled()) return;
    ev.preventDefault();
    this.repeat.emit();
  }

  /** No long-press context menu mid-hold. */
  @HostListener('contextmenu', ['$event'])
  onContextMenu(ev: Event): void { if (this.holding) ev.preventDefault(); }

  ngOnDestroy(): void { this.stop(); }

  /** The repeat interval at `t` ms after the press: `holdInterval` at `holdDelay`, easing to `holdMinInterval`. */
  intervalAt(t: number): number {
    const span = this.holdRampEnd - this.holdDelay;
    const k = span > 0 ? Math.min(1, Math.max(0, (t - this.holdDelay) / span)) : 1;
    const eased = k * (2 - k);   // ease-out: speeds up early, settles at the floor
    return Math.round(this.holdInterval + (this.holdMinInterval - this.holdInterval) * eased);
  }

  private tick(): void {
    this.timer = null;
    if (!this.holding) return;
    if (this.isDisabled()) { this.stop(); return; }
    this.repeat.emit();
    if (!this.holding) return;   // the step's handler ended the hold (e.g. destroyed the button)
    const next = this.intervalAt(this.elapsed);
    this.elapsed += next;
    this.timer = setTimeout(() => this.tick(), next);
  }

  private stop(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    const id = this.pointerId;
    this.pointerId = null;
    if (id !== null) {
      try {
        const host = this.el.nativeElement;
        if (host.hasPointerCapture?.(id)) host.releasePointerCapture(id);
      } catch { /* already released */ }
    }
  }

  private isDisabled(): boolean {
    const host = this.el.nativeElement as HTMLElement & { disabled?: boolean };
    return host.disabled === true || host.getAttribute('aria-disabled') === 'true';
  }
}
