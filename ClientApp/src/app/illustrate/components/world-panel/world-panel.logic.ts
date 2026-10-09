/**
 * City / World panel: which controls actually do something in the current state (UI dead-controls audit 2026-10-09,
 * §3 City / World). Pure so the rules are unit-tested; the template asks `wv('id')`. Each rule cites the engine
 * gate it mirrors (salsa/src):
 *  - City lighting off: WorldManager._applyTimeOfDay returns early (`!_cityMode || !_overrideGlobalLighting`), and the
 *    time of day, sky lighting, wet reflections, haze, warmth, key/fill, lamp colour, the sky dome backdrop and the
 *    whole per-time-of-day grade are applied only there.
 *  - Street haze / Aerial haze: _applyHeightFog / _applyAerialHaze bail when `params.fog === false`.
 *  - Cloud style: the dome / card clouds need painted clouds + clouds + clear weather (world/traffic.ts cloud branch,
 *    world-manager sky-dome `clouds:` input); Stars / Moon only in clear weather (world/sky.ts `clear ? ... : 0`).
 *  - Viaduct arcade + local line: grid cities only (rail-layout.ts railViaductMode, local-line.ts planLocalLine).
 *  - Plaza: radial only (grid layout builds `plaza: null`); Street W is read by both layouts (layout.ts).
 *  - Facade / Rooftop detail: only the basic-box path reads them (streets.ts, `continue` after the detailed path).
 *  - Frontage dressing: buildFrontage returns [] with street furniture off (frontage.ts).
 *  - Look › Crowd density: staticCrowd returns [] with pedestrians off (pedestrians.ts).
 *  - Draw-distance sliders: _stampDrawDistances stamps nothing with Distance LOD off (far = 0).
 */
export interface WorldPanelVisState {
  /** City lighting (WorldManager.overrideGlobalLighting). */
  lighting: boolean;
  /** The day cycle is playing (its Pause button stays reachable). */
  dayCyclePlaying: boolean;
  fog: boolean;
  clouds: boolean;
  paintedClouds: boolean;
  weather: string;
  pattern: 'radial' | 'grid';
  detailedBuildings: boolean;
  streetFurniture: boolean;
  pedestrians: boolean;
  distanceLod: boolean;
}

export type WorldPanelControl =
  | 'time' | 'cycle' | 'dayCycle'
  | 'skyLighting' | 'wetReflections'
  | 'streetHaze' | 'aerialHaze' | 'hazeFogHint'
  | 'goldenWarmth' | 'keyFill' | 'lampColor'
  | 'skyDome' | 'cloudStyle' | 'starsMoon'
  | 'perTimeOfDay' | 'lightingHint'
  | 'viaduct' | 'localLine' | 'plaza'
  | 'facadeDetail' | 'rooftopDetail'
  | 'frontageDressing' | 'frontageHint'
  | 'lookCrowdDensity'
  | 'lodDistances';

export function worldControlVisible(id: WorldPanelControl, s: WorldPanelVisState): boolean {
  const clear = !s.weather || s.weather === 'clear';
  switch (id) {
    case 'time': case 'cycle':
    case 'skyLighting': case 'wetReflections':
    case 'goldenWarmth': case 'keyFill': case 'lampColor':
    case 'skyDome': case 'perTimeOfDay':
      return s.lighting;
    case 'dayCycle': return s.lighting || s.dayCyclePlaying;
    case 'lightingHint': return !s.lighting;
    case 'streetHaze': case 'aerialHaze': return s.lighting && s.fog;
    case 'hazeFogHint': return s.lighting && !s.fog;
    case 'cloudStyle': return s.lighting && s.paintedClouds && s.clouds && clear;
    case 'starsMoon': return s.lighting && clear;
    case 'viaduct': case 'localLine': return s.pattern === 'grid';
    case 'plaza': return s.pattern === 'radial';
    case 'facadeDetail': case 'rooftopDetail': return !s.detailedBuildings;
    case 'frontageDressing': return s.streetFurniture;
    case 'frontageHint': return !s.streetFurniture;
    case 'lookCrowdDensity': return s.pedestrians;
    case 'lodDistances': return s.distanceLod;
  }
  return true;
}

/** Look sub-pages that lose controls with City lighting off (they show the "turn on City lighting" hint). The hub
 *  ('' = no sub-page open) shows it too, since the Per time of day tile is gone. */
const LIGHTING_HINT_SUBS = new Set(['', 'lighting', 'surfaces', 'sky', 'sun-shadows', 'rendering']);
export function worldLookLightingHint(lighting: boolean, subId: string | null | undefined): boolean {
  return !lighting && LIGHTING_HINT_SUBS.has(subId ?? '');
}
