import JSZip from 'jszip';
import {
  buildFrogmarksStateFile, FrogmarksPackageError, NEWER_VERSION_MESSAGE, NOT_A_PROJECT_MESSAGE, readFrogmarksPackage,
  SALSA_PACKAGE_VERSION, uniqueProjectName,
} from './frogmarks-package';

/** A file shaped like a real .frogmarks: Salsa's package entries + Frogmarks' state / thumbnail on top. */
async function makeFrogmarksFile(opts: {
  name?: string; fileName?: string; packageVersion?: number; docName?: string; documentSize?: { w: number; h: number } | null;
  state?: object | null; thumbnail?: boolean; extra?: Record<string, string>;
} = {}): Promise<File> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    formatVersion: opts.packageVersion ?? SALSA_PACKAGE_VERSION,
    packedAt: '2026-10-08T00:00:00.000Z',
    document: {
      version: 3, docId: 'local-OLD', name: opts.docName ?? 'Untitled', createdAt: '', savedAt: '',
      canvasWidth: 64, canvasHeight: 32, documentSize: opts.documentSize ?? null, pixelFormat: 'png',
      layers: [{ id: 'L1', name: 'Background' }], animation: null,
    },
  }));
  zip.file('scene.json', '{"root":{"children":[]}}');
  zip.file('scene3d.json', '{"nodes":[],"gpObjects":[]}');
  zip.file('layers/L1.bin', new Uint8Array([1, 2, 3]));
  for (const [k, v] of Object.entries(opts.extra ?? {})) zip.file(k, v);
  if (opts.state !== null) {
    zip.file('frogmarks-state.json', JSON.stringify(opts.state ?? buildFrogmarksStateFile({ name: opts.name ?? 'Frog', uuid: 'OLD' })));
  }
  if (opts.thumbnail) zip.file('thumbnail.png', new Uint8Array([137, 80, 78, 71]));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return new File([blob], opts.fileName ?? 'Frog.frogmarks');
}

async function rejection(p: Promise<unknown>): Promise<FrogmarksPackageError> {
  try { await p; } catch (e) { return e as FrogmarksPackageError; }
  throw new Error('expected a rejection');
}

