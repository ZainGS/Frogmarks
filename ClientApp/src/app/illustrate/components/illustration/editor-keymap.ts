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
export type CheatsheetGroup = 'Tools' | 'Selection' | '3D' | 'Edit' | 'View' | 'File' | 'Edit Mesh' | 'Armature';

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
  'scene3dDeleteSelected' | 'uv' |
  'animationEnabled' | 'anim' | 'scene3dArmaturePanelOpen' | 'closeArmaturePanel' |
  'openArmaturePanel' | 'animationService' | 'armatureUndo'
>;

/** The engine's selected layer entry is the 3D scene layer (a city document selects it on load). Raster undo has no
 *  history there — Ctrl+Z threw "reading 'undo'" in Salsa (mobile-parity 7.3c) — so the key means the 3D scene's undo. */
function engineLayerIs3DScene(sm: KeymapHost['shapeManager'] | undefined): boolean {
  const api = sm as unknown as { rasterLayerManager?: { getSelectedLayerId?: () => string | null }; getRasterLayers?: () => Array<{ id: string; type?: string }> } | undefined;
  const id = api?.rasterLayerManager?.getSelectedLayerId?.();
  if (!id) return false;
  return api?.getRasterLayers?.()?.find(l => l.id === id)?.type === '3d-scene';
}

type ScopedUndoHost = Partial<Pick<KeymapHost, 'meshEdit' | 'scene3dArmaturePanelOpen' | 'armatureUndo'>>;
type UndoHost = Pick<KeymapHost, 'shapeManager' | 'is3DContextActive' | 'scene3dUndo' | 'scene3dRedo' | 'rasterUndo' | 'rasterRedo'>
  & ScopedUndoHost;

/** A 3D mode owns undo / redo: Edit Mesh, the Armature (Rig and Animate). Only the steps made in it (ModeUndoScope;
 *  round-2 feedback 2026-10-08) — never the 2D object stack. */
function inScopedUndoMode(ed: ScopedUndoHost): boolean { return !!ed.meshEdit?.scene3dIsEditingMesh || !!ed.scene3dArmaturePanelOpen; }

/** Whether the mode's undo (redo = false) / redo step may run (an Armature without its scope: unscoped, as before). */
function takeScopedUndoStep(ed: ScopedUndoHost, redo: boolean): boolean {
  if (ed.meshEdit?.scene3dIsEditingMesh) return ed.meshEdit.takeUndoStep(redo);
  return ed.armatureUndo ? ed.armatureUndo.takeStep(redo) : true;
}

/** Undo / redo go to the active context; the engine's 2D object stack has already handled the key when it can. */
function undo(ed: UndoHost, redo: boolean): void {
  if (inScopedUndoMode(ed)) { if (takeScopedUndoStep(ed, redo)) redo ? ed.scene3dRedo() : ed.scene3dUndo(); return; }
  if (ed.is3DContextActive || engineLayerIs3DScene(ed.shapeManager)) redo ? ed.scene3dRedo() : ed.scene3dUndo();
  else void (redo ? ed.rasterRedo() : ed.rasterUndo());
}

/** Undo / redo from a BUTTON (Edit menu): routed exactly like Ctrl+Z / Ctrl+Y. The 2D object stack
 *  goes first (for the keys the engine consumes it itself; a button has to call it), then the active context. */
