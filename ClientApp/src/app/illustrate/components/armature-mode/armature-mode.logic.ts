import type ShapeManager from '@zaings/salsa/shape-manager';
import type { ModeOpParam, ModeRadialItem, ModeSegment } from '../mode-chrome/mode-chrome.types';
import { armatureKeyLabels } from '../illustration/mode-keymap';
import { armApi, NEEDS_ENGINE, type ArmEngineTool } from '../armature-panel/arm-engine';
import type { ArmRigService } from '../armature-panel/arm-rig.service';
import type { ArmBindingService } from '../armature-panel/arm-binding.service';

/**
 * The Armature mode's data and decisions (UI review 2026-10-07 §4, reworked to the round-2 feedback 2026-10-08), kept
 * out of the component so the specs can drive them: the Rig / Animate workspaces, the base tools (the MAIN toolbar's
 * Select / Move / Rotate) and the mode tools (icon buttons in the right panel), which engine calls each tool makes, the
 * operation pill's params per tool, the long-press radial, the remembered workspace and the timeline restore.
 */

export type ArmWorkspace = 'rig' | 'animate';
export type ArmToolId = ArmEngineTool | 'key';
export type ArmSegmentId = 'pose' | 'edit' | 'weight';

const KEYS = armatureKeyLabels();

export const ARM_WORKSPACES: ModeSegment[] = [
  { id: 'rig', label: 'Rig', title: 'Rig: bones, IK, constraints, binding, weights, springs' },
  { id: 'animate', label: 'Animate', title: 'Animate: poses, clips, NLA, libraries, retarget (shows the timeline)' },
];

/** The selection-type switch at the top of the right panel (Rig). Each picks its tool: Pose = Rotate, Edit Bones =
 *  Move, Weight = Weight Brush; the switch follows the tool picked on the main toolbar / the panel's tool buttons. */
export const ARM_SEGMENTS: ModeSegment[] = [
  { id: 'pose', label: 'Pose', key: KEYS.pose, title: 'Pose: rotate joints (FK)' },
  { id: 'edit', label: 'Edit Bones', key: KEYS.editBones, title: 'Edit Bones: move joints, add bones' },
  { id: 'weight', label: 'Weight', key: KEYS.weightMode, title: 'Weight: paint how strongly each joint moves the mesh' },
];

/** The tools the editor's MAIN toolbar drives while in Armature (its Select / Move / Rotate; mode-chrome/
 *  mode-toolbar-scope.ts MODE_RAIL_TOOLS.armature keeps them, + Pan, inside the mode). */
export type ArmBaseTool = 'select' | 'move' | 'rotate';
export const ARM_BASE_TOOLS: readonly ArmBaseTool[] = ['select', 'move', 'rotate'];
export function isArmBaseTool(t: string): t is ArmBaseTool { return (ARM_BASE_TOOLS as readonly string[]).includes(t); }

/** A mode tool: an icon-only button in the right panel (styled like the main toolbar's), tooltip = label + key. */
export interface ArmModeTool {
  id: ArmToolId;
  label: string;
  key: string;
  /** SVG path `d` strings on a 24 x 24 grid (stroked like the main toolbar's icons). */
  paths: readonly string[];
}

const ICON: Readonly<Record<'addbone' | 'ik' | 'weight' | 'key', readonly string[]>> = {
  addbone: ['M5 19L15 9', 'M15 9a2.5 2.5 0 1 0 0-.01', 'M18 16v6M15 19h6'],
  ik: ['M4 20l6-8 6 2 4-10', 'M4 20h.01M10 12h.01M16 14h.01M20 4h.01'],
  weight: ['M14 4l6 6-8 8H6v-6z', 'M4 20c1-2 2-3 4-3'],
  key: ['M12 3l9 9-9 9-9-9z'],
};

/** Rig's mode tools (keys from ARMATURE_KEYS). */
export const RIG_MODE_TOOLS: ArmModeTool[] = [
  { id: 'addbone', label: 'Add Bone', key: KEYS.addBone, paths: ICON.addbone },
  { id: 'ik', label: 'IK', key: KEYS.ik, paths: ICON.ik },
  { id: 'weight', label: 'Weight Brush', key: KEYS.weight, paths: ICON.weight },
];

