import { Component } from '@angular/core';
import { SceneAnimationService } from '../../services/scene-animation.service';

/** Global tab: 3D animation player + timeline sync, and the Play-mode player object (locomotion, blend, overlay). A view over SceneAnimationService (refactor-plan 2.7e). */
@Component({
  selector: 'app-scene-anim-section',
  templateUrl: './scene-anim-section.component.html',
  styleUrls: ['./scene-anim-section.component.scss'],
})
export class SceneAnimSectionComponent {
  constructor(public anim: SceneAnimationService) {}
}