export function routeUndo(ed: UndoHost, redo: boolean): void {
  const sm = ed.shapeManager;
  if (inScopedUndoMode(ed)) { undo(ed, redo); return; }   // not the 2D object stack: the mode's own steps
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

/** Edit › Duplicate: the selected 3D mesh in the 3D view through the editor's 3D duplicate (duplicateMesh3D: 3D undo,
 *  characters, instance group, outliner), else the selected 2D shapes (the engine's 2D duplicate: one 'Duplicate shapes'
 *  undo step). ONE route for the menu AND Ctrl+D (mobile-parity 7.2, like routeDelete): the engine claims Ctrl+D when
 *  nodes are selected and calls this through its duplicate-key hook (IllustrationComponent._setEngineDuplicateRoute);
 *  the keymap calls it when the engine didn't. Never Ctrl+D's raster "Deselect" half (that is Edit › Deselect).
 *  `fromKey`: the keymap fallback — not the selected 3D object while a creator mode (UV paint, armature, city…) owns
 *  input. Returns whether something was duplicated (false = nothing selected / declined). */
export function routeDuplicate(ed: Pick<EditRouteHost, 'shapeManager' | 'editorState' | 'scene3dDuplicateMesh'>, opts: { fromKey?: boolean } = {}): boolean {
  if (has3DMeshSelection(ed)) {
    if (opts.fromKey && ed.shapeManager?.interactionService?.suppressBoxSelect) return false;
    ed.scene3dDuplicateMesh(ed.editorState.scene3dSelectedMeshId!);
    return true;
  }
  if (has2DShapeSelection(ed)) { ed.shapeManager.duplicateSelectedShapes(); return true; }
  return false;
}

/** Edit › Delete, routed per context. 3D view: in mesh edit mode the selected faces (the Mesh Edit panel's Delete),
 *  else the selected 3D items through the editor's own teardown (the outliner's ✕ path: characters, groups, packages,
 *  CD kits, decals). 2D: what the Delete key does — the engine deletes the selected 2D shapes, then the keymap's
 *  deleteSelectionOrLayers clears the pixel selection / drops the layers' editor-side state.
 *  ONE route for the menu AND the Delete / Backspace key (the engine's Delete hook calls it, and so does the keymap
 *  when the engine didn't claim the key). `fromKey`: the keymap fallback — the engine already declined the key for
 *  its 2D shapes (Backspace typing into a selected text shape, a creator mode owning input), so don't delete them —
 *  nor the selected 3D object while a creator mode (UV paint, armature, city…) owns input; mesh edit still deletes
 *  its faces. */
export function routeDelete(ed: EditRouteHost, opts: { fromKey?: boolean } = {}): void {
  if (has3DMeshSelection(ed)) {
    if (ed.meshEdit.scene3dIsEditingMesh) ed.meshEdit.deleteSelectedFaces();
    else if (!(opts.fromKey && ed.shapeManager?.interactionService?.suppressBoxSelect)) ed.scene3dDeleteSelected();
    return;
  }
  if (!opts.fromKey && has2DShapeSelection(ed)) ed.shapeManager.deleteSelectedShapes();
  ed.deleteSelectionOrLayers();
}

/** The editor members the modal-state actions below use. */
export type ModeHost = Pick<IllustrationComponent, 'shapeManager' | 'decal' | 'meshEdit' | 'rasterSelectionService' | 'liveTextOptions'>
  & Partial<Pick<IllustrationComponent, 'editorState' | 'hud' | 'scene3dInSubMode'>>;

/**
 * Engine APIs newer than the Salsa dist Frogmarks may be building against (mobile-parity TOUCH-10, salsa
 * docs/ui/touch-controls.md §3c). Feature-detected: a button whose API is missing is hidden.
 */
interface TouchTools3D {
  setAdditiveSelect3D?(on: boolean): void;
  getAdditiveSelect3D?(): boolean;
  setSnapToggle3D?(on: boolean): void;
  getSnapToggle3D?(): boolean;
  frameSelected3D?(padding?: number): boolean;
}
function tools3D(ed: Pick<ModeHost, 'shapeManager'>): TouchTools3D { return (ed.shapeManager ?? {}) as unknown as TouchTools3D; }
/** The keyboard 3D transform (G / R / S, then X / Y / Z, digits, Enter / Esc) — the engine's shortcut state. */
type Transform3DMode = 'grab' | 'rotate' | 'scale';

/**
 * The touch equivalents of the 3D modifier keys / shortcuts (TOUCH-10): Shift-select, Ctrl-snap, frame, and the
 * G / R / S keyboard transform. Each runs the same engine call the key does and re-syncs the HUD readout.
 */
export const TOOL3D_ACTIONS = {
  hasAdditive: (ed: Pick<ModeHost, 'shapeManager'>): boolean => typeof tools3D(ed).setAdditiveSelect3D === 'function',
  additiveOn: (ed: Pick<ModeHost, 'shapeManager'>): boolean => !!tools3D(ed).getAdditiveSelect3D?.(),
  /** Multi-select latch: taps add to the selection like Shift (objects, and vertices / edges / faces in Edit Mesh). */
  toggleAdditive: (ed: Pick<ModeHost, 'shapeManager'>): void => {
    const t = tools3D(ed);
    if (typeof t.setAdditiveSelect3D === 'function') t.setAdditiveSelect3D(!t.getAdditiveSelect3D?.());
  },
  hasSnap: (ed: Pick<ModeHost, 'shapeManager'>): boolean => typeof tools3D(ed).setSnapToggle3D === 'function',
  snapOn: (ed: Pick<ModeHost, 'shapeManager'>): boolean => !!tools3D(ed).getSnapToggle3D?.(),
  /** Snap latch: gizmo drags snap like holding Ctrl. */
  toggleSnap: (ed: Pick<ModeHost, 'shapeManager'>): void => {
    const t = tools3D(ed);
    if (typeof t.setSnapToggle3D === 'function') t.setSnapToggle3D(!t.getSnapToggle3D?.());
  },
  /** Frame selected: the engine's mode-aware frame (Edit Mesh: the selected elements) when the dist has it, else the
   *  selected mesh (or everything). */
  frameSelected: (ed: Pick<ModeHost, 'shapeManager' | 'editorState'>): void => {
    const t = tools3D(ed);
    if (typeof t.frameSelected3D === 'function') { t.frameSelected3D(); return; }
    const id = ed.editorState?.scene3dSelectedMeshId;
    if (id) ed.shapeManager.frameMesh3D(id, 1.4); else ed.shapeManager.frameAllMeshes3D(1.4);
  },
  begin: (ed: Pick<ModeHost, 'shapeManager' | 'hud'>, mode: Transform3DMode): void => {
    ed.shapeManager.beginTransform3D(mode);
    ed.hud?.syncShortcutHud();
  },
  axis: (ed: Pick<ModeHost, 'shapeManager' | 'hud'>, axis: 'x' | 'y' | 'z'): void => {
    ed.shapeManager.constrainAxis3D(axis);
    ed.hud?.syncShortcutHud();
  },
  /** The typed amount (the digits the keys would send): constrainAxis3D clears the buffer, then each character is
   *  appended like a key press. Needs an axis first (the engine ignores digits without one). */
  setValue: (ed: Pick<ModeHost, 'shapeManager' | 'hud'>, text: string): void => {
    const sm = ed.shapeManager;
    const axis = sm.shortcutAxis3D;
    if (!sm.isShortcutActive3D || !axis) return;
    sm.constrainAxis3D(axis);
    for (const ch of text) if (/^[\d.\-]$/.test(ch)) sm.appendNumericInput(ch);
    ed.hud?.syncShortcutHud();
  },
  commit: (ed: Pick<ModeHost, 'shapeManager' | 'hud'>): void => { ed.shapeManager.commitTransform3D(); ed.hud?.syncShortcutHud(); },
  cancel: (ed: Pick<ModeHost, 'shapeManager' | 'hud'>): void => { ed.shapeManager.cancelTransform3D(); ed.hud?.syncShortcutHud(); },
};

/**
 * Edit Mesh engine APIs newer than the Salsa dist Frogmarks may be building against (salsa
 * docs/specs/edit-mesh-topology.md): face shading and sharp edges. Feature-detected — a button whose API is missing is
 * hidden (in the touch pill and in the Mesh Edit panel).
 */
export interface MeshEditTools3D {
  setFacesSmooth3D?(meshId: string, faces: Set<number> | null, smooth: boolean): boolean;
  setSharpEdges3D?(meshId: string, halfEdges: number[], sharp: boolean): boolean;
  // the interactive Chamfer / Bevel (salsa docs/specs/edit-mesh-topology.md §8)
  beginBevel3D?(opts?: { segments?: number; kind?: 'vertex' | 'edge'; snap?: boolean }): boolean;
  getBevelState3D?(): BevelState | null;
  setBevelAmount3D?(amount: number): void;
  setBevelSegments3D?(segments: number): void;
  setBevelSnap3D?(on: boolean, step?: number): void;
  commitBevel3D?(): boolean;
  cancelBevel3D?(): void;
  // element transforms: G / R / S + the gizmo move the selected elements (salsa docs/specs/edit-mesh-topology.md §11)
  getElementTransformState3D?(): { mode: Transform3DMode; source: 'modal' | 'gizmo'; dragging: boolean } | null;
  setMeshEditGizmoMode3D?(mode: 'move' | 'rotate' | 'scale' | null): void;
}
/** The engine's Chamfer tool state (sm.getBevelState3D). */
export interface BevelState {
  phase: 'pick' | 'adjust';
  kind: 'vertex' | 'edge' | null;
  amount: number;
  maxAmount: number;
  segments: number;
  snap: boolean;
  snapStep: number;
  targets: number;
  hint: string;
  dragging: boolean;
}
export function meshEditTools(sm: unknown): MeshEditTools3D { return (sm ?? {}) as MeshEditTools3D; }
type MeshEditActionHost = Pick<ModeHost, 'shapeManager'> & Partial<Pick<ModeHost, 'editorState'>>;
function editSelection(ed: MeshEditActionHost): { faces: Set<number>; edges: Set<number> } | null {
  const id = ed.editorState?.scene3dSelectedMeshId;
  const sm = ed.shapeManager as unknown as { getEditSelection3D?(id: string): { faces: Set<number>; edges: Set<number> } | null } | undefined;
  return id && typeof sm?.getEditSelection3D === 'function' ? sm.getEditSelection3D(id) : null;
}

/** Edit Mesh shading (the panel's and the touch pill's Shade Smooth / Flat, Mark / Clear Sharp). Undoable (the engine
 *  pushes one 3D undo step each). */
export const MESH_EDIT_ACTIONS = {
  hasShading: (ed: Pick<ModeHost, 'shapeManager'>): boolean => typeof meshEditTools(ed.shapeManager).setFacesSmooth3D === 'function',
  hasSharp: (ed: Pick<ModeHost, 'shapeManager'>): boolean => typeof meshEditTools(ed.shapeManager).setSharpEdges3D === 'function',
  selectedFaces: (ed: MeshEditActionHost): number[] => [...(editSelection(ed)?.faces ?? [])],
  selectedEdges: (ed: MeshEditActionHost): number[] => [...(editSelection(ed)?.edges ?? [])],
  /** Shade Smooth / Flat: the selected faces; none selected → every face (the engine's rule, as Blender's object-mode
   *  Shade Smooth). */
  shade: (ed: MeshEditActionHost, smooth: boolean): boolean => {
    const id = ed.editorState?.scene3dSelectedMeshId, t = meshEditTools(ed.shapeManager);
    if (!id || typeof t.setFacesSmooth3D !== 'function') return false;
    const faces = MESH_EDIT_ACTIONS.selectedFaces(ed);
    return t.setFacesSmooth3D(id, faces.length ? new Set(faces) : null, smooth);
  },
  /** Mark / Clear Sharp on the selected edges (drawn cyan in the overlay; smooth shading never blends across them). */
  markSharp: (ed: MeshEditActionHost, sharp: boolean): boolean => {
    const id = ed.editorState?.scene3dSelectedMeshId, t = meshEditTools(ed.shapeManager);
    const edges = MESH_EDIT_ACTIONS.selectedEdges(ed);
    if (!id || typeof t.setSharpEdges3D !== 'function' || edges.length === 0) return false;
    return t.setSharpEdges3D(id, edges, sharp);
  },
};

/**
 * The interactive Chamfer / Bevel (Edit Mesh): one implementation for the panel's buttons, the touch pill and the keys
 * (Ctrl+B starts it; Enter / Esc apply / cancel; + / − or the wheel set the segments; Ctrl snaps while dragging).
 * Feature-detected (an older Salsa dist has no tool: the buttons are hidden).
 */
export const BEVEL_ACTIONS = {
  has: (ed: Pick<ModeHost, 'shapeManager'>): boolean => typeof meshEditTools(ed.shapeManager).beginBevel3D === 'function',
  state: (ed: Pick<ModeHost, 'shapeManager'>): BevelState | null => meshEditTools(ed.shapeManager).getBevelState3D?.() ?? null,
  active: (ed: Pick<ModeHost, 'shapeManager'>): boolean => !!BEVEL_ACTIONS.state(ed),
  /** Chamfer: on the selected vertices / edges, else wait for a tap on a corner or edge. */
  begin: (ed: Pick<ModeHost, 'shapeManager'>): boolean => !!meshEditTools(ed.shapeManager).beginBevel3D?.(),
  /** The pill's / panel's amount field (object units; the engine clamps). Junk is ignored. */
  setAmount: (ed: Pick<ModeHost, 'shapeManager'>, text: string): void => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) meshEditTools(ed.shapeManager).setBevelAmount3D?.(v);
  },
  /** Segments − / + (1 = flat chamfer, more = rounded). */
  stepSegments: (ed: Pick<ModeHost, 'shapeManager'>, delta: number): void => {
    const s = BEVEL_ACTIONS.state(ed);
    if (s) meshEditTools(ed.shapeManager).setBevelSegments3D?.(s.segments + delta);
  },
  toggleSnap: (ed: Pick<ModeHost, 'shapeManager'>): void => {
    const s = BEVEL_ACTIONS.state(ed);
    if (s) meshEditTools(ed.shapeManager).setBevelSnap3D?.(!s.snap);
  },
  commit: (ed: Pick<ModeHost, 'shapeManager'>): void => { meshEditTools(ed.shapeManager).commitBevel3D?.(); },
  cancel: (ed: Pick<ModeHost, 'shapeManager'>): void => { meshEditTools(ed.shapeManager).cancelBevel3D?.(); },
  /** The live amount as the field / HUD shows it. */
  amountText: (s: BevelState | null): string => (s ? s.amount.toFixed(3) : ''),
};

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

