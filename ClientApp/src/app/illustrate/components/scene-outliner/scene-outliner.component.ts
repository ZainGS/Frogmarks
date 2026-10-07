import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { SceneOutlinerService } from '../../services/scene-outliner.service';
import { CreatorService } from '../../services/creator.service';
import { DecalService } from '../../services/decal.service';
import { SceneAnimationService } from '../../services/scene-animation.service';
import { canUndoOutlinerDelete, outlinerDeletePlan, outlinerHasNode } from '../../utils/outliner-delete';

/** What the outliner asks the editor to do (selection, mesh lifecycle and the cloth builder are the editor's). */
export type OutlinerAction =
  | { kind: 'select'; id: string; event: MouseEvent }
  | { kind: 'deleteMesh' | 'deleteGroup' | 'deletePackage' | 'deleteCDKit' | 'duplicate' | 'editCloth'; id: string }
  /** The Undo toast after a row ✕: the editor's 3D undo (the same step Ctrl+Z takes). */
  | { kind: 'undo' };

/** Scene outliner tree (recursive): visibility, collapse, rename, kind icons and per-node actions. A view over
 *  SceneOutlinerService; editor-owned actions go out through `action`. Extracted from illustration.component
 *  (refactor-plan 2.9F). */
@Component({
  selector: 'app-scene-outliner',
  templateUrl: './scene-outliner.component.html',
  styleUrls: ['./scene-outliner.component.scss'],
})
export class SceneOutlinerComponent implements OnDestroy {
  @Input() selectedMeshId: string | null = null;
  @Input() selectedMeshIds: Set<string> = new Set();
  @Input() viewTarget = 'scene';
  @Output() action = new EventEmitter<OutlinerAction>();

  /** How long the Undo toast stays up after a row ✕. */
  static readonly UNDO_TOAST_MS = 8000;

  /** Row whose ✕ is asking "Delete …?" (deletes that can't be undone), with the question. */
  confirmDelete: { id: string; text: string } | null = null;
  /** The last undoable row ✕ — its Undo toast. */
  deletedToast: { id: string; name: string; undoStep: string } | null = null;
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(public outliner: SceneOutlinerService, public creator: CreatorService, public decal: DecalService,
              public anim: SceneAnimationService, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void { this._clearToastTimer(); }

  act(a: OutlinerAction): void { this.action.emit(a); }

  /** The row's ✕: an undoable delete goes at once with an Undo toast; anything else asks first (inline strip). */
  deleteNode(node: any): void {
    const plan = outlinerDeletePlan(node, this._kinds());
    if (plan.confirmText) {
      this.confirmDelete = this.confirmDelete?.id === node.id ? null : { id: node.id, text: plan.confirmText };
      return;
    }
    this._delete(node);
    // Only offer Undo when the engine really recorded this delete as the next undo step
    if (plan.undoStep && this.outliner.nextUndo3D === plan.undoStep) this._showToast({ id: node.id, name: this._label(node), undoStep: plan.undoStep });
  }

  /** The confirm strip's Delete. */
  confirmDeleteNode(node: any): void {
    this.confirmDelete = null;
    this._delete(node);
  }

  /** The toast's Undo: the same step Ctrl+Z takes — only while it is still the next undo and the node still gone. */
  undoDelete(): void {
    const t = this.deletedToast;
    this.dismissToast();
    if (!canUndoOutlinerDelete(t, this.outliner.nextUndo3D, !!t && outlinerHasNode(this.outliner.scene3dHierarchy, t.id))) return;
    this.act({ kind: 'undo' });
  }

  dismissToast(): void {
    this._clearToastTimer();
    this.deletedToast = null;
  }

  /** Route a delete to whoever owns that kind of node (decals → decal tool, creators → creator service, the rest →
   *  the editor). */
  private _delete(node: any): void {
    const o = this.outliner;
    if (o.scene3dDecalIds.has(node.id)) this.decal.scene3dOutlinerDeleteDecal(node.id);
    else if (node.thinWrapper && o.scene3dCreatorIds.has(node.id)) this.creator.scene3dOutlinerDeleteCreator(node.id);
    else if (node.thinWrapper && o.scene3dPackageIds.has(node.id)) this.act({ kind: 'deletePackage', id: node.id });
    else if (node.thinWrapper && o.scene3dCDKitIds.has(node.id)) this.act({ kind: 'deleteCDKit', id: node.id });
    else if (node.type === '3DMeshGroup' || node.type === '3DArrayGroup') this.act({ kind: 'deleteGroup', id: node.id });
    else this.act({ kind: 'deleteMesh', id: node.id });
  }

  private _kinds() {
    const o = this.outliner;
    return { characterBodyIds: o.scene3dCharacterBodyIds, packageIds: o.scene3dPackageIds, cdKitIds: o.scene3dCDKitIds,
             creatorIds: o.scene3dCreatorIds, decalIds: o.scene3dDecalIds };
  }

  private _label(node: any): string {
    return this.outliner.scene3dCharacterBodyIds.has(node.id) ? 'Character' : (node.name || 'mesh');
  }

  private _showToast(t: { id: string; name: string; undoStep: string }): void {
    this._clearToastTimer();
    this.deletedToast = t;
    this._toastTimer = setTimeout(() => {
      this._toastTimer = null;
      this.deletedToast = null;
      this.cdr.markForCheck();
    }, SceneOutlinerComponent.UNDO_TOAST_MS);
  }

  private _clearToastTimer(): void {
    if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = null; }
  }
}
