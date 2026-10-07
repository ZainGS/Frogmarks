/**
 * Keeps an Escape meant for a dialog away from the Shell behind it (UI review 2026-10-07 §1 #7).
 *
 * Salsa's Shell listens for Escape on `window` (Illustrations grid → home). Pressed in a Material dialog it closed
 * the dialog AND flipped the grid. Newer Salsa builds ignore a consumed Escape themselves (shell-escape-guard.ts);
 * this host-side guard does the same on any Salsa build: a `document` keydown listener runs after the CDK's
 * (document.body) one and before the window's, and stops the Escape there when
 *  - the host's own modal is open (it closes that modal instead), or
 *  - the event was already consumed (`defaultPrevented`: the CDK dialog prevents the Escape it closes on), or
 *  - any modal is open in the page (a CDK backdrop, an `aria-modal` dialog, an open `<dialog>`).
 */

export const HOST_MODAL_SELECTOR = '.cdk-overlay-backdrop-showing, [aria-modal="true"], dialog[open]';

export interface ShellEscapeGuardOptions {
  /** Is the host's own modal (e.g. the Shell Settings overlay) open? */
  hostModalOpen(): boolean;
  /** Close it (the Escape is then consumed). */
  closeHostModal(): void;
}

/** Install the guard; returns the uninstall function. */
export function installShellEscapeGuard(doc: Document, opts: ShellEscapeGuardOptions): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (opts.hostModalOpen()) {
      opts.closeHostModal();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    let modal = false;
    try { modal = !!doc.querySelector(HOST_MODAL_SELECTOR); } catch { /* no DOM */ }
    if (e.defaultPrevented || modal) e.stopPropagation();
  };
  doc.addEventListener('keydown', onKeyDown);
  return () => doc.removeEventListener('keydown', onKeyDown);
}
