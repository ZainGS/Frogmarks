import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Scene3dSettingsService } from '../../services/scene3d-settings.service';

/** Global tab: Advanced (culling), grid visibility, grid snap, export, sky, reflections (SSR). A view over
 *  Scene3dSettingsService (refactor-plan 2.9B); the info tooltips are the editor's overlay. */
@Component({
  selector: 'app-scene-advanced-settings',
  templateUrl: './scene-advanced-settings.component.html',
  styleUrls: ['./scene-advanced-settings.component.scss'],
})
export class SceneAdvancedSettingsComponent {
  @Input() has3DScene = false;
  @Input() infoTips: Record<string, string> = {};
  @Output() showTip = new EventEmitter<{ event: MouseEvent; text: string }>();
  @Output() hideTip = new EventEmitter<void>();
  constructor(public s3: Scene3dSettingsService) {}
  mathRound(v: number): number { return Math.round(v); }
}
