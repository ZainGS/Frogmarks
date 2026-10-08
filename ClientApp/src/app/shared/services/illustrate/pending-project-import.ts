import type { FrogmarksEditorState } from './frogmarks-package';

/**
 * A .frogmarks file the Shell's Import picked, handed to the editor that is about to open the NEW local document made
 * for it. The editor restores it in place of loading (IllustrationPersistenceService.loadIllustrationV2) and saves it.
 *
 * In memory and one-shot, matched by the document's uuid (like fresh-local-document.ts, and for the same reason not
 * router / history state: a File can't go there, and an import must not re-run on a reload — after a reload the
 * document opens as what was saved of it). Expires so a navigation that never happened doesn't hold the file.
 */
export interface PendingProjectImport {
  uuid: string;
  file: Blob;
  editorState: FrogmarksEditorState | null;
}

const TTL_MS = 5 * 60_000;

let _pending: { entry: PendingProjectImport; at: number } | null = null;

/** The Shell: `file` is the content of the just-created document `uuid`. */
export function setPendingProjectImport(entry: PendingProjectImport, now = Date.now()): void {
  _pending = { entry, at: now };
}

/** The editor: the file for `uuid`, once. Null for any other document, a second ask, or a stale hand-off. */
export function takePendingProjectImport(uuid: string | null | undefined, now = Date.now()): PendingProjectImport | null {
  const p = _pending;
  if (!p || !uuid || p.entry.uuid !== uuid) return null;
  _pending = null;
  return now - p.at <= TTL_MS && now >= p.at ? p.entry : null;
}

export function clearPendingProjectImport(): void { _pending = null; }
