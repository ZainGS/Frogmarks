import { celImagesFromImportEntries, celRestoreSpecs, engineCelRestore, restoreAnimatedLayerCels } from './restore-animation-cels';

describe('restore-animation-cels (perf audit A4: .frog import / cloud load keep cel holds, ids, types, pixels)', () => {
  const saved = [
    { celId: 'c3', frame: 9, duration: 4, celType: 'inbetween' as const, isKey: false },
    { celId: 'c1', frame: 1, duration: 3, celType: 'key' as const, isKey: true },
    { celId: 'c2', frame: 5, duration: 1, celType: 'key' as const, isKey: true },
  ];
  const images = new Map([['c1', 'data:image/webp;base64,AAA'], ['c3', 'data:image/webp;base64,CCC']]);

  it('maps saved cels to exact engine specs (ids, start frames, holds, types, own pixels; blank = no image)', () => {
    expect(celRestoreSpecs(saved, 24, images)).toEqual([
      { celId: 'c1', startFrame: 1, duration: 3, celType: 'key', imageData: 'data:image/webp;base64,AAA' },
      { celId: 'c2', startFrame: 5, duration: 1, celType: 'key' },
      { celId: 'c3', startFrame: 9, duration: 4, celType: 'inbetween', imageData: 'data:image/webp;base64,CCC' },
    ]);
  });

  it('an older file without durations holds each cel until the next one (or the end of the timeline)', () => {
    const old = [{ celId: 'a', frame: 1, isKey: true }, { celId: 'b', frame: 4, isKey: false }];
    expect(celRestoreSpecs(old, 10, new Map()).map(c => [c.celId, c.startFrame, c.duration, c.celType])).toEqual([
      ['a', 1, 3, 'key'], ['b', 4, 7, 'inbetween'],
    ]);
  });

  it('uses the engine restore when Salsa has it — no addCelAtFrame', async () => {
    const restore = jasmine.createSpy('restoreLayerCelsFromDataURLs').and.resolveTo(['c1', 'c2', 'c3']);
    const sm = { restoreLayerCelsFromDataURLs: restore };
    const add = jasmine.createSpy('addCelAtFrame');
    await restoreAnimatedLayerCels(sm, add, 'L', saved, 24, images);
    expect(restore).toHaveBeenCalledOnceWith('L', celRestoreSpecs(saved, 24, images));
    expect(add).not.toHaveBeenCalled();
  });

  it('falls back to the old addCelAtFrame loop on a Salsa build without it', async () => {
    const add = jasmine.createSpy('addCelAtFrame');
    expect(engineCelRestore({})).toBeNull();
    await restoreAnimatedLayerCels({}, add, 'L', saved, 24, images);
    expect(add.calls.allArgs()).toEqual([['L', 9], ['L', 1], ['L', 5]]);
  });

  it('collects cel images from import entries by cel id (layer-level entries ignored)', () => {
    const m = celImagesFromImportEntries([{ celId: 'x', imageData: 'X' }, { imageData: 'layer' }, { celId: 'y' }]);
    expect([...m.entries()]).toEqual([['x', 'X']]);
  });
});
