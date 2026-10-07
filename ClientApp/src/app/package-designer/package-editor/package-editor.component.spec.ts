import { startBlankPackageDocument } from './package-editor.component';

/** mobile-parity 7.2: the package editor opened a package on top of whatever the previous document left in the engine
 *  (it never called startBlankDocument), and saved that as the package's. */
describe('startBlankPackageDocument (package editor document isolation)', () => {
  it('unbinds autosave FIRST, then starts a blank engine document under the package id', async () => {
    const order: string[] = [];
    const autoSave = { disable: () => order.push('autosave off') };
    const sm = { startBlankDocument: jasmine.createSpy('startBlankDocument').and.callFake(async () => { order.push('blank'); }) };
    await startBlankPackageDocument(sm as any, autoSave as any, 'local-pkg-1', 'My Box');
    expect(order).toEqual(['autosave off', 'blank']);
    expect(sm.startBlankDocument).toHaveBeenCalledOnceWith('local-pkg-1', 'My Box');
  });

  it('never throws (the package still opens when the reset fails)', async () => {
    spyOn(console, 'warn');
    const sm = { startBlankDocument: () => Promise.reject(new Error('boom')) };
    await expectAsync(startBlankPackageDocument(sm as any, { disable: () => {} } as any, 'local-x', 'X')).toBeResolved();
  });
});
