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
 * cut on the selected edge, E / I extrude / inset, K the knife (Enter / Esc apply / drop its tapped points), G / R / S
 * listed for the hints (the HUD runs them). Ctrl+B (chamfer), Enter / Esc otherwise and Tab stay in the global tables. The keyboard
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
  // UI review §4 (keyboard parity with the tool strip). E / I: the Extrude / Inset tool, run at once on the selected
  // faces (Blender's E / I); the op pill then adjusts it.
  extrude: { keys: ['e', 'E'], mod: false, shift: false, alt: false, group: 'Edit Mesh', help: 'Extrude the selected faces',
    run: (ed) => { if (meshEditBusy(ed)) return false; ed.meshEdit.toolKey('extrude'); } },
  inset: { keys: ['i', 'I'], mod: false, shift: false, alt: false, group: 'Edit Mesh', help: 'Inset the selected faces',
    run: (ed) => { if (meshEditBusy(ed)) return false; ed.meshEdit.toolKey('inset'); } },
  knife: { keys: ['k', 'K'], mod: false, shift: false, alt: false, group: 'Edit Mesh', help: 'Knife tool on / off',
    run: (ed) => { ed.meshEdit.toggleKnifeTool(); } },   // (as the global K: it ends a running Chamfer / transform)
  // The Knife's tapped points (a newer Salsa): Enter cuts, Esc drops them. Declined otherwise (the global Enter / Esc).
  knifeApply: { keys: ['Enter'], mod: false, shift: false, alt: false, group: 'Edit Mesh', help: 'Knife: cut along the tapped points',
    run: (ed) => ed.meshEdit.applyKnifePoints() },
  knifeCancel: { keys: ['Escape'], mod: false, shift: false, alt: false, group: 'Edit Mesh', help: 'Knife: drop the tapped points',
    run: (ed) => ed.meshEdit.cancelKnifePoints() },
  // G / R / S: run by the HUD's keyboard transform (ViewportHudService.handleTransformKey), which claims the key before
  // this table. Listed here so the tool strip / cheatsheet show them; declined if it ever gets here.
  move: { keys: ['g', 'G'], mod: false, shift: false, alt: false, group: 'Edit Mesh', help: 'Move the selection (then X / Y / Z, a number, Enter)',
    run: () => false },
  rotate: { keys: ['r', 'R'], mod: false, shift: false, alt: false, group: 'Edit Mesh', help: 'Rotate the selection (then X / Y / Z, degrees, Enter)',
    run: () => false },
  scale: { keys: ['s', 'S'], mod: false, shift: false, alt: false, group: 'Edit Mesh', help: 'Scale the selection (then X / Y / Z, a factor, Enter)',
    run: () => false },
} satisfies Record<string, KeyBinding>;

export const MESH_EDIT_KEYMAP: KeyBinding[] = Object.values(MESH_EDIT_KEYS);

// ── Armature (the mode chrome's <app-armature-mode>, UI review §4) ─────────────────────────────────────────────

/** What the Armature keys drive: the mode chrome's armature component (IllustrationComponent.armatureMode). Absent
 *  with the classic panel, so the keys decline there (and are swallowed as before). */
export interface ArmatureKeyTarget {
  readonly workspace: 'rig' | 'animate';
  setTool(id: string): void;
  setSegment(id: string): void;
  keyPose(): void;
}
function armatureTarget(ed: unknown): ArmatureKeyTarget | null {
  return (ed as { armatureMode?: ArmatureKeyTarget | null } | null)?.armatureMode ?? null;
}
/** A tool key, only in workspace `ws` when given (else declined: B / I / P are Rig tools, I / K Animate's Key). */
const armTool = (id: string, ws?: 'rig' | 'animate') => (ed: KeymapHost): boolean | void => {
  const t = armatureTarget(ed);
  if (!t || (ws && t.workspace !== ws)) return false;
  t.setTool(id);
};
const armSegment = (id: string) => (ed: KeymapHost): boolean | void => {
  const t = armatureTarget(ed);
  if (!t || t.workspace !== 'rig') return false;
  t.setSegment(id);
};

