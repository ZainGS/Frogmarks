import { Component, Input } from '@angular/core';
import { RasterTextService } from '../../services/raster-text.service';

/** Raster text tool options. A view over RasterTextService (refactor-plan 2.10g). */
@Component({
  selector: 'app-raster-text-options',
  templateUrl: './raster-text-options.component.html',
  styleUrls: ['./raster-text-options.component.scss'],
})
export class RasterTextOptionsComponent {
  @Input() availableFonts: string[] = [];
  @Input() penColorPalette: string[] = [];
  constructor(public rt: RasterTextService) {}
}
