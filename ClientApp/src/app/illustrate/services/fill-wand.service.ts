import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { WandSelectionMode } from 'app/boards/models/brush-preset.model';

/** What FillWandService needs from the editor that hosts it. */
export interface FillWandHost {
  shapeManager(): ShapeManager;
}

/**
 * Flood-fill and magic-wand options (tolerance, gap closing / contiguous, mode, reference layer); the wand options
 * are pushed to the engine on change. Component-scoped. Extracted from illustration.component (refactor-plan 2.10h).
 */
@Injectable()
export class FillWandService {
  private host!: FillWandHost;
  bind(host: FillWandHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager(); }

  fillTolerance = 32;

  fillGapClosing = 1;

  fillContiguous = true;

  fillReferenceLayerId = '';

  wandTolerance = 32;

  wandContiguous = true;

  wandMode: WandSelectionMode = 'new';

  wandReferenceLayerId = '';

  onFillToleranceChange(v: number): void { this.fillTolerance = Math.round(v); }

  onFillGapClosingChange(v: number): void { this.fillGapClosing = Math.round(v); }

  onFillContiguousChange(v: boolean): void { this.fillContiguous = v; }

  onFillReferenceLayerChange(id: string): void { this.fillReferenceLayerId = id; }

  onWandToleranceChange(v: number): void {
    this.wandTolerance = Math.round(v);
    this._syncMagicWandOptions();
  }

  onWandContiguousChange(v: boolean): void {
    this.wandContiguous = v;
    this._syncMagicWandOptions();
  }

  onWandModeChange(mode: WandSelectionMode): void {
    this.wandMode = mode;
    this._syncMagicWandOptions();
  }

  onWandReferenceLayerChange(id: string): void {
    this.wandReferenceLayerId = id;
    this._syncMagicWandOptions();
  }

  _syncMagicWandOptions(): void {
    // NOTE: engine options are {tolerance, contiguous, referenceLayerId} — 'mode' is
    // not consumed (the wand Mode control is currently a no-op; needs an engine option).
    this.shapeManager.setMagicWandOptions({
      tolerance: this.wandTolerance,
      contiguous: this.wandContiguous,
      referenceLayerId: this.wandReferenceLayerId || undefined,
    });
  }
}
