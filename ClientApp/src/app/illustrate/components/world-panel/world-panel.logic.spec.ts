import { WorldPanelVisState, worldControlVisible as wv, worldLookLightingHint } from './world-panel.logic';

const base: WorldPanelVisState = {
  lighting: true, dayCyclePlaying: false, fog: true, clouds: true, paintedClouds: true, weather: 'clear',
  pattern: 'grid', detailedBuildings: true, streetFurniture: true, pedestrians: true, distanceLod: true,
};
const st = (patch: Partial<WorldPanelVisState>): WorldPanelVisState => ({ ...base, ...patch });

describe('world panel visibility (dead-controls audit 2026-10-09 §3)', () => {
  it('City lighting off hides every control _applyTimeOfDay drives, and shows the hint', () => {
    const off = st({ lighting: false });
    for (const id of ['time', 'cycle', 'dayCycle', 'skyLighting', 'wetReflections', 'streetHaze', 'aerialHaze',
      'goldenWarmth', 'keyFill', 'lampColor', 'skyDome', 'cloudStyle', 'starsMoon', 'perTimeOfDay'] as const) {
      expect(wv(id, off)).withContext(id).toBeFalse();
      expect(wv(id, base)).withContext(id + ' (lighting on)').toBeTrue();
    }
    expect(wv('lightingHint', off)).toBeTrue();
    expect(wv('lightingHint', base)).toBeFalse();
  });

  it('keeps the Day cycle button while the cycle plays, so it can be paused', () => {
    expect(wv('dayCycle', st({ lighting: false, dayCyclePlaying: true }))).toBeTrue();
  });

  it('haze needs Fog on (a hint instead, only when lighting is on)', () => {
    expect(wv('streetHaze', st({ fog: false }))).toBeFalse();
    expect(wv('aerialHaze', st({ fog: false }))).toBeFalse();
    expect(wv('hazeFogHint', st({ fog: false }))).toBeTrue();
    expect(wv('hazeFogHint', st({ fog: false, lighting: false }))).toBeFalse();
    expect(wv('hazeFogHint', base)).toBeFalse();
  });

  it('cloud style needs painted clouds, clouds and clear weather; stars / moon need clear weather', () => {
    expect(wv('cloudStyle', st({ paintedClouds: false }))).toBeFalse();
    expect(wv('cloudStyle', st({ clouds: false }))).toBeFalse();
    expect(wv('cloudStyle', st({ weather: 'rain' }))).toBeFalse();
    expect(wv('starsMoon', st({ weather: 'overcast' }))).toBeFalse();
    expect(wv('starsMoon', st({ weather: 'clear' }))).toBeTrue();
  });

  it('layout-specific rows follow the pattern', () => {
    const radial = st({ pattern: 'radial' });
    expect(wv('viaduct', radial)).toBeFalse();
    expect(wv('localLine', radial)).toBeFalse();
    expect(wv('plaza', radial)).toBeTrue();
    expect(wv('viaduct', base)).toBeTrue();
    expect(wv('localLine', base)).toBeTrue();
    expect(wv('plaza', base)).toBeFalse();
  });

  it('buildings / props / crowd / LOD gates', () => {
    expect(wv('facadeDetail', base)).toBeFalse();
    expect(wv('rooftopDetail', base)).toBeFalse();
    expect(wv('facadeDetail', st({ detailedBuildings: false }))).toBeTrue();
    expect(wv('frontageDressing', st({ streetFurniture: false }))).toBeFalse();
    expect(wv('frontageHint', st({ streetFurniture: false }))).toBeTrue();
    expect(wv('lookCrowdDensity', st({ pedestrians: false }))).toBeFalse();
    expect(wv('lodDistances', st({ distanceLod: false }))).toBeFalse();
    expect(wv('lodDistances', base)).toBeTrue();
  });

  it('the Look hint shows on the hub and the pages that lost controls only', () => {
    expect(worldLookLightingHint(false, null)).toBeTrue();
    expect(worldLookLightingHint(false, 'sky')).toBeTrue();
    expect(worldLookLightingHint(false, 'rendering')).toBeTrue();
    expect(worldLookLightingHint(false, 'outlines')).toBeFalse();
    expect(worldLookLightingHint(false, 'style')).toBeFalse();
    expect(worldLookLightingHint(true, null)).toBeFalse();
  });
});
