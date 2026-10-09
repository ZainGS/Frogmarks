/**
 * The .frogcart export's "Disc art" (Salsa docs/specs/frogcart-cd-art-and-launch.md Part B): what the cart's CD prints
 * on the Shell home — its seeded PATTERN (the default; ↻ re-rolls the seed), an IMAGE the user picks (cover-cropped,
 * drag to pan, pinch / slider to zoom) or a SNAPSHOT of the artboard.
 *
 * The engine side is optional: these types describe the Salsa API (ShapeManager.cartDisc + createCartDiscPreview,
 * 2026-10-09). An older engine build has neither: the dialog then hides the live preview and exports without art.
 */

export type CartDiscArtMode = 'pattern' | 'image' | 'snapshot';
export type CartDiscFamily = 'checker' | 'stripes' | 'dots';

export interface CartDiscFit { zoom: number; panX: number; panY: number }
export const CART_DISC_FIT_DEFAULT: Readonly<CartDiscFit> = Object.freeze({ zoom: 1, panX: 0, panY: 0 });

/** The live 3D disc preview (Salsa createCartDiscPreview). */
export interface CartDiscPreviewLike {
  setArt(art: Blob | null): Promise<boolean>;
  setPattern(seed: number, family?: CartDiscFamily): void;
  setFit(fit: CartDiscFit): void;
  /** The launch-preview hook (a pose override; null = the idle whirl). */
  setPose?(pose: unknown): void;
  /** Play the Shell's cart-launch motion on the disc once (flick, spin-up, back to idle) — newer Salsa builds. */
  playLaunchPreview?(opts?: { reducedMotion?: boolean }): void;
  /** The idle whirl's loop (the disc still redraws on a change while stopped). */
  start?(): void;
  stop?(): void;
  readonly running?: boolean;
  dispose(): void;
}

/** ShapeManager.cartDisc (Salsa cart-disc-tools.ts). */
export interface CartDiscToolsLike {
  cropRect(srcW: number, srcH: number, fit?: Partial<CartDiscFit> | null, aspect?: number): { sx: number; sy: number; sw: number; sh: number };
  panBy(fit: Partial<CartDiscFit> | null, srcW: number, srcH: number, dx: number, dy: number, aspect?: number): CartDiscFit;
  zoomTo(fit: Partial<CartDiscFit> | null, srcW: number, srcH: number, zoom: number, aspect?: number): CartDiscFit;
  clampFit(fit?: Partial<CartDiscFit> | null): CartDiscFit;
  guides(sizePx: number, holeRatio?: number): { cx: number; cy: number; outerR: number; holeR: number; safeR: number };
  renderArt(source: Blob, fit?: Partial<CartDiscFit> | null, opts?: { size?: number; mime?: 'image/webp' | 'image/png' }): Promise<Blob>;
  seedFromId(id: string): number;
  randomSeed(): number;
  MAX_ZOOM: number;
  /** Below 1 the image is smaller than the disc (newer Salsa builds; older ones stop at 1). */
  MIN_ZOOM?: number;
}

/** The engine members the dialog uses (all optional — feature-detected). */
export interface CartDiscEngine {
  cartDisc?: CartDiscToolsLike;
  createCartDiscPreview?(canvas: HTMLCanvasElement, opts?: { pattern?: { seed: number; family?: CartDiscFamily } | null; fit?: CartDiscFit | null }): CartDiscPreviewLike | null;
}

export function cartDiscEngine(sm: unknown): CartDiscEngine {
  return (sm ?? {}) as CartDiscEngine;
}

/** A 32-bit seed when the engine has none to give (a fresh random one, or a stable one for an id). */
export function fallbackDiscSeed(id?: string | null): number {
  if (!id) return Math.floor(Math.random() * 4294967296) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Pinch zoom: the new zoom when two fingers went from distance d0 to d1 (starting at zoom z0). */
export function pinchZoom(z0: number, d0: number, d1: number, maxZoom = 8, minZoom = 1): number {
  if (!(d0 > 0) || !(d1 > 0)) return z0;
  return Math.min(maxZoom, Math.max(minZoom, z0 * (d1 / d0)));
}

/** The zoom slider's steps (its `max`). */
export const DISC_ZOOM_STEPS = 1000;

/** Zoom slider position (0 … DISC_ZOOM_STEPS) → zoom. The middle (50 %) is 1 (the image covers the disc); up to
 *  maxZoom above it, down to minZoom below it — log scale on each half, so equal slides feel like equal zoom steps. */
export function discZoomFromSlider(pos: number, minZoom: number, maxZoom: number): number {
  const t = Math.min(1, Math.max(0, pos / DISC_ZOOM_STEPS));
  if (t >= 0.5) return Math.pow(Math.max(1, maxZoom), (t - 0.5) * 2);
  return Math.pow(Math.min(1, Math.max(1e-3, minZoom)), (0.5 - t) * 2);
}

/** zoom → slider position (the inverse of discZoomFromSlider). */
export function discSliderFromZoom(zoom: number, minZoom: number, maxZoom: number): number {
  const z = Math.min(Math.max(1, maxZoom), Math.max(Math.min(1, minZoom), zoom));
  let t = 0.5;
  if (z > 1 && maxZoom > 1) t = 0.5 + Math.log(z) / Math.log(maxZoom) / 2;
  else if (z < 1 && minZoom < 1) t = 0.5 - Math.log(z) / Math.log(minZoom) / 2;
  return Math.round(t * DISC_ZOOM_STEPS);
}

/** drawImage rects for a crop that may reach past the image (zoomed out): the source clipped to the image + the
 *  matching part of the W × H destination (null when nothing of the image is in the crop). */
export function discDrawRects(srcW: number, srcH: number, c: { sx: number; sy: number; sw: number; sh: number }, W: number, H: number):
  { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } | null {
  const x0 = Math.max(0, c.sx), y0 = Math.max(0, c.sy);
  const x1 = Math.min(srcW, c.sx + c.sw), y1 = Math.min(srcH, c.sy + c.sh);
  if (!(x1 > x0 && y1 > y0 && c.sw > 0 && c.sh > 0)) return null;
  const kx = W / c.sw, ky = H / c.sh;
  return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0, dx: (x0 - c.sx) * kx, dy: (y0 - c.sy) * ky, dw: (x1 - x0) * kx, dh: (y1 - y0) * ky };
}

/** The user-facing line under the Disc art field. */
export function discArtHint(mode: CartDiscArtMode, hasSource: boolean): string {
  if (mode === 'pattern') return '';   // (no helper line under Pattern)
  if (!hasSource) return mode === 'image' ? 'Choose an image for the disc.' : 'Capturing the artboard…';
  return 'Drag to move, pinch or use the slider to zoom. Nothing prints inside the clear centre ring.';
}

/** Decode a picked file's size (null = not an image this browser can open). */
export async function decodeDiscImage(blob: Blob): Promise<ImageBitmap | null> {
  try { return await createImageBitmap(blob); } catch { return null; }
}
