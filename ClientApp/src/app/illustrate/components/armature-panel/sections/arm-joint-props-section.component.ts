import { Component, Input } from '@angular/core';
import { ArmRigService } from '../arm-rig.service';
import { ArmPickService } from '../arm-pick.service';
import { NEEDS_ENGINE } from '../arm-engine';

/**
 * The selected joint: name (mode chrome), FK rotation, IK chain (length, pole joint, blend, target / pole position).
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-joint-props-section',
  templateUrl: './arm-joint-props-section.component.html',
})
export class ArmJointPropsSectionComponent {
  /** The mode chrome's layout: a titled block with the name field and the pole joint; rotation always shown. */
  @Input() chrome = false;
  /** How many joints are selected (multi-select on a newer Salsa). */
  @Input() selectionCount = 1;
  readonly needsEngine = NEEDS_ENGINE;

  rename(name: string): void {
    if (this.rig.selectedJointIdx !== null) this.rig.renameJoint(this.rig.selectedJointIdx, name);
  }

  /** Arm a one-shot tap: the next joint tapped in the viewport becomes the IK pole. */
  pickPole(): void {
    this.pick.arm({ id: 'ik-pole', label: 'Tap the pole joint in the viewport', onPick: (j) => this.rig.setIKPoleJoint(j) });
  }

  constructor(public rig: ArmRigService, public pick: ArmPickService) {}
}
