import { IllustrationPersistenceService } from './illustration-persistence.service';
import { EditorStateService } from './editor-state.service';
import { of } from 'rxjs';

/** The persistence service with every collaborator stubbed: just enough engine / host for the save paths. */
function makeService() {
  const opfs = { write: jasmine.createSpy('write').and.resolveTo(true) };
  const autoSave = { saveNow: jasmine.createSpy('saveNow').and.resolveTo(true) };
  const local = { update: jasmine.createSpy('update').and.resolveTo(undefined) };
  const notify = { error: jasmine.createSpy('error'), success: jasmine.createSpy('success') };
  const svc = new IllustrationPersistenceService(
    new EditorStateService(), {} as any, {} as any, {} as any, {} as any, autoSave as any, {} as any, {} as any, {} as any,
    local as any, notify as any, opfs as any, {} as any,
  );
  const engine = {
    blocked: null as string | null,
    getSaveBlockedReason() { return this.blocked; },
    getLastRestoreIssues: () => [],
    getDocumentSize: () => null,
    clearSaveBlock() { this.blocked = null; },
  };
  const host = { shapeManager: engine, isLoading: false, doc: { illustrationTitle: 'Title' } };
  svc.bind(host as any);
  svc.illustration = { uuid: 'A', name: 'A' } as any;
  svc.syncMode = 2;   // local-only: OPFS is the save target
  return { svc, engine, host, opfs, autoSave, local, notify };
}

describe('IllustrationPersistenceService saving', () => {

  describe("Salsa's save block (audit Phase 2.2)", () => {
    it('does not write while saving is paused, and saves at once on "keep what loaded"', async () => {
      const { svc, engine } = makeService();
      const doSave = spyOn(svc, '_doSaveIllustrationV2').and.resolveTo();
      engine.blocked = 'Some layers failed to load';

      await svc.saveIllustrationV2();
      expect(doSave).not.toHaveBeenCalled();
      expect(svc.saveBlockedReason).toBe('Some layers failed to load');

      svc.saveBlockedKeepWhatLoaded();
      await Promise.resolve();
      expect(doSave).toHaveBeenCalledTimes(1);
    });

    it('does not flush OPFS metadata or thumbnails while paused', async () => {
      const { svc, engine, opfs } = makeService();
      const build = spyOn(svc, '_buildFullState').and.resolveTo({ layers: [] } as any);
      engine.blocked = 'partial restore';
      await svc._quickFlushOpfsMeta();
      expect(build).not.toHaveBeenCalled();
      expect(opfs.write).not.toHaveBeenCalled();
    });
  });

  describe('single-flight saves', () => {
    it('queues at most one save behind a running one', async () => {
      const { svc } = makeService();
      let release!: () => void;
      const doSave = spyOn(svc, '_doSaveIllustrationV2').and.callFake(() => new Promise<void>(r => { release = r; }));

      const first = svc.saveIllustrationV2();
      void svc.saveIllustrationV2();
      void svc.saveIllustrationV2();
      expect(doSave).toHaveBeenCalledTimes(1);
      doSave.and.resolveTo();
      release();
      await first;
      await new Promise(r => setTimeout(r));
      expect(doSave).toHaveBeenCalledTimes(2);
    });
  });

  describe('flushPendingSave (audit Phase 2.3)', () => {
    it('writes a change still waiting in the autosave debounce, then lets Salsa save its pixels', async () => {
      const { svc, autoSave } = makeService();
      const doSave = spyOn(svc, '_doSaveIllustrationV2').and.resolveTo();
      svc._pendingChange = true;
      await svc.flushPendingSave();
      expect(doSave).toHaveBeenCalledTimes(1);
      expect(autoSave.saveNow).toHaveBeenCalledTimes(1);
      expect(svc.hasUnsavedChanges).toBeFalse();
    });

    it('does nothing for a document that is still loading', async () => {
      const { svc, host, autoSave } = makeService();
      const doSave = spyOn(svc, '_doSaveIllustrationV2').and.resolveTo();
      host.isLoading = true;
      svc._pendingChange = true;
      await svc.flushPendingSave();
      expect(doSave).not.toHaveBeenCalled();
      expect(autoSave.saveNow).not.toHaveBeenCalled();
    });

    it('skips the pixel save while saving is paused', async () => {
      const { svc, engine, autoSave } = makeService();
      engine.blocked = 'partial restore';
      await svc.flushPendingSave();
      expect(autoSave.saveNow).not.toHaveBeenCalled();
    });
  });

  describe('a save writes the document it started on (audit Phase 2.3)', () => {
    it('keeps document A as the target even if the editor switches to B mid-save', async () => {
      const { svc, opfs, local } = makeService();
      spyOn(svc, '_buildFullState').and.callFake(async () => {
        svc.illustration = { uuid: 'B', name: 'B' } as any;   // a switch lands during the async build
        return { layers: [] } as any;
      });
      await svc.saveIllustrationV2();
      expect(opfs.write.calls.mostRecent().args[0]).toBe('local-A');
      expect(local.update.calls.mostRecent().args[0].uuid).toBe('A');
    });
  });

  describe('local save failures (audit Phase 2.4)', () => {
    it('tells the user once a minute when browser storage rejects the save', async () => {
      const { svc, opfs, notify } = makeService();
      spyOn(svc, '_buildFullState').and.resolveTo({ layers: [] } as any);
      opfs.write.and.resolveTo(false);
      await svc.saveIllustrationV2();
      await svc.saveIllustrationV2();
      expect(notify.error).toHaveBeenCalledTimes(1);
    });
  });
});

