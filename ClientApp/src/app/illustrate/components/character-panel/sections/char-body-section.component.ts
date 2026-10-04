import { Component } from '@angular/core';
import { CharacterPanelComponent } from '../character-panel.component';
import { CharLookService } from '../char-look.service';

/** Edit Character › Body shape, scale, skin tone and shading.
 *  Markup only: state and actions live in the panel's services; `cp` is the panel (outputs, section, part textures). */
@Component({
  selector: 'app-char-body-section',
  templateUrl: './char-body-section.component.html',
  styleUrls: ['./char-body-section.component.scss'],
})
export class CharBodySectionComponent {
  constructor(public cp: CharacterPanelComponent, public look: CharLookService) {}
}
