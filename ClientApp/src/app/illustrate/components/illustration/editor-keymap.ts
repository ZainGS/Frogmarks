import type { IllustrationComponent } from './illustration.component';

/**
 * Editor keyboard shortcuts as data. Two ordered tables, first match wins:
 *   - MOD_KEYMAP  — Ctrl / Cmd chords (+ Enter to commit a selection transform); runs before anything else.
 *   - TOOL_KEYMAP — single keys (tools, view, 3D edit); runs only when no other handler claimed the key
 *                   (event.defaultPrevented — e.g. the engine's 3D G / R / S / axis keys).
 * `run` returns false to decline (the key falls through and is not prevented); anything else = handled, the
 * dispatcher calls preventDefault. Keys are event.key values, case-sensitive. The cheatsheet
 * (Edit › Keyboard Shortcuts) is generated from the `group` / `help` of these bindings — see cheatsheetColumns().
 */
export type CheatsheetGroup = 'Tools' | 'Selection' | '3D' | 'Edit' | 'View' | 'File';

export interface KeyBinding {
  keys: string[];
  /** Ctrl (Cmd on Mac) required (true) / forbidden (false); omitted = either. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Keeps firing while the key is held (keyboard auto-repeat). Default: a held key runs the action ONCE — toggles,
   *  tool switches, dialogs, duplicate / paste / fill would otherwise fire ~30×/s (zone audit M1). */
  repeat?: boolean;
  /** Cheatsheet section and text — the cheatsheet is generated from these tables (it used to be hand-written HTML that
   *  drifted from the real bindings). */
  group: CheatsheetGroup;
  help: string;
  run: (ed: KeymapHost, e: KeyboardEvent) => boolean | void;
}

/** Exactly the editor members the shortcuts use. */
export type KeymapHost = Pick<IllustrationComponent,
  'shapeManager' | 'editorState' | 'draw' | 'artboard' | 'is3DContextActive' | 'scene3dUndo' | 'scene3dRedo' | 'rasterUndo' | 'rasterRedo' | 'saveNow' | 'rasterFlipHorizontal' | 'rasterFlipVertical' | 'files' | 'pl' | 'rasterSelectionService' |
  'scene3dDuplicateMesh' | 'decal' | 'meshEdit' | 'selectCursor' | 'setActiveTool' | 'deleteSelectionOrLayers' | 'toggleFullscreen' | 'toggleUI' | 'scene3dSetIllustrationProjection' |
  'animationEnabled' | 'anim' | 'scene3dArmaturePanelOpen' | 'closeArmaturePanel' |
  'openArmaturePanel' | 'animationService'
>;

/** Undo / redo go to the active context; the engine's 2D object stack has already handled the key when it can. */
function undo(ed: Pick<KeymapHost, 'is3DContextActive' | 'scene3dUndo' | 'scene3dRedo' | 'rasterUndo' | 'rasterRedo'>, redo: boolean): void {
  if (ed.is3DContextActive) redo ? ed.scene3dRedo() : ed.scene3dUndo();
  else void (redo ? ed.rasterRedo() : ed.rasterUndo());
}

/** Undo / redo from a BUTTON (Edit menu): routed exactly like Ctrl+Z / Ctrl+Y. The 2D object stack
 *  goes first (for the keys the engine consumes it itself; a button has to call it), then the active context. */
export function routeUndo(ed: Pick<KeymapHost, 'shapeManager' | 'is3DContextActive' | 'scene3dUndo' | 'scene3dRedo' | 'rasterUndo' | 'rasterRedo'>, redo: boolean): void {
  const sm = ed.shapeManager;
  if (!redo && sm.canUndo2DShapes) { sm.undo2DShapes(); return; }
  if (redo && sm.canRedo2DShapes) { sm.redo2DShapes(); return; }
  undo(ed, redo);
}

/** Exactly the editor members Edit › Duplicate / Delete use. */
export type EditRouteHost = Pick<IllustrationComponent, 'shapeManager' | 'editorState' | 'meshEdit' | 'scene3dDuplicateMesh' |
  'scene3dDeleteSelected' | 'deleteSelectionOrLayers'>;

/** The 3D branch of Ctrl+D (MOD_KEYMAP): the 3D view is showing and a mesh is selected. */
function has3DMeshSelection(ed: Pick<EditRouteHost, 'editorState'>): boolean {
  return !!(ed.editorState.scene3dPanelVisible && ed.editorState.scene3dSelectedMeshId);
}

