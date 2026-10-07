import type { IllustrationComponent } from './illustration.component';
import { canRouteDuplicate, routeDelete, routeDuplicate, routeUndo } from './editor-keymap';

/**
 * The canvas context menu (UI review 2026-10-07 §2b: the right-click menu was never shown and its buttons had no
 * handlers). Right-click on desktop, long-press on touch (CanvasPointerExtras). Every item runs the SAME route as its
 * key / Edit-menu twin (editor-keymap routeUndo / routeDuplicate / routeDelete; Cut / Copy / Paste = the pixel
 * selection, like Ctrl+X / C / V), and is enabled only when that route has something to act on.
 */
export type CanvasMenuId = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'duplicate' | 'delete';

export interface CanvasMenuItem {
  id: CanvasMenuId;
  label: string;
  /** Desktop shortcut hint. */
  keys: string;
  enabled: boolean;
  /** Draw a divider above this item. */
  divider?: boolean;
}

/** Exactly the editor members the menu uses. */
export type CanvasMenuHost = Pick<IllustrationComponent,
  'shapeManager' | 'editorState' | 'meshEdit' | 'is3DContextActive' | 'scene3dUndo' | 'scene3dRedo' | 'rasterUndo' | 'rasterRedo' |
  'scene3dDuplicateMesh' | 'scene3dDeleteSelected' | 'deleteSelectionOrLayers' | 'rasterSelectionService'>;

export function canvasMenuItems(ed: CanvasMenuHost): CanvasMenuItem[] {
  const sel = ed.rasterSelectionService;
  const hasPixels = !!sel?.info?.hasSelection;
  const canDup = canRouteDuplicate(ed);
  // (an older RasterSelectionService has no hasClipboard: offer Paste)
  const canPaste = (sel as { hasClipboard?: boolean } | undefined)?.hasClipboard ?? true;
  return [
    { id: 'undo', label: 'Undo', keys: 'Ctrl+Z', enabled: true },
    { id: 'redo', label: 'Redo', keys: 'Ctrl+Y', enabled: true },
    { id: 'cut', label: 'Cut', keys: 'Ctrl+X', enabled: hasPixels, divider: true },
    { id: 'copy', label: 'Copy', keys: 'Ctrl+C', enabled: hasPixels },
    { id: 'paste', label: 'Paste', keys: 'Ctrl+V', enabled: canPaste },
    { id: 'duplicate', label: 'Duplicate', keys: 'Ctrl+D', enabled: canDup, divider: true },
    { id: 'delete', label: 'Delete', keys: 'Del', enabled: canDup || hasPixels },
  ];
}

/** Run an item through its route. A disabled item does nothing (the template also disables its button). */
export function runCanvasMenuItem(ed: CanvasMenuHost, id: CanvasMenuId): void {
  const item = canvasMenuItems(ed).find(i => i.id === id);
  if (!item?.enabled) return;
  switch (id) {
    case 'undo': routeUndo(ed, false); break;
    case 'redo': routeUndo(ed, true); break;
    case 'cut': void ed.rasterSelectionService.cut(); break;
    case 'copy': void ed.rasterSelectionService.copy(); break;
    case 'paste': ed.rasterSelectionService.paste(); break;
    case 'duplicate': routeDuplicate(ed); break;
    case 'delete': routeDelete(ed); break;
  }
}

/** Keep a `w` × `h` menu opened at (x, y) inside a `vw` × `vh` viewport (8 px margin): it flips left / up near the
 *  right / bottom edge, like a native menu. */
export function clampMenuPosition(x: number, y: number, w: number, h: number, vw: number, vh: number): { x: number; y: number } {
  const m = 8;
  let nx = x + w + m > vw ? x - w : x;
  let ny = y + h + m > vh ? y - h : y;
  nx = Math.max(m, Math.min(nx, vw - w - m));
  ny = Math.max(m, Math.min(ny, vh - h - m));
  return { x: nx, y: ny };
}
