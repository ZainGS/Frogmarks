import {
  fallbackEphemeraName, ephemeraPlacementLabels, formatEphemeraUnits, formatEphemeraSize, clampEphemeraSize,
  placementOriginForCentre, visibleCanvasCentre, EPHEMERA_MIN_SIZE, isEphemeraParamShown,
} from './ephemera-panel.util';
import { EphemeraPanel } from './ephemera-panel.component';

describe('ephemera panel helpers (UI review 2026-10-07)', () => {
  it('names placements by the generator display name, numbering repeats', () => {
    const names: Record<string, string> = { 'barcode:code128': 'Code 128', 'globe:wire': 'Wire Globe' };
    const labels = ephemeraPlacementLabels(
      [{ typeId: 'barcode:code128' }, { typeId: 'globe:wire' }, { typeId: 'barcode:code128' }, { typeId: 'motion:speed-lines' }],
      (t) => names[t],
    );
    expect(labels).toEqual(['Code 128', 'Wire Globe', 'Code 128 2', 'Motion Speed Lines']);
  });

  it('never shows a raw id: unknown types get a readable fallback', () => {
    expect(fallbackEphemeraName('barcode:code128')).toBe('Barcode Code128');
    expect(fallbackEphemeraName('')).toBe('Ephemera');
  });

  it('formats sizes with real decimals (0.68 was shown as "1")', () => {
    expect(formatEphemeraUnits(0.6783)).toBe('0.68');
    expect(formatEphemeraUnits(2)).toBe('2');
    expect(formatEphemeraUnits(1.5)).toBe('1.5');
    expect(formatEphemeraUnits(0.001)).toBe('<0.01');
    expect(formatEphemeraSize(0.68, 0.34)).toBe('0.68 × 0.34');
  });

  it('clamps W / H to the world-unit minimum, not 1', () => {
    expect(EPHEMERA_MIN_SIZE).toBeLessThan(0.1);
    expect(clampEphemeraSize(0.5, 1)).toBe(0.5);
    expect(clampEphemeraSize(0, 1)).toBe(EPHEMERA_MIN_SIZE);
    expect(clampEphemeraSize('', 0.7)).toBe(0.7);
    expect(clampEphemeraSize('0.25', 1)).toBe(0.25);
  });

  it('centres a placement on the view centre (placements store their minimum corner)', () => {
    expect(placementOriginForCentre({ x: 1, y: 2 }, 0.5, 0.25)).toEqual({ x: 0.75, y: 1.875 });
  });

  it('takes the visible canvas centre left of the panels docked on the right', () => {
    const canvas = { left: 0, top: 40, width: 1400, height: 860 };
    expect(visibleCanvasCentre(canvas, [])).toEqual({ x: 700, y: 430 });
    expect(visibleCanvasCentre(canvas, [1120, 836])).toEqual({ x: 418, y: 430 });
    expect(visibleCanvasCentre(canvas, [1500])).toEqual({ x: 700, y: 430 });   // off the canvas: ignored
  });

  it('hides params the generator ignores in the current state (schema showIf, audit 2026-10-09)', () => {
    expect(isEphemeraParamShown({}, {})).toBeTrue();
    const points = { showIf: { key: 'shape', equals: 'starburst' } };
    expect(isEphemeraParamShown(points, { shape: 'starburst' })).toBeTrue();
    expect(isEphemeraParamShown(points, { shape: 'circle' })).toBeFalse();
    // a select hands back strings: '1' matches 1
    expect(isEphemeraParamShown({ showIf: { key: 'lines', notEquals: 1 } }, { lines: '1' })).toBeFalse();
    expect(isEphemeraParamShown({ showIf: { key: 'style', equals: ['creases', 'all'] } }, { style: 'all' })).toBeTrue();
    expect(isEphemeraParamShown({ showIf: { key: 'showText', truthy: true } }, { showText: false })).toBeFalse();
    // all conditions must hold; a missing value uses the schema default
    const scatter = { showIf: [{ key: 'style', notEquals: 'starburst' }, { key: 'count', notEquals: 1 }] };
    expect(isEphemeraParamShown(scatter, { style: 'filled' }, [{ key: 'count', default: 1 }])).toBeFalse();
    expect(isEphemeraParamShown(scatter, { style: 'filled', count: 3 })).toBeTrue();
  });

  it('the panel lists only the shown rows, for a new placement and while editing one', () => {
    const panel = new EphemeraPanel(null as any, null as any, null as any);
    const schema: any[] = [
      { key: 'shape', label: 'Shape', type: 'select', default: 'starburst' },
      { key: 'points', label: 'Points', type: 'range', default: 12, showIf: { key: 'shape', equals: 'starburst' } },
      { key: 'text', label: 'Text', type: 'text', default: 'PROMO' },
    ];
    panel.paramSchemaList = schema;
    panel.params = { shape: 'starburst', points: 12, text: 'PROMO' };
    expect(panel.paramKeys()).toEqual(['shape', 'points', 'text']);
    panel.onParamChange('shape', 'circle', 'select');
    expect(panel.paramKeys()).toEqual(['shape', 'text']);

    panel.editParamSchemaList = schema;
    panel.editParams = { shape: 'seal', points: 12, text: 'X' };
    expect(panel.editParamKeys()).toEqual(['shape', 'text']);
    panel.onEditParamChange('shape', 'starburst', 'select');
    expect(panel.editParamKeys()).toEqual(['shape', 'points', 'text']);
  });
});
