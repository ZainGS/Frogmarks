import { ClothInspectorComponent, WIND_ZONE_FPS } from './cloth-inspector.component';

/** Cloth inspector wind zones (audit 2026-10-09): Falloff + Pulse reach the engine's fields in its units. */
describe('ClothInspectorComponent wind zones', () => {
  function setup(zones: any[] = []) {
    const store = zones.map((z, i) => ({ id: `z${i}`, ...z }));
    const s3d: any = {
      getWindZones: () => store.map(z => ({ ...z })),
      addWindZone: jasmine.createSpy('addWindZone').and.callFake((_: string, z: any) => { store.push({ id: `z${store.length}`, ...z }); return `z${store.length - 1}`; }),
      updateWindZone: jasmine.createSpy('updateWindZone').and.callFake((_: string, id: string, patch: any) => {
        const i = store.findIndex(z => z.id === id);
        store[i] = { ...store[i], ...patch, id };
        return true;
      }),
    };
    const sm: any = { scene3d: s3d, getIllustrationCenter3D: () => [0, 0, 0] };
    const c = new ClothInspectorComponent();
    c.shapeManager = sm;
    c.meshId = 'cloth';
    c.windZones = s3d.getWindZones();
    return { c, s3d, store };
  }

  it('Falloff is the engine\'s none / linear; Pulse sends flat pulsePeriod (s) / pulsePhase (rad)', () => {
    const { c, s3d } = setup();
    c.windZoneFalloff = 'linear';
    c.windZonePulseEnabled = true;
    c.windZonePulsePeriod = 120;
    c.windZonePulsePhase = 0.25;
    c.addWindZone();
    const z = s3d.addWindZone.calls.mostRecent().args[1];
    expect(z.falloff).toBe('linear');
    expect(z.pulsePeriod).toBeCloseTo(120 / WIND_ZONE_FPS, 9);
    expect(z.pulsePhase).toBeCloseTo(Math.PI / 2, 9);
    expect(z.pulse).toBeUndefined();
    // pulse off: period 0 (constant) so an update clears the old pulse
    c.windZonePulseEnabled = false;
    c.updateSelectedWindZone();
    const patch = s3d.updateWindZone.calls.mostRecent().args[2];
    expect(patch.pulsePeriod).toBe(0);
  });

  it('reads a zone back in the units it shows (frames, 0–1 of a cycle)', () => {
    const { c } = setup([{ shape: 'sphere', center: [0, 0, 0], radius: 1, windVec: [0, 5, 0], falloff: 'linear', pulsePeriod: 1.5, pulsePhase: Math.PI }]);
    c.selectWindZone(0);
    expect(c.windZoneFalloff).toBe('linear');
    expect(c.windZonePulseEnabled).toBeTrue();
    expect(c.windZonePulsePeriod).toBe(90);
    expect(c.windZonePulsePhase).toBe(0.5);
  });

  it('an older save (numeric falloff, nested pulse in frames) loads: Uniform, its pulse values kept', () => {
    const { c } = setup([{ shape: 'box', center: [0, 0, 0], halfExtents: [1, 1, 1], windVec: [1, 0, 0], falloff: 0.7, pulse: { period: 48, phase: 0.3 } }]);
    c.selectWindZone(0);
    expect(c.windZoneFalloff).toBe('none');
    expect(c.windZonePulseEnabled).toBeTrue();
    expect(c.windZonePulsePeriod).toBe(48);
    expect(c.windZonePulsePhase).toBe(0.3);
  });
});
