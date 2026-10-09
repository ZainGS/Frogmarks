/**
 * Which Edit Foliage controls do something for which plant type (UI dead-controls audit 2026-10-09, "Foliage panel").
 * Each rule mirrors what the engine's `buildFoliage` (salsa src/world/foliage.ts) actually reads per type, so a
 * control only shows where moving it changes the plant. Kept out of the template so the spec can pin the table.
 */

export type FoliageTypeId =
  | 'bush' | 'shrub' | 'hedge' | 'small-tree' | 'conifer'
  | 'grass-tuft' | 'tall-grass'
  | 'daisy' | 'rapeseed' | 'lavender' | 'flower-bed'
  | 'planter' | 'potted' | 'window-box'
  | 'vine' | 'ivy';

const BLADE = new Set<string>(['grass-tuft', 'tall-grass']);
const FLOWER = new Set<string>(['daisy', 'rapeseed', 'lavender', 'flower-bed']);
const CLIMBER = new Set<string>(['ivy', 'vine']);
/** The `branch` skeleton types (bush / shrub / small-tree) plus the clipped-shell hedge. Not conifer (own whorl model). */
const WOODY = new Set<string>(['bush', 'shrub', 'hedge', 'small-tree']);
const VESSEL = new Set<string>(['potted', 'planter', 'window-box']);

export const isBladeType = (t: string): boolean => BLADE.has(t);
export const isFlowerType = (t: string): boolean => FLOWER.has(t);
export const isClimberType = (t: string): boolean => CLIMBER.has(t);
export const isVesselType = (t: string): boolean => VESSEL.has(t);

// ── Menu groups ──────────────────────────────────────────────────────────────────────────────────

/** Woody group: the branch / hedge knobs. A conifer reads none of them (emitConifer takes only its own
 *  coniferSpread / Tiers / Droop + size + density), so it gets the Conifer group instead. */
export const showWoody = (t: string): boolean => WOODY.has(t);
export const showConifer = (t: string): boolean => t === 'conifer';

/** One-line hint on the Woody menu tile, per what the group shows for that type. */
export function woodyHint(t: string): string {
  return t === 'hedge' ? 'Sprigs · LOD' : 'Levels · Stems · Gnarl · Canopy · Gaps';
}

// ── Shape ────────────────────────────────────────────────────────────────────────────────────────

/** Size: a window box is a fixed-height box (only `width` + density drive it). A climber's size is its
 *  area height (`areaHeight ?? size`), which the Climber group owns — one slider, not two. */
export const showSize = (t: string): boolean => t !== 'window-box' && !CLIMBER.has(t);

/** Width (run length / spread): hedge, flower bed, window box. A climber's width is its area width
 *  (`areaWidth ?? width`) in the Climber group — the vine used to show both. */
export const showWidth = (t: string): boolean => t === 'hedge' || t === 'flower-bed' || t === 'window-box';

export function shapeHint(t: string): string {
  const parts = [showSize(t) ? 'Size' : '', showWidth(t) ? 'Width' : '', 'Density'].filter(Boolean);
  return parts.join(' · ');
}

// ── Woody (hedge is a clipped shell: no limb skeleton) ──────────────────────────────────────────

/** Levels / Stems / Gnarl / Canopy shape / Leaf gaps feed the branch skeleton + canopy; the hedge ignores them. */
export const showBranchKnobs = (t: string): boolean => WOODY.has(t) && t !== 'hedge';
export const showHedgeSprigs = (t: string): boolean => t === 'hedge';

/** Conifer: unset Tiers follows the height (foliage.ts conifer case) — so the slider starts where the plant is. */
export function coniferAutoTiers(size: number): number {
  return Math.max(4, Math.round(4 + Math.max(0.4, size) * 0.5));
}

// ── Climber ──────────────────────────────────────────────────────────────────────────────────────

/** Area controls (Width / Height / Coverage / Growth / Wander) drive the plant in Area mode — and in Path
 *  mode while there is no authored path, because the engine then falls back to area growth. */
export const showClimberArea = (mode: string, hasPath: boolean): boolean => mode !== 'path' || !hasPath;

// ── Look ─────────────────────────────────────────────────────────────────────────────────────────

/** Render chunky / card: blade, flower and climber geometry is real swept geometry in both modes. */
export const showRender = (t: string): boolean => !BLADE.has(t) && !FLOWER.has(t) && !CLIMBER.has(t);

// Cel shade is not gated: every layer takes the cel render style in either render mode.

/** Blooms: berry specks on woody / hedge / conifer / climbers, real flower heads in vessels. A flower type
 *  is ALL bloom (its petals have their own colours) and a grass has none. */
export const showBloomToggle = (t: string): boolean => !BLADE.has(t) && !FLOWER.has(t);

export function lookHint(t: string): string {
  return [showRender(t) ? 'Render' : '', 'Cel shade', showBloomToggle(t) ? 'Blooms' : ''].filter(Boolean).join(' · ');
}

// Pot material has no control: FoliageParams.potMaterial is stored but buildFoliage never reads it (the vessel
// is one flat potColor layer) — re-add the select once the engine gives the materials a look.

// ── Colour ───────────────────────────────────────────────────────────────────────────────────────

export const showBloomColor = (t: string, bloom: boolean): boolean => bloom && showBloomToggle(t);
/** Pot: the vessel layer — every vessel type, the window box included. */
export const showPotColor = (t: string): boolean => VESSEL.has(t);
export const showSoilColor = (t: string): boolean => VESSEL.has(t);
/** Trunk: branch limbs (woody minus hedge), the conifer leader, and a vessel's shrubs + stalks. */
export const showTrunkColor = (t: string): boolean =>
  t === 'bush' || t === 'shrub' || t === 'small-tree' || t === 'conifer' || VESSEL.has(t);
/** Stem: climber runners, and a vessel's trailing runners. */
export const showStemColor = (t: string): boolean => CLIMBER.has(t) || VESSEL.has(t);
export const showPetalColor = (t: string): boolean => FLOWER.has(t);
/** Center: flower discs — on a vessel only once Blooms puts flowering plants in it. */
export const showCenterColor = (t: string, bloom: boolean): boolean => FLOWER.has(t) || (VESSEL.has(t) && bloom);

export function colorHint(t: string): string {
  return ['Foliage', 'Tip',
    showBloomToggle(t) ? 'Bloom' : '', showPetalColor(t) ? 'Petal' : '', showPotColor(t) ? 'Pot' : '',
    showTrunkColor(t) ? 'Trunk' : '', showStemColor(t) ? 'Stem' : ''].filter(Boolean).join(' · ');
}
