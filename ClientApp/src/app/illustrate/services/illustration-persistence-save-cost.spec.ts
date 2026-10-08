import { of } from 'rxjs';
import { IllustrationPersistenceService } from './illustration-persistence.service';
import { EditorStateService } from './editor-state.service';
import { FrogFileService } from 'app/shared/services/illustrate/frog-file.service';
import { RasterAutoSaveService } from 'app/shared/services/raster/raster-autosave.service';

/**
 * Save cost (perf audit 2026-10-09 B5 / B6): how many full scene-graph JSON builds one save cycle makes, and how big the
 * OPFS metadata copy is. A "save cycle" = what one burst of edits costs: the 2 s autosave, the quick metadata flush
 * (_metaFlush$), the 5 s thumbnail check, and the flush when the document is left.
 *
 * The fake engine's full scene graph carries ~1 MB of skinned geometry (what getSceneGraphJSON serializes for a
 * character); Salsa's document JSON strips it; the 2D export holds the vector shapes only.
 */

const SKINNED = 'x'.repeat(1_000_000);
const FULL = JSON.stringify({ root: { children: [{ type: 'Rectangle', id: 'r' }, { type: 'SkinnedMesh3D', id: 'b', jointWeightsB64: SKINNED }] } });
const DOC = JSON.stringify({ root: { children: [{ type: 'Rectangle', id: 'r' }, { type: 'SkinnedMesh3D', id: 'b' }] } });
const TWO_D = JSON.stringify({ root: { children: [{ type: 'Rectangle', id: 'r' }] } });

function makeEngine(opts: { oldDist?: boolean } = {}) {
  const engine: any = {
    getSceneGraphJSON: jasmine.createSpy('getSceneGraphJSON').and.returnValue(FULL),
    getRasterLayers: () => [{ id: 'L1', name: 'Paint', type: 'layer' }, { id: 'V1', name: 'Vector', type: 'vector' }],
    getLayerDitherConfig: () => undefined,
    getLayerFrameLinkAnimation: () => undefined,
    getDocumentSize: () => ({ w: 100, h: 100 }),
    getScene3DHierarchy: () => [],
    getSaveBlockedReason: () => null,
    getLastRestoreIssues: () => [],
    getScene3DNodeStates: jasmine.createSpy('getScene3DNodeStates').and.returnValue([{ id: 'm1' }]),
    getDirtyMeshIds3D: () => [],
    getRasterTextureSize: () => ({ w: 4, h: 4 }),
    saveDocument: jasmine.createSpy('saveDocument').and.resolveTo(true),
    isAutoSaveAvailable: () => true,
    captureDocumentBoundsToBlob: jasmine.createSpy('capture').and.resolveTo(new Blob(['j'])),
    getSceneStructureVersion: () => 1,
  };
  if (!opts.oldDist) {
    engine.getSceneGraphJSONForDocument = jasmine.createSpy('getSceneGraphJSONForDocument').and.returnValue(DOC);
    engine.getSceneGraphJSON2D = jasmine.createSpy('getSceneGraphJSON2D').and.returnValue(TWO_D);
    engine.getScene3DNodeIds = jasmine.createSpy('getScene3DNodeIds').and.returnValue(['m1']);
    engine.notifyDocumentChanged = jasmine.createSpy('notifyDocumentChanged');   // the change-triggered document save
  }
  return engine;
}

function makeService(syncMode: 0 | 1 | 2, engine: any) {
  const anim = {
    timelineLayers$: of([]), animationEnabled$: of(false), frameCount$: of(24), fps$: of(12), loopMode$: of('loop'),
    playRangeStart$: of(1), playRangeEnd$: of(24),
    onionSkin$: of({ enabled: false, framesBefore: 1, framesAfter: 1, opacity: 0.3, tintBefore: '#f00', tintAfter: '#00f' }),
  };
  const frog = new FrogFileService(anim as any);
  Object.defineProperty(frog, 'sm', { get: () => engine });
  const autoSave = new RasterAutoSaveService({ runOutsideAngular: (f: () => unknown) => f(), run: (f: () => unknown) => f() } as any);
  Object.defineProperty(autoSave, 'sm', { get: () => engine });
  (autoSave as any)._docId = 'doc';
  const metaWrites: string[] = [];
  const opfs = {
    write: jasmine.createSpy('write').and.callFake(async (_k: string, s: any) => { metaWrites.push(JSON.stringify(s)); return true; }),
    read: async () => null,
  };
  const api = {
    saveState: jasmine.createSpy('saveState').and.returnValue(of({ resultObject: { revision: 1 } })),
    uploadLayerPixelData: () => of({}), uploadCelPixelData: () => of({}), uploadThumbnail: () => of({}),
    updateIllustration: () => of({}),
  };
  const local = { update: async () => undefined, updateThumbnail: async () => undefined };
  const svc = new IllustrationPersistenceService(
    new EditorStateService(), {} as any, { bgColor: '#fff', dotColor: '#000' } as any, { scene3dCameraCuts: [] } as any,
    {} as any, autoSave, frog, { ditherConfig: {}, layerDitherConfigs: new Map(), layerFrameLinkConfigs: new Map() } as any,
    api as any, local as any, { error: () => undefined, success: () => undefined } as any, opfs as any, { scene3dGridColor: [1, 1, 1] } as any,
  );
  const host = { shapeManager: engine, isLoading: false, doc: { illustrationTitle: 'T' }, garpCanDesigns: {}, scene3dAllGroupBuckets: {} };
  svc.bind(host as any);
  svc.illustration = { id: 9, uuid: 'U', name: 'T' } as any;
  svc.illustrationUid = 'U';
  svc.syncMode = syncMode;
  return { svc, engine, opfs, api, metaWrites };
}

