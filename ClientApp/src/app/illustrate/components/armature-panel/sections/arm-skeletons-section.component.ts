import { Component } from '@angular/core';
import { ArmRigService } from '../arm-rig.service';

/**
 * Skeleton list: create, pick the active skeleton, bone visibility.
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-skeletons-section',
  templateUrl: './arm-skeletons-section.component.html',
})
export class ArmSkeletonsSectionComponent {
  constructor(public rig: ArmRigService) {}
}
