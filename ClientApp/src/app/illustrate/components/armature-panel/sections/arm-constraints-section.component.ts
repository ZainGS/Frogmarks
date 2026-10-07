import { Component } from '@angular/core';
import { ArmRigService } from '../arm-rig.service';
import { ArmPickService } from '../arm-pick.service';

/**
 * Bone constraints of the selected joint; the target is picked by name or by tapping a joint.
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-constraints-section',
  templateUrl: './arm-constraints-section.component.html',
})
export class ArmConstraintsSectionComponent {
  /** Arm a one-shot tap: the next joint tapped in the viewport becomes the constraint's target / source. */
  pickTarget(): void {
    this.pick.arm({
      id: 'constraint-target', label: 'Tap the target joint in the viewport',
      onPick: (j) => { if (j !== this.rig.selectedJointIdx) this.rig.newConstraintTarget = j; },
    });
  }

  constructor(public rig: ArmRigService, public pick: ArmPickService) {}
}
