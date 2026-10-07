import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state the outliner reads / writes. */
export type SceneOutlinerHost = Pick<IllustrationComponent, 'shapeManager' |
  'cdKitRootId' | 'scene3dCityContainerId' | 'scene3dMarkDirty' 
>;

/**
 * Scene outliner model: the node hierarchy, the node-kind id sets (cloth, character body + parts, building, foliage,
 * block, package, decal, creator, CD kit, scripted), collapse + rename state, and the outliner-only operations
 * (visibility, collapse, rename, hover). Component-scoped (provided by IllustrationComponent). Bodies moved verbatim
 * from illustration.component (refactor-plan 2.9F).
 */
@Injectable()
export class SceneOutlinerService {
  private host!: SceneOutlinerHost;
  constructor(private editorState: EditorStateService) {}
  bind(host: SceneOutlinerHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  // ── Tree state ──
  /** Engine hierarchy (groups, meshes, thin-wrapper containers) — what the outliner renders. */
  scene3dHierarchy: Array<any> = [];
  scene3dCollapsedGroups: Set<string> = new Set();
  scene3dRenamingId: string | null = null;
  scene3dRenamingName = '';

  // ── Node kinds (rebuilt by _reindexNodeKinds on every mesh refresh) ──
  scene3dClothIds = new Set<string>();
  /** Procedural character bodies — shown as one "Character" entry. */
  scene3dCharacterBodyIds = new Set<string>();
  /** Meshes that belong to a character body — hidden from the outliner (listed under the body instead). */
  scene3dCharPartIds = new Set<string>();
  scene3dBuildingIds: Set<string> = new Set();
  scene3dFoliageIds: Set<string> = new Set();
  scene3dBlockIds: Set<string> = new Set();
  scene3dPackageIds: Set<string> = new Set();
  scene3dDecalIds: Set<string> = new Set();
  /** Generic procedural creators (vending, bike rack, bollard, …). */
  scene3dCreatorIds: Set<string> = new Set();
  scene3dCDKitIds: Set<string> = new Set();
  /** Nodes with a script behavior (📜 badge). */
  scene3dScriptIds: Set<string> = new Set();

  _refreshScriptIds(): void {
    const list: any[] = this.shapeManager.listScriptBehaviors3D() ?? [];
    this.scene3dScriptIds = new Set(list.map((b: any) => b.nodeId));
  }

  /** Classify every mesh for the outliner (cloth, character body + parts, building, foliage, block, creator, decal,
   *  package, CD kit) — the id sets drive its icons, delete buttons and which inspector opens. */
  _reindexNodeKinds(): void {
    const s3d = this.shapeManager.scene3d;
    // Track which nodes are cloth meshes (API-based, no type-string guessing)
    this.scene3dClothIds = new Set(
      this.editorState.scene3dMeshes
        .map((m: any) => m.id ?? m.nodeId)
        .filter((id: string) => !!s3d.getClothConfig(id))
    );
    // Track character body meshes and their parts for outliner display
    const sm2 = this.shapeManager;
    const allIds = this.editorState.scene3dMeshes.map((m: any) => m.id ?? m.nodeId) as string[];
    this.scene3dCharacterBodyIds = new Set(allIds.filter((id) => !!sm2.isProceduralBody3D(id)));
    this.scene3dCharPartIds = new Set(
      [...this.scene3dCharacterBodyIds].flatMap((bodyId) => (sm2.getProceduralBodyParts3D(bodyId) as string[] | undefined) ?? [])
    );
    for (const bodyId of this.scene3dCharacterBodyIds) this._collapseNewCharacter(bodyId);
    this.scene3dBuildingIds = new Set(allIds.filter((id: string) => !!sm2.isProceduralBuilding3D(id)));
    this.scene3dFoliageIds  = new Set(allIds.filter((id: string) => !!sm2.isProceduralFoliage3D(id)));
    this.scene3dBlockIds    = new Set(allIds.filter((id: string) => !!sm2.isBlock3D(id)));
    this.scene3dCreatorIds  = new Set(allIds.filter((id: string) => !!sm2.isCreator3D(id)));
    this.scene3dDecalIds    = new Set([
      ...allIds.filter((id: string) => !!sm2.isDecal3D(id)),
      ...(sm2.listDecals3D() ?? []).map((d: any) => d.id as string),
    ]);
    const pkgAll: any[] = sm2.packaging?.getAll() ?? [];
    const pkgRootsFromRegistry = pkgAll.map((p: any) => p.id);
    const pkgRootsFromIsPackageNode = allIds.filter((id: string) => {
      const resolved = sm2.packaging?.isPackageNode(id);
      return resolved != null && resolved === id;
    });
    this.scene3dPackageIds = new Set([...pkgRootsFromRegistry, ...pkgRootsFromIsPackageNode]);
    // CD Kit roots are thin-wrapper containers, not meshes — they never appear in
    // getAllMeshes(), so they're detected from the hierarchy in scene3dRefreshHierarchy().
    this.scene3dCDKitIds = new Set(this.host.cdKitRootId ? [this.host.cdKitRootId] : []);
  }

  scene3dRefreshHierarchy(): void {
    const sm = this.shapeManager;
    const hierarchy = sm.getScene3DHierarchy();
    if (hierarchy) {
      this.scene3dHierarchy = hierarchy;
      // CD Kit roots carry a worldParams marker on the container node (survives reload,
      // unlike cdKitRootId which only exists during a designer session)
      for (const n of hierarchy as any[]) {
        if (n.thinWrapper && (sm.getNodeById(n.id) as any)?.worldParams?.kind === 'cdkit') {
          this.scene3dCDKitIds.add(n.id);
        }
      }
    } else {
      // fallback: flat list from mesh array
      this.scene3dHierarchy = this.editorState.scene3dMeshes.map((m: any) => ({
        id: m.id ?? m.nodeId,
        name: m.name ?? m.meshPrimitive ?? 'mesh',
        type: 'mesh',
        visible: m.visible !== false,
        normalMapLibraryId: m.normalMapLibraryId ?? null,
        children: [],
      }));
    }
    this.host.scene3dCityContainerId = sm.world?.getCityContainerId() ?? null;
  }

  /** Character bodies the outliner has already seen — a character row starts COLLAPSED the first time it shows (the
   *  engine marks its virtual Character group collapsed), after that the user's expand / collapse sticks. */
  private _seenCharacterBodyIds = new Set<string>();

  private _collapseNewCharacter(bodyId: string): void {
    if (this._seenCharacterBodyIds.has(bodyId)) return;
    this._seenCharacterBodyIds.add(bodyId);
    this.scene3dCollapsedGroups.add(bodyId);
  }

  /** Add a just-created procedural character without a full hierarchy re-scan: ONE "Character" row in the same shape
   *  getScene3DHierarchy emits for its virtual character group (id = the BODY mesh, type 3DMeshGroup, character: true,
   *  the overlay parts — eye decal, face kit, hair, garments — as children), with the body + part ids indexed so the
   *  row reads as a character from the moment it's created (not loose parts until the next full refresh). */
  scene3dAddCharacterNode(bodyId: string, nodeIds: string[]): void {
    const sm = this.shapeManager;
    const body = sm.getNode3D(bodyId);
    if (!body) { this.scene3dRefreshHierarchy(); return; }
    const children = nodeIds.filter((id) => id !== bodyId).map((id) => sm.getNode3D(id)).filter((n) => !!n);
    const charNode = { ...body, name: 'Character', type: '3DMeshGroup', character: true, collapsed: true, children };
    this.scene3dHierarchy = [...this.scene3dHierarchy.filter((n: any) => !nodeIds.includes(n.id)), charNode];
    this.scene3dCharacterBodyIds = new Set([...this.scene3dCharacterBodyIds, bodyId]);
    this.scene3dCharPartIds = new Set([...this.scene3dCharPartIds, ...((sm.getProceduralBodyParts3D(bodyId) as string[] | undefined) ?? [])]);
    this._collapseNewCharacter(bodyId);
  }

  /** The 3D undo step Ctrl+Z would take next (null = nothing to undo) — the row ✕'s Undo toast checks it. */
  get nextUndo3D(): string | null {
    const sm = this.shapeManager;
    return sm?.canUndo3D ? (sm.undoDescription3D ?? null) : null;
  }

  scene3dSetHovered(id: string | null): void {
    this.shapeManager.setHoveredMesh3D(id);
  }

  trackByNodeId(_: number, node: any): string { return node.id; }

  scene3dToggleGroupCollapse(id: string): void {
    if (this.scene3dCollapsedGroups.has(id)) this.scene3dCollapsedGroups.delete(id);
    else this.scene3dCollapsedGroups.add(id);
  }

  scene3dToggleVisibility(node: any): void {
    const sm = this.shapeManager;
    const nowVisible = !(node.visible !== false);
    if (node.character) {
      // Virtual "Character" group — id is the BODY mesh; fan out over all parts
      const ids: string[] = sm.characterPartIds3D(node.id) ?? [node.id];
      for (const pid of ids) sm.setMeshVisible3D(pid, nowVisible);
    } else if (node.type === '3DMeshGroup') {
      sm.setGroupVisible3D(node.id, nowVisible);
      this._scene3dSetChildrenVisible(node.children ?? [], nowVisible, sm);
    } else {
      sm.setMeshVisible3D(node.id, nowVisible);
    }
    this.scene3dRefreshHierarchy();
    this.host.scene3dMarkDirty();
  }

  _scene3dSetChildrenVisible(children: any[], visible: boolean, sm: ShapeManager): void {
    for (const child of children) {
      if (child.type === '3DMeshGroup') {
        sm.setGroupVisible3D(child.id, visible);
        this._scene3dSetChildrenVisible(child.children ?? [], visible, sm);
      } else {
        sm.setMeshVisible3D(child.id, visible);
      }
    }
  }

  scene3dStartRename(node: any, event: Event): void {
    event.stopPropagation();
    this.scene3dRenamingId = node.id;
    this.scene3dRenamingName = node.name;
  }

  scene3dCommitRename(node: any): void {
    if (!this.scene3dRenamingId) return;
    const name = this.scene3dRenamingName.trim();
    if (name) {
      const sm = this.shapeManager;
      if (node.type === '3DMeshGroup') {
        sm.setGroupName3D(node.id, name);
      } else {
        sm.setMeshName3D(node.id, name);
      }
      this.scene3dRefreshHierarchy();
      this.host.scene3dMarkDirty();
    }
    this.scene3dRenamingId = null;
  }

  scene3dCancelRename(): void {
    this.scene3dRenamingId = null;
  }
}
