/** Pure helpers for the Ephemera panel (UI review 2026-10-07 §2b / §3 item 11). */

/** A readable name for a generator id when the engine has no display name for it: 'barcode:code128' → 'Barcode Code128'. */
export function fallbackEphemeraName(typeId: string): string {
  const words = (typeId || '').split(/[:_\-\s]+/).filter(Boolean);
  if (!words.length) return 'Ephemera';
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * One label per placement, in list order: the generator's display name, numbered from the second of a kind
 * ("Code 128", "Code 128 2", …) so rows can be told apart. `nameOf` returns the display name (or nothing).
 */
export function ephemeraPlacementLabels(
  placements: ReadonlyArray<{ typeId: string }>,
  nameOf: (typeId: string) => string | null | undefined,
): string[] {
  const seen = new Map<string, number>();
  return placements.map(p => {
    const base = nameOf(p.typeId)?.trim() || fallbackEphemeraName(p.typeId);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  });
}

/** A size in world units with up to 2 decimals and no trailing zeros: 0.6783 → '0.68', 2 → '2', 1.5 → '1.5'. */
export function formatEphemeraUnits(v: number): string {
  if (!Number.isFinite(v)) return '–';
  const r = Math.round(v * 100) / 100;
  if (r === 0 && v !== 0) return v > 0 ? '<0.01' : '>-0.01';
  return String(r);
}

/** 'W × H' for a placement row. */
export function formatEphemeraSize(w: number, h: number): string {
  return `${formatEphemeraUnits(w)} × ${formatEphemeraUnits(h)}`;
}

/** Smallest W / H a placement may be given in the panel (world units — a placement is ~0.1–2 units across). */
export const EPHEMERA_MIN_SIZE = 0.01;

/** Clamp a typed W / H to {@link EPHEMERA_MIN_SIZE} (empty / invalid input keeps `fallback`). */
export function clampEphemeraSize(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(EPHEMERA_MIN_SIZE, n);
}

/**
 * The top-left (x, y — the placement's minimum corner in y-up world units) that centres a `w` × `h` placement on
 * `centre`. Placements store their minimum corner, so the centre is (x + w/2, y + h/2).
 */
export function placementOriginForCentre(centre: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
  return { x: centre.x - w / 2, y: centre.y - h / 2 };
}

/**
 * The centre (CSS px, relative to the canvas) of the part of the canvas no right-side panel covers. `coveredFromLeft`
 * are the left edges (viewport px) of panels docked on the right that overlap the canvas.
 */
export function visibleCanvasCentre(
  canvas: { left: number; top: number; width: number; height: number },
  coveredFromLeft: number[],
): { x: number; y: number } {
  const right = canvas.left + canvas.width;
  const edges = coveredFromLeft.filter(x => x > canvas.left + 40 && x < right);
  const visRight = edges.length ? Math.min(...edges) : right;
  return { x: (visRight - canvas.left) / 2, y: canvas.height / 2 };
}

/**
 * One visibility condition from a generator's param schema (`showIf`, Salsa ephemera-types.ts — kept in step with
 * `isEphemeraParamVisible` there; the host can't import it from an older dist). Values compare as strings, so a
 * select's '4' matches 4.
 */
export interface EphemeraParamCondition {
  key: string;
  equals?: string | number | boolean | Array<string | number | boolean>;
  notEquals?: string | number | boolean | Array<string | number | boolean>;
  truthy?: boolean;
}

function asStrings(v: unknown): string[] {
  return (Array.isArray(v) ? v : [v]).map(x => String(x));
}

/**
 * Whether a param row should be shown for the current params (UI dead-controls audit 2026-10-09): rows whose
 * generator ignores them in this state (Badge Points for a circle, Rainbow Bands for a smooth gradient, …) are
 * hidden. No `showIf` = always shown. A missing value falls back to the schema default.
 */
export function isEphemeraParamShown(
  entry: { showIf?: EphemeraParamCondition | EphemeraParamCondition[] },
  params: Record<string, unknown>,
  schema: ReadonlyArray<{ key: string; default?: unknown }> = [],
): boolean {
  const cond = entry?.showIf;
  if (!cond) return true;
  for (const c of Array.isArray(cond) ? cond : [cond]) {
    if (!c || typeof c.key !== 'string') continue;
    let v = params?.[c.key];
    if (v === undefined) v = schema.find(s => s.key === c.key)?.default;
    if (c.equals !== undefined && !asStrings(c.equals).includes(String(v))) return false;
    if (c.notEquals !== undefined && asStrings(c.notEquals).includes(String(v))) return false;
    if (c.truthy !== undefined && Boolean(v) !== c.truthy) return false;
  }
  return true;
}
