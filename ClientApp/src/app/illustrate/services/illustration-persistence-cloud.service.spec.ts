import { of } from 'rxjs';
import { IllustrationPersistenceService } from './illustration-persistence.service';
import { EditorStateService } from './editor-state.service';
import type { IllustrationStateDto, LayerStateDto } from 'app/shared/services/illustrate/illustration.service';
import { cloudSceneGraphJSON, toVectorSceneGraphJSON } from '../utils/cloud-scene-graph';
import { CloudUploadVersions, contentVersionsDiffer } from '../utils/cloud-pixel-versions';

/**
 * mobile-parity 7.3c — cloud persistence:
 *  - the server stores the VECTOR scene graph (it used to drop it: a cloud-only document lost its vector shapes);
 *  - cloud upload dirtiness comes from Salsa's raster content versions (a fill / undo / paste / transform … on an
 *    uploaded layer used to stay off the server until the next stroke on it).
 */

const MESH = { type: '3DMesh', id: 'm1', geometry: { positions: [1, 2, 3] } };
const RECT = { type: 'Rectangle', id: 'r1', layerId: 'vec', x: 4 };
const FULL_SCENE = JSON.stringify({
  root: { name: 'root', x: 0, children: [RECT, MESH, { type: '3DMeshGroup', id: 'g' }, { type: 'Skeleton3D' }, { type: 'Group', children: [] }] },
  textureLibrary: { entries: [{ id: 't', data: 'data:image/png;base64,AAAA' }] },
});

function layer(id: string, o: Partial<LayerStateDto> = {}): LayerStateDto {
  return {
    layerId: id, name: id, order: 0, visible: true, locked: false, blendMode: 'normal', opacity: 1, clipped: false,
    lockTransparency: false, animated: false, cels: [], type: 'layer', ...o,
  };
}

/** A fake engine: per-layer / per-cel content versions like Salsa's, blobs per export, and an optional old-dist mode. */
class FakeEngine {
  seq = 1;
  layers: Record<string, string> = { A: '1:0', B: '2:0' };
  cels: Record<string, string> = { c1: '3:0', c2: '4:0' };
  exports: string[] = [];
  getRasterTextureSize() { return { w: 4, h: 4 }; }
  getRasterContentVersions() { return { seq: this.seq, layers: { ...this.layers }, cels: { ...this.cels } }; }
  async exportRasterLayerToBlob(id: string) { this.exports.push('layer:' + id); return new Blob(['x']); }
  async exportRasterCelToBlob(id: string) { this.exports.push('cel:' + id); return new Blob(['y']); }
  /** A write to one layer / cel (attributed) — what every Salsa pixel writer reports. */
  write(id: string) {
    this.seq++;
    if (id in this.layers) this.layers[id] = this.layers[id].split(':')[0] + ':' + this.seq;
    else this.cels[id] = this.cels[id].split(':')[0] + ':' + this.seq;
  }
  /** A write with no known target: every version moves. */
  writeUnattributed() {
    this.seq++;
    for (const k of Object.keys(this.layers)) this.layers[k] = this.layers[k].split(':')[0] + ':' + this.seq;
    for (const k of Object.keys(this.cels)) this.cels[k] = this.cels[k].split(':')[0] + ':' + this.seq;
  }
  getSaveBlockedReason() { return null; }
}

function makeService(engine: object) {
  const api = {
    uploadLayerPixelData: jasmine.createSpy('uploadLayer').and.returnValue(of({})),
    uploadCelPixelData: jasmine.createSpy('uploadCel').and.returnValue(of({})),
    saveState: jasmine.createSpy('saveState').and.returnValue(of({ resultObject: { revision: 5 } })),
  };
  const notify = { error: jasmine.createSpy('error'), success: jasmine.createSpy('success') };
  const svc = new IllustrationPersistenceService(
    new EditorStateService(), {} as any, {} as any, {} as any, {} as any, { saveNow: async () => true } as any, {} as any,
    {} as any, api as any, {} as any, notify as any, { write: async () => true } as any, {} as any,
  );
  const host = { shapeManager: engine, isLoading: false, doc: { illustrationTitle: 'T' } };
  svc.bind(host as any);
  svc.illustration = { id: 9, uuid: 'U', name: 'T' } as any;
  svc.syncMode = 0;
  return { svc, api, notify, host };
}

const uploadedLayers = (api: any) => api.uploadLayerPixelData.calls.allArgs().map((a: any[]) => a[1]);
const uploadedCels = (api: any) => api.uploadCelPixelData.calls.allArgs().map((a: any[]) => a[1]);

