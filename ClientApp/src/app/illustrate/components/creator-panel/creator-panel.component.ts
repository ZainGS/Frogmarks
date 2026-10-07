import { Component } from '@angular/core';
import { CreatorService } from '../../services/creator.service';

/** Procedural creator panel: grouped params, seed reroll, promote to library, delete. A view over CreatorService (refactor-plan 2.9E). */
@Component({
  selector: 'app-creator-panel',
  templateUrl: './creator-panel.component.html',
  styleUrls: ['./creator-panel.component.scss'],
})
export class CreatorPanelComponent {
  /** Delete is asking first — for the creator it was tapped on (another selection starts un-asked). */
  get confirmingDelete(): boolean { return !!this._confirmId && this._confirmId === this.creator.activeCreatorId; }
  set confirmingDelete(v: boolean) { this._confirmId = v ? this.creator.activeCreatorId : null; }
  private _confirmId: string | null = null;

  constructor(public creator: CreatorService) {}
}
