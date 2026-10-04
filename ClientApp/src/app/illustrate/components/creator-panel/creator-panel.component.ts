import { Component } from '@angular/core';
import { CreatorService } from '../../services/creator.service';

/** Procedural creator panel: grouped params, seed reroll, promote to library, delete. A view over CreatorService (refactor-plan 2.9E). */
@Component({
  selector: 'app-creator-panel',
  templateUrl: './creator-panel.component.html',
  styleUrls: ['./creator-panel.component.scss'],
})
export class CreatorPanelComponent {
  constructor(public creator: CreatorService) {}
}
