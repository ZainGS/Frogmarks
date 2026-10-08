import {
  DEFAULT_PARTICLE_PRESET, PARTICLE_PRESET_NAMES, buildParticleConfig, makeParticleRecord, particlePresetConfig,
  particleRecordFromEmitter,
} from './particle-config';

describe('particle-config (Particle Config section)', () => {
  it('a preset config carries the full preset look (the engine only knows part of the presets)', () => {
    expect(PARTICLE_PRESET_NAMES).toContain(DEFAULT_PARTICLE_PRESET);
    const cfg: any = particlePresetConfig('sparks');
    expect(cfg.emitRate).toBe(60);
    expect(cfg.gravity).toEqual([0, -2, 0]);
    expect(cfg.startColor.r).toBeCloseTo(1, 5);
    expect(cfg.startColor.g).toBeCloseTo(0x88 / 255, 5);
    expect(cfg.spread).toBeCloseTo(20 * Math.PI / 180, 6);
  });

  it('reads an emitter back into the same record it was written from (a loaded document shows its real settings)', () => {
    const rec = makeParticleRecord('e1', 'magic');
    rec.posX = 1.5; rec.posZ = -2;
    rec.useFlipbook = true; rec.animTextures = ['t1', 't2']; rec.animFrameTime = 0.2;
    const node = { x: 1.5, y: 0, z: -2, config: buildParticleConfig(rec) };
    const back = particleRecordFromEmitter('e1', node);
    expect(back).toEqual(rec);
  });

  it('a missing node or config falls back to the defaults', () => {
    expect(particleRecordFromEmitter('x', null)).toEqual(makeParticleRecord('x'));
    expect(particleRecordFromEmitter('x', { x: 0, y: 0, z: 0, config: {} })).toEqual(makeParticleRecord('x'));
  });

  it('lifetime / speed max never drop below min in the engine config', () => {
    const rec = makeParticleRecord('e');
    rec.lifetimeMin = 3; rec.lifetimeMax = 1; rec.speedMin = 2; rec.speedMax = 0.5;
    const cfg: any = buildParticleConfig(rec);
    expect(cfg.lifetime).toEqual([3, 3]);
    expect(cfg.speed).toEqual([2, 2]);
  });
});
