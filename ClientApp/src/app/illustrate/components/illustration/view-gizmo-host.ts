/**
 * The editor's side of Salsa's 3D nav gizmo (the X / Y / Z axis widget in the canvas corner). Salsa puts it on
 * document.body, so it is NOT removed with the editor's DOM: leaving the illustration with a 3D camera mode on left it
 * floating over the Shell / dashboard / board (2026-10-07). The engine now also hides it when its canvas goes away and
 * disposes it on a canvas swap, but the editor releases it explicitly on leave so this holds with an older Salsa dist.
 *
 * Every call is typeof-guarded: setViewGizmoHidden3D is new in Salsa (2026-10-07); disableViewGizmo3D is older.
 */

/** The ShapeManager surface used here (optional members: the dist may predate them). */
export interface ViewGizmoEngine {
  disableViewGizmo3D?: () => void;
  setViewGizmoHidden3D?: (hidden: boolean) => void;
}

/** Hide the gizmo with the editor's own chrome: Toggle UI (X) and the read-only viewer. */
export function syncViewGizmoHidden(sm: ViewGizmoEngine | null | undefined, hidden: boolean): void {
  if (typeof sm?.setViewGizmoHidden3D === 'function') sm.setViewGizmoHidden3D(hidden);
}

/** Leaving the editor (ngOnDestroy): drop the gizmo and its window listeners now, and clear the host hide so the next
 *  host that shows one (the package editor's creator stage) isn't left with this editor's Toggle UI state. The next
 *  illustration re-creates the gizmo from its document's view mode when it loads. */
export function releaseViewGizmo(sm: ViewGizmoEngine | null | undefined): void {
  if (!sm) return;
  try {
    syncViewGizmoHidden(sm, false);
    if (typeof sm.disableViewGizmo3D === 'function') sm.disableViewGizmo3D();
  } catch (e) {
    console.warn('[illustration] view gizmo release failed', e);
  }
}
