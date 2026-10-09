/**
 * Which Building panel controls do something for the current params (UI dead-controls audit 2026-10-09, §3 Building
 * panel). Each rule mirrors the Salsa generator (salsa/src/world/building.ts + building-parts.ts) — a control is hidden
 * only where the engine ignores it. Pure, so the specs drive it without a ShapeManager.
 */

/** The params the visibility rules read (BuildingParams names; the panel maps its fields onto these). */
export interface BuildingVisParams {
  category: string;
  floors: number;
  setbacks: number;
  podium: boolean;
  windowStyle: string;
  material: string;
  windowSash: boolean;
  storefront: boolean;
  rollerDoors: boolean;
  canopy: boolean;
  awning: boolean;
  noren: boolean;
  doorStyle: string;
  fascia: boolean;
  openCorridor: boolean;
  outsideStair: boolean;
  balconies: boolean;
  balconyStyle: string;
  julietBalconies: boolean;
  windowTrim: boolean;
  windowBoxes: boolean;
  basePlanters: boolean;
  roofStyle: string;
  roofPenthouse: boolean;
  helipad: boolean;
  crown: string;
  signage: boolean;
  bladeSign: boolean;
  wrapSign: boolean;
  rooftopSign: boolean;
  ledScreen: boolean;
  signStack: boolean;
  floorSigns: boolean;
  /** Editing one building inside a Block (its params are stored resolved, so an archetype switch never reloads). */
  inBlock: boolean;
  /** The object's Style (Block Style / creator style) sets a render style — applied over the building's own. */
  renderStyleOverridden: boolean;
}

/** One flag per gated control (true = show). */
export interface BuildingPanelVis {
  archetype: boolean;
  renderStyle: boolean;
  renderStyleHint: boolean;
  setbacks: boolean;
  setbackInset: boolean;
  podium: boolean;
  podiumFloors: boolean;
  material: boolean;
  mullions: boolean;
  shopDetails: boolean;
  awning: boolean;
  awningDetails: boolean;
  doorStyle: boolean;
  recessedEntry: boolean;
  windowBoxes: boolean;
  bloomColor: boolean;
  windowSash: boolean;
  windowSills: boolean;
  shopInterior: boolean;
  fascia: boolean;
  floorSigns: boolean;
  outsideStair: boolean;
  shutterBays: boolean;
  balconyStyle: boolean;
  juliet: boolean;
  julietDetails: boolean;
  windowTrim: boolean;
  windowTrimColor: boolean;
  roofPitch: boolean;
  deepEaves: boolean;
  flatRoofDetail: boolean;
  shopSigns: boolean;
  bladeSign: boolean;
  ledScreen: boolean;
  neon: boolean;
  signColor: boolean;
  awningColor: boolean;
  doorColor: boolean;
  doorFrameColor: boolean;
  doorHandleColor: boolean;
}

const isTimberOrMetal = (p: BuildingVisParams): boolean => p.material === 'timber' || p.material === 'metal';
const isFlatRoof = (p: BuildingVisParams): boolean => p.roofStyle === 'flat' || p.roofStyle === 'parapet';

/** computeSections: setbacks (and the podium, which rides on them) only for tower / office with setbacks > 0. */
export function setbacksAllowed(p: BuildingVisParams): boolean {
  return p.category === 'tower' || p.category === 'office';
}
export function setbacksActive(p: BuildingVisParams): boolean {
  return setbacksAllowed(p) && p.setbacks > 0;
}

/** Discrete masonry windows (grid / punched, not a timber / metal skin): what the window SHADER draws as cells. */
export function discreteMasonryWindows(p: BuildingVisParams): boolean {
  return (p.windowStyle === 'grid' || p.windowStyle === 'punched') && !isTimberOrMetal(p);
}

/** forEachWindow: the per-window detail (juliets, trims, sills, window boxes) — discrete masonry windows on the
 *  upper floors, so a 1-floor building has none. */
export function upperWindowsDetailed(p: BuildingVisParams): boolean {
  return discreteMasonryWindows(p) && p.floors >= 2;
}

/** emitStorefront: the shop edge (bays, glazing, awnings, tenant signs, fascia) — a Curtain building only gets a door. */
export function shopfrontDrawn(p: BuildingVisParams): boolean {
  return p.storefront && p.windowStyle !== 'curtain';
}

/** A door built by emitDoor (the one that reads doorStyle / recessedEntry / the handle): the shop entrance (also on
 *  Curtain), else the residential door — skipped for roller doors / canopy / an open corridor without a storefront. */
export function entranceDoorDrawn(p: BuildingVisParams): boolean {
  return p.storefront || (!p.rollerDoors && !p.canopy && !p.openCorridor);
}

/** emitBackStair: only without an open corridor (else-if) and with an upper floor. */
export function outsideStairDrawn(p: BuildingVisParams): boolean {
  return p.outsideStair && !p.openCorridor && p.floors >= 2;
}

