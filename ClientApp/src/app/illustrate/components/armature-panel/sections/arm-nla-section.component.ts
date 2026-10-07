import { Component } from '@angular/core';
import { ArmAnimService } from '../arm-anim.service';
import { ArmBindingService } from '../arm-binding.service';

/**
 * NLA tracks: segments (clip by name), blend weights, seek, crossfade.
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-nla-section',
  templateUrl: './arm-nla-section.component.html',
})
export class ArmNlaSectionComponent {
  constructor(public anim: ArmAnimService, public binding: ArmBindingService) {}
}
