import { Injectable, OnDestroy, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { SceneOutlinerService } from './scene-outliner.service';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state the ribbon tools use. */
export type RibbonHost = Pick<IllustrationComponent, 'shapeManager' |
  'canvasRef' | 'handleCanvasRef' | 'scene3dMarkDirty' | 'scene3dRefreshMeshes' | 'scene3dSelectMesh' 
>;

/**
 * Ribbon meshes: add, the path / width / segments / sides / UV settings of the selected ribbon, its control points,
 * path presets (spiral, circle, arc, wave, S-curve, zigzag), and the on-canvas control-point handles (draw loop
 * outside the zone + drag via the editor's canvas pointer handlers). Component-scoped (provided by
 * IllustrationComponent). Bodies moved verbatim from illustration.component (refactor-plan 2.9F).
 */
@Injectable()
export class RibbonService implements OnDestroy {
  private host!: RibbonHost;
  constructor(private editorState: EditorStateService, private ngZone: NgZone, private outliner: SceneOutlinerService) {}
  bind(host: RibbonHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    if (this._scene3dHandleRafId != null) cancelAnimationFrame(this._scene3dHandleRafId);
  }

  // Selected ribbon (synced by syncFromMesh)
  scene3dIsRibbon = false;
  scene3dRibbonWidth = 0.10;
  scene3dRibbonSegments = 16;
  scene3dRibbonPathMode: 'normal' | 'world-up' | 'camera-facing' = 'normal';
  scene3dRibbonDoubleSided: 'double' | 'front' | 'back' = 'double';
  scene3dRibbonShowHandles = true;
  scene3dRibbonFlipRearU = true;
  scene3dRibbonUvTileCount = 1;
  scene3dRibbonControlPoints: { x: number; y: number; z: number }[] = [
    { x: -1, y: 0, z: 0 }, { x: 0, y: 0.3, z: 0 }, { x: 1, y: 0, z: 0 }
  ];

  // Canvas overlay handle drag
  private _scene3dActiveDragIndex: number | null = null;
  private _scene3dHandleRafId: number | null = null;

  // Ribbon path presets
  scene3dPresetType: 'spiral' | 'circle' | 'arc' | 'wave' | 'scurve' | 'zigzag' = 'spiral';
  scene3dPresetDiameter = 0.5;
  scene3dPresetHeight = 0.75;
  scene3dPresetTurns = 4;
  scene3dPresetAngle = 180;
  scene3dPresetAmplitude = 0.5;
  scene3dPresetFrequency = 2;
  scene3dPresetReverse = false;

  scene3dAddRibbon(): void {
    const sm = this.shapeManager;
    const center: [number, number, number] = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const scale: number = sm.getIllustrationMeshDefaultScale3D() || 1;
    const [cx, cy, cz] = center;
    const ribbon = sm.addRibbon3D(
      cx, cy, cz,
      [
        { x: cx - scale,        y: cy,                z: cz },
        { x: cx - scale * 0.3,  y: cy + scale * 0.25, z: cz },
        { x: cx + scale * 0.3,  y: cy + scale * 0.25, z: cz },
        { x: cx + scale,        y: cy,                z: cz },
      ],
      scale * 0.3,
      16,
    );
    if (ribbon?.id) {
      this.host.scene3dRefreshMeshes();
      this.outliner.scene3dRefreshHierarchy();
      this.host.scene3dSelectMesh(ribbon.id);
    }
  }

  scene3dUpdateRibbonPath(): void {
    if (!this.editorState.scene3dSelectedMeshId) return;
    this.shapeManager.updateRibbonPath3D(
      this.editorState.scene3dSelectedMeshId, this.scene3dRibbonControlPoints.map(p => ({ ...p })));
  }

  scene3dUpdateRibbonWidth(): void {
    if (!this.editorState.scene3dSelectedMeshId) return;
    this.shapeManager.updateRibbonWidth3D(this.editorState.scene3dSelectedMeshId, this.scene3dRibbonWidth);
    this.host.scene3dMarkDirty();
  }

  scene3dSetRibbonControlPoint(index: number): void {
    if (!this.editorState.scene3dSelectedMeshId) return;
    const pt = this.scene3dRibbonControlPoints[index];
    if (!pt) return;
    this.shapeManager.setRibbonControlPoint3D(
      this.editorState.scene3dSelectedMeshId, index, pt.x, pt.y, pt.z);
    this.host.scene3dMarkDirty();
  }

  scene3dSetRibbonPathMode(mode: 'normal' | 'world-up' | 'camera-facing'): void {
    this.scene3dRibbonPathMode = mode;
    if (!this.editorState.scene3dSelectedMeshId) return;
    const result = this.shapeManager.setRibbonPathMode3D(this.editorState.scene3dSelectedMeshId, mode);
    if (result === false) console.warn('[3D] setRibbonPathMode3D returned false — meshId:', this.editorState.scene3dSelectedMeshId, 'mode:', mode);
    this.host.scene3dMarkDirty();
  }

  scene3dSetRibbonSegments(n: number): void {
    this.scene3dRibbonSegments = n;
    if (!this.editorState.scene3dSelectedMeshId) return;
    this.shapeManager.updateRibbonSegments3D(this.editorState.scene3dSelectedMeshId, n);
    this.host.scene3dMarkDirty();
  }

  scene3dSetRibbonDoubleSided(v: 'double' | 'front' | 'back'): void {
    this.scene3dRibbonDoubleSided = v;
    if (!this.editorState.scene3dSelectedMeshId) return;
    this.shapeManager.setRibbonDoubleSided3D(this.editorState.scene3dSelectedMeshId, v);
    this.host.scene3dMarkDirty();
  }

  scene3dSetRibbonShowHandles(show: boolean): void {
    this.scene3dRibbonShowHandles = show;
    if (!this.editorState.scene3dSelectedMeshId) return;
    this.shapeManager.setRibbonShowHandles3D(this.editorState.scene3dSelectedMeshId, show);
  }

  scene3dSetRibbonFlipRearU(v: boolean): void {
    this.scene3dRibbonFlipRearU = v;
    if (!this.editorState.scene3dSelectedMeshId) return;
    this.shapeManager.setRibbonFlipRearU3D(this.editorState.scene3dSelectedMeshId, v);
    this.host.scene3dMarkDirty();
  }

  scene3dSetRibbonUvTileCount(n: number): void {
    this.scene3dRibbonUvTileCount = n;
    if (!this.editorState.scene3dSelectedMeshId) return;
    this.shapeManager.setRibbonUvTileCount3D(this.editorState.scene3dSelectedMeshId, n);
    this.host.scene3dMarkDirty();
  }

  private _scene3dShowHandles(): void {
    if (!this.scene3dIsRibbon || !this.editorState.scene3dSelectedMeshId) return;
    this._scene3dStartHandleLoop();
  }

  hideHandles(): void {
    this.stopHandleLoop();
  }

  private _scene3dStartHandleLoop(): void {
    if (this._scene3dHandleRafId != null) return;
    const loop = () => {
      this._scene3dDrawHandles();
      if (this.scene3dIsRibbon && this.editorState.scene3dSelectedMeshId) {
        this._scene3dHandleRafId = requestAnimationFrame(loop);
      } else {
        this._scene3dHandleRafId = null;
      }
    };
    // Canvas drawing only — outside Angular, so a selected ribbon no longer runs change detection every frame
    this.ngZone.runOutsideAngular(() => { this._scene3dHandleRafId = requestAnimationFrame(loop); });
  }

  stopHandleLoop(): void {
    if (this._scene3dHandleRafId != null) {
      cancelAnimationFrame(this._scene3dHandleRafId);
      this._scene3dHandleRafId = null;
    }
    const hc = this.host.handleCanvasRef?.nativeElement;
    if (hc) hc.getContext('2d')?.clearRect(0, 0, hc.width, hc.height);
    this._scene3dActiveDragIndex = null;
  }

  private _scene3dDrawHandles(): void {
    const hc = this.host.handleCanvasRef?.nativeElement;
    const canvas = this.host.canvasRef?.nativeElement;
    if (!hc || !canvas || !this.editorState.scene3dSelectedMeshId) return;
    const cw = canvas.clientWidth || canvas.width;
    const ch = canvas.clientHeight || canvas.height;
    if (hc.width !== cw || hc.height !== ch) { hc.width = cw; hc.height = ch; }
    const ctx = hc.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    const sm = this.shapeManager;

    // Grid snap target dot (vertex snap viz is rendered engine-side by Salsa)
    const snapTarget = sm.getSnapTarget3D() as [number,number,number] | null;
    if (snapTarget) {
      const scr = sm.worldToScreen3D(snapTarget) as [number,number] | null;
      if (scr) {
        ctx.beginPath();
        ctx.arc(scr[0], scr[1], 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (sm.getRibbonData3D(this.editorState.scene3dSelectedMeshId)?.showHandles === false) return;
    const positions: { x: number; y: number; depth: number; index: number }[] =
      (sm.getRibbonHandleScreenPositions3D(this.editorState.scene3dSelectedMeshId, cw, ch) as any) ?? [];
    for (const pt of positions) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = this._scene3dActiveDragIndex === pt.index ? 'rgba(255,220,0,0.9)' : 'rgba(0,190,255,0.75)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pt.index), pt.x, pt.y);
    }
  }

  scene3dApplyPreset(): void {
    let pts = this._scene3dComputePreset();
    if (this.scene3dPresetReverse) pts = pts.reverse();
    this.scene3dRibbonControlPoints = pts;
    this.scene3dUpdateRibbonPath();
    this.host.scene3dMarkDirty();
  }

  private _scene3dComputePreset(): { x: number; y: number; z: number }[] {
    const r = this.scene3dPresetDiameter / 2;
    switch (this.scene3dPresetType) {
      case 'spiral': {
        const n = Math.max(4, Math.round(this.scene3dPresetTurns * 8));
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * this.scene3dPresetTurns * 2 * Math.PI;
          return { x: r * Math.cos(t), y: (i / n) * this.scene3dPresetHeight, z: r * Math.sin(t) };
        });
      }
      case 'circle': {
        const n = 12;
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * 2 * Math.PI;
          return { x: r * Math.cos(t), y: 0, z: r * Math.sin(t) };
        });
      }
      case 'arc': {
        const n = Math.max(4, Math.round(Math.abs(this.scene3dPresetAngle) / 15));
        const total = (this.scene3dPresetAngle * Math.PI) / 180;
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * total - total / 2;
          return { x: r * Math.cos(t), y: 0, z: r * Math.sin(t) };
        });
      }
      case 'wave': {
        const n = Math.max(4, this.scene3dPresetFrequency * 6);
        const w = this.scene3dPresetDiameter;
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = i / n;
          return { x: t * w - w / 2, y: Math.sin(t * this.scene3dPresetFrequency * 2 * Math.PI) * this.scene3dPresetAmplitude, z: 0 };
        });
      }
      case 'scurve': {
        const n = 8;
        const w = this.scene3dPresetDiameter;
        const a = this.scene3dPresetAmplitude;
        return Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * 4 - 2;
          return { x: (i / n) * w - w / 2, y: a * Math.tanh(t), z: 0 };
        });
      }
      case 'zigzag': {
        const n = Math.max(2, this.scene3dPresetFrequency * 2);
        const w = this.scene3dPresetDiameter;
        const a = this.scene3dPresetAmplitude;
        return Array.from({ length: n + 1 }, (_, i) => ({
          x: (i / n) * w - w / 2, y: (i % 2 === 0 ? -a : a), z: 0,
        }));
      }
      default:
        return [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
    }
  }

  scene3dAddRibbonControlPoint(): void {
    const last = this.scene3dRibbonControlPoints[this.scene3dRibbonControlPoints.length - 1];
    this.scene3dRibbonControlPoints = [
      ...this.scene3dRibbonControlPoints,
      { x: (last?.x ?? 0) + 0.5, y: last?.y ?? 0, z: last?.z ?? 0 },
    ];
    this.scene3dUpdateRibbonPath();
  }

  scene3dRemoveRibbonControlPoint(index: number): void {
    if (this.scene3dRibbonControlPoints.length <= 2) return;
    this.scene3dRibbonControlPoints = this.scene3dRibbonControlPoints.filter((_, i) => i !== index);
    this.scene3dUpdateRibbonPath();
  }

  /** Selection changed: clear the ribbon flags (reloaded by syncFromMesh when the new mesh is a ribbon). */
  resetForSelection(): void {
    this.scene3dIsRibbon = false;
    this.scene3dRibbonPathMode = 'normal';
    this.scene3dRibbonDoubleSided = 'double';
    this.scene3dRibbonFlipRearU = true;
    this.scene3dRibbonUvTileCount = 1;
  }

  /** Load ribbon state for a selected mesh and show its canvas handles. (A former mesh.type/controlPoints fallback
   *  was dead code — those fields never existed on Mesh3D.) */
  syncFromMesh(id: string): void {
    const ribbonData = this.shapeManager.getRibbonData3D(id) as any;
    this.scene3dIsRibbon = !!ribbonData;
    if (ribbonData) {
      this.scene3dRibbonWidth = ribbonData.width ?? 0.10;
      this.scene3dRibbonSegments = ribbonData.segments ?? 16;
      this.scene3dRibbonPathMode = ribbonData.pathMode ?? 'normal';
      const ds = ribbonData.doubleSided ?? 'double';
      this.scene3dRibbonDoubleSided = ds === true ? 'double' : ds === false ? 'front' : ds;
      this.scene3dRibbonShowHandles = ribbonData.showHandles !== false;
      this.scene3dRibbonFlipRearU = ribbonData.flipRearU ?? true;
      this.scene3dRibbonUvTileCount = ribbonData.uvTileCount ?? 1;
      this.scene3dRibbonControlPoints = (ribbonData.controlPoints ?? []).map(
        (p: any) => ({ x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 })
      );
      if (this.scene3dRibbonControlPoints.length < 2) {
        this.scene3dRibbonControlPoints = [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
      }
    }
    // Show renderer-side handles after ribbon state is loaded
    setTimeout(() => this._scene3dShowHandles(), 80);
  }

  /** Canvas pointerdown: grab the nearest ribbon handle under the cursor. True = grabbed (the caller stops). */
  tryBeginHandleDrag(event: PointerEvent, canvas: HTMLCanvasElement): boolean {
    if (!(this.scene3dIsRibbon && this.editorState.scene3dSelectedMeshId && this.scene3dRibbonShowHandles)) return false;
    const sm = this.shapeManager;
    const cw = canvas.clientWidth || canvas.width;
    const ch = canvas.clientHeight || canvas.height;
    const mx = event.offsetX;
    const my = event.offsetY;
    const positions: { x: number; y: number; depth: number; index: number }[] =
      (sm.getRibbonHandleScreenPositions3D(this.editorState.scene3dSelectedMeshId, cw, ch) as any) ?? [];
    let hit: { x: number; y: number; depth: number; index: number } | null = null;
    for (const pt of positions) {
      const dx = mx - pt.x, dy = my - pt.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 12 && (!hit || pt.depth < hit.depth)) hit = pt;
    }
    if (!hit) return false;
    event.stopPropagation();
    canvas.setPointerCapture(event.pointerId);
    this._scene3dActiveDragIndex = hit.index;
    sm.beginRibbonHandleDrag3D(this.editorState.scene3dSelectedMeshId, hit.index, cw, ch);
    return true;
  }

  /** Canvas pointermove during a handle drag: move it and mirror the control points into the panel. */
  moveHandleDrag(event: PointerEvent): void {
    if (this._scene3dActiveDragIndex === null || !this.editorState.scene3dSelectedMeshId) return;
    const canvas = this.host.canvasRef?.nativeElement;
    const cw = canvas ? (canvas.clientWidth || canvas.width) : 0;
    const ch = canvas ? (canvas.clientHeight || canvas.height) : 0;
    const sm = this.shapeManager;
    sm.moveRibbonHandle3D(this.editorState.scene3dSelectedMeshId, this._scene3dActiveDragIndex,
      event.offsetX, event.offsetY, cw, ch);
    const data = sm.getRibbonData3D(this.editorState.scene3dSelectedMeshId);
    if (data?.controlPoints) {
      this.scene3dRibbonControlPoints = data.controlPoints.map(
        (p: any) => ({ x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 })
      );
    }
  }

  endHandleDrag(): void {
    if (this._scene3dActiveDragIndex === null || !this.editorState.scene3dSelectedMeshId) return;
    this.shapeManager.endRibbonHandleDrag3D(this.editorState.scene3dSelectedMeshId, this._scene3dActiveDragIndex);
    this._scene3dActiveDragIndex = null;
    this.host.scene3dMarkDirty();
  }
}
