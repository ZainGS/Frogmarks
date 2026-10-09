import {
  coniferAutoTiers, colorHint, lookHint, shapeHint, showBloomColor, showBloomToggle, showBranchKnobs, showCenterColor,
  showClimberArea, showConifer, showHedgeSprigs, showPetalColor, showPotColor, showRender, showSize, showSoilColor,
  showStemColor, showTrunkColor, showWidth, showWoody, woodyHint,
} from './foliage-panel.logic';

/** UI dead-controls audit 2026-10-09 › Foliage panel: each control shows only for the types the engine reads it for. */
describe('Foliage panel visibility', () => {
  const ALL = ['bush', 'shrub', 'hedge', 'small-tree', 'conifer', 'grass-tuft', 'tall-grass', 'daisy', 'rapeseed',
    'lavender', 'flower-bed', 'planter', 'potted', 'window-box', 'vine', 'ivy'];
  const where = (f: (t: string) => boolean): string[] => ALL.filter(f);

  it('Woody group: branch + hedge types, never the conifer (it gets its own group)', () => {
    expect(where(showWoody)).toEqual(['bush', 'shrub', 'hedge', 'small-tree']);
    expect(where(showConifer)).toEqual(['conifer']);
  });

  it('hedge (clipped shell) hides Levels / Stems / Gnarl / Canopy / Gaps and keeps Sprigs', () => {
    expect(showBranchKnobs('hedge')).toBeFalse();
    expect(showHedgeSprigs('hedge')).toBeTrue();
    expect(where(showBranchKnobs)).toEqual(['bush', 'shrub', 'small-tree']);
    expect(woodyHint('hedge')).toBe('Sprigs · LOD');
    expect(woodyHint('bush')).toContain('Gnarl');
  });

  it('Size hidden for the window box and the climbers; Width only for hedge / flower bed / window box', () => {
    expect(showSize('window-box')).toBeFalse();
    expect(showSize('ivy')).toBeFalse();
    expect(showSize('vine')).toBeFalse();
    expect(showSize('bush')).toBeTrue();
    expect(where(showWidth)).toEqual(['hedge', 'flower-bed', 'window-box']);   // no second vine Width
    expect(shapeHint('window-box')).toBe('Width · Density');
    expect(shapeHint('ivy')).toBe('Density');
    expect(shapeHint('hedge')).toBe('Size · Width · Density');
  });

  it('climber area controls show in Area mode, and in Path mode while no path exists', () => {
    expect(showClimberArea('area', false)).toBeTrue();
    expect(showClimberArea('area', true)).toBeTrue();
    expect(showClimberArea('path', false)).toBeTrue();
    expect(showClimberArea('path', true)).toBeFalse();
  });

  it('Render chunky/card hidden for grasses, flowers and climbers', () => {
    expect(where(showRender)).toEqual(['bush', 'shrub', 'hedge', 'small-tree', 'conifer', 'planter', 'potted', 'window-box']);
    expect(lookHint('daisy')).toBe('Cel shade');
    expect(lookHint('bush')).toBe('Render · Cel shade · Blooms');
  });

  it('Blooms + Bloom colour hidden for grasses and flowers; Bloom colour also needs Blooms on', () => {
    expect(where(showBloomToggle)).toEqual(['bush', 'shrub', 'hedge', 'small-tree', 'conifer', 'planter', 'potted', 'window-box', 'vine', 'ivy']);
    expect(showBloomColor('bush', true)).toBeTrue();
    expect(showBloomColor('bush', false)).toBeFalse();
    expect(showBloomColor('daisy', true)).toBeFalse();
    expect(showBloomColor('tall-grass', true)).toBeFalse();
  });

  it('Pot / Soil colour for every vessel (window box included)', () => {
    expect(where(showPotColor)).toEqual(['planter', 'potted', 'window-box']);
    expect(where(showSoilColor)).toEqual(['planter', 'potted', 'window-box']);
  });

  it('Trunk colour wherever there is wood; Stem for climbers + vessels; Center for flowers + flowering vessels', () => {
    expect(where(showTrunkColor)).toEqual(['bush', 'shrub', 'small-tree', 'conifer', 'planter', 'potted', 'window-box']);
    expect(where(showStemColor)).toEqual(['planter', 'potted', 'window-box', 'vine', 'ivy']);
    expect(where(showPetalColor)).toEqual(['daisy', 'rapeseed', 'lavender', 'flower-bed']);
    expect(where(t => showCenterColor(t, false))).toEqual(['daisy', 'rapeseed', 'lavender', 'flower-bed']);
    expect(showCenterColor('potted', true)).toBeTrue();
    expect(colorHint('ivy')).toBe('Foliage · Tip · Bloom · Stem');
    expect(colorHint('window-box')).toBe('Foliage · Tip · Bloom · Pot · Trunk · Stem');
  });

  it('conifer Tiers default follows the height like the engine', () => {
    expect(coniferAutoTiers(2)).toBe(5);
    expect(coniferAutoTiers(0.1)).toBe(4);
    expect(coniferAutoTiers(12)).toBe(10);
  });
});
