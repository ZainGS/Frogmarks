/**
 * Pure rules of the app-update prompt (AppUpdateService + its two surfaces). Specs: app-update.logic.spec.ts.
 *
 * - The update is NEVER applied by itself: a new version waits until the user taps Reload (Shell) or Update ready
 *   (editor).
 * - The Shell shows a popup; the editor only a small menubar button (it never interrupts a drawing).
 * - Applying an update first flushes every open document's pending save; if anything is still unsaved afterwards
 *   the reload does not happen.
 */

/** none = up to date; ready = a new version is downloaded and waits; unrecoverable = the running version's files are
 *  gone from the cache (Angular's UNRECOVERABLE_STATE): lazy chunks may fail to load, a reload is needed. */
export type UpdateState = 'none' | 'ready' | 'unrecoverable';

/** Where the prompt is shown. */
export type UpdateSurface = 'shell' | 'editor';

/** What a surface shows: the Shell popup, the editor's menubar button, or nothing. */
export type UpdatePromptKind = 'popup' | 'menubar-button' | 'none';

/**
 * The prompt a surface shows. The Shell shows the popup unless the user said "Later" for this version (an
 * unrecoverable state can't be put off); the editor shows its menubar button and never a popup.
 */
export function updatePromptFor(surface: UpdateSurface, state: UpdateState, dismissedOnShell: boolean): UpdatePromptKind {
  if (state === 'none') return 'none';
  if (surface === 'editor') return 'menubar-button';
  return state === 'ready' && dismissedOnShell ? 'none' : 'popup';
}

/** Result of AppUpdateService.applyUpdate(). */
export type ApplyUpdateResult = 'reloading' | 'unsaved' | 'busy' | 'none';

/**
 * After the pending saves were flushed: reload only when there is an update and nothing is still unsaved. An
 * unrecoverable state also waits for the save (the documents are in memory, intact; only lazy files are missing).
 */
export function reloadDecision(state: UpdateState, unsavedAfterFlush: boolean): 'reload' | 'unsaved' | 'none' {
  if (state === 'none') return 'none';
  return unsavedAfterFlush ? 'unsaved' : 'reload';
}

/** The popup's / button's main line. `latest` = the new version's APP_VERSION (ngsw.json appData), when known. */
export function updatePromptText(state: UpdateState, latest: string | null, current: string): string {
  if (state === 'unrecoverable') return 'Frogmarks needs to reload to finish an update.';
  if (state !== 'ready') return '';
  return latest && latest !== current ? `New version available: v${current} → v${latest}` : 'New version available';
}

/** Label of the editor's menubar button. */
export function updateButtonLabel(state: UpdateState, applying: boolean, blockedByUnsaved: boolean): string {
  if (applying) return 'Saving…';
  if (blockedByUnsaved) return 'Not saved: retry update';
  return state === 'unrecoverable' ? 'Reload needed' : 'Update ready';
}

/** How often a running app looks for a new version, and the least time between two checks on tab focus. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
export const UPDATE_CHECK_MIN_GAP_MS = 60 * 1000;

/** A check is due on visibilitychange → visible when the last one is at least UPDATE_CHECK_MIN_GAP_MS old. */
export function updateCheckDue(nowMs: number, lastCheckMs: number | null): boolean {
  return lastCheckMs === null || nowMs - lastCheckMs >= UPDATE_CHECK_MIN_GAP_MS;
}
