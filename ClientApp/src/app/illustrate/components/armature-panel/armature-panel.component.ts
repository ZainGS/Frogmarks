import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectorRef, NgZone, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import ShapeManager from '@zaings/salsa/shape-manager';
import { FrameCoalescer } from '../../../shared/utilities/frame-coalescer';
import { ArmRigService } from './arm-rig.service';
import { ArmBindingService } from './arm-binding.service';
import { ArmAnimService } from './arm-anim.service';
import { ArmLibraryService } from './arm-library.service';
import { ArmSpringService } from './arm-spring.service';

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
  providers: [ArmRigService, ArmBindingService, ArmAnimService, ArmLibraryService, ArmSpringService],
})
export class ArmaturePanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  @Input() initialMeshId: string = '';
  @Output() closeRequest = new EventEmitter<void>();

  constructor(public cdr: ChangeDetectorRef, public rig: ArmRigService, public binding: ArmBindingService, public anim: ArmAnimService, public library: ArmLibraryService, public spring: ArmSpringService) {
    rig.bind(this); binding.bind(this); anim.bind(this); library.bind(this); spring.bind(this);
  }

  private get sm(): ShapeManager { return this.shapeManager; }
  private _sceneChangeSub: { unsubscribe(): void } | null = null;

  // ── Skeletons ────────────────────────────────────────────────────

  // ── Joints ───────────────────────────────────────────────────────

  // ── IK ───────────────────────────────────────────────────────────

  // ── Bind ─────────────────────────────────────────────────────────

  // ── Weight Paint ─────────────────────────────────────────────────

  // ── Clips ────────────────────────────────────────────────────────

  // ── Background ───────────────────────────────────────────────────
  bgMode: 'wavy' | 'gradient' | 'dim' | 'solid' | 'none' = 'wavy';

  // ── Retarget ─────────────────────────────────────────────────────

  // ── Bone Constraints ─────────────────────────────────────────────

  // ── Pose Library ──────────────────────────────────────────────────

  // ── Preset Poses ──────────────────────────────────────────────────

  // ── Spring / Jiggle ───────────────────────────────────────────────

  // ── NLA ───────────────────────────────────────────────────────────

  // ── Animation Library ─────────────────────────────────────────────

  // ── Global Library ────────────────────────────────────────────────

  ngOnInit(): void {
    if (this.shapeManager) {
      if (this.initialMeshId) this.binding.bindMeshId = this.initialMeshId;
      this._subscribeScene();
      this.binding.refreshMeshes();
      this.sm?.enterArmatureMode3D(this.binding.bindMeshId || undefined);
      this.sm?.setArmatureBgMode3D({ mode: this.bgMode });
      this.sm?.setArmatureToolMode3D('rotate');
      this.rig.refreshSkeletons();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['shapeManager'] && this.shapeManager) {
      this._unsubscribeScene();
      this._subscribeScene();
      this.sm?.setArmatureBgMode3D({ mode: this.bgMode });
      this.refreshAll();
    }
  }

  /** Every close path (the panel's ✕, the toolbar, Shift+Tab, another 3D mode taking over) removes this panel. */
  ngOnDestroy(): void {
    this._unsubscribeScene();
    if (this.binding.wpActive) this.sm?.exitWeightPaintMode3D();
    this.sm?.exitBonePlacementMode3D();
    this.sm?.showBoneOverlay3D(null);
    this.sm?.selectJoint3D(null);
    this.sm?.setArmatureBgMode3D({ mode: 'none' });
    // Each service stops its own work (clip / NLA players / polls, library previews) in its ngOnDestroy.
  }

  private readonly _zone = inject(NgZone);
  /** Scene-graph changes fire per pointer move from the engine's zoneless listeners (bone placement, weight paint, 2D
   *  drags): apply them in ONE zone entry per frame. Raised from Angular code (in the zone): applied at once. */
  private readonly _sceneFrame = new FrameCoalescer(() => this._zone.run(() => this._onSceneGraphChanged()));

  private _subscribeScene(): void {
    const obs = this.shapeManager?.interactionService?.onSceneGraphChanged;
    if (obs) {
      this._sceneChangeSub = obs.subscribe(() => {
        if (NgZone.isInAngularZone()) this._onSceneGraphChanged();
        else this._sceneFrame.mark('scene');
      });
    }
  }

  private _onSceneGraphChanged(): void {
    this.rig.placementModeActive = this.sm?.isBonePlacementModeActive3D() ?? false;
    this.binding.wpActive = this.sm?.isWeightPainting3D() ?? this.binding.wpActive;
    this.refreshAll();
    this._syncViewportSelection();
    // Detect root bone head→tail phase transition: joint was added but placement still active
    if (this.rig.placementPhase === 'head' && this.rig.placementModeActive && this.rig.joints.length > this.rig._placementJointCount) {
      this.rig.placementPhase = 'tail';
    }
    if (!this.rig.placementModeActive) {
      this.rig.placementPhase = null;
    }
  }

  private _unsubscribeScene(): void {
    this._sceneChangeSub?.unsubscribe();
    this._sceneChangeSub = null;
    this._sceneFrame.cancel();
  }

  private _syncViewportSelection(): void {
    const idx: number | null = this.sm?.getSelectedJointIndex3D() ?? null;
    this.rig.selectedJointIsTail = this.sm?.getSelectedJointIsTail3D() ?? false;
    if (idx !== null && idx !== this.rig.selectedJointIdx) {
      this.rig._applyJointSelection(idx);
    } else if (idx !== null && this.rig.armatureToolMode === 'rotate') {
      this.rig._syncRotationInputs(idx);
    }
    // Always sync IK inputs — handles viewport drag updating chain.target/poleTarget
    this.rig._syncIKInputs();
  }

  /** The editor removes the panel; engine cleanup runs in ngOnDestroy. */
  close(): void {
    this.closeRequest.emit();
  }

  updateBgMode(): void {
    this.sm?.setArmatureBgMode3D({ mode: this.bgMode });
  }

  refreshAll(): void {
    this.binding.refreshMeshes();
    this.rig.refreshSkeletons();
    this.library.refreshAnimLibrary();
  }

  // ── Skeleton ops ─────────────────────────────────────────────────

  // ── Joint ops ────────────────────────────────────────────────────

  // ── Mesh / bind ──────────────────────────────────────────────────

  // ── Weight paint ─────────────────────────────────────────────────

  // ── Clips ────────────────────────────────────────────────────────

  // ── IK ops ───────────────────────────────────────────────────────

  // ── Retarget ─────────────────────────────────────────────────────

  // ── NLA ──────────────────────────────────────────────────────────

  // ── Bone Constraints ─────────────────────────────────────────────

  // ── Pose Library ──────────────────────────────────────────────────

  // ── Preset Poses ──────────────────────────────────────────────────

  // ── Spring / Jiggle ──────────────────────────────────────────────

  // ── Animation Library ────────────────────────────────────────────

  // ── Global Library ────────────────────────────────────────────────

}
