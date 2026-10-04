import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state the decal tool uses. */
export type DecalHost = Pick<IllustrationComponent, 'shapeManager' |
  'scene3dMarkDirty' | 'scene3dRefreshMeshes' | 'scene3dSelectedIsDecal' | 'clearMeshSelection' 
>;

/**
 * Decal tool: place decals from an uploaded image or a procedural ephemera generator (category / type / params),
 * size + rotation of the selected decal, delete. Component-scoped (provided by IllustrationComponent). Bodies moved
 * verbatim from illustration.component (refactor-plan 2.9E).
 */
@Injectable()
export class DecalService implements OnDestroy {
  private host!: DecalHost;
  constructor(private editorState: EditorStateService) {}
  bind(host: DecalHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
  }

  // Decal tool
  scene3dDecalToolActive   = false;

  scene3dSelectedDecalId: string | null = null;

  decalSize        = 2.0;

  decalRotation    = 0;

  decalSourceTab: 'ephemera' | 'image' = 'ephemera';

  decalImageDataUrl        = '';

  decalEphemeraCategories: any[] = [];

  decalEphemeraGenerators: any[] = [];

  decalActiveCategoryId    = '';

  decalActiveTypeId        = '';

  decalEphemeraSchema: any[] = [];

  decalEphemeraParams: Record<string, any> = {};

  scene3dToggleDecalTool(): void {
    if (this.scene3dDecalToolActive) {
      this.scene3dDecalToolActive = false;
      this.shapeManager.exitDecalPlaceMode3D();
    } else {
      this.scene3dDecalToolActive = true;
      this._refreshDecalEphemeraCategories();
    }
  }

  _refreshDecalEphemeraCategories(): void {
    const sm = this.shapeManager;
    this.decalEphemeraCategories = sm.getEphemeraCategories() ?? [];
    if (this.decalEphemeraCategories.length && !this.decalActiveCategoryId) {
      this.selectDecalCategory(this.decalEphemeraCategories[0].id);
    } else if (this.decalActiveCategoryId) {
      this.selectDecalCategory(this.decalActiveCategoryId);
    }
  }

  selectDecalCategory(id: string): void {
    this.decalActiveCategoryId = id;
    const sm = this.shapeManager;
    this.decalEphemeraGenerators = sm.getEphemeraGeneratorsByCategory(id) ?? [];
    if (this.decalEphemeraGenerators.length) {
      this.selectDecalGenerator(this.decalEphemeraGenerators[0].typeId);
    }
  }

  selectDecalGenerator(typeId: string): void {
    this.decalActiveTypeId = typeId;
    const sm = this.shapeManager;
    const gen = sm.getEphemeraGenerator(typeId);
    this.decalEphemeraSchema = gen?.getParamSchema?.() ?? [];
    this.decalEphemeraParams = {};
    for (const s of this.decalEphemeraSchema) {
      this.decalEphemeraParams[s.key] = s.default;
    }
    if (this.scene3dDecalToolActive) this._enterDecalPlaceMode();
  }

  onDecalEphemeraParamChange(key: string, value: any, type: string): void {
    this.decalEphemeraParams[key] = (type === 'range' || type === 'seed') ? +value : value;
    if (this.scene3dDecalToolActive) this._enterDecalPlaceMode();
  }

  onDecalImageUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.decalImageDataUrl = (e.target?.result as string) ?? '';
      if (this.scene3dDecalToolActive) this._enterDecalPlaceMode();
    };
    reader.readAsDataURL(file);
  }

  _buildDecalSource(): { kind: 'ephemera'; typeId: string; params: Record<string, unknown> } | { kind: 'image'; dataUrl: string } | null {
    if (this.decalSourceTab === 'ephemera') {
      if (!this.decalActiveTypeId) return null;
      return { kind: 'ephemera', typeId: this.decalActiveTypeId, params: { ...this.decalEphemeraParams } };
    } else {
      if (!this.decalImageDataUrl) return null;
      return { kind: 'image', dataUrl: this.decalImageDataUrl };
    }
  }

  _decalMetresPerUnit(): number {
    return this.shapeManager.cityMetresPerUnit() ?? 15;
  }

  _enterDecalPlaceMode(): void {
    const source = this._buildDecalSource();
    if (!source) return;
    this.shapeManager.enterDecalPlaceMode3D(source, {
      size: this.decalSize,
      rotation: this.decalRotation,
      metresPerUnit: this._decalMetresPerUnit(),
    });
  }

  scene3dUpdateDecalSize(): void {
    const sm = this.shapeManager;
    const mpu = this._decalMetresPerUnit();
    if (this.scene3dDecalToolActive) {
      sm.setDecalToolSize3D(this.decalSize, mpu);
    } else if (this.scene3dSelectedDecalId) {
      sm.setDecalSize3D(this.scene3dSelectedDecalId, this.decalSize, mpu);
      this.host.scene3dMarkDirty();
    }
  }

  scene3dUpdateDecalRotation(): void {
    const sm = this.shapeManager;
    if (this.scene3dDecalToolActive) {
      sm.setDecalToolRotation3D(this.decalRotation);
    } else if (this.scene3dSelectedDecalId) {
      sm.setDecalRotation3D(this.scene3dSelectedDecalId, this.decalRotation);
      this.host.scene3dMarkDirty();
    }
  }

  scene3dDeleteDecal(): void {
    if (!this.scene3dSelectedDecalId) return;
    this.shapeManager.removeDecal3D(this.scene3dSelectedDecalId);
    this.host.scene3dSelectedIsDecal = false;
    this.scene3dSelectedDecalId = null;
    this.host.clearMeshSelection();
    this.host.scene3dRefreshMeshes();
    this.host.scene3dMarkDirty();
  }

  scene3dOutlinerDeleteDecal(id: string): void {
    this.shapeManager.removeDecal3D(id);
    if (this.scene3dSelectedDecalId === id) {
      this.host.scene3dSelectedIsDecal = false;
      this.scene3dSelectedDecalId = null;
      this.host.clearMeshSelection();
    }
    this.host.scene3dRefreshMeshes();
    this.host.scene3dMarkDirty();
  }
}
