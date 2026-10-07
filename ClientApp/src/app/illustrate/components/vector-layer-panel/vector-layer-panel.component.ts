import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** Icon per engine shape type. The engine's getType() names are 'Rectangle', 'Circle', 'Line', 'Speech Balloon',
 *  'Sticky Note', … — the old inline map checked 'rect' / 'ellipse' / 'line', so no icon ever matched (UI review
 *  2026-10-07). Keys are the type lower-cased with spaces / dashes removed. */
const SHAPE_ICONS: Record<string, string> = {
  rect: '▭', rectangle: '▭',
  circle: '◯', ellipse: '◯',
  line: '╱', arrow: '➝',
  triangle: '△', invertedtriangle: '▽', diamond: '◇',
  polygon: '⬠', path: '✒',
  balloon: '💬', speechballoon: '💬', stickynote: '📝',
  text: 'T', sdftext: 'T', livetext: 'T',
  scribble: '〰', highlight: '▬', pattern: '▦', stamp: '◈',
  section: '▢', panel: '▤', group: '▣',
};

function shapeKey(type: string): string { return (type || '').toLowerCase().replace(/[\s_-]+/g, ''); }

export function vectorShapeIcon(type: string): string { return SHAPE_ICONS[shapeKey(type)] ?? '◻'; }

/** The editable-path row actions key off the engine's exact names ('Path', and 'Polygon' — formerly 'polygon'). */
export function isPathShape(type: string): boolean { return shapeKey(type) === 'path'; }
export function isPolygonShape(type: string): boolean { return shapeKey(type) === 'polygon'; }

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

  readonly shapeIcon = vectorShapeIcon;
  readonly isPath = isPathShape;
  readonly isPolygon = isPolygonShape;

  trackShape(_i: number, s: { id: string }): string { return s.id; }

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
