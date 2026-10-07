import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { colorToHex, hexToRgba01, hexToRgba01Obj } from '../../utils/color-utils';

/** The engine's mesh render styles (derived, so new ones such as 'cel-hd' are covered — the hand list missed it). */
type MeshRenderStyle = Parameters<ShapeManager['setRenderStyle3D']>[1];

/** Mesh inspector: Material (colour, opacity, render style, roughness / metalness, env reflection, planar reflector, fog, sketch paper, surfaces, ground material + scatter, submesh slots). Extracted from illustration.component (refactor-plan 2.9D). */
@Component({
  selector: 'app-mesh-material-section',
  templateUrl: './mesh-material-section.component.html',
  styleUrls: ['./mesh-material-section.component.scss'],
})
export class MeshMaterialSectionComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Input() scene3dSelectedMeshType: string = '';
  @Input() scene3dSketchPaper: number = 0.75;
  mathRound(v: number): number { return Math.round(v); }
  /** Which material-slot action is asking first: a slot index (its ✕) or 'single' (back to one material). */
  confirmMaterial: number | 'single' | null = null;
  @Output() dirty = new EventEmitter<void>();
  @Output() sketchPaperEdited = new EventEmitter<number>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId']) { this.confirmMaterial = null; this.load(); }
  }

  /** Re-read the section from the engine (the editor calls this on a same-id re-select). */
  load(id: string | null = this.meshId): void {
    if (id) this._syncMaterialFromMesh(id);
  }

  scene3dMeshColor = '#ffffff';

  scene3dMeshOpacity = 1.0;

  scene3dMeshRoughness = 0.5;

  scene3dMeshMetalness = 0.0;

  scene3dMeshNoEnvReflection = false;

  scene3dMeshPlanarReflector = false;

  /** Material3D.noFog (Salsa 2026-10-01): '' = fogged, 'always' = never fogged, 'hardEdge' = no fog only under Hard edge. */
  scene3dMeshNoFog: '' | 'always' | 'hardEdge' = '';

  groundSurface = 'ashlar';

  groundTileMm = 600;

  groundGroutMm = 15;

  groundTintHex = '#ccc09e';

  groundExtentM = 20;

  groundWeather: 'new' | 'worn' | 'ancient' | 'mossy' | 'dirty' = 'worn';

  groundMossTintHex = '#4a6741';

  groundDirtTintHex = '#5a3a1a';

  groundWearTrack = false;

  groundWedges = 12;

  groundRingMm = 600;

  groundScatterGroupId: string | null = null;

  groundScatterFlowers = 1.0;

  groundScatterPebbles = 1.0;

  groundScatterTallGrass = 1.0;

  groundScatterBushes = 1.0;

  groundScatterRocks = 1.0;

  // -- Multi-material submesh slots
  scene3dSubmeshes: Array<{ label: string; color: string; opacity: number; renderStyle: string }> = [];

  /** Material fields, surfaces and submesh slots from the mesh. */
  _syncMaterialFromMesh(id: string): void {
    const mesh = this.shapeManager.scene3d?.getMesh(id);
    if (!mesh) return;
    this.scene3dMeshOpacity = mesh.material?.opacity ?? 1;
    // diffuse is an RGBA object — the old d[0]/d[1]/d[2] read gave undefined → invalid hex
    const d = mesh.material?.diffuse;
    this.scene3dMeshColor = d
      ? '#' + [d.r, d.g, d.b].map((v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')
      : '#ffffff';
    this.scene3dRenderStyle = (mesh.material?.renderStyle ?? 'default') as any;
    this.scene3dMeshRoughness = mesh.material?.roughness ?? 0.5;
    this.scene3dMeshMetalness = mesh.material?.metalness ?? 0.0;
    this.scene3dMeshNoEnvReflection = mesh.material?.noEnvReflection ?? false;
    this.scene3dMeshPlanarReflector = mesh.material?.planarReflector ?? false;
    { const nf = (mesh.material as any)?.noFog; this.scene3dMeshNoFog = nf === true ? 'always' : nf === 'hardEdge' ? 'hardEdge' : ''; }
    this.scene3dLoadSurfaces();
    // Load submesh slots
    this._scene3dReloadSubmeshes();
  }

  scene3dUpdateMeshColor(): void {
    if (!this.meshId) return;
    const c = hexToRgba01Obj(this.scene3dMeshColor);
    this.shapeManager.scene3d?.setDiffuseColor(
      this.meshId, c.r, c.g, c.b);
    this.dirty.emit();
  }

  scene3dUpdateMeshOpacity(): void {
    if (!this.meshId) return;
    this.shapeManager.scene3d?.setOpacity(this.meshId, +this.scene3dMeshOpacity);
    this.dirty.emit();
  }

  scene3dUpdateMeshRoughness(): void {
    if (!this.meshId) return;
    this.shapeManager.setMeshRoughness3D(this.meshId, this.scene3dMeshRoughness);
    this.dirty.emit();
  }

  scene3dUpdateMeshMetalness(): void {
    if (!this.meshId) return;
    this.shapeManager.setMeshMetalness3D(this.meshId, this.scene3dMeshMetalness);
    this.dirty.emit();
  }

  scene3dUpdateMeshNoEnvReflection(): void {
    if (!this.meshId) return;
    this.shapeManager.setMeshNoEnvReflection3D(this.meshId, this.scene3dMeshNoEnvReflection);
    this.dirty.emit();
  }

  /** Per-object NO FOG (Salsa sm.setMeshNoFog3D): skip the scene fog for this mesh (sky domes, clouds, backdrops). */
  scene3dUpdateMeshNoFog(): void {
    if (!this.meshId) return;
    const mode = this.scene3dMeshNoFog === 'always' ? true : this.scene3dMeshNoFog === 'hardEdge' ? 'hardEdge' : false;
    this.shapeManager.setMeshNoFog3D(this.meshId, mode);
    this.dirty.emit();
  }

  scene3dUpdateMeshPlanarReflector(): void {
    if (!this.meshId) return;
    this.shapeManager.setMeshPlanarReflector3D(this.meshId, this.scene3dMeshPlanarReflector);
    this.dirty.emit();
  }

  applyGroundMaterial(): void {
    if (!this.meshId) return;
    const tint = hexToRgba01(this.groundTintHex);
    const moss = hexToRgba01(this.groundMossTintHex);
    const dirt = hexToRgba01(this.groundDirtTintHex);
    const opts: any = {
      surface: this.groundSurface,
      tileMm: this.groundTileMm,
      groutMm: this.groundGroutMm,
      tint: [tint[0], tint[1], tint[2]],
      extentMeters: this.groundExtentM,
      weather: this.groundWeather,
      mossTint: [moss[0], moss[1], moss[2]],
      dirtTint: [dirt[0], dirt[1], dirt[2]],
    };
    if (this.groundSurface === 'radialMedallion') {
      opts.wedges = this.groundWedges;
      opts.ringMm = this.groundRingMm;
    }
    if (this.groundWearTrack) opts.wearPath = [0.5, 0.5, 0.25];
    this.shapeManager.applyGroundMaterial3D(this.meshId, opts);
    this.dirty.emit();
  }

  clearGroundMaterial(): void {
    if (!this.meshId) return;
    this.shapeManager.clearGroundMaterial3D(this.meshId);
    this.dirty.emit();
  }

  applyGroundScatter(): void {
    if (!this.meshId) return;
    const sm = this.shapeManager;
    if (this.groundScatterGroupId) {
      sm.clearGroundScatter3D(this.groundScatterGroupId);
      this.groundScatterGroupId = null;
    }
    const groupId = sm.scatterOnGround3D(this.meshId, {
      flowers:   this.groundScatterFlowers,
      pebbles:   this.groundScatterPebbles,
      tallGrass: this.groundScatterTallGrass,
      bushes:    this.groundScatterBushes,
      rocks:     this.groundScatterRocks,
      wearPath:  this.groundWearTrack ? [0.5, 0.5, 0.25] : null,
    });
    if (groupId) this.groundScatterGroupId = groupId;
    this.dirty.emit();
  }

  clearGroundScatter(): void {
    if (!this.groundScatterGroupId) return;
    this.shapeManager.clearGroundScatter3D(this.groundScatterGroupId);
    this.groundScatterGroupId = null;
    this.dirty.emit();
  }

  scene3dRenderStyle: MeshRenderStyle = 'default';

  scene3dSetRenderStyle(style: MeshRenderStyle): void {
    if (!this.meshId) return;
    this.scene3dRenderStyle = style;
    this.shapeManager.setRenderStyle3D(this.meshId, style);
    this.dirty.emit();
  }

  scene3dSurfacesList: string[] = [];

  scene3dLoadSurfaces(): void {
    if (this.scene3dSurfacesList.length) return;
    const list: string[] = this.shapeManager.surfaceMaterials3D() ?? [];
    this.scene3dSurfacesList = list;
    if (list.length && !list.includes(this.groundSurface)) {
      this.groundSurface = list[0];
    }
  }

  scene3dFormatSurfaceName(s: string): string {
    return s
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^\w/, c => c.toUpperCase())
      .trim();
  }

  _scene3dReloadSubmeshes(): void {
    const sm = this.shapeManager;
    const id = this.meshId;
    if (!id) { this.scene3dSubmeshes = []; return; }
    const rawSubs: any[] = sm.getMeshSubmeshes3D(id) ?? [];
    this.scene3dSubmeshes = rawSubs.map((s: any, i: number) => {
      const d = s.material?.diffuse ?? s.material?.diffuseColor;
      // `diffuse` is an {r,g,b,a} object, `diffuseColor` an array — d[0..2] on the object gave #NaNNaNNaN
      const color = d ? colorToHex(d) : '#ffffff';
      return {
        label: s.label ?? `Slot ${i}`,
        color,
        opacity: s.material?.opacity ?? 1,
        renderStyle: s.material?.renderStyle ?? 'default',
      };
    });
  }

  scene3dUpdateSubmeshColor(slotIndex: number): void {
    const id = this.meshId; if (!id) return;
    const sm = this.shapeManager;
    const c = hexToRgba01Obj(this.scene3dSubmeshes[slotIndex].color);
    const rawSubs: any[] = sm.getMeshSubmeshes3D(id) ?? [];
    const s = rawSubs[slotIndex]; if (!s) return;
    sm.setMeshSubmesh3D(id, slotIndex, { material: { ...s.material, diffuseColor: [c.r, c.g, c.b, s.material?.opacity ?? 1] } });
    this.dirty.emit();
  }

  scene3dUpdateSubmeshOpacity(slotIndex: number): void {
    const id = this.meshId; if (!id) return;
    const sm = this.shapeManager;
    const rawSubs: any[] = sm.getMeshSubmeshes3D(id) ?? [];
    const s = rawSubs[slotIndex]; if (!s) return;
    sm.setMeshSubmesh3D(id, slotIndex, { material: { ...s.material, opacity: this.scene3dSubmeshes[slotIndex].opacity } });
    this.dirty.emit();
  }

  scene3dUpdateSubmeshRenderStyle(slotIndex: number, style: string): void {
    const id = this.meshId; if (!id) return;
    const sm = this.shapeManager;
    const rawSubs: any[] = sm.getMeshSubmeshes3D(id) ?? [];
    const s = rawSubs[slotIndex]; if (!s) return;
    sm.setMeshSubmesh3D(id, slotIndex, { material: { ...s.material, renderStyle: style } });
    this.scene3dSubmeshes[slotIndex].renderStyle = style;
    this.dirty.emit();
  }

  scene3dUpdateSubmeshLabel(slotIndex: number): void {
    const id = this.meshId; if (!id) return;
    this.shapeManager.setMeshSubmesh3D(id, slotIndex, { label: this.scene3dSubmeshes[slotIndex].label });
    this.dirty.emit();
  }

  scene3dRemoveSubmesh(slotIndex: number): void {
    const id = this.meshId; if (!id) return;
    this.shapeManager.removeMeshSubmesh3D(id, slotIndex);
    this._scene3dReloadSubmeshes();
    this.dirty.emit();
  }

  scene3dAddSubmesh(): void {
    const id = this.meshId; if (!id) return;
    const label = `Slot ${this.scene3dSubmeshes.length + 1}`;
    this.shapeManager.appendMeshSubmesh3D(id, {
      label,
      material: { diffuse: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, renderStyle: 'default' },
    } as any);
    this._scene3dReloadSubmeshes();
    this.dirty.emit();
  }

  scene3dClearSubmeshes(): void {
    const id = this.meshId; if (!id) return;
    this.shapeManager.clearMeshSubmeshes3D(id);
    this.scene3dSubmeshes = [];
    this.dirty.emit();
  }
}
