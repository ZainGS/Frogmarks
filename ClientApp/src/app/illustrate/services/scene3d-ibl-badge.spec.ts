import { Scene3dSettingsService } from './scene3d-settings.service';

// Audit 2026-10-09 §2 #28: the "IBL active" badge + Clear read a flag only Upload / Clear set, so a Sky preset's baked
// IBL showed no badge and Clear stayed disabled. The flag is now read from the engine (sm.iblEnabled3D).
describe('Environment / IBL › "IBL active" follows the engine', () => {
  function make() {
    const engine = {
      iblEnabled3D: false,
      clearEnvironmentMap3D: jasmine.createSpy('clearEnvironmentMap3D').and.callFake(() => { engine.iblEnabled3D = false; }),
    };
    const s3 = new Scene3dSettingsService();
    s3.bind({ shapeManager: () => engine as never, markDirty: () => { /* */ }, syncCityStyleFromEngine: () => { /* */ } } as never);
    return { s3, engine };
  }

  it('a bake from anywhere (a Sky preset, a load) shows the badge', () => {
    const { s3, engine } = make();
    expect(s3.scene3dIblEnabled).toBe(false);
    engine.iblEnabled3D = true;   // e.g. Sky preset baked the IBL inside the engine
    expect(s3.scene3dIblEnabled).toBe(true);
  });

  it('Clear clears the engine IBL and the badge with it', () => {
    const { s3, engine } = make();
    engine.iblEnabled3D = true;
    s3.scene3dClearEnvironmentMap();
    expect(engine.clearEnvironmentMap3D).toHaveBeenCalled();
    expect(s3.scene3dIblEnabled).toBe(false);
  });

  it('no engine bound yet = not active (no throw)', () => {
    expect(new Scene3dSettingsService().scene3dIblEnabled).toBe(false);
  });
});
