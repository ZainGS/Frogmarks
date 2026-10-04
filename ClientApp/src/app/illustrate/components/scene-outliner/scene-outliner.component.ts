import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SceneOutlinerService } from '../../services/scene-outliner.service';
import { CreatorService } from '../../services/creator.service';
import { DecalService } from '../../services/decal.service';
import { SceneAnimationService } from '../../services/scene-animation.service';

/** What the outliner asks the editor to do (selection, mesh lifecycle and the cloth builder are the editor's). */
export type OutlinerAction =
  | { kind: 'select'; id: string; event: MouseEvent }
  | { kind: 'deleteMesh' | 'deleteGroup' | 'deletePackage' | 'deleteCDKit' | 'duplicate' | 'editCloth'; id: string }
  | { kind: 'move'; id: string; dir: 'up' | 'down' };

/** Scene outliner tree (recursive): visibility, collapse, rename, kind icons and per-node actions. A view over
 *  SceneOutlinerService; editor-owned actions go out through `action`. Extracted from illustration.component
 *  (refactor-plan 2.9F). */
@Component({
  selector: 'app-scene-outliner',
  templateUrl: './scene-outliner.component.html',
  styleUrls: ['./scene-outliner.component.scss'],
})
export class SceneOutlinerComponent {
  @Input() selectedMeshId: string | null = null;
  @Input() selectedMeshIds: Set<string> = new Set();
  @Input() viewTarget = 'scene';
  @Output() action = new EventEmitter<OutlinerAction>();

  constructor(public outliner: SceneOutlinerService, public creator: CreatorService, public decal: DecalService,
              public anim: SceneAnimationService) {}

  act(a: OutlinerAction): void { this.action.emit(a); }

  /** The row's ✕: decals go through the decal tool, groups (incl. array groups) and meshes through the editor. */
  deleteNode(node: any): void {
    if (this.outliner.scene3dDecalIds.has(node.id)) this.decal.scene3dOutlinerDeleteDecal(node.id);
    else if (node.type === '3DMeshGroup' || node.type === '3DArrayGroup') this.act({ kind: 'deleteGroup', id: node.id });
    else this.act({ kind: 'deleteMesh', id: node.id });
  }
}
