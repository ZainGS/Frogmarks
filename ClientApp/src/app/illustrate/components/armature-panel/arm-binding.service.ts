import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { ArmatureHost } from './arm-session';

/** What ArmBindingService reads / writes on the panel. */
export type ArmBindingHost = Pick<ArmatureHost,
  'shapeManager' | 'rig'
>;

/**
 * Mesh binding + weight paint: the bind target, bind / normalize, weight-paint mode and brush.
 * Panel-scoped (provided by both Armature hosts — the classic ArmaturePanelComponent and the mode chrome's
 * ArmatureModeComponent — and bound in their constructors). Bodies moved verbatim from
 * armature-panel.component (audit Phase 5.5).
 */
@Injectable()
export class ArmBindingService {
  private host!: ArmBindingHost;
  bind(host: ArmBindingHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }
  private get sm(): ShapeManager { return this.host.shapeManager; }

  bindCollapsed = false;

  weightPaintCollapsed = true;

  meshes: Array<{ id: string; name: string }> = [];

  bindMeshId = '';

  bindSkeletonId = '';

  bindResult = '';

  isBound = false;

  get isProceduralBody(): boolean {
    if (!this.host.rig.activeSkeleton) return false;
    return this.sm?.isProceduralBodySkeleton3D(this.host.rig.activeSkeleton.id) ?? false;
  }

  wpRadius = 0.15;

  wpStrength = 0.5;

  wpTargetWeight = 1.0;

  wpShowSkeleton = true;

  wpUnlit = false;

  wpActive = false;

  focusMesh(): void {
    this.sm?.fitArtboard();
  }

  refreshMeshes(): void {
    const raw: any[] = this.sm?.getAllMeshes3D() ?? [];
    this.meshes = raw.map((m: any) => ({ id: m.id, name: m.name ?? m.id }));
    if (!this.bindMeshId && this.meshes.length) this.bindMeshId = this.meshes[0].id;
  }

  get bindMeshName(): string {
    return this.meshes.find(m => m.id === this.bindMeshId)?.name ?? this.bindMeshId ?? '—';
  }

  get canBind(): boolean {
    return !!this.bindMeshId && !!this.host.rig.activeSkeleton && this.host.rig.joints.length > 0;
  }

  bindMesh(): void {
    if (!this.canBind || !this.host.rig.activeSkeleton) return;
    const ok = this.sm?.bindMeshToSkeleton3D(this.bindMeshId, this.host.rig.activeSkeleton.id);
    if (ok === false) {
      this.bindResult = 'Bind failed — add joints first';
      this.isBound = false;
    } else {
      this.bindResult = `Bound "${this.bindMeshName}" → "${this.host.rig.activeSkeleton.name}"`;
      this.isBound = true;
    }
  }

  enterWeightPaint(): void {
    if (!this.bindMeshId || !this.host.rig.activeSkeleton) return;
    const jointIdx = this.host.rig.selectedJointIdx ?? 0;
    this.sm?.setWeightPaintBrush(this.wpRadius, this.wpStrength, this.wpTargetWeight);
    this.sm?.enterWeightPaintMode3D(this.bindMeshId, this.host.rig.activeSkeleton.id, jointIdx);
    this.wpActive = true;
  }

  exitWeightPaint(): void {
    this.sm?.exitWeightPaintMode3D();
    this.wpActive = false;
  }

  onWpBrushChange(): void {
    if (this.wpActive) {
      this.sm?.setWeightPaintBrush(this.wpRadius, this.wpStrength, this.wpTargetWeight);
    }
  }

  /** The Weight Brush pill's mode, read from the target weight the engine brush has (setWeightPaintBrush): Add paints
   *  towards full weight, Remove towards none, Set towards the Weight value in between. */
  get wpMode(): 'add' | 'remove' | 'set' {
    return this.wpTargetWeight >= 1 ? 'add' : this.wpTargetWeight <= 0 ? 'remove' : 'set';
  }

  setWpMode(mode: 'add' | 'remove' | 'set'): void {
    if (mode === this.wpMode) return;
    this.wpTargetWeight = mode === 'add' ? 1 : mode === 'remove' ? 0 : 0.5;
    this.onWpBrushChange();
  }

  onWpShowSkeletonChange(): void {
    this.sm?.setWeightPaintShowSkeleton(this.wpShowSkeleton);
  }

  onWpUnlitChange(): void {
    this.sm?.setWeightPaintUnlit3D(this.wpUnlit);
  }

  normalizeWeights(): void {
    if (!this.bindMeshId) return;
    this.sm?.normalizeWeights3D(this.bindMeshId);
  }
}
