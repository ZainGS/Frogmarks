/**
 * Edit Mesh on the mode chrome (UI review 2026-10-07 §4): the data the header bar, tool strip, op pill and radial
 * menu show, and how a tool maps onto the engine. Plain functions (testable without a DOM or an engine).
 *
 * The engine calls of the redesign (salsa docs/reviews/section4-engine-api.md) are newer than the Salsa dist
 * Frogmarks may be building against: every one is feature-detected (MeshChromeCaps) and has a fallback or a disabled
 * control ("Needs the engine update").
 */
import type { BevelState } from '../illustration/editor-keymap';
import { MESH_EDIT_KEYS, meshEditKeyLabels } from '../illustration/mode-keymap';
import type { ModeMenuItem, ModeOpParam, ModeRadialItem, ModeSegment, ModeTool } from '../mode-chrome/mode-chrome.types';

export type MeshSelectMode = 'vertex' | 'edge' | 'face';
export type MeshToolId = 'select' | 'move' | 'rotate' | 'scale' | 'extrude' | 'inset' | 'loopcut' | 'knife' | 'bevel';
export const MESH_TOOL_IDS: readonly MeshToolId[] = ['select', 'move', 'rotate', 'scale', 'extrude', 'inset', 'loopcut', 'knife', 'bevel'];
export type MeshBgMode = 'gradient' | 'wavy' | 'checkers' | 'dim' | 'solid' | 'none';

export const NEEDS_ENGINE_UPDATE = 'Needs the engine update';

/** The engine element / op calls of the redesign (all optional: feature-detected). */
export interface MeshChromeEngineApi {
  setMeshEditActiveTool3D?(tool: MeshToolId): boolean;
  getMeshEditActiveTool3D?(): MeshToolId;
  setMeshEditDragMovesSelection3D?(on: boolean): void;
  getMeshEditDragMovesSelection3D?(): boolean;
  pickMeshEditElementAt3D?(clientX: number, clientY: number, touch?: boolean): { kind: MeshSelectMode; index: number; selected: boolean } | null;
  applyMeshEditKnife3D?(): number;
  cancelMeshEditKnife3D?(): void;
  getMeshEditKnifePointCount3D?(): number;
  getMeshEditLastOp3D?(): MeshLastOp | null;
  redoMeshEditLastOp3D?(params: Record<string, number | boolean | string>): boolean;
  setMeshEditLoopCutOptions3D?(opts: { count?: number; position?: number }): void;
  getMeshEditLoopCutOptions3D?(): { count: number; position: number };
  setMeshEditGizmoMode3D?(mode: 'move' | 'rotate' | 'scale' | null): void;
  getElementTransformState3D?(): { mode: 'grab' | 'rotate' | 'scale'; source: string } | null;
  beginBevel3D?(): boolean;
  setAdditiveSelect3D?(on: boolean): void;
  frameSelected3D?(padding?: number): boolean;
  loopCuts3D?(meshId: string, halfEdge: number, count?: number, position?: number): boolean;
  extrudeRegion3D?(...args: unknown[]): boolean;
}
export const meshChromeApi = (sm: unknown): MeshChromeEngineApi => (sm ?? {}) as MeshChromeEngineApi;

/** What this Salsa dist can do (each a feature test). */
export interface MeshChromeCaps {
  /** setMeshEditActiveTool3D: the engine runs the tool strip's tools (gizmo per tool, Loop Cut taps, Knife taps). */
  activeTool: boolean;
  /** setMeshEditGizmoMode3D: the selection gizmo (an intermediate dist without the tool strip API). */
  gizmo: boolean;
  /** The interactive Chamfer / Bevel. */
  bevel: boolean;
  /** The tap-to-place Knife (applyMeshEditKnife3D). Without it: Frogmarks' drag-a-line knife. */
  knifePoints: boolean;
  /** pickMeshEditElementAt3D (the long-press radial picks the element under the finger). */
  pick: boolean;
  /** getMeshEditLastOp3D / redoMeshEditLastOp3D: "adjust last operation". */
  lastOp: boolean;
  /** set / getMeshEditDragMovesSelection3D. */
  dragMoves: boolean;
  /** loopCuts3D / Loop Cut options: several cuts at a position. */
  multiLoopCut: boolean;
  /** insetRegion3D's depth (came with the tool strip API). */
  insetDepth: boolean;
  /** setAdditiveSelect3D (the Multi latch). */
  additive: boolean;
}

