import { Injectable, NgZone, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { ArmaturePanelComponent } from './armature-panel.component';

/** What ArmLibraryService reads / writes on the panel. */
export type ArmLibraryHost = Pick<ArmaturePanelComponent,
  'shapeManager' | 'anim' | 'cdr' | 'initialMeshId' | 'refreshAll' | 'rig'
>;

/**
 * Pose + animation libraries: preset poses, the pose library, the per-scene animation library, and the global (cross-document) library with previews.
 * Panel-scoped (provided by ArmaturePanelComponent, bound in its constructor). Bodies moved verbatim from
 * armature-panel.component (audit Phase 5.5).
 */
@Injectable()
export class ArmLibraryService implements OnDestroy {
  private host!: ArmLibraryHost;
  bind(host: ArmLibraryHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }
  private get sm(): ShapeManager { return this.host.shapeManager; }

  constructor(private zone: NgZone) {}

  /** Preview timers used to outlive the panel (nothing cleared them). */
  ngOnDestroy(): void {
    Object.values(this._globalLibPreviewTimers).forEach(t => clearInterval(t));
  }

  poseLibraryCollapsed = false;

  poses: Array<{ id: string; name: string; region?: string }> = [];

  poseRegionFilter: string = 'all';

  get filteredPoses() {
    if (this.poseRegionFilter === 'all') return this.poses;
    return this.poses.filter(p => p.region === this.poseRegionFilter);
  }

  newPoseName = '';

  renamingPoseId: string | null = null;

  renamePoseValue = '';

  presetPosesCollapsed = true;

  presetPoseNames: string[] = [];

  animLibCollapsed = false;

  animLibrary: any[] = [];

  libRigTypeFilter = 'all';

  libTagFilter = '';

  renamingLibId: string | null = null;

  renameLibValue = '';

  globalLibCollapsed = false;

  globalLibInitialized = false;

  globalLibLoading = false;

  globalLibEntries: any[] = [];

  globalLibKindFilter = '';

  globalLibTagFilter = '';

  globalLibQuery = '';

  globalLibRenamingId: string | null = null;

  globalLibRenameValue = '';

  globalLibRetagId: string | null = null;

  globalLibRetagValue = '';

  /** id → array of PNG data-URL frames (lazy preview) */
  globalLibPreviewFrames: Record<string, string[]> = {};

  /** id → currently displayed frame index */
  globalLibPreviewFrame: Record<string, number> = {};

  private _globalLibPreviewTimers: Record<string, any> = {};

  refreshPoses(): void {
    if (!this.host.rig.activeSkeleton) { this.poses = []; return; }
    this.poses = this.sm?.getPoses3D(this.host.rig.activeSkeleton.id) ?? [];
  }

  capturePose(): void {
    if (!this.host.rig.activeSkeleton) return;
    const name = this.newPoseName.trim() || `Pose ${this.poses.length + 1}`;
    this.sm?.capturePose3D(this.host.rig.activeSkeleton.id, name);
    this.newPoseName = '';
    this.refreshPoses();
  }

  exportPoseForClaude(): void {
    const pose: string = this.sm?.exportPoseData3D(this.host.rig.activeSkeleton?.id) ?? '';
    const body: string = this.host.initialMeshId ? (this.sm?.exportBodyData3D(this.host.initialMeshId) ?? '') : '';
    const text = [pose, body].filter(s => s).join('\n\n');
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
  }

  applyPose(poseId: string): void {
    if (!this.host.rig.activeSkeleton) return;
    this.sm?.applyPose3D(this.host.rig.activeSkeleton.id, poseId);
  }

  setPoseRegion(poseId: string, region: string): void {
    if (!this.host.rig.activeSkeleton) return;
    this.sm?.setPoseRegion3D(this.host.rig.activeSkeleton.id, poseId, (region || null) as any);
    const pose = this.poses.find(p => p.id === poseId);
    if (pose) pose.region = region || undefined;
  }

  startRenamePose(poseId: string, currentName: string, event: Event): void {
    event.stopPropagation();
    this.renamingPoseId = poseId;
    this.renamePoseValue = currentName;
  }

  confirmRenamePose(): void {
    if (!this.host.rig.activeSkeleton || !this.renamingPoseId || !this.renamePoseValue.trim()) return;
    this.sm?.renamePose3D(this.host.rig.activeSkeleton.id, this.renamingPoseId, this.renamePoseValue.trim());
    this.renamingPoseId = null;
    this.refreshPoses();
  }

  cancelRenamePose(): void {
    this.renamingPoseId = null;
  }

  deletePose(poseId: string, event: Event): void {
    event.stopPropagation();
    if (!this.host.rig.activeSkeleton) return;
    this.sm?.deletePose3D(this.host.rig.activeSkeleton.id, poseId);
    this.refreshPoses();
  }

  async refreshPresetPoses(): Promise<void> {
    this.presetPoseNames = await this.sm?.getBodyPoseNames3D() ?? [];
  }

  async applyPresetPose(poseName: string): Promise<void> {
    if (!this.host.rig.activeSkeleton) return;
    await this.sm?.applyBodyPose3D(this.host.rig.activeSkeleton.id, poseName);
  }

  refreshAnimLibrary(): void {
    this.animLibrary = this.sm?.getAnimationLibrary3D() ?? [];
  }

  get filteredAnimLibrary(): any[] {
    let lib = this.animLibrary;
    if (this.libRigTypeFilter !== 'all') lib = lib.filter((e: any) => e.rigType === this.libRigTypeFilter);
    if (this.libTagFilter.trim()) {
      const tag = this.libTagFilter.trim().toLowerCase();
      lib = lib.filter((e: any) => (e.tags ?? []).some((t: string) => t.toLowerCase().includes(tag)));
    }
    return lib;
  }

  addPoseToLibrary(poseId: string, event: Event): void {
    event.stopPropagation();
    if (!this.host.rig.activeSkeleton) return;
    const pose = this.poses.find(p => p.id === poseId);
    this.sm?.addPoseToLibrary3D(this.host.rig.activeSkeleton.id, poseId, { name: pose?.name });
    this.refreshAnimLibrary();
  }

  applyLibraryEntry(entryId: string): void {
    if (!this.host.rig.activeSkeleton) return;
    this.sm?.applyLibraryEntry3D(entryId, this.host.rig.activeSkeleton.id);
  }

  libCompatibility(entryId: string): { matched: number; total: number; missing: string[] } | null {
    if (!this.host.rig.activeSkeleton) return null;
    const r = this.sm?.libraryCompatibility3D(entryId, this.host.rig.activeSkeleton.id);
    if (!r) return null;
    return { matched: r.matched, total: r.matched + (r.missing?.length ?? 0), missing: r.missing ?? [] };
  }

  startRenameLibEntry(entryId: string, name: string, event: Event): void {
    event.stopPropagation();
    this.renamingLibId = entryId;
    this.renameLibValue = name;
  }

  confirmRenameLibEntry(): void {
    if (!this.renamingLibId || !this.renameLibValue.trim()) return;
    this.sm?.renameLibraryEntry3D(this.renamingLibId, this.renameLibValue.trim());
    this.renamingLibId = null;
    this.refreshAnimLibrary();
  }

  cancelRenameLibEntry(): void {
    this.renamingLibId = null;
  }

  removeLibraryEntry(entryId: string, event: Event): void {
    event.stopPropagation();
    this.sm?.removeLibraryEntry3D(entryId);
    this.refreshAnimLibrary();
  }

  setLibEntryRigType(entryId: string, rigType: string): void {
    this.sm?.setLibraryEntryRigType3D(entryId, rigType);
    this.refreshAnimLibrary();
  }

  exportAnimLibrary(): void {
    const json: string = this.sm?.exportAnimationLibrary3D() ?? '';
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'animation-library.json'; a.click();
    URL.revokeObjectURL(url);
  }

  importAnimLibrary(event: Event, merge: boolean): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.sm?.importAnimationLibrary3D(reader.result as string, { merge });
      this.refreshAnimLibrary();
    };
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = '';
  }

  async globalLibOpen(): Promise<void> {
    if (this.globalLibInitialized) return;
    this.globalLibLoading = true;
    this.host.cdr.markForCheck();
    await this.sm?.assets?.init();
    this.globalLibInitialized = true;
    this.globalLibLoading = false;
    this.globalLibRefresh();
  }

  globalLibRefresh(): void {
    this.globalLibEntries = this.sm?.assets?.list({
      kind: this.globalLibKindFilter || undefined,
      query: this.globalLibQuery || undefined,
    }) ?? [];
    this.host.cdr.markForCheck();
  }

  get filteredGlobalLib(): any[] {
    let entries = this.globalLibEntries;
    if (this.globalLibTagFilter.trim()) {
      const tags = this.globalLibTagFilter.trim().toLowerCase().split(/\s+/);
      entries = entries.filter((e: any) =>
        tags.every((t: string) => (e.tags ?? []).some((et: string) => et.toLowerCase().includes(t)))
      );
    }
    return entries;
  }

  async globalLibPromoteClip(idx: number, event: Event): Promise<void> {
    event.stopPropagation();
    const clip = this.host.anim._clipObjects[idx];
    if (!clip) return;
    const name = clip.name || 'Clip';
    await this.sm?.promoteClipToGlobal3D(clip.id, { name, tags: [] });
    await this.sm?.assets?.init();
    this.globalLibInitialized = true;
    this.globalLibRefresh();
  }

  async globalLibPromotePose(poseId: string, event: Event): Promise<void> {
    event.stopPropagation();
    const sk = this.host.rig.activeSkeleton;
    if (!sk) return;
    const poses: any[] = this.sm?.getPoses3D(sk.id) ?? [];   // { id, name, region? }[] (getSavedPoses3D was a phantom)
    const pose = poses.find((p: any) => p.id === poseId);
    const name = pose?.name || 'Pose';
    await this.sm?.promotePoseToGlobal3D(sk.id, poseId, { name, tags: [] });
    await this.sm?.assets?.init();
    this.globalLibInitialized = true;
    this.globalLibRefresh();
  }

  async globalLibInstantiate(entryId: string): Promise<void> {
    const entry = this.globalLibEntries.find((e: any) => e.id === entryId);
    if (!entry) return;
    const kind: string = entry.kind ?? '';
    let target: Record<string, any>;
    if (kind === 'anim-clip' || kind === 'pose') {
      const sk = this.host.rig.activeSkeleton;
      if (!sk) return;
      target = { skeletonId: sk.id };
    } else if (kind === 'preset' || kind === 'character') {
      target = {};
    } else {
      // material and other kinds need mesh context — not available in this panel
      return;
    }
    const newId = await this.sm?.assets?.instantiate(entryId, target);
    if (newId) this.host.refreshAll();
  }

  async globalLibRename(id: string): Promise<void> {
    const name = this.globalLibRenameValue.trim();
    if (!name) return;
    await this.sm?.assets?.rename(id, name);
    this.globalLibRenamingId = null;
    this.globalLibRenameValue = '';
    this.globalLibRefresh();
  }

  async globalLibRetag(id: string): Promise<void> {
    const tags = this.globalLibRetagValue.split(',').map((t: string) => t.trim()).filter(Boolean);
    await this.sm?.assets?.retag(id, tags);
    this.globalLibRetagId = null;
    this.globalLibRetagValue = '';
    this.globalLibRefresh();
  }

  async globalLibRemove(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    this.globalLibStopPreview(id);
    await this.sm?.assets?.remove(id);
    this.globalLibRefresh();
  }

  async globalLibExport(): Promise<void> {
    const bundle = await this.sm?.assets?.export({
      kind: this.globalLibKindFilter || undefined,
    });
    if (!bundle) return;
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'global-library.frogpack'; a.click();
    URL.revokeObjectURL(url);
  }

  globalLibImport(event: Event, merge: boolean): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const bundle = JSON.parse(reader.result as string);
      await this.sm?.assets?.import(bundle, { merge });
      await this.sm?.assets?.init();
      this.globalLibInitialized = true;
      this.globalLibRefresh();
    };
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = '';
  }

  globalLibStartPreview(entry: any): void {
    const id: string = entry.id;
    if (this.globalLibPreviewFrames[id]) {
      this._globalLibStartFrameTimer(id);
      return;
    }
    const kind: string = entry.kind ?? '';
    if (kind !== 'anim-clip' && kind !== 'pose') return;
    const sk = this.host.rig.activeSkeleton;
    if (!sk) return;
    let tempClipId: string | null = null;
    void this.sm?.assets?.instantiate(id, { skeletonId: sk.id }).then((clipId: string | null) => {
      tempClipId = clipId;
      if (!clipId) return null;
      return this.sm?.captureAnimationPreview3D(sk.id, clipId, { frames: 16, size: 128 });
    }).then((result: any) => {
      // Always remove the temp clip to avoid polluting the live skeleton
      if (tempClipId) this.sm?.removeLibraryEntry3D(tempClipId);
      if (!result?.frames?.length) return;
      this.globalLibPreviewFrames[id] = result.frames;
      this.globalLibPreviewFrame[id] = 0;
      this.host.cdr.markForCheck();
      this._globalLibStartFrameTimer(id);
    });
  }

  private _globalLibStartFrameTimer(id: string): void {
    if (this._globalLibPreviewTimers[id]) return;
    const frames = this.globalLibPreviewFrames[id];
    if (!frames?.length) return;
    // 12fps flip-book: outside the zone, refreshing only this panel (an in-zone timer re-checked the whole app 12×/s)
    this.zone.runOutsideAngular(() => {
      this._globalLibPreviewTimers[id] = setInterval(() => {
        this.globalLibPreviewFrame[id] = ((this.globalLibPreviewFrame[id] ?? 0) + 1) % frames.length;
        this.host.cdr.detectChanges();
      }, 1000 / 12);
    });
  }

  globalLibStopPreview(id: string): void {
    if (this._globalLibPreviewTimers[id]) {
      clearInterval(this._globalLibPreviewTimers[id]);
      delete this._globalLibPreviewTimers[id];
    }
  }

  globalLibKindLabel(kind: string): string {
    const map: Record<string, string> = {
      'anim-clip': '🎬', 'pose': '🧍', 'material': '🎨',
      'brush': '🖌', 'kitbash': '🧱', 'texture': '🖼',
    };
    return map[kind] ?? '📦';
  }
}