describe('.frogmarks package (frogmarks-package.ts)', () => {

  describe('readFrogmarksPackage', () => {
    it('reads the name, versions, document aspect and the editor state without unpacking the rest', async () => {
      const editorState = { version: 3, sceneGraph: null, animation: null, layers: [], bgColor: '#123456' } as any;
      const file = await makeFrogmarksFile({
        documentSize: { w: 200, h: 100 },
        state: buildFrogmarksStateFile({ name: 'My Frog', uuid: 'OLD', editorState }),
      });
      const info = await readFrogmarksPackage(file);
      expect(info.kind).toBe('frogmarks');
      expect(info.name).toBe('My Frog');
      expect(info.packageVersion).toBe(SALSA_PACKAGE_VERSION);
      expect(info.documentAspect).toBe(2);
      expect(info.state?.uuid).toBe('OLD');
      expect(info.state?.editorState?.bgColor).toBe('#123456');
      expect(info.thumbnail).toBeNull();
    });

    it('returns the thumbnail when asked', async () => {
      const info = await readFrogmarksPackage(await makeFrogmarksFile({ thumbnail: true }), { thumbnail: true });
      expect(info.thumbnail?.size).toBe(4);
    });

    it('names the project from the state, else the engine document, else the file name', async () => {
      expect((await readFrogmarksPackage(await makeFrogmarksFile({ state: null, docName: 'Engine Name' }))).name).toBe('Engine Name');
      expect((await readFrogmarksPackage(await makeFrogmarksFile({ state: null, fileName: 'my_city.frogmarks' }))).name).toBe('my city');
      expect((await readFrogmarksPackage(await makeFrogmarksFile({ name: '  Spaced   out ' }))).name).toBe('Spaced out');
    });

    it('reads a package without frogmarks-state.json (a bare Salsa package)', async () => {
      const info = await readFrogmarksPackage(await makeFrogmarksFile({ state: null }));
      expect(info.kind).toBe('frogmarks');
      expect(info.state).toBeNull();
    });

    it('recognises an older .frog workfile', async () => {
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify({ version: 2, name: 'Old Frog', layers: [], documentSize: { w: 30, h: 60 } }));
      const info = await readFrogmarksPackage(new File([await zip.generateAsync({ type: 'blob' })], 'x.frog'));
      expect(info.kind).toBe('frog');
      expect(info.name).toBe('Old Frog');
      expect(info.documentAspect).toBe(0.5);
    });

    it('rejects a file that is not a project', async () => {
      const notZip = await rejection(readFrogmarksPackage(new File(['hello'], 'notes.frogmarks')));
      expect(notZip).toEqual(jasmine.any(FrogmarksPackageError));
      expect(notZip.reason).toBe('not-a-project');
      expect(notZip.message).toBe(NOT_A_PROJECT_MESSAGE);

      const zip = new JSZip();
      zip.file('readme.txt', 'hi');
      const noManifest = await rejection(readFrogmarksPackage(new File([await zip.generateAsync({ type: 'blob' })], 'a.frogmarks')));
      expect(noManifest.reason).toBe('not-a-project');

      const badJson = new JSZip();
      badJson.file('manifest.json', '{not json');
      expect((await rejection(readFrogmarksPackage(new File([await badJson.generateAsync({ type: 'blob' })], 'b.frogmarks')))).reason).toBe('not-a-project');

      expect((await rejection(readFrogmarksPackage(new File([], 'empty.frogmarks')))).reason).toBe('not-a-project');
    });

    it('rejects a file from a newer Frogmarks (package or state format)', async () => {
      const newerPkg = await rejection(readFrogmarksPackage(await makeFrogmarksFile({ packageVersion: SALSA_PACKAGE_VERSION + 1 })));
      expect(newerPkg.reason).toBe('newer');
      expect(newerPkg.message).toBe(NEWER_VERSION_MESSAGE);
      const newerState = await rejection(readFrogmarksPackage(await makeFrogmarksFile({ state: { formatVersion: 2, name: 'x' } })));
      expect(newerState.reason).toBe('newer');
    });

    it('still reads a legacy v1 package', async () => {
      const info = await readFrogmarksPackage(await makeFrogmarksFile({ packageVersion: 1 }));
      expect(info.packageVersion).toBe(1);
    });
  });

  describe('buildFrogmarksStateFile', () => {
    it('writes the current format and drops the scene graph from the editor state (the package holds it)', () => {
      const s = buildFrogmarksStateFile({
        name: 'Frog', uuid: 'U', illustrationId: 7, teamId: 3, deviceName: 'tab',
        editorState: { version: 3, sceneGraph: '{"huge":true}', animation: null, layers: [], bgColor: '#fff' } as any,
        now: new Date('2026-10-08T01:02:03.000Z'),
      });
      expect(s).toEqual(jasmine.objectContaining({ formatVersion: 1, packedAt: '2026-10-08T01:02:03.000Z', name: 'Frog', uuid: 'U', illustrationId: 7, teamId: 3, deviceName: 'tab' }));
      expect(s.editorState?.sceneGraph).toBeNull();
      expect(s.editorState?.bgColor).toBe('#fff');
    });

    it('leaves editorState out when there is none', () => {
      expect('editorState' in buildFrogmarksStateFile({ name: 'a', uuid: null })).toBeFalse();
    });
  });

  describe('uniqueProjectName', () => {
    it('keeps a free name and numbers a taken one (case-insensitive), never reusing an existing name', () => {
      expect(uniqueProjectName('Frog', ['Toad'])).toBe('Frog');
      expect(uniqueProjectName('Frog', ['frog'])).toBe('Frog (2)');
      expect(uniqueProjectName('Frog', ['Frog', 'Frog (2)', 'Frog (3)'])).toBe('Frog (4)');
      expect(uniqueProjectName('Frog (2)', ['Frog', 'Frog (2)'])).toBe('Frog (3)');
      expect(uniqueProjectName('  ', [])).toBe('Untitled');
    });
  });
});