export function meshChromeCaps(sm: unknown): MeshChromeCaps {
  const a = meshChromeApi(sm);
  const fn = (f: unknown): boolean => typeof f === 'function';
  return {
    activeTool: fn(a.setMeshEditActiveTool3D),
    gizmo: fn(a.setMeshEditGizmoMode3D),
    bevel: fn(a.beginBevel3D),
    knifePoints: fn(a.setMeshEditActiveTool3D) && fn(a.applyMeshEditKnife3D),
    pick: fn(a.pickMeshEditElementAt3D),
    lastOp: fn(a.getMeshEditLastOp3D) && fn(a.redoMeshEditLastOp3D),
    dragMoves: fn(a.setMeshEditDragMovesSelection3D) && fn(a.getMeshEditDragMovesSelection3D),
    multiLoopCut: fn(a.loopCuts3D),
    insetDepth: fn(a.setMeshEditActiveTool3D) && fn(a.extrudeRegion3D),
    additive: fn(a.setAdditiveSelect3D),
  };
}

/**
 * The fallback (Experimental › Classic Edit Mesh panel): `switches[key]` (IllustrationComponent.useModeChrome.meshEdit)
 * becomes a live view of the setting — on = the chrome, off = the classic overlay; writing it flips the setting.
 */
export function followClassicSetting<T extends object>(switches: T, key: keyof T & string,
    exp: { readonly classicMeshEdit: boolean; toggleClassicMeshEdit(): void }): T {
  return Object.defineProperty(switches, key, {
    enumerable: true,
    configurable: true,
    get: () => !exp.classicMeshEdit,
    set: (on: boolean) => { if (!!on === exp.classicMeshEdit) exp.toggleClassicMeshEdit(); },
  });
}

// ── Header bar ──────────────────────────────────────────────────────────────────────────────────────────────────

const KEYS = meshEditKeyLabels();

export const MESH_SELECT_SEGMENTS: ModeSegment[] = [
  { id: 'vertex', label: 'Vertex', key: KEYS.vertexMode, title: `Vertex select (${KEYS.vertexMode})` },
  { id: 'edge', label: 'Edge', key: KEYS.edgeMode, title: `Edge select (${KEYS.edgeMode})` },
  { id: 'face', label: 'Face', key: KEYS.faceMode, title: `Face select (${KEYS.faceMode})` },
];

export const MESH_BG_OPTIONS: ReadonlyArray<{ id: MeshBgMode; label: string }> = [
  { id: 'gradient', label: 'Gradient' }, { id: 'wavy', label: 'Wavy' }, { id: 'checkers', label: 'Clover Picnic' },
  { id: 'dim', label: 'Dim' }, { id: 'solid', label: 'Solid' }, { id: 'none', label: 'None' },
];

/** The ⋯ menu: the background (checked), Open UV editor, Drag moves selection (a newer dist), Keyboard shortcuts. */
export function meshMenuItems(bg: MeshBgMode, dragMoves: boolean | null): ModeMenuItem[] {
  const items: ModeMenuItem[] = MESH_BG_OPTIONS.map(o => ({ id: `bg:${o.id}`, label: `Background: ${o.label}`, checked: o.id === bg }));
  if (dragMoves !== null) items.push({ id: 'drag-moves', label: 'Drag moves selection', checked: dragMoves, separatorBefore: true });
  items.push({ id: 'uv', label: 'Open UV editor', separatorBefore: dragMoves === null });
  items.push({ id: 'shortcuts', label: 'Keyboard shortcuts…' });
  return items;
}

// ── Tool strip ──────────────────────────────────────────────────────────────────────────────────────────────────

interface MeshToolDef { id: MeshToolId; label: string; group: string; key: string; how: string }

