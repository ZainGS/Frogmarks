import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** Mesh inspector: Transform (position / rotation in degrees / scale). Extracted from illustration.component (refactor-plan 2.9D). */
@Component({
  selector: 'app-mesh-transform-section',
  templateUrl: './mesh-transform-section.component.html',
  styleUrls: ['./mesh-transform-section.component.scss'],
})
export class MeshTransformSectionComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Output() dirty = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId']) this.load();
  }

  /** Re-read the section from the engine (the editor calls this on a same-id re-select). */
  load(id: string | null = this.meshId): void {
    if (id) this._syncTransformFromMesh(id);
  }

  scene3dMeshPosX = 0; scene3dMeshPosY = 0; scene3dMeshPosZ = 0;

  scene3dMeshRotX = 0; scene3dMeshRotY = 0; scene3dMeshRotZ = 0;

  scene3dMeshScaleX = 1; scene3dMeshScaleY = 1; scene3dMeshScaleZ = 1;

  /** Transform fields from the mesh (engine radians → degrees). */
  _syncTransformFromMesh(id: string): void {
    const mesh = this.shapeManager.scene3d?.getMesh(id);
    if (!mesh) return;
    this.scene3dMeshPosX = mesh.x ?? 0;
    this.scene3dMeshPosY = mesh.y ?? 0;
    this.scene3dMeshPosZ = mesh.z ?? 0;
    // Engine stores radians — convert to degrees for UI.
    // (Was mesh.rotation?.x / mesh.scale?.x — fields that never existed, so the
    // inspector always showed rot 0 / scale 1 regardless of the real transform.)
    const r2d = 180 / Math.PI;
    this.scene3dMeshRotX = (mesh.rotationX ?? 0) * r2d;
    this.scene3dMeshRotY = (mesh.rotationY ?? 0) * r2d;
    this.scene3dMeshRotZ = (mesh.rotation ?? 0) * r2d;
    this.scene3dMeshScaleX = mesh.scaleX ?? 1;
    this.scene3dMeshScaleY = mesh.scaleY ?? 1;
    this.scene3dMeshScaleZ = mesh.scaleZ ?? 1;
  }

  scene3dUpdateMeshPosition(): void {
    if (!this.meshId) return;
    this.shapeManager.scene3d?.setPosition(
      this.meshId, +this.scene3dMeshPosX, +this.scene3dMeshPosY, +this.scene3dMeshPosZ);
    this.dirty.emit();
  }

  scene3dUpdateMeshRotation(): void {
    if (!this.meshId) return;
    const d2r = Math.PI / 180;
    this.shapeManager.scene3d?.setRotation(
      this.meshId, +this.scene3dMeshRotX * d2r, +this.scene3dMeshRotY * d2r, +this.scene3dMeshRotZ * d2r);
    this.dirty.emit();
  }

  scene3dUpdateMeshScale(): void {
    if (!this.meshId) return;
    this.shapeManager.scene3d?.setScale(
      this.meshId, +this.scene3dMeshScaleX, +this.scene3dMeshScaleY, +this.scene3dMeshScaleZ);
    this.dirty.emit();
  }
}
