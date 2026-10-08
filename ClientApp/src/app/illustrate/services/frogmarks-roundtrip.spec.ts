import { TestBed } from '@angular/core/testing';
import JSZip from 'jszip';
import { of } from 'rxjs';
import { ProjectFileService } from './project-file.service';
import { IllustrationPersistenceService } from './illustration-persistence.service';
import { EditorStateService } from './editor-state.service';
import { prepareShellProjectImport } from 'app/shared/components/studio/shell-project-import';
import { clearPendingProjectImport } from 'app/shared/services/illustrate/pending-project-import';
import { clearFreshLocalDocument } from 'app/shared/services/illustrate/fresh-local-document';

/**
 * .frogmarks round trip through the Frogmarks package code: the editor's Save .frogmarks (Export modal / File menu) →
 * the file → the Shell's Import (validate, new local document, hand-off) → the editor load of that document
 * (restoreProjectPackage) → the first save. The engine is a stub whose packProject returns a package shaped like
 * Salsa's (salsa project-package.ts) holding raster layers + cels, vector shapes, a 3D scene (an edited mesh with
 * modifiers, a character), Grease Pencil strokes, a GLB and a UV-paint texture; its unpackProject records what it is
 * given. The engine's own pack ⇄ unpack fidelity is Salsa's (project-package.test.ts, persistence-roundtrip.test.ts).
 */

const SCENE3D = {
  nodes: [{
    id: 'mesh-1', type: '3DMesh', name: 'Edited cube', primitive: 'cube',
    editMesh: { verts: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], faces: [[0, 1, 2, 3]], sharp: [[0, 1]] },
    modifiers: [{ type: 'subdivision', levels: 2 }, { type: 'mirror', axis: 'x', bisect: true }],
  }],
  characters: [{ id: 'char-1', name: 'Frog kid', bodyParams: { height: 1.4 } }],
  gpObjects: [{ id: 'gp-1', strokes: [{ points: [[0, 0, 0, 1], [1, 1, 0, 0.5]], width: 3, color: '#ff0000' }] }],
  globalScene: { fogMode: 'linear' },
};

/** Entries of a Salsa-shaped package (what packProject would write for the document above). */
function enginePackageEntries(): Record<string, string | Uint8Array> {
  return {
    'manifest.json': JSON.stringify({
      formatVersion: 2, packedAt: '2026-10-08T00:00:00.000Z',
      document: {
        version: 3, schemaVersion: 1, docId: 'local-SRC', name: 'Pond', createdAt: '', savedAt: '', canvasWidth: 8, canvasHeight: 4,
        documentSize: { w: 800, h: 400 }, pixelFormat: 'png',
        layers: [{ id: 'paint-1', name: 'Paint' }, { id: 'anim-1', name: 'Anim' }],
        animation: { enabled: true, frameCount: 12, fps: 8 },
      },
    }),
    'scene.json': JSON.stringify({ root: { children: [{ type: 'Rect', id: 'r1', x: 10, y: 20, layerId: 'vec-1' }, { type: 'Path', id: 'p1', d: 'M0 0 L5 5' }] } }),
    'scene3d.json': JSON.stringify(SCENE3D),
    'brushes.json': JSON.stringify([{ id: 'b1', name: 'Ink' }]),
    'textures3d.json': JSON.stringify({ entries: [{ id: 't1', dataUrl: 'data:image/png;base64,AAAA' }] }),
    'layers/paint-1.bin': new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 250]),
    'layers/anim-1.bin': new Uint8Array([137, 80, 78, 71, 9]),
    'cels/cel-1.bin': new Uint8Array([137, 80, 78, 71, 7, 7]),
    'models3d/mesh-9.glb': new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]),
    'meshTextures/mesh-1.png': new Uint8Array([137, 80, 78, 71, 42]),
  };
}

/** The editor settings Frogmarks owns (not in Salsa's package) as the local save would build them. */
const EDITOR_STATE = {
  version: 3, sceneGraph: '{"the":"full scene graph"}', layers: [
    { layerId: 'paint-1', name: 'Paint', ditherConfig: { enabled: true, pattern: 'bayer4' }, frameLinkAnimation: null },
    { layerId: 'anim-1', name: 'Anim', frameLinkAnimation: { enabled: true, frames: [1, 3] } },
  ],
  animation: { enabled: true, frameCount: 12, fps: 8, loopMode: 'pingpong', playRangeStart: 2, playRangeEnd: 9, onionSkin: { enabled: true } },
  ditherConfig: { enabled: true, pattern: 'halftone' },
  documentSize: { w: 800, h: 400 },
  bgColor: '#102030', dotColor: '#405060', paperGrain: { type: 'cold-press', scale: 2, strength: 0.5 },
  scene3dGlobalSettings: { cameraCuts: [{ frame: 0, cameraId: 'cam-1' }], garpCanDesigns: { can1: 'data:image/png;base64,BBBB' } },
  scene3dFrameLinkBuckets: { 'group-1': [['mesh-1'], ['mesh-2']] },
};

