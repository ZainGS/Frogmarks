import type { ModeChromeId } from './mode-chrome.types';

/**
 * Leaving a mode from the main toolbar (round-2 feedback 2026-10-08): while a mode is active the editor's normal left
 * rail stays. Its tools that the mode uses itself stay inside the mode (MODE_RAIL_TOOLS); tapping any other rail tool
 * first leaves the mode, then that tool's own click runs. Tapping the mode's own entry button again leaves it through
 * that button's own handler (its toggle), so it is never pre-exited here.
 *
 * Rail buttons are identified by `data-rail-tool="<id>"` on their .vertical-tool-button (illustration.component.html).
 * A button without the attribute counts as "another tool".
 */

/** Rail tool ids (the data-rail-tool values). */
export type RailToolId = 'select' | 'pan' | 'move' | 'rotate' | 'scale' | 'editMesh' | 'armature' | (string & {});

/** Per mode: the rail tools that stay inside the mode. A mode without an entry is never left from the rail. */
export const MODE_RAIL_TOOLS: Partial<Record<ModeChromeId, readonly RailToolId[]>> = {
  meshEdit: ['select', 'pan', 'move', 'rotate', 'scale'],
  // Armature: Select / Move / Rotate drive the joint tools (IllustrationComponent selectCursor / scene3dSetGizmoMode)
  armature: ['select', 'pan', 'move', 'rotate'],
};

/** Each mode's own entry button on the rail (its click toggles the mode off). */
export const MODE_RAIL_ENTRY: Readonly<Record<ModeChromeId, RailToolId>> = {
  meshEdit: 'editMesh',
  armature: 'armature',
};

/** Tapping rail tool `tool` while `mode` is active leaves the mode first. */
export function railTapExitsMode(mode: ModeChromeId | null, tool: RailToolId): boolean {
  if (!mode) return false;
  const keep = MODE_RAIL_TOOLS[mode];
  if (!keep) return false;
  return tool !== MODE_RAIL_ENTRY[mode] && !keep.includes(tool);
}

/** What the rail listener needs from the editor. */
export interface ModeRailHost {
  readonly activeModeChrome: ModeChromeId | null;
  /** Leave the active mode (Edit Mesh: MeshEditService.leave; Armature: closeArmaturePanel). */
  exitModeChrome(): void;
}

/**
 * Listen (capture phase, so it runs before the button's own click) for taps on the rail's tool buttons and leave the
 * active mode when the tool is not one of its own. Returns the uninstaller.
 */
export function installModeRailExit(rail: HTMLElement, host: ModeRailHost): () => void {
  const onClick = (e: Event): void => {
    const mode = host.activeModeChrome;
    if (!mode) return;
    const btn = (e.target as Element | null)?.closest?.('.vertical-tool-button');
    if (!btn || !rail.contains(btn)) return;
    if (railTapExitsMode(mode, btn.getAttribute('data-rail-tool') ?? '')) host.exitModeChrome();
  };
  rail.addEventListener('click', onClick, true);
  return () => rail.removeEventListener('click', onClick, true);
}