export type ContextPillMode = 'liveText' | 'decal' | 'knife' | 'bevel' | 'transform' | 'transform3d' | 'meshEdit' | 'object3d';

export interface ContextPillAction {
  label: string;
  run: (ed: ModeHost) => void;
  /** False = hidden right now (e.g. Apply before anything was picked). Absent = always shown. */
  available?: (ed: ModeHost) => boolean;
}
/** A tool button in the pill (TOUCH-10): a one-shot action, or a toggle when it has `pressed`. */
export interface ContextPillButton {
  id: string;
  label: string;
  /** Tooltip / accessible name (the key it stands for). */
  title: string;
  run: (ed: ModeHost) => void;
  /** A toggle's state (aria-pressed). Absent = a one-shot button. */
  pressed?: (ed: ModeHost) => boolean;
  /** False = hidden (the engine API isn't in this Salsa dist yet, or nothing to act on). Absent = always shown. */
  available?: (ed: ModeHost) => boolean;
}
export interface ContextPillSpec {
  mode: ContextPillMode;
  /** Optional hint before the buttons (what the mode is waiting for). */
  hint?: string;
  /** A hint that follows the mode's state (wins over `hint`; '' = none). */
  hintFor?: (ed: ModeHost) => string;
  /** Tool buttons before Cancel / Apply. */
  buttons?: readonly ContextPillButton[];
  /** Show a number field for the typed amount (the keyboard 3D transform's digits). */
  numeric?: boolean;
  /** The field's live value (shown while it is not being typed in). Absent = whatever was typed. */
  numericValue?: (ed: ModeHost) => string;
  /** The field takes input (default: once the 3D transform has an axis). */
  numericEnabled?: (ed: ModeHost) => boolean;
  /** What a typed value does (default: the 3D transform's digits — TOOL3D_ACTIONS.setValue). */
  numericRun?: (ed: ModeHost, text: string) => void;
  apply?: ContextPillAction;
  cancel?: ContextPillAction;
}