/** What the engine's own Ctrl+D / Delete handlers require (raster-interaction-controller): selected 2D nodes, and no
 *  creator / Player mode owning the input. */
function has2DShapeSelection(ed: Pick<EditRouteHost, 'shapeManager'>): boolean {
  const is = ed.shapeManager?.interactionService;
  return !!is && is.selectedNodes.size > 0 && !is.suppressBoxSelect;
}

/** Edit › Duplicate is enabled: there is something Ctrl+D would duplicate. */
export function canRouteDuplicate(ed: Pick<EditRouteHost, 'shapeManager' | 'editorState'>): boolean {
  return has3DMeshSelection(ed) || has2DShapeSelection(ed);
}

/** Edit › Duplicate, routed like Ctrl+D: the selected 3D mesh in the 3D view (the keymap's branch), else the selected 2D
 *  shapes (the engine's Ctrl+D handler: one 'Duplicate shapes' undo step). Never Ctrl+D's raster "Deselect" half (that
 *  is Edit › Deselect). No-op when nothing is selected. */
export function routeDuplicate(ed: Pick<EditRouteHost, 'shapeManager' | 'editorState' | 'scene3dDuplicateMesh'>): void {
  if (has3DMeshSelection(ed)) { ed.scene3dDuplicateMesh(ed.editorState.scene3dSelectedMeshId!); return; }
  if (has2DShapeSelection(ed)) ed.shapeManager.duplicateSelectedShapes();
}

/** Edit › Delete, routed per context. 3D view: in mesh edit mode the selected faces (the Mesh Edit panel's Delete),
 *  else the selected 3D items through the editor's own teardown (the outliner's ✕ path: characters, groups, packages,
 *  CD kits, decals). 2D: what the Delete key does — the engine deletes the selected 2D shapes, then the keymap's
 *  deleteSelectionOrLayers clears the pixel selection / drops the layers' editor-side state. */
export function routeDelete(ed: EditRouteHost): void {
  if (has3DMeshSelection(ed)) {
    if (ed.meshEdit.scene3dIsEditingMesh) ed.meshEdit.deleteSelectedFaces();
    else ed.scene3dDeleteSelected();
    return;
  }
  if (has2DShapeSelection(ed)) ed.shapeManager.deleteSelectedShapes();
  ed.deleteSelectionOrLayers();
}

/** The editor members the modal-state actions below use. */
export type ModeHost = Pick<IllustrationComponent, 'shapeManager' | 'decal' | 'meshEdit' | 'rasterSelectionService' | 'liveTextOptions'>;

/**
 * Leaving the editor's modal states: ONE implementation shared by the keys (Esc / Enter: the tables below and
 * IllustrationComponent.handleHotkeys) and the touch Apply / Cancel pill (CONTEXT_PILLS), so a tap does exactly what
 * the key does.
 */
export const MODE_ACTIONS = {
  /** Esc while editing a LiveText node (handled before the tables: the text overlay has focus). */
  endLiveText: (ed: Pick<ModeHost, 'liveTextOptions'>): void => { ed.liveTextOptions?.endLiveTextEditing(); },
  /** Esc with the decal placement tool on. */
  exitDecalPlacement: (ed: Pick<ModeHost, 'decal' | 'shapeManager'>): void => {
    ed.decal.scene3dDecalToolActive = false;
    ed.shapeManager.exitDecalPlaceMode3D();
  },
  /** Esc with the mesh-edit knife: drop the cut in progress and go back to select (a drag cuts on release; there is
   *  no separate commit). */
  cancelKnife: (ed: Pick<ModeHost, 'meshEdit'>): void => { ed.meshEdit.cancelKnifeCut(); },
  /** Enter / Esc during a raster selection transform. */
  commitTransform: (ed: Pick<ModeHost, 'rasterSelectionService'>): void => { ed.rasterSelectionService.commitTransform(); },
  cancelTransform: (ed: Pick<ModeHost, 'rasterSelectionService'>): void => { ed.rasterSelectionService.cancelTransform(); },
};

export type ContextPillMode = 'liveText' | 'decal' | 'knife' | 'transform';

export interface ContextPillAction { label: string; run: (ed: ModeHost) => void }
export interface ContextPillSpec {
  mode: ContextPillMode;
  /** Optional hint before the buttons (what the mode is waiting for). */
  hint?: string;
  apply?: ContextPillAction;
  cancel?: ContextPillAction;
}

