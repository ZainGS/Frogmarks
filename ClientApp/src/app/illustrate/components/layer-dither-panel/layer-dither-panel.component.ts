import { Component, Input } from '@angular/core';
import { LayerEffectsService } from '../../services/layer-effects.service';
import { rgba01ToHex } from '../../utils/color-utils';
import { BAYER_LEVEL_OPTIONS, COLOR_LEVEL_OPTIONS, COLOR_MODE_OPTIONS, DitherConfig } from 'app/boards/models/brush-preset.model';

/** Per-layer dither (+ GPU edge effects) for the selected raster layer. A view over LayerEffectsService (refactor-plan 2.10a). */
@Component({
  selector: 'app-layer-dither-panel',
  templateUrl: './layer-dither-panel.component.html',
  styleUrls: ['./layer-dither-panel.component.scss'],
})
export class LayerDitherPanelComponent {
  @Input() selectedRasterLayerId: string | null = null;
  readonly bayerLevelOptions = BAYER_LEVEL_OPTIONS;
  readonly colorLevelOptions = COLOR_LEVEL_OPTIONS;
  readonly colorModeOptions = COLOR_MODE_OPTIONS;
  mathRound(v: number): number { return Math.round(v); }
  constructor(public fx: LayerEffectsService) {}

  /** The selected layer's dither config while its dither is on (else null): ONE lookup per check, bound as `cfg` in
   *  the template — it used to call fx.getLayerDitherConfig ~40× per app tick (playback perf A6, 2026-10-09). Same
   *  values: with the dither on, getLayerDitherConfig is exactly this map entry. */
  get enabledCfg(): DitherConfig | null {
    const cfg = this.selectedRasterLayerId ? this.fx.layerDitherConfigs.get(this.selectedRasterLayerId) : undefined;
    return cfg?.enabled ? cfg : null;
  }

  rgba01ToHex(c: [number, number, number, number]): string { return rgba01ToHex(c); }
}
