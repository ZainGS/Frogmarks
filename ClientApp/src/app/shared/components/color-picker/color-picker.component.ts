/**
 * ColorPickerComponent
 * --------------------
 * This component provides a custom HSL-based color picker with support for:
 * - Selecting color via a 2D saturation-brightness gradient square
 * - Adjusting hue with a horizontal slider
 * - Typing or pasting a hex color value into a text input
 * - Optionally using the browser Eyedropper API (if supported)
 * 
 * Data Flow:
 * ----------
 * Inputs:
 * - @Input() color: Accepts a hex color string (#RRGGBB). Used to initialize or externally update the picker.
 * 
 * Outputs:
 * - @Output() colorSelected: Emits the currently selected hex color string when the user interacts or updates the value.
 * - @Output() close: Emits when a click occurs outside the component element.
 * 
 * Internal Flow:
 * - When a color is set (via `setColor` or hex input), it is converted from hex → HSL.
 * - The hue, saturation (sbX), and brightness position (sbY) are updated.
 * - The gradient square uses sbX/sbY to position the indicator and compute brightness.
 * - User interaction (mouse drag or slider input) updates sbX/sbY or hue.
 * - `updateColor()` recomputes HSL → hex and emits it through `colorSelected`.
 * - The component keeps `hexColor` in sync with visual selections and manual text input.
 * 
 * Methods:
 * - setColor(hex): Accepts an external hex value, updates internal HSL/sbX/sbY state.
 * - updateColor(): Converts current hue/sbX/sbY to HSL, then to hex. Emits color if applicable.
 * - updateFromHex(): Parses the hex input field, updates HSL and sbX/sbY.
 * - updateColorFromEvent(event): Converts mouse position to sbX/sbY and updates color.
 * - updateGradient(): Applies CSS hue value and triggers a color update.
 * - lightnessToSbY() / sbYToLightness(): Maps lightness ↔ visual Y coordinate based on saturation.
 * - hslToHex() / hexToHSL(): Format conversion utilities.
 */

