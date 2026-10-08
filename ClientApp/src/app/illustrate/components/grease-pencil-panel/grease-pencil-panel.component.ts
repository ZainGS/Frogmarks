import { Component, inject, Input, NgZone, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FrameCoalescer } from '../../../shared/utilities/frame-coalescer';
import ShapeManager from '@zaings/salsa/shape-manager';

interface GpObject { id: string; name: string; skeletonId?: string; }
interface GpLayer  { id: string; name: string; visible: boolean; opacity: number; }
interface GpDrawPlane { meshId: string; triangleIndex: number; offset: number; }

/**
 * Grease Pencil: draw strokes in 3D (salsa docs/reviews/grease-pencil-2026-10-09.md).
 * Placement: SURFACE (default) — the pencil is out as soon as the panel opens and every point lands on the selected
 * mesh under the pen (no face tap); FLAT SHEET — the panel opens in face-select → tap a mesh face → Draw turns on by
 * itself and strokes go on the sheet in front of that face; ✕ on the plane picks another face. A GP object is created
 * when there is none. Draw with pen / finger / mouse; two fingers still navigate. Eraser: Partial (default) / Whole stroke.
 */
@Component({
  selector: 'app-grease-pencil-panel',
  templateUrl: './grease-pencil-panel.component.html',
  styleUrls:  ['./grease-pencil-panel.component.scss'],
})
export class GreasePencilPanelComponent implements OnChanges, OnDestroy {
  private ngZone = inject(NgZone);
  @Input() shapeManager: ShapeManager = null;
  @Output() closeRequest       = new EventEmitter<void>();

  private get sm(): ShapeManager { return this.shapeManager; }
  private _sub: { unsubscribe(): void } | null = null;
  private _drawPlanePollId: any = null;
  private _activeModeKey: string | null = null;
  /** The engine the listeners / poll are bound to (ngOnChanges runs before the first ngOnInit too: binding twice
   *  leaked a subscription and a 250 ms poll that outlived the panel). */
  private _boundTo: ShapeManager | null = null;

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
  /** Where strokes go: onto the mesh surface, or on the flat sheet in front of a tapped face. */
  placement: 'surface' | 'sheet' = 'surface';
  /** Surface placement: how far points are lifted off the surface (world units). */
  surfaceOffset       = 0.01;

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
  /** Partial: erase only what is under the eraser (strokes split). Whole stroke: remove every stroke it touches. */
  eraseMode: 'partial' | 'stroke' = 'partial';

  // ── Keyframes ────────────────────────────────────────────────────
  gpFrame = 0;

  // ── Render order ─────────────────────────────────────────────────
  renderOrder = 0;

  // ── Collapsed sections ───────────────────────────────────────────
  objectsCollapsed  = false;
  layersCollapsed   = false;
  settingsCollapsed = false;
  keyframeCollapsed = false;

