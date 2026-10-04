import { Component, Input } from '@angular/core';
import { LayerEffectsService } from '../../services/layer-effects.service';
import { rgba01ToHex } from '../../utils/color-utils';
import { BAYER_LEVEL_OPTIONS, COLOR_LEVEL_OPTIONS, COLOR_MODE_OPTIONS, HALFTONE_SHAPE_OPTIONS } from 'app/boards/models/brush-preset.model';

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
  readonly halftoneShapeOptions = HALFTONE_SHAPE_OPTIONS;
  readonly colorModeOptions = COLOR_MODE_OPTIONS;
  mathRound(v: number): number { return Math.round(v); }
  constructor(public fx: LayerEffectsService) {}

  rgba01ToHex(c: [number, number, number, number]): string { return rgba01ToHex(c); }
}
