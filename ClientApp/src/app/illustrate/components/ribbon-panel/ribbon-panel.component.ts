import { Component } from '@angular/core';
import { RibbonService } from '../../services/ribbon.service';

/** Mesh inspector: Ribbon Path (width, segments, path mode, sides, UV tiling, control points, path presets). A view
 *  over RibbonService; shown only for a selected ribbon. Extracted from illustration.component (refactor-plan 2.9F). */
@Component({
  selector: 'app-ribbon-panel',
  templateUrl: './ribbon-panel.component.html',
  styleUrls: ['./ribbon-panel.component.scss'],
})
export class RibbonPanelComponent {
  constructor(public ribbon: RibbonService) {}
}
