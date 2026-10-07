/**
 * Non-linear brush-size slider (UI review 2026-10-07 §3 item 9): a 1–500 px linear slider spends almost all of its
 * travel above 50 px, so the sizes an artist uses most (1–40 px) sat in its first few pixels. The slider position
 * t ∈ [0, SIZE_SLIDER_STEPS] maps to size = min + (max − min)·(t/steps)^POWER, so the first half covers ~1–90 px.
 */
export const SIZE_SLIDER_STEPS = 1000;
export const SIZE_SLIDER_MIN = 1;
export const SIZE_SLIDER_MAX = 500;
const POWER = 2.5;

/** Slider position → brush size in whole px. */
export function sizeFromSlider(t: number, min = SIZE_SLIDER_MIN, max = SIZE_SLIDER_MAX): number {
  const u = Math.min(1, Math.max(0, (Number(t) || 0) / SIZE_SLIDER_STEPS));
  return Math.round(min + (max - min) * Math.pow(u, POWER));
}

/** Brush size → slider position (the inverse, rounded to a step). */
export function sliderFromSize(size: number, min = SIZE_SLIDER_MIN, max = SIZE_SLIDER_MAX): number {
  const s = Math.min(max, Math.max(min, Number(size) || min));
  const u = Math.pow((s - min) / (max - min), 1 / POWER);
  return Math.round(u * SIZE_SLIDER_STEPS);
}
