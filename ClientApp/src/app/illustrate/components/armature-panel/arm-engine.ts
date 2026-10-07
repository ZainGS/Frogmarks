import type ShapeManager from '@zaings/salsa/shape-manager';

/**
 * The Salsa calls behind the Armature mode chrome (UI review 2026-10-07 §4; salsa docs/reviews/section4-engine-api.md).
 * They are newer than the Salsa dist this app may be built against, so they are declared here as optional and every
 * call is guarded (`typeof api.x === 'function'`); a control that truly needs a missing one is shown disabled with
 * NEEDS_ENGINE as its tooltip. Everything the old dist can do keeps working without them.
 */
export interface ArmJointRef { skeletonId: string; jointIndex: number; }
export type ArmEngineTool = 'select' | 'rotate' | 'move' | 'addbone' | 'ik' | 'weight';
export interface ArmIKInfo {
  chainId: string;
  chainLength: number;
  poleJointIndex: number | null;
  enabled: boolean;
  target?: [number, number, number];
  poleTarget?: [number, number, number] | null;
}

export interface ArmatureChromeEngineApi {
  pickArmatureJointAt3D?(clientX: number, clientY: number): { skeletonId: string; jointIndex: number; jointName: string } | null;
  selectArmatureJoint3D?(skeletonId: string, jointIndex: number, additive?: boolean): boolean;
  getSelectedArmatureJoints3D?(): ArmJointRef[];
  onArmatureJointSelectionChanged?(cb: (sel: ArmJointRef[]) => void): () => void;
  setArmatureActiveTool3D?(tool: ArmEngineTool): boolean;
  getArmatureActiveTool3D?(): ArmEngineTool;
  addArmatureChildJoint3D?(skeletonId: string, parentJointIndex: number, name?: string): number;
  setArmatureIK3D?(skeletonId: string, jointIndex: number, opts: { chainLength: number; poleJointIndex?: number | null; enabled: boolean }): string | null;
  getArmatureIK3D?(skeletonId: string, jointIndex: number): ArmIKInfo | null;
  /** TOUCH-10 additive latch (the header's Multi). */
  setAdditiveSelect3D?(on: boolean): void;
  getAdditiveSelect3D?(): boolean;
}

/** Tooltip of a control whose engine call is missing from this Salsa dist. */
export const NEEDS_ENGINE = 'Needs the engine update';

/** The engine handle seen through the optional newer calls (never `any`: the names are type-checked here). */
export function armApi(sm: ShapeManager | null | undefined): ArmatureChromeEngineApi {
  return (sm ?? {}) as unknown as ArmatureChromeEngineApi;
}

export function hasArmApi(sm: ShapeManager | null | undefined, name: keyof ArmatureChromeEngineApi): boolean {
  return typeof armApi(sm)[name] === 'function';
}

/** The old dist's projection (getJointScreenPositions3D, canvas px) as a client-point pick: the nearest joint within
 *  `radius` CSS px of (clientX, clientY), or null. */
export function pickJointFromScreenPositions(
  positions: ReadonlyArray<{ index: number; name: string; x: number; y: number }>,
  rect: { left: number; top: number }, clientX: number, clientY: number, radius = 24,
): { jointIndex: number; jointName: string } | null {
  let best: { jointIndex: number; jointName: string } | null = null;
  let bestD = radius;
  for (const p of positions) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const d = Math.hypot(rect.left + p.x - clientX, rect.top + p.y - clientY);
    if (d <= bestD) { bestD = d; best = { jointIndex: p.index, jointName: p.name }; }
  }
  return best;
}

/**
 * The joint of skeleton `skeletonId` under a client point: Salsa's pickArmatureJointAt3D when the dist has it, else the
 * old dist's getJointScreenPositions3D projected onto `canvas` (the 3D canvas element). Null = no joint there.
 */
export function pickArmatureJoint(sm: ShapeManager | null | undefined, skeletonId: string | null | undefined,
                                  clientX: number, clientY: number, canvas: Element | null | undefined): { jointIndex: number; jointName: string } | null {
  if (!sm || !skeletonId) return null;
  const api = armApi(sm);
  if (typeof api.pickArmatureJointAt3D === 'function') {
    const hit = api.pickArmatureJointAt3D(clientX, clientY);
    return hit && hit.skeletonId === skeletonId ? { jointIndex: hit.jointIndex, jointName: hit.jointName } : null;
  }
  if (!canvas || typeof sm.getJointScreenPositions3D !== 'function') return null;
  const r = canvas.getBoundingClientRect();
  return pickJointFromScreenPositions(sm.getJointScreenPositions3D(skeletonId, r.width, r.height) ?? [], r, clientX, clientY);
}

/** Select a joint of the shown skeleton: selectArmatureJoint3D (multi-select aware) when present, else selectJoint3D. */
export function selectArmatureJoint(sm: ShapeManager | null | undefined, skeletonId: string, jointIndex: number, additive = false): void {
  if (!sm) return;
  const api = armApi(sm);
  if (typeof api.selectArmatureJoint3D === 'function' && api.selectArmatureJoint3D(skeletonId, jointIndex, additive)) return;
  sm.selectJoint3D(jointIndex);
}
