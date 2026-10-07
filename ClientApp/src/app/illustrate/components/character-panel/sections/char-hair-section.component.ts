import { Component } from '@angular/core';
import { CharacterPanelComponent } from '../character-panel.component';
import { CharHairService } from '../char-hair.service';

/** Edit Character › Hair style, mode and per-mode controls (hairShow() lives on the panel, next to the Salsa-tested control table).
 *  Markup only: state and actions live in the panel's services; `cp` is the panel (outputs, section, part textures). */
@Component({
  selector: 'app-char-hair-section',
  templateUrl: './char-hair-section.component.html',
  styleUrls: ['./char-hair-section.component.scss'],
})
export class CharHairSectionComponent {
  /** Remove Hair is asking first (no undo). */
  confirmRemove = false;

  constructor(public cp: CharacterPanelComponent, public hair: CharHairService) {}
}
