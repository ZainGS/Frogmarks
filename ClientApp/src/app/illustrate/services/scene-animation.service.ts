import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';

/** What the 3D animation state needs from the editor that hosts it. */
export interface SceneAnimationHost {
  shapeManager(): ShapeManager;
  markDirty(): void;
  selectedMeshId(): string | null;
  /** The editor's wrapper: rebuilds the rows here, then syncs its selection name + blend-shape keyframes. */
  refreshKeyframeTracks(): void;
}

/**
 * 3D animation: the timeline-synced animation player + its config, keyframe recording and tracks (mesh + camera),
 * auto-key, cinematic cameras (look-through) and camera cuts, and the Play-mode player object with its
 * locomotion set / blend / overlay. Component-scoped (provided by IllustrationComponent); the animation
 * timeline binds to these fields. Extracted from illustration.component (refactor-plan 2.7e).
 */
@Injectable()
export class SceneAnimationService implements OnDestroy {
  private host!: SceneAnimationHost;
  constructor(public animationService: RasterAnimationService) {}
  bind(host: SceneAnimationHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager(); }

  ngOnDestroy(): void { clearTimeout(this._scene3dFlashTimer); }

  /** Rebuild the per-mesh keyframe rows (+ a synthetic camera row). Returns the selected mesh's row, if any. */
  buildKeyframeTracks(selectedId: string | null, fallbackMeshes: any[]): { meshId: string; name: string; tracks: any } | null {
    const sm = this.shapeManager;
    const s3d = sm.scene3d;

    // Always fetch fresh mesh objects so keyframeTracks reflects the latest recorded data.
    const freshMeshes: any[] = s3d?.getAllMeshes() ?? fallbackMeshes;

    // Build one row per mesh. Priority order for track data:
    //   1. mesh.keyframeTracks  — live property on the mesh object, always up to date
    //   2. getMeshKeyframeTracks3D(id) — Salsa public API
    //   3. getAllMeshKeyframeTracks3D() entry — batch API
    //   4. {} — empty (mesh exists, no keyframes yet)
    const fromSalsa: { meshId: string; name: string; tracks: any }[] =
      sm.getAllMeshKeyframeTracks3D() ?? [];
    const salsaknownTracks = new Map(fromSalsa.map(e => [e.meshId, e.tracks]));

    const allRows: { meshId: string; name: string; tracks: any }[] = freshMeshes
      .filter((m: any) => m.id ?? m.nodeId)
      .map((m: any) => {
        const id = m.id ?? m.nodeId;
        const tracks =
          (m.keyframeTracks && Object.keys(m.keyframeTracks).length ? m.keyframeTracks : null)
          ?? sm.getMeshKeyframeTracks3D(id)
          ?? salsaknownTracks.get(id)
          ?? {};
        return { meshId: id, name: m.name ?? m.meshPrimitive ?? 'Mesh3D', tracks };
      });

    // Prepend a synthetic camera row if camera tracks exist
    const camTracks = sm.getCameraKeyframeTracks3D() ?? {};
    if (Object.keys(camTracks).some(k => (camTracks[k]?.length ?? 0) > 0)) {
      allRows.unshift({ meshId: '__camera__', name: '📷 Camera', tracks: camTracks, isCamera: true } as any);
    }

    this.scene3dAllMeshTracks = allRows;

    if (!selectedId) { this.scene3dSelectedMeshTracks = null; return null; }
    const entry = allRows.find(e => e.meshId === selectedId) ?? null;
    this.scene3dSelectedMeshTracks = entry?.tracks ?? null;
    return entry;
  }

  scene3dPlayerObjectId: string | null = null;

  scene3dAnimLibrary: any[] = [];

  scene3dLocoIdle = '';

  scene3dLocoWalk = '';

  scene3dLocoRun = '';

  scene3dLocoJump = '';

  scene3dLocoFall = '';

  scene3dLocoBlend = false;

  scene3dLocoBlendWalkSpeed = 1.2;

  scene3dLocoBlendRunSpeed = 3.2;

  scene3dOverlayClip = '';

  scene3dOverlayRegion = 'upperBody';

  scene3dOverlayMode: 'replace' | 'additive' = 'replace';

  scene3dOverlayWeight = 1.0;

  // Cinematic cameras
  scene3dCameraNodes: { id: string; name: string }[] = [];

  scene3dLookThroughId: string | null = null;

  scene3dCameraCuts: { cameraId: string; frame: number }[] = [];

  scene3dCutPreviewOn = false;

  // Phase 4: 3D animation panel state
  scene3dAnimSyncWithTimeline = true;

  scene3dAnimStartFrame = 0;

  scene3dAnimEndFrame = 120;

  scene3dAnimFps = 24;

  scene3dAnimLoop = true;

  // -- Keyframe recording feedback
  scene3dKeyframeFlash = false;

  private _scene3dFlashTimer: any = null;

  // -- Dope Sheet data for the timeline component
  scene3dSelectedMeshTracks: any = null;

