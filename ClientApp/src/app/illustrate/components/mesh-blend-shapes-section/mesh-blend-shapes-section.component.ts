import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';

/** Mesh inspector: Blend Shapes (weights + per-shape keyframes at the current frame). Shown only for a mesh that
 *  has blend shapes. Extracted from illustration.component (refactor-plan 2.9D). */
@Component({
  selector: 'app-mesh-blend-shapes-section',
  templateUrl: './mesh-blend-shapes-section.component.html',
  styleUrls: ['./mesh-blend-shapes-section.component.scss'],
})
export class MeshBlendShapesSectionComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Output() dirty = new EventEmitter<void>();
  constructor(private animationService: RasterAnimationService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId']) this.load();
  }

  /** Shapes + their keyframe tracks (the editor calls this on a same-id re-select). */
  load(id: string | null = this.meshId): void {
    this.scene3dBlendShapes = id ? (this.shapeManager.getBlendShapes3D(id) ?? []) : [];
    this._refreshBlendKeyframeTracks();
  }

  /** Re-read the weights (gizmo / undo / animation changed them). */
  syncWeights(): void {
    if (!this.meshId) return;
    const fresh = this.shapeManager.getBlendShapes3D(this.meshId);
    if (fresh) this.scene3dBlendShapes = fresh;
  }

  /** Keyframe tracks changed (recorded / removed elsewhere). */
  refreshKeyframes(): void { this._refreshBlendKeyframeTracks(); }

  // -- Blend shapes (morph targets) for selected mesh
  scene3dBlendShapes: Array<{name: string; weight: number}> = [];

  scene3dSetBlendWeight(index: number, weight: number): void {
    if (!this.meshId) return;
    this.shapeManager.setBlendWeight3D(this.meshId, index, weight);
    this.dirty.emit();
  }

  scene3dBlendKeyframeTracks: Record<string, {frame: number; value: number; easing?: string}[]> | null = null;

  _refreshBlendKeyframeTracks(): void {
    if (!this.meshId) { this.scene3dBlendKeyframeTracks = null; return; }
    this.scene3dBlendKeyframeTracks = this.shapeManager.getBlendShapeKeyframeTracks3D(this.meshId) ?? null;
  }

  scene3dBlendShapeHasKeyframe(shapeName: string): boolean {
    const track = this.scene3dBlendKeyframeTracks?.[shapeName];
    if (!track?.length) return false;
    const frame = this.animationService.getCurrentFrame?.() ?? 1;
    return track.some((kf: any) => kf.frame === frame);
  }

  scene3dToggleBlendShapeKeyframe(shapeName: string, weight: number): void {
    if (!this.meshId) return;
    const sm = this.shapeManager;
    const frame = this.animationService.getCurrentFrame?.() ?? 1;
    if (this.scene3dBlendShapeHasKeyframe(shapeName)) {
      sm.removeBlendShapeKeyframe3D(this.meshId, shapeName, frame);
    } else {
      sm.setBlendShapeKeyframe3D(this.meshId, shapeName, frame, weight);
    }
    this._refreshBlendKeyframeTracks();
    this.dirty.emit();
  }
}
