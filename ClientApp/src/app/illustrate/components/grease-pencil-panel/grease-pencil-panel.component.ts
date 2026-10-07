import { Component, inject, Input, NgZone, Output, EventEmitter, OnInit, OnChanges, OnDestroy } from '@angular/core';
import { FrameCoalescer } from '../../../shared/utilities/frame-coalescer';
import { Subscription } from 'rxjs';
import ShapeManager from '@zaings/salsa/shape-manager';

interface GpObject { id: string; name: string; skeletonId?: string; }
interface GpLayer  { id: string; name: string; visible: boolean; opacity: number; }
interface GpDrawPlane { meshId: string; triangleIndex: number; offset: number; }

@Component({
  selector: 'app-grease-pencil-panel',
  templateUrl: './grease-pencil-panel.component.html',
  styleUrls:  ['./grease-pencil-panel.component.scss'],
})
export class GreasePencilPanelComponent implements OnInit, OnChanges, OnDestroy {
  private ngZone = inject(NgZone);
  @Input() shapeManager: ShapeManager = null;
  @Output() closeRequest       = new EventEmitter<void>();

  private get sm(): ShapeManager { return this.shapeManager; }
  private _sub: { unsubscribe(): void } | null = null;
  private _drawPlanePollId: any = null;
  private _activeModeKey: string | null = null;

  // ── GP objects ───────────────────────────────────────────────────
  gpObjects:    GpObject[] = [];
  activeGpId:   string | null = null;
  newGpName   = 'GP Object';
  renamingGpId: string | null = null;
  renameGpValue = '';

  // ── Skeletons (for pairing) ──────────────────────────────────────
  skeletonList: { id: string; name: string }[] = [];
  newGpSkeletonId = '';

  // ── Layers ───────────────────────────────────────────────────────
  gpLayers:        GpLayer[] = [];
  activeLayerId:   string | null = null;
  newLayerName   = 'Layer';
  renamingLayerId: string | null = null;
  renameLayerValue = '';
  jointList:       { name: string }[] = [];

  // ── Drawing plane ─────────────────────────────────────────────────
  gpDrawPlane:          GpDrawPlane | null = null;
  planeOffset         = 0.003;
  drawingPlaneCollapsed = false;

  // ── Stroke settings ──────────────────────────────────────────────
  gpTool:        'draw' | 'erase' = 'draw';
  isDrawActive   = false;
  strokeColorHex = '#000000';
  strokeOpacity  = 1.0;
  strokeWidth    = 0.02;
  filled         = false;
  fillColorHex   = '#ffffff';
  fillOpacity    = 0.8;
  parentJoint    = '';
  closed         = false;
  eraserRadius   = 0.1;

  // ── Keyframes ────────────────────────────────────────────────────
  gpFrame = 0;

  // ── Render order ─────────────────────────────────────────────────
  renderOrder = 0;

  // ── Collapsed sections ───────────────────────────────────────────
  objectsCollapsed  = false;
  layersCollapsed   = false;
  settingsCollapsed = false;
  keyframeCollapsed = false;

  get canDraw(): boolean { return this.gpDrawPlane !== null; }

  ngOnInit(): void {
    if (this.shapeManager) {
      this._subscribe();
      this.refreshAll();
      this.sm?.enterGpFaceSelectMode3D();
      this._startDrawPlanePoll();
    }
  }

  ngOnChanges(): void {
    if (this.shapeManager) {
      this._unsubscribe();
      this._stopDrawPlanePoll();
      this._subscribe();
      this.refreshAll();
      this.sm?.enterGpFaceSelectMode3D();
      this._startDrawPlanePoll();
    }
  }

  ngOnDestroy(): void {
    this._unsubscribe();
    this._stopDrawPlanePoll();
    this.sm?.exitGpDrawMode3D();
    this.sm?.exitGpFaceSelectMode3D();
    this.sm?.clearGpDrawPlane3D();
  }

  private _subscribe(): void {
    const obs = this.shapeManager?.interactionService?.onSceneGraphChanged;
    if (obs) {
      // Fires per stroke move from the engine's zoneless listeners: one zone entry per frame (at once when in the zone)
      this._sub = obs.subscribe(() => {
        if (NgZone.isInAngularZone()) this.refreshAll();
        else this._sceneFrame.mark('scene');
      });
    }
  }
  private readonly _sceneFrame = new FrameCoalescer(() => this.ngZone.run(() => this.refreshAll()));

  private _unsubscribe(): void { this._sub?.unsubscribe(); this._sub = null; this._sceneFrame.cancel(); }