import { Component, HostListener, OnInit, Output, EventEmitter, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { FrameCoalescer } from '../../utilities/frame-coalescer';

@Component({
  selector: 'app-color-picker',
  standalone: false,
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss'
})
export class ColorPickerComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() colorSelected = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
  @Output() opacityChange = new EventEmitter<number>();
  @Input() hideInput = false;
  @Input() showOpacity = false;
  @Input() opacity = 100;
  @Input() color: string = "#1E1E1E";
  hexColor: string = "#1E1E1E"; // Default color
  hue: number = 0; // Default hue
  sbX: number = 0; // Saturation (X Position)
  sbY: number = 0; // Brightness (Y Position)
  isSelecting: boolean = false; // Tracks if the user is dragging
  isInitializing = true;
  private suppressEmit = false;
  @ViewChild('gradient') gradientRef?: ElementRef<HTMLDivElement>;
  @ViewChild('indicator') indicatorRef?: ElementRef<HTMLDivElement>;

  constructor(private elRef: ElementRef, private ngZone: NgZone) {}

  /** M3 (zone audit): the square's pointermove is listened OUTSIDE the zone — as a template binding every hover move
   *  ran an app change detection. While dragging, the indicator moves by a direct style write per move and the colour
   *  is applied (hexColor + colorSelected, so the parent paints live) in ONE zone entry per frame; pointerup applies
   *  the last one at once. */
  private readonly _dragFrame = new FrameCoalescer(() => this.ngZone.run(() => this.updateColor()));
  private readonly _onGradientMoveOutsideZone = (event: PointerEvent): void => {
    if (!this.isSelecting) return;
    if (!this._setSbFromEvent(event)) return;
    const ind = this.indicatorRef?.nativeElement;
    if (ind) { ind.style.top = this.sbY + '%'; ind.style.left = this.sbX + '%'; }
    this._dragFrame.mark('move');
  };

  ngAfterViewInit(): void {
    const el = this.gradientRef?.nativeElement;
    if (el) this.ngZone.runOutsideAngular(() => el.addEventListener('pointermove', this._onGradientMoveOutsideZone));
  }

  ngOnDestroy(): void {
    this.gradientRef?.nativeElement.removeEventListener('pointermove', this._onGradientMoveOutsideZone);
    this._dragFrame.cancel();
  }

    @HostListener('document:click', ['$event'])
    onClickOutside(event: MouseEvent) {
        if (!this.elRef.nativeElement.contains(event.target)) {
            // Emit a close event to parent
            this.close.emit();
        }
    }

  ngOnInit(): void {
    if (this.color) {
        this.hexColor = this.color;
        this.updateFromHex();
    }
    this.isInitializing = false;
  }

setColor(color: string) {
  if (!color) return;
  this.suppressEmit = true;
  this.hexColor = color;
  const hsl = this.hexToHSL(color);
  this.hue = hsl.h;
  this.sbX = hsl.s;
  this.sbY = this.lightnessToSbY(hsl.l, hsl.s);
  this.updateGradient();
  this.suppressEmit = false;
}

private lightnessToSbY(l: number, s: number): number {
  const L_left = l / (1 - s / 200);
  return 100 - L_left;
}

private sbYToLightness(sbY: number, s: number): number {
  const L_left = 100 - sbY;
  return L_left * (1 - s / 200);
}

  // Start color selection (pointer events + capture, mobile-parity TOUCH-1: mouse, pen and touch all drag; the
  // captured square keeps receiving moves off its bounds, so no document listeners).
  startColorSelection(event: PointerEvent) {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      this.isSelecting = true;
      try { (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
      this.updateColorFromEvent(event);
  }

  // Update color on drag (in the zone; the per-move path is _onGradientMoveOutsideZone)
  onGradientPointerMove(event: PointerEvent) {
      if (this.isSelecting) {
          this.updateColorFromEvent(event);
      }
  }

  // Stop selecting on pointerup / pointercancel / lostpointercapture (the drag's last colour applies first)
  endColorSelection() {
      this._dragFrame.flushNow();
      this.isSelecting = false;
  }

  // Update color based on cursor position inside SB gradient
  updateColorFromEvent(event: MouseEvent) {
      if (this._setSbFromEvent(event)) this.updateColor();
  }

  /** sbX / sbY from a pointer position over the square (false when the square isn't there). */
  private _setSbFromEvent(event: MouseEvent): boolean {
      // THIS instance's square (was document.querySelector('.color-gradient'): the first picker on the page).
      const gradient = this.gradientRef?.nativeElement;
      if (!gradient) return false;

      const rect = gradient.getBoundingClientRect();
      let x = ((event.clientX - rect.left) / rect.width) * 100;
      let y = ((event.clientY - rect.top) / rect.height) * 100;

      // Clamp values within the gradient box
      this.sbX = Math.max(0, Math.min(x, 100));
      this.sbY = Math.max(0, Math.min(y, 100));
      return true;
  }

  // Updates the selected color (HSL → HEX)
  updateColor() {
      const saturation = this.sbX;
      // const L_left = 100 - this.sbY;
      // const L_right = L_left / 2;
      const lightness = this.sbYToLightness(this.sbY, saturation); // updateColor
      const newHex = this.hslToHex(this.hue, saturation, lightness);
      this.hexColor = newHex;
      if (!this.isInitializing && !this.suppressEmit) {
          this.colorSelected.emit(newHex);
      }
  }


  // Updates SB Gradient when Hue changes
  updateGradient() {
      // Per instance (was documentElement: every picker on the page shared one hue).
      (this.elRef.nativeElement as HTMLElement).style.setProperty('--hue', this.hue.toString());
      this.updateColor();
  }

  // Updates HSL values from HEX input
  updateFromHex() {
    const hsl = this.hexToHSL(this.hexColor);
    this.hue = hsl.h;
    this.sbX = hsl.s;
    this.sbY = this.lightnessToSbY(hsl.l, hsl.s);
    if (!this.suppressEmit) {
      this.updateGradient();
    }
  }

  // Convert HSL to HEX
  hslToHex(h: number, s: number, l: number): string {
      s /= 100;
      l /= 100;
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = l - c / 2;
      let r = 0, g = 0, b = 0;

      if (h < 60) { r = c, g = x, b = 0; }
      else if (h < 120) { r = x, g = c, b = 0; }
      else if (h < 180) { r = 0, g = c, b = x; }
      else if (h < 240) { r = 0, g = x, b = c; }
      else if (h < 300) { r = x, g = 0, b = c; }
      else { r = c, g = 0, b = x; }

      return `#${((1 << 24) + (Math.round((r + m) * 255) << 16) + (Math.round((g + m) * 255) << 8) + Math.round((b + m) * 255)).toString(16).slice(1).toUpperCase()}`;
  }

  // Convert HEX to HSL
  hexToHSL(hex: string): { h: number, s: number, l: number } {
      let r = parseInt(hex.substring(1, 3), 16) / 255;
      let g = parseInt(hex.substring(3, 5), 16) / 255;
      let b = parseInt(hex.substring(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;

      if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
              case r: h = (g - b) / d + (g < b ? 6 : 0); break;
              case g: h = (b - r) / d + 2; break;
              case b: h = (r - g) / d + 4; break;
          }
          h *= 60;
      }
      return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  onOpacityInput(event: Event): void {
    const val = Math.min(100, Math.max(0, +(event.target as HTMLInputElement).value));
    this.opacity = val;
    this.opacityChange.emit(val);
  }

  /** The browser's screen eyedropper (window.EyeDropper — Chromium only; it was checked as `Eyedropper`, which never
   *  exists, so this always bailed). Not wired to a button: the editor's canvas eyedropper is the persistent picker's. */
  get hasEyeDropper(): boolean { return typeof (window as any).EyeDropper === 'function'; }

  openEyedropper(): void {
      const Ctor = (window as any).EyeDropper;
      if (typeof Ctor !== 'function') return;
      new Ctor().open().then((result: { sRGBHex: string }) => {
          this.setColor(result.sRGBHex);
          this.colorSelected.emit(result.sRGBHex);
      }).catch(() => { /* cancelled (Esc) */ });
  }
}
