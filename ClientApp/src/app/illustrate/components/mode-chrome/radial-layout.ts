/**
 * Geometry of the long-press radial menu (mode-radial-menu.component): items on a ring around the press point, the
 * ring moved inside the viewport, and which item a release / drag direction points at.
 */

export interface RadialLayoutInput {
  count: number;
  /** The press point (client px). */
  x: number;
  y: number;
  viewportW: number;
  viewportH: number;
  /** Item box (CSS px). Default 72 × 52 (52 px tall touch targets with a label). */
  itemW?: number;
  itemH?: number;
  /** Kept free between the ring's items and the viewport edge. Default 8. */
  margin?: number;
  /** Smallest ring radius (item centres). Default 78. */
  minRadius?: number;
  /** Extra room above the ring for the title. Default 0. */
  titleH?: number;
}

export interface RadialLayout {
  /** Ring centre after clamping (client px). */
  cx: number;
  cy: number;
  radius: number;
  /** Item centres (client px) and their angle (radians, 0 = right, clockwise on screen; the first item is at the top). */
  items: { x: number; y: number; angle: number }[];
}

export const RADIAL_ITEM_W = 72;
export const RADIAL_ITEM_H = 52;
/** The centre ✕ button / the dead zone in which a release picks nothing. */
export const RADIAL_CENTER_R = 26;

/** Ring radius for `count` items of width `itemW` (they do not overlap, never below `minRadius`). */
export function radialRadius(count: number, itemW = RADIAL_ITEM_W, minRadius = 78): number {
  if (count <= 1) return minRadius;
  // Neighbouring centres are 2r·sin(π/n) apart: keep them an item width + 6 px apart.
  const need = (itemW + 6) / (2 * Math.sin(Math.PI / count));
  return Math.max(minRadius, Math.ceil(need));
}

function clampAxis(v: number, lo: number, hi: number, size: number): number {
  if (hi < lo) return size / 2;   // the viewport is smaller than the ring: centre it
  return Math.min(hi, Math.max(lo, v));
}

export function computeRadialLayout(inp: RadialLayoutInput): RadialLayout {
  const n = Math.max(0, Math.floor(inp.count));
  const itemW = inp.itemW ?? RADIAL_ITEM_W, itemH = inp.itemH ?? RADIAL_ITEM_H;
  const margin = inp.margin ?? 8, titleH = inp.titleH ?? 0;
  const radius = radialRadius(n, itemW, inp.minRadius ?? 78);
  const ex = radius + itemW / 2 + margin;
  const eyTop = radius + itemH / 2 + margin + titleH, eyBottom = radius + itemH / 2 + margin;
  const cx = clampAxis(inp.x, ex, inp.viewportW - ex, inp.viewportW);
  const cy = clampAxis(inp.y, eyTop, inp.viewportH - eyBottom, inp.viewportH);
  const items = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    items.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), angle });
  }
  return { cx, cy, radius, items };
}

/** Smallest absolute difference between two angles (radians, 0..π). */
function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/**
 * The item a pointer at (px, py) points at: the one whose direction from the centre is nearest, or -1 inside the
 * centre dead zone (or with no items). `skip` items (disabled) are never picked.
 */
export function radialPickIndex(layout: RadialLayout, px: number, py: number, deadZone = RADIAL_CENTER_R,
                                skip?: (i: number) => boolean): number {
  const dx = px - layout.cx, dy = py - layout.cy;
  if (!layout.items.length || Math.hypot(dx, dy) < deadZone) return -1;
  const a = Math.atan2(dy, dx);
  let best = -1, bestD = Infinity;
  layout.items.forEach((it, i) => {
    if (skip?.(i)) return;
    const d = angleDiff(a, it.angle);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
