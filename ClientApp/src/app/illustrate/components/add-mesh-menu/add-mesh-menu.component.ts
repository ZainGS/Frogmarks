import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SceneAddService } from '../../services/scene-add.service';

/** Creator types that already have their own Add-Mesh entry. */
const BUILT_IN_ADD_ENTRIES = new Set(['foliage', 'building', 'block', 'package', 'camera', 'cdKit']);

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

  /** Creator types the menu doesn't already list as a built-in entry: the engine's 'foliage' creator type duplicated
   *  "Foliage…" (the built-in entry opens the Foliage panel). */
  get extraCreatorTypes(): { typeId: string; label: string }[] {
    return this.scene3dCreatorTypesList.filter(ct => !BUILT_IN_ADD_ENTRIES.has(ct.typeId));
  }
  @Output() action = new EventEmitter<AddMeshAction>();
  constructor(public add: SceneAddService) {}
}
