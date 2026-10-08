/**
 * Edit Mesh on the mode chrome (UI review 2026-10-07 §4, reworked to the round-2 tablet feedback 2026-10-08: no header
 * bar or tool strip — the main toolbar's Select / Pan / Move / Rotate / Scale stay, the mode's own tools are icon
 * buttons in the right panel): the data the right panel, the op pill and the radial menu show, and how a tool maps
 * onto the engine. Plain functions (testable without a DOM or an engine).
 *
 * The engine calls of the redesign (salsa docs/reviews/section4-engine-api.md) are newer than the Salsa dist
 * Frogmarks may be building against: every one is feature-detected (MeshChromeCaps) and has a fallback or a disabled
 * control ("Needs the engine update").
 */
import type { BevelState } from '../illustration/editor-keymap';
import { meshEditKeyLabels } from '../illustration/mode-keymap';
import type { ModeOpParam, ModeRadialItem, ModeSegment } from '../mode-chrome/mode-chrome.types';

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
  /** setAdditiveSelect3D (touch / pen: taps add to the selection). */
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

// ── Right panel: the selection-type switch and the tools ────────────────────────────────────────────────────────

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

/** The tool names (the op pill's title). Select / Move / Rotate / Scale are the main toolbar's. */
const TOOL_LABELS: Readonly<Record<MeshToolId, string>> = {
  select: 'Select', move: 'Move', rotate: 'Rotate', scale: 'Scale', extrude: 'Extrude', inset: 'Inset', loopcut: 'Loop Cut',
  knife: 'Knife', bevel: 'Bevel',
};

/** One-shot ops on the selection (the panel's verb buttons; the radial menu runs some of them too). */
export type MeshVerbId = 'delete' | 'dissolve' | 'subdivide' | 'flip' | 'separate' | 'merge' | 'bridge';

/** A right-panel button: a tool (stays on; tapping it again turns it off) or a verb (runs once on the selection). */
export interface MeshPanelTool {
  id: MeshToolId | MeshVerbId;
  kind: 'tool' | 'verb';
  label: string;
  /** The tooltip (the buttons are icon-only). */
  title: string;
  /** 'svg:<id>' (mode-icons.ts) or a local icon id (MESH_PANEL_ICONS). */
  icon: string;
  disabled: boolean;
}

/** Icons the shared set (mode-icons.ts) does not have: 24 × 24 path lists, stroked. */
export const MESH_PANEL_ICONS: Readonly<Record<string, readonly string[]>> = {
  dissolve: ['M4 4h16v16H4z', 'M12 4v16', 'M9 9l6 6M15 9l-6 6'],
  subdivide: ['M4 4h16v16H4z', 'M12 4v16M4 12h16'],
  flip: ['M4 20L12 4l8 16z', 'M12 10v5', 'M10 13l2 2 2-2'],
  separate: ['M3 6h8v12H3z', 'M14 6h7v12h-7z', 'M12 3v18'],
  bridge: ['M3 6h4v12H3zM17 6h4v12h-4z', 'M7 9h10M7 15h10'],
};

const key = (k: string): string => (k ? ` (${k})` : '');

/** The panel tools per selection type (Select / Move / Rotate / Scale are the main toolbar's and apply everywhere). */
const MODE_TOOLS: Readonly<Record<MeshSelectMode, readonly MeshToolId[]>> = {
  face: ['extrude', 'inset', 'loopcut', 'knife'],
  edge: ['loopcut', 'bevel', 'knife'],
  vertex: ['bevel', 'knife'],
};
/** The tool is offered in this selection type (switching Vertex / Edge / Face drops a tool that is not). */
export function meshToolAppliesTo(tool: MeshToolId, mode: MeshSelectMode): boolean {
  return tool === 'select' || tool === 'move' || tool === 'rotate' || tool === 'scale' || MODE_TOOLS[mode].includes(tool);
}

/**
 * The right panel's tools for the selection type: only what applies to it. Face: Extrude, Inset, Loop Cut, Knife,
 * then Delete, Subdivide, Flip, Separate. Edge: Loop Cut, Bevel, Knife, then Dissolve, Bridge. Vertex: Chamfer (the
 * Bevel tool on corners), Knife, then Merge, Bridge. A verb is greyed out until the selection fits it.
 */
