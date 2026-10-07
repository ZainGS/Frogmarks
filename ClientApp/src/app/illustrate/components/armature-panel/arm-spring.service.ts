import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { ArmatureHost } from './arm-session';

/** What ArmSpringService reads / writes on the panel. */
export type ArmSpringHost = Pick<ArmatureHost,
  'shapeManager' | 'rig'
>;

/**
 * Spring / jiggle chains: create / select / remove, enable, stiffness / drag / gravity / hit radius.
 * Panel-scoped (provided by both Armature hosts — the classic ArmaturePanelComponent and the mode chrome's
 * ArmatureModeComponent — and bound in their constructors). Bodies moved verbatim from
 * armature-panel.component (audit Phase 5.5).
 */
@Injectable()
export class ArmSpringService {
  private host!: ArmSpringHost;
  bind(host: ArmSpringHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }
  private get sm(): ShapeManager { return this.host.shapeManager; }

  springCollapsed = true;

  springChains: any[] = [];

  selectedSpringChainId: string | null = null;

  springStiffness = 0.5;

  springDrag = 0.3;

  springGravity = 0.005;

  springHitRadius = 0.05;

  _refreshSpringChains(): void {
    if (!this.host.rig.activeSkeleton) { this.springChains = []; return; }
    const raw: any[] = this.sm?.getSpringChains3D(this.host.rig.activeSkeleton.id) ?? [];
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
    return this.host.rig.joints[idx]?.name ?? `Joint ${idx}`;
  }

  selectSpringChain(chain: any): void {
    this.selectedSpringChainId = chain.id;
    this.springStiffness = chain.stiffness;
    this.springDrag = chain.drag;
    this.springGravity = chain.gravity;
    this.springHitRadius = chain.hitRadius;
  }

  createSpringChain(): void {
    if (!this.host.rig.activeSkeleton || this.host.rig.selectedJointIdx === null) return;
    const indices = this._getSpringChainIndices(this.host.rig.selectedJointIdx);
    this.sm?.createSpringChain3D(this.host.rig.activeSkeleton.id, indices, {
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
      const childIdx = this.host.rig.joints.findIndex((j, i) => i !== current && j.parentIdx === current);
      if (childIdx === -1) break;
      result.push(childIdx);
      current = childIdx;
    }
    return result;
  }

  removeSpringChain(chainId: string, event: Event): void {
    event.stopPropagation();
    if (!this.host.rig.activeSkeleton) return;
    this.sm?.removeSpringChain3D(this.host.rig.activeSkeleton.id, chainId);
    if (this.selectedSpringChainId === chainId) this.selectedSpringChainId = null;
    this._refreshSpringChains();
  }

  toggleSpringChainEnabled(chain: any, event: Event): void {
    event.stopPropagation();
    if (!this.host.rig.activeSkeleton) return;
    this.sm?.setSpringChainParams3D(this.host.rig.activeSkeleton.id, chain.id, { enabled: !chain.enabled });
    this._refreshSpringChains();
  }

  onSpringParamChanged(): void {
    if (!this.host.rig.activeSkeleton || !this.selectedSpringChainId) return;
    this.sm?.setSpringChainParams3D(this.host.rig.activeSkeleton.id, this.selectedSpringChainId, {
      stiffness: this.springStiffness,
      drag: this.springDrag,
      gravity: this.springGravity,
      hitRadius: this.springHitRadius,
    });
  }
}