/** Animate's mode tool: Key. */
export const ANIM_MODE_TOOLS: ArmModeTool[] = [
  { id: 'key', label: 'Key', key: KEYS.key, paths: ICON.key },
];

export function modeToolsFor(ws: ArmWorkspace): ArmModeTool[] { return ws === 'animate' ? ANIM_MODE_TOOLS : RIG_MODE_TOOLS; }

/** The tool a workspace switch keeps: a base tool always, a mode tool only when the new workspace has it (else the
 *  base tool). */
export function toolForWorkspace(ws: ArmWorkspace, tool: ArmToolId, base: ArmBaseTool = 'rotate'): ArmToolId {
  return isArmBaseTool(tool) || modeToolsFor(ws).some(t => t.id === tool) ? tool : base;
}

/** The switch segment a tool shows (Select / Key keep the last one). */
export function segmentForTool(tool: ArmToolId, last: ArmSegmentId): ArmSegmentId {
  if (tool === 'rotate' || tool === 'ik') return 'pose';
  if (tool === 'move' || tool === 'addbone') return 'edit';
  if (tool === 'weight') return 'weight';
  return last;
}

export function toolForSegment(seg: ArmSegmentId): ArmToolId {
  return seg === 'edit' ? 'move' : seg === 'weight' ? 'weight' : 'rotate';
}

/** The engine tool behind a tool (Key selects, like Select). */
export function engineTool(tool: ArmToolId): ArmEngineTool { return tool === 'key' ? 'select' : tool; }

// ── Tool switch → engine ────────────────────────────────────────────────────────────────────────────────────

export interface ArmToolCtx {
  sm: ShapeManager | null;
  rig: Pick<ArmRigService, 'setToolMode' | 'enterPlacement' | 'cancelPlacement' | 'activeSkeleton' | 'placementModeActive'>;
  binding: Pick<ArmBindingService, 'wpActive' | 'enterWeightPaint' | 'exitWeightPaint' | 'onWpBrushChange' | 'bindMeshId'>;
}
export interface ArmToolResult { ok: boolean; reason?: string; }

export const WEIGHT_NEEDS_BIND = 'Weight Brush needs a mesh bound to this skeleton (Rig › Bind Mesh)';
export const NEEDS_SKELETON = 'Create or pick a skeleton first';

/**
 * Switch the Armature tool from `from` to `to` and make the engine calls for it. A newer Salsa takes the tool itself
 * (setArmatureActiveTool3D: Select hides the gizmo, Add Bone keeps placing, IK taps select, Weight enters weight
 * paint). The old dist gets what it can: Rotate / Move = setArmatureToolMode3D, Add Bone = one bone placement, Weight =
 * the panel's weight paint, Select / IK / Key = the Rotate gizmo (taps still select). `ok: false` = the tool could not
 * apply; the caller keeps `from`.
 */
export function switchArmTool(ctx: ArmToolCtx, from: ArmToolId, to: ArmToolId): ArmToolResult {
  const { sm, rig, binding } = ctx;
  const api = armApi(sm);
  const hasTool = typeof api.setArmatureActiveTool3D === 'function';
  if ((to === 'addbone' || to === 'weight') && !rig.activeSkeleton) return { ok: false, reason: NEEDS_SKELETON };
  if (to === 'weight' && !binding.wpActive && !binding.bindMeshId && !hasTool) return { ok: false, reason: WEIGHT_NEEDS_BIND };

  // Leave the old tool
  if (from === 'addbone' && to !== 'addbone' && rig.placementModeActive) rig.cancelPlacement();
  if (from === 'weight' && to !== 'weight' && binding.wpActive) binding.exitWeightPaint();

  if (to === 'weight') {
    if (!binding.wpActive && hasTool && api.setArmatureActiveTool3D('weight')) {
      binding.wpActive = sm?.isWeightPainting3D?.() ?? true;
      binding.onWpBrushChange();   // the brush settings the pill / panel hold
    }
    if (!binding.wpActive && binding.bindMeshId) {
      binding.enterWeightPaint();
      binding.wpActive = sm?.isWeightPainting3D?.() ?? binding.wpActive;
      if (binding.wpActive && hasTool) api.setArmatureActiveTool3D('weight');   // hide the gizmo (already painting)
    }
    return binding.wpActive ? { ok: true } : { ok: false, reason: WEIGHT_NEEDS_BIND };
  }

  if (to === 'rotate' || to === 'move') rig.setToolMode(to);
  else if (!hasTool) rig.setToolMode('rotate');

  if (hasTool) {
    const ok = api.setArmatureActiveTool3D(engineTool(to));
    if (!ok && to === 'addbone') return { ok: false, reason: NEEDS_SKELETON };
  } else if (to === 'addbone' && !rig.placementModeActive) {
    rig.enterPlacement();
  }
  return { ok: true };
}