/** The persistence service wired for the document-switch paths: autosave + animation + .frog import stubs. */
function makeSwitchService() {
  const order: string[] = [];
  const autoSave = {
    disable: jasmine.createSpy('disable').and.callFake(() => order.push('autosave-off')),
    enable: jasmine.createSpy('enable'),
    saveNow: jasmine.createSpy('saveNow').and.resolveTo(true),
    state$: of('idle'),
  };
  const animation = { resetForNewDocument: jasmine.createSpy('resetForNewDocument').and.callFake(() => order.push('animation-reset')) };
  const frogFile = { pendingImport: null as any };
  const artboard = { fitArtboard: jasmine.createSpy('artboard.fitArtboard') };
  const svc = new IllustrationPersistenceService(
    new EditorStateService(), artboard as any, {} as any, {} as any, animation as any, autoSave as any, frogFile as any,
    { layerDitherConfigs: new Map(), layerFrameLinkConfigs: new Map() } as any, {} as any,
    {} as any, { error: () => undefined } as any, { write: async () => true, read: async () => null } as any, {} as any,
  );
  const engine = {
    startBlankDocument: jasmine.createSpy('startBlankDocument').and.callFake(async () => { order.push('engine-blank'); }),
    getSaveBlockedReason: () => null,
    getLastRestoreIssues: () => [],
    getDocumentSize: () => null,
  };
  const host = {
    shapeManager: engine, isLoading: true, doc: { illustrationTitle: '' }, selectedAutoSaveInterval: 30_000,
    resetSceneState: jasmine.createSpy('resetSceneState'),
    markLoaded: jasmine.createSpy('markLoaded'),
    applyFrogImport: jasmine.createSpy('applyFrogImport').and.resolveTo(),
  };
  svc.bind(host as any);
  return { svc, engine, host, autoSave, animation, frogFile, order, artboard };
}

