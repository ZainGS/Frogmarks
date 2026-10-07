import ShapeManager from '@zaings/salsa/shape-manager';
import { RasterBrushService, isPaintableRasterLayer, pickDefaultPaintLayerId } from './raster-brush.service';
import { LayerBlendMode, RasterLayer } from '../../../boards/models/brush-preset.model';

function entry(id: string, type: string = 'layer', extra: Partial<RasterLayer> = {}): RasterLayer {
  return {
    id, name: id, type: type as RasterLayer['type'], parentId: null, visible: true, locked: false,
    blendMode: LayerBlendMode.Normal, opacity: 1, clipped: false, lockTransparency: false, ...extra,
  };
}

/** An engine stand-in shaped like an OLDER Salsa dist: selectRasterLayer accepts ANY id (vector included). */
function fakeEngine(layers: RasterLayer[], engineSelected: string | null) {
  const state = { layers, selected: engineSelected };
  return {
    state,
    getRasterLayers: () => state.layers,
    selectRasterLayer: jasmine.createSpy('selectRasterLayer').and.callFake((id: string) => { state.selected = id; return true; }),
    deleteRasterLayer: jasmine.createSpy('deleteRasterLayer').and.callFake((id: string) => {
      state.layers = state.layers.filter(l => l.id !== id);
      return true;
    }),
    rasterLayerManager: { getSelectedLayerId: () => state.selected },
  };
}

const flush = () => new Promise<void>(r => setTimeout(r, 0));

/**
 * Fresh document (2026-10-07): the stack is [Vector, Background]. refreshLayers auto-selected `layers[0]` — the VECTOR
 * entry — as the engine's raster layer: strokes painted nowhere with no undo, Ctrl+Z threw "reading 'undo'", and no
 * layer row was highlighted.
 */
describe('RasterBrushService raster-layer auto-selection', () => {
  it('a new document ([Vector, Background]) selects Background, never the Vector entry', async () => {
    const eng = fakeEngine([entry('vec', 'vector'), entry('bg')], 'bg');
    spyOn(ShapeManager, 'getInstance').and.returnValue(eng as unknown as ShapeManager);
    const svc = new RasterBrushService();
    let active: string | null = null;
    svc.activeLayerId$.subscribe(id => (active = id));
    svc.refreshLayers();
    await flush();
    expect(active).toBe('bg' as never);
    expect(eng.selectRasterLayer).toHaveBeenCalledOnceWith('bg');
    expect(eng.state.selected).toBe('bg');
  });

  it('even when the engine itself has a non-paint entry selected (a city load selects its 3D scene): the topmost paint layer', async () => {
    const eng = fakeEngine([entry('vec', 'vector'), entry('bg'), entry('ink'), entry('s3', '3d-divider'), entry('grp', 'folder')], 's3');
    spyOn(ShapeManager, 'getInstance').and.returnValue(eng as unknown as ShapeManager);
    const svc = new RasterBrushService();
    svc.refreshLayers();
    await flush();
    expect(eng.selectRasterLayer).toHaveBeenCalledOnceWith('ink');
  });

  it('a loaded document keeps the engine\'s own paint-layer choice', async () => {
    const eng = fakeEngine([entry('bg'), entry('ink'), entry('vec', 'vector')], 'bg');
    spyOn(ShapeManager, 'getInstance').and.returnValue(eng as unknown as ShapeManager);
    const svc = new RasterBrushService();
    svc.refreshLayers();
    await flush();
    expect(eng.selectRasterLayer).toHaveBeenCalledOnceWith('bg');
  });

  it('a stale active id that is now a vector entry is re-picked; a live paint layer is kept', async () => {
    const eng = fakeEngine([entry('vec', 'vector'), entry('bg')], 'vec');
    spyOn(ShapeManager, 'getInstance').and.returnValue(eng as unknown as ShapeManager);
    const svc = new RasterBrushService();
    (svc as unknown as { _activeLayerId$: { next(v: string): void } })._activeLayerId$.next('vec');
    svc.refreshLayers();
    await flush();
    expect(eng.selectRasterLayer).toHaveBeenCalledOnceWith('bg');
    eng.selectRasterLayer.calls.reset();
    svc.refreshLayers();
    await flush();
    expect(eng.selectRasterLayer).not.toHaveBeenCalled();
  });

  it('only vector entries: nothing selected, the engine is not asked to select one', async () => {
    const eng = fakeEngine([entry('vec', 'vector')], null);
    spyOn(ShapeManager, 'getInstance').and.returnValue(eng as unknown as ShapeManager);
    const svc = new RasterBrushService();
    let active: string | null = 'x';
    svc.activeLayerId$.subscribe(id => (active = id));
    svc.refreshLayers();
    await flush();
    expect(active).toBeNull();
    expect(eng.selectRasterLayer).not.toHaveBeenCalled();
  });

  it('selectLayer ignores vector / ephemera / folder ids (an older engine would take them as the paint layer)', async () => {
    const eng = fakeEngine([entry('vec', 'vector'), entry('eph', 'ephemera'), entry('grp', 'folder'), entry('bg')], 'bg');
    spyOn(ShapeManager, 'getInstance').and.returnValue(eng as unknown as ShapeManager);
    const svc = new RasterBrushService();
    svc.refreshLayers();
    await flush();
    eng.selectRasterLayer.calls.reset();
    for (const id of ['vec', 'eph', 'grp']) svc.selectLayer(id);
    expect(eng.selectRasterLayer).not.toHaveBeenCalled();
    expect(eng.state.selected).toBe('bg');
  });

  it('deleting the active layer selects the nearest PAINT layer, and the last paint layer cannot be deleted', async () => {
    const eng = fakeEngine([entry('vec', 'vector'), entry('bg'), entry('ink')], 'ink');
    spyOn(ShapeManager, 'getInstance').and.returnValue(eng as unknown as ShapeManager);
    const svc = new RasterBrushService();
    svc.refreshLayers();
    await flush();
    svc.deleteLayer('ink');
    expect(eng.state.selected).toBe('bg');
    await flush();
    svc.deleteLayer('bg');                                   // only [Vector, Background] left: blocked
    expect(eng.deleteRasterLayer).toHaveBeenCalledTimes(1);
    expect(eng.state.selected).toBe('bg');
  });
});

describe('isPaintableRasterLayer / pickDefaultPaintLayerId', () => {
  it('only real pixel layers take paint', () => {
    expect(isPaintableRasterLayer(entry('a'))).toBeTrue();
    for (const t of ['vector', 'ephemera', 'folder', '3d-scene', 'reference']) expect(isPaintableRasterLayer(entry('x', t))).withContext(t).toBeFalse();
    expect(isPaintableRasterLayer(entry('d', 'layer', { systemOwner: 'packaging' }))).toBeFalse();
  });

  it('engine choice first, then the topmost paint layer, else null', () => {
    const stack = [entry('vec', 'vector'), entry('bg'), entry('ink'), entry('grp', 'folder')];
    expect(pickDefaultPaintLayerId(stack, 'bg')).toBe('bg');
    expect(pickDefaultPaintLayerId(stack, 'vec')).toBe('ink');
    expect(pickDefaultPaintLayerId(stack, null)).toBe('ink');
    expect(pickDefaultPaintLayerId([entry('vec', 'vector')], 'vec')).toBeNull();
  });
});