async function zipOf(entries: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip();
  for (const [k, v] of Object.entries(entries)) zip.file(k, v);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

async function entriesOf(blob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(blob);
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    out[name] = Array.from(await zip.files[name].async('uint8array')).join(',');
  }
  return out;
}

/** The editor's Save .frogmarks with a stub engine. Returns the downloaded file. */
async function exportFrogmarks(): Promise<{ blob: Blob; fileName: string }> {
  const engine = {
    packProject: jasmine.createSpy('packProject').and.callFake(() => zipOf(enginePackageEntries())),
    captureThumbnailBlob: jasmine.createSpy('captureThumbnailBlob').and.resolveTo(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
  };
  const persist = {
    illustration: { uuid: 'SRC', name: 'Pond (old name)' }, illustrationUid: 'SRC',
    _buildFullState: jasmine.createSpy('_buildFullState').and.resolveTo(JSON.parse(JSON.stringify(EDITOR_STATE))),
  };
  const files = TestBed.runInInjectionContext(() => new ProjectFileService(
    {} as any, {} as any, {} as any, {} as any, {} as any, { error: () => undefined } as any, persist as any));
  files.bind({ shapeManager: engine, doc: { illustrationTitle: 'Pond', startExportReminder: () => undefined } } as any);

  let blob: Blob | null = null;
  let fileName = '';
  spyOn(URL, 'createObjectURL').and.callFake((b: Blob) => { blob = b; return 'blob:test'; });
  spyOn(URL, 'revokeObjectURL');
  spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) { fileName = this.download; });
  await files.frogmarksSave();
  expect(blob).withContext('a file was downloaded').not.toBeNull();
  return { blob: blob!, fileName };
}

/** The editor's persistence for a local document, with an engine stub that records the restore. */
function makeEditor() {
  const calls: Record<string, any[]> = {};
  const rec = (name: string) => (...args: any[]) => { (calls[name] ??= []).push(args); };
  let unpacked: Blob | null = null;
  const engine: any = {
    shell: { isSceneActive: true, destroyScene: jasmine.createSpy('destroyScene') },
    webgpuRenderer: { isSuspended: false },
    unpackProject: jasmine.createSpy('unpackProject').and.callFake(async (f: Blob) => { unpacked = f; }),
    setCurrentDocId: rec('setCurrentDocId'),
    getDocumentSize: () => ({ w: 800, h: 400 }),
    setLayerDitherConfig: rec('setLayerDitherConfig'),
    setLayerFrameLinkAnimation: rec('setLayerFrameLinkAnimation'),
    setCameraCuts3D: rec('setCameraCuts3D'),
    getSaveBlockedReason: () => null,
    getLastRestoreIssues: () => [],
  };
  const autoSave = { enable: jasmine.createSpy('enable'), disable: () => undefined, saveNow: jasmine.createSpy('saveNow').and.resolveTo(true), state$: of('idle') };
  const animation = {
    beginBulkRestore: rec('beginBulkRestore'), endBulkRestore: rec('endBulkRestore'), refreshTimeline: rec('refreshTimeline'),
    setFrameCount: rec('setFrameCount'), setFps: rec('setFps'), setLoopMode: rec('setLoopMode'), setPlayRange: rec('setPlayRange'), setOnionSkin: rec('setOnionSkin'),
  };
  const artboard = { applyDocumentSize: rec('applyDocumentSize'), updateOverlay: rec('updateOverlay'), fitArtboard: rec('fitArtboard') };
  const canvasLook: any = { onBgColorSelected: rec('bgColor'), onDotColorSelected: rec('dotColor'), applyPaperGrain: rec('applyPaperGrain') };
  const fx = { layerDitherConfigs: new Map(), layerFrameLinkConfigs: new Map(), _applyDitherConfig: rec('globalDither'), _syncLayerDitherConfigsFromEngine: rec('syncLayerDither') };
  const s3 = { _syncScene3dPS1FromEngine: rec('syncPS1'), _syncEnvironmentStyleFromEngine: rec('syncEnv') };
  const anim: any = { syncPlayerFromEngine: rec('syncPlayer'), scene3dRefreshCameraNodes: rec('refreshCameraNodes'), scene3dCameraCuts: [] };
  const notify = { error: jasmine.createSpy('error'), success: jasmine.createSpy('success') };
  const svc = new IllustrationPersistenceService(
    new EditorStateService(), artboard as any, canvasLook, anim, animation as any, autoSave as any, { pendingImport: null } as any,
    fx as any, {} as any, {} as any, notify as any, { write: async () => true, read: async () => null } as any, s3 as any,
  );
  const host: any = {
    shapeManager: engine, isLoading: true, doc: { illustrationTitle: '' }, selectedAutoSaveInterval: 30_000,
    resetSceneState: () => undefined, markLoaded: jasmine.createSpy('markLoaded'), refreshRasterLayers: rec('refreshRasterLayers'),
    scene3dRefreshMeshes: rec('scene3dRefreshMeshes'), setAnimationEnabled: rec('setAnimationEnabled'), scene3dAllGroupBuckets: {}, garpCanDesigns: {},
  };
  svc.bind(host);
  return { svc, host, engine, autoSave, canvasLook, fx, anim, notify, calls, unpacked: () => unpacked };
}

