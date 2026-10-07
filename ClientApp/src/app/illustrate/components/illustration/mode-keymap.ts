import { BEVEL_ACTIONS, chordLabel, cheatsheetColumns, dispatchKey, KeyBinding, KeymapHost, MOD_KEYMAP, TOOL_KEYMAP } from './editor-keymap';

/**
 * Mode-scoped shortcuts (UI review 2026-10-07, top-10 #5). While a 3D mode owns the viewport — Edit Mesh, the Armature
 * panel, UV paint — the editor's 2D bindings are SWALLOWED: B / Ctrl+B used to switch on the raster brush, W / E the
 * magic wand / eraser, X hid the UI although the panel said "Dissolve Edge X". The mode's own table runs first, then
 * the few global bindings that still make sense there (PASS_THROUGH: undo, save, Esc, zoom, Tab…); any other key a
 * global binding would take is claimed and does nothing.
 *
 * Edit Mesh binds the keys the engine already supports (Blender's): 1 / 2 / 3 vertex / edge / face, A select all
 * (again: deselect), Alt+A deselect, X / Delete delete the selected faces or dissolve the selected edges, Ctrl+R loop
 * cut on the selected edge. Ctrl+B (chamfer), Enter / Esc, K (knife) and Tab stay in the global tables. The keyboard
 * transform (G / R / S, X / Y / Z, digits) is the HUD's (ViewportHudService.handleTransformKey) and runs earlier: a key
 * it claimed (default prevented) is not seen here.
 *
 * The panel's key chips are generated from these bindings (meshEditKeyLabels), so they can't drift again.
 */
export type KeymapMode = 'meshEdit' | 'armature' | 'uvPaint';

/** The editor members the mode keymap reads. */
export type ModeKeymapHost = Pick<KeymapHost, 'meshEdit' | 'scene3dArmaturePanelOpen' | 'uv' | 'shapeManager'>;

/** The 3D mode that owns the keyboard right now (null = the normal editor keymap). */
export function activeKeymapMode(ed: Pick<KeymapHost, 'meshEdit' | 'scene3dArmaturePanelOpen' | 'uv'>): KeymapMode | null {
  if (ed.meshEdit?.scene3dIsEditingMesh) return 'meshEdit';
  if (ed.scene3dArmaturePanelOpen) return 'armature';
  if (ed.uv?.uvEditorOpen || ed.uv?.scene3dClothingPaintActive) return 'uvPaint';
  return null;
}

/** A modal Edit Mesh operation is running (the Chamfer drag, the keyboard G / R / S): element keys wait for it. */
function meshEditBusy(ed: ModeKeymapHost): boolean {
  return BEVEL_ACTIONS.active(ed) || !!ed.shapeManager?.isShortcutActive3D;
}

/** Edit Mesh bindings by id (the ids name the panel's key chips). */
export const MESH_EDIT_KEYS = {
  vertexMode: { keys: ['1'], mod: false, alt: false, group: 'Edit Mesh', help: 'Vertex select mode',
    run: (ed) => { if (meshEditBusy(ed)) return false; ed.meshEdit.setSelectionMode('vertex'); } },
  edgeMode: { keys: ['2'], mod: false, alt: false, group: 'Edit Mesh', help: 'Edge select mode',
    run: (ed) => { if (meshEditBusy(ed)) return false; ed.meshEdit.setSelectionMode('edge'); } },
  faceMode: { keys: ['3'], mod: false, alt: false, group: 'Edit Mesh', help: 'Face select mode',
    run: (ed) => { if (meshEditBusy(ed)) return false; ed.meshEdit.setSelectionMode('face'); } },
  selectAll: { keys: ['a', 'A'], mod: false, shift: false, alt: false, group: 'Edit Mesh', help: 'Select all (again: deselect all)',
    run: (ed) => { if (meshEditBusy(ed)) return false; ed.meshEdit.toggleSelectAll(); } },
  // Mac: Option+A types "å"
  deselectAll: { keys: ['a', 'A', 'å'], mod: false, alt: true, group: 'Edit Mesh', help: 'Deselect all',
    run: (ed) => { if (meshEditBusy(ed)) return false; ed.meshEdit.deselectAll(); } },
  // X / Delete: the selected faces are deleted, the selected edges dissolved (vertices: no engine delete yet)
  delete: { keys: ['x', 'X', 'Delete', 'Backspace'], mod: false, alt: false, group: 'Edit Mesh', help: 'Delete selected faces / dissolve selected edges',
    run: (ed) => { if (meshEditBusy(ed)) return false; ed.meshEdit.deleteSelectedElements(); } },
  // Claimed even with no edge selected: Ctrl+R must never reload the page (nor start the R rotate)
  loopCut: { keys: ['r', 'R'], mod: true, shift: false, alt: false, group: 'Edit Mesh', help: 'Loop cut through the selected edge',
    run: (ed) => { if (!meshEditBusy(ed)) ed.meshEdit.loopCutSelectedEdge(); } },
} satisfies Record<string, KeyBinding>;