// ── Operation pill per tool ────────────────────────────────────────────────────────────────────────────────

export interface ArmOpState {
  workspace: ArmWorkspace;
  hasSkeleton: boolean;
  joints: ReadonlyArray<{ name: string }>;
  selectedIdx: number | null;
  selectionCount: number;
  /** Rotate / Move typed amount. */
  axis: 'x' | 'y' | 'z' | null;
  rotateDeg: number;
  moveAmount: number;
  /** Add Bone. */
  newBoneName: string;
  placing: boolean;
  /** IK of the selected joint. */
  ik: { exists: boolean; enabled: boolean; chainLength: number; poleJointIdx: number | null; intermediate: boolean };
  hasPoleApi: boolean;
  /** The armed one-shot pick (ArmPickService id), if any. */
  pickArmed: string | null;
  /** Weight Brush. */
  weight: { active: boolean; mode: 'add' | 'remove' | 'set'; radius: number; strength: number; weight: number };
  /** Key. */
  clips: ReadonlyArray<{ id: string; name: string }>;
  clipIdx: number | null;
  keyFrame: number;
  /** Rename (the radial's Rename): the joint being renamed + the draft. */
  renameIdx: number | null;
  renameDraft: string;
}

export interface ArmOpPill {
  title: string;
  params: ModeOpParam[];
  showApplyCancel: boolean;
  applyLabel?: string;
}

/** The pill with nothing to set (the Select tool): only its Frame button shows. */
export const ARM_EMPTY_PILL: ArmOpPill = { title: '', params: [], showApplyCancel: false };

const AXES = [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }, { id: 'z', label: 'Z' }];

function jointOptions(s: ArmOpState, none: string | null, exclude: number | null = null): { id: string; label: string }[] {
  const out = none !== null ? [{ id: '', label: none }] : [];
  s.joints.forEach((j, i) => { if (i !== exclude) out.push({ id: String(i), label: j.name }); });
  return out;
}

/**
 * The pill for the active tool (always shown in Armature: it carries the Frame button). Select: nothing else
 * (ARM_EMPTY_PILL). Rotate / Move: axis chips + a typed amount, Apply. Add Bone: the new bone's name + "Add child to
 * <joint>" + tap-to-place. IK: on / off, chain length, pole joint (dropdown or a one-shot tap). Weight Brush: target
 * joint (dropdown or tap), Add / Remove / Set, radius, strength (+ the Set weight). Key: the clip, the frame and Key
 * pose. A pending Rename takes the pill over. No notes (round-2 feedback: the pill's name is enough).
 */
