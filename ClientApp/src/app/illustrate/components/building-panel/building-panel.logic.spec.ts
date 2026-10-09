import { BuildingVisParams, buildingPanelVis, materialOptions } from './building-panel.logic';

/** UI dead-controls audit 2026-10-09 › Building panel: each control shows only where the generator reads it. */
describe('Building panel visibility', () => {
  const base: BuildingVisParams = {
    category: 'apartment', floors: 4, setbacks: 0, podium: false,
    windowStyle: 'punched', material: 'brick', windowSash: false,
    storefront: false, rollerDoors: false, canopy: false, awning: false, noren: false, doorStyle: 'panel', fascia: false,
    openCorridor: false, outsideStair: false, balconies: false, balconyStyle: 'rail', julietBalconies: false, windowTrim: false,
    windowBoxes: false, basePlanters: false, roofStyle: 'parapet', roofPenthouse: false, helipad: false, crown: 'none',
    signage: false, bladeSign: false, wrapSign: false, rooftopSign: false, ledScreen: false, signStack: false, floorSigns: false,
    inBlock: false, renderStyleOverridden: false,
  };
  const vis = (o: Partial<BuildingVisParams>) => buildingPanelVis({ ...base, ...o });

  it('setbacks only for tower / office; inset + podium need a setback count; podium floors need the podium', () => {
    expect(vis({ category: 'house' }).setbacks).toBeFalse();
    expect(vis({ category: 'tower' }).setbacks).toBeTrue();
    expect(vis({ category: 'office' }).setbacks).toBeTrue();
    expect(vis({ category: 'tower', setbacks: 0 }).setbackInset).toBeFalse();
    expect(vis({ category: 'tower', setbacks: 2 }).setbackInset).toBeTrue();
    expect(vis({ category: 'apartment', setbacks: 2 }).podium).toBeFalse();
    expect(vis({ category: 'office', setbacks: 1 }).podium).toBeTrue();
    expect(vis({ category: 'office', setbacks: 1, podium: false }).podiumFloors).toBeFalse();
    expect(vis({ category: 'office', setbacks: 1, podium: true }).podiumFloors).toBeTrue();
  });

  it('mullions only with Curtain windows; Curtain hides the wall material', () => {
    expect(vis({ windowStyle: 'grid' }).mullions).toBeFalse();
    expect(vis({ windowStyle: 'curtain' }).mullions).toBeTrue();
    expect(vis({ windowStyle: 'curtain' }).material).toBeFalse();
    expect(vis({ windowStyle: 'ribbon' }).material).toBeTrue();
  });

  it('material options: Ribbon keeps only the materials that differ; Glass only while set', () => {
    const vals = (o: Partial<BuildingVisParams>) => materialOptions({ ...base, ...o }).map(m => m.value);
    expect(vals({ windowStyle: 'grid', material: 'concrete' })).not.toContain('glass');
    expect(vals({ windowStyle: 'grid', material: 'concrete' })).toContain('siding');
    expect(vals({ windowStyle: 'ribbon', material: 'concrete' })).toEqual(['concrete', 'timber', 'metal']);
    expect(vals({ windowStyle: 'ribbon', material: 'brick' })).toEqual(['concrete', 'brick', 'timber', 'metal']);   // the set value stays listed
    expect(vals({ windowStyle: 'grid', material: 'glass' })).toContain('glass');
  });

  it('juliet / window trim / window boxes need discrete masonry windows on an upper floor', () => {
    expect(vis({ windowStyle: 'grid' }).juliet).toBeTrue();
    expect(vis({ windowStyle: 'ribbon' }).juliet).toBeFalse();
    expect(vis({ material: 'timber' }).juliet).toBeFalse();
    expect(vis({ material: 'metal' }).windowTrim).toBeFalse();
    expect(vis({ floors: 1 }).windowTrim).toBeFalse();
    expect(vis({ floors: 1 }).windowBoxes).toBeFalse();
    expect(vis({ julietBalconies: true }).julietDetails).toBeTrue();
    expect(vis({ julietBalconies: true, material: 'timber' }).julietDetails).toBeFalse();
    expect(vis({ windowTrim: true }).windowTrimColor).toBeTrue();
  });

  it('bloom colour with working window boxes or door planters', () => {
    expect(vis({}).bloomColor).toBeFalse();
    expect(vis({ windowBoxes: true }).bloomColor).toBeTrue();
    expect(vis({ windowBoxes: true, material: 'metal' }).bloomColor).toBeFalse();
    expect(vis({ basePlanters: true, material: 'metal' }).bloomColor).toBeTrue();
  });

  it('storefront details + awning only on a drawn shopfront (not Curtain)', () => {
    expect(vis({ storefront: true }).shopDetails).toBeTrue();
    expect(vis({ storefront: true, windowStyle: 'curtain' }).shopDetails).toBeFalse();
    expect(vis({ storefront: false }).awning).toBeFalse();
    expect(vis({ storefront: true }).awning).toBeTrue();
    expect(vis({ storefront: true, awning: true }).awningDetails).toBeTrue();
    expect(vis({ storefront: true, windowStyle: 'curtain', awning: true }).awningDetails).toBeFalse();
  });

  it('door style / recessed entry / door colours only where a door is built', () => {
    expect(vis({}).doorStyle).toBeTrue();                                    // residential door
    expect(vis({ rollerDoors: true }).doorStyle).toBeFalse();
    expect(vis({ canopy: true }).doorStyle).toBeFalse();
    expect(vis({ openCorridor: true }).doorStyle).toBeFalse();
    expect(vis({ openCorridor: true, storefront: true }).doorStyle).toBeTrue();
    expect(vis({ storefront: true, windowStyle: 'curtain' }).recessedEntry).toBeTrue();   // the curtain entrance door
    expect(vis({ rollerDoors: true }).doorColor).toBeFalse();
    expect(vis({ openCorridor: true }).doorColor).toBeTrue();                // a door per flat off the corridor
    expect(vis({ openCorridor: true }).doorFrameColor).toBeTrue();
    expect(vis({ openCorridor: true }).doorHandleColor).toBeFalse();
    expect(vis({ rollerDoors: true, roofPenthouse: true }).doorColor).toBeTrue();
    expect(vis({ rollerDoors: true, roofPenthouse: true, roofStyle: 'hip' }).doorColor).toBeFalse();
    expect(vis({ rollerDoors: true, outsideStair: true }).doorColor).toBeTrue();
    expect(vis({ doorStyle: 'sliding' }).doorHandleColor).toBeFalse();
    expect(vis({ doorStyle: 'glazed' }).doorHandleColor).toBeTrue();
  });

  it('Japan details per their conditions', () => {
    expect(vis({ windowStyle: 'ribbon', roofStyle: 'flat' }).windowSash).toBeFalse();
    expect(vis({ windowStyle: 'grid' }).windowSash).toBeTrue();
    expect(vis({ windowStyle: 'ribbon', roofStyle: 'gable', category: 'shophouse' }).windowSash).toBeTrue();   // kawara roof pattern
    expect(vis({ windowStyle: 'ribbon', roofStyle: 'hip', category: 'house' }).windowSash).toBeTrue();         // no chimney on a sash house
    expect(vis({ windowStyle: 'ribbon', roofStyle: 'gable', category: 'apartment' }).windowSash).toBeFalse();
    expect(vis({ windowTrim: true }).windowSills).toBeFalse();
    expect(vis({ julietBalconies: true }).windowSills).toBeFalse();
    expect(vis({ balconies: true, balconyStyle: 'panel' }).windowSills).toBeFalse();
    expect(vis({}).windowSills).toBeTrue();
    expect(vis({ storefront: true }).shopInterior).toBeTrue();
    expect(vis({ storefront: true, windowStyle: 'curtain' }).fascia).toBeFalse();
    expect(vis({ storefront: false }).shutterBays).toBeFalse();
    expect(vis({ openCorridor: true }).outsideStair).toBeFalse();
    expect(vis({ floors: 1 }).outsideStair).toBeFalse();
    expect(vis({ floors: 1 }).floorSigns).toBeFalse();
    expect(vis({ balconies: false }).balconyStyle).toBeFalse();
    expect(vis({ balconies: true }).balconyStyle).toBeTrue();
  });

  it('roof: pitch for hip / gable / tiled hip (not mansard); deep eaves hip / gable; clutter only flat / parapet', () => {
    expect(vis({ roofStyle: 'mansard' }).roofPitch).toBeFalse();
    expect(vis({ roofStyle: 'tiled-hip' }).roofPitch).toBeTrue();
    expect(vis({ roofStyle: 'gable' }).deepEaves).toBeTrue();
    expect(vis({ roofStyle: 'hip' }).deepEaves).toBeTrue();
    expect(vis({ roofStyle: 'tiled-hip' }).deepEaves).toBeFalse();
    expect(vis({ roofStyle: 'gable' }).flatRoofDetail).toBeFalse();
    expect(vis({ roofStyle: 'sawtooth' }).flatRoofDetail).toBeFalse();
    expect(vis({ roofStyle: 'flat' }).flatRoofDetail).toBeTrue();
  });

  it('signage: the master is the per-bay shop signs; blade / LED / neon / sign colour gate on what they need', () => {
    expect(vis({}).shopSigns).toBeFalse();
    expect(vis({ storefront: true }).shopSigns).toBeTrue();
    expect(vis({ storefront: true, fascia: true }).shopSigns).toBeFalse();
    expect(vis({ signStack: true }).bladeSign).toBeFalse();
    expect(vis({ floors: 1 }).ledScreen).toBeFalse();
    expect(vis({}).neon).toBeFalse();
    expect(vis({ wrapSign: true }).neon).toBeTrue();                         // independent of the old master
    expect(vis({ bladeSign: true, signStack: true }).neon).toBeTrue();       // the stack is lit
    expect(vis({ ledScreen: true }).signColor).toBeTrue();                   // the screen's ad tint
    expect(vis({ ledScreen: true }).neon).toBeFalse();
    expect(vis({ helipad: true }).signColor).toBeTrue();
    expect(vis({ doorStyle: 'auto-slide' }).signColor).toBeTrue();           // the sensor eye
    expect(vis({}).signColor).toBeFalse();
  });

  it('awning colour also for the canopy and noren', () => {
    expect(vis({}).awningColor).toBeFalse();
    expect(vis({ canopy: true }).awningColor).toBeTrue();
    expect(vis({ storefront: true, noren: true }).awningColor).toBeTrue();
  });

  it('block building: no Archetype; Render style hidden (with a hint) under a Style', () => {
    expect(vis({ inBlock: true }).archetype).toBeFalse();
    expect(vis({}).archetype).toBeTrue();
    expect(vis({ renderStyleOverridden: true }).renderStyle).toBeFalse();
    expect(vis({ renderStyleOverridden: true }).renderStyleHint).toBeTrue();
    expect(vis({}).renderStyle).toBeTrue();
  });
});