/** Armature bindings by id (the tool strip's key chips and hints are generated from them: armatureKeyLabels). Q / W /
 *  E pick the tools (not G / R / S: those start the HUD's keyboard transform of the selected mesh). */
export const ARMATURE_KEYS = {
  select: { keys: ['q', 'Q'], mod: false, shift: false, alt: false, group: 'Armature', help: 'Select tool (tap a joint)', run: armTool('select') },
  move: { keys: ['w', 'W'], mod: false, shift: false, alt: false, group: 'Armature', help: 'Move tool', run: armTool('move') },
  rotate: { keys: ['e', 'E'], mod: false, shift: false, alt: false, group: 'Armature', help: 'Rotate tool', run: armTool('rotate') },
  addBone: { keys: ['b', 'B'], mod: false, shift: false, alt: false, group: 'Armature', help: 'Add Bone tool (Rig)', run: armTool('addbone', 'rig') },
  ik: { keys: ['i', 'I'], mod: false, shift: false, alt: false, group: 'Armature', help: 'IK tool (Rig)', run: armTool('ik', 'rig') },
  weight: { keys: ['p', 'P'], mod: false, shift: false, alt: false, group: 'Armature', help: 'Weight Brush tool (Rig)', run: armTool('weight', 'rig') },
  key: { keys: ['i', 'I'], mod: false, shift: false, alt: false, group: 'Armature', help: 'Key tool (Animate)', run: armTool('key', 'animate') },
  insertKey: { keys: ['k', 'K'], mod: false, shift: false, alt: false, group: 'Armature', help: 'Key the pose into the clip (Animate)',
    run: (ed) => { const t = armatureTarget(ed); if (!t || t.workspace !== 'animate') return false; t.keyPose(); } },
  pose: { keys: ['1'], mod: false, alt: false, group: 'Armature', help: 'Pose (Rotate tool)', run: armSegment('pose') },
  editBones: { keys: ['2'], mod: false, alt: false, group: 'Armature', help: 'Edit Bones (Move tool)', run: armSegment('edit') },
  weightMode: { keys: ['3'], mod: false, alt: false, group: 'Armature', help: 'Weight (Weight Brush tool)', run: armSegment('weight') },
} satisfies Record<string, KeyBinding>;

export const ARMATURE_KEYMAP: KeyBinding[] = Object.values(ARMATURE_KEYS);

/** Each mode's own bindings (UV paint has none yet: its input is the pointer; the Armature's drive the mode chrome). */
export const MODE_KEYMAPS: Readonly<Record<KeymapMode, KeyBinding[]>> = {
  meshEdit: MESH_EDIT_KEYMAP,
  armature: ARMATURE_KEYMAP,
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
/** The Armature tool strip's / header's key chips, generated from the real bindings. */
export function armatureKeyLabels(): Record<keyof typeof ARMATURE_KEYS, string> {
  const out = {} as Record<keyof typeof ARMATURE_KEYS, string>;
  for (const [id, b] of Object.entries(ARMATURE_KEYS)) out[id as keyof typeof ARMATURE_KEYS] = chipLabel(b);
  return out;
}

export function meshEditKeyLabels(): Record<keyof typeof MESH_EDIT_KEYS | 'chamfer', string> {
  const out = {} as Record<keyof typeof MESH_EDIT_KEYS | 'chamfer', string>;
  for (const [id, b] of Object.entries(MESH_EDIT_KEYS)) out[id as keyof typeof MESH_EDIT_KEYS] = chipLabel(b);
  const chamfer = globalBinding('Chamfer / bevel (Edit Mesh)');
  out.chamfer = chamfer ? chipLabel(chamfer) : '';
  return out;
}

/** The cheatsheet (Edit › Keyboard Shortcuts) with the Edit Mesh section added to the first column. */
export function cheatsheetColumnsWithModes(): ReturnType<typeof cheatsheetColumns> {
  const cols = cheatsheetColumns();
  cols[0].push({ title: 'Edit Mesh', rows: MESH_EDIT_KEYMAP.map(b => ({ chord: chordLabel(b), help: b.help })) });
  cols[0].push({ title: 'Armature', rows: ARMATURE_KEYMAP.map(b => ({ chord: chordLabel(b), help: b.help })) });
  return cols;
}
