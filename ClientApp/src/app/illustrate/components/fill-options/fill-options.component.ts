import { Component, Input } from '@angular/core';
import { FillWandService } from '../../services/fill-wand.service';

/** Flood-fill tool options. A view over FillWandService (refactor-plan 2.10h). */
@Component({
  selector: 'app-fill-options',
  templateUrl: './fill-options.component.html',
  styleUrls: ['./fill-options.component.scss'],
})
export class FillOptionsComponent {
  @Input() rasterLayers: any[] = [];
  constructor(public fw: FillWandService) {}
}
