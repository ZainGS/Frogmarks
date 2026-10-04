import { Component } from '@angular/core';
import { PanelLayoutService } from '../../services/panel-layout.service';

/** Panel Layout tool options: page size, template, gutter / bleed / border, guides, Create. A view over PanelLayoutService (refactor-plan 2.10f). */
@Component({
  selector: 'app-panel-layout-options',
  templateUrl: './panel-layout-options.component.html',
  styleUrls: ['./panel-layout-options.component.scss'],
})
export class PanelLayoutOptionsComponent {
  constructor(public pl: PanelLayoutService) {}
}