/** Full scene JSON builds (getSceneGraphJSON — unstripped, ~1 MB here) and stripped ones, per call site. */
function counts(engine: any) {
  return {
    full: engine.getSceneGraphJSON.calls.count(),
    document: engine.getSceneGraphJSONForDocument?.calls.count() ?? 0,
    twoD: engine.getSceneGraphJSON2D?.calls.count() ?? 0,
  };
}

async function saveCycle(svc: IllustrationPersistenceService): Promise<number> {
  const t0 = performance.now();
  await svc._quickFlushOpfsMeta();
  await svc.saveIllustrationV2();
  await svc.saveThumbnailIfChangedNow();
  svc._pendingChange = true;
  await svc.flushPendingSave();
  return performance.now() - t0;
}

describe('save cost — scene JSON builds per save (perf audit B5 / B6)', () => {
  for (const mode of [2, 1, 0] as const) {
    it(`sync mode ${mode}: no unstripped scene JSON; the metadata holds no scene copy`, async () => {
      const { svc, engine, metaWrites } = makeService(mode, makeEngine());
      const ms = await saveCycle(svc);
      const c = counts(engine);
      const metaBytes = metaWrites.map(s => s.length);
      console.log(`[save-cost] mode ${mode} (new dist): builds ${JSON.stringify(c)}, meta writes ${JSON.stringify(metaBytes)} bytes, ${ms.toFixed(1)} ms`);
      expect(c.full).toBe(0);
      expect(c.document).toBe(0);
      expect(c.twoD).toBe(mode === 0 ? 2 : 0);   // cloud: the server's 2D scene graph, one per cloud save
      for (const s of metaWrites) {
        expect(s.length).toBeLessThan(10_000);
        expect(JSON.parse(s).sceneGraph).toBeNull();
      }
    });
  }

  it('old dist (no change-triggered save): the metadata keeps the FULL scene copy, exactly as before', async () => {
    for (const mode of [2, 1, 0] as const) {
      const engine = makeEngine({ oldDist: true });
      engine.getSceneGraphJSONForDocument = jasmine.createSpy('getSceneGraphJSONForDocument').and.returnValue(DOC);
      const { svc, metaWrites, api } = makeService(mode, engine);
      await saveCycle(svc);
      const c = counts(engine);
      console.log(`[save-cost] mode ${mode} (old dist): builds ${JSON.stringify(c)}, meta writes ${JSON.stringify(metaWrites.map(s => s.length))} bytes`);
      expect(c).toEqual({ full: 3, document: 0, twoD: 0 });   // quick flush + 2 saves (the thumbnail check builds none)
      expect(metaWrites.length).toBe(3);
      for (const s of metaWrites) expect(JSON.parse(s).sceneGraph).toBe(FULL);
      if (mode === 0) expect(JSON.parse(api.saveState.calls.mostRecent().args[1].sceneGraph).root.children).toEqual([{ type: 'Rectangle', id: 'r' }]);
    }
  });

  it('new engine save but no 2D export: the cloud filters the STRIPPED document JSON (no unstripped build)', async () => {
    const engine = makeEngine();
    delete engine.getSceneGraphJSON2D;
    const { svc, api, metaWrites } = makeService(0, engine);
    await svc.saveIllustrationV2();
    expect(counts(engine)).toEqual({ full: 0, document: 1, twoD: 0 });
    expect(JSON.parse(api.saveState.calls.mostRecent().args[1].sceneGraph).root.children).toEqual([{ type: 'Rectangle', id: 'r' }]);
    expect(JSON.parse(metaWrites[0]).sceneGraph).toBeNull();
  });

  it('cloud: the mesh id list comes from the cheap id API when the dist has it', async () => {
    const engine = makeEngine();
    const { svc, api } = makeService(0, engine);
    await svc.saveIllustrationV2();
    expect(engine.getScene3DNodeStates).not.toHaveBeenCalled();
    expect(api.saveState.calls.mostRecent().args[1].meshIds).toEqual(['m1']);
    const old = makeEngine({ oldDist: true });
    const o = makeService(0, old);
    await o.svc.saveIllustrationV2();
    expect(old.getScene3DNodeStates).toHaveBeenCalledTimes(1);
    expect(o.api.saveState.calls.mostRecent().args[1].meshIds).toEqual(['m1']);
  });
});

