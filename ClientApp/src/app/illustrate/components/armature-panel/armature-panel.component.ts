import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';

export interface ArmatureSkeleton {
  id: string;
  name: string;
}

export interface ArmatureJoint {
  name: string;
  parentIdx: number;
  x: number;
  y: number;
  z: number;
  tailOffset: [number, number, number];
  isLeaf: boolean;
}

export interface ArmatureClip {
  id: string;
  name: string;
}

export interface NLASegmentDisplay {
  clipId: string;
  clipName: string;
  startFrame: number;
  weight: number;
  blendMode: 'replace' | 'additive';
  fadeIn: number;
  fadeOut: number;
}

export interface NLATrackDisplay {
  id: string;
  name: string;
  fps: number;
  loop: boolean;
  isPlaying: boolean;
  segments: NLASegmentDisplay[];
}

@Component({
  selector: 'app-armature-panel',
  templateUrl: './armature-panel.component.html',
  styleUrls: ['./armature-panel.component.scss'],
})
export class ArmaturePanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() shapeManager: any = null;
  @Input() initialMeshId: string = '';
  @Output() closeRequest = new EventEmitter<void>();

  private get sm(): any { return this.shapeManager; }
  private _sceneChangeSub: Subscription | null = null;
  private _clipObjects: any[] = [];
  private _clipPlayer: any = null;

  // ── Skeletons ────────────────────────────────────────────────────
  skeletons: ArmatureSkeleton[] = [];
  activeSkeleton: ArmatureSkeleton | null = null;
  newSkeletonName = 'Skeleton';

  // ── Joints ───────────────────────────────────────────────────────
  joints: ArmatureJoint[] = [];
  newJointName = 'Bone';
  newJointParent = -1;
  newJointX = 0;
  newJointY = 0;
  newJointZ = 0;

  placementModeActive = false;
  placementPhase: 'head' | 'tail' | null = null;
  selectedJointIsTail = false;
  private _placementJointCount = 0;

  skeletonsCollapsed = false;
  jointsCollapsed = false;
  bindCollapsed = false;
  weightPaintCollapsed = false;
  clipsCollapsed = false;
  retargetCollapsed = false;
  armatureToolMode: 'move' | 'rotate' = 'move';
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

  // ── IK ───────────────────────────────────────────────────────────
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

  // ── Bind ─────────────────────────────────────────────────────────
  meshes: Array<{ id: string; name: string }> = [];
  bindMeshId = '';
  bindSkeletonId = '';
  bindResult = '';
  isBound = false;

  get isProceduralBody(): boolean {
    if (!this.activeSkeleton) return false;
    return this.sm?.isProceduralBodySkeleton3D?.(this.activeSkeleton.id) ?? false;
  }

  // ── Weight Paint ─────────────────────────────────────────────────
  wpJointIdx = 0;
  wpRadius = 0.15;
  wpStrength = 0.5;
  wpTargetWeight = 1.0;
  wpShowSkeleton = true;
  wpUnlit = false;
  wpActive = false;

  // ── Clips ────────────────────────────────────────────────────────
  clips: ArmatureClip[] = [];
  newClipName = 'Clip';
  newClipFps = 24;
  newClipEndFrame = 48;
  activeClipIdx: number | null = null;
  recordFrame = 0;
  isPlaying = false;

  // ── Background ───────────────────────────────────────────────────
  bgMode: 'wavy' | 'gradient' | 'dim' | 'solid' | 'none' = 'wavy';

  // ── Retarget ─────────────────────────────────────────────────────
  retargetSrcClipIdx = 0;
  retargetTgtSkeletonId = '';

  // ── Bone Constraints ─────────────────────────────────────────────
  constraintsCollapsed = false;
  constraints: any[] = [];
  newConstraintType: 'lookAt' | 'copyRotation' | 'stretchTo' = 'lookAt';
  newConstraintTarget = 0;
  newConstraintAxis: 'x' | 'y' | 'z' = 'y';
  newConstraintInfluence = 1.0;
  newConstraintVolumePreserve = 0.5;

  // ── Pose Library ──────────────────────────────────────────────────
  poseLibraryCollapsed = false;
  poses: Array<{ id: string; name: string }> = [];
  newPoseName = '';
  renamingPoseId: string | null = null;
  renamePoseValue = '';

  // ── Preset Poses ──────────────────────────────────────────────────
  presetPosesCollapsed = false;
  presetPoseNames: string[] = [];

  // ── Spring / Jiggle ───────────────────────────────────────────────
  springCollapsed = false;
  springChains: any[] = [];
  selectedSpringChainId: string | null = null;
  springStiffness = 0.5;
  springDrag = 0.3;
  springGravity = 0.005;
  springHitRadius = 0.05;

  // ── NLA ───────────────────────────────────────────────────────────
  nlaCollapsed = true;
  nlaTracks: NLATrackDisplay[] = [];
  selectedNLATrackIdx: number | null = null;
  nlaNewTrackName = 'Track';
  nlaNewTrackFps = 24;
  nlaNewTrackLoop = true;
  nlaSeekFrame = 0;
  nlaNewSegClipIdx = 0;
  nlaNewSegStart = 0;
  nlaNewSegWeight = 1.0;
  nlaNewSegBlendMode: 'replace' | 'additive' = 'replace';
  nlaNewSegFadeIn = 0;
  nlaNewSegFadeOut = 0;
  nlaCfFromSeg = 0;
  nlaCfToSeg = 1;
  nlaCfDur = 8;
  private _nlaPlayers = new Map<string, any>();

  ngOnInit(): void {
    if (this.shapeManager) {
      if (this.initialMeshId) this.bindMeshId = this.initialMeshId;
      this._subscribeScene();
      this.refreshMeshes();
      this.sm?.enterArmatureMode3D?.(this.bindMeshId || undefined);
      this.sm?.setArmatureBgMode3D?.({ mode: this.bgMode });
      this.refreshSkeletons();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['shapeManager'] && this.shapeManager) {
      this._unsubscribeScene();
      this._subscribeScene();
      this.sm?.setArmatureBgMode3D?.({ mode: this.bgMode });
      this.refreshAll();
    }
  }

  ngOnDestroy(): void {
    this._unsubscribeScene();
    if (this.wpActive) this.sm?.exitWeightPaintMode3D?.();
    for (const [trackId] of this._nlaPlayers) {
      this.sm?.stopNLATrack3D?.(trackId);
    }
    this._nlaPlayers.clear();
  }

  private _subscribeScene(): void {
    const obs = this.shapeManager?.interactionService?.onSceneGraphChanged;
    if (obs) {
      this._sceneChangeSub = obs.subscribe(() => {
        this.placementModeActive = this.sm?.isBonePlacementModeActive3D?.() ?? false;
        this.wpActive = this.sm?.isWeightPainting3D?.() ?? this.wpActive;
        this.refreshAll();
        this._syncViewportSelection();
        // Detect root bone head→tail phase transition: joint was added but placement still active
        if (this.placementPhase === 'head' && this.placementModeActive && this.joints.length > this._placementJointCount) {
          this.placementPhase = 'tail';
        }
        if (!this.placementModeActive) {
          this.placementPhase = null;
        }
      });
    }
  }

  private _unsubscribeScene(): void {
    this._sceneChangeSub?.unsubscribe();
    this._sceneChangeSub = null;
  }

  private _syncViewportSelection(): void {
    const idx: number | null = this.sm?.getSelectedJointIndex3D?.() ?? null;
    this.selectedJointIsTail = this.sm?.getSelectedJointIsTail3D?.() ?? false;
    if (idx !== null && idx !== this.selectedJointIdx) {
      this._applyJointSelection(idx);
    } else if (idx !== null && this.armatureToolMode === 'rotate') {
      this._syncRotationInputs(idx);
    }
    // Always sync IK inputs — handles viewport drag updating chain.target/poleTarget
    this._syncIKInputs();
  }

  private _applyJointSelection(idx: number): void {
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

  private _syncIKInputs(): void {
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

  private _syncRotationInputs(idx: number): void {
    if (!this.activeSkeleton) return;
    const q: [number,number,number,number] = this.sm?.getJointRotation3D?.(this.activeSkeleton.id, idx) ?? [0,0,0,1];
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

  close(): void {
    if (this.wpActive) {
      this.sm?.exitWeightPaintMode3D?.();
      this.wpActive = false;
    }
    this.sm?.exitBonePlacementMode3D?.();
    this.sm?.showBoneOverlay3D?.(null);
    this.sm?.selectJoint3D?.(null);
    this.sm?.setArmatureBgMode3D?.({ mode: 'none' });
    this.stopClip();
    this.closeRequest.emit();
  }

  updateBgMode(): void {
    this.sm?.setArmatureBgMode3D?.({ mode: this.bgMode });
  }

  setToolMode(mode: 'move' | 'rotate'): void {
    this.armatureToolMode = mode;
    this.sm?.setArmatureToolMode3D?.(mode);
    if (mode === 'rotate' && this.selectedJointIdx !== null) {
      this._syncRotationInputs(this.selectedJointIdx);
    }
  }

  applyRotation(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    const q = this._eulerDegToQuat(this.rotX, this.rotY, this.rotZ);
    this.sm?.setJointRotation3D?.(this.activeSkeleton.id, this.selectedJointIdx, q);
  }

  resetRotation(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    this.sm?.resetJointRotation3D?.(this.activeSkeleton.id, this.selectedJointIdx);
    this._syncRotationInputs(this.selectedJointIdx);
  }

  resetAllRotations(): void {
    if (!this.activeSkeleton) return;
    this.sm?.resetAllJointRotations3D?.(this.activeSkeleton.id);
    if (this.selectedJointIdx !== null) this._syncRotationInputs(this.selectedJointIdx);
  }

  focusMesh(): void {
    this.sm?.fitArtboard?.();
  }

  refreshAll(): void {
    this.refreshMeshes();
    this.refreshSkeletons();
  }

  // ── Skeleton ops ─────────────────────────────────────────────────

  refreshSkeletons(): void {
    const raw: any[] = this.sm?.getAllSkeletons3D?.() ?? [];
    this.skeletons = raw.map((sk: any) => ({ id: sk.id, name: sk.name }));

    if (this.activeSkeleton) {
      const still = this.skeletons.find(s => s.id === this.activeSkeleton!.id);
      if (!still) {
        this.activeSkeleton = this.skeletons[0] ?? null;
        this.sm?.showBoneOverlay3D?.(this.activeSkeleton?.id ?? null, this.bindMeshId || undefined);
      }
    } else if (this.skeletons.length > 0) {
      this.activeSkeleton = this.skeletons[0];
      this.sm?.showBoneOverlay3D?.(this.activeSkeleton.id, this.bindMeshId || undefined);
    }

    if (!this.bindSkeletonId && this.skeletons.length) this.bindSkeletonId = this.skeletons[0].id;
    this.refreshJoints();
    this.refreshClips();
    this.refreshPresetPoses();
  }

  selectSkeleton(sk: ArmatureSkeleton): void {
    this.sm?.exitBonePlacementMode3D?.();
    this.placementModeActive = false;
    this.activeSkeleton = sk;
    this.selectedJointIdx = null;
    this.renamingIdx = null;
    this.sm?.showBoneOverlay3D?.(sk.id, this.bindMeshId || undefined);
    this.refreshJoints();
    this.refreshClips();
    this.selectedNLATrackIdx = null;
    this.refreshNLATracks();
  }

  createSkeleton(): void {
    if (!this.newSkeletonName.trim()) return;
    const newId: string | undefined = this.sm?.createEmptySkeleton3D?.(this.newSkeletonName.trim());
    this.newSkeletonName = 'Skeleton';
    if (newId) {
      this.sm?.showBoneOverlay3D?.(newId, this.bindMeshId || undefined);
      this.sm?.enterBonePlacementMode3D?.(newId);
      this.placementModeActive = true;
      this._placementJointCount = 0;
      this.placementPhase = 'head';
    }
    // sceneGraphChanged fires → refreshAll()
  }

  // ── Joint ops ────────────────────────────────────────────────────

  refreshJoints(): void {
    if (!this.activeSkeleton) { this.joints = []; this._clearIKState(); return; }
    const raw: any[] = this.sm?.getSkeletonJoints3D?.(this.activeSkeleton.id) ?? [];
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
    this._refreshSpringChains();
  }

  private _clearIKState(): void {
    this.ikChains = [];
    this.ikEndSet = new Set();
    this.ikIntermediateSet = new Set();
  }

  private _refreshIKChains(): void {
    if (!this.activeSkeleton) { this._clearIKState(); return; }
    this.ikChains = this.sm?.getIKChains3D?.(this.activeSkeleton.id) ?? [];
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
    this.sm?.enterBonePlacementMode3D?.(this.activeSkeleton.id);
    this.placementModeActive = true;
    // Root bone: two clicks (head then tail). Child bone: single click (tail only).
    this.placementPhase = this.selectedJointIdx === null ? 'head' : 'tail';
  }

  cancelPlacement(): void {
    this.sm?.exitBonePlacementMode3D?.();
    this.placementModeActive = false;
    this.placementPhase = null;
  }

  addBoneNumeric(): void {
    if (!this.activeSkeleton || !this.newJointName.trim()) return;
    this.sm?.addBone3D?.(
      this.activeSkeleton.id,
      this.newJointParent,
      [this.newJointX, this.newJointY, this.newJointZ],
      this.newJointName.trim(),
    );
    this.newJointName = 'Bone';
    this.refreshJoints();
  }


  selectJoint(idx: number): void {
    this.sm?.selectJoint3D?.(idx);
    this._applyJointSelection(idx);
    if (this.wpActive) {
      this.sm?.setWeightPaintJoint3D?.(idx);
    }
  }

  hoverJoint(idx: number | null): void {
    this.sm?.highlightJoint3D?.(idx);
  }

  applyMove(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    this.sm?.moveBone3D?.(this.activeSkeleton.id, this.selectedJointIdx, [this.moveX, this.moveY, this.moveZ]);
    this.refreshJoints();
  }

  applyTailOffset(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    this.sm?.setJointTailOffset3D?.(this.activeSkeleton.id, this.selectedJointIdx, [this.tailX, this.tailY, this.tailZ]);
    this.refreshJoints();
  }

  startRename(idx: number, event: Event): void {
    event.stopPropagation();
    this.selectedJointIdx = idx;
    this.renamingIdx = idx;
    this.renameValue = this.joints[idx]?.name ?? '';
  }

  confirmRename(): void {
    if (this.renamingIdx === null || !this.activeSkeleton) return;
    this.sm?.renameBone3D?.(this.activeSkeleton.id, this.renamingIdx, this.renameValue);
    this.renamingIdx = null;
    this.refreshJoints();
  }

  cancelRename(): void {
    this.renamingIdx = null;
  }

  removeBone(idx: number, event: Event): void {
    event.stopPropagation();
    if (!this.activeSkeleton) return;
    this.sm?.removeBone3D?.(this.activeSkeleton.id, idx);
    this.selectedJointIdx = null;
    this.renamingIdx = null;
    this.refreshJoints();
  }

  // ── Mesh / bind ──────────────────────────────────────────────────

  refreshMeshes(): void {
    const raw: any[] = this.sm?.getAllMeshes3D?.() ?? [];
    this.meshes = raw.map((m: any) => ({ id: m.id, name: m.name ?? m.id }));
    if (!this.bindMeshId && this.meshes.length) this.bindMeshId = this.meshes[0].id;
  }

  get bindMeshName(): string {
    return this.meshes.find(m => m.id === this.bindMeshId)?.name ?? this.bindMeshId ?? '—';
  }

  get canBind(): boolean {
    return !!this.bindMeshId && !!this.activeSkeleton && this.joints.length > 0;
  }

  bindMesh(): void {
    if (!this.canBind || !this.activeSkeleton) return;
    const ok = this.sm?.bindMeshToSkeleton3D?.(this.bindMeshId, this.activeSkeleton.id);
    if (ok === false) {
      this.bindResult = 'Bind failed — add joints first';
      this.isBound = false;
    } else {
      this.bindResult = `Bound "${this.bindMeshName}" → "${this.activeSkeleton.name}"`;
      this.isBound = true;
    }
  }

  // ── Weight paint ─────────────────────────────────────────────────

  enterWeightPaint(): void {
    if (!this.bindMeshId || !this.activeSkeleton) return;
    const jointIdx = this.selectedJointIdx ?? 0;
    this.sm?.setWeightPaintBrush?.(this.wpRadius, this.wpStrength, this.wpTargetWeight);
    this.sm?.enterWeightPaintMode3D?.(this.bindMeshId, this.activeSkeleton.id, jointIdx);
    this.wpActive = true;
  }

  exitWeightPaint(): void {
    this.sm?.exitWeightPaintMode3D?.();
    this.wpActive = false;
  }

  onWpBrushChange(): void {
    if (this.wpActive) {
      this.sm?.setWeightPaintBrush?.(this.wpRadius, this.wpStrength, this.wpTargetWeight);
    }
  }

  onWpShowSkeletonChange(): void {
    this.sm?.setWeightPaintShowSkeleton?.(this.wpShowSkeleton);
  }

  onWpUnlitChange(): void {
    this.sm?.setWeightPaintUnlit3D?.(this.wpUnlit);
  }

  normalizeWeights(): void {
    if (!this.bindMeshId) return;
    this.sm?.normalizeWeights3D?.(this.bindMeshId);
  }

  // ── Clips ────────────────────────────────────────────────────────

  refreshClips(): void {
    if (!this.activeSkeleton) { this.clips = []; this._clipObjects = []; return; }
    this._clipObjects = this.sm?.getSkeletonClips3D?.(this.activeSkeleton.id) ?? [];
    this.clips = this._clipObjects.map((c: any) => ({ id: c.id, name: c.name ?? 'Clip' }));
    if (this.activeClipIdx !== null && this.activeClipIdx >= this.clips.length) {
      this.activeClipIdx = null;
    }
    this.refreshNLATracks();
    this.refreshPoses();
  }

  createClip(): void {
    if (!this.activeSkeleton || !this.newClipName.trim()) return;
    this.sm?.createSkeletonClip3D?.(
      this.activeSkeleton.id,
      this.newClipName.trim(),
      this.newClipFps,
      this.newClipEndFrame,
    );
    this.newClipName = 'Clip';
    this.refreshClips();
  }

  selectClip(idx: number): void {
    this.activeClipIdx = idx;
    this.stopClip();
  }

  deleteClip(idx: number, event: Event): void {
    event.stopPropagation();
    const clip = this._clipObjects[idx];
    if (!clip) return;
    this.sm?.deleteSkeletonClip3D?.(clip.id);
    if (this.activeClipIdx === idx) this.activeClipIdx = null;
    this.refreshClips();
  }

  recordPose(): void {
    if (this.activeSkeleton === null || this.activeClipIdx === null) return;
    const clip = this._clipObjects[this.activeClipIdx];
    if (!clip) return;
    this.sm?.recordSkeletonPose3D?.(this.activeSkeleton.id, clip.id, this.recordFrame);
    if (this.ikChains.length > 0) {
      this.sm?.recordIKPose3D?.(this.activeSkeleton.id, clip.id, this.recordFrame);
    }
  }

  playClip(): void {
    if (this.activeSkeleton === null || this.activeClipIdx === null) return;
    const clip = this._clipObjects[this.activeClipIdx];
    if (!clip) return;
    this._clipPlayer = this.sm?.playSkeletonClip3D?.(this.activeSkeleton.id, clip);
    this._clipPlayer?.play?.();
    this.isPlaying = true;
  }

  stopClip(): void {
    this._clipPlayer?.stop?.();
    this._clipPlayer = null;
    this.isPlaying = false;
  }

  // ── IK ops ───────────────────────────────────────────────────────

  addIKChain(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    this.sm?.addIKChain3D?.(this.activeSkeleton.id, this.selectedJointIdx, 3);
  }

  removeIKChain(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.removeIKChain3D?.(this.activeSkeleton.id, chain.id);
  }

  setIKEnabled(enabled: boolean): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setIKChainEnabled3D?.(this.activeSkeleton.id, chain.id, enabled);
  }

  setIKLength(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setIKChainLength3D?.(this.activeSkeleton.id, chain.id, Math.max(2, this.ikChainLength));
  }

  onIKBlendChange(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setIKBlendWeight3D?.(this.activeSkeleton.id, chain.id, this.ikBlendWeight);
  }

  onIKTargetChange(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setIKTarget3D?.(this.activeSkeleton.id, chain.id, this.ikTargetX, this.ikTargetY, this.ikTargetZ);
  }

  onIKPoleChange(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.setPoleTarget3D?.(this.activeSkeleton.id, chain.id, this.ikPoleX, this.ikPoleY, this.ikPoleZ);
  }

  addPoleTarget(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    const t: [number, number, number] = chain.target ?? [0, 0, 0];
    this.sm?.setPoleTarget3D?.(this.activeSkeleton.id, chain.id, t[0], t[1] + 0.5, t[2] + 0.5);
  }

  clearPoleTarget(): void {
    const chain = this.selectedJointIKChain;
    if (!this.activeSkeleton || !chain) return;
    this.sm?.clearPoleTarget3D?.(this.activeSkeleton.id, chain.id);
  }

  // ── Retarget ─────────────────────────────────────────────────────

  retarget(): void {
    if (!this.retargetTgtSkeletonId || this._clipObjects.length === 0) return;
    const clip = this._clipObjects[this.retargetSrcClipIdx];
    if (!clip) return;
    this.sm?.retargetSkeletonClip3D?.(clip.id, this.retargetTgtSkeletonId);
  }

  // ── NLA ──────────────────────────────────────────────────────────

  refreshNLATracks(): void {
    if (!this.activeSkeleton) { this.nlaTracks = []; return; }
    const raw: any[] = this.sm?.getNLATracks3D?.(this.activeSkeleton.id) ?? [];
    this.nlaTracks = raw.map((t: any) => ({
      id: t.id,
      name: t.name,
      fps: t.fps ?? 24,
      loop: t.loop ?? true,
      isPlaying: this._nlaPlayers.has(t.id),
      segments: (t.segments ?? []).map((seg: any) => ({
        clipId: seg.clipId,
        clipName: this._clipNameById(seg.clipId),
        startFrame: seg.startFrame ?? 0,
        weight: seg.weight ?? 1,
        blendMode: seg.blendMode ?? 'replace',
        fadeIn: seg.fadeIn ?? 0,
        fadeOut: seg.fadeOut ?? 0,
      })),
    }));
    if (this.selectedNLATrackIdx !== null && this.selectedNLATrackIdx >= this.nlaTracks.length) {
      this.selectedNLATrackIdx = null;
    }
  }

  private _clipNameById(id: string): string {
    return this._clipObjects.find((c: any) => c.id === id)?.name ?? id;
  }

  createNLATrack(): void {
    if (!this.activeSkeleton || !this.nlaNewTrackName.trim()) return;
    this.sm?.createNLATrack3D?.(
      this.activeSkeleton.id,
      this.nlaNewTrackName.trim(),
      this.nlaNewTrackFps,
      this.nlaNewTrackLoop,
    );
    this.nlaNewTrackName = 'Track';
    this.refreshNLATracks();
  }

  selectNLATrack(idx: number): void {
    this.selectedNLATrackIdx = this.selectedNLATrackIdx === idx ? null : idx;
    this.nlaNewSegClipIdx = 0;
    this.nlaNewSegStart = 0;
  }

  addNLASegment(): void {
    if (this.selectedNLATrackIdx === null) return;
    const track = this.nlaTracks[this.selectedNLATrackIdx];
    const clip = this._clipObjects[this.nlaNewSegClipIdx];
    if (!track || !clip) return;
    this.sm?.addNLASegment3D?.(track.id, clip.id, this.nlaNewSegStart, {
      weight: this.nlaNewSegWeight,
      blendMode: this.nlaNewSegBlendMode,
      fadeIn: this.nlaNewSegFadeIn,
      fadeOut: this.nlaNewSegFadeOut,
    });
    this.nlaNewSegStart += 24;
    this.refreshNLATracks();
  }

  removeNLASegment(segIdx: number, event: Event): void {
    event.stopPropagation();
    if (this.selectedNLATrackIdx === null) return;
    const track = this.nlaTracks[this.selectedNLATrackIdx];
    if (!track) return;
    this.sm?.removeNLASegment3D?.(track.id, segIdx);
    this.refreshNLATracks();
  }

  updateNLASegmentWeight(trackIdx: number, segIdx: number, weight: number): void {
    const track = this.nlaTracks[trackIdx];
    if (!track) return;
    this.sm?.updateNLASegment3D?.(track.id, segIdx, { weight });
  }

  playNLATrack(idx: number): void {
    const track = this.nlaTracks[idx];
    if (!track) return;
    const player = this.sm?.playNLATrack3D?.(track.id);
    if (player) {
      this._nlaPlayers.set(track.id, player);
      player.play?.();
      this.nlaTracks[idx].isPlaying = true;
    }
  }

  stopNLATrack(idx: number): void {
    const track = this.nlaTracks[idx];
    if (!track) return;
    this.sm?.stopNLATrack3D?.(track.id);
    this._nlaPlayers.delete(track.id);
    this.nlaTracks[idx].isPlaying = false;
  }

  seekNLATrack(): void {
    if (this.selectedNLATrackIdx === null) return;
    const track = this.nlaTracks[this.selectedNLATrackIdx];
    if (!track) return;
    this.sm?.seekNLATrack3D?.(track.id, this.nlaSeekFrame);
  }

  crossfadeNLA(): void {
    if (this.selectedNLATrackIdx === null) return;
    const track = this.nlaTracks[this.selectedNLATrackIdx];
    if (!track || track.segments.length < 2) return;
    this.sm?.crossfade3D?.(track.id, this.nlaCfFromSeg, this.nlaCfToSeg, this.nlaCfDur);
  }

  // ── Bone Constraints ─────────────────────────────────────────────

  refreshConstraints(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) {
      this.constraints = [];
      return;
    }
    this.constraints = this.sm?.getJointConstraints3D?.(this.activeSkeleton.id, this.selectedJointIdx) ?? [];
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
    this.sm?.addJointConstraint3D?.(this.activeSkeleton.id, this.selectedJointIdx, c);
    this.refreshConstraints();
  }

  removeConstraint(constraintIdx: number, event: Event): void {
    event.stopPropagation();
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    this.sm?.removeJointConstraint3D?.(this.activeSkeleton.id, this.selectedJointIdx, constraintIdx);
    this.refreshConstraints();
  }

  constraintLabel(c: any): string {
    if (c.type === 'lookAt')       return `Look At → j${c.targetJointIdx} (${c.axis?.toUpperCase()})`;
    if (c.type === 'copyRotation') return `Copy Rot ← j${c.sourceJointIdx}`;
    if (c.type === 'stretchTo')    return `Stretch → j${c.targetJointIdx}`;
    return c.type;
  }

  // ── Pose Library ──────────────────────────────────────────────────

  refreshPoses(): void {
    if (!this.activeSkeleton) { this.poses = []; return; }
    this.poses = this.sm?.getPoses3D?.(this.activeSkeleton.id) ?? [];
  }

  capturePose(): void {
    if (!this.activeSkeleton) return;
    const name = this.newPoseName.trim() || `Pose ${this.poses.length + 1}`;
    this.sm?.capturePose3D?.(this.activeSkeleton.id, name);
    this.newPoseName = '';
    this.refreshPoses();
  }

  applyPose(poseId: string): void {
    if (!this.activeSkeleton) return;
    this.sm?.applyPose3D?.(this.activeSkeleton.id, poseId);
  }

  startRenamePose(poseId: string, currentName: string, event: Event): void {
    event.stopPropagation();
    this.renamingPoseId = poseId;
    this.renamePoseValue = currentName;
  }

  confirmRenamePose(): void {
    if (!this.activeSkeleton || !this.renamingPoseId || !this.renamePoseValue.trim()) return;
    this.sm?.renamePose3D?.(this.activeSkeleton.id, this.renamingPoseId, this.renamePoseValue.trim());
    this.renamingPoseId = null;
    this.refreshPoses();
  }

  cancelRenamePose(): void {
    this.renamingPoseId = null;
  }

  deletePose(poseId: string, event: Event): void {
    event.stopPropagation();
    if (!this.activeSkeleton) return;
    this.sm?.deletePose3D?.(this.activeSkeleton.id, poseId);
    this.refreshPoses();
  }

  // ── Preset Poses ──────────────────────────────────────────────────

  async refreshPresetPoses(): Promise<void> {
    this.presetPoseNames = await this.sm?.getBodyPoseNames3D?.() ?? [];
  }

  async applyPresetPose(poseName: string): Promise<void> {
    if (!this.activeSkeleton) return;
    await this.sm?.applyBodyPose3D?.(this.activeSkeleton.id, poseName);
  }

  // ── Spring / Jiggle ──────────────────────────────────────────────

  private _refreshSpringChains(): void {
    if (!this.activeSkeleton) { this.springChains = []; return; }
    const raw: any[] = this.sm?.getSpringChains3D?.(this.activeSkeleton.id) ?? [];
    this.springChains = raw.map((c: any) => ({
      id: c.id,
      enabled: c.enabled ?? true,
      jointIndices: c.jointIndices ?? [],
      stiffness: c.stiffness ?? 0.5,
      drag: c.drag ?? 0.3,
      gravity: c.gravity ?? 0.005,
      hitRadius: c.hitRadius ?? 0.05,
    }));
    if (this.selectedSpringChainId && !this.springChains.find(c => c.id === this.selectedSpringChainId)) {
      this.selectedSpringChainId = null;
    }
  }

  get selectedSpringChain(): any | null {
    return this.springChains.find(c => c.id === this.selectedSpringChainId) ?? null;
  }

  springChainRootName(chain: any): string {
    const idx = chain.jointIndices?.[0] ?? -1;
    return this.joints[idx]?.name ?? `Joint ${idx}`;
  }

  selectSpringChain(chain: any): void {
    this.selectedSpringChainId = chain.id;
    this.springStiffness = chain.stiffness;
    this.springDrag = chain.drag;
    this.springGravity = chain.gravity;
    this.springHitRadius = chain.hitRadius;
  }

  createSpringChain(): void {
    if (!this.activeSkeleton || this.selectedJointIdx === null) return;
    const indices = this._getSpringChainIndices(this.selectedJointIdx);
    this.sm?.createSpringChain3D?.(this.activeSkeleton.id, indices, {
      stiffness: this.springStiffness,
      drag: this.springDrag,
      gravity: this.springGravity,
      hitRadius: this.springHitRadius,
    });
    this._refreshSpringChains();
  }

  private _getSpringChainIndices(rootIdx: number): number[] {
    const result: number[] = [rootIdx];
    let current = rootIdx;
    while (true) {
      const childIdx = this.joints.findIndex((j, i) => i !== current && j.parentIdx === current);
      if (childIdx === -1) break;
      result.push(childIdx);
      current = childIdx;
    }
    return result;
  }

  removeSpringChain(chainId: string, event: Event): void {
    event.stopPropagation();
    if (!this.activeSkeleton) return;
    this.sm?.removeSpringChain3D?.(this.activeSkeleton.id, chainId);
    if (this.selectedSpringChainId === chainId) this.selectedSpringChainId = null;
    this._refreshSpringChains();
  }

  toggleSpringChainEnabled(chain: any, event: Event): void {
    event.stopPropagation();
    if (!this.activeSkeleton) return;
    this.sm?.setSpringChainParams3D?.(this.activeSkeleton.id, chain.id, { enabled: !chain.enabled });
    this._refreshSpringChains();
  }

  onSpringParamChanged(): void {
    if (!this.activeSkeleton || !this.selectedSpringChainId) return;
    this.sm?.setSpringChainParams3D?.(this.activeSkeleton.id, this.selectedSpringChainId, {
      stiffness: this.springStiffness,
      drag: this.springDrag,
      gravity: this.springGravity,
      hitRadius: this.springHitRadius,
    });
  }
}
