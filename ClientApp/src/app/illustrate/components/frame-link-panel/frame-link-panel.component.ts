import { Component, Input } from '@angular/core';
import { LayerEffectsService } from '../../services/layer-effects.service';

/** Per-layer Frame Link animation for the selected raster layer. A view over LayerEffectsService (refactor-plan 2.10a). */
@Component({
  selector: 'app-frame-link-panel',
  templateUrl: './frame-link-panel.component.html',
  styleUrls: ['./frame-link-panel.component.scss'],
})
export class FrameLinkPanelComponent {
  @Input() selectedRasterLayerId: string | null = null;
  mathRound(v: number): number { return Math.round(v); }
  constructor(public fx: LayerEffectsService) {}
}
