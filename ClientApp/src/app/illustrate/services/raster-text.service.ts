import { Injectable, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { RasterTextState } from 'app/boards/models/brush-preset.model';

/** What RasterTextService needs from the editor that hosts it. */
export interface RasterTextHost {
  shapeManager(): ShapeManager;
}

/**
 * Raster text tool: font / size / bold / italic / align / colour, the live text-box state from the engine, commit /
 * cancel. Component-scoped (provided by IllustrationComponent). Extracted from illustration.component (refactor-plan 2.10g).
 */
@Injectable()
export class RasterTextService {
  private host!: RasterTextHost;
  constructor(private ngZone: NgZone) {}
  bind(host: RasterTextHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager(); }

  // Raster text tool
  rasterTextState: RasterTextState | null = null;

  rasterTextFont = 'Arial';

  rasterTextFontSize = 32;

  rasterTextBold = false;

  rasterTextItalic = false;

  rasterTextAlign: 'left' | 'center' | 'right' = 'left';

  rasterTextColor = '#ffffff';

  _rasterTextSub: { unsubscribe(): void } | null = null;

  _enableRasterText(): void {
    this.shapeManager.enableRasterText();
    this._rasterTextSub?.unsubscribe();   // re-enabling (tool re-selected) must not leak the previous listener
    // Fires from the engine's zoneless canvas pointerdown as well as from key input: the options panel binds the state
    this._rasterTextSub =this.shapeManager.onRasterTextStateChanged((state: RasterTextState) => {
      if (NgZone.isInAngularZone()) this.rasterTextState = state;
      else this.ngZone.run(() => { this.rasterTextState = state; });
    }) ?? null;
  }

  _disableRasterText(): void {
    this.shapeManager.disableRasterText();
    this._rasterTextSub?.unsubscribe();
    this._rasterTextSub = null;
    this.rasterTextState = null;
  }

  onRasterTextFontChange(font: string): void {
    this.rasterTextFont = font;
    this._updateRasterTextProps();
  }

  onRasterTextFontSizeChange(size: number): void {
    this.rasterTextFontSize = +size;
    this._updateRasterTextProps();
  }

  toggleRasterTextBold(): void {
    this.rasterTextBold = !this.rasterTextBold;
    this._updateRasterTextProps();
  }

  toggleRasterTextItalic(): void {
    this.rasterTextItalic = !this.rasterTextItalic;
    this._updateRasterTextProps();
  }

  onRasterTextAlignChange(align: 'left' | 'center' | 'right'): void {
    this.rasterTextAlign = align;
    this._updateRasterTextProps();
  }

  onRasterTextColorChange(color: string): void {
    this.rasterTextColor = color;
    // Convert hex to RGBA 0-1
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;
    this.shapeManager.updateRasterTextProperties({ color: [r, g, b, 1] });
  }

  commitRasterText(): void {
    this.shapeManager.commitRasterText();
  }

  cancelRasterText(): void {
    this.shapeManager.cancelRasterText();
  }

  _updateRasterTextProps(): void {
    this.shapeManager.updateRasterTextProperties({
      font: this.rasterTextFont,
      fontSize: this.rasterTextFontSize,
      bold: this.rasterTextBold,
      italic: this.rasterTextItalic,
      align: this.rasterTextAlign,
    });
  }
}
