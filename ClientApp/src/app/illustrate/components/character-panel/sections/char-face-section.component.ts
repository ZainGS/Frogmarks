import { Component } from '@angular/core';
import { CharacterPanelComponent } from '../character-panel.component';
import { CharFaceService } from '../char-face.service';

/** Edit Character › Face kit: brows, nose, mouth, resting face.
 *  Markup only: state and actions live in the panel's services; `cp` is the panel (outputs, section, part textures). */
@Component({
  selector: 'app-char-face-section',
  templateUrl: './char-face-section.component.html',
  styleUrls: ['./char-face-section.component.scss'],
})
export class CharFaceSectionComponent {
  constructor(public cp: CharacterPanelComponent, public face: CharFaceService) {}
}
