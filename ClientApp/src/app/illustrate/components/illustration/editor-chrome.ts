import type { NgZone } from '@angular/core';
import type { IllustrationComponent } from './illustration.component';
import { OverlayManagerService, insideSelector } from '../../../shared/services/overlay/overlay-manager.service';
import { attachMultiFingerTap, MultiTapAction } from './multi-finger-tap';

/** Exactly the editor members the chrome wiring below uses. */
export type EditorChromeHost = Pick<IllustrationComponent, 'scene3dShowAddMeshMenu' | 'showShortcutCheatsheet' | 'scriptApiRefOpen' |
  'scene3dViewIsPlaying' | 'isViewerMode' | 'isLoading' | 'persist' | 'editUndo' | 'editRedo' | 'canvasRef'>;

/**
 * The editor's own overlays and touch history gestures (UI review 2026-10-07 §3 items 2 + 3), installed for the
 * editor's life. Returns the uninstall function.
 *
 *  - Overlays (OverlayManagerService): the 3D "Add" menu (a popover: a tap outside it closes it), the Keyboard
 *    Shortcuts and Script API Reference dialogs (modals: Esc closes them, their backdrops handle taps). The menubar,
 *    the Layers panel and the Export dialog register themselves.
 *  - Two-finger tap = Undo, three-finger tap = Redo on the canvas (multi-finger-tap.ts), routed exactly like the
 *    Undo / Redo box's buttons and Ctrl+Z / Ctrl+Y (editUndo / editRedo → editor-keymap routeUndo). Not in Play, in the
 *    read-only viewer, while loading, over a missing document, during a raster stroke or while an overlay is open.
 */
export function installEditorChrome(ed: EditorChromeHost, overlays: OverlayManagerService, ngZone: NgZone,
                                    win: Window = window): () => void {
  const off = [
    overlays.register({
      id: 'add-mesh-menu',
      isOpen: () => ed.scene3dShowAddMeshMenu,
      close: () => { ed.scene3dShowAddMeshMenu = false; },
      contains: insideSelector('app-add-mesh-menu'),
    }),
    overlays.register({ id: 'shortcut-cheatsheet', isOpen: () => ed.showShortcutCheatsheet, close: () => { ed.showShortcutCheatsheet = false; } }),
    overlays.register({ id: 'script-api-reference', isOpen: () => ed.scriptApiRefOpen, close: () => { ed.scriptApiRefOpen = false; } }),
  ];
  const detachTap = ngZone.runOutsideAngular(() => attachMultiFingerTap(win, {
    isCanvas: (t) => !!t && t === ed.canvasRef?.nativeElement,
    blocked: () => historyTapBlocked(ed, overlays),
    onTap: (action: MultiTapAction) => ngZone.run(() => { if (action === 'undo') ed.editUndo(); else ed.editRedo(); }),
  }));
  return () => { off.forEach(f => f()); detachTap(); };
}

/** A history tap does nothing now. */
export function historyTapBlocked(ed: Pick<EditorChromeHost, 'scene3dViewIsPlaying' | 'isViewerMode' | 'isLoading' | 'persist'>,
                                  overlays: Pick<OverlayManagerService, 'anyOpen'>): boolean {
  return ed.scene3dViewIsPlaying || ed.isViewerMode || ed.isLoading || !!ed.persist.documentMissing
    || ed.persist.rasterStrokeActive || overlays.anyOpen;
}
