import { ChangeDetectorRef, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { FrameCoalescer } from '../../../shared/utilities/frame-coalescer';
import type { ArmRigService } from './arm-rig.service';
import type { ArmBindingService } from './arm-binding.service';
import type { ArmAnimService } from './arm-anim.service';
import type { ArmLibraryService } from './arm-library.service';
import type { ArmSpringService } from './arm-spring.service';
import { armApi, type ArmJointRef } from './arm-engine';
import { DEFAULT_EDIT_BG_MODE, editBgOptions } from '../mesh-edit-chrome/mesh-edit-chrome.logic';

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

export type ArmatureBgMode = 'wavy' | 'wavy-sage' | 'checkers' | 'gradient' | 'dim' | 'solid' | 'none';

/** The armature background styles (the classic panel's dropdown, the mode header's ⋯ menu). */
export const ARMATURE_BG_MODES: ReadonlyArray<{ id: ArmatureBgMode; label: string }> = [
  { id: 'gradient', label: 'Gradient' },
  { id: 'wavy', label: 'Wavy' },
  { id: 'wavy-sage', label: 'Wavy Sage' },
  { id: 'checkers', label: 'Clover Picnic' },
  { id: 'dim', label: 'Dim' },
  { id: 'solid', label: 'Solid' },
  { id: 'none', label: 'None' },
];

/**
 * What the arm-* services and ArmatureSession read on the component that provides them: the classic
 * <app-armature-panel> or the mode chrome's <app-armature-mode>. Both provide the five services (component-scoped) and
 * bind them to themselves in their constructor.
 */
export interface ArmatureHost {
  shapeManager: ShapeManager;
  initialMeshId: string;
  cdr: ChangeDetectorRef;
  rig: ArmRigService;
  binding: ArmBindingService;
  anim: ArmAnimService;
  library: ArmLibraryService;
  spring: ArmSpringService;
  refreshAll(): void;
}

/**
 * One Armature mode session: enters the engine's armature mode, follows the scene graph and the joint selection, and
 * cleans up on stop. Shared by the classic panel and the mode chrome (moved verbatim from armature-panel.component).
 */
export class ArmatureSession {
  /** Wavy Sage by default (DEFAULT_EDIT_BG_MODE, shared with Edit Mesh). */
  bgMode: ArmatureBgMode = DEFAULT_EDIT_BG_MODE;
  /** Every selected joint (primary first) on a Salsa dist with multi-select (onArmatureJointSelectionChanged); else
   *  the primary alone. */
  selection: ArmJointRef[] = [];

  private _sceneChangeSub: { unsubscribe(): void } | null = null;
  private _selectionUnsub: (() => void) | null = null;
  /** Scene-graph changes fire per pointer move from the engine's zoneless listeners (bone placement, weight paint, 2D
   *  drags): apply them in ONE zone entry per frame. Raised from Angular code (in the zone): applied at once. */
  private readonly _sceneFrame: FrameCoalescer;

  constructor(private readonly host: ArmatureHost, private readonly zone: NgZone,
              private readonly onChanged: () => void = () => {}) {
    this._sceneFrame = new FrameCoalescer(() => this.zone.run(() => this._onSceneGraphChanged()));
  }

  private get sm(): ShapeManager { return this.host.shapeManager; }

  /** Between start() and stop(): stop() runs its engine teardown once (the editor runs it synchronously when it closes
   *  the mode — a mode switch then enters the next mode with nothing of the Armature left — and ngOnDestroy again). */
  private _running = false;
  get running(): boolean { return this._running; }

  /** ngOnInit: enter the engine's armature mode on the initial mesh. */
  start(initialTool: 'move' | 'rotate' = 'rotate'): void {
    if (!this.sm) return;
    this._running = true;
    const { rig, binding } = this.host;
    if (this.host.initialMeshId) binding.bindMeshId = this.host.initialMeshId;
    this._subscribe();
    binding.refreshMeshes();
    this.sm.enterArmatureMode3D(binding.bindMeshId || undefined);
    this.sm.setArmatureBgMode3D(editBgOptions(this.bgMode));
    this.sm.setArmatureToolMode3D(initialTool);
    rig.armatureToolMode = initialTool;
    rig.refreshSkeletons();
    this.host.library.refreshAnimLibrary();
  }

  /** ngOnChanges: a new engine instance (renderer re-init). */
  shapeManagerChanged(): void {
    if (!this.sm) return;
    this._unsubscribe();
    this._subscribe();
    this.sm.setArmatureBgMode3D(editBgOptions(this.bgMode));
    this.host.refreshAll();
  }

  /** ngOnDestroy: every close path (✕ / Done, the toolbar, Shift+Tab, another 3D mode taking over). Each service stops
   *  its own work (clip / NLA players / polls, library previews) in its ngOnDestroy. */
  stop(): void {
    if (!this._running) { this._unsubscribe(); return; }
    this._running = false;
    this._unsubscribe();
    // (the engine's own state too: the Weight Brush tool can paint without the panel's flag having caught up yet)
    if (this.host.binding.wpActive || this.sm?.isWeightPainting3D?.()) this.sm?.exitWeightPaintMode3D();
    this.sm?.exitBonePlacementMode3D();
    this.sm?.showBoneOverlay3D(null);
    this.sm?.selectJoint3D(null);
    this.sm?.setArmatureBgMode3D({ mode: 'none' });
  }

  setBgMode(mode: ArmatureBgMode): void {
    this.bgMode = mode;
    this.sm?.setArmatureBgMode3D(editBgOptions(mode));
  }

  refreshAll(): void {
    this.host.binding.refreshMeshes();
    this.host.rig.refreshSkeletons();
    this.host.library.refreshAnimLibrary();
  }

  private _subscribe(): void {
    const obs = this.sm?.interactionService?.onSceneGraphChanged;
    if (obs) {
      this._sceneChangeSub = obs.subscribe(() => {
        if (NgZone.isInAngularZone()) this._onSceneGraphChanged();
        else this._sceneFrame.mark('scene');
      });
    }
    // Newer Salsa (UI review §4): the joint selection has its own event (taps, multi-select, a removed bone).
    const api = armApi(this.sm);
    if (typeof api.onArmatureJointSelectionChanged === 'function') {
      this._selectionUnsub = api.onArmatureJointSelectionChanged((sel) => {
        const apply = (): void => { this.selection = [...(sel ?? [])]; this._syncViewportSelection(); this.onChanged(); };
        if (NgZone.isInAngularZone()) apply(); else this.zone.run(apply);
      });
    }
  }

  private _unsubscribe(): void {
    this._sceneChangeSub?.unsubscribe();
    this._sceneChangeSub = null;
    this._selectionUnsub?.();
    this._selectionUnsub = null;
    this._sceneFrame.cancel();
  }

  private _onSceneGraphChanged(): void {
    const { rig, binding } = this.host;
    rig.placementModeActive = this.sm?.isBonePlacementModeActive3D() ?? false;
    binding.wpActive = this.sm?.isWeightPainting3D() ?? binding.wpActive;
    this.host.refreshAll();
    this._syncViewportSelection();
    // Detect root bone head→tail phase transition: joint was added but placement still active
    if (rig.placementPhase === 'head' && rig.placementModeActive && rig.joints.length > rig._placementJointCount) {
      rig.placementPhase = 'tail';
    }
    if (!rig.placementModeActive) {
      rig.placementPhase = null;
    }
    this.onChanged();
  }

  private _syncViewportSelection(): void {
    const { rig, binding } = this.host;
    const idx: number | null = this.sm?.getSelectedJointIndex3D() ?? null;
    rig.selectedJointIsTail = this.sm?.getSelectedJointIsTail3D() ?? false;
    if (idx !== null && idx !== rig.selectedJointIdx) {
      rig._applyJointSelection(idx);
      if (binding.wpActive) this.sm?.setWeightPaintJoint3D(idx);   // a joint picked in the viewport paints too
    } else if (idx !== null && rig.armatureToolMode === 'rotate') {
      rig._syncRotationInputs(idx);
    }
    const api = armApi(this.sm);
    if (typeof api.getSelectedArmatureJoints3D === 'function') this.selection = api.getSelectedArmatureJoints3D() ?? [];
    else this.selection = idx !== null && rig.activeSkeleton ? [{ skeletonId: rig.activeSkeleton.id, jointIndex: idx }] : [];
    // Always sync IK inputs — handles viewport drag updating chain.target/poleTarget
    rig._syncIKInputs();
  }
}
