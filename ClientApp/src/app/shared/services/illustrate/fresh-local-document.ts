import type { LocalIllustration } from './local-illustration.service';

/**
 * A local-only document the Shell created a moment ago, handed to the editor that is about to open it.
 *
 * StudioComponent writes the IndexedDB record and navigates straight away; the editor would then read that same
 * record back (`getByUuid`) and probe OPFS for a saved copy that cannot exist yet. With this hand-off the editor takes
 * the record it was given and skips both lookups.
 *
 * Deliberately NOT router / history state: `window.history.state` survives a page reload, and a "nothing saved yet"
 * flag that outlived the first save would make the editor skip loading real work. This is in-memory, one-shot
 * (taking it clears it), matched by uuid and short-lived — after a reload, or for any other document, the editor
 * takes its normal load path.
 */
const TTL_MS = 30_000;

let _fresh: { record: LocalIllustration; at: number } | null = null;

/** The Shell: this record was just created (nothing saved under it) and is about to be opened. */
export function markFreshLocalDocument(record: LocalIllustration, now = Date.now()): void {
  _fresh = { record, at: now };
}

/** The editor: the just-created record for `uuid`, once. Null for any other document, a second ask, or a stale mark. */
export function takeFreshLocalDocument(uuid: string | null | undefined, now = Date.now()): LocalIllustration | null {
  const f = _fresh;
  if (!f || !uuid || f.record.uuid !== uuid) return null;
  _fresh = null;
  return now - f.at <= TTL_MS && now >= f.at ? f.record : null;
}

/** Drop a pending mark (the navigation did not happen). */
export function clearFreshLocalDocument(): void { _fresh = null; }
