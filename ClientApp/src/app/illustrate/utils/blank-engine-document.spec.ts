import { legacyBlankPayload, startBlankEngineDocument } from './blank-engine-document';

describe('startBlankEngineDocument', () => {
  it("uses Salsa's startBlankDocument with the new document's id", async () => {
    const sm = { startBlankDocument: jasmine.createSpy('startBlankDocument').and.resolveTo(), restoreDocument: jasmine.createSpy('restoreDocument') };
    await startBlankEngineDocument(sm as any, 'local-NEW');
    expect(sm.startBlankDocument).toHaveBeenCalledWith('local-NEW', 'Untitled');
    expect(sm.restoreDocument).not.toHaveBeenCalled();
  });

  it('an older Salsa build: restores an empty payload that replaces the layers, and resets animation by hand', async () => {
    const sm = {
      setCurrentDocId: jasmine.createSpy('setCurrentDocId'),
      getDitherConfig: () => ({ enabled: true, algorithm: 'bayer' }),
      restoreDocument: jasmine.createSpy('restoreDocument').and.resolveTo(),
      setAnimationEnabled: jasmine.createSpy('setAnimationEnabled'),
      setFrameCount: jasmine.createSpy('setFrameCount'), setFps: jasmine.createSpy('setFps'),
      setLoopMode: jasmine.createSpy('setLoopMode'), setPlayRange: jasmine.createSpy('setPlayRange'),
    };
    await startBlankEngineDocument(sm as any);
    expect(sm.setCurrentDocId).toHaveBeenCalledWith('', 'Untitled');   // no id: nothing can save into the previous doc
    const payload = sm.restoreDocument.calls.mostRecent().args[0] as any;
    expect(payload.manifest.layers.map((l: any) => [l.name, l.type])).toEqual([['Vector', 'vector'], ['Background', 'layer']]);
    expect(payload.manifest.animation).toBeNull();
    expect(payload.manifest.globalDitherConfig.enabled).toBeFalse();
    expect(JSON.parse(payload.sceneGraphJSON).root.children).toEqual([]);
    expect(sm.setAnimationEnabled).toHaveBeenCalledWith(false);
    expect(sm.setFrameCount).toHaveBeenCalledWith(1);
  });

  it('never throws (the load that follows still runs)', async () => {
    const sm = { startBlankDocument: () => Promise.reject(new Error('boom')) };
    spyOn(console, 'warn');
    await expectAsync(startBlankEngineDocument(sm as any, 'x')).toBeResolved();
  });

  it('the legacy payload mints fresh layer ids each time', () => {
    const a = legacyBlankPayload('d', 'n', {}) as any;
    const b = legacyBlankPayload('d', 'n', {}) as any;
    expect(a.manifest.layers[1].id).not.toBe(b.manifest.layers[1].id);
  });
});