  scene3dAllMeshTracks: { meshId: string; name: string; tracks: any }[] = [];

  get scene3dAnimCurrentFrame(): number {
    const player = this.shapeManager.getAnimationPlayer3D();
    return player?.currentFrame ?? this.animationService.getCurrentFrame?.() ?? 0;
  }

  scene3dSetPlayerObject(meshId: string | null): void {
    const sm = this.shapeManager;
    const next = meshId === this.scene3dPlayerObjectId ? null : meshId;
    sm.setPlayerObject3D(next);
    this.scene3dPlayerObjectId = next;
    if (next) this._loadPlayerState();
  }

  /** Mirror the engine's persisted Play binding into the panel after a load (it was never read back, so after a
   *  reload the Player Animation section stayed hidden although the engine still had a Player). */
  syncPlayerFromEngine(): void {
    this.scene3dPlayerObjectId = this.shapeManager.playerObjectId3D ?? null;
    if (this.scene3dPlayerObjectId) this._loadPlayerState();
  }

  private _loadPlayerState(): void {
    const sm = this.shapeManager;
    this.scene3dRefreshAnimLibrary();
    const locoSet = sm.getPlayerLocomotionSet3D() ?? {};
    this.scene3dLocoIdle  = locoSet.idle  ?? '';
    this.scene3dLocoWalk  = locoSet.walk  ?? '';
    this.scene3dLocoRun   = locoSet.run   ?? '';
    this.scene3dLocoJump  = locoSet.jump  ?? '';
    this.scene3dLocoFall  = locoSet.fall  ?? '';
    const blend = sm.getPlayerLocomotionBlend3D();
    this.scene3dLocoBlend = !!blend;
    if (blend && typeof blend === 'object') {
      this.scene3dLocoBlendWalkSpeed = blend.walkSpeed ?? 1.2;
      this.scene3dLocoBlendRunSpeed  = blend.runSpeed  ?? 3.2;
    }
    const overlay = sm.getPlayerAnimationOverlay3D();
    this.scene3dOverlayClip   = overlay?.clip ?? '';
    this.scene3dOverlayRegion = (overlay?.region as any) ?? 'upperBody';
    this.scene3dOverlayMode   = overlay?.mode    ?? 'replace';
    this.scene3dOverlayWeight = overlay?.weight  ?? 1.0;
  }

  scene3dRefreshAnimLibrary(): void {
    this.scene3dAnimLibrary = this.shapeManager.getAnimationLibrary3D() ?? [];
  }

  scene3dApplyLocomotionSet(): void {
    const sm = this.shapeManager;
    const set: any = {};
    if (this.scene3dLocoIdle) set.idle = this.scene3dLocoIdle;
    if (this.scene3dLocoWalk) set.walk = this.scene3dLocoWalk;
    if (this.scene3dLocoRun)  set.run  = this.scene3dLocoRun;
    if (this.scene3dLocoJump) set.jump = this.scene3dLocoJump;
    if (this.scene3dLocoFall) set.fall = this.scene3dLocoFall;
    sm.setPlayerLocomotionSet3D(set);
  }

  scene3dSetLocoBlend(on: boolean): void {
    this.scene3dLocoBlend = on;
    const sm = this.shapeManager;
    sm.setPlayerLocomotionBlend3D(on ? { walkSpeed: this.scene3dLocoBlendWalkSpeed, runSpeed: this.scene3dLocoBlendRunSpeed } : null);
  }

  scene3dApplyLocoBlendSpeeds(): void {
    if (!this.scene3dLocoBlend) return;
    this.shapeManager.setPlayerLocomotionBlend3D({ walkSpeed: this.scene3dLocoBlendWalkSpeed, runSpeed: this.scene3dLocoBlendRunSpeed });
  }

  scene3dApplyOverlay(): void {
    const sm = this.shapeManager;
    if (!this.scene3dOverlayClip) {
      sm.setPlayerAnimationOverlay3D(null, this.scene3dOverlayRegion as any);
      return;
    }
    sm.setPlayerAnimationOverlay3D(this.scene3dOverlayClip, this.scene3dOverlayRegion as any, {
      mode: this.scene3dOverlayMode,
      weight: this.scene3dOverlayWeight,
    });
  }

  scene3dRefreshCameraNodes(): void {
    const sm = this.shapeManager;
    const nodes: any[] = sm.listCameraNodes3D() ?? [];
    this.scene3dCameraNodes = nodes.map((n: any) => ({ id: n.id, name: n.name || 'Camera' }));
  }

  scene3dAddCamera(): void {
    const sm = this.shapeManager;
    const id: string | undefined = sm.createCameraNode3D(0, 0, 0, { fov: 60 });
    if (!id) return;
    // Engine expects an image source, not a path — fetch the asset first
    fetch('assets/fishing_frog.png').then(r => r.ok ? r.blob() : null)
      .then(b => { if (b) void sm.setCameraMarkerSprite3D(id, b); })
      .catch(() => {});
    this.scene3dRefreshCameraNodes();
  }

