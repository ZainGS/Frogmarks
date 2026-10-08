import JSZip from 'jszip';
import {
  detectShellImportKind, NOT_IMPORTABLE_MESSAGE, ONE_PROJECT_MESSAGE, planShellImport, shellImportProblem,
  type ShellImportKind,
} from './shell-import-router';
import { buildFrogmarksStateFile, readFrogmarksPackage, SALSA_PACKAGE_VERSION } from '../../services/illustrate/frogmarks-package';

/** A .frogmarks as File › Save writes it: Salsa's package entries + frogmarks-state.json + thumbnail.png. */
async function frogmarksBlob(name = 'Frog'): Promise<Blob> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    formatVersion: SALSA_PACKAGE_VERSION,
    packedAt: '2026-10-08T00:00:00.000Z',
    document: { version: 3, name: 'Untitled', canvasWidth: 64, canvasHeight: 32, documentSize: null, layers: [{ id: 'L1' }] },
  }));
  zip.file('scene.json', '{"root":{"children":[]}}');
  zip.file('layers/L1.bin', new Uint8Array([1, 2, 3]));
  zip.file('frogmarks-state.json', JSON.stringify(buildFrogmarksStateFile({ name, uuid: 'OLD' })));
  zip.file('thumbnail.png', new Uint8Array([137, 80, 78, 71]));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** A .frogcart laid out as Salsa's packFrogcart writes it: its manifest, the player config and the whole project
 *  package as scene.salsa (stored, not deflated). */
async function frogcartBlob(title = 'Night Market'): Promise<Blob> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    version: '1.0', frogmarksPlayerMinVersion: '1.0.0', sceneId: 'cart-abc', title, author: '', description: '',
    thumbnail: null, createdAt: '2026-10-08T00:00:00.000Z', tags: [],
  }));
  zip.file('player-config.json', JSON.stringify({ initialState: '', canvasWidth: 1280, canvasHeight: 960 }));
  zip.file('scene.salsa', await (await frogmarksBlob()).arrayBuffer(), { compression: 'STORE' });
  zip.file('state-machine.json', '[]');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

async function legacyFrogBlob(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ version: 1, name: 'Old', layers: [{ id: 'L1' }] }));
  return zip.generateAsync({ type: 'blob' });
}

const asFile = (blob: Blob, name: string) => new File([blob], name);

describe('Shell › Import tile routing (shell-import-router.ts)', () => {
  describe('detectShellImportKind', () => {
    it('a .frogmarks is a project (and the project import reads the same file)', async () => {
      const file = asFile(await frogmarksBlob('My Frog'), 'My Frog.frogmarks');
      expect(await detectShellImportKind(file)).toBe('project');
      expect((await readFrogmarksPackage(file)).name).toBe('My Frog');
    });

    it('a .frogcart is a cart, even though a project package is inside it', async () => {
      expect(await detectShellImportKind(asFile(await frogcartBlob(), 'Night Market.frogcart'))).toBe('cart');
    });

    it('content wins over the name: a renamed cart / project / .zip goes where its content says', async () => {
      expect(await detectShellImportKind(asFile(await frogcartBlob(), 'cart.frogmarks'))).toBe('cart');
      expect(await detectShellImportKind(asFile(await frogmarksBlob(), 'project.frogcart'))).toBe('project');
      expect(await detectShellImportKind(asFile(await frogcartBlob(), 'download.zip'))).toBe('cart');
      expect(await detectShellImportKind(asFile(await frogmarksBlob(), 'download (1)'))).toBe('project');
    });

    it('an older .frog is a project', async () => {
      expect(await detectShellImportKind(asFile(await legacyFrogBlob(), 'old.frog'))).toBe('project');
    });

    it('garbage is unknown whatever its name says', async () => {
      for (const name of ['x.frogmarks', 'x.frogcart', 'x.png']) {
        expect(await detectShellImportKind(new File(['not a zip at all'], name))).toBe('unknown');
      }
      expect(await detectShellImportKind(new File([], 'empty.frogcart'))).toBe('unknown');
    });

    it('a zip that says neither: the extension decides, else unknown', async () => {
      const zip = new JSZip();
      zip.file('manifest.json', '{"hello":1}');
      const blob = await zip.generateAsync({ type: 'blob' });
      expect(await detectShellImportKind(asFile(blob, 'a.frogmarks'))).toBe('project');
      expect(await detectShellImportKind(asFile(blob, 'a.frogcart'))).toBe('cart');
      expect(await detectShellImportKind(asFile(blob, 'a.zip'))).toBe('unknown');
      const bare = await new JSZip().file('readme.txt', 'hi').generateAsync({ type: 'blob' });
      expect(await detectShellImportKind(asFile(bare, 'a.frogcart'))).toBe('unknown');
    });
  });

  describe('planShellImport', () => {
    const f = (name: string) => new File(['x'], name);
    const by = (kinds: Record<string, ShellImportKind>) => async (file: File) => kinds[file.name];

    it('routes each file: carts to the Shell, the first project to the editor, the rest reported', async () => {
      const [c1, p1, c2, p2, bad] = [f('c1'), f('p1'), f('c2'), f('p2'), f('bad')];
      const plan = await planShellImport([c1, p1, c2, p2, bad],
        by({ c1: 'cart', p1: 'project', c2: 'cart', p2: 'project', bad: 'unknown' }));
      expect(plan.carts).toEqual([c1, c2]);
      expect(plan.project).toBe(p1);
      expect(plan.extraProjects).toEqual([p2]);
      expect(plan.unknown).toEqual([bad]);
    });

    it('a failing detection counts as unknown', async () => {
      const plan = await planShellImport([f('x')], async () => { throw new Error('boom'); });
      expect(plan.unknown.length).toBe(1);
    });

    it('end to end on real files', async () => {
      const cart = asFile(await frogcartBlob(), 'a.frogcart');
      const project = asFile(await frogmarksBlob(), 'b.frogmarks');
      const junk = new File(['junk'], 'c.frogcart');
      const plan = await planShellImport([cart, project, junk]);
      expect(plan.carts).toEqual([cart]);
      expect(plan.project).toBe(project);
      expect(plan.unknown).toEqual([junk]);
    });
  });

  describe('shellImportProblem', () => {
    const f = (name: string) => new File(['x'], name);
    const plan = (o: Partial<{ carts: File[]; project: File | null; extraProjects: File[]; unknown: File[] }>) =>
      ({ carts: [], project: null, extraProjects: [], unknown: [], ...o });

    it('nothing to say when every file had a home', () => {
      expect(shellImportProblem(plan({ carts: [f('a')], project: f('b') }), 2)).toBeNull();
    });

    it('one bad file alone: the plain message; in a batch: named / counted', () => {
      expect(shellImportProblem(plan({ unknown: [f('x.png')] }), 1)).toBe(NOT_IMPORTABLE_MESSAGE);
      expect(shellImportProblem(plan({ carts: [f('a')], unknown: [f('x.png')] }), 2)).toContain('"x.png"');
      expect(shellImportProblem(plan({ unknown: [f('x'), f('y')] }), 2)).toContain('2 files');
    });

    it('a second project in one pick is reported', () => {
      expect(shellImportProblem(plan({ project: f('a'), extraProjects: [f('b')] }), 2)).toBe(ONE_PROJECT_MESSAGE);
    });
  });
});