/** The tools; `key` = the keymap's chip (mode-keymap.ts), `how` = how the pointer uses the tool. */
const TOOL_DEFS: readonly MeshToolDef[] = [
  { id: 'select', label: 'Select', group: 'xf', key: '', how: `Tap to select (Multi or Shift adds) · ${KEYS.selectAll} all · ${KEYS.deselectAll} none` },
  { id: 'move', label: 'Move', group: 'xf', key: KEYS.move, how: MESH_EDIT_KEYS.move.help },
  { id: 'rotate', label: 'Rotate', group: 'xf', key: KEYS.rotate, how: MESH_EDIT_KEYS.rotate.help },
  { id: 'scale', label: 'Scale', group: 'xf', key: KEYS.scale, how: MESH_EDIT_KEYS.scale.help },
  { id: 'extrude', label: 'Extrude', group: 'op', key: KEYS.extrude, how: `${MESH_EDIT_KEYS.extrude.help}: set the distance below, then Extrude` },
  { id: 'inset', label: 'Inset', group: 'op', key: KEYS.inset, how: `${MESH_EDIT_KEYS.inset.help}: set the thickness below, then Inset` },
  { id: 'loopcut', label: 'Loop Cut', group: 'op', key: KEYS.loopCut, how: MESH_EDIT_KEYS.loopCut.help },
  { id: 'knife', label: 'Knife', group: 'op', key: KEYS.knife, how: 'Knife: cut across the faces' },
  { id: 'bevel', label: 'Bevel', group: 'op', key: KEYS.chamfer, how: 'Bevel the selected edges / chamfer the selected corners, then drag' },
];

/** The pointer hint per tool on this dist (the Knife / Loop Cut work differently on an older one). */
export function meshToolHint(id: MeshToolId, caps: MeshChromeCaps): string {
  const def = TOOL_DEFS.find(d => d.id === id)!;
  if (id === 'knife') return caps.knifePoints ? 'Tap points on the surface, then Cut (Enter)' : 'Drag a line across the mesh to cut';
  if (id === 'loopcut') return caps.activeTool ? 'Tap an edge to cut a loop across its ring' : `${def.how} (select an edge, then Cut)`;
  if (id === 'bevel' && !caps.bevel) return NEEDS_ENGINE_UPDATE;
  if ((id === 'move' || id === 'rotate' || id === 'scale') && caps.dragMoves) return `Drag the selection or the gizmo · ${def.how}`;
  return def.how;
}

export function meshTools(caps: MeshChromeCaps): ModeTool[] {
  return TOOL_DEFS.map(d => ({
    id: d.id, label: d.label, icon: `svg:${d.id}`, key: d.key || undefined, group: d.group, hint: meshToolHint(d.id, caps),
    disabled: d.id === 'bevel' && !caps.bevel,
  }));
}

/** What choosing a tool does to the engine. */
export interface MeshToolPlan {
  /** setMeshEditActiveTool3D(tool) (the newer dist: the engine does the rest). */
  engineTool: MeshToolId | null;
  /** setMeshEditGizmoMode3D (an intermediate dist; undefined = leave it). */
  gizmo?: 'move' | 'rotate' | 'scale' | null;
  /** The oldest dist: start the keyboard G / R / S transform on the selection. */
  beginTransform?: 'grab' | 'rotate' | 'scale';
  /** Frogmarks' drag-a-line knife (no engine Knife tool). */
  legacyKnife: boolean;
  /** Start the interactive Chamfer / Bevel (on the selection, else it waits for a tap). */
  beginBevel: boolean;
}

const XF_MODE = { move: 'grab', rotate: 'rotate', scale: 'scale' } as const;

export function planMeshTool(tool: MeshToolId, caps: MeshChromeCaps, hasSelection: boolean): MeshToolPlan {
  const beginBevel = tool === 'bevel' && caps.bevel;
  if (caps.activeTool) return { engineTool: tool, legacyKnife: false, beginBevel };
  const plan: MeshToolPlan = { engineTool: null, legacyKnife: tool === 'knife', beginBevel };
  const xf = tool === 'move' || tool === 'rotate' || tool === 'scale';
  if (caps.gizmo) plan.gizmo = xf ? tool : null;
  else if (xf && hasSelection) plan.beginTransform = XF_MODE[tool];
  return plan;
}

// ── Op pill ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The tool parameters the pill edits (kept for the next run of each op). */
export interface MeshToolParams {
  extrudeDistance: number;
  insetAmount: number;
  insetDepth: number;
  loopCutCount: number;
  loopCutPosition: number;
}
export const DEFAULT_MESH_TOOL_PARAMS: Readonly<MeshToolParams> = {
  extrudeDistance: 0.3, insetAmount: 0.1, insetDepth: 0, loopCutCount: 1, loopCutPosition: 0.5,
};

export interface MeshLastOp { op: string; params: Record<string, number | boolean | string> }

export interface MeshSelCounts { vertices: number; edges: number; faces: number }

