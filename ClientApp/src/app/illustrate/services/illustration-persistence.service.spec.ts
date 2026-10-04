import { IllustrationPersistenceService } from './illustration-persistence.service';
import { EditorStateService } from './editor-state.service';

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