describe('IllustrationPersistenceService across a document switch (New / Duplicate / Shell new)', () => {

  describe('startBlankDocument', () => {
    it('unbinds the autosave from the previous document BEFORE the engine is reset, and resets the app-wide animation state', async () => {
      const { svc, engine, order } = makeSwitchService();
      await svc.startBlankDocument(engine as any, 'NEW');
      expect(order).toEqual(['autosave-off', 'animation-reset', 'engine-blank']);
      expect(engine.startBlankDocument).toHaveBeenCalledWith('local-NEW', 'Untitled');
    });

    it('a cloud document gets no engine id until it is resolved (nothing can be saved meanwhile)', async () => {
      const { svc, engine } = makeSwitchService();
      await svc.startBlankDocument(engine as any, null);
      expect(engine.startBlankDocument).toHaveBeenCalledWith(undefined, 'Untitled');
    });
  });

  describe('the autosave targets the document that was opened', () => {
    it('a new local-only illustration (editor New / Shell new) autosaves to local-<its uuid>', async () => {
      const { svc, autoSave } = makeSwitchService();
      spyOn(svc, 'loadIllustrationV2').and.resolveTo();
      await svc.initWithIllustration({ uuid: 'NEW', name: 'Untitled Illustration', syncMode: 2 } as any);
      expect(autoSave.enable.calls.mostRecent().args[0]).toBe('local-NEW');
      expect(svc.illustration?.uuid).toBe('NEW');
    });

    it('a new cloud illustration autosaves to its own server id', async () => {
      const { svc, autoSave } = makeSwitchService();
      spyOn(svc, 'loadIllustrationV2').and.resolveTo();
      await svc.initWithIllustration({ id: 42, uuid: 'C', name: 'x', syncMode: 0 } as any);
      expect(autoSave.enable.calls.mostRecent().args[0]).toBe('42');
    });

    it("a cloud Duplicate's first save uploads everything (the server has none of the copy yet)", async () => {
      const { svc } = makeSwitchService();
      spyOn(svc, 'loadIllustrationV2').and.resolveTo();
      const full = spyOn(svc, 'forceFullUpload').and.callThrough();
      const prev = window.history.state;
      window.history.replaceState({ duplicateOf: 'SRC', illustration: { uuid: 'COPY' } }, '');
      try {
        await svc.initWithIllustration({ id: 7, uuid: 'COPY', name: 'Copy of Frog', syncMode: 0 } as any);
        expect(full).toHaveBeenCalledTimes(1);
        expect(svc._pendingChange).toBeTrue();
        // Opening a different document with that history state does not.
        full.calls.reset();
        await svc.initWithIllustration({ id: 8, uuid: 'OTHER', name: 'o', syncMode: 0 } as any);
        expect(full).not.toHaveBeenCalled();
      } finally {
        window.history.replaceState(prev, '');
      }
    });
  });

  describe('a pending .frog import', () => {
    it('is applied to the local-only document opened right after it was set (it used to wait for the next CLOUD doc)', async () => {
      const { svc, frogFile, host } = makeSwitchService();
      const pending = { manifest: { name: 'Imported', layers: [] } };
      frogFile.pendingImport = pending;
      svc.syncMode = 2;
      svc.illustration = { uuid: 'L', name: 'L' } as any;
      const localLoad = spyOn(svc as any, '_loadLocalOnly').and.resolveTo();
      await svc.loadIllustrationV2();
      expect(host.applyFrogImport).toHaveBeenCalledWith(pending);
      expect(frogFile.pendingImport).toBeNull();
      expect(localLoad).not.toHaveBeenCalled();
    });

    it('a New Illustration opened with nothing pending loads normally', async () => {
      const { svc, host } = makeSwitchService();
      svc.syncMode = 2;
      svc.illustration = { uuid: 'L', name: 'L' } as any;
      const localLoad = spyOn(svc as any, '_loadLocalOnly').and.resolveTo();
      await svc.loadIllustrationV2();
      expect(localLoad).toHaveBeenCalled();
      expect(host.applyFrogImport).not.toHaveBeenCalled();
    });
  });

  describe('a document the Shell created a moment ago (nothingSavedYet)', () => {
    /** A switch service whose autosave can load, with the engine bits the local load path touches. */
    function makeLocal() {
      const m = makeSwitchService();
      const loadDocument = jasmine.createSpy('loadDocument').and.resolveTo({ success: false, layers: [] });
      (m.autoSave as any).loadDocument = loadDocument;
      (m.animation as any).beginBulkRestore = jasmine.createSpy('beginBulkRestore');
      (m.animation as any).endBulkRestore = jasmine.createSpy('endBulkRestore');
      const shell = { isSceneActive: false, destroyScene: jasmine.createSpy('destroyScene') };
      const renderer = { isSuspended: false, resumeRendering: jasmine.createSpy('resumeRendering') };
      Object.assign(m.engine, { shell, webgpuRenderer: renderer });
      return { ...m, loadDocument, shell, renderer };
    }
    const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

    it('skips the OPFS lookup, stays on the blank engine document, and still finishes the load + binds the autosave', async () => {
      const { svc, host, autoSave, loadDocument, artboard } = makeLocal();
      await svc.initWithIllustration({ uuid: 'NEW', name: 'Untitled Illustration', syncMode: 2 } as any, { nothingSavedYet: true });
      expect(loadDocument).not.toHaveBeenCalled();
      expect(autoSave.enable.calls.mostRecent().args[0]).toBe('local-NEW');   // saves go to the new document
      expect(host.markLoaded).toHaveBeenCalledWith('illustration');
      await nextFrame();
      expect(artboard.fitArtboard).toHaveBeenCalled();   // the panel-aware fit (ArtboardService), not the engine's bare one
      expect(host.markLoaded).toHaveBeenCalledWith('sceneApplied');
    });

    it('is one-shot: the same service loads the next document (and this one again) from OPFS as usual', async () => {
      const { svc, loadDocument } = makeLocal();
      await svc.initWithIllustration({ uuid: 'NEW', name: 'n', syncMode: 2 } as any, { nothingSavedYet: true });
      await svc.initWithIllustration({ uuid: 'OLD', name: 'o', syncMode: 2 } as any);
      expect(loadDocument.calls.allArgs()).toEqual([['local-OLD']]);
      await svc.initWithIllustration({ uuid: 'NEW', name: 'n', syncMode: 2 } as any);
      expect(loadDocument.calls.allArgs()).toEqual([['local-OLD'], ['local-NEW']]);
    });

    it("without the hint a new local document takes the normal path (a reload, the editor's own New, a Duplicate)", async () => {
      const { svc, loadDocument, host } = makeLocal();
      await svc.initWithIllustration({ uuid: 'NEW', name: 'n', syncMode: 2 } as any);
      expect(loadDocument).toHaveBeenCalledOnceWith('local-NEW');
      await nextFrame();
      expect(host.markLoaded).toHaveBeenCalledWith('sceneApplied');
    });

    it('a pending .frog import still wins over the hint', async () => {
      const { svc, frogFile, host, loadDocument } = makeLocal();
      frogFile.pendingImport = { name: 'x' };
      await svc.initWithIllustration({ uuid: 'NEW', name: 'n', syncMode: 2 } as any, { nothingSavedYet: true });
      expect(host.applyFrogImport).toHaveBeenCalled();
      expect(loadDocument).not.toHaveBeenCalled();
    });

    it("keeps what Salsa's loadDocument did before looking: releases a Shell scene that is still up / a suspended renderer", async () => {
      const a = makeLocal();
      a.shell.isSceneActive = true;
      await a.svc.initWithIllustration({ uuid: 'A', name: 'n', syncMode: 2 } as any, { nothingSavedYet: true });
      expect(a.shell.destroyScene).toHaveBeenCalledTimes(1);
      expect(a.renderer.resumeRendering).not.toHaveBeenCalled();
      const b = makeLocal();
      b.renderer.isSuspended = true;
      await b.svc.initWithIllustration({ uuid: 'B', name: 'n', syncMode: 2 } as any, { nothingSavedYet: true });
      expect(b.renderer.resumeRendering).toHaveBeenCalledTimes(1);
      expect(b.shell.destroyScene).not.toHaveBeenCalled();
    });
  });
});