const MULTI_BTN: ContextPillButton = {
  id: 'multi', label: 'Multi', title: 'Multi-select: taps add to the selection (Shift)',
  run: TOOL3D_ACTIONS.toggleAdditive, pressed: TOOL3D_ACTIONS.additiveOn, available: TOOL3D_ACTIONS.hasAdditive,
};
const SNAP_BTN: ContextPillButton = {
  id: 'snap', label: 'Snap', title: 'Snap gizmo drags (Ctrl)',
  run: TOOL3D_ACTIONS.toggleSnap, pressed: TOOL3D_ACTIONS.snapOn, available: TOOL3D_ACTIONS.hasSnap,
};
const FRAME_BTN: ContextPillButton = { id: 'frame', label: 'Frame', title: 'Frame the selection', run: TOOL3D_ACTIONS.frameSelected };
const transformBtn = (mode: Transform3DMode, label: string, key: string): ContextPillButton => ({
  id: mode, label, title: `${label} the mesh by a typed amount (${key})`,
  run: (ed) => TOOL3D_ACTIONS.begin(ed, mode),
  available: (ed) => !!ed.editorState?.scene3dSelectedMeshId,
});
/** Edit Mesh element transforms on a newer dist: G / R / S move the SELECTED vertices / edges / faces (a one-finger
 *  drag, the axis buttons, the amount, Apply / Cancel). Older dist: the object, as before. */
