import { of } from 'rxjs';
import { DocumentActionsService } from './document-actions.service';
import { ResultType } from '../../shared/models/error-result.model';

/** The document actions with every collaborator stubbed. `order` records the sequence that matters: the open document
 *  is saved BEFORE anything new is created, and the editor navigates last. */
function makeService(opts: { syncMode?: number; illustration?: any } = {}) {
  const order: string[] = [];
  const persist = {
    illustration: opts.illustration ?? { id: 5, uuid: 'SRC', name: 'Frog', teamId: 3, documentAspect: 1.5 },
    syncMode: opts.syncMode ?? 2,
    flushPendingSave: jasmine.createSpy('flushPendingSave').and.callFake(async () => { order.push('flush'); }),
    saveThumbnailIfChangedNow: jasmine.createSpy('saveThumbnailIfChangedNow').and.callFake(async () => { order.push('thumbnail'); }),
  };
  const local = {
    create: jasmine.createSpy('create').and.callFake(async (name: string, aspect?: number, kind?: string) => {
      order.push('create-local');
      return { uuid: 'NEW', name, documentAspect: aspect, kind, syncMode: 2 };
    }),
    getByUuid: jasmine.createSpy('getByUuid').and.resolveTo({ uuid: 'SRC', name: 'Frog', documentAspect: 1.5, kind: 'illustration', thumbnailDataUrl: 'data:thumb' }),
    update: jasmine.createSpy('update').and.callFake(async (p: any) => ({ uuid: p.uuid, name: 'Copy of Frog', thumbnailDataUrl: p.thumbnailDataUrl })),
    delete: jasmine.createSpy('delete').and.resolveTo(undefined),
  };
  const created = { id: 7, uuid: 'CLOUD-NEW', name: 'x' };
  const api = {
    createIllustration: jasmine.createSpy('createIllustration').and.callFake(() => { order.push('create-cloud'); return of({ resultType: ResultType.Success, resultObject: created }); }),
    duplicateIllustration: jasmine.createSpy('duplicateIllustration').and.returnValue(of({ resultType: ResultType.Success, resultObject: { id: 8, uuid: 'SERVER-DUP' } })),
    deleteIllustration: jasmine.createSpy('deleteIllustration').and.returnValue(of({})),
  };
  const notify = { error: jasmine.createSpy('error'), success: jasmine.createSpy('success') };
  const router = { navigate: jasmine.createSpy('navigate').and.callFake(async () => { order.push('navigate'); return true; }) };
  const opfsMeta = { read: jasmine.createSpy('read').and.resolveTo(null), write: jasmine.createSpy('write').and.resolveTo(true) };
  const svc = new DocumentActionsService(
    {} as any, {} as any, api as any, local as any, notify as any, persist as any, router as any, {} as any, opfsMeta as any,
  );
  const host = { shapeManager: {}, canvas: null, closeContextMenu: jasmine.createSpy('closeContextMenu') };
  svc.bind(host as any);
  svc.illustrationTitle = 'Frog';
  return { svc, persist, local, api, notify, router, opfsMeta, host, order, created };
}

