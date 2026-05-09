import {
  Component, Input, Output, EventEmitter,
  ViewChild, ElementRef, OnChanges, AfterViewInit, OnDestroy, NgZone, HostListener
} from '@angular/core';

export interface ClothStitch {
  a: number;
  b: number;
  restLength: number;
  side?: 'front' | 'back';
}

export interface ClothBuilderResult {
  grid: {
    cols: number; rows: number; cellSize: number; cornerRadius: number;
    activeCells: boolean[]; pinnedVertices: number[];
  };
  physics: {
    gravity: number; damping: number; stiffness: number; thickness: number;
    solidifyRounded: boolean; wind: { x: number; y: number; z: number };
  };
  simulatedPositions: Float32Array | null;
  simMode: 'none' | 'hang' | 'drape';
  existingMeshId: string | null;
  previewMeshId: string | null;
  stitches: ClothStitch[];
  bendStiffnessMap: Float32Array | null;
}

@Component({
  selector: 'app-cloth-builder',
  templateUrl: './cloth-builder.component.html',
  styleUrls: ['./cloth-builder.component.scss'],
})
export class ClothBuilderComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() visible = false;
  @Input() existingMeshId: string | null = null;
  @Input() initialGrid: any = null;
  @Input() initialPhysics: any = null;
  @Input() initialSimMode: 'none' | 'hang' | 'drape' = 'none';
  @Input() initialSimPositions: Float32Array | null = null;
  @Input() scene3dManager: any = null;
  @Input() shapeManager: any = null;
  @Input() dropPosition: [number, number, number] = [0, 0, 0];

  @Output() created = new EventEmitter<ClothBuilderResult>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() previewMeshReady = new EventEmitter<string>();

  @ViewChild('clothGridCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLCanvasElement>;

  // ── Grid state ─────────────────────────────────────────────
  cols = 8;
  rows = 10;
  cellSize = 0.1;
  cornerRadius = 0;
  subdivisions = 1;
  activeCells: boolean[] = [];
  pinnedVertices: number[] = [];

  // ── Physics ────────────────────────────────────────────────
  gravity = 9.8;
  damping = 0.98;
  stiffness = 30;
  thickness = 0;
  solidifyRounded = false;
  windX = 0; windY = 0; windZ = 0;

  // ── Sim state ──────────────────────────────────────────────
  liveSimMode: 'off' | 'hang' | 'drape' = 'off';
  drapeProxyType: 'none' | 'ground' | 'sphere' | 'box' = 'none';
  drapeGroundY = 0;
  drapeSphereCenter: [number,number,number] = [0, 0, 0];
  drapeSphereRadius = 0.5;
  drapeBoxMin: [number,number,number] = [-0.5, -0.5, -0.5];
  drapeBoxMax: [number,number,number] = [0.5, 0.5, 0.5];
  lastSimPositions: Float32Array | null = null;
  simError: string | null = null;
  previewMeshId: string | null = null;

  // ── Editor ─────────────────────────────────────────────────
  editorMode: 'draw' | 'pin' | 'stitch' | 'paint-stiffness' = 'draw';
  private _cellPx = 28;
  private _panX = 12;
  private _panY = 12;
  private _isPainting = false;
  private _paintValue = true;

  // ── Stitch state ───────────────────────────────────────────
  stitches: ClothStitch[] = [];
  stitchPendingA: number | null = null;
  stitchType: 'full' | 'gather50' | 'custom' = 'full';
  stitchSide: 'none' | 'front' | 'back' = 'none';
  stitchCustomLength = 0.1;
  selectedStitchIdx: number | null = null;
  private _pendingStitchVc = 0;
  private _pendingStitchVr = 0;
  private _pendingStitchDenseIdx = -1;

  // ── Bend stiffness state ───────────────────────────────────
  bendStiffnessMap: Float32Array | null = null;
  brushRadius = 2;
  brushValue = 1.0;
  brushBlendMode: 'set' | 'add' | 'subtract' = 'set';

  // ── Live handle + saved state for Cancel restore ────────────
  private _liveHandle: any = null;
  private _simGeneration = 0;
  private _disposePreview: (() => void) | null = null;
  private _previewRenderer: any = null;   // ClothPreviewRenderer returned by attachClothPreviewCanvas
  private _previewRafId: number | null = null; // rAF loop for Create-mode manual preview drive
  private _savedGrid: any = null;
  private _savedPhysics: any = null;
  private _savedPositions: Float32Array | null = null;
  private _savedSimMode: 'none' | 'hang' | 'drape' = 'none';
  private _physicsDebounce: any = null;
  private _gridDebounce: any = null;
  private _pendingResetTimer: any = null;

  // ── Stitch hover preview ───────────────────────────────────
  private _stitchHoverVc = -1;
  private _stitchHoverVr = -1;
  private _stitchHoverDebounce: any = null;

  // ── Validation ─────────────────────────────────────────────
  get thicknessDisabled(): boolean {
    return this.liveSimMode !== 'off';
  }

  get thicknessWarning(): boolean {
    if (this.thicknessDisabled) return false;
    const minDim = Math.min(this.cols, this.rows) * this.cellSize;
    return this.thickness > minDim * 0.03;
  }

  get validationError(): string | null {
    if (this.cols < 1 || this.cols > 200) return 'Columns must be 1–200';
    if (this.rows < 1 || this.rows > 200) return 'Rows must be 1–200';
    if (this.cellSize <= 0) return 'Cell size must be > 0';
    if (!this.activeCells.some(Boolean)) return 'At least one cell must be active';
    return null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible && this.editorMode === 'stitch' && this.stitchPendingA !== null) {
      this.cancelStitchTool();
    }
  }

  constructor(private ngZone: NgZone) {}

  ngOnDestroy(): void {
    this._destroyHandle();
  }

  ngAfterViewInit(): void {
    this._initState();
    this._redraw();
  }

  ngOnChanges(): void {
    if (this.visible) {
      this._destroyHandle();
      this._initState();
      setTimeout(() => this._redraw(), 0);
    } else {
      this._destroyHandle();
    }
  }

  private _destroyHandle(): void {
    if (this._previewRafId !== null) {
      cancelAnimationFrame(this._previewRafId);
      this._previewRafId = null;
    }
    this._disposePreview?.();
    this._disposePreview = null;
    this._previewRenderer = null;
    if (this._liveHandle) {
      this._liveHandle.destroy?.();
      this._liveHandle = null;
    }
    clearTimeout(this._physicsDebounce);
    clearTimeout(this._gridDebounce);
    clearTimeout(this._stitchHoverDebounce);
    clearTimeout(this._pendingResetTimer);
  }

  // All handle.reset() calls funnel here so they coalesce and are always deferred
  // to the next JS macrotask. mapAsync completions are microtasks, so by the time
  // the macrotask runs, all in-flight position readbacks have resolved and the GPU
  // buffers are no longer "pending map" — eliminating the submit-while-mapped race.
  private _scheduleReset(delay = 0, cfgOverride?: any): void {
    clearTimeout(this._pendingResetTimer);
    clearTimeout(this._gridDebounce);
    clearTimeout(this._stitchHoverDebounce);
    this._pendingResetTimer = setTimeout(() => {
      // Create mode: owned handle. Edit mode: fetch fresh — Salsa warns not to cache
      // across async gaps since setClothConfig can replace the handle internally.
      const handle = this._liveHandle ??
        (this.existingMeshId ? this.scene3dManager?.getLiveClothHandle?.(this.existingMeshId) : null);
      if (!handle) return;
      handle.reset?.(
        cfgOverride ?? this._buildGridConfig(),
        this._buildPhysicsConfig(),
        this.liveSimMode,
        this._buildDrapeProxy()
      );
    }, delay);
  }

  private _initState(): void {
    this.liveSimMode = 'off';
    this.simError = null;
    this.editorMode = 'draw';
    this.stitchPendingA = null;
    this.selectedStitchIdx = null;
    this.stitches = [];
    this.bendStiffnessMap = null;
    this._stitchHoverVc = -1;
    this._stitchHoverVr = -1;
    clearTimeout(this._stitchHoverDebounce);

    if (this.initialGrid) {
      this.cols = this.initialGrid.cols ?? 8;
      this.rows = this.initialGrid.rows ?? 10;
      this.cellSize = this.initialGrid.cellSize ?? 0.1;
      this.cornerRadius = this.initialGrid.cornerRadius ?? 0;
      this.subdivisions = this.initialGrid.subdivisions ?? 1;
      this.activeCells = this.initialGrid.activeCells?.length
        ? [...this.initialGrid.activeCells]
        : Array(this.cols * this.rows).fill(true);
      this.pinnedVertices = [...(this.initialGrid.pinnedVertices ?? [])];
    } else {
      this.cols = 8; this.rows = 10; this.cellSize = 0.1; this.cornerRadius = 0;
      this.subdivisions = 1;
      this.activeCells = Array(this.cols * this.rows).fill(true);
      this.pinnedVertices = [];
    }

    if (this.initialPhysics) {
      this.gravity = this.initialPhysics.gravity ?? 9.8;
      this.damping = this.initialPhysics.damping ?? 0.98;
      this.stiffness = this.initialPhysics.stiffness ?? 30;
      this.thickness = this.initialPhysics.thickness ?? 0;
      this.solidifyRounded = this.initialPhysics.solidifyRounded ?? false;
      this.windX = this.initialPhysics.wind?.x ?? 0;
      this.windY = this.initialPhysics.wind?.y ?? 0;
      this.windZ = this.initialPhysics.wind?.z ?? 0;
    } else {
      this.gravity = 9.8; this.damping = 0.98; this.stiffness = 30;
      this.thickness = 0; this.solidifyRounded = false;
      this.windX = 0; this.windY = 0; this.windZ = 0;
    }

    this.lastSimPositions = this.initialSimPositions;

    if (this.existingMeshId) {
      this.previewMeshId = this.existingMeshId;
      // Load stitches from existing mesh — Salsa returns dense indices; convert to slot for display
      try {
        const existing = this.scene3dManager?.getClothStitches?.(this.existingMeshId);
        if (Array.isArray(existing)) {
          const d2s = this._buildDenseToSlotMap();
          this.stitches = existing.map((s: any) => ({
            a: d2s.get(s.a) ?? s.a,
            b: d2s.get(s.b) ?? s.b,
            restLength: s.restLength ?? 0,
            side: s.side ?? undefined,
          }));
        }
      } catch { /* ignore */ }
      // Load bend stiffness map
      try {
        const bsMap = this.scene3dManager?.getClothBendStiffnessMap?.(this.existingMeshId);
        if (bsMap instanceof Float32Array && bsMap.length > 0) {
          this.bendStiffnessMap = new Float32Array(bsMap);
        }
      } catch { /* ignore */ }
      this._savedGrid = this.initialGrid
        ? { ...this.initialGrid, activeCells: [...(this.initialGrid.activeCells ?? [])], pinnedVertices: [...(this.initialGrid.pinnedVertices ?? [])] }
        : null;
      this._savedPhysics = this.initialPhysics ? { ...this.initialPhysics } : null;
      this._savedPositions = this.initialSimPositions;
      this._savedSimMode = this.initialSimMode !== 'none' ? this.initialSimMode : 'none';
    } else {
      this.previewMeshId = null;
      this._savedGrid = null;
      this._savedPhysics = null;
      this._savedPositions = null;
      this._savedSimMode = 'none';
    }
  }

  // ── Live simulation ─────────────────────────────────────────

  onSimModeChange(mode: 'off' | 'hang' | 'drape'): void {
    this.simError = null;

    // ── Edit mode: delegate to enableLiveCloth / disableLiveCloth on the scene mesh.
    // No standalone handle is created — Salsa owns the loop and the poseVertexBuf
    // override. Frogmarks fetches the handle via getLiveClothHandle only when needed
    // (snapshot on Apply). Physics and constraint changes go through the existing hot-update APIs.
    if (this.existingMeshId) {
      if (mode === 'off') {
        this._disposePreview?.();
        this._disposePreview = null;
        clearTimeout(this._pendingResetTimer);
        clearTimeout(this._stitchHoverDebounce);
        this.scene3dManager?.disableLiveCloth?.(this.existingMeshId, false);
        this.liveSimMode = 'off';
        return;
      }

      // Same mode already running: reset constraints to flat and re-simulate
      if (mode === this.liveSimMode) {
        this._scheduleReset();
        return;
      }

      // Mode change or first start
      this._disposePreview?.();
      this._disposePreview = null;
      clearTimeout(this._pendingResetTimer);
      clearTimeout(this._stitchHoverDebounce);
      this.liveSimMode = mode;

      this.ngZone.runOutsideAngular(() => {
        this.scene3dManager?.enableLiveCloth?.(this.existingMeshId);
      });

      this._attachPreviewCanvas(this.existingMeshId);
      return;
    }

    // ── Create mode: standalone LiveClothHandle via createLiveClothSim.
    // The handle owns its own RAF loop; Frogmarks receives position updates via
    // onPositionsUpdate and mirrors them into the preview scene mesh via updateClothMeshPose.

    if (mode === 'off') {
      this._destroyHandle();
      this.liveSimMode = 'off';
      return;
    }

    // Same mode and handle already running: just reset with the latest config.
    if (mode === this.liveSimMode && this._liveHandle) {
      this._scheduleReset();
      return;
    }

    this._destroyHandle();
    this.liveSimMode = mode;

    if (!this.previewMeshId) {
      try {
        const [px, py, pz] = this.dropPosition;
        const mesh = this.scene3dManager?.createClothMesh?.(px, py, pz, this._buildGridConfig(), this._buildPhysicsConfig());
        this.previewMeshId = mesh?.id ?? mesh?.nodeId ?? null;
      } catch (e) {
        console.warn('[Cloth] createClothMesh for preview failed', e);
      }
    }

    if (this.previewMeshId) {
      this.previewMeshReady.emit(this.previewMeshId);
    }

    if (typeof this.scene3dManager?.createLiveClothSim !== 'function') {
      console.warn('[Cloth] createLiveClothSim not found on scene3dManager', this.scene3dManager);
      this.simError = 'Live simulation not available — Salsa may need updating.';
      this.liveSimMode = 'off';
      return;
    }

    let handle: any;
    // Run outside Angular's zone so the per-frame onPositionsUpdate callback does not
    // trigger change detection on every animation frame.
    this.ngZone.runOutsideAngular(() => {
      try {
        handle = this.scene3dManager.createLiveClothSim(
          this._buildGridConfig(),
          this._buildPhysicsConfig(),
          mode,
          this._buildDrapeProxy()
        );
      } catch (e: any) {
        console.warn('[Cloth] createLiveClothSim threw', e);
        this.ngZone.run(() => {
          this.simError = `Live simulation error: ${e?.message ?? e}`;
          this.liveSimMode = 'off';
        });
        return;
      }

      if (!handle) {
        this.ngZone.run(() => {
          this.simError = 'WebGPU unavailable — try Chrome Canary with WebGPU enabled.';
          this.liveSimMode = 'off';
        });
        return;
      }

      const capturedMode = mode;
      const capturedGen = ++this._simGeneration;
      handle.onPositionsUpdate = (pos: Float32Array) => {
        if (capturedGen !== this._simGeneration) return;
        this.lastSimPositions = pos;
        // Fallback for old Salsa (no renderer object returned by attachClothPreviewCanvas):
        // upload CPU geometry so the preview canvas — which reads mesh.geometry — stays live.
        // When _previewRenderer is set, the poseVertexBuf override takes precedence and this
        // upload is redundant but harmless (main renderer ignores buf.vertex while override active).
        if (this.previewMeshId) {
          this.scene3dManager?.updateClothMeshPose?.(this.previewMeshId, pos, capturedMode);
        }
      };
    });

    if (!handle) return;
    this._liveHandle = handle;

    this._attachPreviewCanvas(this.previewMeshId);
  }

  private _attachPreviewCanvas(meshId: string | null): void {
    if (!meshId) return;
    this.ngZone.runOutsideAngular(() => setTimeout(() => {
      const canvasEl = this.previewCanvasRef?.nativeElement;
      if (!canvasEl) return;
      const attachHost = (typeof this.shapeManager?.attachClothPreviewCanvas === 'function')
        ? this.shapeManager
        : (typeof this.scene3dManager?.attachClothPreviewCanvas === 'function')
          ? this.scene3dManager
          : null;
      if (!attachHost) {
        console.warn('[ClothBuilder] attachClothPreviewCanvas not found');
        return;
      }
      const result = attachHost.attachClothPreviewCanvas(
        meshId, this.previewCanvasRef!.nativeElement, { bgColor: [0.05, 0.05, 0.08, 1], orbitEnabled: true }
      );
      // Detect renderer by presence of render() — bare dispose fn (old Salsa) won't have it.
      // Both cases store a dispose fn so _destroyHandle always cleans up correctly.
      const hasRender = typeof result?.render === 'function';
      if (hasRender) {
        this._previewRenderer = result;
        this._disposePreview = () => result?.dispose?.();
      } else {
        this._previewRenderer = null;
        this._disposePreview = typeof result === 'function' ? result : () => result?.dispose?.();
      }

      // Create mode: wire poseVertexBuf override so the renderer reads from the GPU buffer
      // instead of mesh.geometry. Edit mode: tickLiveCloths sets the override internally.
      if (!this.existingMeshId && this._liveHandle && this._previewRenderer) {
        const handle = this._liveHandle;
        const renderer = this._previewRenderer;
        if (handle.poseBuffer) {
          renderer.setVertexBufferOverride?.(meshId, handle.poseBuffer);
        }
        handle.onPoseBufferChange = (buf: any) => {
          renderer.setVertexBufferOverride?.(meshId, buf);
        };
      }

      // Always drive the render loop when the renderer supports it.
      // Orbit input accumulates between ticks; render() must fire every frame so
      // the camera matrix is recomputed and the canvas redraws immediately on drag.
      // tickLiveCloths handles position updates for Edit mode but is not a substitute
      // for a per-frame render loop when orbital input is involved.
      if (this._previewRenderer) {
        const renderer = this._previewRenderer;
        const capturedMeshId = meshId;
        const capturedGen = this._simGeneration;
        const tick = () => {
          if (this._simGeneration !== capturedGen) return;
          // Resolve mesh node each tick — scene3d uses getNode or getMesh depending on version
          const node = this.scene3dManager?.getNode?.(capturedMeshId) ??
                       this.scene3dManager?.getMesh?.(capturedMeshId) ??
                       capturedMeshId;
          renderer.render?.(node);
          this._previewRafId = requestAnimationFrame(tick);
        };
        this._previewRafId = requestAnimationFrame(tick);
      }
    }, 0));
  }

  resetToFlat(): void {
    if (this.liveSimMode === 'off') return;
    if (this.existingMeshId) {
      // Edit mode: setClothConfig triggers a flat reset + live sim restart in Salsa
      if (typeof this.shapeManager?.setClothConfig === 'function') {
        this.shapeManager.setClothConfig(this.existingMeshId, this._buildGridConfig());
      }
    } else {
      this._scheduleReset();
    }
  }

  // ── Canvas / grid change handlers ──────────────────────────

  onGridResize(): void {
    this.activeCells = Array(this.cols * this.rows).fill(true);
    this.pinnedVertices = [];
    this.stitches = [];
    this.stitchPendingA = null;
    this.bendStiffnessMap = null;
    this._onGridChanged();
  }

  onCornerRadiusChange(): void {
    this._onGridChanged();
  }

  onSubdivisionsChange(): void {
    this.subdivisions = Math.max(1, Math.min(4, Math.round(this.subdivisions)));
    // Dense indices change with subdivisions — clear anything that references them
    this.stitches = [];
    this.stitchPendingA = null;
    this.bendStiffnessMap = null;
    this._clearStitchHover();
    this._onGridChanged();
  }

  private _onGridChanged(rapid = false): void {
    this._redraw();
    if (!this.previewMeshId) return;
    clearTimeout(this._gridDebounce);
    const cfg = this._buildGridConfig();
    if (rapid) {
      // Batch rapid cell-paint moves; _scheduleReset coalesces any overlapping resets
      if (this._liveHandle) {
        this._scheduleReset(150);
      } else {
        this._gridDebounce = setTimeout(() => {
          if (typeof this.shapeManager?.setClothConfig === 'function') {
            this.shapeManager.setClothConfig(this.previewMeshId!, this._buildGridConfig());
          }
        }, 150);
      }
    } else if (this._liveHandle) {
      // Handle exists: route through _scheduleReset so it coalesces with any stitch-hover reset
      this._scheduleReset();
    } else if (typeof this.shapeManager?.setClothConfig === 'function') {
      // No handle yet (Edit mode before Hang, or Create mode): let Salsa rebuild the scene mesh
      this.shapeManager.setClothConfig(this.previewMeshId, cfg);
    }
  }

  private _onPinChanged(): void {
    this._redraw();
    if (!this.previewMeshId) return;
    // setClothPinnedVertices hot-swaps the inverseMass GPU buffer without rebuilding geometry.
    // Safe to call at any time — no liveSimMode guard needed.
    if (typeof this.shapeManager?.setClothPinnedVertices === 'function') {
      this.shapeManager.setClothPinnedVertices(this.previewMeshId, [...this.pinnedVertices]);
    } else {
      this._onGridChanged();
    }
  }

  // ── Physics change handler ──────────────────────────────────

  onPhysicsChange(): void {
    if (this.previewMeshId && this.liveSimMode !== 'off') {
      clearTimeout(this._physicsDebounce);
      // Prefer new instant API — hot-updates GPU uniforms without geometry rebuild
      if (typeof this.shapeManager?.setClothPhysics === 'function') {
        this.shapeManager.setClothPhysics(this.previewMeshId, this._buildPhysicsConfig());
      } else {
        this._physicsDebounce = setTimeout(() => {
          const handle = this._liveHandle ??
            (this.existingMeshId ? this.scene3dManager?.getLiveClothHandle?.(this.existingMeshId) : null);
          handle?.setPhysics?.({
            gravity: this.gravity,
            damping: this.damping,
            stiffness: this.stiffness,
            wind: { x: this.windX, y: this.windY, z: this.windZ },
          });
        }, 100);
      }
    }
  }

  // ── Vertex helpers ─────────────────────────────────────────

  // A vertex is locally active if at least one of its four adjacent cells is active.
  // This is a fast local check that correctly reflects pencil-tool changes without
  // waiting for Salsa to finish a debounced rebuild.
  private _isVertexActive(vc: number, vr: number): boolean {
    const check = (c: number, r: number) =>
      c >= 0 && c < this.cols && r >= 0 && r < this.rows && this.activeCells[r * this.cols + c];
    return check(vc - 1, vr - 1) || check(vc, vr - 1) || check(vc - 1, vr) || check(vc, vr);
  }

  // ── Stitch helpers ─────────────────────────────────────────

  // Slot index: stable grid position row*(cols+1)+col, used for pinnedVertices.
  // Returns -1 if the slot is inactive (cell-removed or corner cutout).
  private _resolveSlotIndex(col: number, row: number): number {
    // Fast local check first: vertex needs at least one adjacent active cell
    if (!this._isVertexActive(col, row)) return -1;
    const slotIdx = row * (this.cols + 1) + col;
    // Secondary Salsa check catches corner-radius cutouts that activeCells doesn't track
    if (this.previewMeshId && typeof this.shapeManager?.getClothVertexSlot === 'function') {
      const slot = this.shapeManager.getClothVertexSlot(this.previewMeshId, col, row);
      if (slot === null || slot === undefined || slot === -1) return -1;
    }
    return slotIdx;
  }

  // Dense index: compact GPU index after cutouts, used for stitches and bend stiffness.
  // Returns -1 if the slot is inactive.
  private _resolveDenseIndex(col: number, row: number): number {
    if (this.previewMeshId && typeof this.shapeManager?.getClothVertexDenseIndex === 'function') {
      const di = this.shapeManager.getClothVertexDenseIndex(this.previewMeshId, col, row);
      return (di === null || di === undefined) ? -1 : di;
    }
    // Fallback: deprecated alias still works
    if (this.previewMeshId && typeof this.shapeManager?.getClothVertexIndex === 'function') {
      const di = this.shapeManager.getClothVertexIndex(this.previewMeshId, col, row);
      return (di === null || di === undefined) ? -1 : di;
    }
    return row * (this.cols + 1) + col;
  }

  // Slot → dense (for Salsa API calls)
  private _slotToDense(slot: number): number {
    const vc = slot % (this.cols + 1);
    const vr = Math.floor(slot / (this.cols + 1));
    return this._resolveDenseIndex(vc, vr);
  }

  // Dense → slot map (for converting getClothStitches results back to slot coords)
  private _buildDenseToSlotMap(): Map<number, number> {
    const map = new Map<number, number>();
    for (let vr = 0; vr <= this.rows; vr++) {
      for (let vc = 0; vc <= this.cols; vc++) {
        if (!this._isVertexActive(vc, vr)) continue;
        const di = this._resolveDenseIndex(vc, vr);
        if (di >= 0) map.set(di, vr * (this.cols + 1) + vc);
      }
    }
    return map;
  }

  private _vertexCanvasPos(idx: number): { x: number; y: number } {
    const vc = idx % (this.cols + 1);
    const vr = Math.floor(idx / (this.cols + 1));
    return { x: this._panX + vc * this._cellPx, y: this._panY + vr * this._cellPx };
  }

  private _naturalVertexDist(a: number, b: number): number {
    return this._naturalVertexDistFromGrid(
      a % (this.cols + 1), Math.floor(a / (this.cols + 1)),
      b % (this.cols + 1), Math.floor(b / (this.cols + 1)),
    );
  }

  private _naturalVertexDistFromGrid(acol: number, arow: number, bcol: number, brow: number): number {
    const dx = (bcol - acol) * this.cellSize;
    const dy = (brow - arow) * this.cellSize;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private _computeStitchRestLength(a: number, b: number): number {
    switch (this.stitchType) {
      case 'full':     return 0;
      case 'gather50': return this._naturalVertexDist(a, b) * 0.5;
      case 'custom':   return this.stitchCustomLength;
    }
  }

  addStitchFromPending(b: number): void {
    const a = this.stitchPendingA!;
    if (a === b) { this.stitchPendingA = null; this._clearStitchHover(); this._redraw(); return; }
    const dup = this.stitches.some(s => (s.a === a && s.b === b) || (s.a === b && s.b === a));
    if (!dup) {
      const stitch: ClothStitch = { a, b, restLength: this._computeStitchRestLength(a, b) };
      if (this.stitchSide !== 'none') stitch.side = this.stitchSide;
      this.stitches.push(stitch);
    }
    this.stitchPendingA = null;
    this._clearStitchHover();
    this._redraw();
  }

  deleteStitch(idx: number): void {
    if (this.previewMeshId) {
      this.scene3dManager?.removeClothStitch?.(this.previewMeshId, idx);
    }
    this.stitches.splice(idx, 1);
    if (this.selectedStitchIdx === idx) this.selectedStitchIdx = null;
    else if (this.selectedStitchIdx !== null && this.selectedStitchIdx > idx) this.selectedStitchIdx--;
    this._redraw();
  }

  clearStitches(): void {
    if (this.previewMeshId) {
      this.scene3dManager?.clearClothStitches?.(this.previewMeshId);
    }
    this.stitches = [];
    this.stitchPendingA = null;
    this.selectedStitchIdx = null;
    this._redraw();
  }

  stitchVertexLabel(idx: number): string {
    const vc = idx % (this.cols + 1);
    const vr = Math.floor(idx / (this.cols + 1));
    return `(${vc},${vr})`;
  }

  // ── Bend stiffness helpers ─────────────────────────────────

  private _ensureBendMap(): void {
    const vertCount = (this.cols + 1) * (this.rows + 1);
    if (!this.bendStiffnessMap || this.bendStiffnessMap.length !== vertCount) {
      const fresh = new Float32Array(vertCount);
      if (this.bendStiffnessMap) {
        fresh.set(this.bendStiffnessMap.subarray(0, Math.min(fresh.length, this.bendStiffnessMap.length)));
      }
      this.bendStiffnessMap = fresh;
    }
  }

  setBendStiffnessPreset(value: number): void {
    const vertCount = (this.cols + 1) * (this.rows + 1);
    this.bendStiffnessMap = new Float32Array(vertCount).fill(value);
    this._redraw();
  }

  clearBendStiffnessMap(): void {
    this.bendStiffnessMap = null;
    this._redraw();
  }

  private _paintBendStiffness(cx: number, cy: number): void {
    this._ensureBendMap();
    const cp = this._cellPx;
    const radiusPx = this.brushRadius * cp;

    for (let vr = 0; vr <= this.rows; vr++) {
      for (let vc = 0; vc <= this.cols; vc++) {
        const vx = this._panX + vc * cp;
        const vy = this._panY + vr * cp;
        const dist = Math.sqrt((vx - cx) * (vx - cx) + (vy - cy) * (vy - cy));
        if (dist <= radiusPx) {
          const vidx = vr * (this.cols + 1) + vc;
          const current = this.bendStiffnessMap![vidx];
          const falloff = 1 - dist / radiusPx;
          let newVal: number;
          switch (this.brushBlendMode) {
            case 'set':      newVal = this.brushValue; break;
            case 'add':      newVal = current + this.brushValue * falloff * 0.1; break;
            case 'subtract': newVal = current - falloff * 0.1; break;
            default:         newVal = this.brushValue;
          }
          this.bendStiffnessMap![vidx] = Math.max(0, Math.min(1, newVal));
        }
      }
    }
    this._redraw();
  }

  // ── Canvas drawing ─────────────────────────────────────────

  private _redraw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cp = this._cellPx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this._panX + c * cp;
        const y = this._panY + r * cp;
        const active = this.activeCells[r * this.cols + c];
        ctx.fillStyle = active ? '#8ab4f8' : '#2a2a2a';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, cp, cp);
        ctx.strokeRect(x, y, cp, cp);
      }
    }

    // Bend stiffness color overlay (yellow–red heat map)
    if (this.bendStiffnessMap) {
      for (let vr = 0; vr <= this.rows; vr++) {
        for (let vc = 0; vc <= this.cols; vc++) {
          const val = this.bendStiffnessMap[vr * (this.cols + 1) + vc] ?? 0;
          if (val > 0.01) {
            const vx = this._panX + vc * cp;
            const vy = this._panY + vr * cp;
            const g = Math.round(200 * (1 - val));
            ctx.fillStyle = `rgba(255,${g},0,${0.25 + val * 0.5})`;
            ctx.fillRect(vx - cp * 0.5, vy - cp * 0.5, cp, cp);
          }
        }
      }
    }

    // Stitch lines
    ctx.setLineDash([4, 3]);
    for (let si = 0; si < this.stitches.length; si++) {
      const s = this.stitches[si];
      const pa = this._vertexCanvasPos(s.a);
      const pb = this._vertexCanvasPos(s.b);
      const isSelected = si === this.selectedStitchIdx;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = isSelected ? '#e040fb' : '#ce93d8';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Stitch hover preview line (A → hovered candidate)
    if (this.stitchPendingA !== null && this._stitchHoverVc >= 0) {
      const pa = this._vertexCanvasPos(this.stitchPendingA);
      const hoverSlot = this._stitchHoverVr * (this.cols + 1) + this._stitchHoverVc;
      const pb = this._vertexCanvasPos(hoverSlot);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = '#e040fb';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Pending stitch highlight
    if (this.stitchPendingA !== null) {
      const pa = this._vertexCanvasPos(this.stitchPendingA);
      ctx.beginPath();
      ctx.arc(pa.x, pa.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#e040fb';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Vertices — only draw vertices that have at least one adjacent active cell
    for (let vr = 0; vr <= this.rows; vr++) {
      for (let vc = 0; vc <= this.cols; vc++) {
        if (!this._isVertexActive(vc, vr)) continue;
        const vx = this._panX + vc * cp;
        const vy = this._panY + vr * cp;
        const idx = vr * (this.cols + 1) + vc;
        const isPinned = this.pinnedVertices.includes(idx);
        const isPendingA = idx === this.stitchPendingA;
        ctx.beginPath();
        ctx.arc(vx, vy, isPendingA ? 5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isPendingA ? '#e040fb' : isPinned ? '#4fc3f7' : '#666';
        ctx.fill();
      }
    }
  }

  // ── Canvas interaction ─────────────────────────────────────

  onCanvasMouseDown(e: MouseEvent): void {
    this._isPainting = true;
    this._handleCanvasInput(e);
  }

  onCanvasMouseMove(e: MouseEvent): void {
    // Stitch hover preview fires even without a mouse button held
    if (this.editorMode === 'stitch' && this.stitchPendingA !== null) {
      this._handleStitchHover(e);
      return;
    }
    if (!this._isPainting) return;
    this._handleCanvasInput(e);
  }

  onCanvasMouseUp(): void { this._isPainting = false; }

  cancelStitchTool(): void {
    this.stitchPendingA = null;
    this._clearStitchHover();
    this._redraw();
    // Remove the preview stitch from the running sim by resetting without a cfgOverride;
    // _scheduleReset reads committed stitches from the mesh node (the preview was never addClothStitch'd)
    if (this.liveSimMode !== 'off') this._scheduleReset();
  }

  private _clearStitchHover(): void {
    this._stitchHoverVc = -1;
    this._stitchHoverVr = -1;
    clearTimeout(this._stitchHoverDebounce);
  }

  private _handleStitchHover(e: MouseEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const cp = this._cellPx;
    let bestVc = -1, bestVr = -1, bestDist = Infinity;
    for (let vr = 0; vr <= this.rows; vr++) {
      for (let vc = 0; vc <= this.cols; vc++) {
        if (!this._isVertexActive(vc, vr)) continue;
        const vx = this._panX + vc * cp;
        const vy = this._panY + vr * cp;
        const d = Math.sqrt((cx - vx) * (cx - vx) + (cy - vy) * (cy - vy));
        if (d < bestDist) { bestDist = d; bestVc = vc; bestVr = vr; }
      }
    }

    if (bestVc < 0 || bestDist > cp * 0.7) {
      if (this._stitchHoverVc >= 0) { this._clearStitchHover(); this._redraw(); }
      return;
    }

    // Only act when the hover vertex actually changes — avoids per-pixel sim resets
    if (bestVc === this._stitchHoverVc && bestVr === this._stitchHoverVr) return;
    this._stitchHoverVc = bestVc;
    this._stitchHoverVr = bestVr;
    this._redraw(); // canvas preview line updates immediately

    if (this.liveSimMode === 'off') return;

    // Debounce the sim reset so rapid vertex transitions don't stack resets
    clearTimeout(this._stitchHoverDebounce);
    const snapVc = bestVc, snapVr = bestVr;
    this._stitchHoverDebounce = setTimeout(() => {
      if (this.stitchPendingA === null || this.liveSimMode === 'off') return;
      const bDenseIdx = this._resolveDenseIndex(snapVc, snapVr);
      if (bDenseIdx < 0) return;
      const restLen = this.stitchType === 'custom' ? this.stitchCustomLength
        : this.stitchType === 'gather50'
          ? this._naturalVertexDistFromGrid(this._pendingStitchVc, this._pendingStitchVr, snapVc, snapVr) * 0.5
          : 0;
      const side = this.stitchSide !== 'none' ? this.stitchSide : undefined;
      // this.stitches stores slot indices for display; Salsa needs dense indices
      const stitchesDense = this.stitches.map(s => ({
        a: this._slotToDense(s.a), b: this._slotToDense(s.b),
        restLength: s.restLength, ...(s.side ? { side: s.side } : {}),
      }));
      const previewStitch: any = { a: this._pendingStitchDenseIdx, b: bDenseIdx, restLength: restLen };
      if (side) previewStitch.side = side;
      const tempGridConfig = {
        ...this._buildGridConfig(),
        stitches: [...stitchesDense, previewStitch],
      };
      // Route through _scheduleReset so this coalesces with any concurrent reset
      // (e.g. the user clicks Hang within the same 60 ms window)
      this._scheduleReset(0, tempGridConfig);
    }, 60);
  }

  private _handleCanvasInput(e: MouseEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const cp = this._cellPx;

    if (this.editorMode === 'draw') {
      const col = Math.floor((cx - this._panX) / cp);
      const row = Math.floor((cy - this._panY) / cp);
      if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
        const idx = row * this.cols + col;
        if (this._isPainting && e.type === 'mousedown') {
          this._paintValue = !this.activeCells[idx];
        }
        this.activeCells[idx] = this._paintValue;
        this._onGridChanged(true); // rapid — batches via setClothConfigDebounced
      }
    } else if (this.editorMode === 'pin') {
      if (e.type !== 'mousedown') return;
      // Snap to the nearest *active* vertex so clicks in removed-cell areas don't silently miss
      let bestVc = -1, bestVr = -1, bestDist = Infinity;
      for (let vr = 0; vr <= this.rows; vr++) {
        for (let vc = 0; vc <= this.cols; vc++) {
          if (!this._isVertexActive(vc, vr)) continue;
          const vx = this._panX + vc * cp;
          const vy = this._panY + vr * cp;
          const d = Math.sqrt((cx - vx) * (cx - vx) + (cy - vy) * (cy - vy));
          if (d < bestDist) { bestDist = d; bestVc = vc; bestVr = vr; }
        }
      }
      if (bestVc < 0 || bestDist > cp * 0.7) return; // no active vertex nearby
      const idx = this._resolveSlotIndex(bestVc, bestVr);
      if (idx < 0) return; // corner-radius cutout (Salsa secondary check)
      const pi = this.pinnedVertices.indexOf(idx);
      if (pi >= 0) this.pinnedVertices.splice(pi, 1);
      else this.pinnedVertices.push(idx);
      this._onPinChanged();
    } else if (this.editorMode === 'stitch') {
      if (e.type !== 'mousedown') return;
      let bestVc = -1, bestVr = -1, bestDist = Infinity;
      for (let vr = 0; vr <= this.rows; vr++) {
        for (let vc = 0; vc <= this.cols; vc++) {
          if (!this._isVertexActive(vc, vr)) continue;
          const vx = this._panX + vc * cp;
          const vy = this._panY + vr * cp;
          const d = Math.sqrt((cx - vx) * (cx - vx) + (cy - vy) * (cy - vy));
          if (d < bestDist) { bestDist = d; bestVc = vc; bestVr = vr; }
        }
      }
      if (bestVc < 0 || bestDist > cp * 0.7) return;
      const bestDense = this._resolveDenseIndex(bestVc, bestVr);
      if (bestDense < 0) return; // inactive slot
      const bestSlot = bestVr * (this.cols + 1) + bestVc;

      if (this.stitchPendingA === null) {
        // Phase 1: record vertex A — slot for display, dense for Salsa calls
        this.stitchPendingA = bestSlot;
        this._pendingStitchDenseIdx = bestDense;
        this._pendingStitchVc = bestVc;
        this._pendingStitchVr = bestVr;
        this._redraw();
      } else {
        // Phase 3: commit via addClothStitch (direct API, no internal reset) then schedule one clean reset
        const viASlot = this.stitchPendingA;
        const viADense = this._pendingStitchDenseIdx;
        const restLen = this.stitchType === 'gather50'
          ? this._naturalVertexDistFromGrid(this._pendingStitchVc, this._pendingStitchVr, bestVc, bestVr) * 0.5
          : this.stitchType === 'custom' ? this.stitchCustomLength : 0;
        const side = this.stitchSide !== 'none' ? this.stitchSide : undefined;

        if (viADense === bestDense) { this.stitchPendingA = null; this._clearStitchHover(); this._redraw(); return; }
        const dup = this.stitches.some(s => (s.a === viASlot && s.b === bestSlot) || (s.a === bestSlot && s.b === viASlot));

        if (!dup && this.previewMeshId) {
          this.scene3dManager?.addClothStitch?.(this.previewMeshId, viADense, bestDense, restLen, side);
        }

        // Sync stitch list from Salsa — Salsa returns dense indices, convert to slot for display
        const synced = this.previewMeshId ? this.scene3dManager?.getClothStitches?.(this.previewMeshId) : null;
        if (Array.isArray(synced)) {
          const d2s = this._buildDenseToSlotMap();
          this.stitches = synced.map((s: any) => ({
            a: d2s.get(s.a) ?? s.a,
            b: d2s.get(s.b) ?? s.b,
            restLength: s.restLength ?? 0,
            side: s.side ?? undefined,
          }));
        } else if (!dup) {
          const stitch: ClothStitch = { a: viASlot, b: bestSlot, restLength: restLen };
          if (side) stitch.side = side;
          this.stitches.push(stitch);
        }

        this.stitchPendingA = null;
        this._pendingStitchDenseIdx = -1;
        this._clearStitchHover();
        this._redraw();
        // Let _scheduleReset read the updated committed stitches from the mesh node
        if (this.liveSimMode !== 'off') this._scheduleReset();
      }
    } else if (this.editorMode === 'paint-stiffness') {
      this._paintBendStiffness(cx, cy);
    }
  }

  // ── Create / Cancel ────────────────────────────────────────

  async onCreate(): Promise<void> {
    const err = this.validationError;
    if (err) { this.simError = err; return; }

    let positions = this.lastSimPositions;
    if (this.liveSimMode !== 'off') {
      // Edit mode: fetch handle fresh (setClothConfig may have replaced it internally).
      // Create mode: use the owned handle directly.
      const handle = this._liveHandle ??
        (this.existingMeshId ? this.scene3dManager?.getLiveClothHandle?.(this.existingMeshId) : null);
      try {
        positions = await handle?.snapshot?.() ?? positions;
      } catch { /* use last known positions */ }
    }

    this._destroyHandle();

    // this.stitches stores slot indices for display; emit dense indices for consumers (Salsa APIs)
    const stitchesForEmit = this.stitches.map(s => ({
      ...s,
      a: this._slotToDense(s.a),
      b: this._slotToDense(s.b),
    }));

    this.created.emit({
      grid: this._buildGridConfig(),
      physics: this._buildPhysicsConfig(),
      simulatedPositions: positions,
      simMode: this.liveSimMode !== 'off' ? this.liveSimMode : 'none',
      existingMeshId: this.existingMeshId,
      previewMeshId: this.previewMeshId,
      stitches: stitchesForEmit,
      bendStiffnessMap: this.bendStiffnessMap ? new Float32Array(this.bendStiffnessMap) : null,
    });
  }

  onCancel(): void {
    this._destroyHandle();

    if (this.existingMeshId && this._savedGrid) {
      try {
        this.scene3dManager?.replaceClothMesh?.(
          this.existingMeshId,
          this._savedGrid,
          this._savedPhysics ?? {},
          this._savedPositions ?? undefined,
          this._savedSimMode,
        );
      } catch { /* best-effort restore */ }
    } else if (this.previewMeshId && !this.existingMeshId) {
      this.scene3dManager?.removeNode?.(this.previewMeshId);
    }

    this.cancelled.emit();
  }

  private _buildDrapeProxy(): any {
    switch (this.drapeProxyType) {
      case 'ground': return { type: 'ground', y: this.drapeGroundY };
      case 'sphere': return { type: 'sphere', center: [...this.drapeSphereCenter], radius: this.drapeSphereRadius };
      case 'box':    return { type: 'box', min: [...this.drapeBoxMin], max: [...this.drapeBoxMax] };
      default:       return { type: 'none' };
    }
  }

  private _buildGridConfig() {
    return {
      cols: this.cols,
      rows: this.rows,
      cellSize: this.cellSize,
      cornerRadius: this.cornerRadius,
      subdivisions: this.subdivisions,
      activeCells: [...this.activeCells],
      pinnedVertices: [...this.pinnedVertices],
    };
  }

  private _buildPhysicsConfig() {
    return {
      gravity: this.gravity,
      damping: this.damping,
      stiffness: this.stiffness,
      thickness: this.thickness,
      solidifyRounded: this.solidifyRounded,
      wind: { x: this.windX, y: this.windY, z: this.windZ },
    };
  }
}
