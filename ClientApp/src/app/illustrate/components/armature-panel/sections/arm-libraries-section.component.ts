import { Component } from '@angular/core';
import { ArmRigService } from '../arm-rig.service';
import { ArmLibraryService } from '../arm-library.service';

/**
 * Animation Library (this document) and Global Library (every document).
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-libraries-section',
  templateUrl: './arm-libraries-section.component.html',
})
export class ArmLibrariesSectionComponent {
  constructor(public rig: ArmRigService, public library: ArmLibraryService) {}
}
