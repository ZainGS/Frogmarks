import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { textureControlVisibility, type TextureControlVisibility } from '../../utils/scene3d-panel-visibility';

/** Mesh inspector: Texture (diffuse / normal map upload + clear, tiling / offset, triplanar). Extracted from illustration.component (refactor-plan 2.9D). */
@Component({
  selector: 'app-mesh-texture-section',
  templateUrl: './mesh-texture-section.component.html',
  styleUrls: ['./mesh-texture-section.component.scss'],
})
export class MeshTextureSectionComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Output() dirty = new EventEmitter<void>();
  @Output() texLibDirty = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId']) this.load();
  }

  /** Re-read the section from the engine (the editor calls this on a same-id re-select). */
  load(id: string | null = this.meshId): void {
    if (id) this._syncTextureFromMesh(id);
  }

  // -- Texture state for selected mesh
  scene3dDiffuseTextureSet = false;

  scene3dNormalMapSet = false;

  scene3dTexTileX = 1;

  scene3dTexTileY = 1;

  scene3dTexOffX = 0;

  scene3dTexOffY = 0;

  scene3dTriplanar = false;

  /** Which texture controls do anything (audit 2026-10-09 §2 #12-14). The render style is read LIVE from the mesh —
   *  the Material section changes it without telling this one. */
  get controls(): TextureControlVisibility {
    let style: string | undefined;
    try { style = this.meshId ? (this.shapeManager?.scene3d?.getMesh(this.meshId) as any)?.material?.renderStyle : undefined; } catch { style = undefined; }
    return textureControlVisibility(style ?? 'default', {
      diffuse: this.scene3dDiffuseTextureSet, normalMap: this.scene3dNormalMapSet, triplanar: this.scene3dTriplanar,
    });
  }

  scene3dTexTilingChanged(): void {
    if (!this.meshId) return;
    this.shapeManager.setMeshTextureTiling3D(
      this.meshId, this.scene3dTexTileX, this.scene3dTexTileY, this.scene3dTexOffX, this.scene3dTexOffY);
    this.dirty.emit();
  }

  scene3dTriplanarChanged(): void {
    if (!this.meshId) return;
    this.shapeManager.setMeshTriplanar3D(this.meshId, this.scene3dTriplanar);
    this.dirty.emit();
  }

  /** Texture slots, tiling / offset and triplanar from the mesh. */
  _syncTextureFromMesh(id: string): void {
    const mesh = this.shapeManager.scene3d?.getMesh(id);
    if (!mesh) return;
    this.scene3dDiffuseTextureSet = !!(mesh.textureLibraryId ?? mesh.diffuseTexture);
    this.scene3dNormalMapSet = !!mesh.normalMapLibraryId;
    const uvT = this.shapeManager.getMeshTextureTiling3D(id);
    [this.scene3dTexTileX, this.scene3dTexTileY, this.scene3dTexOffX, this.scene3dTexOffY] = uvT ?? [1, 1, 0, 0];
    this.scene3dTriplanar = this.shapeManager.getMeshTriplanar3D(id) ?? false;
  }

  async scene3dUploadDiffuseTexture(event: Event): Promise<void> {
    if (!this.meshId) return;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await this.shapeManager.scene3d?.setMeshTexture(this.meshId, file);
    this.scene3dDiffuseTextureSet = true;
    this.texLibDirty.emit();
    (event.target as HTMLInputElement).value = '';
  }

  scene3dClearDiffuseTexture(): void {
    if (!this.meshId) return;
    this.shapeManager.scene3d?.clearMeshTexture(this.meshId);
    this.scene3dDiffuseTextureSet = false;
    this.texLibDirty.emit();
  }

  async scene3dUploadNormalMap(event: Event): Promise<void> {
    if (!this.meshId) return;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const sm = this.shapeManager;
    const result = await sm.uploadAndApplyNormalMap3D(this.meshId, file);
    if (result != null) {
      this.scene3dNormalMapSet = true;
      this.texLibDirty.emit();
    }
    (event.target as HTMLInputElement).value = '';
  }

  scene3dClearNormalMap(): void {
    if (!this.meshId) return;
    this.shapeManager.clearMeshNormalMap3D(this.meshId);
    this.scene3dNormalMapSet = false;
    this.texLibDirty.emit();
  }
}
