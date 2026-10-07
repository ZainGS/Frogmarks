import { Component } from '@angular/core';
import { ArmRigService } from '../arm-rig.service';
import { ArmBindingService } from '../arm-binding.service';

/**
 * Bind the mesh to the active skeleton.
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-bind-section',
  templateUrl: './arm-bind-section.component.html',
})
export class ArmBindSectionComponent {
  constructor(public rig: ArmRigService, public binding: ArmBindingService) {}
}