describe('thumbnail check (perf audit B6a)', () => {
  it('builds no scene JSON; captures once per change, not again while nothing changed', async () => {
    const engine = makeEngine();
    const { svc } = makeService(2, engine);
    await svc.saveThumbnailIfChangedNow();               // first check after a load: captures
    await svc.saveThumbnailIfChangedNow();               // nothing changed: no capture
    expect(engine.captureDocumentBoundsToBlob).toHaveBeenCalledTimes(1);
    svc.sceneChanged$.next('__scene_1');                 // a vector / 3D / settings change
    await svc.saveThumbnailIfChangedNow();
    expect(engine.captureDocumentBoundsToBlob).toHaveBeenCalledTimes(2);
    svc.noteRasterStroke('L1');                          // a raster edit
    await svc.saveThumbnailIfChangedNow();
    expect(engine.captureDocumentBoundsToBlob).toHaveBeenCalledTimes(3);
    svc.markThumbnailCurrent();                          // a custom thumbnail was just set
    svc.sceneChanged$.next('__scene_2');
    svc.markThumbnailCurrent();
    await svc.saveThumbnailIfChangedNow();
    expect(engine.captureDocumentBoundsToBlob).toHaveBeenCalledTimes(3);
    expect(counts(engine)).toEqual({ full: 0, document: 0, twoD: 0 });
  });
});

describe('leaving a document / Ctrl+S use the incremental save (perf audit B5)', () => {
  it('flushPendingSave asks Salsa for the incremental explicit save', async () => {
    const engine = makeEngine();
    const { svc } = makeService(2, engine);
    svc._pendingChange = true;
    await svc.flushPendingSave();
    expect(engine.saveDocument).toHaveBeenCalledOnceWith({ incremental: true });
  });

  it('RasterAutoSaveService.saveNow: incremental on request, full otherwise; the old dist just ignores the option', async () => {
    const engine = makeEngine();
    const autoSave = new RasterAutoSaveService({ runOutsideAngular: (f: () => unknown) => f(), run: (f: () => unknown) => f() } as any);
    Object.defineProperty(autoSave, 'sm', { get: () => engine });
    (autoSave as any)._docId = 'doc';
    expect(await autoSave.saveNow({ incremental: true })).toBeTrue();
    expect(await autoSave.saveNow()).toBeTrue();
    expect(engine.saveDocument.calls.allArgs()).toEqual([[{ incremental: true }], []]);
  });
});


