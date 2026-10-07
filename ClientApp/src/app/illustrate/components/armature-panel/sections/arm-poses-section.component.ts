import { Component } from '@angular/core';
import { ArmRigService } from '../arm-rig.service';
import { ArmLibraryService } from '../arm-library.service';

/**
 * Preset poses (procedural bodies).
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-poses-section',
  templateUrl: './arm-poses-section.component.html',
})
export class ArmPosesSectionComponent {
  constructor(public rig: ArmRigService, public library: ArmLibraryService) {}
}
