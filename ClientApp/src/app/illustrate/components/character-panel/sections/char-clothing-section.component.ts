import { Component } from '@angular/core';
import { CharacterPanelComponent } from '../character-panel.component';
import { CharClothingService } from '../char-clothing.service';

/** Edit Character › Clothing slots: top, bottom, shoes, socks (one component; the slot is the panel's charSection).
 *  Markup only: state and actions live in the panel's services; `cp` is the panel (outputs, section, part textures). */
@Component({
  selector: 'app-char-clothing-section',
  templateUrl: './char-clothing-section.component.html',
  styleUrls: ['./char-clothing-section.component.scss'],
})
export class CharClothingSectionComponent {
  constructor(public cp: CharacterPanelComponent, public clothing: CharClothingService) {}
}