export function buildArmOpPill(tool: ArmToolId, s: ArmOpState): ArmOpPill {
  const sel = s.selectedIdx !== null ? s.joints[s.selectedIdx]?.name ?? null : null;
  if (s.renameIdx !== null && s.joints[s.renameIdx]) {
    return {
      title: 'Rename joint', showApplyCancel: true, applyLabel: 'Rename',
      params: [{ id: 'renameDraft', label: 'Name', kind: 'text', value: s.renameDraft }],
    };
  }
  const many = s.selectionCount > 1 ? `${s.selectionCount} joints` : sel;
  switch (tool) {
    case 'rotate':
    case 'move': {
      const rot = tool === 'rotate';
      return {
        title: rot ? 'Rotate' : 'Move', showApplyCancel: true,
        params: [
          { id: 'axis', label: 'Axis', kind: 'axis', value: s.axis, options: AXES, disabled: !many },
          rot
            ? { id: 'rotateDeg', label: 'Angle', kind: 'number', value: s.rotateDeg, step: 1, unit: '°', min: -360, max: 360, disabled: !many || !s.axis }
            : { id: 'moveAmount', label: 'Amount', kind: 'number', value: s.moveAmount, step: 0.01, min: -10, max: 10, disabled: !many || !s.axis },
        ],
      };
    }
    case 'addbone':
      return {
        title: 'Add Bone', showApplyCancel: false,
        params: [
          { id: 'newBoneName', label: 'Name', kind: 'text', value: s.newBoneName, disabled: !s.hasSkeleton, title: 'The new bone\'s name (empty: joint_N)' },
          { id: 'addChild', label: sel ? `Add child to ${sel}` : 'Add root bone', kind: 'button', value: null, disabled: !s.hasSkeleton },
          { id: 'placing', label: 'Tap to place', kind: 'toggle', value: s.placing, disabled: !s.hasSkeleton, title: 'Place bones by tapping the mesh' },
        ],
      };
    case 'ik': {
      const can = !!sel && !s.ik.intermediate;
      const poleTitle = !s.hasPoleApi ? NEEDS_ENGINE : 'The joint the bend points at';
      return {
        title: 'IK', showApplyCancel: false,
        params: [
          { id: 'ikEnabled', label: 'IK on', kind: 'toggle', value: s.ik.exists && s.ik.enabled, disabled: !can },
          { id: 'ikChainLength', label: 'Chain', kind: 'int', value: s.ik.chainLength, min: 2, max: 64, step: 1, unit: ' bones', disabled: !can },
          { id: 'ikPole', label: 'Pole', kind: 'select', value: s.ik.poleJointIdx === null ? '' : String(s.ik.poleJointIdx),
            options: jointOptions(s, 'None', s.selectedIdx), disabled: !can || !s.ik.exists || !s.hasPoleApi, title: poleTitle },
          { id: 'pickPole', label: s.pickArmed === 'ik-pole' ? 'Tap a joint…' : 'Pick pole', kind: 'button', value: null,
            disabled: !can || !s.ik.exists || !s.hasPoleApi, title: s.hasPoleApi ? 'Tap the pole joint in the viewport' : NEEDS_ENGINE },
        ],
      };
    }
    case 'weight': {
      const w = s.weight;
      const params: ModeOpParam[] = [
        { id: 'wpJoint', label: 'Joint', kind: 'select', value: s.selectedIdx === null ? '' : String(s.selectedIdx),
          options: s.selectedIdx === null ? jointOptions(s, 'Pick a joint…') : jointOptions(s, null) },
        { id: 'pickJoint', label: s.pickArmed === 'weight-joint' ? 'Tap a joint…' : 'Pick', kind: 'button', value: null, title: 'Tap the joint to paint in the viewport' },
        { id: 'wpMode', label: 'Mode', kind: 'choice', value: w.mode,
          options: [{ id: 'add', label: 'Add' }, { id: 'remove', label: 'Remove' }, { id: 'set', label: 'Set' }] },
        { id: 'wpRadius', label: 'Radius', kind: 'number', value: w.radius, min: 0.02, max: 0.5, step: 0.01 },
        { id: 'wpStrength', label: 'Strength', kind: 'number', value: w.strength, min: 0, max: 1, step: 0.01 },
      ];
      if (w.mode === 'set') params.push({ id: 'wpWeight', label: 'Weight', kind: 'number', value: w.weight, min: 0, max: 1, step: 0.01 });
      return { title: 'Weight Brush', showApplyCancel: false, params };
    }
    case 'key': {
      const clip = s.clipIdx !== null ? s.clips[s.clipIdx] ?? null : null;
      return {
        title: 'Key', showApplyCancel: false,
        params: [
          { id: 'keyClip', label: 'Clip', kind: 'select', value: clip ? String(s.clipIdx) : '',
            options: [...(clip ? [] : [{ id: '', label: 'Pick a clip…' }]), ...s.clips.map((c, i) => ({ id: String(i), label: c.name }))],
            disabled: !s.clips.length },
          { id: 'keyFrame', label: 'Frame', kind: 'int', value: s.keyFrame, min: 0, max: 100000, step: 1, disabled: !clip },
          { id: 'keyPose', label: 'Key pose', kind: 'button', value: null, disabled: !clip, title: 'Record the current pose at this frame' },
        ],
      };
    }
    default:
      return ARM_EMPTY_PILL;
  }
}

