/**
 * The dither Edge Width control (layer dither panel). The engine takes the width in px (`DitherConfig.edgeWidth`);
 * the panel offers:
 *  - a NON-LINEAR slider (fine steps at small widths, still reaching wide bands): px = MAX · t², t = slider / SLIDER_STEPS;
 *  - a number box for an exact value;
 *  - in Canvas mode (a vignette toward the page border), the same control in % of the page's SHORTER side, so "10 %"
 *    means the same look on any page size. It is converted to px when set (the engine stores px).
 */

/** Widest edge band the control sets (px). */
export const EDGE_WIDTH_MAX_PX = 2048;
/** Slider resolution (its `max`). */
export const EDGE_SLIDER_STEPS = 1000;
/** Widest Canvas-mode band (% of the shorter page side): 50 % reaches the middle of the page. */
export const EDGE_WIDTH_MAX_PCT = 50;

/** A typed / stored width → a valid px value (NaN / negative → 0, capped, whole px). */
export function clampEdgeWidthPx(px: number): number {
  return Number.isFinite(px) && px > 0 ? Math.min(EDGE_WIDTH_MAX_PX, Math.round(px)) : 0;
}

/** Slider position (0 … EDGE_SLIDER_STEPS) → px. */
export function edgeSliderToPx(slider: number): number {
  const t = Math.min(1, Math.max(0, (+slider || 0) / EDGE_SLIDER_STEPS));
  return clampEdgeWidthPx(EDGE_WIDTH_MAX_PX * t * t);
}

/** px → slider position (the inverse of edgeSliderToPx). */
export function edgePxToSlider(px: number): number {
  return Math.round(Math.sqrt(clampEdgeWidthPx(px) / EDGE_WIDTH_MAX_PX) * EDGE_SLIDER_STEPS);
}

/** px → % of the shorter page side (one decimal). */
export function edgePxToPct(px: number, pageMinSide: number): number {
  if (!(pageMinSide > 0)) return 0;
  return Math.round((clampEdgeWidthPx(px) / pageMinSide) * 1000) / 10;
}

/** % of the shorter page side → px. */
export function edgePctToPx(pct: number, pageMinSide: number): number {
  if (!(pageMinSide > 0)) return 0;
  const p = Math.min(EDGE_WIDTH_MAX_PCT, Math.max(0, +pct || 0));
  return clampEdgeWidthPx((p / 100) * pageMinSide);
}
