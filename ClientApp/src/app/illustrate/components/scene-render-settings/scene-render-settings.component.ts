import { Component } from '@angular/core';
import { Scene3dSettingsService } from '../../services/scene3d-settings.service';

/** Global tab: PS1 retro, environment style, lighting, background, fog, rendering, IBL, texture sampling,
 *  post-processing. A view over Scene3dSettingsService (refactor-plan 2.9B). */
@Component({
  selector: 'app-scene-render-settings',
  templateUrl: './scene-render-settings.component.html',
  styleUrls: ['./scene-render-settings.component.scss'],
})
export class SceneRenderSettingsComponent {
  constructor(public s3: Scene3dSettingsService) {}
  mathRound(v: number): number { return Math.round(v); }
}