// ── Long-press radial on a joint ────────────────────────────────────────────────────────────────────────────

export interface ArmRadialState { hasIK: boolean; intermediate: boolean; workspace: ArmWorkspace; }

/** Add Child / IK / Rename / Frame / Delete (Delete asks first: removing a bone has no undo). Animate: no rigging. */
export function armRadialItems(s: ArmRadialState): ModeRadialItem[] {
  if (s.workspace === 'animate') {
    return [
      { id: 'key', label: 'Key pose', icon: '◆' },
      { id: 'frame', label: 'Frame', icon: '⌖' },
      { id: 'rotate', label: 'Rotate', icon: 'svg:rotate' },
    ];
  }
  return [
    { id: 'child', label: 'Child', icon: 'svg:child' },   // Add Child: "Child" fits a finger-sized target
    { id: 'ik', label: s.hasIK ? 'IK settings' : 'IK', icon: 'svg:ik', disabled: s.intermediate },
    { id: 'rename', label: 'Rename', icon: '✎' },
    { id: 'frame', label: 'Frame', icon: '⌖' },
    { id: 'delete', label: 'Delete', icon: 'svg:delete', danger: true },
  ];
}

// ── Classic fallback ────────────────────────────────────────────────────────────────────────────────────────

/**
 * IllustrationComponent.useModeChrome.armature as a live switch over Experimental › Classic Armature panel: reads ON
 * unless the setting is on (the old <app-armature-panel>); writing it flips the setting. Returns `switches`.
 */
export function followClassicArmature<T extends { armature: boolean }>(switches: T,
    exp: { readonly classicArmature: boolean; toggleClassicArmature(): void }): T {
  return Object.defineProperty(switches, 'armature', {
    enumerable: true,
    configurable: true,
    get: () => !exp.classicArmature,
    set: (on: boolean) => { if (!!on === exp.classicArmature) exp.toggleClassicArmature(); },
  });
}

// ── Remembered workspace (localStorage, per machine) ─────────────────────────────────────────────────────────

export const ARM_WORKSPACE_KEY = 'fm.armature.workspace';

export function loadArmWorkspace(storage: Pick<Storage, 'getItem'> | null = safeLocalStorage()): ArmWorkspace {
  try { return storage?.getItem(ARM_WORKSPACE_KEY) === 'animate' ? 'animate' : 'rig'; } catch { return 'rig'; }
}

export function saveArmWorkspace(ws: ArmWorkspace, storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()): void {
  try { storage?.setItem(ARM_WORKSPACE_KEY, ws); } catch { /* storage blocked: this session only */ }
}

function safeLocalStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

// ── Timeline while in Animate ───────────────────────────────────────────────────────────────────────────────

/**
 * Animate shows the editor's animation timeline (animationEnabled); leaving Animate (Rig, leaving Armature) puts it
 * back the way the user had it. enter() remembers the state once (re-entering keeps the first remembered value).
 */
export class ArmTimelineGuard {
  private saved: boolean | null = null;

  get active(): boolean { return this.saved !== null; }

  enter(get: () => boolean, set: (on: boolean) => void): void {
    if (this.saved === null) this.saved = get();
    if (!get()) set(true);
  }

  leave(get: () => boolean, set: (on: boolean) => void): void {
    if (this.saved === null) return;
    const prev = this.saved;
    this.saved = null;
    if (get() !== prev) set(prev);
  }
}
