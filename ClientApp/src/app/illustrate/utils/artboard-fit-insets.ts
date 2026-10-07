/**
 * Fit the artboard into the part of the canvas the editor UI does NOT cover (ui-review 2026-10-07 #10: on a tablet in
 * portrait the page was centred in the full canvas, a third of it under the right panel, and Fit kept 85 %).
 *
 * visibleCanvasInsets() turns the on-screen UI rectangles (rail, open tool sub-panel, right panel, timeline, top bar,
 * colour picker) into one inset per canvas side. computeArtboardFitFallback() is the same math as Salsa's
 * ShapeManager.fitArtboard(insets) (salsa src/services/artboard-fit.ts), used while the linked engine build predates
 * that parameter.
 */

export interface CanvasInsets { top: number; right: number; bottom: number; left: number; }
export interface RectLike { left: number; top: number; right: number; bottom: number; }

/** The fit fills this share of the visible area (Salsa ARTBOARD_FIT_FILL; the old fixed zoom was 0.85 of the canvas). */
export const ARTBOARD_FIT_FILL = 0.85;
/** Insets that would leave less than this many CSS px visible on an axis are ignored on that axis (same as Salsa). */
const MIN_VISIBLE_PX = 64;

/**
 * Insets (CSS px, per canvas side) that keep every obstacle off the visible area. Each obstacle is pushed to the side
 * that costs the artboard the least (an artboard of `docAspect` fitted into what remains), so a bottom-left block such
 * as the colour picker becomes a left inset for a tall page and a bottom inset for a wide one. Obstacles are taken
 * largest first; ones outside the canvas or already outside the visible area are skipped.
 */
export function visibleCanvasInsets(canvas: RectLike, obstacles: RectLike[], docAspect: number): CanvasInsets {
  const cw = canvas.right - canvas.left, ch = canvas.bottom - canvas.top;
  const ins: CanvasInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!(cw > 0) || !(ch > 0)) return ins;
  const aspect = docAspect > 0 && Number.isFinite(docAspect) ? docAspect : 1;
  const score = (i: CanvasInsets) => {
    const w = cw - i.left - i.right, h = ch - i.top - i.bottom;
    return w <= 0 || h <= 0 ? -1 : Math.min(h, w / aspect);
  };
  const rects = obstacles
    .map(r => ({   // clipped to the canvas, canvas-relative
      left: Math.max(0, r.left - canvas.left), right: Math.min(cw, r.right - canvas.left),
      top: Math.max(0, r.top - canvas.top), bottom: Math.min(ch, r.bottom - canvas.top),
    }))
    .filter(r => r.right - r.left >= 1 && r.bottom - r.top >= 1)
    .sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top));
  for (const r of rects) {
    // Already clear of the visible area?
    if (r.right <= ins.left || r.left >= cw - ins.right || r.bottom <= ins.top || r.top >= ch - ins.bottom) continue;
    const options: CanvasInsets[] = [
      { ...ins, left: Math.max(ins.left, r.right) },
      { ...ins, right: Math.max(ins.right, cw - r.left) },
      { ...ins, top: Math.max(ins.top, r.bottom) },
      { ...ins, bottom: Math.max(ins.bottom, ch - r.top) },
    ];
    let best = options[0], bestScore = score(best);
    for (const o of options.slice(1)) { const s = score(o); if (s > bestScore) { best = o; bestScore = s; } }
    if (bestScore > 0) Object.assign(ins, best);
  }
  return ins;
}

/** Where the fit puts the artboard (canvas-relative CSS px) for these insets: centred in the visible area, filling
 *  ARTBOARD_FIT_FILL of it on the limiting axis. */
export function fittedArtboardRect(cssWidth: number, cssHeight: number, ins: CanvasInsets, docAspect: number): RectLike {
  const visW = cssWidth - ins.left - ins.right, visH = cssHeight - ins.top - ins.bottom;
  const h = ARTBOARD_FIT_FILL * Math.max(0, Math.min(visH, visW / docAspect)), w = h * docAspect;
  const cx = ins.left + visW / 2, cy = ins.top + visH / 2;
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 };
}

/**
 * Insets for the docked UI (rail, panels, bars), plus the FLOATING bits (zoom box, drawer handle) only when the
 * artboard fitted without them would sit under one: a small box in a corner of the margin should not shift the page.
 */
export function fitInsetsWithFloating(canvas: RectLike, docked: RectLike[], floating: RectLike[], docAspect: number): CanvasInsets {
  const ins = visibleCanvasInsets(canvas, docked, docAspect);
  const cw = canvas.right - canvas.left, ch = canvas.bottom - canvas.top;
  const art = fittedArtboardRect(cw, ch, ins, docAspect > 0 ? docAspect : 1);
  const hits = floating.some(f => {
    const l = f.left - canvas.left, r = f.right - canvas.left, t = f.top - canvas.top, b = f.bottom - canvas.top;
    return r - l >= 1 && b - t >= 1 && l < art.right && r > art.left && t < art.bottom && b > art.top;
  });
  return hits ? visibleCanvasInsets(canvas, [...docked, ...floating], docAspect) : ins;
}

/** Zoom + pan (InteractionService units) that centre the artboard in the visible area: Salsa's computeArtboardFit. */
export function computeArtboardFitFallback(input: {
  cssWidth: number; cssHeight: number; pxWidth: number; pxHeight: number;
  docWidth: number; docHeight: number; insets?: Partial<CanvasInsets> | null;
}): { zoom: number; panX: number; panY: number } {
  const { cssWidth: cw, cssHeight: ch, pxWidth, pxHeight, docWidth, docHeight } = input;
  if (!(cw > 0) || !(ch > 0) || !(docWidth > 0) || !(docHeight > 0)) return { zoom: ARTBOARD_FIT_FILL, panX: 0, panY: 0 };
  const clamp = (v: number | undefined) => Math.max(0, Number.isFinite(v as number) ? (v as number) : 0);
  let left = clamp(input.insets?.left), right = clamp(input.insets?.right);
  let top = clamp(input.insets?.top), bottom = clamp(input.insets?.bottom);
  if (cw - left - right < MIN_VISIBLE_PX) { left = 0; right = 0; }
  if (ch - top - bottom < MIN_VISIBLE_PX) { top = 0; bottom = 0; }
  const visW = cw - left - right, visH = ch - top - bottom;
  // The artboard's height maps to the canvas height at zoom 1; a pan of p moves the view by p / 2 device px.
  const artH = ARTBOARD_FIT_FILL * Math.min(visH, visW / (docWidth / docHeight));
  const sx = pxWidth > 0 ? pxWidth / cw : 1, sy = pxHeight > 0 ? pxHeight / ch : 1;
  return {
    zoom: artH / ch,
    panX: 2 * (left + visW / 2 - cw / 2) * sx,
    panY: 2 * (top + visH / 2 - ch / 2) * sy,
  };
}
