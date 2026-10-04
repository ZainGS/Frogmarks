import { Component } from '@angular/core';
import { PackageCreatorService } from '../../services/package-creator.service';

/** Package Creator subpanel: style, dimensions, style params, fold, board, stage, guides, export. Reads PackageCreatorService. */
@Component({
  selector: 'app-pkg-creator-panel',
  templateUrl: './pkg-creator-panel.component.html',
  styleUrls: ['./pkg-creator-panel.component.scss'],
})
export class PkgCreatorPanelComponent {
  constructor(public pkg: PackageCreatorService) {}
}
