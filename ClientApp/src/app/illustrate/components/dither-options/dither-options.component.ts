import { Component } from '@angular/core';
import { LayerEffectsService } from '../../services/layer-effects.service';
import { BAYER_LEVEL_OPTIONS, COLOR_LEVEL_OPTIONS, COLOR_MODE_OPTIONS, HALFTONE_SHAPE_OPTIONS } from 'app/boards/models/brush-preset.model';

/** Misc tool (⚡ Effects): the global dither. A view over LayerEffectsService (refactor-plan 2.10a). */
@Component({
  selector: 'app-dither-options',
  templateUrl: './dither-options.component.html',
  styleUrls: ['./dither-options.component.scss'],
})
export class DitherOptionsComponent {
  readonly bayerLevelOptions = BAYER_LEVEL_OPTIONS;
  readonly colorLevelOptions = COLOR_LEVEL_OPTIONS;
  readonly halftoneShapeOptions = HALFTONE_SHAPE_OPTIONS;
  readonly colorModeOptions = COLOR_MODE_OPTIONS;
  mathRound(v: number): number { return Math.round(v); }
  constructor(public fx: LayerEffectsService) {}
}
