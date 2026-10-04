import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { hexToHSL, hslToHex, lightnessToSbY, sbYToLightness } from '../../utils/color-utils';

/** Always-visible colour picker: hue ring + saturation / brightness square, hex + opacity inputs, recent colours,
 *  swap and reset. The editor owns the pen colours; this picks them. Extracted from illustration.component
 *  (refactor-plan 2.10c). */
@Component({
  selector: 'app-persistent-color-picker',
  templateUrl: './persistent-color-picker.component.html',
  styleUrls: ['./persistent-color-picker.component.scss'],
})
export class PersistentColorPickerComponent implements OnChanges {
  @Input() color = '#000000';
  @Input() secondaryColor = '#ffffff';
  @Input() recentColors: string[] = [];
  @Output() colorPicked = new EventEmitter<string>();
  /** 0..1 */
  @Output() opacityChange = new EventEmitter<number>();
  @Output() pickRecent = new EventEmitter<string>();
  @Output() swap = new EventEmitter<void>();
  @Output() resetColors = new EventEmitter<void>();
  @ViewChild('hueRing') hueRingRef?: ElementRef<HTMLElement>;
  @ViewChild('sbSquare') sbSquareRef?: ElementRef<HTMLElement>;
  /** The last colour this picker emitted — re-deriving hue from it would snap greys to hue 0 mid-drag. */
  private _lastEmitted: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['color'] && this.color && this.color !== this._lastEmitted) this._syncPersistentPickerFromHex(this.color);
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

  onHueRingMouseDown(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this._hueSelecting = true;
    this._updateHueFromEvent(e);
    const moveHandler = (ev: MouseEvent) => { if (this._hueSelecting) this._updateHueFromEvent(ev); };
    const upHandler = () => { this._hueSelecting = false; document.removeEventListener('mousemove', moveHandler); document.removeEventListener('mouseup', upHandler); };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  _updateHueFromEvent(e: MouseEvent): void {
    const ring = this.hueRingRef?.nativeElement;   // (was e.target.closest('.hue-ring') — lost the drag off the ring)
    if (!ring) return;
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
    this.persistentHue = ((angle % 360) + 360) % 360;
    this._persistentPickerEmit();
  }

  onSbSquareMouseDown(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this._sbSelecting = true;
    this._updateSbFromEvent(e);
    const moveHandler = (ev: MouseEvent) => { if (this._sbSelecting) this._updateSbFromEvent(ev); };
    const upHandler = () => { this._sbSelecting = false; document.removeEventListener('mousemove', moveHandler); document.removeEventListener('mouseup', upHandler); };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  _updateSbFromEvent(e: MouseEvent): void {
    const sq = this.sbSquareRef?.nativeElement;
    if (!sq) return;
    const rect = sq.getBoundingClientRect();
    this.persistentSbX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    this.persistentSbY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    this._persistentPickerEmit();
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
