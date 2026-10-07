import { Component } from '@angular/core';
import { ArmAnimService } from '../arm-anim.service';
import { ArmBindingService } from '../arm-binding.service';
import { ArmLibraryService } from '../arm-library.service';

/**
 * Skeleton clips: create, record a pose, play (over idle), library / global promote, delete.
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-clips-section',
  templateUrl: './arm-clips-section.component.html',
})
export class ArmClipsSectionComponent {
  constructor(public anim: ArmAnimService, public binding: ArmBindingService, public library: ArmLibraryService) {}
}