const hasElementXf = (ed: Pick<ModeHost, 'shapeManager'>): boolean =>
  typeof meshEditTools(ed.shapeManager).getElementTransformState3D === 'function';
const meshXfBtn = (mode: Transform3DMode, label: string, key: string): ContextPillButton => {
  const b = transformBtn(mode, label, key);
  return {
    ...b,
    title: `${label} the selected elements: drag on the canvas, or pick an axis and type the amount (${key})`,
    available: (ed) => {
      if (!hasElementXf(ed)) return b.available!(ed);
      const id = ed.editorState?.scene3dSelectedMeshId;
      const sm = ed.shapeManager as unknown as { getEditSelection3D?(id: string): { vertices: Set<number>; edges: Set<number>; faces: Set<number> } | null };
      const s = id && typeof sm.getEditSelection3D === 'function' ? sm.getEditSelection3D(id) : null;
      return !!s && s.vertices.size + s.edges.size + s.faces.size > 0;
    },
  };
};
/** Start the Chamfer / Bevel (on the selection, or wait for a tap on a corner / edge). Hidden on an older dist. */
const CHAMFER_BTN: ContextPillButton = {
  id: 'chamfer', label: 'Chamfer', title: 'Chamfer / bevel the selected corners or edges, or tap one (Ctrl+B)',
  run: (ed) => { BEVEL_ACTIONS.begin(ed); },
  available: (ed) => BEVEL_ACTIONS.has(ed),
};
const bevelAdjusting = (ed: ModeHost): boolean => BEVEL_ACTIONS.state(ed)?.phase === 'adjust';
const bevelSegBtn = (delta: 1 | -1): ContextPillButton => ({
  id: delta > 0 ? 'seg+' : 'seg-', label: delta > 0 ? 'Seg +' : 'Seg −',
  title: delta > 0 ? 'More segments: a rounder bevel (+ / wheel)' : 'Fewer segments (1 = a flat chamfer) (− / wheel)',
  run: (ed) => BEVEL_ACTIONS.stepSegments(ed, delta),
  available: bevelAdjusting,
});
const BEVEL_SNAP_BTN: ContextPillButton = {
  id: 'bevel-snap', label: 'Snap', title: 'Round the amount to grid steps (Ctrl while dragging)',
  run: (ed) => BEVEL_ACTIONS.toggleSnap(ed), pressed: (ed) => !!BEVEL_ACTIONS.state(ed)?.snap, available: bevelAdjusting,
};

