import { DrawingOptionsService } from './drawing-options.service';

/**
 * The persistent colour picker's pen colour reaches every vector creation tool: lines / arrows (setLineColor) and the
 * shape tools — rectangle / ellipse / triangle and the FREEFORM POLYGON, which the engine fills from setShapeColor
 * (Salsa: ShapeManager.setShapeColor → PolygonDrawingService.setFillColor; the polygon was a fixed grey before).
 */
describe('DrawingOptionsService pen colour → vector tools', () => {
  function rig(withLineColor = true) {
    const methods = ['setRasterBrushColor', 'setStrokeColor', 'setShapeColor', ...(withLineColor ? ['setLineColor'] : [])];
    const sm = jasmine.createSpyObj('ShapeManager', methods);
    const svc = new DrawingOptionsService();
    svc.bind({ shapeManager: sm, setActiveTool: () => {} } as never);
    return { sm, svc };
  }

  it('a colour picked on the persistent picker becomes the shape / polygon fill and the line colour', () => {
    const { sm, svc } = rig();
    svc.onPersistentColorPicked('#123456');
    expect(sm.setShapeColor).toHaveBeenCalledWith('#123456');
    expect(sm.setLineColor).toHaveBeenCalledWith('#123456');
    expect(svc.selectedPenColor).toBe('#123456');
  });

  it('a palette swatch / swap does the same', () => {
    const { sm, svc } = rig();
    svc.setPenColor('#E74C3C');
    expect(sm.setShapeColor).toHaveBeenCalledWith('#E74C3C');
    svc.secondaryPenColor = '#00FF00';
    svc.swapColors();
    expect(sm.setShapeColor).toHaveBeenCalledWith('#00FF00');
    expect(sm.setLineColor).toHaveBeenCalledWith('#00FF00');
  });

  it('an engine without setLineColor still gets the shape colour (no throw)', () => {
    const { sm, svc } = rig(false);
    expect(() => svc.onPersistentColorPicked('#abcdef')).not.toThrow();
    expect(sm.setShapeColor).toHaveBeenCalledWith('#abcdef');
  });
});

/** Line (Arrow) options — the Size slider only set a field before 2026-10-09 (UI dead-controls audit). */
describe('DrawingOptionsService arrowhead defaults', () => {
  function rig() {
    const sm = jasmine.createSpyObj('ShapeManager', ['setDefaultArrowheads']);
    const svc = new DrawingOptionsService();
    svc.bind({ shapeManager: sm, setActiveTool: () => {} } as never);
    return { sm, svc };
  }

  it('the Size slider reaches the engine with the current styles', () => {
    const { sm, svc } = rig();
    svc.onArrowheadSizeChange('12' as unknown as number);
    expect(svc.arrowheadSize).toBe(12);
    expect(sm.setDefaultArrowheads).toHaveBeenCalledWith('none', 'triangle', 12);
  });

  it('Start / End changes keep the chosen size', () => {
    const { sm, svc } = rig();
    svc.onArrowheadSizeChange(9);
    svc.onArrowheadStartChange('closedCircle');
    expect(sm.setDefaultArrowheads).toHaveBeenCalledWith('closedCircle', 'triangle', 9);
    svc.onArrowheadEndChange('openCircle');
    expect(sm.setDefaultArrowheads).toHaveBeenCalledWith('closedCircle', 'openCircle', 9);
  });

  it('a bad size keeps the last good one', () => {
    const { sm, svc } = rig();
    svc.onArrowheadSizeChange(0);
    expect(svc.arrowheadSize).toBe(6);
    expect(sm.setDefaultArrowheads).toHaveBeenCalledWith('none', 'triangle', 6);
  });
});
