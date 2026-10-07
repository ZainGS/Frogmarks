import { Component, Input } from '@angular/core';
import { ArmBindingService } from '../arm-binding.service';
import { ArmLibraryService } from '../arm-library.service';
import { ExperimentalSettingsService } from '../../../services/experimental-settings.service';

/**
 * Pose library: capture, region filter / tag, apply, rename, delete, promote.
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-pose-library-section',
  templateUrl: './arm-pose-library-section.component.html',
})
export class ArmPoseLibrarySectionComponent {
  /** Mode chrome: the developer "Copy pose + body for Claude" lives in the header's ⋯ menu instead. */
  @Input() chrome = false;

  constructor(public binding: ArmBindingService, public library: ArmLibraryService, public exp: ExperimentalSettingsService) {}
}