/** Shade Smooth / Flat for the selected faces (shown while faces are selected and the dist has the API). */
const shadeBtn = (smooth: boolean): ContextPillButton => ({
  id: smooth ? 'smooth' : 'flat', label: smooth ? 'Smooth' : 'Flat',
  title: smooth ? 'Shade the selected faces smooth' : 'Shade the selected faces flat',
  run: (ed) => { MESH_EDIT_ACTIONS.shade(ed, smooth); },
  available: (ed) => MESH_EDIT_ACTIONS.hasShading(ed) && MESH_EDIT_ACTIONS.selectedFaces(ed).length > 0,
});
/** Mark / Clear Sharp for the selected edges (shown while edges are selected and the dist has the API). */
const sharpBtn = (sharp: boolean): ContextPillButton => ({
  id: sharp ? 'sharp' : 'unsharp', label: sharp ? 'Mark Sharp' : 'Clear Sharp',
  title: sharp ? 'Mark the selected edges sharp (hard)' : 'Clear sharp from the selected edges',
  run: (ed) => { MESH_EDIT_ACTIONS.markSharp(ed, sharp); },
  available: (ed) => MESH_EDIT_ACTIONS.hasSharp(ed) && MESH_EDIT_ACTIONS.selectedEdges(ed).length > 0,
});
const axisBtn = (axis: 'x' | 'y' | 'z'): ContextPillButton => ({
  id: axis, label: axis.toUpperCase(), title: `Along ${axis.toUpperCase()} (${axis.toUpperCase()})`,
  run: (ed) => TOOL3D_ACTIONS.axis(ed, axis),
  pressed: (ed) => ed.shapeManager.shortcutAxis3D === axis,
});

/** The touch pill per mode (mobile-parity TOUCH-10): the Enter / Esc actions above as Apply / Cancel, and the 3D
 *  modifier keys / shortcuts as tool buttons. */
export const CONTEXT_PILLS: Readonly<Record<ContextPillMode, ContextPillSpec>> = {
  liveText: { mode: 'liveText', apply: { label: 'Done editing text', run: MODE_ACTIONS.endLiveText } },
  decal: { mode: 'decal', apply: { label: 'Done placing decals', run: MODE_ACTIONS.exitDecalPlacement } },
  knife: { mode: 'knife', hint: 'Drag across the mesh to cut', cancel: { label: 'Cancel knife', run: MODE_ACTIONS.cancelKnife } },
  /** Edit Mesh Chamfer / Bevel: pick (a tap on a corner / edge), then drag; the amount, segments − / +, Snap,
   *  Apply (Enter) / Cancel (Esc). */
  bevel: {
    mode: 'bevel',
    hintFor: (ed) => {
      const s = BEVEL_ACTIONS.state(ed);
      if (!s) return '';
      if (s.phase === 'pick') return s.hint;
      return `${s.kind === 'edge' ? 'Bevel' : 'Chamfer'} · ${s.segments} seg`;
    },
    buttons: [bevelSegBtn(-1), bevelSegBtn(1), BEVEL_SNAP_BTN],
    numeric: true,
    numericValue: (ed) => BEVEL_ACTIONS.amountText(BEVEL_ACTIONS.state(ed)),
    numericEnabled: bevelAdjusting,
    numericRun: (ed, text) => BEVEL_ACTIONS.setAmount(ed, text),
    apply: { label: 'Apply', run: (ed) => BEVEL_ACTIONS.commit(ed), available: bevelAdjusting },
    cancel: { label: 'Cancel', run: (ed) => BEVEL_ACTIONS.cancel(ed) },
  },
  transform: {
    mode: 'transform',
    apply: { label: 'Apply transform', run: MODE_ACTIONS.commitTransform },
    cancel: { label: 'Cancel', run: MODE_ACTIONS.cancelTransform },
  },
  /** The keyboard 3D transform is running (G / R / S): pick an axis, type the amount, Apply (Enter) / Cancel (Esc). */
  transform3d: {
    mode: 'transform3d',
    // (Edit Mesh, newer dist: the selection follows a one-finger drag)
    hintFor: (ed) => {
      const s = meshEditTools(ed.shapeManager).getElementTransformState3D?.();
      return s?.source === 'modal' ? `Drag to ${s.mode === 'grab' ? 'move' : s.mode} the selection` : '';
    },
    buttons: [axisBtn('x'), axisBtn('y'), axisBtn('z')],
    numeric: true,
    apply: { label: 'Apply', run: TOOL3D_ACTIONS.commit },
    cancel: { label: 'Cancel', run: TOOL3D_ACTIONS.cancel },
  },
  /** Edit Mesh (select tool): Shift-select, frame, the G / R / S keyboard transform, and (on a newer dist, with faces /
   *  edges selected) Shade Smooth / Flat and Mark / Clear Sharp. */
  meshEdit: {
    mode: 'meshEdit',
    buttons: [MULTI_BTN, FRAME_BTN, meshXfBtn('grab', 'Grab', 'G'), meshXfBtn('rotate', 'Rotate', 'R'), meshXfBtn('scale', 'Scale', 'S'),
      CHAMFER_BTN, shadeBtn(true), shadeBtn(false), sharpBtn(true), sharpBtn(false)],
  },
  /** A 3D object selected (no sub-mode): Shift-select, Ctrl-snap, frame. */
  object3d: { mode: 'object3d', buttons: [MULTI_BTN, SNAP_BTN, FRAME_BTN] },
};

