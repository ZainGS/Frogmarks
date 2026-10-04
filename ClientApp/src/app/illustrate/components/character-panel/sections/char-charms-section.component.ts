import { Component } from '@angular/core';
import { CharacterPanelComponent } from '../character-panel.component';
import { CharCharmsService } from '../char-charms.service';

/** Edit Character › Charms / attachments, placement, chains, sparkle.
 *  Markup only: state and actions live in the panel's services; `cp` is the panel (outputs, section, part textures). */
@Component({
  selector: 'app-char-charms-section',
  templateUrl: './char-charms-section.component.html',
  styleUrls: ['./char-charms-section.component.scss'],
})
export class CharCharmsSectionComponent {
  constructor(public cp: CharacterPanelComponent, public charms: CharCharmsService) {}
}