/** The touch Apply / Cancel pill per mode (mobile-parity TOUCH-10): the Enter / Esc actions above, as buttons. */
export const CONTEXT_PILLS: Readonly<Record<ContextPillMode, ContextPillSpec>> = {
  liveText: { mode: 'liveText', apply: { label: 'Done editing text', run: MODE_ACTIONS.endLiveText } },
  decal: { mode: 'decal', apply: { label: 'Done placing decals', run: MODE_ACTIONS.exitDecalPlacement } },
  knife: { mode: 'knife', hint: 'Drag across the mesh to cut', cancel: { label: 'Cancel knife', run: MODE_ACTIONS.cancelKnife } },
  transform: {
    mode: 'transform',
    apply: { label: 'Apply transform', run: MODE_ACTIONS.commitTransform },
    cancel: { label: 'Cancel', run: MODE_ACTIONS.cancelTransform },
  },
};

/** The modal state the pill is for, in the same priority Esc resolves them (live text first, then the Escape
 *  binding's order: decal tool, knife, selection transform); null = no pill. */
export function activeContextPill(ed: Pick<ModeHost, 'decal' | 'meshEdit' | 'rasterSelectionService' | 'liveTextOptions'>): ContextPillSpec | null {
  if (ed.liveTextOptions?.liveTextIsEditing) return CONTEXT_PILLS.liveText;
  if (ed.decal.scene3dDecalToolActive) return CONTEXT_PILLS.decal;
  if (ed.meshEdit.scene3dIsEditingMesh && ed.meshEdit.scene3dEditTool === 'knife') return CONTEXT_PILLS.knife;
  if (ed.rasterSelectionService.info.isTransforming) return CONTEXT_PILLS.transform;
  return null;
}

export const MOD_KEYMAP: KeyBinding[] = [
  // Undo / redo / zoom repeat while held (step back through history, keep zooming); everything else fires once.
  { keys: ['z', 'Z'], mod: true, repeat: true, group: 'Edit', help: 'Undo (Shift: redo)', run: (ed, e) => {
    const sm = ed.shapeManager;
    if (!e.shiftKey && sm.canUndo2DShapes) return;   // 2D object stack (engine consumed it)
    if (e.shiftKey && sm.canRedo2DShapes) return;
    undo(ed, e.shiftKey);
  } },
  { keys: ['y', 'Y'], mod: true, repeat: true, group: 'Edit', help: 'Redo', run: (ed) => {
    if (ed.shapeManager.canRedo2DShapes) return;
    undo(ed, true);
  } },
  { keys: ['0'], mod: true, group: 'View', help: 'Fit artboard to view', run: (ed) => ed.artboard.fitArtboard() },
  { keys: ['s', 'S'], mod: true, shift: false, group: 'File', help: 'Save', run: (ed) => { void ed.saveNow(); } },
  { keys: ['h', 'H'], mod: true, shift: true, group: 'Edit', help: 'Flip horizontal', run: (ed) => { void ed.rasterFlipHorizontal(); } },
  // Only with Shift, so plain Ctrl+V still pastes
  { keys: ['v', 'V'], mod: true, shift: true, group: 'Edit', help: 'Flip vertical', run: (ed) => { void ed.rasterFlipVertical(); } },
  { keys: ['e', 'E'], mod: true, shift: true, group: 'File', help: 'Export .frog file', run: (ed) => { void ed.files.exportFrogFile(); } },
  { keys: ['o', 'O'], mod: true, shift: true, group: 'File', help: 'Import .frog file', run: (ed) => { void ed.files.importFrogFile(); } },
  { keys: ['\\'], mod: true, group: 'View', help: 'Toggle bleed guides', run: (ed) => ed.pl.onPanelShowBleedGuidesChange(!ed.pl.panelShowBleedGuides) },
  { keys: [';'], mod: true, group: 'View', help: 'Toggle gutter guides', run: (ed) => ed.pl.onPanelShowGutterGuidesChange(!ed.pl.panelShowGutterGuides) },
  // Selection
  { keys: ['a', 'A'], mod: true, shift: false, group: 'Selection', help: 'Select all', run: (ed) => ed.rasterSelectionService.selectAll() },
  { keys: ['d', 'D'], mod: true, shift: false, group: 'Selection', help: 'Deselect (3D: duplicate mesh)', run: (ed, e) => {
    if (ed.editorState.scene3dPanelVisible && ed.editorState.scene3dSelectedMeshId) {
      ed.scene3dDuplicateMesh(ed.editorState.scene3dSelectedMeshId);
      e.stopImmediatePropagation();
    } else {
      ed.rasterSelectionService.deselectAll();
    }
  } },
  { keys: ['i', 'I'], mod: true, shift: true, group: 'Selection', help: 'Invert selection', run: (ed) => ed.rasterSelectionService.invertSelection() },
  { keys: ['x', 'X'], mod: true, shift: false, group: 'Edit', help: 'Cut', run: (ed) => { void ed.rasterSelectionService.cut(); } },
  { keys: ['c', 'C'], mod: true, shift: false, group: 'Edit', help: 'Copy', run: (ed) => { void ed.rasterSelectionService.copy(); } },
  { keys: ['v', 'V'], mod: true, shift: false, group: 'Edit', help: 'Paste', run: (ed) => { ed.rasterSelectionService.paste(); } },
  { keys: ['t', 'T'], mod: true, shift: false, group: 'Selection', help: 'Transform selection', run: (ed) => {
    if (!ed.rasterSelectionService.info.hasSelection) return false;
    ed.rasterSelectionService.beginTransform();
  } },
  { keys: ['Enter'], group: 'Selection', help: 'Commit transform', run: (ed) => {
    if (!ed.rasterSelectionService.info.isTransforming) return false;
    MODE_ACTIONS.commitTransform(ed);
  } },
];

