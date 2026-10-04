import { Component, Input } from '@angular/core';
import { DecalService } from '../../services/decal.service';

/** Decal tool panel: image / ephemera source, generator params, size + rotation, delete. A view over DecalService (refactor-plan 2.9E). */
@Component({
  selector: 'app-decal-panel',
  templateUrl: './decal-panel.component.html',
  styleUrls: ['./decal-panel.component.scss'],
})
export class DecalPanelComponent {
  @Input() scene3dSelectedIsDecal: boolean = false;
  constructor(public decal: DecalService) {}
}
