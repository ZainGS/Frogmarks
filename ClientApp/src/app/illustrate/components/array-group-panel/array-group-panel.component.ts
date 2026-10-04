import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/**
 * REPEAT inspector for an array group: mode, counts / spacing / axes, radial, object offset, merge-bake options,
 * per-instance overrides, bake. Extracted from illustration.component (refactor-plan 2.9A). Shown by the editor
 * only while an array group is selected (and not in mesh edit).
 */
@Component({
  selector: 'app-array-group-panel',
  templateUrl: './array-group-panel.component.html',
  styleUrls: ['./array-group-panel.component.scss'],
})
export class ArrayGroupPanelComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() groupId: string | null = null;
  @Input() scene3dGizmoOrientation: 'world' | 'local' = 'world';
  @Output() toggleGizmoOrientation = new EventEmitter<void>();
  /** "Edit Source" — mesh-edit mode belongs to the editor. */
  @Output() editSource = new EventEmitter<void>();
  /** The array was baked into plain meshes — the editor drops its array-group state. */
  @Output() baked = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['groupId'] && this.groupId) this._scene3dSyncArrayPanel(this.groupId);
  }

  /** Re-read the group from the engine (re-select, gizmo drags, undo). */
  sync(id: string | null = this.groupId): void {
    if (id) this._scene3dSyncArrayPanel(id);
  }

  scene3dArrayMode: 'linear' | 'grid' | 'radial' = 'linear';

  scene3dArrayCountX = 3;

  scene3dArraySpacingX = 2.0;

  scene3dArrayAxisX: 'x' | 'y' | 'z' = 'x';

  scene3dArrayCountY = 3;

  scene3dArraySpacingY = 2.0;

  scene3dArrayAxisY: 'x' | 'y' | 'z' = 'z';

  scene3dArrayRadialCount = 6;

  scene3dArrayRadius = 3.0;

  scene3dArrayArc = 360;

  scene3dArrayRadialAxis: 'x' | 'y' | 'z' = 'y';

  // Phase 5: per-instance overrides (array group panel)
  scene3dInstanceOverrides: Array<{index: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number; visible: boolean}> = [];

  scene3dOverridesPanelOpen = false;

  scene3dNewOverrideIdx = 0;

  // Object offset and merge-bake options (linear arrays only)
  scene3dArrayObjectOffsetId = '';

  scene3dArrayGapFill = false;

  scene3dArrayWeldThreshold = 0.001;

  private _scene3dGetActiveAxis(s: [number, number, number]): 'x' | 'y' | 'z' | null {
    if (Math.abs(s[1]) < 1e-4 && Math.abs(s[2]) < 1e-4) return 'x';
    if (Math.abs(s[0]) < 1e-4 && Math.abs(s[2]) < 1e-4) return 'y';
    if (Math.abs(s[0]) < 1e-4 && Math.abs(s[1]) < 1e-4) return 'z';
    return null;
  }

  _scene3dSyncArrayPanel(groupId: string): void {
    const sm = this.shapeManager;
    const params = sm.getArrayParams3D(groupId) as any;
    if (!params) return;
    this.scene3dArrayMode = params.mode ?? 'linear';
    if (params.mode === 'radial') {
      this.scene3dArrayRadialCount = params.count ?? 6;
      this.scene3dArrayRadius = params.radius ?? 3;
      this.scene3dArrayArc = params.arcDeg ?? 360;
      this.scene3dArrayRadialAxis = params.axis ?? 'y';
    } else if (params.mode === 'grid') {
      this.scene3dArrayCountX = params.countX ?? 3;
      this.scene3dArrayCountY = params.countY ?? 3;
      const sx: [number,number,number] = params.spacingX ?? [2, 0, 0];
      const sy: [number,number,number] = params.spacingY ?? [0, 0, 2];
      this.scene3dArraySpacingX = Math.sqrt(sx[0]**2 + sx[1]**2 + sx[2]**2);
      this.scene3dArraySpacingY = Math.sqrt(sy[0]**2 + sy[1]**2 + sy[2]**2);
      this.scene3dArrayAxisX = this._scene3dGetActiveAxis(sx) ?? 'x';
      this.scene3dArrayAxisY = this._scene3dGetActiveAxis(sy) ?? 'z';
    } else {
      this.scene3dArrayCountX = params.countX ?? 3;
      const s: [number,number,number] = params.spacing ?? [2, 0, 0];
      this.scene3dArraySpacingX = Math.sqrt(s[0]**2 + s[1]**2 + s[2]**2);
      this.scene3dArrayAxisX = this._scene3dGetActiveAxis(s) ?? 'x';
    }
    // Object offset and merge-bake options (linear mode only)
    this.scene3dArrayObjectOffsetId = params.objectOffsetId ?? '';
    this.scene3dArrayGapFill = params.gapFill ?? false;
    this.scene3dArrayWeldThreshold = params.weldThreshold ?? 0.001;
    // Phase 5: sync per-instance overrides
    const rawOverrides: Array<{index: number; override: any}> = sm.getInstanceOverrides3D(groupId) ?? [];
    this.scene3dInstanceOverrides = rawOverrides.map(e => {
      const sc: [number,number,number] = e.override.scale ?? [1, 1, 1];
      return {
        index: e.index,
        rotX: e.override.rotationEulerDeg?.[0] ?? 0,
        rotY: e.override.rotationEulerDeg?.[1] ?? 0,
        rotZ: e.override.rotationEulerDeg?.[2] ?? 0,
        scaleX: sc[0] ?? 1,
        scaleY: sc[1] ?? 1,
        scaleZ: sc[2] ?? 1,
        visible: e.override.visible ?? true,
      };
    });
  }

  scene3dUpdateArrayCountX(v: number): void {
    if (!this.groupId) return;
    this.scene3dArrayCountX = v;
    this.shapeManager.updateArrayParams3D(this.groupId, { countX: v } as any);
  }

  scene3dUpdateArrayCountY(v: number): void {
    if (!this.groupId) return;
    this.scene3dArrayCountY = v;
    this.shapeManager.updateArrayParams3D(this.groupId, { countY: v } as any);
  }

  scene3dUpdateArraySpacingX(mag: number): void {
    if (!this.groupId) return;
    this.scene3dArraySpacingX = mag;
    const sm = this.shapeManager;
    const params = sm.getArrayParams3D(this.groupId) as any;
    if (!params) return;
    const s: [number,number,number] = params.mode === 'grid' ? (params.spacingX ?? [2,0,0]) : (params.spacing ?? [2,0,0]);
    const oldMag = Math.sqrt(s[0]**2 + s[1]**2 + s[2]**2) || 1;
    const scale = mag / oldMag;
    const newS: [number,number,number] = [s[0]*scale, s[1]*scale, s[2]*scale];
    sm.updateArrayParams3D(this.groupId, (params.mode === 'grid' ? { spacingX: newS } : { spacing: newS }) as any);
  }

  scene3dUpdateArraySpacingY(mag: number): void {
    if (!this.groupId) return;
    this.scene3dArraySpacingY = mag;
    const sm = this.shapeManager;
    const params = sm.getArrayParams3D(this.groupId);
    if (!params || params.mode !== 'grid') return;
    const s: [number,number,number] = params.spacingY ?? [0, 0, 2];
    const oldMag = Math.sqrt(s[0]**2 + s[1]**2 + s[2]**2) || 1;
    const scale = mag / oldMag;
    sm.updateArrayParams3D(this.groupId, { spacingY: [s[0]*scale, s[1]*scale, s[2]*scale] as [number,number,number] } as any);
  }

  scene3dSetArrayAxisX(axis: 'x' | 'y' | 'z'): void {
    if (!this.groupId) return;
    this.scene3dArrayAxisX = axis;
    const mag = this.scene3dArraySpacingX || 2;
    const vec: [number,number,number] = axis === 'x' ? [mag,0,0] : axis === 'y' ? [0,mag,0] : [0,0,mag];
    const params = this.shapeManager.getArrayParams3D(this.groupId);
    this.shapeManager.updateArrayParams3D(this.groupId, (params?.mode === 'grid' ? { spacingX: vec } : { spacing: vec }) as any);
  }

  scene3dSetArrayAxisY(axis: 'x' | 'y' | 'z'): void {
    if (!this.groupId) return;
    this.scene3dArrayAxisY = axis;
    const mag = this.scene3dArraySpacingY || 2;
    const vec: [number,number,number] = axis === 'x' ? [mag,0,0] : axis === 'y' ? [0,mag,0] : [0,0,mag];
    this.shapeManager.updateArrayParams3D(this.groupId, { spacingY: vec } as any);
  }

  scene3dUpdateArrayRadialCount(v: number): void {
    if (!this.groupId) return;
    this.scene3dArrayRadialCount = v;
    this.shapeManager.updateArrayParams3D(this.groupId, { count: Math.max(1, v) } as any);
  }

  scene3dUpdateArrayRadius(v: number): void {
    if (!this.groupId) return;
    this.scene3dArrayRadius = v;
    this.shapeManager.updateArrayParams3D(this.groupId, { radius: Math.max(0.1, v) } as any);
  }

  scene3dUpdateArrayArc(v: number): void {
    if (!this.groupId) return;
    this.scene3dArrayArc = v;
    this.shapeManager.updateArrayParams3D(this.groupId, { arcDeg: Math.min(360, Math.max(1, v)) } as any);
  }

  scene3dSetArrayRadialAxis(axis: 'x' | 'y' | 'z'): void {
    if (!this.groupId) return;
    this.scene3dArrayRadialAxis = axis;
    this.shapeManager.updateArrayParams3D(this.groupId, { axis } as any);
  }

  scene3dSetArrayMode(mode: 'linear' | 'grid' | 'radial'): void {
    if (!this.groupId) return;
    this.scene3dArrayMode = mode;
    this.shapeManager.updateArrayParams3D(this.groupId, { mode } as any);
    this._scene3dSyncArrayPanel(this.groupId);
  }

  scene3dBakeArray(): void {
    if (!this.groupId) return;
    const confirmed = window.confirm(
      'Convert to independent meshes? The source and all instances will become separate, editable meshes in one group. Changes to one mesh will no longer affect the others. (Undo will restore the linked array.)'
    );
    if (!confirmed) return;
    this.shapeManager.bakeArray3D(this.groupId);
    this.baked.emit();
  }

  scene3dBakeArrayMerged(): void {
    if (!this.groupId || this.scene3dArrayMode !== 'linear') return;
    const confirmed = window.confirm(
      'Merge all copies into a single mesh with welded vertices? (Undo will restore the linked array.)'
    );
    if (!confirmed) return;
    this.shapeManager.bakeArrayMerged3D(this.groupId);
    this.baked.emit();
  }

  scene3dSetArrayGapFill(v: boolean): void {
    if (!this.groupId) return;
    this.scene3dArrayGapFill = v;
    this.shapeManager.updateArrayParams3D(this.groupId, { gapFill: v } as any);
  }

  scene3dSetArrayWeldThreshold(v: number): void {
    if (!this.groupId) return;
    this.scene3dArrayWeldThreshold = v;
    this.shapeManager.updateArrayParams3D(this.groupId, { weldThreshold: v } as any);
  }

  scene3dApplyInstanceOverride(idx: number): void {
    if (!this.groupId) return;
    const o = this.scene3dInstanceOverrides.find(x => x.index === idx);
    if (!o) return;
    this.shapeManager.setInstanceOverride3D(this.groupId, idx, {
      rotationEulerDeg: [o.rotX, o.rotY, o.rotZ] as [number, number, number],
      scale: [o.scaleX, o.scaleY, o.scaleZ] as [number, number, number],
      visible: o.visible,
    });
  }

  scene3dAddInstanceOverride(): void {
    if (!this.groupId) return;
    const idx = Math.max(0, Math.floor(this.scene3dNewOverrideIdx));
    if (this.scene3dInstanceOverrides.some(x => x.index === idx)) return;
    this.shapeManager.setInstanceOverride3D(this.groupId, idx, {
      visible: true,
      scale: [1, 1, 1] as [number, number, number],
      rotationEulerDeg: [0, 0, 0] as [number, number, number],
    });
    this._scene3dSyncArrayPanel(this.groupId);
  }

  scene3dSetObjectOffset(id: string): void {
    if (!this.groupId) return;
    this.scene3dArrayObjectOffsetId = id;
    this.shapeManager.updateArrayParams3D(this.groupId, { objectOffsetId: id || undefined } as any);
  }

  scene3dClearObjectOffset(): void {
    if (!this.groupId) return;
    this.scene3dArrayObjectOffsetId = '';
    this.shapeManager.updateArrayParams3D(this.groupId, { objectOffsetId: undefined } as any);
  }

  scene3dClearInstanceOverride(idx: number): void {
    if (!this.groupId) return;
    this.shapeManager.clearInstanceOverride3D(this.groupId, idx);
    this.scene3dInstanceOverrides = this.scene3dInstanceOverrides.filter(x => x.index !== idx);
  }
}
