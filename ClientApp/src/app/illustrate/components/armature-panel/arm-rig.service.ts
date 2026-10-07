import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { ArmatureHost, ArmatureJoint, ArmatureSkeleton } from './arm-session';
import { armApi } from './arm-engine';

/** What ArmRigService reads / writes on the panel. */
export type ArmRigHost = Pick<ArmatureHost,
  'shapeManager' | 'anim' | 'binding' | 'initialMeshId' | 'library' | 'spring'
>;

/**
 * Rig editing: skeletons, joints (select / rename / place / remove / visibility), rotation + tool mode, IK chains + pole targets, bone constraints.
 * Panel-scoped (provided by both Armature hosts — the classic ArmaturePanelComponent and the mode chrome's
 * ArmatureModeComponent — and bound in their constructors). Bodies moved verbatim from
 * armature-panel.component (audit Phase 5.5).
 */
@Injectable()
export class ArmRigService {
  private host!: ArmRigHost;
  bind(host: ArmRigHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }
  private get sm(): ShapeManager { return this.host.shapeManager; }

  skeletons: ArmatureSkeleton[] = [];

  activeSkeleton: ArmatureSkeleton | null = null;

  newSkeletonName = 'Skeleton';

  joints: ArmatureJoint[] = [];

  placementModeActive = false;

  placementPhase: 'head' | 'tail' | null = null;

  selectedJointIsTail = false;

  _placementJointCount = 0;

  skeletonsCollapsed = false;

  /** Open by default: the section only shows once a skeleton exists, and it is where rigging starts. */
  jointsCollapsed = false;

  armatureToolMode: 'move' | 'rotate' = 'rotate';

  showSpringBones = true;

  showFkBones = true;

  selectedJointIdx: number | null = null;

  renamingIdx: number | null = null;

  renameValue = '';

  moveX = 0;

  moveY = 0;

  moveZ = 0;

  tailX = 0;

  tailY = 0.3;

  tailZ = 0;

  rotX = 0;

  rotY = 0;

  rotZ = 0;

  ikChains: any[] = [];

  ikEndSet = new Set<number>();

  ikIntermediateSet = new Set<number>();

  ikChainLength = 3;

  ikBlendWeight = 1;

  ikTargetX = 0; ikTargetY = 0; ikTargetZ = 0;

  ikPoleX = 0; ikPoleY = 0; ikPoleZ = 0;

  get selectedJointIKChain(): any | null {
    if (this.selectedJointIdx === null) return null;
    return this.ikChains.find((c: any) => c.endJointIdx === this.selectedJointIdx) ?? null;
  }

  get isIKIntermediate(): boolean {
    if (this.selectedJointIdx === null) return false;
    return this.ikIntermediateSet.has(this.selectedJointIdx);
  }

  constraintsCollapsed = false;

  constraints: any[] = [];

  newConstraintType: 'lookAt' | 'copyRotation' | 'stretchTo' = 'lookAt';

  newConstraintTarget = 0;

  newConstraintAxis: 'x' | 'y' | 'z' = 'y';

  newConstraintInfluence = 1.0;

  newConstraintVolumePreserve = 0.5;

  _applyJointSelection(idx: number): void {
    this.selectedJointIdx = idx;
    this.renamingIdx = null;
    const j = this.joints[idx];
    if (j) {
      this.moveX = j.x; this.moveY = j.y; this.moveZ = j.z;
      this.tailX = j.tailOffset[0]; this.tailY = j.tailOffset[1]; this.tailZ = j.tailOffset[2];
    }
    this._syncRotationInputs(idx);
    this._syncIKInputs();
    this.refreshConstraints();
    this.defaultConstraintTarget();
  }

