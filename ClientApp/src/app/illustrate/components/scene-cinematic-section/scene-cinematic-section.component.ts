import { Component } from '@angular/core';
import { SceneAnimationService } from '../../services/scene-animation.service';

/** Global tab: cinematic cameras (look-through) and camera cuts. A view over SceneAnimationService (refactor-plan 2.7e). */
@Component({
  selector: 'app-scene-cinematic-section',
  templateUrl: './scene-cinematic-section.component.html',
  styleUrls: ['./scene-cinematic-section.component.scss'],
})
export class SceneCinematicSectionComponent {
  constructor(public anim: SceneAnimationService) {}
}
