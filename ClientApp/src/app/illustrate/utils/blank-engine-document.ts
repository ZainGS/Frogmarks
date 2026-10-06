import ShapeManager from '@zaings/salsa/shape-manager';

/**
 * Salsa's ShapeManager outlives every document (one per page), so a document that has nothing saved yet — a New
 * Illustration, a new Shell project — would otherwise open on top of whatever the previous document left in the engine
 * (layers + pixels, shapes, 3D, characters, city, settings, undo …) and save it as its own. The editor calls this
 * before every document load: the load then starts from a blank engine, and a document with no saved data stays blank.
 */

/** Salsa's blank-document entry point (salsa src/services/shape-manager.ts startBlankDocument). Optional so this
 *  compiles against a Salsa build that predates it; rebuild Salsa to get the complete reset. */
interface BlankDocumentApi {
  startBlankDocument(docId?: string, name?: string, opts?: { documentSize?: { w: number; h: number } | null }): Promise<void>;
}

type DocumentPayload = Parameters<ShapeManager['restoreDocument']>[0];

/** The empty-document payload for a Salsa build without startBlankDocument. That build keeps the previous layers when
 *  the manifest lists none, so the default stack is listed explicitly ('Vector' on top of 'Background', fresh ids). */
export function legacyBlankPayload(docId: string, name: string, ditherConfig: unknown): DocumentPayload {
  const now = new Date().toISOString();
  const layer = (id: string, layerName: string, type: string) => ({
    id, name: layerName, type, visible: true, locked: false, opacity: 1, blendMode: 'normal', clipped: false,
    lockTransparency: false, celIds: [], animationType: 'static' as const,
  });
  const rnd = () => Math.random().toString(36).slice(2, 10);
  return {
    manifest: {
      version: 3, docId, name, createdAt: now, savedAt: now, canvasWidth: 1024, canvasHeight: 768, documentSize: null,
      layers: [layer('vector_' + rnd(), 'Vector', 'vector'), layer('layer_' + rnd(), 'Background', 'layer')],
      animation: null,
      globalDitherConfig: ditherConfig,
      canvasGrid: { visible: false, color: [0.5, 0.5, 0.55], opacity: 0.35, cells: 16 },
      pixelFormat: 'png',
    },
    sceneGraphJSON: JSON.stringify({ root: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 0, visible: true, locked: false, children: [] } }),
    brushPresetsJSON: null,
    layers: [],
    cels: [],
    scene3dJSON: null,
    ephemeraJSON: JSON.stringify({ version: 2, sheets: [], placements: {} }),
    garpJSON: null,
    uiLayersJSON: null,
  } as DocumentPayload;
}

/**
 * Replace the engine's document with a blank one. `docKey` = the new document's Salsa id when known (local documents:
 * `local-<uuid>`); omitted = no id until the load / autosave binds one, so nothing can be saved into the previous
 * document meanwhile. Never throws (a failure is logged; the load that follows still runs).
 */
export async function startBlankEngineDocument(sm: ShapeManager, docKey?: string, name = 'Untitled'): Promise<void> {
  const engine = sm as ShapeManager & Partial<BlankDocumentApi>;
  try {
    if (typeof engine.startBlankDocument === 'function') {
      await engine.startBlankDocument(docKey, name);
      return;
    }
    // Older Salsa build: the same full-replacement restore, with what that build doesn't reset done by hand.
    sm.setCurrentDocId(docKey ?? '', name);
    const dither = { ...(sm.getDitherConfig() as object), enabled: false };
    await sm.restoreDocument(legacyBlankPayload(docKey ?? '', name, dither));
    sm.setAnimationEnabled(false);
    sm.setFrameCount(1);
    sm.setFps(12);
    sm.setLoopMode('loop');
    sm.setPlayRange(1, 1);
  } catch (e) {
    console.warn('[load] starting a blank document failed — the previous document may still be showing', e);
  }
}