  _syncIKInputs(): void {
    const chain = this.selectedJointIKChain;
    this.ikPoleJointIdx = null;
    const getIK = armApi(this.sm).getArmatureIK3D;
    if (chain && this.activeSkeleton && this.selectedJointIdx !== null && typeof getIK === 'function') {
      this.ikPoleJointIdx = getIK.call(this.sm, this.activeSkeleton.id, this.selectedJointIdx)?.poleJointIndex ?? null;
    }
    if (!chain) return;
    this.ikChainLength = chain.chainLength ?? 3;
    this.ikBlendWeight = chain.blendWeight ?? 1;
    const t = chain.target ?? [0, 0, 0];
    this.ikTargetX = t[0]; this.ikTargetY = t[1]; this.ikTargetZ = t[2];
    if (chain.poleTarget) {
      const p = chain.poleTarget;
      this.ikPoleX = p[0]; this.ikPoleY = p[1]; this.ikPoleZ = p[2];
    }
  }

  _syncRotationInputs(idx: number): void {
    if (!this.activeSkeleton) return;
    const q: [number,number,number,number] = this.sm?.getJointRotation3D(this.activeSkeleton.id, idx) ?? [0,0,0,1];
    [this.rotX, this.rotY, this.rotZ] = this._quatToEulerDeg(q);
  }

  private _quatToEulerDeg(q: [number,number,number,number]): [number,number,number] {
    const [x, y, z, w] = q;
    const rx = Math.atan2(2*(w*x + y*z), 1 - 2*(x*x + y*y));
    const sinp = 2*(w*y - z*x);
    const ry = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
    const rz = Math.atan2(2*(w*z + x*y), 1 - 2*(y*y + z*z));
    return [rx * 180/Math.PI, ry * 180/Math.PI, rz * 180/Math.PI];
  }

  private _eulerDegToQuat(rx: number, ry: number, rz: number): [number,number,number,number] {
    const [cx, sx] = [Math.cos(rx*Math.PI/360), Math.sin(rx*Math.PI/360)];
    const [cy, sy] = [Math.cos(ry*Math.PI/360), Math.sin(ry*Math.PI/360)];
    const [cz, sz] = [Math.cos(rz*Math.PI/360), Math.sin(rz*Math.PI/360)];
    return [
      sx*cy*cz + cx*sy*sz,
      cx*sy*cz - sx*cy*sz,
      cx*cy*sz + sx*sy*cz,
      cx*cy*cz - sx*sy*sz,
    ];
  }

  setBoneVisibility(showSpring: boolean, showFk: boolean): void {
    this.sm?.setBoneVisibility3D(showSpring, showFk);
  }

  setToolMode(mode: 'move' | 'rotate'): void {
    this.armatureToolMode = mode;
    this.sm?.setArmatureToolMode3D(mode);
    if (mode === 'rotate' && this.selectedJointIdx !== null) {
      this._syncRotationInputs(this.selectedJointIdx);
    }
  }

  applyRotation(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    const q = this._eulerDegToQuat(this.rotX, this.rotY, this.rotZ);
    this.sm?.setJointRotation3D(this.activeSkeleton.id, this.selectedJointIdx, q);
  }

  resetRotation(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    this.sm?.resetJointRotation3D(this.activeSkeleton.id, this.selectedJointIdx);
    this._syncRotationInputs(this.selectedJointIdx);
  }

  resetAllRotations(): void {
    if (!this.activeSkeleton) return;
    this.sm?.resetAllJointRotations3D(this.activeSkeleton.id);
    if (this.selectedJointIdx !== null) this._syncRotationInputs(this.selectedJointIdx);
  }

  refreshSkeletons(): void {
    const raw: any[] = this.sm?.getAllSkeletons3D() ?? [];
    this.skeletons = raw.map((sk: any) => ({ id: sk.id, name: sk.name }));

    if (this.activeSkeleton) {
      const still = this.skeletons.find(s => s.id === this.activeSkeleton!.id);
      if (!still) {
        this.activeSkeleton = this.skeletons[0] ?? null;
        this.sm?.showBoneOverlay3D(this.activeSkeleton?.id ?? null, this.host.binding.bindMeshId || undefined);
      }
    } else if (this.skeletons.length > 0) {
      // Prefer the skeleton bound to the initial mesh (e.g. the selected character)
      const boundId = this.host.initialMeshId ? this.sm?.getSkeletonIdForMesh3D(this.host.initialMeshId) : null;
      const preferred = boundId ? this.skeletons.find(s => s.id === boundId) : null;
      this.activeSkeleton = preferred ?? this.skeletons[0];
      this.sm?.showBoneOverlay3D(this.activeSkeleton.id, this.host.binding.bindMeshId || undefined);
    }

    if (!this.host.binding.bindSkeletonId && this.skeletons.length) this.host.binding.bindSkeletonId = this.skeletons[0].id;
    this.refreshJoints();
    this.host.anim.refreshClips();
    void this.host.library.refreshPresetPoses();
  }

