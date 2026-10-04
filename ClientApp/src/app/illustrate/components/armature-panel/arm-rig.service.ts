import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { ArmaturePanelComponent, ArmatureJoint, ArmatureSkeleton } from './armature-panel.component';

/** What ArmRigService reads / writes on the panel. */
export type ArmRigHost = Pick<ArmaturePanelComponent,
  'shapeManager' | 'anim' | 'binding' | 'initialMeshId' | 'library' | 'spring'
>;

/**
 * Rig editing: skeletons, joints (select / rename / place / remove / visibility), rotation + tool mode, IK chains + pole targets, bone constraints.
 * Panel-scoped (provided by ArmaturePanelComponent, bound in its constructor). Bodies moved verbatim from
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

  jointsCollapsed = true;

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
  }

  _syncIKInputs(): void {
    const chain = this.selectedJointIKChain;
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
    if (c.type === 'lookAt')       return `Look At → j${c.targetJointIdx} (${c.axis?.toUpperCase()})`;
    if (c.type === 'copyRotation') return `Copy Rot ← j${c.sourceJointIdx}`;
    if (c.type === 'stretchTo')    return `Stretch → j${c.targetJointIdx}`;
    return c.type;
  }
}
