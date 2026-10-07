import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { transformVec3 } from '../../utils/transform-fields';

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

  // Only whole numbers are applied (utils/transform-fields.ts): a "-" being typed or a cleared field waits; blur
  // (onFieldBlur) puts the mesh's real value back in a field left unfinished.

  scene3dUpdateMeshPosition(): void {
    const v = transformVec3(this.scene3dMeshPosX, this.scene3dMeshPosY, this.scene3dMeshPosZ);
    if (!this.meshId || !v) return;
    this.shapeManager.scene3d?.setPosition(this.meshId, v[0], v[1], v[2]);
    this.dirty.emit();
  }

  scene3dUpdateMeshRotation(): void {
    const v = transformVec3(this.scene3dMeshRotX, this.scene3dMeshRotY, this.scene3dMeshRotZ);
    if (!this.meshId || !v) return;
    const d2r = Math.PI / 180;
    this.shapeManager.scene3d?.setRotation(this.meshId, v[0] * d2r, v[1] * d2r, v[2] * d2r);
    this.dirty.emit();
  }

  scene3dUpdateMeshScale(): void {
    const v = transformVec3(this.scene3dMeshScaleX, this.scene3dMeshScaleY, this.scene3dMeshScaleZ, { nonZero: true });
    if (!this.meshId || !v) return;
    this.shapeManager.scene3d?.setScale(this.meshId, v[0], v[1], v[2]);
    this.dirty.emit();
  }

  /** A field lost focus: show the mesh's real transform again (an unfinished "-" / empty field doesn't stay). */
  onFieldBlur(): void {
    this.load();
  }
}
