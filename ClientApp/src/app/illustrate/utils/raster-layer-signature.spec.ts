import { LayerSignatureSource, rasterLayerSignature } from './raster-layer-signature';

function fakeEngine() {
  const layers: any[] = [
    { id: 'a', name: 'Background', type: 'layer', parentId: null, visible: true, locked: false, blendMode: 0, opacity: 1, clipped: false },
    { id: 'v', name: 'Vector 1', type: 'vector', parentId: null, visible: true, locked: false, blendMode: 0, opacity: 1, clipped: false },
  ];
  const cels: Record<string, any[]> = { a: [{ id: 'c1', startFrame: 1, duration: 1, celType: 'key' }], v: [] };
  const animated: Record<string, boolean> = { a: false, v: false };
  const sm: LayerSignatureSource = {
    getRasterLayers: () => layers.map(l => ({ ...l })),
    isLayerAnimated: id => animated[id] ?? false,
    getCels: id => (cels[id] ?? []).map(c => ({ ...c })),
  };
  return { sm, layers, cels, animated };
}

describe('rasterLayerSignature (H5: refresh the layers panel / timeline only when they would change)', () => {
  it('is stable across calls when nothing the panels show changed', () => {
    const { sm } = fakeEngine();
    expect(rasterLayerSignature(sm)).toBe(rasterLayerSignature(sm));
  });

  it('changes with each field the Layers panel shows', () => {
    const e = fakeEngine();
    const base = rasterLayerSignature(e.sm);
    const edits: Array<(l: any) => void> = [
      l => { l.name = 'Renamed'; }, l => { l.visible = false; }, l => { l.locked = true; }, l => { l.opacity = 0.5; },
      l => { l.blendMode = 1; }, l => { l.parentId = 'f'; }, l => { l.clipped = true; }, l => { l.collapsed = true; },
    ];
    for (const edit of edits) {
      const before = { ...e.layers[0] };
      edit(e.layers[0]);
      expect(rasterLayerSignature(e.sm)).not.toBe(base);
      e.layers[0] = before;
    }
    expect(rasterLayerSignature(e.sm)).toBe(base);
  });

  it('changes with order, add and remove', () => {
    const e = fakeEngine();
    const base = rasterLayerSignature(e.sm);
    e.layers.reverse();
    expect(rasterLayerSignature(e.sm)).not.toBe(base);
    e.layers.reverse();
    e.layers.push({ id: 'n', name: 'New', type: 'layer', parentId: null, visible: true });
    expect(rasterLayerSignature(e.sm)).not.toBe(base);
    e.layers.pop();
    expect(rasterLayerSignature(e.sm)).toBe(base);
  });

  it('changes with the timeline: cels added / moved / retimed, animated flag', () => {
    const e = fakeEngine();
    const base = rasterLayerSignature(e.sm);
    e.cels['a'].push({ id: 'c2', startFrame: 3, duration: 1, celType: 'key' });
    const added = rasterLayerSignature(e.sm);
    expect(added).not.toBe(base);
    e.cels['a'][1].startFrame = 4;
    expect(rasterLayerSignature(e.sm)).not.toBe(added);
    e.cels['a'].pop();
    expect(rasterLayerSignature(e.sm)).toBe(base);
    e.animated['a'] = true;
    expect(rasterLayerSignature(e.sm)).not.toBe(base);
  });

  it('copes with no engine and an engine without the timeline API', () => {
    expect(rasterLayerSignature(null)).toBe('');
    expect(rasterLayerSignature({ getRasterLayers: () => null })).toBe('');
    expect(rasterLayerSignature({ getRasterLayers: () => [{ id: 'x' }] })).toBe('{"id":"x"}');
  });
});