describe('DocumentActionsService', () => {

  describe('New Illustration', () => {
    it('local-only: saves the open document first, creates a local illustration and opens it on the local route', async () => {
      const { svc, router, order, local } = makeService({ syncMode: 2 });
      await svc.newIllustrationButtonClicked();
      expect(order).toEqual(['flush', 'thumbnail', 'create-local', 'navigate']);
      expect(local.create).toHaveBeenCalled();
      const [commands, extras] = router.navigate.calls.mostRecent().args as any[];
      expect(commands).toEqual(['/illustration/local', 'NEW']);
      expect(extras.state.isNew).toBeTrue();
      expect(extras.state.illustration.uuid).toBe('NEW');
    });

    it('cloud: creates a server illustration in the same team and storage mode and opens it (/illustration, not /illustrate)', async () => {
      for (const syncMode of [0, 1]) {
        const { svc, router, api, order } = makeService({ syncMode });
        await svc.newIllustrationButtonClicked();
        expect(order).toEqual(['flush', 'thumbnail', 'create-cloud', 'navigate']);
        const sent = api.createIllustration.calls.mostRecent().args[0];
        expect(sent).toEqual(jasmine.objectContaining({ id: 0, teamId: 3, syncMode }));
        expect(router.navigate.calls.mostRecent().args[0]).toEqual(['/illustration', 'CLOUD-NEW']);
      }
    });

    it('a second click while one is running creates nothing more', async () => {
      const { svc, local } = makeService({ syncMode: 2 });
      await Promise.all([svc.newIllustrationButtonClicked(), svc.newIllustrationButtonClicked()]);
      expect(local.create).toHaveBeenCalledTimes(1);
    });

    it('a failed create reports it and stays on the open document', async () => {
      spyOn(console, 'error');   // the failure is logged on purpose
      const { svc, api, router, notify } = makeService({ syncMode: 0 });
      api.createIllustration.and.returnValue(of({ resultType: ResultType.Failure }));
      await svc.newIllustrationButtonClicked();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(notify.error).toHaveBeenCalled();
    });
  });

  describe('Duplicate Illustration', () => {
    it('local-only: saves first, copies the SAVED document to the new id, keeps the thumbnail, opens the copy', async () => {
      const { svc, router, order, local } = makeService({ syncMode: 2 });
      const copy = spyOn(svc as any, '_copySavedDocument').and.callFake(async () => { order.push('copy'); return true; });
      await svc.duplicateIllustrationButtonClicked();
      expect(order).toEqual(['flush', 'thumbnail', 'create-local', 'copy', 'navigate']);
      expect(local.create).toHaveBeenCalledWith('Copy of Frog', 1.5, 'illustration');
      expect(copy).toHaveBeenCalledWith('local-SRC', 'local-NEW', 'Copy of Frog');
      expect(local.update).toHaveBeenCalledWith({ uuid: 'NEW', thumbnailDataUrl: 'data:thumb' });
      const [commands, extras] = router.navigate.calls.mostRecent().args as any[];
      expect(commands).toEqual(['/illustration/local', 'NEW']);
      expect(extras.state.duplicateOf).toBe('SRC');
    });

    it('local-only: a failed copy removes the half-made illustration and does not open it', async () => {
      spyOn(console, 'error');   // the failure is logged on purpose
      const { svc, router, local, notify } = makeService({ syncMode: 2 });
      spyOn(svc as any, '_copySavedDocument').and.resolveTo(false);
      await svc.duplicateIllustrationButtonClicked();
      expect(local.delete).toHaveBeenCalledWith('NEW');
      expect(router.navigate).not.toHaveBeenCalled();
      expect(notify.error).toHaveBeenCalled();
    });

    it('cloud: creates the server record, copies the saved document under its id, opens the copy', async () => {
      const { svc, router, api } = makeService({ syncMode: 0 });
      const copy = spyOn(svc as any, '_copySavedDocument').and.resolveTo(true);
      await svc.duplicateIllustrationButtonClicked();
      expect(api.createIllustration.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ name: 'Copy of Frog', teamId: 3, syncMode: 0, documentAspect: 1.5 }));
      expect(copy).toHaveBeenCalledWith('5', '7', 'Copy of Frog');
      const [commands, extras] = router.navigate.calls.mostRecent().args as any[];
      expect(commands).toEqual(['/illustration', 'CLOUD-NEW']);
      expect(extras.state.duplicateOf).toBe('SRC');
      expect(api.duplicateIllustration).not.toHaveBeenCalled();
    });

    it('cloud without a saved copy on this device: falls back to the server duplicate (and drops the empty record)', async () => {
      const { svc, router, api } = makeService({ syncMode: 0 });
      spyOn(svc as any, '_copySavedDocument').and.resolveTo(false);
      await svc.duplicateIllustrationButtonClicked();
      expect(api.deleteIllustration).toHaveBeenCalledWith(7);
      expect(api.duplicateIllustration).toHaveBeenCalled();
      expect(router.navigate.calls.mostRecent().args[0]).toEqual(['/illustration', 'SERVER-DUP']);
    });

    it("the copy's metadata drops the original's server revision and is marked not yet synced", async () => {
      const { svc, opfsMeta } = makeService({ syncMode: 0 });
      opfsMeta.read.and.resolveTo({ revision: 12, baseRevision: 11, backendSynced: true, bgColor: '#123456', layers: [] } as any);
      const srcId = `spec-dup-src-${Date.now()}`;
      await writeSalsaDoc(srcId);
      try {
        expect(await (svc as any)._copySavedDocument(srcId, srcId + '-copy', 'Copy')).toBeTrue();
        const [key, meta] = opfsMeta.write.calls.mostRecent().args as any[];
        expect(key).toBe(srcId + '-copy');
        expect(meta.revision).toBeUndefined();
        expect(meta.baseRevision).toBeUndefined();
        expect(meta.backendSynced).toBeFalse();
        expect(meta.bgColor).toBe('#123456');
      } finally {
        await removeSalsaDocs(srcId, srcId + '-copy');
      }
    });
  });
});

/** A minimal saved Salsa document in this browser's OPFS (the karma browser's own profile). */
async function writeSalsaDoc(docId: string): Promise<void> {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('salsa-documents', { create: true });
  const dir = await root.getDirectoryHandle(docId, { create: true });
  const w = await (await dir.getFileHandle('manifest.json', { create: true })).createWritable();
  await w.write(JSON.stringify({ version: 3, docId, name: 'Src', layers: [] }));
  await w.close();
}
async function removeSalsaDocs(...ids: string[]): Promise<void> {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('salsa-documents', { create: true });
  for (const id of ids) { try { await root.removeEntry(id, { recursive: true }); } catch { /* not there */ } }
}
