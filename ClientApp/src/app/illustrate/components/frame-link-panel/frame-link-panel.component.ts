import { Component, Input } from '@angular/core';
import { LayerEffectsService } from '../../services/layer-effects.service';
import type { FrameLinkAnimation, FrameLinkAnimationType } from '../../../boards/models/brush-preset.model';

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

  // What the compositor's displacement shader reads per type (Salsa raster-compositor computeDisplacementAt):
  // Shake jitters once per frame from frame + seed only; only Wave reads the direction.
  showSpeed(type: FrameLinkAnimationType): boolean { return type !== 'shake'; }
  showPhase(type: FrameLinkAnimationType): boolean { return type !== 'shake'; }
  showDirection(type: FrameLinkAnimationType): boolean { return type === 'wave'; }
  /** Loop to Fit rounds the speed to whole cycles for the periodic types (the noise types cross-fade instead). */
  fitsWholeCycles(type: FrameLinkAnimationType): boolean { return type === 'wave' || type === 'ripple'; }

  /** The Loop dropdown's tooltip: what the current mode does for this type. */
  loopModeHint(cfg: Pick<FrameLinkAnimation, 'type' | 'loopMode'>): string {
    if (cfg.loopMode !== 'loop-to-fit') return 'Free: keeps moving at its speed, never repeating to the play range.';
    if (cfg.type === 'shake') return 'Loop to Fit: the same jitter repeats every time the play range loops.';
    if (this.fitsWholeCycles(cfg.type)) return 'Loop to Fit: the speed is rounded to a whole number of cycles over the play range, so the loop is seamless.';
    return 'Loop to Fit: the motion blends back into its first frame by the end of the play range, so the loop is seamless.';
  }
}