  selectSkeleton(sk: ArmatureSkeleton): void {
    this.sm?.exitBonePlacementMode3D();
    this.placementModeActive = false;
    this.activeSkeleton = sk;
    this.selectedJointIdx = null;
    this.renamingIdx = null;
    this.sm?.showBoneOverlay3D(sk.id, this.host.binding.bindMeshId || undefined);
    this.refreshJoints();
    this.host.anim.refreshClips();
    this.host.anim.selectedNLATrackIdx = null;
    this.host.anim.refreshNLATracks();
  }

  createSkeleton(): void {
    if (!this.newSkeletonName.trim()) return;
    const newId: string | undefined = this.sm?.createEmptySkeleton3D(this.newSkeletonName.trim());
    this.newSkeletonName = 'Skeleton';
    if (newId) {
      this.sm?.showBoneOverlay3D(newId, this.host.binding.bindMeshId || undefined);
      this.sm?.enterBonePlacementMode3D(newId);
      this.placementModeActive = true;
      this._placementJointCount = 0;
      this.placementPhase = 'head';
    }
    // sceneGraphChanged fires → refreshAll()
  }

  refreshJoints(): void {
    if (!this.activeSkeleton) { this.joints = []; this._clearIKState(); return; }
    const raw: any[] = this.sm?.getSkeletonJoints3D(this.activeSkeleton.id) ?? [];
    this.joints = raw.map((j: any) => ({
      name: j.name ?? 'Bone',
      parentIdx: j.parentIndex ?? -1,
      x: j.localPosition?.[0] ?? 0,
      y: j.localPosition?.[1] ?? 0,
      z: j.localPosition?.[2] ?? 0,
      tailOffset: j.tailOffset ?? [0, 0.3, 0],
      isLeaf: j.isLeaf ?? false,
    }));
    if (this.selectedJointIdx !== null && this.selectedJointIdx >= this.joints.length) {
      this.selectedJointIdx = null;
    }
    this._refreshIKChains();
    this.refreshConstraints();
    this.host.spring._refreshSpringChains();
  }

  private _clearIKState(): void {
    this.ikChains = [];
    this.ikEndSet = new Set();
    this.ikIntermediateSet = new Set();
  }

  private _refreshIKChains(): void {
    if (!this.activeSkeleton) { this._clearIKState(); return; }
    this.ikChains = this.sm?.getIKChains3D(this.activeSkeleton.id) ?? [];
    this.ikEndSet = new Set(this.ikChains.filter((c: any) => c.enabled).map((c: any) => c.endJointIdx));
    this.ikIntermediateSet = new Set<number>();
    for (const chain of this.ikChains) {
      let idx: number = this.joints[chain.endJointIdx]?.parentIdx ?? -1;
      let steps = (chain.chainLength ?? 2) - 1;
      while (idx >= 0 && steps > 0) {
        this.ikIntermediateSet.add(idx);
        idx = this.joints[idx]?.parentIdx ?? -1;
        steps--;
      }
    }
    this._syncIKInputs();
  }

  get placementHint(): string {
    if (this.placementPhase === 'head') return 'Click mesh to place joint head';
    return 'Click mesh to place bone tail';
  }

  get addBoneLabel(): string {
    if (this.selectedJointIdx === null) return '+ Add Bone';
    return this.selectedJointIsTail ? '↳ Extend Chain' : '⎇ Branch Here';
  }

  enterPlacement(): void {
    if (!this.activeSkeleton) return;
    this._placementJointCount = this.joints.length;
    this.sm?.enterBonePlacementMode3D(this.activeSkeleton.id);
    this.placementModeActive = true;
    // Root bone: two clicks (head then tail). Child bone: single click (tail only).
    this.placementPhase = this.selectedJointIdx === null ? 'head' : 'tail';
  }

