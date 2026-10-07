import type { AutoSaveState } from 'app/shared/services/raster/raster-autosave.service';

/**
 * The top bar's save status (UI review 2026-10-07 §3 item 5): plain words instead of the ⬡ / ☁️ / ⟳ glyphs.
 *
 *  - **Saved ✓** — nothing is waiting (or it was just written).
 *  - **Saving…** — a save is running, or a change waits in the ~2 s autosave debounce (it goes out on its own).
 *  - **Not saved** — the change will NOT go out by itself: the last save failed (tap to retry), saving is paused
 *    (partial load / newer version / another tab saved), autosave is unavailable in this browser mode, or there is no
 *    document to save into (it was not found).
 * The tooltip says where it is saved (this device / the cloud) or why it is not.
 */
export type SaveStatusKind = 'saved' | 'saving' | 'not-saved';

export interface SaveStatusInput {
  /** The engine's local autosave (RasterAutoSaveService.state$). */
  autoSave: AutoSaveState;
  /** A document save is running, queued, or a change waits in the debounce (IllustrationPersistenceService). */
  pending: boolean;
  /** The document is still loading (saves are suppressed; nothing has changed yet). */
  loading: boolean;
  /** No document is bound: the one in the URL was not found. */
  missing: boolean;
  /** Saving is paused (Salsa's save block after a partial load, or a cloud conflict). */
  paused: boolean;
  /** 0 = cloud, 1 = no-cloud, 2 = this browser only. */
  syncMode: number;
}

export interface SaveStatus {
  kind: SaveStatusKind;
  label: string;
  title: string;
  /** A tap retries the save. */
  retry: boolean;
}

export function saveStatusOf(s: SaveStatusInput): SaveStatus {
  const where = s.syncMode === 0 ? 'to the cloud' : 'on this device';
  if (s.missing) return notSaved('This document was not found, so nothing here can be saved.');
  if (s.paused) return notSaved('Saving is paused — see the message at the top of the editor.');
  if (s.autoSave === 'error') return { kind: 'not-saved', label: 'Not saved', title: 'The last save failed. Tap to try again (Ctrl+S).', retry: true };
  // (A cloud document still saves to the server without the local copy.)
  if (s.autoSave === 'unavailable' && s.syncMode !== 0) {
    return notSaved('Auto-save is not available in this browser mode (a private window?). Use File › Save .frogmarks… to keep your work.');
  }
  if (s.loading) return { kind: 'saved', label: 'Saved ✓', title: 'Opening…', retry: false };
  if (s.autoSave === 'saving' || s.pending) return { kind: 'saving', label: 'Saving…', title: `Saving ${where}…`, retry: false };
  return { kind: 'saved', label: 'Saved ✓', title: `All changes are saved ${where}.`, retry: false };
}

function notSaved(title: string): SaveStatus {
  return { kind: 'not-saved', label: 'Not saved', title, retry: false };
}