  private _startDrawPlanePoll(): void {
    // Polled outside Angular's zone (audit Phase 5.4: an in-zone 250 ms interval re-checked the whole editor 4× a
    // second); change detection runs only when the draw plane actually changed.
    this.ngZone.runOutsideAngular(() => {
      this._drawPlanePollId = setInterval(() => {
        const plane: GpDrawPlane | null = this.sm?.getGpDrawPlane3D() ?? null;
        const changed = !!plane !== !!this.gpDrawPlane || (plane && this.gpDrawPlane
          && (plane.offset !== this.gpDrawPlane.offset || JSON.stringify(plane) !== JSON.stringify(this.gpDrawPlane)));
        if (changed) this.ngZone.run(() => this.refreshDrawPlane());
      }, 250);
    });
  }

  private _stopDrawPlanePoll(): void {
    if (this._drawPlanePollId != null) {
      clearInterval(this._drawPlanePollId);
      this._drawPlanePollId = null;
    }
  }

  refreshAll(): void {
    this._refreshSkeletons();
    this._refreshGpObjects();
  }

  refreshDrawPlane(): void {
    const plane: GpDrawPlane | null = this.sm?.getGpDrawPlane3D() ?? null;
    this.gpDrawPlane = plane;
    if (plane) this.planeOffset = plane.offset;
  }

  clearDrawPlane(): void {
    this.sm?.clearGpDrawPlane3D();
    this.gpDrawPlane = null;
    // After clearing, re-enter face-select so user can pick a new face
    if (!this.isDrawActive) {
      this.sm?.enterGpFaceSelectMode3D();
    }
  }

  onPlaneOffsetChange(): void {
    this.sm?.setGpDrawPlaneOffset3D(this.planeOffset);
  }

  private _refreshSkeletons(): void {
    this.skeletonList = this.sm?.getAllSkeletons3D() ?? [];
  }

  private _refreshGpObjects(): void {
    const raw: any[] = this.sm?.getAllGpObjects3D() ?? [];
    this.gpObjects = raw.map((g: any) => ({ id: g.id, name: g.name, skeletonId: g.skeletonId }));

    if (this.activeGpId) {
      if (!this.gpObjects.find(g => g.id === this.activeGpId)) {
        this.activeGpId = this.gpObjects[0]?.id ?? null;
      }
    } else if (this.gpObjects.length > 0) {
      this.activeGpId = this.gpObjects[0].id;
    }

    this._refreshLayers();
  }

  private _refreshLayers(): void {
    if (!this.activeGpId) { this.gpLayers = []; this.activeLayerId = null; return; }
    const raw: any[] = this.sm?.getGpLayers3D(this.activeGpId) ?? [];
    this.gpLayers = raw.map((l: any) => ({
      id: l.id, name: l.name,
      visible: l.visible ?? true,
      opacity: l.opacity ?? 1,
    }));
    if (this.activeLayerId && !this.gpLayers.find(l => l.id === this.activeLayerId)) {
      this.activeLayerId = null;
    }
    if (!this.activeLayerId && this.gpLayers.length > 0) {
      this.activeLayerId = this.gpLayers[0].id;
    }
    this._refreshJoints();
  }

  private _refreshJoints(): void {
    const activeGp = this.gpObjects.find(g => g.id === this.activeGpId);
    if (activeGp?.skeletonId) {
      const raw: any[] = this.sm?.getSkeletonJoints3D(activeGp.skeletonId) ?? [];
      this.jointList = raw.map((j: any) => ({ name: j.name ?? '' }));
    } else {
      this.jointList = [];
    }
  }

  // ── GP object ops ─────────────────────────────────────────────────

  createGpObject(): void {
    if (!this.newGpName.trim()) return;
    const skelId = this.newGpSkeletonId || undefined;
    this.sm?.createGpObject3D(this.newGpName.trim(), skelId);
    this.newGpName = 'GP Object';
  }

  selectGpObject(id: string): void {
    this._exitDrawIfActive();
    this.activeGpId = id;
    this.activeLayerId = null;
    this._refreshLayers();
  }

  removeGpObject(id: string, event: Event): void {
    event.stopPropagation();
    this.sm?.removeGpObject3D(id);
    if (this.activeGpId === id) {
      this._exitDrawIfActive();
      this.activeGpId = null;
      this.gpLayers = [];
      this.activeLayerId = null;
    }
  }

  startRenameGp(id: string, current: string, event: Event): void {
    event.stopPropagation();
    this.renamingGpId = id;
    this.renameGpValue = current;
  }

  confirmRenameGp(): void {
    if (!this.renamingGpId) return;
    this.sm?.renameGpObject3D(this.renamingGpId, this.renameGpValue);
    this.renamingGpId = null;
  }

  cancelRenameGp(): void { this.renamingGpId = null; }

  setRenderOrder(): void {
    if (!this.activeGpId) return;
    this.sm?.setGpRenderOrder3D(this.activeGpId, this.renderOrder);
  }

