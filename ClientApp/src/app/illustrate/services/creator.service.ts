import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

/** Exactly the editor state the procedural-creator actions use. */
export type CreatorHost = Pick<IllustrationComponent, 'shapeManager' |
  '_updateGizmoPosition' | 'scene3dCreatorTypesList' | 'scene3dMarkDirty' | 'scene3dRefreshMeshes'
>;

/**
 * Procedural creators (props from the engine's creator types): create / edit on a stage, the param schema + values,
 * seed reroll, promote to library, delete. Component-scoped (provided by IllustrationComponent). Bodies moved verbatim
 * from illustration.component (refactor-plan 2.9E).
 */
@Injectable()
export class CreatorService implements OnDestroy {
  private host!: CreatorHost;
  constructor() {}
  bind(host: CreatorHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
  }

  scene3dCreatorPanelOpen   = false;

  activeCreatorId: string | null = null;

  activeCreatorTypeId: string | null = null;

  creatorSchemaList: any[] = [];

  creatorParams: Record<string, any> = {};

  scene3dOpenCreator(typeId: string): void {
    const sm = this.shapeManager;
    this.activeCreatorTypeId = typeId;
    this.creatorSchemaList = sm.creatorParamSchema3D(typeId) ?? [];
    this.creatorParams = { ...(sm.creatorDefaults3D(typeId) ?? {}) };
    const result = sm.createCreator3D(typeId);
    this.activeCreatorId = result?.id ?? null;
    if (this.activeCreatorId) {
      sm.enterCreatorStage3D(this.activeCreatorId);
    }
    this.scene3dCreatorPanelOpen = true;
    this.host.scene3dRefreshMeshes();
    this.host._updateGizmoPosition();
    this.host.scene3dMarkDirty();
  }

  scene3dEditCreator(id: string): void {
    const sm = this.shapeManager;
    const typeId = sm.creatorTypeOf3D(id);
    if (!typeId) return;
    this.activeCreatorTypeId = typeId;
    this.activeCreatorId = id;
    this.creatorSchemaList = sm.creatorParamSchema3D(typeId) ?? [];
    this.creatorParams = { ...((sm.getCreatorParams3D(id) as any) ?? {}) };
    sm.enterCreatorStage3D(id);
    this.scene3dCreatorPanelOpen = true;
    this.host._updateGizmoPosition();
  }

  scene3dCloseCreatorPanel(): void {
    this.shapeManager.exitCreatorStage3D();
    this.scene3dCreatorPanelOpen = false;
    this.host._updateGizmoPosition();
    this.host.scene3dMarkDirty();
  }

  creatorSeedReroll(key: string): void {
    const seed = Math.floor(Math.random() * 999999);
    this.creatorParams[key] = seed;
    if (this.activeCreatorId) {
      this.shapeManager.setCreatorParams3D(this.activeCreatorId, { [key]: seed });
      this.host.scene3dMarkDirty();
    }
  }

  async scene3dCreatorPromoteToLibrary(): Promise<void> {
    if (!this.activeCreatorId || !this.activeCreatorTypeId) return;
    const sm = this.shapeManager;
    const label = this.host.scene3dCreatorTypesList.find(t => t.typeId === this.activeCreatorTypeId)?.label
      ?? this.activeCreatorTypeId ?? 'Preset';
    await sm.promoteCreatorToLibrary3D(this.activeCreatorId, { name: label, tags: [this.activeCreatorTypeId!] });
  }

  onCreatorParamChange(key: string, value: any, type: string): void {
    this.creatorParams[key] = (type === 'range' || type === 'seed') ? +value : value;
    if (this.activeCreatorId) {
      this.shapeManager.setCreatorParams3D(this.activeCreatorId, { [key]: value });
      this.host.scene3dMarkDirty();
    }
  }

  scene3dDeleteCreator(): void {
    if (!this.activeCreatorId) return;
    this._removeCreatorById(this.activeCreatorId);
  }

  scene3dOutlinerDeleteCreator(id: string): void {
    this._removeCreatorById(id);
  }

  _removeCreatorById(id: string): void {
    const sm = this.shapeManager;
    if (this.scene3dCreatorPanelOpen && this.activeCreatorId === id) {
      sm.exitCreatorStage3D();
      this.scene3dCreatorPanelOpen = false;
    }
    sm.removeCreator3D(id);
    if (this.activeCreatorId === id) this.activeCreatorId = null;
    this.host.scene3dRefreshMeshes();
    this.host._updateGizmoPosition();
    this.host.scene3dMarkDirty();
  }

  creatorGroups(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of this.creatorSchemaList) {
      const g = s.group ?? '';
      if (!seen.has(g)) { seen.add(g); out.push(g); }
    }
    return out;
  }

  schemaForGroup(group: string): any[] {
    return this.creatorSchemaList.filter(s => (s.group ?? '') === group);
  }
}
