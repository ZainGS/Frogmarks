import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SceneAddService } from '../../services/scene-add.service';

/** Add-Mesh entries that belong to other areas of the editor (it runs them). */
export type AddMeshAction = 'group' | 'ribbon' | 'cloth' | 'building' | 'foliage' | 'block' | 'package' | 'camera' | 'cdKit' | { creator: string };

/** The Outliner's "+ Add Mesh" dropdown and its quick-forms (primitives, polygon, circle, cylinder, revolve, tube,
 *  metaballs, creature, character). A view over SceneAddService (refactor-plan 2.9E); the editor owns the open flag
 *  (its document click closes menus) and runs the entries listed in AddMeshAction. */
@Component({
  selector: 'app-add-mesh-menu',
  templateUrl: './add-mesh-menu.component.html',
  styleUrls: ['./add-mesh-menu.component.scss'],
})
export class AddMeshMenuComponent {
  @Input() menuOpen = false;
  @Output() menuOpenChange = new EventEmitter<boolean>();
  @Input() scene3dCreatorTypesList: { typeId: string; label: string }[] = [];
  @Output() action = new EventEmitter<AddMeshAction>();
  constructor(public add: SceneAddService) {}
}