describe('.frogmarks round trip: editor export → Shell import → editor', () => {
  afterEach(() => { clearPendingProjectImport(); clearFreshLocalDocument(); });

  it('the imported document gets exactly what was exported (engine package + editor settings), as a new local document', async () => {
    // 1. Export (Export modal › Download .frogmarks = File › Save .frogmarks…)
    const { blob, fileName } = await exportFrogmarks();
    expect(fileName).toBe('Pond.frogmarks');

    // 2. Shell › Settings › Import .frogmarks… — a NEW document, name from the file, made unique
    const created: string[] = [];
    const item = await prepareShellProjectImport(new File([blob], fileName), {
      listNames: async () => ['Pond'],
      create: async (name) => { created.push(name); return { uuid: 'NEW', name, syncMode: 2, type: 'illustration' } as any; },
      parseFrog: async () => { throw new Error('not a .frog'); },
      setFrogPending: () => { throw new Error('not a .frog'); },
    });
    expect(created).toEqual(['Pond (2)']);

    // 3. The editor opens it (the Shell marked it fresh: nothing saved yet)
    const ed = makeEditor();
    await ed.svc.initWithIllustration(item as any, { nothingSavedYet: true });
    await new Promise<void>(r => requestAnimationFrame(() => r()));

    // The engine got the whole package, byte for byte (Frogmarks' two entries ride along; the engine ignores them)
    expect(ed.engine.unpackProject).toHaveBeenCalledTimes(1);
    const got = await entriesOf(ed.unpacked()!);
    const want = await entriesOf(await zipOf(enginePackageEntries()));
    for (const [name, bytes] of Object.entries(want)) expect(got[name]).withContext(name).toBe(bytes);
    expect(Object.keys(got).sort()).toEqual([...Object.keys(want), 'frogmarks-state.json', 'thumbnail.png'].sort());

    // Saves go to the NEW document, and the Shell scene was released before the restore
    expect(ed.calls['setCurrentDocId']).toEqual([['local-NEW', 'Pond (2)']]);
    expect(ed.autoSave.enable.calls.mostRecent().args[0]).toBe('local-NEW');
    expect(ed.engine.shell.destroyScene).toHaveBeenCalled();

    // The editor-owned settings are back
    expect(ed.calls['bgColor']).toEqual([['#102030']]);
    expect(ed.calls['dotColor']).toEqual([['#405060']]);
    expect(ed.canvasLook.paperGrainType).toBe('cold-press');
    expect(ed.canvasLook.paperGrainScale).toBe(2);
    expect(ed.calls['globalDither']).toEqual([[EDITOR_STATE.ditherConfig]]);
    expect(ed.calls['setLayerDitherConfig']).toEqual([['paint-1', EDITOR_STATE.layers[0].ditherConfig]]);
    expect(ed.fx.layerDitherConfigs.get('paint-1')).toEqual(EDITOR_STATE.layers[0].ditherConfig);
    expect(ed.calls['setLayerFrameLinkAnimation']).toEqual([['anim-1', EDITOR_STATE.layers[1].frameLinkAnimation]]);
    expect(ed.calls['setFrameCount']).toEqual([[12]]);
    expect(ed.calls['setLoopMode']).toEqual([['pingpong']]);
    expect(ed.calls['setPlayRange']).toEqual([[2, 9]]);
    expect(ed.calls['applyDocumentSize'].at(-1)).toEqual([{ w: 800, h: 400 }]);
    expect(ed.calls['setCameraCuts3D']).toEqual([[EDITOR_STATE.scene3dGlobalSettings.cameraCuts]]);
    expect(ed.host.garpCanDesigns).toEqual(EDITOR_STATE.scene3dGlobalSettings.garpCanDesigns);
    expect(ed.host.scene3dAllGroupBuckets).toEqual(EDITOR_STATE.scene3dFrameLinkBuckets);
    // … and the panels follow the engine
    for (const k of ['refreshRasterLayers', 'scene3dRefreshMeshes', 'syncLayerDither', 'syncPS1', 'syncEnv', 'syncPlayer', 'refreshTimeline']) {
      expect(ed.calls[k]?.length).withContext(k).toBeGreaterThan(0);
    }
    expect(ed.host.markLoaded).toHaveBeenCalledWith('sceneApplied');
    expect(ed.notify.error).not.toHaveBeenCalled();

    // 4. Once the load is over the import is saved (metadata + the engine's pixels / 3D), without waiting for an edit
    const save = spyOn(ed.svc, 'saveIllustrationV2').and.resolveTo();
    spyOn(ed.svc, 'saveThumbnailIfChanged');
    expect(ed.autoSave.saveNow).not.toHaveBeenCalled();
    ed.host.isLoading = false;
    await new Promise(r => setTimeout(r, 250));
    expect(save).toHaveBeenCalledTimes(1);
    expect(ed.autoSave.saveNow).toHaveBeenCalledTimes(1);
  });

  it('a file saved before editor settings were included still imports (engine content only)', async () => {
    const zip = await JSZip.loadAsync(await zipOf(enginePackageEntries()));
    zip.file('frogmarks-state.json', JSON.stringify({ formatVersion: 1, packedAt: '', name: 'Old pond', uuid: 'X', illustrationId: null, teamId: null, deviceName: null }));
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'Old_pond.frogmarks');
    const item = await prepareShellProjectImport(file, {
      listNames: async () => [], create: async (name) => ({ uuid: 'N2', name } as any),
      parseFrog: async () => { throw new Error('x'); }, setFrogPending: () => undefined,
    });
    const ed = makeEditor();
    await ed.svc.initWithIllustration({ ...item, syncMode: 2 } as any, { nothingSavedYet: true });
    expect(ed.engine.unpackProject).toHaveBeenCalledTimes(1);
    expect(ed.calls['bgColor']).toBeUndefined();
    expect(ed.calls['applyDocumentSize']).toEqual([[{ w: 800, h: 400 }]]);   // from the engine
    expect(ed.calls['setCurrentDocId']).toEqual([['local-N2', 'Old pond']]);
  });

  it('an engine restore that fails is an error toast; the load still finishes and nothing is saved', async () => {
    const { blob } = await exportFrogmarks();
    const item = await prepareShellProjectImport(new File([blob], 'Pond.frogmarks'), {
      listNames: async () => [], create: async (name) => ({ uuid: 'N3', name } as any),
      parseFrog: async () => { throw new Error('x'); }, setFrogPending: () => undefined,
    });
    const ed = makeEditor();
    ed.engine.unpackProject.and.rejectWith(new Error('corrupt'));
    const save = spyOn(ed.svc, 'saveIllustrationV2').and.resolveTo();
    await ed.svc.initWithIllustration({ ...item, syncMode: 2 } as any, { nothingSavedYet: true });
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    expect(ed.notify.error).toHaveBeenCalledTimes(1);
    expect(ed.host.markLoaded).toHaveBeenCalledWith('sceneApplied');
    ed.host.isLoading = false;
    await new Promise(r => setTimeout(r, 250));
    expect(save).not.toHaveBeenCalled();
    expect(ed.autoSave.saveNow).not.toHaveBeenCalled();
  });

  it('opening any other document leaves a pending import alone (and a second open of the imported one loads what was saved)', async () => {
    const { blob } = await exportFrogmarks();
    await prepareShellProjectImport(new File([blob], 'Pond.frogmarks'), {
      listNames: async () => [], create: async (name) => ({ uuid: 'N4', name } as any),
      parseFrog: async () => { throw new Error('x'); }, setFrogPending: () => undefined,
    });
    const other = makeEditor();
    (other.svc as any).autoSaveService.loadDocument = jasmine.createSpy('loadDocument').and.resolveTo({ success: false, layers: [] });
    (other.svc as any).animationService.beginBulkRestore = () => undefined;
    await other.svc.initWithIllustration({ uuid: 'SOMETHING-ELSE', name: 'x', syncMode: 2 } as any);
    expect(other.engine.unpackProject).not.toHaveBeenCalled();
    const ed = makeEditor();
    await ed.svc.initWithIllustration({ uuid: 'N4', name: 'Pond', syncMode: 2 } as any, { nothingSavedYet: true });
    expect(ed.engine.unpackProject).toHaveBeenCalledTimes(1);
  });
});
