import { copySalsaDocument, copySavedDocument } from './salsa-document-copy';

/** Runs against the karma browser's real OPFS (its own temporary profile). */
async function salsaRoot(): Promise<FileSystemDirectoryHandle> {
  return (await navigator.storage.getDirectory()).getDirectoryHandle('salsa-documents', { create: true });
}
async function write(dir: FileSystemDirectoryHandle, name: string, data: string): Promise<void> {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(data);
  await w.close();
}
async function read(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  return (await (await dir.getFileHandle(name)).getFile()).text();
}

describe('copySalsaDocument (Duplicate Illustration, engine half)', () => {
  const src = `spec-copy-src-${Date.now()}`;
  const dst = `${src}-dst`;

  afterEach(async () => {
    const root = await salsaRoot();
    for (const id of [src, dst]) { try { await root.removeEntry(id, { recursive: true }); } catch { /* */ } }
  });

  it('copies every file and folder, rewrites the manifest for the new id, and leaves the original as it was', async () => {
    const root = await salsaRoot();
    const dir = await root.getDirectoryHandle(src, { create: true });
    const original = { version: 3, docId: src, name: 'Original', savedAt: '2020-01-01T00:00:00.000Z', layers: [{ id: 'L1' }] };
    await write(dir, 'manifest.json', JSON.stringify(original));
    await write(dir, 'scene.json', '{"root":{"children":[1]}}');
    await write(dir, 'scene3d.json', '{"nodes":[{"id":"m"}]}');
    await write(await dir.getDirectoryHandle('layers', { create: true }), 'L1.png', 'PIXELS');
    await write(await dir.getDirectoryHandle('models3d', { create: true }), 'm.glb', 'GLB');

    expect(await copySalsaDocument(src, dst, 'Copy of Original')).toBeTrue();

    const copy = await root.getDirectoryHandle(dst);
    const manifest = JSON.parse(await read(copy, 'manifest.json'));
    expect(manifest.docId).toBe(dst);
    expect(manifest.name).toBe('Copy of Original');
    expect(manifest.layers).toEqual([{ id: 'L1' }]);
    expect(Date.parse(manifest.savedAt)).toBeGreaterThan(Date.parse(original.savedAt));
    expect(await read(copy, 'scene.json')).toBe('{"root":{"children":[1]}}');
    expect(await read(copy, 'scene3d.json')).toBe('{"nodes":[{"id":"m"}]}');
    expect(await read(await copy.getDirectoryHandle('layers'), 'L1.png')).toBe('PIXELS');
    expect(await read(await copy.getDirectoryHandle('models3d'), 'm.glb')).toBe('GLB');

    // The original is untouched.
    expect(JSON.parse(await read(dir, 'manifest.json'))).toEqual(original);
  });

  it('a document that was never saved (no folder / no manifest) is not copied', async () => {
    expect(await copySalsaDocument(src, dst, 'x')).toBeFalse();
    const root = await salsaRoot();
    await root.getDirectoryHandle(src, { create: true });   // folder without a manifest
    expect(await copySalsaDocument(src, dst, 'x')).toBeFalse();
  });

  it('refuses a copy onto itself or an empty id', async () => {
    expect(await copySalsaDocument(src, src, 'x')).toBeFalse();
    expect(await copySalsaDocument('', dst, 'x')).toBeFalse();
    expect(await copySalsaDocument(src, '', 'x')).toBeFalse();
  });
});

describe('copySavedDocument (the whole saved document: engine + editor metadata)', () => {
  const src = `spec-copy-saved-${Date.now()}`;
  const dst = `${src}-dst`;

  afterEach(async () => {
    const root = await salsaRoot();
    for (const id of [src, dst]) { try { await root.removeEntry(id, { recursive: true }); } catch { /* */ } }
  });

  it('copies the engine document and the metadata, minus the server revision, marked not yet synced', async () => {
    const dir = await (await salsaRoot()).getDirectoryHandle(src, { create: true });
    await write(dir, 'manifest.json', JSON.stringify({ version: 3, docId: src, name: 'A', layers: [] }));
    await write(dir, 'scene.json', '{"root":{"children":[{"type":"Rect"}]}}');
    const meta = {
      read: jasmine.createSpy('read').and.resolveTo({ revision: 4, baseRevision: 3, backendSynced: true, bgColor: '#abcdef', packaging: { packagingId: 'p1' } }),
      write: jasmine.createSpy('write').and.resolveTo(true),
    };
    expect(await copySavedDocument(meta, src, dst, 'Copy of A')).toBeTrue();
    expect(await read(await (await salsaRoot()).getDirectoryHandle(dst), 'scene.json')).toBe('{"root":{"children":[{"type":"Rect"}]}}');
    const [key, written] = meta.write.calls.mostRecent().args as [string, Record<string, unknown>];
    expect(key).toBe(dst);
    expect(written).toEqual({ backendSynced: false, bgColor: '#abcdef', packaging: { packagingId: 'p1' } });
  });

  it('a never-saved source copies nothing (no metadata written either)', async () => {
    const meta = { read: jasmine.createSpy('read').and.resolveTo({}), write: jasmine.createSpy('write').and.resolveTo(true) };
    expect(await copySavedDocument(meta, src, dst, 'x')).toBeFalse();
    expect(meta.write).not.toHaveBeenCalled();
    expect(await copySavedDocument(meta, 'local-', dst, 'x')).toBeFalse();   // a local key without its uuid
  });
});