  scene3dToggleLookThrough(id: string): void {
    const sm = this.shapeManager;
    if (this.scene3dLookThroughId === id) {
      sm.lookThroughCamera3D(null);
      this.scene3dLookThroughId = null;
    } else {
      sm.lookThroughCamera3D(id);
      this.scene3dLookThroughId = id;
    }
  }

  scene3dDeleteCamera(id: string): void {
    const sm = this.shapeManager;
    if (this.scene3dLookThroughId === id) {
      sm.lookThroughCamera3D(null);
      this.scene3dLookThroughId = null;
    }
    sm.deleteCameraNode3D(id);
    this.scene3dRefreshCameraNodes();
  }

  scene3dRefreshCuts(): void {
    const sm = this.shapeManager;
    this.scene3dCameraCuts = [...(sm.getCameraCuts3D() ?? [])];
  }

  scene3dDropCut(cameraId: string, frame: number): void {
    const sm = this.shapeManager;
    sm.setCameraCut3D(frame, cameraId);
  }

  scene3dRemoveCut(frame: number): void {
    const sm = this.shapeManager;
    sm.removeCameraCut3D(frame);
  }

  scene3dToggleCutPreview(): void {
    this.scene3dCutPreviewOn = !this.scene3dCutPreviewOn;
    const sm = this.shapeManager;
    sm.setPreviewThroughCameras3D(this.scene3dCutPreviewOn);
  }

  scene3dClearAllCuts(): void {
    this.shapeManager.clearCameraCuts3D();
    this.scene3dRefreshCuts();
  }

  scene3dExportCinematic(): void {
    // TODO: was always a no-op (engine requires opts + onFrame callback) — needs a real export flow
    console.warn('Cinematic export not yet wired — needs CinematicExportOptions + frame sink');
  }

  scene3dRecordCameraKeyframe(): void {
    const sm = this.shapeManager;
    const frame = this.animationService.getCurrentFrame?.() ?? 1;
    sm.recordCameraKeyframe3D(frame);
    this.host.refreshKeyframeTracks();
    this.host.markDirty();
  }

  scene3dEnsureAnimationPlayer(): void {
    const sm = this.shapeManager;
    if (!sm.getAnimationPlayer3D()) {
      sm.createAnimationPlayer3D({
        startFrame: this.scene3dAnimStartFrame,
        endFrame: this.scene3dAnimEndFrame,
        fps: this.scene3dAnimFps,
        loop: this.scene3dAnimLoop,
      });
    }
  }

  scene3dApplyAnimationConfig(): void {
    this.scene3dEnsureAnimationPlayer();
    const player = this.shapeManager.getAnimationPlayer3D();
    if (!player) return;
    player.startFrame = +this.scene3dAnimStartFrame;
    player.endFrame = +this.scene3dAnimEndFrame;
    player.fps = +this.scene3dAnimFps;
    player.loop = !!this.scene3dAnimLoop;
    this.host.markDirty();
  }

  scene3dToggleAnimationSync(sync: boolean): void {
    this.scene3dAnimSyncWithTimeline = sync;
    if (sync) {
      this.shapeManager.scene3d?.stopSyncedPlayback();
    }
    this.host.markDirty();
  }

  scene3dAnimationPlay(): void {
    this.scene3dEnsureAnimationPlayer();
    const sm = this.shapeManager;
    if (this.scene3dAnimSyncWithTimeline) {
      sm.scene3d?.startSyncedPlayback();
      return;
    }
    sm.getAnimationPlayer3D()?.play();
  }

  scene3dAnimationPause(): void {
    const sm = this.shapeManager;
    if (this.scene3dAnimSyncWithTimeline) {
      sm.scene3d?.pauseSyncedPlayback();
      return;
    }
    sm.getAnimationPlayer3D()?.pause();
  }

  scene3dAnimationStop(): void {
    const sm = this.shapeManager;
    if (this.scene3dAnimSyncWithTimeline) {
      sm.scene3d?.stopSyncedPlayback();
      return;
    }
    sm.getAnimationPlayer3D()?.stop();
  }

  scene3dRecordKeyframe(): void {
    const sm = this.shapeManager;
    const frame = this.animationService.getCurrentFrame?.() ?? 1;
    const count = sm.recordKeyframesForSelectedMeshes3D(frame);
    if (!count && this.host.selectedMeshId()) {
      sm.recordKeyframeForMesh3D(this.host.selectedMeshId(), frame);
    }
    this.host.refreshKeyframeTracks();
    this.scene3dKeyframeFlash = true;
    clearTimeout(this._scene3dFlashTimer);
    this._scene3dFlashTimer = setTimeout(() => { this.scene3dKeyframeFlash = false; }, 600);
    this.host.markDirty();
  }

  get scene3dAutoKey(): boolean {
    return !!this.shapeManager.autoKey3D;
  }

  scene3dSetAutoKey(enabled: boolean): void {
    this.shapeManager.autoKey3D = enabled;
  }
}