describe('load path with metadata that has / has no scene graph (perf audit B6c — backward compatible)', () => {
  /** A local-only load: Salsa restored `salsaChildren` top-level nodes; the metadata file is `meta`. */
  async function loadLocal(meta: any, salsaChildren: number) {
    const engine: any = {
      getSceneStructureJSON: () => JSON.stringify({ root: { children: new Array(salsaChildren).fill({ type: 'Rectangle' }) } }),
      setSceneGraphJSON: jasmine.createSpy('setSceneGraphJSON').and.resolveTo(),
      getSaveBlockedReason: () => null,
    };
    const autoSave = { loadDocument: jasmine.createSpy('loadDocument').and.resolveTo({ success: true, layers: [] }) };
    const anim = { beginBulkRestore: () => undefined, endBulkRestore: () => undefined };
    const opfs = { read: jasmine.createSpy('read').and.resolveTo(meta), write: async () => true };
    const svc = new IllustrationPersistenceService(
      new EditorStateService(), { fitArtboard: () => undefined } as any, {} as any, {} as any, anim as any, autoSave as any, {} as any,
      {} as any, {} as any, {} as any, { error: () => undefined } as any, opfs as any, {} as any,
    );
    svc.bind({ shapeManager: engine, isLoading: false, doc: { illustrationTitle: 'T' }, markLoaded: () => undefined } as any);
    svc.illustration = { uuid: 'U', name: 'T' } as any;
    svc.syncMode = 2;
    spyOn(svc as any, '_afterEngineDocumentLoaded');
    const applied = spyOn(svc as any, '_applyEditorMeta').and.resolveTo();
    await (svc as any)._loadLocalOnly();
    return { engine, applied, autoSave, opfs };
  }
  const OLD_META = { version: 2, sceneGraph: '{"root":{"children":[{"type":"Rectangle"}]}}', animation: null, layers: [], bgColor: '#111' };
  const NEW_META = { ...OLD_META, sceneGraph: null };

  it('new metadata (no scene graph): Salsa\'s document is the scene; the editor settings still apply', async () => {
    const { engine, applied, autoSave, opfs } = await loadLocal(NEW_META, 3);
    expect(autoSave.loadDocument).toHaveBeenCalledOnceWith('local-U');
    expect(opfs.read).toHaveBeenCalledOnceWith('local-U');
    expect(engine.setSceneGraphJSON).not.toHaveBeenCalled();
    expect(applied).toHaveBeenCalledOnceWith(NEW_META);
  });

  it('new metadata + an empty Salsa scene: nothing to fall back on, nothing breaks', async () => {
    const { engine, applied } = await loadLocal(NEW_META, 0);
    expect(engine.setSceneGraphJSON).not.toHaveBeenCalled();
    expect(applied).toHaveBeenCalledTimes(1);
  });

  it('old metadata (with a scene graph): still the fallback when Salsa restored no scene, ignored when it did', async () => {
    const empty = await loadLocal(OLD_META, 0);
    expect(empty.engine.setSceneGraphJSON).toHaveBeenCalledOnceWith(OLD_META.sceneGraph);
    const restored = await loadLocal(OLD_META, 2);
    expect(restored.engine.setSceneGraphJSON).not.toHaveBeenCalled();
    expect(restored.applied).toHaveBeenCalledOnceWith(OLD_META);
  });
});

describe("every change schedules Salsa's debounced save (Salsa's document is the only scene copy)", () => {
  it('sceneChanged$ → RasterAutoSaveService.notifyDocumentChanged → sm.notifyDocumentChanged (outside the zone)', async () => {
    const notify = jasmine.createSpy('notifyDocumentChanged');
    const autoSave = { enable: () => undefined, disable: () => undefined, state$: of('idle'), notifyDocumentChanged: notify };
    const svc = new IllustrationPersistenceService(
      new EditorStateService(), {} as any, {} as any, {} as any, {} as any, autoSave as any, {} as any,
      { layerDitherConfigs: new Map(), layerFrameLinkConfigs: new Map() } as any, {} as any, {} as any, {} as any,
      { write: async () => true } as any, {} as any,
    );
    svc.bind({ shapeManager: { getSaveBlockedReason: () => null, getLastRestoreIssues: () => [] }, isLoading: false,
      doc: { illustrationTitle: '' }, selectedAutoSaveInterval: 0, resetSceneState: () => undefined, markLoaded: () => undefined } as any);
    spyOn(svc, 'loadIllustrationV2').and.resolveTo();
    await svc.initWithIllustration({ uuid: 'N', name: 'n', syncMode: 2 } as any);
    svc.sceneChanged$.next('__scene_1');
    svc.sceneChanged$.next('__state_2');
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('RasterAutoSaveService.notifyDocumentChanged: forwards only while a document is bound; old dist = no-op', () => {
    const engine: any = { notifyDocumentChanged: jasmine.createSpy('sm.notifyDocumentChanged'), enableAutoSave: () => undefined,
      onSaveEvent: () => undefined, disableAutoSave: () => undefined, isAutoSaveAvailable: () => true };
    let outside = 0;
    const zone = { runOutsideAngular: (f: () => unknown) => { outside++; return f(); }, run: (f: () => unknown) => f() };
    const autoSave = new RasterAutoSaveService(zone as any);
    Object.defineProperty(autoSave, 'sm', { get: () => engine });
    autoSave.notifyDocumentChanged();                      // nothing bound
    expect(engine.notifyDocumentChanged).not.toHaveBeenCalled();
    autoSave.enable('local-N', 'n', { intervalMs: 0 });
    outside = 0;
    autoSave.notifyDocumentChanged();
    expect(engine.notifyDocumentChanged).toHaveBeenCalledTimes(1);
    expect(outside).toBe(1);
    autoSave.disable();
    autoSave.notifyDocumentChanged();
    expect(engine.notifyDocumentChanged).toHaveBeenCalledTimes(1);
    delete engine.notifyDocumentChanged;                   // older dist
    autoSave.enable('local-N', 'n', { intervalMs: 0 });
    expect(() => autoSave.notifyDocumentChanged()).not.toThrow();
  });
});