  get canDraw(): boolean { return this.placement === 'surface' || this.gpDrawPlane !== null; }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['shapeManager'] || this.shapeManager === this._boundTo) return;
    this._unbind();
    if (!this.shapeManager) return;
    this._boundTo = this.shapeManager;
    this._subscribe();
    this.refreshAll();
    // The keyframe field starts at the animation timeline's frame (the frame the viewport shows)
    const f = (this.sm as unknown as { getCurrentFrame?(): number }).getCurrentFrame?.();
    if (typeof f === 'number' && Number.isFinite(f)) this.gpFrame = f;
    this.refreshDrawPlane();
    if (!this.isDrawActive) {
      if (this.placement === 'surface') this.setTool(this.gpTool);   // Surface: no face to tap, the pencil is out at once
      else this.sm?.enterGpFaceSelectMode3D();
    }
    this._startDrawPlanePoll();
  }

  ngOnDestroy(): void {
    const sm = this._boundTo;
    this._unbind();
    sm?.exitGpDrawMode3D();
    sm?.exitGpFaceSelectMode3D();
    sm?.clearGpDrawPlane3D();
  }

  private _unbind(): void {
    this._unsubscribe();
    this._stopDrawPlanePoll();
    this._boundTo = null;
  }

  private _subscribe(): void {
    const obs = this.shapeManager?.interactionService?.onSceneGraphChanged;
    if (obs) {
      // Fires per stroke from the engine's zoneless listeners: one zone entry per frame (at once when in the zone)
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
    this._stopDrawPlanePoll();
    this.ngZone.runOutsideAngular(() => {
      this._drawPlanePollId = setInterval(() => this.pollDrawPlane(), 250);
    });
  }

  /** One poll tick (public for tests): re-read the engine's drawing plane when it changed. */
  pollDrawPlane(): void {
    const plane: GpDrawPlane | null = this.sm?.getGpDrawPlane3D() ?? null;
    const changed = !!plane !== !!this.gpDrawPlane || (plane && this.gpDrawPlane
      && (plane.offset !== this.gpDrawPlane.offset || JSON.stringify(plane) !== JSON.stringify(this.gpDrawPlane)));
    if (changed) this.ngZone.run(() => this.refreshDrawPlane());
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
    const picked = !!plane && !this.gpDrawPlane;
    this.gpDrawPlane = plane;
    if (plane) this.planeOffset = plane.offset;
    // A face was just tapped: the pencil is ready at once (the Draw button used to stay off until pressed, and drawing
    // needed a GP object made by hand first). Erase stays the tool if it was picked.
    if (picked && !this.isDrawActive && this.placement === 'sheet') this.setTool(this.gpTool);
  }

  /** Placement: Surface | Flat sheet. Surface draws on the mesh at once; Flat sheet needs a tapped face first. */
  setPlacement(p: 'surface' | 'sheet'): void {
    if (p === this.placement) return;
    this.placement = p;
    this._sendSettings({ placement: p });
    if (p === 'surface') {
      this.sm?.exitGpFaceSelectMode3D();
      if (!this.isDrawActive) this.setTool(this.gpTool);
    } else if (!this.gpDrawPlane) {
      // No face picked yet: the pencil goes back to face-select until one is tapped.
      if (this.isDrawActive) this._exitDrawIfActive();
      else this.sm?.enterGpFaceSelectMode3D();
    }
  }

  /** Eraser: Partial | Whole stroke (the pen's eraser end uses it too). */
  setEraseMode(m: 'partial' | 'stroke'): void {
    if (m === this.eraseMode) return;
    this.eraseMode = m;
    this._sendSettings({ eraseMode: m });
  }

  /** Settings the engine build may not type yet (placement / eraseMode / surfaceOffset arrive with the Salsa rebuild;
   *  an older engine ignores unknown keys). */
  private _sendSettings(opts: object): void {
    this.sm?.setGpDrawSettings3D(opts);
  }

  onSurfaceOffsetChange(): void {
    this._sendSettings({ surfaceOffset: this.surfaceOffset });
  }

  /** ✕ on the plane: pick another face (the pencil goes back to face-select until one is tapped). */
  clearDrawPlane(): void {
    this._exitDrawIfActive();
    this.sm?.clearGpDrawPlane3D();
    this.gpDrawPlane = null;
    this.sm?.enterGpFaceSelectMode3D();
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
        this._exitDrawIfActive();
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
      this._exitDrawIfActive();
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
    const wasDrawing = this.isDrawActive;
    this._exitDrawIfActive();
    const id = this.sm?.createGpObject3D(this.newGpName.trim(), skelId);
    this.newGpName = 'GP Object';
    if (id) { this.activeGpId = id; this.activeLayerId = null; }
    this.refreshAll();
    if (wasDrawing) this._enterDrawMode();
  }

  selectGpObject(id: string): void {
    if (id === this.activeGpId) return;
    const wasDrawing = this.isDrawActive;
    this._exitDrawIfActive();
    this.activeGpId = id;
    this.activeLayerId = null;
    this._refreshLayers();
    if (wasDrawing) this._enterDrawMode();   // the pencil stays out, now on this object
  }

  removeGpObject(id: string, event: Event): void {
    event.stopPropagation();
    if (this.activeGpId === id) this._exitDrawIfActive();
    this.sm?.removeGpObject3D(id);
    if (this.activeGpId === id) {
      this.activeGpId = null;
      this.gpLayers = [];
      this.activeLayerId = null;
    }
    this.refreshAll();
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
    const id = this.sm?.addGpLayer3D(this.activeGpId, this.newLayerName.trim());
    this.newLayerName = 'Layer';
    this._refreshLayers();
    if (id) this.selectLayer(id);           // draw on the new layer
  }

  selectLayer(id: string): void {
    if (id === this.activeLayerId) return;
    const wasDrawing = this.isDrawActive;
    this._exitDrawIfActive();
    this.activeLayerId = id;
    if (wasDrawing) this._enterDrawMode();   // the pencil stays out, now on this layer
  }

  removeLayer(id: string, event: Event): void {
    event.stopPropagation();
    if (!this.activeGpId) return;
    if (this.activeLayerId === id) this._exitDrawIfActive();
    this.sm?.removeGpLayer3D(this.activeGpId, id);
    if (this.activeLayerId === id) this.activeLayerId = null;
    this._refreshLayers();
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
    if (!this.canDraw) return;
    this._ensureTarget();
    this._enterDrawMode();
  }

  /** The first draw needs a GP object + layer: make one ("GP Object", with "Layer 1") instead of a disabled-looking
   *  panel that only worked after "+ New" (the hidden prerequisite behind "Grease Pencil never worked"). */
  private _ensureTarget(): void {
    if (!this.activeGpId) {
      const id = this.sm?.createGpObject3D('GP Object');
      if (!id) return;
      this.activeGpId = id;
      this.activeLayerId = null;
      this.refreshAll();
    }
    if (!this.activeLayerId) this._refreshLayers();
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
    if (this.placement === 'sheet') this.sm?.enterGpFaceSelectMode3D();
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
      // Only a FILLED stroke carries a fill colour: "Closed" alone used to fill too (the colour was always sent)
      fillColor:     this.filled ? this._hexToRgba(this.fillColorHex, this.fillOpacity) : null,
      closed:        this.closed || this.filled,
      parentJoint:   this.parentJoint || null,
      eraseRadius:   this.eraserRadius,
      placement:     this.placement,
      surfaceOffset: this.surfaceOffset,
      eraseMode:     this.eraseMode,
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
