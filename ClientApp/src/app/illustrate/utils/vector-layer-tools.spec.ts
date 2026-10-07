import { isRasterOnlyTool, isVectorOnlyTool, vectorLayerToolSwitch } from './vector-layer-tools';

describe('vectorLayerToolSwitch (tool rail on vector-layer enter / leave)', () => {
  it('classifies the rail-only tools', () => {
    for (const t of ['shape:circle', 'polygon:freeform', 'arrow']) expect(isVectorOnlyTool(t)).withContext(t).toBeTrue();
    for (const t of ['drawing:pen', 'raster:move', 'fill']) expect(isRasterOnlyTool(t)).withContext(t).toBeTrue();
    for (const t of ['', 'select:rect', 'live-text']) {
      expect(isVectorOnlyTool(t)).withContext(t).toBeFalse();
      expect(isRasterOnlyTool(t)).withContext(t).toBeFalse();
    }
  });

  it('entering a vector layer puts the brush away and remembers it', () => {
    expect(vectorLayerToolSwitch('drawing:pen', false, true, '')).toEqual({ next: '', remembered: 'drawing:pen' });
    expect(vectorLayerToolSwitch('select:rect', false, true, '')).toEqual({ next: null, remembered: '' });
  });

  it('switching between vector layers changes nothing', () => {
    expect(vectorLayerToolSwitch('shape:square', true, true, 'drawing:pen')).toEqual({ next: null, remembered: 'drawing:pen' });
  });

  it('leaving: a vector-only tool (and its options panel) goes, the remembered brush comes back', () => {
    expect(vectorLayerToolSwitch('shape:circle', true, false, 'drawing:pen')).toEqual({ next: 'drawing:pen', remembered: '' });
    expect(vectorLayerToolSwitch('arrow', true, false, '')).toEqual({ next: '', remembered: '' });
    expect(vectorLayerToolSwitch('', true, false, 'fill')).toEqual({ next: 'fill', remembered: '' });
    expect(vectorLayerToolSwitch('select:rect', true, false, 'drawing:pen')).toEqual({ next: null, remembered: '' });
  });

  it('a raster pick while already on raster leaves the tool alone (even an arrow set by a shortcut)', () => {
    expect(vectorLayerToolSwitch('arrow', false, false, '')).toEqual({ next: null, remembered: '' });
    expect(vectorLayerToolSwitch('drawing:pen', false, false, '')).toEqual({ next: null, remembered: '' });
  });
});
