/**
 * Perf audit A4 (2026-10-09): rebuild an animated layer's cels from a saved document (.frog import / cloud load)
 * EXACTLY — saved ids, start frames, hold durations, key / inbetween — each with its own pixels.
 *
 * The old path re-added cels with `addCelAtFrame(frame)` only: hold durations / types / ids were lost, every add split
 * the first cel's hold (Salsa then shared one texture across frames — audit A1), and the cel pixels came back blank
 * (the layer import wrote every cel image into the single layer texture). Salsa builds that predate
 * `ShapeManager.restoreLayerCelsFromDataURLs` keep the old path (typeof-guarded).
 */

/** A saved cel (CelStateDto / the .frog manifest's cel entries). `duration` may be missing in older files. */
export interface SavedCel {
  celId: string;
  frame: number;
  duration?: number | null;
  celType?: string | null;
  isKey?: boolean | null;
}

export interface CelRestoreSpec {
  celId: string;
  startFrame: number;
  duration: number;
  celType: 'key' | 'inbetween';
  imageData?: string;
}

/** The engine call (Salsa ShapeManager, 2026-10-09+). */
type RestoreCelsFn = (layerId: string, cels: CelRestoreSpec[]) => Promise<string[]>;

/** Saved cels → engine specs. A cel without a saved duration holds until the next cel (or the end of the timeline),
 *  as the old import made it. `imageByCelId`: each cel's pixels as a data URL (absent = a blank cel). */
export function celRestoreSpecs(
  cels: readonly SavedCel[],
  frameCount: number,
  imageByCelId: ReadonlyMap<string, string>,
): CelRestoreSpec[] {
  const sorted = [...cels].sort((a, b) => (a.frame ?? 1) - (b.frame ?? 1));
  return sorted.map((c, i) => {
    const startFrame = Math.max(1, Math.round(c.frame ?? 1));
    const next = sorted[i + 1];
    const fallback = next ? Math.max(1, Math.round(next.frame) - startFrame) : Math.max(1, frameCount - startFrame + 1);
    const duration = c.duration && c.duration > 0 ? Math.round(c.duration) : fallback;
    const celType: 'key' | 'inbetween' = c.celType === 'inbetween' || (c.celType == null && c.isKey === false) ? 'inbetween' : 'key';
    const imageData = imageByCelId.get(c.celId);
    return imageData ? { celId: c.celId, startFrame, duration, celType, imageData } : { celId: c.celId, startFrame, duration, celType };
  });
}

/** The engine's exact cel restore, or null on a Salsa build without it. */
export function engineCelRestore(sm: unknown): RestoreCelsFn | null {
  const fn = (sm as { restoreLayerCelsFromDataURLs?: unknown } | null | undefined)?.restoreLayerCelsFromDataURLs;
  return typeof fn === 'function' ? (fn as RestoreCelsFn).bind(sm) : null;
}

/**
 * Restore one animated layer's cels: the exact engine restore when available, else the old addCelAtFrame loop.
 * The caller has already marked the layer animated and set the frame count.
 */
export async function restoreAnimatedLayerCels(
  sm: unknown,
  addCelAtFrame: (layerId: string, frame: number) => unknown,
  layerId: string,
  cels: readonly SavedCel[],
  frameCount: number,
  imageByCelId: ReadonlyMap<string, string>,
): Promise<void> {
  const restore = engineCelRestore(sm);
  if (restore) {
    await restore(layerId, celRestoreSpecs(cels, frameCount, imageByCelId));
    return;
  }
  for (const cel of cels) addCelAtFrame(layerId, cel.frame);
}

/** Import entries (importRasterLayersFromDataURLs) → each cel's image by cel id. */
export function celImagesFromImportEntries(entries: ReadonlyArray<{ celId?: string; imageData?: string }>): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) if (e.celId && e.imageData) out.set(e.celId, e.imageData);
  return out;
}
