import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** Vector layer panel: shape list (select / path edit / convert), align / distribute / flip, SVG path import,
 *  2D shape undo / redo. Extracted from illustration.component (refactor-plan 2.10b). */
@Component({
  selector: 'app-vector-layer-panel',
  templateUrl: './vector-layer-panel.component.html',
  styleUrls: ['./vector-layer-panel.component.scss'],
})
export class VectorLayerPanelComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() activeVectorLayerId: string | null = null;
  @Input() selectedLayerIds: Set<string> = new Set();
  @Input() canUndo2DShapes = false;
  @Input() canRedo2DShapes = false;
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['activeVectorLayerId']) this.refreshVectorShapes();
  }

  vectorShapes: { id: string; name: string; type: string; parentId?: string; visible: boolean }[] = [];

  showSVGImport = false;

  svgImportD = '';

  svgImportWidth = 0.5;

  refreshVectorShapes(): void {
    this.vectorShapes = this.shapeManager?.getVectorShapes(this.activeVectorLayerId) ?? [];
  }

  selectVectorShape(id: string, e: MouseEvent): void {
    e.stopPropagation();
    this.shapeManager?.selectNodesByIds([id], e.shiftKey);
  }

  enterPathEdit(id: string): void {
    this.shapeManager?.enterPathEdit(id);
  }

  /** Delete ONE shape from its row (undoable: deleteSelectedShapes records a vector-undo step). The rest of the
   *  current shape selection is kept. */
  deleteVectorShape(id: string, e: Event): void {
    e.stopPropagation();
    const sm = this.shapeManager;
    if (!sm) return;
    const keep = (sm.getSelectedShapeIds?.() ?? []).filter(s => s !== id);
    sm.selectNodesByIds([id], false);
    sm.deleteSelectedShapes();
    if (keep.length) sm.selectNodesByIds(keep, false);
    this.refreshVectorShapes();
  }

  convertPolygonToPath(id: string): void {
    this.shapeManager?.convertPolygonToPath(id);
    this.refreshVectorShapes();
  }

  vectorAlign(dir: 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom'): void {
    this.shapeManager?.alignSelectedShapes(dir);
  }

  vectorDistribute(axis: 'x' | 'y'): void {
    this.shapeManager?.distributeSelectedShapes(axis);
  }

  vectorFlip(axis: 'horizontal' | 'vertical'): void {
    this.shapeManager?.flipSelectedShapes(axis);
  }

  importSVGPath(): void {
    const d = this.svgImportD.trim();
    if (!d) return;
    this.shapeManager?.importSVGPath(d, { width: this.svgImportWidth });
    this.svgImportD = '';
    this.showSVGImport = false;
    this.refreshVectorShapes();
  }
}