export function meshPanelTools(mode: MeshSelectMode, caps: MeshChromeCaps, sel: MeshSelCounts, canBridge: boolean): MeshPanelTool[] {
  const tool = (id: MeshToolId, title: string, disabled = false): MeshPanelTool =>
    ({ id, kind: 'tool', label: TOOL_LABELS[id], title, icon: `svg:${id}`, disabled });
  const verb = (id: MeshVerbId, label: string, title: string, icon: string, disabled: boolean): MeshPanelTool =>
    ({ id, kind: 'verb', label, title, icon, disabled });
  const bevel = (label: string): MeshPanelTool => tool('bevel', caps.bevel ? `${label}${key(KEYS.chamfer)}` : NEEDS_ENGINE_UPDATE, !caps.bevel);
  const loopCut = tool('loopcut', `Loop Cut${key(KEYS.loopCut)}`);
  const knife = tool('knife', `Knife${key(KEYS.knife)}`);
  const bridge = verb('bridge', 'Bridge Loops', 'Bridge Loops', 'bridge', !canBridge);
  if (mode === 'face') {
    const none = sel.faces === 0;
    return [
      tool('extrude', `Extrude${key(KEYS.extrude)}`), tool('inset', `Inset${key(KEYS.inset)}`), loopCut, knife,
      verb('delete', 'Delete', `Delete${key(KEYS.delete)}`, 'svg:delete', none),
      verb('subdivide', 'Subdivide', 'Subdivide', 'subdivide', none),
      verb('flip', 'Flip Normals', 'Flip Normals', 'flip', none),
      verb('separate', 'Separate', 'Separate', 'separate', none),
    ];
  }
  if (mode === 'edge') {
    return [loopCut, bevel('Bevel'), knife, verb('dissolve', 'Dissolve', `Dissolve${key(KEYS.delete)}`, 'dissolve', sel.edges === 0), bridge];
  }
  const chamfer = bevel('Chamfer');
  return [{ ...chamfer, label: 'Chamfer' }, knife, verb('merge', 'Merge', 'Merge', 'svg:merge', sel.vertices < 2), bridge];
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

const btn = (id: string, label: string, title: string, disabled = false): ModeOpParam => ({ id, label, kind: 'button', value: null, title, disabled });

/**
 * The op pill for the current state (round-2 feedback: no hint text; the name is enough): a running transform /
 * Chamfer first, then "adjust last", then the active panel tool's parameters + Apply. Select / Move / Rotate / Scale
 * (the main toolbar's tools) have no parameters: the pill then shows only its Frame button (title '').
 */
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
    ], { showApplyCancel: true });
  }

  if (i.bevel) {
    const b = i.bevel;
    const name = b.kind === 'vertex' ? 'Chamfer' : 'Bevel';
    if (b.phase === 'pick') return view('bevel', name, [], { showApplyCancel: true, applyDisabled: true });
    return view('bevel', name, [
      { id: 'amount', label: 'Amount', kind: 'number', value: b.amount, min: 0, max: b.maxAmount || undefined, step: 0.01 },
      { id: 'segments', label: 'Segments', kind: 'int', value: b.segments, min: 1, max: 32 },
      { id: 'snap', label: 'Snap', kind: 'toggle', value: b.snap, title: 'Round the amount to grid steps (Ctrl while dragging)' },
    ], { showApplyCancel: true, applyDisabled: b.amount <= 0 });
  }

  if (i.lastOp) {
    const label = LAST_OP_LABELS[i.lastOp.op] ?? i.lastOp.op;
    return view('adjust', `Adjust last: ${label}`, lastOpParams(i.lastOp), { showApplyCancel: true });
  }

  switch (i.tool) {
    case 'select': case 'move': case 'rotate': case 'scale':
      return view(i.tool, '', []);
    case 'extrude':
      return view('extrude', 'Extrude', [{ id: 'distance', label: 'Distance', kind: 'number', value: tp.extrudeDistance, step: 0.01, min: -100, max: 100 }],
        { showApplyCancel: true, applyLabel: 'Extrude', applyDisabled: !sel.faces });
    case 'inset':
      return view('inset', 'Inset', [
        { id: 'amount', label: 'Thickness', kind: 'number', value: tp.insetAmount, step: 0.01, min: 0, max: 100 },
        { id: 'depth', label: 'Depth', kind: 'number', value: tp.insetDepth, step: 0.01, min: -100, max: 100,
          disabled: !caps.insetDepth, title: caps.insetDepth ? 'Move the inner faces in / out' : NEEDS_ENGINE_UPDATE },
      ], { showApplyCancel: true, applyLabel: 'Inset', applyDisabled: !sel.faces });
    case 'loopcut':
      return view('loopcut', 'Loop Cut', [
        { id: 'count', label: 'Cuts', kind: 'int', value: tp.loopCutCount, min: 1, max: 64,
          disabled: !caps.multiLoopCut, title: caps.multiLoopCut ? 'Parallel cuts' : NEEDS_ENGINE_UPDATE },
        { id: 'position', label: 'Position', kind: 'number', value: tp.loopCutPosition, step: 0.05, min: 0, max: 1,
          title: '0–1 along the edge (0.5 = the middle)' },
      ], { showApplyCancel: true, applyLabel: 'Cut', applyDisabled: !sel.edges });
    case 'knife':
      return view('knife', 'Knife', [], {
        showApplyCancel: true, applyLabel: 'Cut', applyDisabled: !caps.knifePoints || i.knifePoints < 2,
      });
    case 'bevel':
      return view('bevel', 'Bevel', caps.bevel ? [btn('start', `Start (${KEYS.chamfer})`, 'Bevel the selected edges / chamfer the selected corners, or tap one')] : []);
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
