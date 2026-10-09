import { Component, Input } from '@angular/core';
import { LayerEffectsService } from '../../services/layer-effects.service';
import { rgba01ToHex } from '../../utils/color-utils';
import { BAYER_LEVEL_OPTIONS, COLOR_LEVEL_OPTIONS, COLOR_MODE_OPTIONS, DitherConfig } from 'app/boards/models/brush-preset.model';
import {
  EDGE_SLIDER_STEPS, EDGE_WIDTH_MAX_PCT, EDGE_WIDTH_MAX_PX, edgePctToPx, edgePxToPct, edgePxToSlider, edgeSliderToPx,
} from '../../utils/dither-edge-width';

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

  // ── Edge width: non-linear slider + number box; Canvas mode in % of the page's shorter side ──
  readonly edgeSliderSteps = EDGE_SLIDER_STEPS;
  readonly edgeMaxPx = EDGE_WIDTH_MAX_PX;
  readonly edgeMaxPct = EDGE_WIDTH_MAX_PCT;

  /** Canvas mode on a bounded page: the width reads in % of the shorter side. */
  edgeInPct(cfg: DitherConfig): boolean {
    return ((cfg as { edgeMode?: string }).edgeMode ?? 'content') === 'canvas' && this.fx.pageMinSide() > 0;
  }
  edgeSlider(cfg: DitherConfig): number {
    return this.edgeInPct(cfg) ? Math.round(edgePxToPct(cfg.edgeWidth ?? 0, this.fx.pageMinSide()) * 10) : edgePxToSlider(cfg.edgeWidth ?? 0);
  }
  /** The number box value (px, or % in Canvas mode). */
  edgeValue(cfg: DitherConfig): number {
    return this.edgeInPct(cfg) ? edgePxToPct(cfg.edgeWidth ?? 0, this.fx.pageMinSide()) : (cfg.edgeWidth ?? 0);
  }
  onEdgeSlider(cfg: DitherConfig, v: string): void {
    if (!this.selectedRasterLayerId) return;
    const px = this.edgeInPct(cfg) ? edgePctToPx(+v / 10, this.fx.pageMinSide()) : edgeSliderToPx(+v);
    this.fx.onLayerDitherEdgeWidthChange(this.selectedRasterLayerId, px);
  }
  onEdgeNumber(cfg: DitherConfig, v: string): void {
    if (!this.selectedRasterLayerId || v === '') return;
    const px = this.edgeInPct(cfg) ? edgePctToPx(+v, this.fx.pageMinSide()) : +v;
    this.fx.onLayerDitherEdgeWidthChange(this.selectedRasterLayerId, px);
  }
}
