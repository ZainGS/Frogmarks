/**
 * Fullscreen the WHOLE app (document.documentElement), or leave fullscreen. The editors used to fullscreen their
 * `.board-shell` element, and the browser renders only the fullscreen element's subtree: the tool rail, the tool
 * sub-panels, the animation timeline and every overlay attached to <body> (CDK menus / dialogs) sit outside the shell
 * and vanished. Fullscreening the root keeps the layout identical; the canvases are viewport-sized, so the
 * ResizeObserver path resizes them on enter and exit as for any window resize.
 */
export async function toggleAppFullscreen(doc: Document = document): Promise<void> {
  const d = doc as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
  const root = doc.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (!(d.fullscreenElement || d.webkitFullscreenElement)) {
      if (root.requestFullscreen) await root.requestFullscreen();
      else root.webkitRequestFullscreen?.();   // Safari (older)
    } else if (d.exitFullscreen) {
      await d.exitFullscreen();
    } else {
      d.webkitExitFullscreen?.();
    }
  } catch (err) {
    console.error('Fullscreen toggle failed:', err);
  }
}