  cancelPlacement(): void {
    this.sm?.exitBonePlacementMode3D();
    this.placementModeActive = false;
    this.placementPhase = null;
  }

  selectJoint(idx: number): void {
    this.sm?.selectJoint3D(idx);
    this._applyJointSelection(idx);
    if (this.host.binding.wpActive) {
      this.sm?.setWeightPaintJoint3D(idx);
    }
  }

  hoverJoint(idx: number | null): void {
    this.sm?.highlightJoint3D(idx);
  }

  /** Joint-list row hover → the viewport joint highlight, for a mouse / pen only: a finger's tap fired the compat
   *  mouseenter but never the mouseleave, so the highlight stuck on the last tapped row (TOUCH-16). */
  hoverJointFromPointer(idx: number | null, e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    this.hoverJoint(idx);
  }

  startRename(idx: number, event: Event): void {
    event.stopPropagation();
    this.selectedJointIdx = idx;
    this.renamingIdx = idx;
    this.renameValue = this.joints[idx]?.name ?? '';
  }

  confirmRename(): void {
    if (this.renamingIdx === null || !this.activeSkeleton) return;
    this.sm?.renameBone3D(this.activeSkeleton.id, this.renamingIdx, this.renameValue);
    this.renamingIdx = null;
    this.refreshJoints();
  }

  cancelRename(): void {
    this.renamingIdx = null;
  }

  removeBone(idx: number, event: Event): void {
    event.stopPropagation();
    if (!this.activeSkeleton) return;
    this.sm?.removeBone3D(this.activeSkeleton.id, idx);
    this.selectedJointIdx = null;
    this.renamingIdx = null;
    this.refreshJoints();
  }

  addIKChain(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    this.sm?.addIKChain3D(this.activeSkeleton.id, this.selectedJointIdx, 3);
  }

  removeIKChain(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.removeIKChain3D(this.activeSkeleton.id, chain.id);
  }

