import { DashboardComponent } from './dashboard.component';

/** mobile-parity 7.2 (Duplicate): the dashboard's Duplicate of a local illustration made a new EMPTY document under the
 *  copy's name. It now copies the whole saved document, like File › Duplicate. Runs against the karma browser's OPFS. */
describe('DashboardComponent.duplicateLocalIllustration', () => {
  const uuid = `spec-dash-dup-${Date.now()}`;
  const newUuid = `${uuid}-copy`;

  async function salsaRoot(): Promise<FileSystemDirectoryHandle> {
    return (await navigator.storage.getDirectory()).getDirectoryHandle('salsa-documents', { create: true });
  }
  async function write(dir: FileSystemDirectoryHandle, name: string, data: string): Promise<void> {
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(data);
    await w.close();
  }

  afterEach(async () => {
    const root = await salsaRoot();
    for (const id of [uuid, newUuid]) { try { await root.removeEntry('local-' + id, { recursive: true }); } catch { /* */ } }
  });

  function host(sceneBytes = 0) {
    const local = {
      getByUuid: jasmine.createSpy('getByUuid').and.resolveTo({ uuid, name: 'Box', documentAspect: 1.5, kind: 'packaging', thumbnailDataUrl: 'data:thumb' }),
      create: jasmine.createSpy('create').and.resolveTo({ uuid: newUuid, name: 'Copy of Box' }),
      update: jasmine.createSpy('update').and.callFake(async (p: any) => ({ uuid: newUuid, name: 'Copy of Box', ...p })),
      delete: jasmine.createSpy('delete').and.resolveTo(),
    };
    const opfsMeta = {
      read: jasmine.createSpy('read').and.resolveTo({ packaging: { packagingId: 'pkg1' } }),
      write: jasmine.createSpy('write').and.resolveTo(true),
      getSceneSizeBytes: jasmine.createSpy('size').and.resolveTo(sceneBytes),
    };
    return { localIllustrationService: local, opfsMetadataService: opfsMeta };
  }
  const dup = (self: object) => DashboardComponent.prototype.duplicateLocalIllustration.call(self as any, { uuid, name: 'Box', syncMode: 2 } as any);

  it('copies the saved document + metadata + thumbnail, keeping the kind (a package stays a package)', async () => {
    const dir = await (await salsaRoot()).getDirectoryHandle('local-' + uuid, { create: true });
    await write(dir, 'manifest.json', JSON.stringify({ version: 3, docId: 'local-' + uuid, name: 'Box', layers: [] }));
    await write(dir, 'scene3d.json', '{"nodes":[1]}');
    const self = host();
    const copy = await dup(self);
    expect(self.localIllustrationService.create).toHaveBeenCalledOnceWith('Copy of Box', 1.5, 'packaging');
    const copied = await (await salsaRoot()).getDirectoryHandle('local-' + newUuid);
    expect(await (await (await copied.getFileHandle('scene3d.json')).getFile()).text()).toBe('{"nodes":[1]}');
    expect(self.opfsMetadataService.write.calls.mostRecent().args[0]).toBe('local-' + newUuid);
    expect(copy.thumbnailDataUrl).toBe('data:thumb');
  });

  it('a never-saved source gives an empty copy (it is empty too); a failed copy of a saved one is removed + rejects', async () => {
    const empty = host(0);
    await expectAsync(dup(empty)).toBeResolved();
    expect(empty.localIllustrationService.delete).not.toHaveBeenCalled();
    const saved = host(1234);   // has engine data on this device, but the copy failed (no manifest here)
    await expectAsync(dup(saved)).toBeRejected();
    expect(saved.localIllustrationService.delete).toHaveBeenCalledOnceWith(newUuid);
  });
});
