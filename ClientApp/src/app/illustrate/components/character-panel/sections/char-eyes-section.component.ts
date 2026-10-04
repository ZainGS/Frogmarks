import { Component } from '@angular/core';
import { CharacterPanelComponent } from '../character-panel.component';
import { CharFaceService } from '../char-face.service';

/** Edit Character › Expressions, procedural / drawn eyes, blink, gaze pad.
 *  Markup only: state and actions live in the panel's services; `cp` is the panel (outputs, section, part textures). */
@Component({
  selector: 'app-char-eyes-section',
  templateUrl: './char-eyes-section.component.html',
  styleUrls: ['./char-eyes-section.component.scss'],
})
export class CharEyesSectionComponent {
  constructor(public cp: CharacterPanelComponent, public face: CharFaceService) {}
}
