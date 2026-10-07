import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state the building / foliage / block panels use. */
export type ProceduralPanelsHost = Pick<IllustrationComponent, 'shapeManager' |
  '_updateGizmoPosition' | 'scene3dRefreshMeshes' | 'scene3dSelectMesh' | 'clearMeshSelection' | 'scene3dMarkDirty'
>;

/**
 * Procedural building / foliage / block (city block) editing: add, the selection flags, which editor panel is open and
 * for which id (the panel follows the selection or closes), editing a building inside a block, delete. Every add /
 * delete marks the document dirty (an add / delete raised no save of its own — it waited for an unrelated edit).
 * Component-scoped (provided by IllustrationComponent). Bodies moved verbatim from illustration.component
 * (refactor-plan 2.9H).
 */
@Injectable()
export class ProceduralPanelsService {
  private host!: ProceduralPanelsHost;
  constructor(private editorState: EditorStateService) {}
  bind(host: ProceduralPanelsHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  // Building Creator panel (node-kind id sets live in SceneOutlinerService)
  scene3dSelectedIsBuilding = false;
  scene3dEditBuildingId: string | null = null;
  scene3dEditBuildingPanelOpen = false;

  /** Archetype names for the Block panel's add-building select (fetched once; was only filled after editing a building). */
  get scene3dBuildingArchetypes(): string[] {
    if (!this._buildingArchetypes.length && this.shapeManager) this._buildingArchetypes = this.shapeManager.buildingArchetypeNames3D() ?? [];
    return this._buildingArchetypes;
  }

  _buildingArchetypes: string[] = [];

  // Foliage Creator panel
  scene3dSelectedIsFoliage = false;
  scene3dEditFoliageId: string | null = null;
  scene3dEditFoliagePanelOpen = false;

  // Block Creator panel
  scene3dSelectedIsBlock = false;
  scene3dEditBlockId: string | null = null;
  scene3dEditBlockPanelOpen = false;
  scene3dEditBlockBuildingIndex: number | null = null;

  async scene3dAddBuilding(): Promise<void> {
    const sm = this.shapeManager;
    const result = sm.createProceduralBuilding3D();
    if (!result?.id) return;
    this.host.scene3dRefreshMeshes();
    this.host.scene3dSelectMesh(result.id);
    this.host.scene3dMarkDirty();
  }

  scene3dToggleEditBuildingPanel(): void {
    this.scene3dEditBuildingPanelOpen = !this.scene3dEditBuildingPanelOpen;
    this.host._updateGizmoPosition();
    if (this.scene3dEditBuildingPanelOpen) {
      this.scene3dEditBuildingId = this.editorState.scene3dSelectedMeshId;   // <app-building-panel> loads its params on open
    }
  }

  scene3dDeleteBuilding(): void {
    const id = this.scene3dEditBuildingId;
    if (!id) return;
    this.shapeManager.removeBuilding3D(id);
    this.scene3dEditBuildingPanelOpen = false;
    this.scene3dEditBuildingId = null;
    this.host.clearMeshSelection();
    this.scene3dSelectedIsBuilding = false;
    this.host.scene3dRefreshMeshes();
    this.host._updateGizmoPosition();
    this.host.scene3dMarkDirty();
  }

  async scene3dAddFoliage(): Promise<void> {
    const sm = this.shapeManager;
    const result = sm.createProceduralFoliage3D();
    if (!result?.id) return;
    this.host.scene3dRefreshMeshes();
    this.host.scene3dSelectMesh(result.id);
    this.host.scene3dMarkDirty();
  }

  scene3dToggleEditFoliagePanel(): void {
    this.scene3dEditFoliagePanelOpen = !this.scene3dEditFoliagePanelOpen;
    this.host._updateGizmoPosition();
    if (this.scene3dEditFoliagePanelOpen) {
      this.scene3dEditFoliageId = this.editorState.scene3dSelectedMeshId;   // <app-foliage-panel> loads its params on open
    }
  }

  scene3dDeleteFoliage(): void {
    const id = this.scene3dEditFoliageId;
    if (!id) return;
    this.shapeManager.removeFoliage3D(id);
    this.scene3dEditFoliagePanelOpen = false;
    this.scene3dEditFoliageId = null;
    this.host.clearMeshSelection();
    this.scene3dSelectedIsFoliage = false;
    this.host.scene3dRefreshMeshes();
    this.host._updateGizmoPosition();
    this.host.scene3dMarkDirty();
  }

  async scene3dCreateBlock(): Promise<void> {
    const sm = this.shapeManager;
    const id = sm.createBlock3D();
    if (!id) return;
    this.host.scene3dRefreshMeshes();
    this.host.scene3dSelectMesh(id);
    this.host.scene3dMarkDirty();
  }

  scene3dToggleEditBlockPanel(): void {
    this.scene3dEditBlockPanelOpen = !this.scene3dEditBlockPanelOpen;
    if (!this.scene3dEditBlockPanelOpen) {
      this._exitBlockBuildingEdit();
    } else {
      this.scene3dEditBlockId = this.editorState.scene3dSelectedMeshId ?? null;   // <app-block-panel> loads on open
    }
    this.host._updateGizmoPosition();
  }

  scene3dSelectBlockBuilding(index: number): void {
    const blockId = this.scene3dEditBlockId;
    if (!blockId) return;
    this.scene3dEditBlockBuildingIndex = index;
    this.scene3dEditBuildingId = blockId;   // <app-building-panel> loads the block building's params
    this.scene3dEditBlockPanelOpen = false;
    this.scene3dEditBuildingPanelOpen = true;
    this.host._updateGizmoPosition();
  }

  scene3dBackToBlock(): void {
    this._exitBlockBuildingEdit();
    this.scene3dEditBlockPanelOpen = true;   // <app-block-panel> reloads on re-open
    this.host._updateGizmoPosition();
  }

  exitBlockBuildingEdit(): void { this._exitBlockBuildingEdit(); }

  _exitBlockBuildingEdit(): void {
    if (this.scene3dEditBlockBuildingIndex !== null) {
      this.scene3dEditBlockBuildingIndex = null;
      this.scene3dEditBuildingId = null;
      this.scene3dEditBuildingPanelOpen = false;
    }
  }

  scene3dDeleteBlock(): void {
    const id = this.scene3dEditBlockId;
    if (!id) return;
    this._exitBlockBuildingEdit();
    this.shapeManager.removeBlock3D(id);
    this.scene3dEditBlockPanelOpen = false;
    this.scene3dEditBlockId = null;
    this.scene3dSelectedIsBlock = false;   // <app-block-panel> clears itself when the id goes null
    this.host.scene3dRefreshMeshes();
    this.host._updateGizmoPosition();
    this.host.scene3dMarkDirty();
  }

  /** Building / foliage / block: set the selection flag; an open editor panel follows the selection or closes. */
  _syncProceduralPanels(id: string): void {
    this.scene3dSelectedIsBuilding = !!this.shapeManager.isProceduralBuilding3D(id);
    if (!this.scene3dSelectedIsBuilding && this.scene3dEditBuildingPanelOpen) {
      this.scene3dEditBuildingPanelOpen = false;
      this.host._updateGizmoPosition();
    } else if (this.scene3dSelectedIsBuilding && this.scene3dEditBuildingPanelOpen && this.scene3dEditBuildingId !== id) {
      this.scene3dEditBuildingId = id;   // <app-building-panel> reloads its params on id change
    }
    this.scene3dSelectedIsFoliage = !!this.shapeManager.isProceduralFoliage3D(id);
    if (!this.scene3dSelectedIsFoliage && this.scene3dEditFoliagePanelOpen) {
      this.scene3dEditFoliagePanelOpen = false;
      this.host._updateGizmoPosition();
    } else if (this.scene3dSelectedIsFoliage && this.scene3dEditFoliagePanelOpen && this.scene3dEditFoliageId !== id) {
      this.scene3dEditFoliageId = id;   // <app-foliage-panel> reloads its params on id change
    }
    this.scene3dSelectedIsBlock = !!this.shapeManager.isBlock3D(id);
    if (!this.scene3dSelectedIsBlock && this.scene3dEditBlockPanelOpen) {
      this.scene3dEditBlockPanelOpen = false;
      this.host._updateGizmoPosition();
    } else if (this.scene3dSelectedIsBlock && this.scene3dEditBlockPanelOpen && this.scene3dEditBlockId !== id) {
      this.scene3dEditBlockId = id;   // <app-block-panel> reloads on id change
    }
  }
}