/** The buttons of `spec` the editor can show right now (an engine API the dist lacks hides its button). */
export function pillButtons(spec: ContextPillSpec, ed: ModeHost): ContextPillButton[] {
  return (spec.buttons ?? []).filter(b => !b.available || b.available(ed));
}

/** The modal state the pill is for, in the same priority Esc resolves them (live text first, then the Escape
 *  binding's order: decal tool, knife, selection transform), then the 3D keyboard transform, then the 3D tool pills
 *  (Edit Mesh, a selected object); null = no pill. The armature has none: its joints / gizmo / IK handles take a
 *  finger directly and have no modifier keys. */
export function activeContextPill(ed: Pick<ModeHost, 'shapeManager' | 'decal' | 'meshEdit' | 'rasterSelectionService' | 'liveTextOptions' | 'editorState' | 'scene3dInSubMode'>): ContextPillSpec | null {
  if (ed.liveTextOptions?.liveTextIsEditing) return CONTEXT_PILLS.liveText;
  if (ed.decal.scene3dDecalToolActive) return CONTEXT_PILLS.decal;
  if (ed.meshEdit.scene3dIsEditingMesh && ed.meshEdit.scene3dEditTool === 'knife') return CONTEXT_PILLS.knife;
  if (ed.meshEdit.scene3dIsEditingMesh && BEVEL_ACTIONS.active(ed)) return CONTEXT_PILLS.bevel;
  if (ed.rasterSelectionService.info.isTransforming) return CONTEXT_PILLS.transform;
  const es = ed.editorState;
  if (!es?.scene3dPanelVisible) return null;
  if (ed.shapeManager?.isShortcutActive3D) return CONTEXT_PILLS.transform3d;
  if (ed.meshEdit.scene3dIsEditingMesh) return CONTEXT_PILLS.meshEdit;
  // (No pill for a plain selected 3D object any more — the user removed the Multi / Snap / Frame pill, 2026-10-08.
  //  CONTEXT_PILLS.object3d is kept for reference.)
  return null;
}

