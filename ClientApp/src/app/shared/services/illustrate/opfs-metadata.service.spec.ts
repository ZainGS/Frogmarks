import { OpfsMetadataService } from './opfs-metadata.service';
import { IllustrationStateDto } from './illustration.service';

/** In-memory stand-in for the OPFS directory: records write order, can be slowed down or made to fail. */
function fakeDir(opts: { slowFirstMs?: number; failFirst?: boolean } = {}) {
  const files = new Map<string, string>();
  const log: string[] = [];
  let calls = 0;
  const dir = {
    getFileHandle: async (name: string) => ({
      createWritable: async () => {
        const n = ++calls;
        if (opts.failFirst && n === 1) throw new Error('quota');
        return {
          write: async (text: string) => {
            log.push(`start ${JSON.parse(text).savedAt}`);
            if (n === 1 && opts.slowFirstMs) await new Promise(r => setTimeout(r, opts.slowFirstMs));
            files.set(name, text);
          },
          close: async () => { log.push('end'); },
        };
      },
    }),
  };
  return { dir, files, log };
}

function state(savedAt: number): IllustrationStateDto {
  return {
    version: 2, sceneGraph: null, animation: null, savedAt,
    layers: [{ layerId: 'l1', pixelDataUrl: 'https://blob/x', cels: [{ celId: 'c1', pixelDataUrl: 'https://blob/y' }] } as any],
  };
}

describe('OpfsMetadataService (audit Phase 2.4)', () => {
  let svc: OpfsMetadataService;
  let fake: ReturnType<typeof fakeDir>;

  function use(f: ReturnType<typeof fakeDir>) {
    fake = f;
    (svc as any).getDir = async () => f.dir;
  }

  beforeEach(() => { svc = new OpfsMetadataService(); });

  it('runs writes to the same document one at a time, in call order', async () => {
    use(fakeDir({ slowFirstMs: 30 }));
    const a = svc.write('doc', state(1));
    const b = svc.write('doc', state(2));
    expect(await a).toBeTrue();
    expect(await b).toBeTrue();
    expect(fake.log).toEqual(['start 1', 'end', 'start 2', 'end']);
    expect(JSON.parse(fake.files.get('ill-doc-meta.json')!).savedAt).toBe(2);
  });

  it('skips a snapshot older than one already written (counts as success)', async () => {
    use(fakeDir());
    expect(await svc.write('doc', state(20), 2)).toBeTrue();
    expect(await svc.write('doc', state(10), 1)).toBeTrue();
    expect(JSON.parse(fake.files.get('ill-doc-meta.json')!).savedAt).toBe(20);
  });

  it('reports a failed write and does not block the next one', async () => {
    use(fakeDir({ failFirst: true }));
    expect(await svc.write('doc', state(1))).toBeFalse();
    expect(await svc.write('doc', state(2))).toBeTrue();
    expect(JSON.parse(fake.files.get('ill-doc-meta.json')!).savedAt).toBe(2);
  });

  it('never stores transient pixel URLs', async () => {
    use(fakeDir());
    await svc.write('doc', state(1));
    const stored = JSON.parse(fake.files.get('ill-doc-meta.json')!);
    expect(stored.layers[0].pixelDataUrl).toBeNull();
    expect(stored.layers[0].cels[0].pixelDataUrl).toBeNull();
  });
});
