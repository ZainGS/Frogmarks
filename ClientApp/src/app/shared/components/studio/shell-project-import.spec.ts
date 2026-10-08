import { prepareShellProjectImport, type ShellProjectImportDeps } from './shell-project-import';
import { FrogmarksPackageError, NOT_A_PROJECT_MESSAGE, type FrogmarksPackageInfo } from '../../services/illustrate/frogmarks-package';
import { clearPendingProjectImport, takePendingProjectImport } from '../../services/illustrate/pending-project-import';

function deps(info: Partial<FrogmarksPackageInfo> | Error, names: string[] = []) {
  const created: { name: string; aspect?: number }[] = [];
  const frogPending: any[] = [];
  const d: ShellProjectImportDeps = {
    read: async () => { if (info instanceof Error) throw info; return { kind: 'frogmarks', name: 'Frog', state: null, packageVersion: 2, thumbnail: null, ...info } as FrogmarksPackageInfo; },
    listNames: async () => names,
    create: async (name, aspect) => { created.push({ name, aspect }); return { uuid: 'U' + created.length, name } as any; },
    parseFrog: async () => ({ manifest: { name: 'Old', layers: [] }, sceneGraph: '', thumbnail: null, layerPixelData: [] } as any),
    setFrogPending: (r) => frogPending.push(r),
  };
  return { d, created, frogPending };
}

describe('Shell › Import .frogmarks (shell-project-import.ts)', () => {
  afterEach(() => clearPendingProjectImport());
  const file = new File(['x'], 'Frog.frogmarks');

  it('creates a NEW local illustration with a unique name and hands the file to the editor that opens it', async () => {
    const editorState = { bgColor: '#000' } as any;
    const { d, created } = deps({ name: 'Frog', documentAspect: 1.5, state: { editorState } as any }, ['Frog', 'Frog (2)']);
    const item = await prepareShellProjectImport(file, d);
    expect(created).toEqual([{ name: 'Frog (3)', aspect: 1.5 }]);
    expect(item.uuid).toBe('U1');
    const pending = takePendingProjectImport('U1');
    expect(pending?.file).toBe(file);
    expect(pending?.editorState).toBe(editorState);
  });

  it('an older .frog goes through the .frog import, titled with the unique name', async () => {
    const { d, created, frogPending } = deps({ kind: 'frog', name: 'Old' }, ['Old']);
    await prepareShellProjectImport(file, d);
    expect(created[0].name).toBe('Old (2)');
    expect(frogPending.length).toBe(1);
    expect(frogPending[0].manifest.name).toBe('Old (2)');
    expect(takePendingProjectImport('U1')).toBeNull();
  });

  it('a bad file creates nothing and passes the message on', async () => {
    const { d, created } = deps(new FrogmarksPackageError('not-a-project', NOT_A_PROJECT_MESSAGE));
    await expectAsync(prepareShellProjectImport(file, d)).toBeRejectedWithError(NOT_A_PROJECT_MESSAGE);
    expect(created).toEqual([]);
  });
});
