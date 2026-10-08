/**
 * Particle emitter settings as the Particle Config section edits them: the flat editor record, the starting presets,
 * and the conversions to / from the engine's ParticleEmitterConfig (sm.setParticleEmitterConfig3D / emitter.config).
 */

export interface ParticleEmitterRecord {
  id: string;
  // Position (from the node)
  posX: number; posY: number; posZ: number;
  // Emission
  emitRate: number;
  maxParticles: number;
  loop: boolean;
  dirX: number; dirY: number; dirZ: number;
  spreadDeg: number;
  // Lifetime & Speed
  lifetimeMin: number; lifetimeMax: number;
  speedMin: number; speedMax: number;
  // Size
  startSizeMin: number; startSizeMax: number;
  endSizeMin: number; endSizeMax: number;
  // Color
  startColorHex: string; startAlpha: number;
  endColorHex: string;   endAlpha: number;
  // Physics
  gravX: number; gravY: number; gravZ: number;
  turbulence: number;
  // Texture
  textureIndex: number;
  animTextures: string[];
  animFrameTime: number;
  useFlipbook: boolean;
  addFrameDraft: string;
}

export type ParticlePresetName = 'dust' | 'sparks' | 'snow' | 'magic';

export const PARTICLE_PRESET_NAMES: ParticlePresetName[] = ['dust', 'sparks', 'snow', 'magic'];

/** What Add Mesh › Particles… starts with. */
export const DEFAULT_PARTICLE_PRESET: ParticlePresetName = 'magic';

/** The outliner row type of a particle emitter (its engine node type). */
export const PARTICLE_EMITTER_NODE_TYPE = 'ParticleEmitter3D';

/** The outliner name a new emitter gets. */
export const NEW_PARTICLE_EMITTER_NAME = 'Particles';

export const PARTICLE_PRESET_SEEDS: Record<ParticlePresetName, Partial<ParticleEmitterRecord>> = {
  dust: {
    emitRate: 20, maxParticles: 150, spreadDeg: 180, loop: true,
    lifetimeMin: 3, lifetimeMax: 6, speedMin: 0.05, speedMax: 0.2,
    startSizeMin: 0.05, startSizeMax: 0.15, endSizeMin: 0, endSizeMax: 0,
    startColorHex: '#c8a96e', startAlpha: 0.8, endColorHex: '#c8a96e', endAlpha: 0,
    gravX: 0, gravY: -0.05, gravZ: 0, turbulence: 0.3, dirX: 0, dirY: 1, dirZ: 0,
  },
  sparks: {
    emitRate: 60, maxParticles: 200, spreadDeg: 20, loop: true,
    lifetimeMin: 0.3, lifetimeMax: 0.8, speedMin: 1.5, speedMax: 4.0,
    startSizeMin: 0.02, startSizeMax: 0.06, endSizeMin: 0, endSizeMax: 0,
    startColorHex: '#ff8800', startAlpha: 1, endColorHex: '#ff2200', endAlpha: 0,
    gravX: 0, gravY: -2.0, gravZ: 0, turbulence: 0.1, dirX: 0, dirY: 1, dirZ: 0,
  },
  snow: {
    emitRate: 15, maxParticles: 300, spreadDeg: 160, loop: true,
    lifetimeMin: 6, lifetimeMax: 12, speedMin: 0.1, speedMax: 0.3,
    startSizeMin: 0.08, startSizeMax: 0.2, endSizeMin: 0.04, endSizeMax: 0.1,
    startColorHex: '#ffffff', startAlpha: 0.9, endColorHex: '#ffffff', endAlpha: 0,
    gravX: 0, gravY: -0.1, gravZ: 0, turbulence: 0.05, dirX: 0, dirY: -1, dirZ: 0,
  },
  magic: {
    emitRate: 40, maxParticles: 200, spreadDeg: 180, loop: true,
    lifetimeMin: 1.5, lifetimeMax: 3, speedMin: 0.3, speedMax: 1.0,
    startSizeMin: 0.05, startSizeMax: 0.15, endSizeMin: 0, endSizeMax: 0,
    startColorHex: '#9b59b6', startAlpha: 1, endColorHex: '#7b3fa6', endAlpha: 0,
    gravX: 0, gravY: 0.1, gravZ: 0, turbulence: 0.4, dirX: 0, dirY: 1, dirZ: 0,
  },
};

export function makeParticleRecord(id: string, preset?: ParticlePresetName): ParticleEmitterRecord {
  const base: ParticleEmitterRecord = {
    id,
    posX: 0, posY: 0, posZ: 0,
    emitRate: 30, maxParticles: 200, loop: true,
    dirX: 0, dirY: 1, dirZ: 0, spreadDeg: 0,
    lifetimeMin: 1, lifetimeMax: 2, speedMin: 0.3, speedMax: 0.8,
    startSizeMin: 0.05, startSizeMax: 0.15, endSizeMin: 0, endSizeMax: 0,
    startColorHex: '#ffffff', startAlpha: 1, endColorHex: '#ffffff', endAlpha: 0,
    gravX: 0, gravY: -0.3, gravZ: 0, turbulence: 0,
    textureIndex: 0, animTextures: [], animFrameTime: 0.1, useFlipbook: false,
    addFrameDraft: '',
  };
  return preset && PARTICLE_PRESET_SEEDS[preset] ? { ...base, ...PARTICLE_PRESET_SEEDS[preset], id } : base;
}