  // ── Layer ops ─────────────────────────────────────────────────────

  addLayer(): void {
    if (!this.activeGpId || !this.newLayerName.trim()) return;
    this.sm?.addGpLayer3D(this.activeGpId, this.newLayerName.trim());
    this.newLayerName = 'Layer';
  }

  selectLayer(id: string): void {
    this._exitDrawIfActive();
    this.activeLayerId = id;
  }

  removeLayer(id: string, event: Event): void {
    event.stopPropagation();
    if (!this.activeGpId) return;
    this.sm?.removeGpLayer3D(this.activeGpId, id);
    if (this.activeLayerId === id) {
      this._exitDrawIfActive();
      this.activeLayerId = null;
    }
  }

  toggleLayerVisible(layer: GpLayer, event: Event): void {
    event.stopPropagation();
    if (!this.activeGpId) return;
    const next = !layer.visible;
    this.sm?.setGpLayerVisible3D(this.activeGpId, layer.id, next);
    layer.visible = next;
  }

  onLayerOpacityChange(layer: GpLayer): void {
    if (!this.activeGpId) return;
    this.sm?.setGpLayerOpacity3D(this.activeGpId, layer.id, layer.opacity);
  }

  startRenameLayer(id: string, current: string, event: Event): void {
    event.stopPropagation();
    this.renamingLayerId = id;
    this.renameLayerValue = current;
  }

  confirmRenameLayer(): void {
    if (!this.renamingLayerId || !this.activeGpId) return;
    this.sm?.renameGpLayer3D(this.activeGpId, this.renamingLayerId, this.renameLayerValue);
    this.renamingLayerId = null;
  }

  cancelRenameLayer(): void { this.renamingLayerId = null; }

  // ── Keyframe ops ──────────────────────────────────────────────────

  setKeyframe(): void {
    if (!this.activeGpId || !this.activeLayerId) return;
    this.sm?.setGpKeyframe3D(this.activeGpId, this.activeLayerId, this.gpFrame);
  }

  clearKeyframe(): void {
    if (!this.activeGpId || !this.activeLayerId) return;
    this.sm?.clearGpKeyframe3D(this.activeGpId, this.activeLayerId, this.gpFrame);
  }

  // ── Draw mode lifecycle ───────────────────────────────────────────

  setTool(tool: 'draw' | 'erase'): void {
    if (this.isDrawActive && this.gpTool === tool) {
      // Toggle off — exit draw, return to face-select
      this._exitDrawIfActive();
      return;
    }
    this.gpTool = tool;
    if (this.canDraw && this.activeGpId && this.activeLayerId) {
      this._enterDrawMode();
    }
  }

  private _enterDrawMode(): void {
    if (!this.activeGpId || !this.activeLayerId || !this.canDraw) return;
    const modeKey = `${this.activeGpId}/${this.activeLayerId}/${this.gpTool}`;
    const opts = this._buildGpOpts();
    if (this.isDrawActive && modeKey !== this._activeModeKey) {
      this.sm?.exitGpDrawMode3D();
    }
    if (!this.isDrawActive || modeKey !== this._activeModeKey) {
      this.sm?.exitGpFaceSelectMode3D();
      this.sm?.enterGpDrawMode3D(this.activeGpId, this.activeLayerId, opts);
      this._activeModeKey = modeKey;
      this.isDrawActive = true;
    } else {
      this.sm?.setGpDrawSettings3D(opts);
    }
  }

  private _exitDrawIfActive(): void {
    if (!this.isDrawActive) return;
    this.sm?.exitGpDrawMode3D();
    this.sm?.enterGpFaceSelectMode3D();
    this.isDrawActive = false;
    this._activeModeKey = null;
  }

  onStrokeSettingChange(): void {
    if (this.isDrawActive) {
      this.sm?.setGpDrawSettings3D(this._buildGpOpts());
    }
  }

  private _buildGpOpts(): object {
    return {
      mode:          this.gpTool,
      depthMode:     'surface' as const,
      color:         this._hexToRgba(this.strokeColorHex, this.strokeOpacity),
      baseWidth:     this.strokeWidth,
      fillColor:     this._hexToRgba(this.fillColorHex, this.fillOpacity),
      closed:        this.closed || this.filled,
      parentJoint:   this.parentJoint || undefined,
      eraseRadius:   this.eraserRadius,
    };
  }

  private _hexToRgba(hex: string, a: number): { r: number; g: number; b: number; a: number } {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
  }

  close(): void { this.closeRequest.emit(); }

  trackById(_: number, item: { id: string }): string { return item.id; }
  trackByName(_: number, item: { name: string }): string { return item.name; }
}