/** emitSignage blade: replaced by the sign stack; needs an upper floor to hang on. */
export function bladeSignDrawn(p: BuildingVisParams): boolean {
  return p.bladeSign && !p.signStack && p.floors >= 2;
}

/** Any lit sign box (the layers Neon brightens): tenant signs, fascia, blade, sign stack, floor signs, wrap, billboard. */
export function anySignBox(p: BuildingVisParams): boolean {
  const shop = shopfrontDrawn(p);
  return (shop && (p.signage || p.fascia)) || bladeSignDrawn(p) || p.signStack || (p.floorSigns && p.floors >= 2)
    || p.wrapSign || p.rooftopSign;
}

/** Material options for the window style. Ribbon windows draw the same facade for every masonry material (only
 *  Timber / Metal replace it); "Glass" has no facade code (it renders as Concrete) so it's only listed while set. */
export function materialOptions(p: BuildingVisParams): { value: string; label: string }[] {
  const all = [
    { value: 'concrete', label: 'Concrete' },
    { value: 'brick', label: 'Brick' },
    { value: 'plaster', label: 'Plaster' },
    { value: 'tile', label: 'Tile' },
    { value: 'timber', label: 'Timber' },
    { value: 'metal', label: 'Metal' },
    { value: 'siding', label: 'Siding' },
    { value: 'panel', label: 'Metal panel' },
  ];
  const ribbonKeeps = new Set(['concrete', 'timber', 'metal']);
  const out = p.windowStyle === 'ribbon' ? all.filter(o => ribbonKeeps.has(o.value) || o.value === p.material) : all;
  if (p.material === 'glass') out.splice(1, 0, { value: 'glass', label: 'Glass (as Concrete)' });
  return out;
}

export function buildingPanelVis(p: BuildingVisParams): BuildingPanelVis {
  const shop = shopfrontDrawn(p);
  const door = entranceDoorDrawn(p);
  const windows = upperWindowsDetailed(p);
  const flatRoof = isFlatRoof(p);
  const pitched = !flatRoof;
  return {
    // Style
    archetype: !p.inBlock,
    renderStyle: !p.renderStyleOverridden,
    renderStyleHint: p.renderStyleOverridden,
    // Massing
    setbacks: setbacksAllowed(p),
    setbackInset: setbacksActive(p),
    podium: setbacksActive(p),
    podiumFloors: setbacksActive(p) && p.podium,
    // Facade: a Curtain building is all glass (no wall material); mullions are curtain-wall fins only
    material: p.windowStyle !== 'curtain',
    mullions: p.windowStyle === 'curtain',
    // Ground
    shopDetails: shop,
    awning: shop,
    awningDetails: shop && p.awning,
    doorStyle: door,
    recessedEntry: door,
    // Greenery
    windowBoxes: windows,
    bloomColor: (p.windowBoxes && windows) || p.basePlanters,
    // Japan details
    windowSash: discreteMasonryWindows(p)
      || (p.roofStyle === 'gable' && p.category !== 'apartment') || p.roofStyle === 'mansard'
      || (p.category === 'house' && pitched),
    windowSills: windows && !p.windowTrim && !p.julietBalconies && !(p.balconies && p.balconyStyle === 'panel'),
    shopInterior: shop,
    fascia: shop,
    floorSigns: p.floors >= 2,
    outsideStair: !p.openCorridor && p.floors >= 2,
    shutterBays: shop,
    balconyStyle: p.balconies,
    // Features
    juliet: windows,
    julietDetails: windows && p.julietBalconies,
    windowTrim: windows,
    windowTrimColor: windows && p.windowTrim,
    // Roof
    roofPitch: p.roofStyle === 'hip' || p.roofStyle === 'gable' || p.roofStyle === 'tiled-hip',
    deepEaves: p.roofStyle === 'hip' || p.roofStyle === 'gable',
    flatRoofDetail: flatRoof,
    // Signage: the old master only ever gated the per-bay tenant signs over the shopfront
    shopSigns: shop && !p.fascia,
    bladeSign: !p.signStack && p.floors >= 2,
    ledScreen: p.floors >= 2,
    neon: anySignBox(p),
    // Colour
    signColor: anySignBox(p) || (p.ledScreen && p.floors >= 2) || (flatRoof && (p.helipad || p.crown === 'spire'))
      || (door && p.doorStyle === 'auto-slide'),
    awningColor: (shop && (p.awning || p.noren)) || p.canopy,
    doorColor: door || p.openCorridor || outsideStairDrawn(p) || (flatRoof && p.roofPenthouse),
    doorFrameColor: door || p.openCorridor,
    doorHandleColor: door && p.doorStyle !== 'auto-slide' && p.doorStyle !== 'sliding',
  };
}
