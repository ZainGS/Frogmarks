import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ArmRigService } from '../arm-rig.service';
import { ArmBindingService } from '../arm-binding.service';
import { ArmPickService } from '../arm-pick.service';

/**
 * Weight paint: joint, brush, display, enter / exit, normalize.
 * One section of the Armature UI, shared by the classic <app-armature-panel> and the mode chrome's
 * <app-armature-mode> (UI review 2026-10-07 §4). Reads / writes the panel-scoped arm-* services its host provides;
 * styled by <app-arm-sections> (arm-sections.scss).
 */
@Component({
  selector: 'app-arm-weight-section',
  templateUrl: './arm-weight-section.component.html',
})
export class ArmWeightSectionComponent {
  /** Mode chrome: Enter Paint / Painting switch the Weight Brush tool (paint emits the wanted state). */
  @Input() chrome = false;
  @Output() paint = new EventEmitter<boolean>();

  togglePaint(): void {
    const on = !this.binding.wpActive;
    if (this.chrome) { this.paint.emit(on); return; }
    if (on) this.binding.enterWeightPaint(); else this.binding.exitWeightPaint();
  }

  /** Arm a one-shot tap: the joint tapped in the viewport becomes the painted joint. */
  pickJoint(): void {
    this.pick.arm({ id: 'weight-joint', label: 'Tap the joint to paint in the viewport', onPick: (j) => this.rig.selectJoint(j) });
  }

  constructor(public rig: ArmRigService, public binding: ArmBindingService, public pick: ArmPickService) {}
}
