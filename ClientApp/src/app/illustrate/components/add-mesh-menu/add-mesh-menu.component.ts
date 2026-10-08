import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SceneAddService } from '../../services/scene-add.service';
import { ExperimentalSettingsService } from '../../services/experimental-settings.service';

/** Creator types that already have their own Add-Mesh entry. */
const BUILT_IN_ADD_ENTRIES = new Set(['foliage', 'building', 'block', 'package', 'camera', 'cdKit']);

/** The city street-prop creators, hidden from the menu unless Experimental › Show city meshes is on (with the
 *  built-in Foliage…, Block… and Package… entries). */
const CITY_CREATOR_TYPES = new Set(['vending', 'bike-rack', 'bollard', 'lamp-post', 'trash-bin', 'crate', 'vent', 'a-board', 'stall']);

/** Add-Mesh entries that belong to other areas of the editor (it runs them). */
export type AddMeshAction = 'group' | 'ribbon' | 'building' | 'foliage' | 'block' | 'package' | 'camera' | 'cdKit' | { creator: string };

/** The Outliner's "+ Add Mesh" dropdown. Every entry adds at once with default settings (SceneAddService; the
 *  parametric ones' settings are Edit Mesh's first Modifiers card); Polygon… starts drawing its outline. The editor owns
 *  the open flag (its document click closes menus) and runs the entries listed in AddMeshAction. */
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
   *  "Foliage…" (the built-in entry opens the Foliage panel). The city creators are left out unless Show city meshes is on. */
  get extraCreatorTypes(): { typeId: string; label: string }[] {
    const city = this.exp.cityMeshes;
    return this.scene3dCreatorTypesList.filter(ct => !BUILT_IN_ADD_ENTRIES.has(ct.typeId) && (city || !CITY_CREATOR_TYPES.has(ct.typeId)));
  }
  @Output() action = new EventEmitter<AddMeshAction>();
  constructor(public add: SceneAddService, public exp: ExperimentalSettingsService) {}
}
