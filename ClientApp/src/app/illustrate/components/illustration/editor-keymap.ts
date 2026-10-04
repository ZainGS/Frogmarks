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
function undo(ed: KeymapHost, redo: boolean): void {
  if (ed.is3DContextActive) redo ? ed.scene3dRedo() : ed.scene3dUndo();
  else void (redo ? ed.rasterRedo() : ed.rasterUndo());
}

export const MOD_KEYMAP: KeyBinding[] = [
  { keys: ['z', 'Z'], mod: true, group: 'Edit', help: 'Undo (Shift: redo)', run: (ed, e) => {
    const sm = ed.shapeManager;
    if (!e.shiftKey && sm.canUndo2DShapes) return;   // 2D object stack (engine consumed it)
    if (e.shiftKey && sm.canRedo2DShapes) return;
    undo(ed, e.shiftKey);
  } },
  { keys: ['y', 'Y'], mod: true, group: 'Edit', help: 'Redo', run: (ed) => {
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
    ed.rasterSelectionService.commitTransform();
  } },
];

export const TOOL_KEYMAP: KeyBinding[] = [
  { keys: ['Backspace'], alt: true, group: 'Edit', help: 'Fill selection with the pen colour', run: (ed) => { void ed.animationService.fillSelection(ed.draw.selectedPenColor); } },
  { keys: ['Escape'], group: 'Selection', help: 'Cancel / cursor tool', run: (ed) => {
    if (ed.decal.scene3dDecalToolActive) {
      ed.decal.scene3dDecalToolActive = false;
      ed.shapeManager.exitDecalPlaceMode3D();
    } else if (ed.meshEdit.scene3dIsEditingMesh && ed.meshEdit.scene3dEditTool === 'knife') {
      ed.meshEdit.cancelKnifeCut();
    } else if (ed.rasterSelectionService.info.isTransforming) {
      ed.rasterSelectionService.cancelTransform();
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
  { keys: ['+', '='], group: 'View', help: 'Zoom in', run: (ed) => ed.artboard.zoomIn() },
  { keys: ['-', '_'], group: 'View', help: 'Zoom out', run: (ed) => ed.artboard.zoomOut() },
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