export const TOOL_KEYMAP: KeyBinding[] = [
  { keys: ['Backspace'], alt: true, group: 'Edit', help: 'Fill selection with the pen colour', run: (ed) => { void ed.animationService.fillSelection(ed.draw.selectedPenColor); } },
  { keys: ['Escape'], group: 'Selection', help: 'Cancel / cursor tool', run: (ed) => {
    if (ed.decal.scene3dDecalToolActive) {
      MODE_ACTIONS.exitDecalPlacement(ed);
    } else if (ed.meshEdit.scene3dIsEditingMesh && ed.meshEdit.scene3dEditTool === 'knife') {
      MODE_ACTIONS.cancelKnife(ed);
    } else if (ed.rasterSelectionService.info.isTransforming) {
      MODE_ACTIONS.cancelTransform(ed);
    } else {
      ed.selectCursor('cursor');
    }
  } },
  { keys: ['v'], group: 'Tools', help: 'Cursor / select', run: (ed) => ed.selectCursor('cursor') },
  { keys: ['h'], group: 'Tools', help: 'Pan hand', run: (ed) => ed.selectCursor('panhand') },
  { keys: ['l'], group: 'Tools', help: 'Arrow', run: (ed) => ed.setActiveTool('arrow') },
  { keys: ['t'], group: 'Tools', help: 'Text', run: (ed) => ed.setActiveTool('raster:text') },
  { keys: ['T'], shift: true, group: 'Tools', help: 'Speech balloon', run: (ed) => ed.setActiveTool('balloon') },
  { keys: ['Y'], shift: true, group: 'Tools', help: 'Live text', run: (ed) => ed.setActiveTool('live-text') },
  { keys: ['p'], group: 'Tools', help: 'Pen / draw', run: (ed) => ed.setActiveTool('drawing:pen') },
  { keys: ['e'], group: 'Tools', help: 'Eraser', run: (ed) => ed.setActiveTool('drawing:eraser') },
  { keys: ['i'], group: 'Tools', help: 'Highlighter', run: (ed) => ed.setActiveTool('drawing:highlighter') },
  { keys: ['+', '='], repeat: true, group: 'View', help: 'Zoom in', run: (ed) => ed.artboard.zoomIn() },
  { keys: ['-', '_'], repeat: true, group: 'View', help: 'Zoom out', run: (ed) => ed.artboard.zoomOut() },
  { keys: ['Delete', 'Backspace'], group: 'Edit', help: 'Delete selection / shape', run: (ed) => ed.deleteSelectionOrLayers() },
  { keys: ['f'], group: 'View', help: 'Fullscreen', run: (ed) => { void ed.toggleFullscreen(); } },
  { keys: ['x'], group: 'View', help: 'Hide / show UI', run: (ed) => ed.toggleUI() },
  { keys: ['M'], shift: true, group: 'Selection', help: 'Rect select', run: (ed) => ed.setActiveTool('select:rect') },
  { keys: ['m', 'M'], group: 'Tools', help: 'Stamp', run: (ed) => ed.setActiveTool('stamp') },
  { keys: ['O'], shift: true, group: 'Selection', help: 'Ellipse select', run: (ed) => ed.setActiveTool('select:ellipse') },
  { keys: ['L'], shift: true, group: 'Selection', help: 'Lasso select', run: (ed) => ed.setActiveTool('select:lasso') },
  { keys: ['B'], shift: true, group: 'Tools', help: 'Airbrush', run: (ed) => ed.setActiveTool('raster:airbrush') },
  { keys: ['b', 'B'], group: 'Tools', help: 'Raster brush', run: (ed) => ed.setActiveTool('raster:brush') },
  { keys: ['E'], shift: true, group: 'Tools', help: 'Raster eraser', run: (ed) => ed.setActiveTool('raster:eraser') },
  { keys: ['G'], shift: true, group: 'Tools', help: 'Panel layout', run: (ed) => ed.setActiveTool('panel-layout') },
  { keys: ['g', 'G'], group: 'Tools', help: 'Fill (paint bucket)', run: (ed) => ed.setActiveTool('fill') },
  { keys: ['w', 'W'], group: 'Selection', help: 'Magic wand', run: (ed) => ed.setActiveTool('select:magic-wand') },
  { keys: ['q'], group: 'Tools', help: 'Move layer', run: (ed) => ed.setActiveTool('raster:move') },
  { keys: ['5'], group: '3D', help: 'Toggle perspective / ortho', run: (ed) => {
    if (!ed.editorState.scene3dPanelVisible) return false;
    ed.scene3dSetIllustrationProjection(ed.editorState.scene3dIllustrationProjection === 'orthographic' ? 'perspective' : 'orthographic');
  } },
  { keys: ['k', 'K'], group: '3D', help: 'Knife (edit mode) / record keyframe', run: (ed) => {
    if (ed.editorState.scene3dPanelVisible && ed.meshEdit.scene3dIsEditingMesh) { ed.meshEdit.toggleKnifeTool(); return; }
    if (ed.editorState.scene3dPanelVisible && ed.animationEnabled) { ed.anim.scene3dRecordKeyframe(); return; }   // the button is disabled without animation
    return false;
  } },
  { keys: ['Tab'], group: '3D', help: 'Mesh edit mode (Shift: armature panel)', run: (ed, e) => {
    if (!ed.editorState.scene3dPanelVisible) return false;
    if (e.shiftKey) { ed.scene3dArmaturePanelOpen ? ed.closeArmaturePanel() : ed.openArmaturePanel(); return; }
    if (!ed.editorState.scene3dSelectedMeshId) return false;
    ed.meshEdit.scene3dIsEditingMesh ? ed.meshEdit.exitMeshEditMode() : ed.meshEdit.enterMeshEditMode();
  } },
];