export const MOD_KEYMAP: KeyBinding[] = [
  // Undo / redo / zoom repeat while held (step back through history, keep zooming); everything else fires once.
  { keys: ['z', 'Z'], mod: true, repeat: true, group: 'Edit', help: 'Undo (Shift: redo)', run: (ed, e) => {
    const sm = ed.shapeManager;
    // (a mode owning undo — Edit Mesh, Armature — never hands the key to the 2D object stack)
    if (!inScopedUndoMode(ed)) {
      if (!e.shiftKey && sm.canUndo2DShapes) return;   // 2D object stack (engine consumed it)
      if (e.shiftKey && sm.canRedo2DShapes) return;
    }
    undo(ed, e.shiftKey);
  } },
  { keys: ['y', 'Y'], mod: true, repeat: true, group: 'Edit', help: 'Redo', run: (ed) => {
    if (!inScopedUndoMode(ed) && ed.shapeManager.canRedo2DShapes) return;
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
  // Ctrl+D = Edit › Duplicate (routeDuplicate: the selected 3D mesh / 2D shapes); with nothing to duplicate it deselects
  // the pixel selection. When 2D / 3D nodes are selected the engine claims the key first and runs routeDuplicate itself
  // (its duplicate-key hook — the default is then prevented); this binding is the fallback for the rest. A held Ctrl+D
  // runs once (no `repeat`; the engine skips its auto-repeats too).
  { keys: ['d', 'D'], mod: true, shift: false, group: 'Selection', help: 'Duplicate selection (nothing selected: deselect)', run: (ed, e) => {
    if (e.defaultPrevented) return;   // the engine already ran Edit › Duplicate for this press
    if (canRouteDuplicate(ed)) {
      if (routeDuplicate(ed, { fromKey: true })) e.stopImmediatePropagation();
      return;
    }
    ed.rasterSelectionService.deselectAll();
  } },
  { keys: ['i', 'I'], mod: true, shift: true, group: 'Selection', help: 'Invert selection', run: (ed) => ed.rasterSelectionService.invertSelection() },
  { keys: ['x', 'X'], mod: true, shift: false, group: 'Edit', help: 'Cut', run: (ed) => { void ed.rasterSelectionService.cut(); } },
  { keys: ['c', 'C'], mod: true, shift: false, group: 'Edit', help: 'Copy', run: (ed) => { void ed.rasterSelectionService.copy(); } },
  { keys: ['v', 'V'], mod: true, shift: false, group: 'Edit', help: 'Paste', run: (ed) => { ed.rasterSelectionService.paste(); } },
  { keys: ['t', 'T'], mod: true, shift: false, group: 'Selection', help: 'Transform selection', run: (ed) => {
    if (!ed.rasterSelectionService.info.hasSelection) return false;
    ed.rasterSelectionService.beginTransform();
  } },
  { keys: ['Enter'], group: 'Selection', help: 'Commit transform / chamfer', run: (ed) => {
    if (ed.meshEdit.scene3dIsEditingMesh && BEVEL_ACTIONS.active(ed)) { BEVEL_ACTIONS.commit(ed); return; }
    if (!ed.rasterSelectionService.info.isTransforming) return false;
    MODE_ACTIONS.commitTransform(ed);
  } },
  // Blender's Ctrl+B: bevel the selected edges / chamfer the selected corners (nothing selected: tap one)
  { keys: ['b', 'B'], mod: true, group: '3D', help: 'Chamfer / bevel (Edit Mesh)', run: (ed) => {
    if (!(ed.editorState.scene3dPanelVisible && ed.meshEdit.scene3dIsEditingMesh && BEVEL_ACTIONS.has(ed))) return false;
    if (!BEVEL_ACTIONS.active(ed)) BEVEL_ACTIONS.begin(ed);
  } },
];

export const TOOL_KEYMAP: KeyBinding[] = [
  { keys: ['Backspace'], alt: true, group: 'Edit', help: 'Fill selection with the pen colour', run: (ed) => { void ed.animationService.fillSelection(ed.draw.selectedPenColor); } },
  { keys: ['Escape'], group: 'Selection', help: 'Cancel / cursor tool', run: (ed) => {
    if (ed.decal.scene3dDecalToolActive) {
      MODE_ACTIONS.exitDecalPlacement(ed);
    } else if (ed.meshEdit.scene3dIsEditingMesh && BEVEL_ACTIONS.active(ed)) {
      BEVEL_ACTIONS.cancel(ed);
    } else if (ed.meshEdit.scene3dIsEditingMesh && ed.meshEdit.scene3dEditTool === 'knife') {
      MODE_ACTIONS.cancelKnife(ed);
    } else if (ed.rasterSelectionService.info.isTransforming) {
      MODE_ACTIONS.cancelTransform(ed);
    } else if (ed.uv?.uvEditorOpen || ed.uv?.scene3dClothingPaintActive) {
      ed.uv.closeUVEditor();   // the panel's Close: the full exit (orbit, focus background, paint input, idle pause)
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
  // The same routing as Edit › Delete (3D items through the outliner teardown, mesh-edit faces, 2D shapes, the pixel
  // selection). It only runs when the engine's own Delete handler didn't claim the key — the editor routes that one
  // here too (IllustrationComponent installs routeDelete as the engine's Delete hook).
  { keys: ['Delete', 'Backspace'], group: 'Edit', help: 'Delete selection / shape', run: (ed) => routeDelete(ed, { fromKey: true }) },
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
