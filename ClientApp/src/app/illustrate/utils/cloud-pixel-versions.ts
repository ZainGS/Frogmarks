/**
 * Cloud upload dirtiness from Salsa's per-layer / per-cel CONTENT VERSIONS (mobile-parity 7.3c).
 *
 * The cloud save re-uploads a layer only when its pixels changed. It used to learn that from brush-stroke ends only, so
 * a fill, undo / redo, paste, transform, text stamp, move, clear, filter, merge or duplicate on a layer that was already
 * uploaded never reached the server until the next stroke on that layer. Salsa now reports every pixel write
 * (`sm.getRasterContentVersions()`: an opaque string per paint layer / cel that changes on any write to it, and on
 * EVERY layer when a write's target is unknown). We remember the version each layer / cel had when it was last
 * uploaded and upload again when it differs.
 *
 * Old Salsa dist (no such API): readContentVersions returns null and the caller keeps its stroke-based dirty set.
 */

export type RasterContentVersions = { seq: number; layers: Record<string, string>; cels: Record<string, string> };

type ContentVersionApi = {
  getRasterContentVersions?: () => RasterContentVersions;
  exportRasterCelToBlob?: (celId: string, type?: 'image/webp' | 'image/png') => Promise<Blob | null>;
};

/** The Salsa dist has the content-version API (no call made). */
export function hasContentVersionApi(sm: unknown): boolean {
  return typeof (sm as ContentVersionApi | null)?.getRasterContentVersions === 'function';
}

/** The engine's content versions, or null on a Salsa dist without the API (or when the call fails). */
export function readContentVersions(sm: unknown): RasterContentVersions | null {
  const api = sm as ContentVersionApi | null;
  if (typeof api?.getRasterContentVersions !== 'function') return null;
  try {
    const v = api.getRasterContentVersions();
    return v && v.layers && v.cels ? v : null;
  } catch { return null; }
}

/** Salsa's per-cel export (each cel from its OWN texture), or null on an older dist. */
export function celExporter(sm: unknown): ((celId: string) => Promise<Blob | null>) | null {
  const api = sm as ContentVersionApi | null;
  const fn = api?.exportRasterCelToBlob;
  return typeof fn === 'function' ? (celId: string) => fn.call(api, celId, 'image/webp') : null;
}

/** True when any layer / cel version differs between two reads (added or removed entries count). */
export function contentVersionsDiffer(a: RasterContentVersions, b: RasterContentVersions): boolean {
  return mapsDiffer(a.layers, b.layers) || mapsDiffer(a.cels, b.cels);
}

function mapsDiffer(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return true;
  for (const k of bk) if (a[k] !== b[k]) return true;
  return false;
}

/** The content version of each layer / cel as of its last successful cloud upload. */
export class CloudUploadVersions {
  private readonly layers = new Map<string, string>();
  private readonly cels = new Map<string, string>();

  clear(): void { this.layers.clear(); this.cels.clear(); }

  /** Upload the layer again: never recorded, or its version moved (or the engine doesn't list it: fail safe). */
  layerChanged(v: RasterContentVersions, layerId: string): boolean {
    const now = v.layers[layerId];
    return now === undefined || this.layers.get(layerId) !== now;
  }

  celChanged(v: RasterContentVersions, celId: string): boolean {
    const now = v.cels[celId];
    return now === undefined || this.cels.get(celId) !== now;
  }

  /** Record the version read BEFORE the export that was uploaded (a write during the upload then differs next time). */
  recordLayer(layerId: string, version: string | undefined): void { if (version !== undefined) this.layers.set(layerId, version); }
  recordCel(celId: string, version: string | undefined): void { if (version !== undefined) this.cels.set(celId, version); }

  /** Any layer / cel uploaded before whose pixels changed since (what a flush before leaving must still send). */
  anyChanged(v: RasterContentVersions): boolean {
    for (const [id, ver] of this.layers) if (id in v.layers && v.layers[id] !== ver) return true;
    for (const [id, ver] of this.cels) if (id in v.cels && v.cels[id] !== ver) return true;
    return false;
  }
}
