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

@Component({
  selector: 'app-armature-panel',
  templateUrl: './armature-panel.component.html',
  styleUrls: ['./armature-panel.component.scss'],
})
export class ArmaturePanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() shapeManager: any = null;
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
  selectedJointIdx: number | null = null;
  renamingIdx: number | null = null;
  renameValue = '';
  moveX = 0;
  moveY = 0;
  moveZ = 0;
  tailX = 0;
  tailY = 0.3;
  tailZ = 0;

  // ── Bind ─────────────────────────────────────────────────────────
  meshes: Array<{ id: string; name: string }> = [];
  bindMeshId = '';
  bindSkeletonId = '';
  bindResult = '';

  // ── Weight Paint ─────────────────────────────────────────────────
  wpJointIdx = 0;
  wpRadius = 0.15;
  wpStrength = 0.5;
  wpTargetWeight = 1.0;
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

  ngOnInit(): void {
    if (this.shapeManager) {
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
    }
  }

  private _applyJointSelection(idx: number): void {
    this.selectedJointIdx = idx;
    this.renamingIdx = null;
    const j = this.joints[idx];
    if (j) {
      this.moveX = j.x; this.moveY = j.y; this.moveZ = j.z;
      this.tailX = j.tailOffset[0]; this.tailY = j.tailOffset[1]; this.tailZ = j.tailOffset[2];
    }
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

  focusMesh(): void {
    if (!this.bindMeshId) return;
    this.sm?.centerCameraOnMesh3D?.(this.bindMeshId);
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
    if (!this.activeSkeleton) { this.joints = []; return; }
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

  extrudeJoint(): void {
    if (!this.activeSkeleton) return;
    this.sm?.extrudeJoint3D?.(this.activeSkeleton.id);
    // extrudeJoint3D arms placement mode automatically; no enterBonePlacementMode3D needed
    this.placementModeActive = true;
    this.placementPhase = 'tail';
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
    console.log('[bind-mesh] result:', ok, '| mesh:', this.bindMeshId, '| skel:', this.activeSkeleton.id, '| joints:', this.joints.length);
    if (ok === false) {
      this.bindResult = 'Bind failed — add joints first';
    } else {
      this.bindResult = `Bound "${this.bindMeshName}" → "${this.activeSkeleton.name}"`;
    }
  }

  // ── Weight paint ─────────────────────────────────────────────────

  enterWeightPaint(): void {
    if (!this.bindMeshId || !this.activeSkeleton) return;
    const jointIdx = this.selectedJointIdx ?? 0;
    this.sm?.setWeightPaintBrush?.(this.wpRadius, this.wpStrength, this.wpTargetWeight);
    const ok = this.sm?.enterWeightPaintMode3D?.(this.bindMeshId, this.activeSkeleton.id, jointIdx);
    console.log('[weight-paint] entered:', ok, '| mesh:', this.bindMeshId, '| skel:', this.activeSkeleton.id, '| joint:', jointIdx);
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

  // ── Retarget ─────────────────────────────────────────────────────

  retarget(): void {
    if (!this.retargetTgtSkeletonId || this._clipObjects.length === 0) return;
    const clip = this._clipObjects[this.retargetSrcClipIdx];
    if (!clip) return;
    this.sm?.retargetSkeletonClip3D?.(clip.id, this.retargetTgtSkeletonId);
  }
}