/** Run the first binding that matches and accepts the key. True = handled (default prevented). */
export function dispatchKey(table: KeyBinding[], ed: KeymapHost, e: KeyboardEvent, mod: boolean): boolean {
  for (const b of table) {
    if (!b.keys.includes(e.key)) continue;
    if (b.mod !== undefined && b.mod !== mod) continue;
    if (b.shift !== undefined && b.shift !== e.shiftKey) continue;
    if (b.alt !== undefined && b.alt !== e.altKey) continue;
    if (e.repeat && !b.repeat) {
      // A held Ctrl chord stays claimed (no browser Save / Open dialog on the repeats); a plain key just does nothing
      if (b.mod) { e.preventDefault(); return true; }
      continue;
    }
    if (b.run(ed, e) === false) continue;
    e.preventDefault();
    return true;
  }
  return false;
}

const KEY_LABELS: Record<string, string> = { Delete: 'Del', Escape: 'Esc', '-': '–' };

/** Display chord for a binding, e.g. "Ctrl+Shift+H", "Del / Backspace", "+ / =". */
export function chordLabel(b: KeyBinding): string {
  const seen = new Set<string>();
  const keys = b.keys
    .map(key => KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key))
    .filter(label => !seen.has(label) && !!seen.add(label));
  const mods = (b.mod ? 'Ctrl+' : '') + (b.shift ? 'Shift+' : '') + (b.alt ? 'Alt+' : '');
  return keys.map(key => mods + key).join(' / ');
}

/** The cheatsheet's generated sections, in two columns (the Timeline section is the timeline's own and stays static). */
export function cheatsheetColumns(): { title: CheatsheetGroup; rows: { chord: string; help: string }[] }[][] {
  const all = [...TOOL_KEYMAP, ...MOD_KEYMAP];
  const section = (title: CheatsheetGroup) => ({ title, rows: all.filter(b => b.group === title).map(b => ({ chord: chordLabel(b), help: b.help })) });
  return [
    [section('Tools'), section('Selection'), section('3D')],
    [section('Edit'), section('View'), section('File')],
  ];
}
