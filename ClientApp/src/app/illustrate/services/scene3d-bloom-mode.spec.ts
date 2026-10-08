import { Scene3dSettingsService } from './scene3d-settings.service';

/** A stand-in engine for the two bloom passes: the particle glow (enableBloom3D…) and post-process bloom. */
function makeEngine(particleBloom: { threshold: number; intensity: number } | null = null) {
  const state = { particleBloom, post: null as { enabled: boolean; threshold: number; intensity: number } | null };
  const sm = {
    renderer3D: { get bloomConfig() { return state.particleBloom; } },
    enableBloom3D: jasmine.createSpy('enableBloom3D').and.callFake((threshold: number, intensity: number) => { state.particleBloom = { threshold, intensity }; }),
    disableBloom3D: jasmine.createSpy('disableBloom3D').and.callFake(() => { state.particleBloom = null; }),
    setBloomThreshold3D: jasmine.createSpy('setBloomThreshold3D').and.callFake((t: number) => { if (state.particleBloom) state.particleBloom.threshold = t; }),
    setBloomIntensity3D: jasmine.createSpy('setBloomIntensity3D').and.callFake((v: number) => { if (state.particleBloom) state.particleBloom.intensity = v; }),
    setPostProcessing3D: jasmine.createSpy('setPostProcessing3D').and.callFake((c: { bloom: { enabled: boolean; threshold: number; intensity: number } }) => { state.post = { ...c.bloom }; }),
  };
  return { sm, state };
}

function makeService(engine = makeEngine()) {
  const s3 = new Scene3dSettingsService();
  const markDirty = jasmine.createSpy('markDirty');
  s3.bind({ shapeManager: () => engine.sm as never, markDirty, syncCityStyleFromEngine: () => { /* */ } });
  return { s3, markDirty, ...engine };
}

describe('Post-Processing › Bloom (one control: Off / Whole scene / Particles only)', () => {
  it('starts Off; Particles only turns the particle glow on with its own values and the post bloom off', () => {
    const { s3, sm, state } = makeService();
    expect(s3.scene3dBloomMode).toBe('off');
    s3.scene3dSetBloomMode('particles');
    expect(s3.scene3dBloomMode).toBe('particles');
    expect(sm.enableBloom3D).toHaveBeenCalledWith(0.5, 1.2);
    expect(state.post?.enabled).toBe(false);
  });

  it('Whole scene turns the post bloom on and the particle glow off — never both', () => {
    const { s3, sm, state } = makeService();
    s3.scene3dSetBloomMode('particles');
    s3.scene3dSetBloomMode('scene');
    expect(s3.scene3dBloomMode).toBe('scene');
    expect(sm.disableBloom3D).toHaveBeenCalled();
    expect(state.particleBloom).toBeNull();
    expect(state.post).toEqual({ enabled: true, threshold: 0.8, intensity: 1.0 });
    s3.scene3dSetBloomMode('off');
    expect(state.particleBloom).toBeNull();
    expect(state.post?.enabled).toBe(false);
    expect(s3.scene3dBloomMode).toBe('off');
  });

  it('the sliders show and edit the ACTIVE mode; each mode remembers its own values', () => {
    const { s3, sm, state, markDirty } = makeService();
    s3.scene3dSetBloomMode('particles');
    expect(s3.scene3dBloomModeThreshold).toBe(0.5);
    s3.scene3dBloomModeThreshold = 0.3;
    s3.scene3dBloomModeIntensity = 2.5;
    s3.scene3dApplyBloomLevels();
    expect(sm.setBloomThreshold3D).toHaveBeenCalledWith(0.3);
    expect(sm.setBloomIntensity3D).toHaveBeenCalledWith(2.5);
    expect(markDirty).toHaveBeenCalled();
    expect(s3.scene3dBloomThreshold).toBe(0.8);   // the Whole-scene values are untouched

    s3.scene3dSetBloomMode('scene');
    expect(s3.scene3dBloomModeThreshold).toBe(0.8);
    s3.scene3dBloomModeIntensity = 3;
    s3.scene3dApplyBloomLevels();
    expect(state.post).toEqual({ enabled: true, threshold: 0.8, intensity: 3 });

    s3.scene3dSetBloomMode('particles');           // back: the particle values it had
    expect(sm.enableBloom3D).toHaveBeenCalledWith(0.3, 2.5);
    expect(s3.scene3dBloomModeIntensity).toBe(2.5);
  });

  it('older documents: the mode is derived from what was saved', () => {
    // only particleBloom → Particles only
    let t = makeService(makeEngine({ threshold: 0.4, intensity: 1.6 }));
    t.s3.scene3dSyncBloomGlow();
    expect(t.s3.scene3dBloomMode).toBe('particles');
    expect(t.s3.scene3dBloomModeThreshold).toBe(0.4);
    // only the post-process bloom → Whole scene
    t = makeService();
    t.s3.scene3dBloomEnabled = true;
    t.s3.scene3dSyncBloomGlow();
    expect(t.s3.scene3dBloomMode).toBe('scene');
    // neither → Off
    t = makeService();
    t.s3.scene3dSyncBloomGlow();
    expect(t.s3.scene3dBloomMode).toBe('off');
  });

  it('a legacy document with BOTH on keeps both running (reads as Whole scene) until the next mode pick', () => {
    const { s3, sm, state } = makeService(makeEngine({ threshold: 0.5, intensity: 1.2 }));
    s3.scene3dBloomEnabled = true;
    s3.scene3dSyncBloomGlow();
    expect(s3.scene3dBloomMode).toBe('scene');
    expect(s3.scene3dBloomGlowEnabled).toBe(true);
    expect(sm.disableBloom3D).not.toHaveBeenCalled();
    s3.scene3dSetBloomMode('scene');
    expect(state.particleBloom).toBeNull();
    expect(state.post?.enabled).toBe(true);
  });
});
