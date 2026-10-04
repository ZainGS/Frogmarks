import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

/** Exactly the editor state the array (repeat) tool uses. */
export type ArrayToolHost = Pick<IllustrationComponent, 'shapeManager' |
  '_updateGizmoPosition' | 'scene3dGizmoMode'
>;

/**
 * Array tool (repeat by dragging): line / grid / radial, count, radius, arc, axis; the radial strip mirrors the engine
 * while dragging. Component-scoped (provided by IllustrationComponent). Bodies moved verbatim from
 * illustration.component (refactor-plan 2.9E).
 */
@Injectable()
export class ArrayToolService implements OnDestroy {
  private host!: ArrayToolHost;
  constructor() {}
  bind(host: ArrayToolHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
  }

  scene3dArrayToolActive = false;

  scene3dArrayToolMode: 'line' | 'grid' | 'radial' = 'line';

  scene3dArrayToolCount = 3;

  scene3dArrayToolRadius: number | null = null;

  scene3dArrayToolArc = 360;

  scene3dArrayToolAxis: 'x' | 'y' | 'z' = 'y';

  scene3dToggleArrayTool(): void {
    if (this.scene3dArrayToolActive) { this.scene3dDeactivateArrayTool(); return; }
    this.scene3dArrayToolActive = true;
    this.host.scene3dGizmoMode = null;
    const sm = this.shapeManager;
    sm.scene3d?.setGizmoMode(null);
    sm.setGizmoMode3D(null);
    sm.enableArrayTool(this.scene3dArrayToolMode, this.scene3dArrayToolCount);
    if (this.scene3dArrayToolMode === 'radial') this._scene3dSyncRadialToolStrip();
    this.host._updateGizmoPosition();
  }

  scene3dDeactivateArrayTool(): void {
    if (!this.scene3dArrayToolActive) return;
    this.scene3dArrayToolActive = false;
    this.shapeManager.disableArrayTool();
    this.host._updateGizmoPosition();
  }

  scene3dSetArrayToolMode(mode: 'line' | 'grid' | 'radial'): void {
    this.scene3dArrayToolMode = mode;
    if (this.scene3dArrayToolActive) {
      this.shapeManager.setArrayToolMode(mode);
      if (mode === 'radial') this._scene3dSyncRadialToolStrip();
    }
  }

  scene3dSetArrayToolCount(count: number): void {
    this.scene3dArrayToolCount = count;
    if (this.scene3dArrayToolActive) this.shapeManager.setArrayToolCount(count);
  }

  scene3dSetArrayToolRadius(r: number | null): void {
    this.scene3dArrayToolRadius = r;
    this.shapeManager.setArrayToolRadius(r);
  }

  scene3dSetArrayToolArc(deg: number): void {
    this.scene3dArrayToolArc = deg;
    this.shapeManager.setArrayToolArc(deg);
  }

  scene3dSetArrayToolAxis(axis: 'x' | 'y' | 'z'): void {
    this.scene3dArrayToolAxis = axis;
    this.shapeManager.setArrayToolAxis(axis);
  }

  _scene3dSyncRadialToolStrip(): void {
    const sm = this.shapeManager;
    this.scene3dArrayToolAxis   = sm.getArrayToolAxis()   ?? 'y';
    this.scene3dArrayToolRadius = sm.getArrayToolRadius() ?? null;
    this.scene3dArrayToolArc    = sm.getArrayToolArc()    ?? 360;
  }
}
