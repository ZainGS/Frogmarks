import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ColorPickerComponent } from './components/color-picker/color-picker.component';
import { BrushOptionsComponent } from '../boards/components/brush-options/brush-options.component';
import { CurveEditorComponent } from '../boards/components/curve-editor/curve-editor.component';
import { RasterLayersComponent } from '../boards/components/raster-layers/raster-layers.component';
import { SelectionToolbarComponent } from '../boards/components/selection-toolbar/selection-toolbar.component';

/** UI pieces used by both the eagerly loaded app (Boards) and the lazy Illustrate editor: the colour picker and the
 *  Boards brush options / curve editor / raster layers / selection toolbar. */
@NgModule({
  declarations: [ColorPickerComponent, BrushOptionsComponent, CurveEditorComponent, RasterLayersComponent, SelectionToolbarComponent],
  imports: [CommonModule, FormsModule, MatIconModule],
  exports: [ColorPickerComponent, BrushOptionsComponent, CurveEditorComponent, RasterLayersComponent, SelectionToolbarComponent],
})
export class SharedUiModule { }