describe('cloud scene graph (mobile-parity 7.3c)', () => {
  it('toVectorSceneGraphJSON keeps the 2D nodes, drops the 3D ones and the texture library', () => {
    const out = JSON.parse(toVectorSceneGraphJSON(FULL_SCENE)!);
    expect(out.root.children).toEqual([RECT, { type: 'Group', children: [] }]);
    expect(out.root.name).toBe('root');
    expect(out.textureLibrary).toBeUndefined();
  });

  it('passes a 2D-only graph through untouched; null for empty / non-scene input', () => {
    const twoD = JSON.stringify({ root: { children: [RECT] } });
    expect(toVectorSceneGraphJSON(twoD)).toBe(twoD);
    expect(toVectorSceneGraphJSON(null)).toBeNull();
    expect(toVectorSceneGraphJSON('not json')).toBeNull();
    expect(toVectorSceneGraphJSON('{"x":1}')).toBeNull();
  });

  it("cloudSceneGraphJSON uses Salsa's own 2D export when the dist has it, else filters the full JSON", () => {
    expect(cloudSceneGraphJSON({ getSceneGraphJSON2D: () => 'FROM-SALSA' }, FULL_SCENE)).toBe('FROM-SALSA');
    expect(JSON.parse(cloudSceneGraphJSON({}, FULL_SCENE)!).root.children.length).toBe(2);
  });

  it('a cloud save sends the vector scene graph; a No-Cloud save sends none; the local copy keeps the full one', () => {
    const { svc } = makeService(new FakeEngine());
    const state = { version: 2, sceneGraph: FULL_SCENE, animation: null, layers: [] } as IllustrationStateDto;
    const cloud = svc._serverStatePayload(state);
    expect(JSON.parse(cloud.sceneGraph!).root.children).toEqual([RECT, { type: 'Group', children: [] }]);
    expect(state.sceneGraph).toBe(FULL_SCENE);   // the OPFS metadata copy is not touched
    svc.syncMode = 1;
    expect(svc._serverStatePayload(state).sceneGraph).toBeNull();
  });

  it('round trip: what the save sends is what a cloud load applies (2D only), and vector layers come back in place', async () => {
    // ── save: the payload the server stores ──
    const engine: any = new FakeEngine();
    const { svc } = makeService(engine);
    const sent = svc._serverStatePayload({ version: 2, sceneGraph: FULL_SCENE, animation: null, layers: [] } as any);
    // ── the server returns the stored string verbatim (IllustrationStateDto.SceneGraph) ──
    const order: string[] = [];
    Object.assign(engine, {
      setSceneGraphJSON: jasmine.createSpy('setSceneGraphJSON').and.callFake(async () => { order.push('scene'); }),
      importRasterLayersFromDataURLs: jasmine.createSpy('import').and.callFake(async (e: any[]) => { order.push('px:' + e.map(x => x.id).join(',')); }),
      rasterLayerManager: {
        clearAllLayers: () => order.push('clear'),
        addVectorLayerWithId: (id: string, _n: string, o: any) => order.push(`vec:${id}:${o.visible}:${o.systemOwner ?? ''}`),
      },
      restoreProceduralFromSave3D: () => undefined,
    });
    const host: any = (svc as any).host;
    Object.assign(host, { refreshRasterLayers: () => undefined, markLoaded: () => undefined });
    Object.assign(svc as any, {
      artboard: { applyDocumentSize: () => undefined },
      canvasLook: { onBgColorSelected: () => undefined },
      fx: { layerDitherConfigs: new Map() },
      s3: { _scene3dLoadSnapSettings: () => undefined, _loadScene3dGrid: () => undefined },
    });
    spyOn(svc as any, '_downloadLayerPixels').and.callFake(async (l: LayerStateDto) =>
      l.type === 'layer' || !l.type ? [{ id: l.layerId, imageData: 'data:x' }] : []);
    const state = {
      version: 2, sceneGraph: sent.sceneGraph, animation: null,
      layers: [layer('BG', { order: 0 }), layer('vec', { order: 1, type: 'vector' }), layer('pkg', { order: 2, type: 'vector', systemOwner: 'packaging' }), layer('ink', { order: 3 })],
    } as any;
    await (svc as any)._loadFromBackend(state, null);
    expect(engine.setSceneGraphJSON).toHaveBeenCalledTimes(1);
    expect(JSON.parse(engine.setSceneGraphJSON.calls.mostRecent().args[0]).root.children).toEqual([RECT, { type: 'Group', children: [] }]);
    expect(order).toEqual(['scene', 'clear', 'px:BG', 'vec:vec:true:', 'vec:pkg:true:packaging', 'px:ink']);
  });

  it('an older document (no scene graph, no layer types) loads as before: no scene graph, one pixel import', async () => {
    const engine: any = new FakeEngine();
    const { svc } = makeService(engine);
    const calls: string[] = [];
    Object.assign(engine, {
      setSceneGraphJSON: jasmine.createSpy('setSceneGraphJSON'),
      importRasterLayersFromDataURLs: jasmine.createSpy('import').and.callFake(async (e: any[]) => { calls.push(e.map(x => x.id).join(',')); }),
      rasterLayerManager: { clearAllLayers: () => undefined, addVectorLayerWithId: jasmine.createSpy('addVec') },
      restoreProceduralFromSave3D: () => undefined,
    });
    Object.assign((svc as any).host, { refreshRasterLayers: () => undefined, markLoaded: () => undefined });
    Object.assign(svc as any, {
      artboard: { applyDocumentSize: () => undefined }, canvasLook: { onBgColorSelected: () => undefined },
      fx: { layerDitherConfigs: new Map() }, s3: { _scene3dLoadSnapSettings: () => undefined, _loadScene3dGrid: () => undefined },
    });
    spyOn(svc as any, '_downloadLayerPixels').and.callFake(async (l: LayerStateDto) => [{ id: l.layerId, imageData: 'data:x' }]);
    const old = { version: 2, sceneGraph: null, animation: null, layers: [layer('A'), layer('B')].map(l => { delete (l as any).type; return l; }) } as any;
    await (svc as any)._loadFromBackend(old, null);
    expect(engine.setSceneGraphJSON).not.toHaveBeenCalled();
    expect(calls).toEqual(['A,B']);
    expect(engine.rasterLayerManager.addVectorLayerWithId).not.toHaveBeenCalled();
  });

  it('a save the server stored only in part (scene graph over quota) warns once per document', async () => {
    const { svc, api, notify } = makeService(new FakeEngine());
    api.saveState.and.returnValue(of({ resultObject: { revision: 6, warning: 'Storage quota exceeded: the vector shapes were not saved to the cloud.' } }));
    spyOn(svc, '_buildFullState').and.resolveTo({ version: 2, sceneGraph: FULL_SCENE, animation: null, layers: [] } as any);
    (svc as any).shapeManager.getScene3DNodeStates = () => [];
    (svc as any).shapeManager.getDirtyMeshIds3D = () => [];
    await svc.saveIllustrationV2();
    await svc.saveIllustrationV2();
    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(svc._serverRevision).toBe(6);
  });
});