export interface MeshOpInput {
  tool: MeshToolId;
  caps: MeshChromeCaps;
  mode: MeshSelectMode;
  sel: MeshSelCounts;
  params: MeshToolParams;
  /** The keyboard / pill transform (G / R / S) running, else null. */
  transform: { mode: 'grab' | 'rotate' | 'scale'; axis: 'x' | 'y' | 'z' | null; display: string } | null;
  bevel: BevelState | null;
  /** The engine Knife's tapped points (caps.knifePoints). */
  knifePoints: number;
  /** "Adjust last operation" to show (null = none / dismissed / an older dist). */
  lastOp: MeshLastOp | null;
  canBridge: boolean;
}

export type MeshOpKind = 'transform' | 'bevel' | 'adjust' | MeshToolId;

export interface MeshOpView {
  kind: MeshOpKind;
  title: string;
  params: ModeOpParam[];
  note?: string;
  showApplyCancel: boolean;
  applyLabel: string;
  cancelLabel: string;
  applyDisabled: boolean;
}

const XF_LABEL = { grab: 'Move', rotate: 'Rotate', scale: 'Scale' } as const;
const XF_UNIT = { grab: '', rotate: '°', scale: '×' } as const;
export const LAST_OP_LABELS: Readonly<Record<string, string>> = {
  extrudeRegion: 'Extrude', insetRegion: 'Inset', bevel: 'Bevel', loopCut: 'Loop Cut', subdivide: 'Subdivide',
};

/** Per known last-op param: label + range (unknown numbers: a plain number field). */
const LAST_OP_PARAM_META: Readonly<Record<string, Partial<ModeOpParam> & { label: string }>> = {
  distance: { label: 'Distance', kind: 'number', step: 0.01, min: -100, max: 100 },
  amount: { label: 'Amount', kind: 'number', step: 0.01, min: 0, max: 100 },
  depth: { label: 'Depth', kind: 'number', step: 0.01, min: -100, max: 100 },
  segments: { label: 'Segments', kind: 'int', min: 1, max: 32 },
  count: { label: 'Cuts', kind: 'int', min: 1, max: 64 },
  position: { label: 'Position', kind: 'number', step: 0.05, min: 0, max: 1 },
  levels: { label: 'Levels', kind: 'int', min: 1, max: 4 },
};

