import { Component, Input } from '@angular/core';
import { ArmRigService } from '../arm-rig.service';

/**
 * The active skeleton's joint list: select, rename, remove; the classic panel's Add Bone placement button.
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-joints-section',
  templateUrl: './arm-joints-section.component.html',
})
export class ArmJointsSectionComponent {
  /** The classic panel's "+ Add Bone" placement button (the mode chrome has the Add Bone tool instead). */
  @Input() showAddBone = true;

  constructor(public rig: ArmRigService) {}
}