  setIKEnabled(enabled: boolean): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setIKChainEnabled3D(this.activeSkeleton.id, chain.id, enabled);
  }

  setIKLength(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setIKChainLength3D(this.activeSkeleton.id, chain.id, Math.max(2, this.ikChainLength));
  }

  onIKBlendChange(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setIKBlendWeight3D(this.activeSkeleton.id, chain.id, this.ikBlendWeight);
  }

  onIKTargetChange(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setIKTarget3D(this.activeSkeleton.id, chain.id, this.ikTargetX, this.ikTargetY, this.ikTargetZ);
  }

  onIKPoleChange(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setPoleTarget3D(this.activeSkeleton.id, chain.id, this.ikPoleX, this.ikPoleY, this.ikPoleZ);
  }

  addPoleTarget(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    const t: [number, number, number] = chain.target ?? [0, 0, 0];
    this.sm?.setPoleTarget3D(this.activeSkeleton.id, chain.id, t[0], t[1] + 0.5, t[2] + 0.5);
  }

  clearPoleTarget(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.clearPoleTarget3D(this.activeSkeleton.id, chain.id);
  }

  refreshConstraints(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) {
      this.constraints = [];
      return;
    }
    this.constraints = this.sm?.getJointConstraints3D(this.activeSkeleton.id, this.selectedJointIdx) ?? [];
  }

  addConstraint(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    let c: any;
    if (this.newConstraintType === 'lookAt') {
      c = { type: 'lookAt', targetJointIdx: +this.newConstraintTarget, axis: this.newConstraintAxis, influence: this.newConstraintInfluence };
    } else if (this.newConstraintType === 'copyRotation') {
      c = { type: 'copyRotation', sourceJointIdx: +this.newConstraintTarget, influence: this.newConstraintInfluence };
    } else {
      c = { type: 'stretchTo', targetJointIdx: +this.newConstraintTarget, influence: this.newConstraintInfluence, volumePreserve: this.newConstraintVolumePreserve };
    }
    this.sm?.addJointConstraint3D(this.activeSkeleton.id, this.selectedJointIdx, c);
    this.refreshConstraints();
  }

  removeConstraint(constraintIdx: number, event: Event): void {
    event.stopPropagation();
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    this.sm?.removeJointConstraint3D(this.activeSkeleton.id, this.selectedJointIdx, constraintIdx);
    this.refreshConstraints();
  }

  constraintLabel(c: any): string {
    if (c.type === 'lookAt')       return `Look At → ${this.jointName(c.targetJointIdx)} (${c.axis?.toUpperCase()})`;
    if (c.type === 'copyRotation') return `Copy Rot ← ${this.jointName(c.sourceJointIdx)}`;
    if (c.type === 'stretchTo')    return `Stretch → ${this.jointName(c.targetJointIdx)}`;
    return c.type;
  }

  /** A joint's name for the UI (the index only when the joint is gone). */
  jointName(idx: number | null | undefined): string {
    if (idx === null || idx === undefined) return '—';
    return this.joints[idx]?.name ?? `#${idx}`;
  }

  /** Each newly selected joint's constraint form starts at its PARENT (else the first other joint) — the old default,
   *  joint 0, could be the selected joint itself. */
  defaultConstraintTarget(): void {
    const n = this.joints.length;
    if (n === 0) return;
    const parent = this.selectedJointIdx !== null ? this.joints[this.selectedJointIdx]?.parentIdx ?? -1 : -1;
    this.newConstraintTarget = parent >= 0 ? parent : (this.selectedJointIdx === 0 && n > 1 ? 1 : 0);
  }

  // ── Mode chrome (UI review 2026-10-07 §4): joint properties, the tool pills, the long-press radial ─────────────

  /** IK pole joint of the selected joint's chain (Salsa getArmatureIK3D; null = none / an older dist). */
  ikPoleJointIdx: number | null = null;

  /** This Salsa dist can set an IK chain's pole to a joint (setArmatureIK3D). */
  get hasPoleJointApi(): boolean {
    return typeof armApi(this.sm).setArmatureIK3D === 'function';
  }

  /** Rename joint `idx` (the props panel's name field, the radial's Rename). Empty names are ignored. */
  renameJoint(idx: number, name: string): void {
    const nm = name.trim();
    if (!this.activeSkeleton || !this.joints[idx] || !nm || nm === this.joints[idx].name) return;
    this.sm?.renameBone3D(this.activeSkeleton.id, idx, nm);
    this.refreshJoints();
  }

  /**
   * IK on the chain ending at the selected joint: on / off, chain length (≥ 2) and — with a newer Salsa — the pole
   * joint (`poleJointIdx` undefined = unchanged, null = none). setArmatureIK3D when present; else the old chain calls
   * (create with the length, then length / enabled), which have no pole joint.
   */
  configureIK(opts: { enabled: boolean; chainLength: number; poleJointIdx?: number | null }): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    const sk = this.activeSkeleton.id, idx = this.selectedJointIdx;
    const len = Math.max(2, Math.round(opts.chainLength || 2));
    const api = armApi(this.sm);
    if (typeof api.setArmatureIK3D === 'function') {
      const o: { chainLength: number; enabled: boolean; poleJointIndex?: number | null } = { chainLength: len, enabled: opts.enabled };
      if (opts.poleJointIdx !== undefined) o.poleJointIndex = opts.poleJointIdx;
      api.setArmatureIK3D.call(this.sm, sk, idx, o);
    } else {
      const chain = this.selectedJointIKChain;
      if (!chain) {
        if (opts.enabled) this.sm?.addIKChain3D(sk, idx, len);
      } else {
        if ((chain.chainLength ?? 3) !== len) this.sm?.setIKChainLength3D(sk, chain.id, len);
        if (!!chain.enabled !== opts.enabled) this.sm?.setIKChainEnabled3D(sk, chain.id, opts.enabled);
      }
    }
    this.ikChainLength = len;
    this.refreshJoints();
  }

  /** The pole of the selected joint's IK chain is joint `poleIdx` (null = no pole). Needs setArmatureIK3D. */
  setIKPoleJoint(poleIdx: number | null): void {
    const chain = this.selectedJointIKChain;
    if (!chain || !this.hasPoleJointApi) return;
    this.configureIK({ enabled: !!chain.enabled, chainLength: chain.chainLength ?? this.ikChainLength, poleJointIdx: poleIdx });
  }

  /**
   * Add a child joint of `parentIdx` (-1 = a new root), its head at the parent's tail, continuing the parent's bone, and
   * select it. Salsa's addArmatureChildJoint3D (one undo step) when present; else addBone3D + the tail offset (the
   * old dist has no undo for it). Returns the new joint index, or -1.
   */
  addChildJoint(parentIdx: number, name?: string): number {
    if (!this.activeSkeleton) return -1;
    const sk = this.activeSkeleton.id;
    const nm = name?.trim() || undefined;
    const api = armApi(this.sm);
    let idx = -1;
    if (typeof api.addArmatureChildJoint3D === 'function') {
      idx = api.addArmatureChildJoint3D.call(this.sm, sk, parentIdx, nm) ?? -1;
    } else if (this.sm) {
      const parent = parentIdx >= 0 ? this.joints[parentIdx] : null;
      const local: [number, number, number] = parent ? [...parent.tailOffset] as [number, number, number] : [0, 0, 0];
      let tail: [number, number, number] = parent ? [...parent.tailOffset] as [number, number, number] : [0, 0.3, 0];
      if (!(Math.hypot(tail[0], tail[1], tail[2]) > 1e-6)) tail = [0, 0.3, 0];
      idx = this.sm.addBone3D(sk, parentIdx, local, nm ?? `joint_${this.joints.length}`);
      if (idx >= 0) {
        this.sm.setJointTailOffset3D(sk, idx, tail);
        this.sm.selectJoint3D(idx);
      }
    }
    this.refreshJoints();
    if (idx >= 0 && this.joints[idx]) this._applyJointSelection(idx);
    return idx;
  }

  /** The joints a pill operation acts on: every selected joint of the active skeleton (primary first), else the
   *  primary alone. */
  private _opJoints(selection?: ReadonlyArray<{ skeletonId: string; jointIndex: number }>): number[] {
    const sk = this.activeSkeleton?.id;
    const many = (selection ?? []).filter(s => s.skeletonId === sk).map(s => s.jointIndex).filter(i => !!this.joints[i]);
    if (many.length) return [...new Set(many)];
    return this.selectedJointIdx !== null && this.joints[this.selectedJointIdx] ? [this.selectedJointIdx] : [];
  }

  /** Rotate the selected joint(s) by `deg` degrees about their local `axis` (the Rotate tool's typed amount). */
  rotateSelectedBy(axis: 'x' | 'y' | 'z', deg: number, selection?: ReadonlyArray<{ skeletonId: string; jointIndex: number }>): number {
    if (!this.activeSkeleton || !Number.isFinite(deg) || deg === 0) return 0;
    const sk = this.activeSkeleton.id;
    const d = this._eulerDegToQuat(axis === 'x' ? deg : 0, axis === 'y' ? deg : 0, axis === 'z' ? deg : 0);
    const ids = this._opJoints(selection);
    for (const i of ids) {
      const q: [number, number, number, number] = this.sm?.getJointRotation3D(sk, i) ?? [0, 0, 0, 1];
      this.sm?.setJointRotation3D(sk, i, quatMul(q, d));
    }
    if (this.selectedJointIdx !== null) this._syncRotationInputs(this.selectedJointIdx);
    return ids.length;
  }

  /** Move the selected joint(s) by `amount` along their local `axis` (the Move tool's typed amount: the bone itself,
   *  as a viewport drag in Move does). */
  moveSelectedBy(axis: 'x' | 'y' | 'z', amount: number, selection?: ReadonlyArray<{ skeletonId: string; jointIndex: number }>): number {
    if (!this.activeSkeleton || !Number.isFinite(amount) || amount === 0) return 0;
    const sk = this.activeSkeleton.id;
    const a = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const ids = this._opJoints(selection);
    for (const i of ids) {
      const j = this.joints[i];
      const p: [number, number, number] = [j.x, j.y, j.z];
      p[a] += amount;
      this.sm?.moveBone3D(sk, i, p);
    }
    this.refreshJoints();
    return ids.length;
  }
}

/** Hamilton product a·b of [x, y, z, w] quaternions (b applied in a's local frame). */
export function quatMul(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
