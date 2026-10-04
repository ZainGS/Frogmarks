import { Component, EventEmitter, Output } from '@angular/core';
import { PackageCreatorService } from '../../services/package-creator.service';

/** Package Creator dieline sidebar (split / 2D view): header, layer stack, ephemera entry. Reads PackageCreatorService. */
@Component({
  selector: 'app-pkg-dieline-sidebar',
  templateUrl: './pkg-dieline-sidebar.component.html',
  styleUrls: ['./pkg-dieline-sidebar.component.scss'],
})
export class PkgDielineSidebarComponent {
  @Output() openEphemera = new EventEmitter<void>();
  constructor(public pkg: PackageCreatorService) {}
}
