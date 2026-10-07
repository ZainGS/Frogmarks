import ShapeManager from '@zaings/salsa/shape-manager';
import { VectorLayerPanelComponent, vectorShapeIcon, isPathShape, isPolygonShape } from './vector-layer-panel.component';

/** A stand-in for the engine calls the row delete makes: selection + deleteSelectedShapes + the shape list. */
function fakeEngine(initialSelection: string[]) {
  const shapes = [
    { id: 'a', name: 'A', type: 'rect', visible: true },
    { id: 'b', name: 'B', type: 'ellipse', visible: true },
    { id: 'c', name: 'C', type: 'Path', visible: true },
  ];
  let selected = [...initialSelection];
  const sm = {
    getVectorShapes: () => shapes.map(s => ({ ...s })),
    getSelectedShapeIds: () => [...selected],
    selectNodesByIds: (ids: string[], additive: boolean) => { selected = additive ? [...selected, ...ids] : [...ids]; },
    deleteSelectedShapes: () => {
      for (const id of selected) { const i = shapes.findIndex(s => s.id === id); if (i >= 0) shapes.splice(i, 1); }
      selected = [];
    },
  };
  return { sm, get selected() { return selected; }, shapes };
}

describe('VectorLayerPanelComponent row delete', () => {
  function setup(sel: string[]) {
    const eng = fakeEngine(sel);
    const panel = new VectorLayerPanelComponent();
    panel.shapeManager = eng.sm as unknown as ShapeManager;
    panel.refreshVectorShapes();
    return { eng, panel };
  }

  it('deletes only that shape and refreshes the list', () => {
    const t = setup([]);
    t.panel.deleteVectorShape('b', new Event('click'));
    expect(t.eng.shapes.map(s => s.id)).toEqual(['a', 'c']);
    expect(t.panel.vectorShapes.map(s => s.id)).toEqual(['a', 'c']);
  });

  it('keeps the rest of the current selection', () => {
    const t = setup(['a', 'b', 'c']);
    t.panel.deleteVectorShape('b', new Event('click'));
    expect(t.eng.shapes.map(s => s.id)).toEqual(['a', 'c']);
    expect(t.eng.selected).toEqual(['a', 'c']);
  });

  it('does not select the row (the click stops propagating)', () => {
    const t = setup([]);
    const e = new Event('click', { bubbles: true });
    const stop = spyOn(e, 'stopPropagation').and.callThrough();
    t.panel.deleteVectorShape('a', e);
    expect(stop).toHaveBeenCalled();
  });
});

describe('vector shape list icons (UI review 2026-10-07)', () => {
  it('match the engine type names', () => {
    expect(vectorShapeIcon('Circle')).toBe('◯');
    expect(vectorShapeIcon('Line')).toBe('╱');
    expect(vectorShapeIcon('Rectangle')).toBe('▭');
    expect(vectorShapeIcon('Speech Balloon')).toBe('💬');
    expect(vectorShapeIcon('Sticky Note')).toBe('📝');
    expect(vectorShapeIcon('Inverted Triangle')).toBe('▽');
    expect(vectorShapeIcon('Path')).toBe('✒');
    expect(vectorShapeIcon('SomethingNew')).toBe('◻');
  });

  it('path / polygon row actions key off the engine names', () => {
    expect(isPathShape('Path')).toBeTrue();
    expect(isPolygonShape('Polygon')).toBeTrue();
    expect(isPolygonShape('Path')).toBeFalse();
  });
});
