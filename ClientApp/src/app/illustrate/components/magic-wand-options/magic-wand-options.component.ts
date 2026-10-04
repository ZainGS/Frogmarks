import { Component, Input } from '@angular/core';
import { FillWandService } from '../../services/fill-wand.service';

/** Magic-wand selection options. A view over FillWandService (refactor-plan 2.10h). */
@Component({
  selector: 'app-magic-wand-options',
  templateUrl: './magic-wand-options.component.html',
  styleUrls: ['./magic-wand-options.component.scss'],
})
export class MagicWandOptionsComponent {
  @Input() rasterLayers: any[] = [];
  constructor(public fw: FillWandService) {}
}