describe('cloud upload dirtiness from Salsa content versions (mobile-parity 7.3c)', () => {
  const twoLayers = () => [layer('A'), layer('B'), layer('V', { type: 'vector' })];

  it('first save uploads every paint layer (never the vector layer); an unchanged layer is not uploaded again', async () => {
    const engine = new FakeEngine();
    const { svc, api } = makeService(engine);
    await svc.uploadPixelData(twoLayers(), 9);
    expect(uploadedLayers(api)).toEqual(['A', 'B']);
    api.uploadLayerPixelData.calls.reset();
    await svc.uploadPixelData(twoLayers(), 9);
    expect(uploadedLayers(api)).toEqual([]);
  });

  it('a non-stroke edit (fill / undo / paste / transform …) on an uploaded layer re-uploads exactly that layer', async () => {
    const engine = new FakeEngine();
    const { svc, api } = makeService(engine);
    await svc.uploadPixelData(twoLayers(), 9);
    api.uploadLayerPixelData.calls.reset();
    engine.write('B');   // no noteRasterStroke: nothing but the engine knew
    await svc.uploadPixelData(twoLayers(), 9);
    expect(uploadedLayers(api)).toEqual(['B']);
  });

  it('a write with no known target re-uploads everything (fail safe)', async () => {
    const engine = new FakeEngine();
    const { svc, api } = makeService(engine);
    await svc.uploadPixelData(twoLayers(), 9);
    api.uploadLayerPixelData.calls.reset();
    engine.writeUnattributed();
    await svc.uploadPixelData(twoLayers(), 9);
    expect(uploadedLayers(api)).toEqual(['A', 'B']);
  });

  it('a write DURING the upload is uploaded by the next save (versions are read before the export)', async () => {
    const engine = new FakeEngine();
    const { svc, api } = makeService(engine);
    const realExport = engine.exportRasterLayerToBlob.bind(engine);
    let once = true;
    spyOn(engine, 'exportRasterLayerToBlob').and.callFake(async (id: string) => {
      if (id === 'A' && once) { once = false; engine.write('A'); }   // lands after the version read
      return realExport(id);
    });
    await svc.uploadPixelData(twoLayers(), 9);
    api.uploadLayerPixelData.calls.reset();
    await svc.uploadPixelData(twoLayers(), 9);
    expect(uploadedLayers(api)).toEqual(['A']);
  });

  it('a failed upload stays dirty and retries', async () => {
    const engine = new FakeEngine();
    const { svc, api } = makeService(engine);
    await svc.uploadPixelData(twoLayers(), 9);
    engine.write('A');
    api.uploadLayerPixelData.and.returnValue({ subscribe: (o: any) => { o.error(new Error('net')); return { unsubscribe() {} }; } } as any);
    await svc.uploadPixelData(twoLayers(), 9);
    api.uploadLayerPixelData.and.returnValue(of({}));
    api.uploadLayerPixelData.calls.reset();
    await svc.uploadPixelData(twoLayers(), 9);
    expect(uploadedLayers(api)).toEqual(['A']);
  });

  it('animated layer: each cel from its own texture, only the cels that changed', async () => {
    const engine = new FakeEngine();
    const { svc, api } = makeService(engine);
    const anim = [layer('A', { animated: true, cels: [{ celId: 'c1', frame: 1, duration: 1, isKey: true, celType: 'key' }, { celId: 'c2', frame: 2, duration: 1, isKey: true, celType: 'key' }] })];
    await svc.uploadPixelData(anim, 9);
    expect(uploadedCels(api)).toEqual(['c1', 'c2']);
    expect(engine.exports).toEqual(['cel:c1', 'cel:c2']);
    api.uploadCelPixelData.calls.reset();
    engine.write('c2');
    await svc.uploadPixelData(anim, 9);
    expect(uploadedCels(api)).toEqual(['c2']);
  });

  it('older Salsa dist (no versions): only stroke / marked layers re-upload, as before', async () => {
    const engine: any = new FakeEngine();
    delete engine.getRasterContentVersions;
    engine.getRasterContentVersions = undefined;
    const { svc, api } = makeService(engine);
    expect(svc.hasContentVersions).toBeFalse();
    await svc.uploadPixelData([layer('A'), layer('B')], 9);
    api.uploadLayerPixelData.calls.reset();
    await svc.uploadPixelData([layer('A'), layer('B')], 9);
    expect(uploadedLayers(api)).toEqual([]);
    svc.markLayerDirty('B');           // the editor's fallback: the selected layer on a scene-graph change
    await svc.uploadPixelData([layer('A'), layer('B')], 9);
    expect(uploadedLayers(api)).toEqual(['B']);
    api.uploadLayerPixelData.calls.reset();
    svc.noteRasterStroke('A');         // undo / redo / a taken-back stroke
    await svc.uploadPixelData([layer('A'), layer('B')], 9);
    expect(uploadedLayers(api)).toEqual(['A']);
  });

  it('the pixel poll ticks the autosave after an edit no event announced — not mid-stroke, not when idle', () => {
    const engine = new FakeEngine();
    const { svc } = makeService(engine);
    const ticks: string[] = [];
    svc.sceneChanged$.subscribe(t => ticks.push(t));
    svc._pollPixelChanges();             // baseline
    svc._pollPixelChanges();             // nothing written
    expect(ticks).toEqual([]);
    engine.write('A');
    svc.rasterStrokeActive = true;
    svc._pollPixelChanges();
    expect(ticks).toEqual([]);
    svc.rasterStrokeActive = false;
    svc._pollPixelChanges();
    expect(ticks.length).toBe(1);
    svc._pollPixelChanges();
    expect(ticks.length).toBe(1);
  });

  it('leaving the document saves a pixel edit that is not uploaded yet', async () => {
    const engine = new FakeEngine();
    const { svc } = makeService(engine);
    const doSave = spyOn(svc, '_doSaveIllustrationV2').and.resolveTo();
    await svc.uploadPixelData([layer('A'), layer('B')], 9);
    await svc.flushPendingSave();
    expect(doSave).not.toHaveBeenCalled();
    engine.write('A');
    await svc.flushPendingSave();
    expect(doSave).toHaveBeenCalledTimes(1);
  });

  it('CloudUploadVersions / contentVersionsDiffer', () => {
    const v = { seq: 1, layers: { A: 'x' }, cels: { c: 'y' } };
    const rec = new CloudUploadVersions();
    expect(rec.layerChanged(v, 'A')).toBeTrue();
    rec.recordLayer('A', 'x'); rec.recordCel('c', 'y');
    expect(rec.layerChanged(v, 'A')).toBeFalse();
    expect(rec.layerChanged(v, 'unknown')).toBeTrue();
    expect(rec.anyChanged(v)).toBeFalse();
    expect(rec.anyChanged({ ...v, cels: { c: 'z' } })).toBeTrue();
    expect(contentVersionsDiffer(v, { ...v, layers: { A: 'x', B: 'n' } })).toBeTrue();
    expect(contentVersionsDiffer(v, { seq: 2, layers: { A: 'x' }, cels: { c: 'y' } })).toBeFalse();
  });
});