/** The engine config for a preset (what a new emitter is created with). */
export function particlePresetConfig(preset: ParticlePresetName): Record<string, unknown> {
  return buildParticleConfig(makeParticleRecord('', preset));
}

export function buildParticleConfig(rec: ParticleEmitterRecord): Record<string, unknown> {
  const [sr, sg, sb] = hexToRgb01(rec.startColorHex);
  const [er, eg, eb] = hexToRgb01(rec.endColorHex);
  const len = Math.sqrt(rec.dirX ** 2 + rec.dirY ** 2 + rec.dirZ ** 2) || 1;
  const cfg: Record<string, unknown> = {
    emitRate:     rec.emitRate,
    maxParticles: Math.max(1, rec.maxParticles),
    loop:         rec.loop,
    direction:    [rec.dirX / len, rec.dirY / len, rec.dirZ / len],
    spread:       rec.spreadDeg * (Math.PI / 180),
    lifetime:     [rec.lifetimeMin, Math.max(rec.lifetimeMin, rec.lifetimeMax)],
    speed:        [rec.speedMin, Math.max(rec.speedMin, rec.speedMax)],
    startSize:    [rec.startSizeMin, rec.startSizeMax],
    endSize:      [rec.endSizeMin, rec.endSizeMax],
    startColor:   { r: sr, g: sg, b: sb, a: rec.startAlpha },
    endColor:     { r: er, g: eg, b: eb, a: rec.endAlpha },
    gravity:      [rec.gravX, rec.gravY, rec.gravZ],
    turbulence:   rec.turbulence,
  };
  if (rec.useFlipbook && rec.animTextures.length > 0) {
    cfg['animTextures']  = [...rec.animTextures];
    cfg['animFrameTime'] = rec.animFrameTime;
  } else {
    cfg['textureIndex'] = rec.textureIndex;
    cfg['animTextures'] = [];
  }
  return cfg;
}

/** The editor record for a live emitter node (its engine config + position) — so emitters from a loaded document
 *  show their real settings. Missing fields fall back to the defaults. */
export function particleRecordFromEmitter(id: string, node: { x?: number; y?: number; z?: number; config?: any } | null): ParticleEmitterRecord {
  const rec = makeParticleRecord(id);
  if (!node) return rec;
  const c = node.config ?? {};
  const pair = (v: any, a: number, b: number): [number, number] => Array.isArray(v) && v.length >= 2 ? [+v[0], +v[1]] : [a, b];
  const tri = (v: any, a: number, b: number, d: number): [number, number, number] => Array.isArray(v) && v.length >= 3 ? [+v[0], +v[1], +v[2]] : [a, b, d];
  rec.posX = round4(node.x ?? 0); rec.posY = round4(node.y ?? 0); rec.posZ = round4(node.z ?? 0);
  if (typeof c.emitRate === 'number') rec.emitRate = c.emitRate;
  if (typeof c.maxParticles === 'number') rec.maxParticles = c.maxParticles;
  if (typeof c.loop === 'boolean') rec.loop = c.loop;
  [rec.dirX, rec.dirY, rec.dirZ] = tri(c.direction, rec.dirX, rec.dirY, rec.dirZ).map(round4) as [number, number, number];
  if (typeof c.spread === 'number') rec.spreadDeg = Math.round(c.spread * 180 / Math.PI);
  [rec.lifetimeMin, rec.lifetimeMax] = pair(c.lifetime, rec.lifetimeMin, rec.lifetimeMax);
  [rec.speedMin, rec.speedMax] = pair(c.speed, rec.speedMin, rec.speedMax);
  [rec.startSizeMin, rec.startSizeMax] = pair(c.startSize, rec.startSizeMin, rec.startSizeMax);
  [rec.endSizeMin, rec.endSizeMax] = pair(c.endSize, rec.endSizeMin, rec.endSizeMax);
  if (c.startColor) { rec.startColorHex = rgb01ToHex(c.startColor); rec.startAlpha = c.startColor.a ?? 1; }
  if (c.endColor)   { rec.endColorHex = rgb01ToHex(c.endColor);     rec.endAlpha = c.endColor.a ?? 0; }
  [rec.gravX, rec.gravY, rec.gravZ] = tri(c.gravity, rec.gravX, rec.gravY, rec.gravZ);
  if (typeof c.turbulence === 'number') rec.turbulence = c.turbulence;
  if (typeof c.textureIndex === 'number') rec.textureIndex = c.textureIndex;
  rec.animTextures = Array.isArray(c.animTextures) ? [...c.animTextures] : [];
  if (typeof c.animFrameTime === 'number') rec.animFrameTime = c.animFrameTime;
  rec.useFlipbook = rec.animTextures.length > 0;
  return rec;
}

function round4(v: number): number { return +(+v).toFixed(4); }

function hexToRgb01(hex: string): [number, number, number] {
  if (!hex || hex.length < 7) return [1, 1, 1];
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function rgb01ToHex(c: { r?: number; g?: number; b?: number }): string {
  const h = (v: number | undefined) => Math.round(Math.min(1, Math.max(0, v ?? 1)) * 255).toString(16).padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b);
}