export const MESH_EDIT_KEYMAP: KeyBinding[] = Object.values(MESH_EDIT_KEYS);

/** Each mode's own bindings (the armature / UV paint have none yet: their input is the pointer). */
export const MODE_KEYMAPS: Readonly<Record<KeymapMode, KeyBinding[]>> = {
  meshEdit: MESH_EDIT_KEYMAP,
  armature: [],
  uvPaint: [],
};

/** Global bindings (by `help`) that stay live in every mode: history, file, view, Esc, the 3D mode keys. */
const ANY_MODE: readonly string[] = [
  'Undo (Shift: redo)', 'Redo', 'Save', 'Export .frog file', 'Import .frog file', 'Fit artboard to view',
  'Cancel / cursor tool', 'Zoom in', 'Zoom out', 'Fullscreen', 'Toggle perspective / ortho',
  'Knife (edit mode) / record keyframe', 'Mesh edit mode (Shift: armature panel)',
];
/** Per mode: the global bindings that still run (everything else a global binding would take is swallowed). Edit
 *  Mesh keeps Enter / Ctrl+B (the Chamfer) and gives X to delete; the others keep X = hide the UI. */
export const PASS_THROUGH: Readonly<Record<KeymapMode, ReadonlySet<string>>> = {
  meshEdit: new Set([...ANY_MODE, 'Commit transform / chamfer', 'Chamfer / bevel (Edit Mesh)']),
  armature: new Set([...ANY_MODE, 'Hide / show UI']),
  uvPaint: new Set([...ANY_MODE, 'Hide / show UI']),
};

/** dispatchKey's match rules without running anything (a plain key's auto-repeat matches only `repeat` bindings). */
function matches(b: KeyBinding, e: KeyboardEvent, mod: boolean): boolean {
  if (!b.keys.includes(e.key)) return false;
  if (b.mod !== undefined && b.mod !== mod) return false;
  if (b.shift !== undefined && b.shift !== e.shiftKey) return false;
  if (b.alt !== undefined && b.alt !== e.altKey) return false;
  return !(e.repeat && !b.repeat && !b.mod);
}

/**
 * handleHotkeys while a mode is active: the mode's chords + the passed-through global chords (before the
 * default-prevented check, like MOD_KEYMAP), then — unless another handler claimed the key — the mode's single keys +
 * the passed-through single keys, then the swallow. True = handled or swallowed (default prevented).
 */
export function dispatchModeKey(mode: KeymapMode, ed: KeymapHost, e: KeyboardEvent, mod: boolean): boolean {
  const own = MODE_KEYMAPS[mode];
  const pass = PASS_THROUGH[mode];
  if (dispatchKey([...own.filter(b => b.mod), ...MOD_KEYMAP.filter(b => pass.has(b.help))], ed, e, mod)) return true;
  if (!e.defaultPrevented && dispatchKey([...own.filter(b => !b.mod), ...TOOL_KEYMAP.filter(b => pass.has(b.help))], ed, e, mod)) return true;
  if ([...MOD_KEYMAP, ...TOOL_KEYMAP].some(b => matches(b, e, mod))) { e.preventDefault(); return true; }
  return false;
}

/** The chip text for a binding: its first key with the modifiers ("Ctrl+R", "X", "Alt+A"). */
function chipLabel(b: KeyBinding): string { return chordLabel({ ...b, keys: [b.keys[0]] }); }
const globalBinding = (help: string): KeyBinding | undefined => [...MOD_KEYMAP, ...TOOL_KEYMAP].find(b => b.help === help);

/** The Edit Mesh panel's key chips, generated from the real bindings. */
export function meshEditKeyLabels(): Record<keyof typeof MESH_EDIT_KEYS | 'chamfer' | 'knife', string> {
  const out = {} as Record<keyof typeof MESH_EDIT_KEYS | 'chamfer' | 'knife', string>;
  for (const [id, b] of Object.entries(MESH_EDIT_KEYS)) out[id as keyof typeof MESH_EDIT_KEYS] = chipLabel(b);
  const chamfer = globalBinding('Chamfer / bevel (Edit Mesh)');
  const knife = globalBinding('Knife (edit mode) / record keyframe');
  out.chamfer = chamfer ? chipLabel(chamfer) : '';
  out.knife = knife ? chipLabel(knife) : '';
  return out;
}

/** The cheatsheet (Edit › Keyboard Shortcuts) with the Edit Mesh section added to the first column. */
export function cheatsheetColumnsWithModes(): ReturnType<typeof cheatsheetColumns> {
  const cols = cheatsheetColumns();
  cols[0].push({ title: 'Edit Mesh', rows: MESH_EDIT_KEYMAP.map(b => ({ chord: chordLabel(b), help: b.help })) });
  return cols;
}
