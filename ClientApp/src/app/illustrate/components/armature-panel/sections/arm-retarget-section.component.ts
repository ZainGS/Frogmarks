import { Component } from '@angular/core';
import { ArmRigService } from '../arm-rig.service';
import { ArmAnimService } from '../arm-anim.service';

/**
 * Retarget a clip to another skeleton (joints matched by name).
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-retarget-section',
  templateUrl: './arm-retarget-section.component.html',
})
export class ArmRetargetSectionComponent {
  constructor(public rig: ArmRigService, public anim: ArmAnimService) {}
}
