import { Injectable, NgZone, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { ArmaturePanelComponent, ArmatureClip, NLATrackDisplay } from './armature-panel.component';

/** What ArmAnimService reads / writes on the panel. */
export type ArmAnimHost = Pick<ArmaturePanelComponent,
  'shapeManager' | 'cdr' | 'library' | 'rig'
>;

/**
 * Skeleton animation: clips (record / play / play over idle / delete), NLA tracks + segments + crossfades, retarget.
 * Panel-scoped (provided by ArmaturePanelComponent, bound in its constructor). Bodies moved verbatim from
 * armature-panel.component (audit Phase 5.5).
 */
@Injectable()
export class ArmAnimService implements OnDestroy {
  private host!: ArmAnimHost;
  bind(host: ArmAnimHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }
  private get sm(): ShapeManager { return this.host.shapeManager; }

  constructor(private zone: NgZone) {}

  ngOnDestroy(): void {
    clearInterval(this._overIdlePoll);
    this.stopClip();
    for (const [trackId] of this._nlaPlayers) this.sm?.stopNLATrack3D(trackId);
    this._nlaPlayers.clear();
  }

  _clipObjects: any[] = [];

  private _clipPlayer: any = null;

  clipsCollapsed = false;

  retargetCollapsed = true;

  clips: ArmatureClip[] = [];

  newClipName = 'Clip';

  newClipFps = 24;

  newClipEndFrame = 48;

  activeClipIdx: number | null = null;

  recordFrame = 0;

  isPlaying = false;

  retargetSrcClipIdx = 0;

  retargetTgtSkeletonId = '';

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

  refreshClips(): void {
    if (!this.host.rig.activeSkeleton) { this.clips = []; this._clipObjects = []; return; }
    this._clipObjects = this.sm?.getSkeletonClips3D(this.host.rig.activeSkeleton.id) ?? [];
    this.clips = this._clipObjects.map((c: any) => ({ id: c.id, name: c.name ?? 'Clip' }));
    if (this.activeClipIdx !== null && this.activeClipIdx >= this.clips.length) {
      this.activeClipIdx = null;
    }
    this.refreshNLATracks();
    this.host.library.refreshPoses();
  }

  createClip(): void {
    if (!this.host.rig.activeSkeleton || !this.newClipName.trim()) return;
    this.sm?.createSkeletonClip3D(
      this.host.rig.activeSkeleton.id,
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
    this.sm?.deleteSkeletonClip3D(clip.id);
    if (this.activeClipIdx === idx) this.activeClipIdx = null;
    this.refreshClips();
  }

  recordPose(): void {
    if (this.host.rig.activeSkeleton === null || this.activeClipIdx === null) return;
    const clip = this._clipObjects[this.activeClipIdx];
    if (!clip) return;
    this.sm?.recordSkeletonPose3D(this.host.rig.activeSkeleton.id, clip.id, this.recordFrame);
    if (this.host.rig.ikChains.length > 0) {
      this.sm?.recordIKPose3D(this.host.rig.activeSkeleton.id, clip.id, this.recordFrame);
    }
  }

  /** Play the clip once layered over the idle (breathing/sway continue). Procedural characters only. */
  playWithIdle = false;

  private _overIdleBodyId: string | null = null;

  private _overIdlePoll: any = null;

  /** Engine only maps mesh→skeleton, so reverse-look-up the procedural body driven by this skeleton. */
  private _bodyIdForActiveSkeleton(): string | null {
    const skId = this.host.rig.activeSkeleton?.id;
    if (!skId) return null;
    const meshes: any[] = this.sm?.getAllMeshes3D() ?? [];
    const body = meshes.find(m => this.sm?.isProceduralBody3D(m.id) && this.sm?.getSkeletonIdForMesh3D(m.id) === skId);
    return body?.id ?? null;
  }

  playClip(): void {
    if (this.host.rig.activeSkeleton === null || this.activeClipIdx === null) return;
    const clip = this._clipObjects[this.activeClipIdx];
    if (!clip) return;
    if (this.playWithIdle) {
      const bodyId = this._bodyIdForActiveSkeleton();
      if (bodyId && this.sm?.playClipOverIdle3D(bodyId, clip.name ?? clip.id)) {
        this._overIdleBodyId = bodyId;
        this.isPlaying = true;
        // One-shot with no player handle — poll until it finishes to reset the Play button
        clearInterval(this._overIdlePoll);
        // Polled outside the zone (a 200ms in-zone timer re-checked the whole app); re-enter only when it ends
        this.zone.runOutsideAngular(() => {
          this._overIdlePoll = setInterval(() => {
            if (!this.sm?.isPlayingOverIdle3D(bodyId)) this.zone.run(() => this._endOverIdle());
          }, 200);
        });
        return;
      }
      // Not a procedural body (or the engine refused) — fall through to a normal play
    }
    // H4: started OUTSIDE the zone — the player's per-frame loop / timers must not run app change detection
    const skelId = this.host.rig.activeSkeleton.id;
    this._clipPlayer = this.zone.runOutsideAngular(() => {
      const player = this.sm?.playSkeletonClip3D(skelId, clip);
      player?.play?.();
      return player;
    });
    this.isPlaying = true;
  }

  private _endOverIdle(): void {
    clearInterval(this._overIdlePoll);
    this._overIdlePoll = null;
    this._overIdleBodyId = null;
    this.isPlaying = false;
    this.host.cdr.markForCheck();
  }

  stopClip(): void {
    if (this._overIdleBodyId) {
      // The engine has no stop for a one-shot over idle — it finishes on its own
      this._endOverIdle();
      return;
    }
    this._clipPlayer?.stop?.();
    this._clipPlayer = null;
    this.isPlaying = false;
  }

  retarget(): void {
    if (!this.retargetTgtSkeletonId || this._clipObjects.length === 0) return;
    const clip = this._clipObjects[this.retargetSrcClipIdx];
    if (!clip) return;
    this.sm?.retargetSkeletonClip3D(clip.id, this.retargetTgtSkeletonId);
  }

  refreshNLATracks(): void {
    if (!this.host.rig.activeSkeleton) { this.nlaTracks = []; return; }
    const raw: any[] = this.sm?.getNLATracks3D(this.host.rig.activeSkeleton.id) ?? [];
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
    if (!this.host.rig.activeSkeleton || !this.nlaNewTrackName.trim()) return;
    this.sm?.createNLATrack3D(
      this.host.rig.activeSkeleton.id,
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
    this.sm?.addNLASegment3D(track.id, clip.id, this.nlaNewSegStart, {
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
    this.sm?.removeNLASegment3D(track.id, segIdx);
    this.refreshNLATracks();
  }

  updateNLASegmentWeight(trackIdx: number, segIdx: number, weight: number): void {
    const track = this.nlaTracks[trackIdx];
    if (!track) return;
    this.sm?.updateNLASegment3D(track.id, segIdx, { weight });
  }

  playNLATrack(idx: number): void {
    const track = this.nlaTracks[idx];
    if (!track) return;
    const player = this.sm?.playNLATrack3D(track.id);
    if (player) {
      this._nlaPlayers.set(track.id, player);
      player.play?.();
      this.nlaTracks[idx].isPlaying = true;
    }
  }

  stopNLATrack(idx: number): void {
    const track = this.nlaTracks[idx];
    if (!track) return;
    this.sm?.stopNLATrack3D(track.id);
    this._nlaPlayers.delete(track.id);
    this.nlaTracks[idx].isPlaying = false;
  }

  seekNLATrack(): void {
    if (this.selectedNLATrackIdx === null) return;
    const track = this.nlaTracks[this.selectedNLATrackIdx];
    if (!track) return;
    this.sm?.seekNLATrack3D(track.id, this.nlaSeekFrame);
  }

  crossfadeNLA(): void {
    if (this.selectedNLATrackIdx === null) return;
    const track = this.nlaTracks[this.selectedNLATrackIdx];
    if (!track || track.segments.length < 2) return;
    this.sm?.crossfade3D(track.id, this.nlaCfFromSeg, this.nlaCfToSeg, this.nlaCfDur);
  }

  addClipToLibrary(idx: number, event: Event): void {
    event.stopPropagation();
    const clip = this._clipObjects[idx];
    if (!clip) return;
    this.sm?.addClipToLibrary3D(clip.id, { name: clip.name });
    this.host.library.refreshAnimLibrary();
  }
}
