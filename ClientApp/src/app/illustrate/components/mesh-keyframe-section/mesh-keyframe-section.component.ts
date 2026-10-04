import { Component, Input } from '@angular/core';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';
import { SceneAnimationService } from '../../services/scene-animation.service';

/** Mesh inspector: Keyframe Animation (record a transform keyframe at the current timeline frame, auto-key / flash
 *  state, how-to hint). A view over SceneAnimationService (refactor-plan 2.9D). */
@Component({
  selector: 'app-mesh-keyframe-section',
  templateUrl: './mesh-keyframe-section.component.html',
  styleUrls: ['./mesh-keyframe-section.component.scss'],
})
export class MeshKeyframeSectionComponent {
  @Input() animationEnabled = false;
  showHint = false;
  constructor(public anim: SceneAnimationService, private animationService: RasterAnimationService) {}
  /** Current raster timeline frame (1-based). */
  get timelineFrame(): number { return this.animationService.getCurrentFrame?.() ?? 1; }
}