/** The pill params of a last op ("Inset · Amount 0.10 · Depth 0.00"). Strings are not editable (skipped). */
export function lastOpParams(last: MeshLastOp): ModeOpParam[] {
  const out: ModeOpParam[] = [];
  for (const [id, value] of Object.entries(last.params ?? {})) {
    if (typeof value === 'boolean') { out.push({ id, label: id, kind: 'toggle', value }); continue; }
    if (typeof value !== 'number') continue;
    const meta = LAST_OP_PARAM_META[id];
    out.push(meta ? { ...meta, id, value, kind: meta.kind ?? 'number' } as ModeOpParam
      : { id, label: id.charAt(0).toUpperCase() + id.slice(1), kind: Number.isInteger(value) ? 'int' : 'number', value, step: 0.01 });
  }
  return out;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "3 faces" / "1 edge" / "No vertices selected". */
export function selectionLabel(mode: MeshSelectMode, sel: MeshSelCounts): string {
  const n = mode === 'vertex' ? sel.vertices : mode === 'edge' ? sel.edges : sel.faces;
  const [one, many] = mode === 'vertex' ? ['vertex', 'vertices'] : mode === 'edge' ? ['edge', 'edges'] : ['face', 'faces'];
  return n ? `${plural(n, one, many)} selected` : `No ${many} selected`;
}

const btn = (id: string, label: string, title: string, disabled = false): ModeOpParam => ({ id, label, kind: 'button', value: null, title, disabled });

/** The Select tool's actions: All / None / Invert, then what fits the selection. */
export function selectActions(mode: MeshSelectMode, sel: MeshSelCounts, canBridge: boolean): ModeOpParam[] {
  const p: ModeOpParam[] = [
    btn('sel-all', 'All', `Select all (${KEYS.selectAll})`),
    btn('sel-none', 'None', `Deselect all (${KEYS.deselectAll})`),
    btn('sel-invert', 'Invert', 'Select what is not selected'),
  ];
  if (mode === 'face' && sel.faces) {
    p.push(btn('delete', 'Delete', `Delete the selected faces (${KEYS.delete})`));
    p.push(btn('subdivide', 'Subdivide', 'Split each selected face into quads'));
    p.push(btn('flip', 'Flip Normals', 'Turn the selected faces inside out'));
    p.push(btn('separate', 'Separate', 'Split the selected faces off the rest'));
  }
  if (mode === 'edge' && sel.edges) {
    p.push(btn('delete', 'Dissolve', `Remove the selected edges and merge their faces (${KEYS.delete})`));
  }
  if (mode === 'vertex' && sel.vertices >= 2) p.push(btn('merge', 'Merge', 'Merge the selected vertices into one'));
  if (canBridge) p.push(btn('bridge', 'Bridge Loops', 'Join two open loops with a ring of faces'));
  return p;
}

const toolTitle = (t: MeshToolId): string => TOOL_DEFS.find(d => d.id === t)?.label ?? t;

/** The op pill for the current state: a running transform / Chamfer first, then "adjust last", then the tool's own. */
export function buildMeshOp(i: MeshOpInput): MeshOpView {
  const view = (kind: MeshOpKind, title: string, params: ModeOpParam[], o: Partial<MeshOpView> = {}): MeshOpView =>
    ({ kind, title, params, showApplyCancel: false, applyLabel: 'Apply', cancelLabel: 'Cancel', applyDisabled: false, ...o });
  const { sel, params: tp, caps } = i;

  if (i.transform) {
    const t = i.transform;
    const v = parseFloat(t.display);
    return view('transform', XF_LABEL[t.mode], [
      { id: 'axis', label: 'Axis', kind: 'axis', value: t.axis, title: 'Constrain to an axis (X / Y / Z)' },
      { id: 'amount', label: 'Amount', kind: 'number', value: Number.isFinite(v) ? v : 0, step: t.mode === 'rotate' ? 1 : 0.01,
        unit: XF_UNIT[t.mode] || undefined, disabled: !t.axis, title: t.axis ? 'Type the amount' : 'Pick an axis first' },
    ], { showApplyCancel: true, note: t.axis ? undefined : 'Move the pointer, or pick an axis and type' });
  }

  if (i.bevel) {
    const b = i.bevel;
    const name = b.kind === 'vertex' ? 'Chamfer' : 'Bevel';
    if (b.phase === 'pick') return view('bevel', name, [], { note: b.hint, showApplyCancel: true, applyDisabled: true });
    return view('bevel', name, [
      { id: 'amount', label: 'Amount', kind: 'number', value: b.amount, min: 0, max: b.maxAmount || undefined, step: 0.01 },
      { id: 'segments', label: 'Segments', kind: 'int', value: b.segments, min: 1, max: 32 },
      { id: 'snap', label: 'Snap', kind: 'toggle', value: b.snap, title: 'Round the amount to grid steps (Ctrl while dragging)' },
    ], { showApplyCancel: true, applyDisabled: b.amount <= 0, note: `${b.targets} ${b.kind === 'edge' ? 'edge(s)' : 'corner(s)'} · drag on the canvas` });
  }

  if (i.lastOp) {
    const label = LAST_OP_LABELS[i.lastOp.op] ?? i.lastOp.op;
    return view('adjust', `Adjust last: ${label}`, lastOpParams(i.lastOp),
      { showApplyCancel: true, applyLabel: 'Done', cancelLabel: 'Undo' });
  }

  switch (i.tool) {
    case 'select':
      return view('select', 'Select', selectActions(i.mode, sel, i.canBridge), { note: selectionLabel(i.mode, sel) });
    case 'move': case 'rotate': case 'scale': {
      const any = sel.vertices + sel.edges + sel.faces > 0;
      const k = KEYS[i.tool];
      return view(i.tool, toolTitle(i.tool), [btn('start', `Start (${k})`, `${toolTitle(i.tool)} by a typed amount (${k})`, !any)],
        { note: any ? (caps.dragMoves || caps.gizmo ? 'Drag the selection or the gizmo' : 'Start, then move the pointer') : 'Select something first' });
    }
    case 'extrude':
      return view('extrude', 'Extrude', [{ id: 'distance', label: 'Distance', kind: 'number', value: tp.extrudeDistance, step: 0.01, min: -100, max: 100 }],
        { showApplyCancel: true, applyLabel: 'Extrude', cancelLabel: 'Close', applyDisabled: !sel.faces,
          note: sel.faces ? plural(sel.faces, 'face', 'faces') : 'Select faces first' });
    case 'inset':
      return view('inset', 'Inset', [
        { id: 'amount', label: 'Thickness', kind: 'number', value: tp.insetAmount, step: 0.01, min: 0, max: 100 },
        { id: 'depth', label: 'Depth', kind: 'number', value: tp.insetDepth, step: 0.01, min: -100, max: 100,
          disabled: !caps.insetDepth, title: caps.insetDepth ? 'Move the inner faces in / out' : NEEDS_ENGINE_UPDATE },
      ], { showApplyCancel: true, applyLabel: 'Inset', cancelLabel: 'Close', applyDisabled: !sel.faces,
        note: sel.faces ? plural(sel.faces, 'face', 'faces') : 'Select faces first' });
    case 'loopcut':
      return view('loopcut', 'Loop Cut', [
        { id: 'count', label: 'Cuts', kind: 'int', value: tp.loopCutCount, min: 1, max: 64,
          disabled: !caps.multiLoopCut, title: caps.multiLoopCut ? 'Parallel cuts' : NEEDS_ENGINE_UPDATE },
        { id: 'position', label: 'Position', kind: 'number', value: tp.loopCutPosition, step: 0.05, min: 0, max: 1,
          title: '0–1 along the edge (0.5 = the middle)' },
      ], { showApplyCancel: true, applyLabel: 'Cut', cancelLabel: 'Close', applyDisabled: !sel.edges,
        note: caps.activeTool ? (sel.edges ? 'Tap an edge, or Cut through the selected one' : 'Tap an edge to cut') : (sel.edges ? undefined : 'Select an edge first') });
    case 'knife':
      if (caps.knifePoints) {
        return view('knife', 'Knife', [], {
          showApplyCancel: true, applyLabel: 'Cut', cancelLabel: i.knifePoints ? 'Clear' : 'Close', applyDisabled: i.knifePoints < 2,
          note: i.knifePoints ? `${plural(i.knifePoints, 'point', 'points')} · tap to add more` : 'Tap points on the surface',
        });
      }
      return view('knife', 'Knife', [], { showApplyCancel: true, applyLabel: 'Cut', cancelLabel: 'Close', applyDisabled: true,
        note: 'Drag a line across the mesh: it cuts on release' });
    case 'bevel':
      return view('bevel', 'Bevel', caps.bevel ? [btn('start', `Start (${KEYS.chamfer})`, 'Bevel the selected edges / chamfer the selected corners, or tap one')] : [],
        { note: caps.bevel ? 'Select edges or corners, then Start (or Start and tap one)' : NEEDS_ENGINE_UPDATE });
  }
}

// ── Radial menu ─────────────────────────────────────────────────────────────────────────────────────────────────

export type MeshRadialId = 'extrude' | 'inset' | 'subdivide' | 'delete' | 'loopcut' | 'bevel' | 'fill' | 'merge';

/** The long-press radial for an element kind (the one under the finger, else the selection mode). */
export function meshRadialItems(kind: MeshSelectMode, caps: MeshChromeCaps, sel: MeshSelCounts): ModeRadialItem[] {
  if (kind === 'face') {
    return [
      { id: 'extrude', label: 'Extrude', icon: 'svg:extrude' },
      { id: 'inset', label: 'Inset', icon: 'svg:inset' },
      { id: 'subdivide', label: 'Subdivide', icon: '⊞' },
      { id: 'delete', label: 'Delete', icon: 'svg:delete', danger: true },
    ];
  }
  if (kind === 'edge') {
    return [
      { id: 'loopcut', label: 'Loop Cut', icon: 'svg:loopcut' },
      { id: 'bevel', label: 'Bevel', icon: 'svg:bevel', disabled: !caps.bevel },
      { id: 'fill', label: 'Fill', icon: '◧' },
      { id: 'delete', label: 'Delete', icon: 'svg:delete', danger: true },
    ];
  }
  return [
    { id: 'merge', label: 'Merge', icon: 'svg:merge', disabled: sel.vertices < 2 },
    { id: 'bevel', label: 'Chamfer', icon: 'svg:bevel', disabled: !caps.bevel },
    { id: 'fill', label: 'Fill', icon: '◧' },
  ];
}

export const RADIAL_TITLES: Readonly<Record<MeshSelectMode, string>> = { vertex: 'Vertex', edge: 'Edge', face: 'Face' };
