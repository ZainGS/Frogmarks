import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** What the Package Creator needs from the editor that hosts it. */
export interface PackageCreatorHost {
  shapeManager(): ShapeManager;
  exitAllScene3dModes(): void;
  updateGizmoPosition(): void;
  onVectorLayerSelected(layerId: string | null): void;
  dielinePaneCanvas(): HTMLCanvasElement | undefined;
  dielineGuideCanvas(): HTMLCanvasElement | undefined;
}

/**
 * Package Creator state + actions (box style/dimensions/fold, dieline pane, layer stack, board, stage).
 * Component-scoped: provided by IllustrationComponent; the editor template, the creator subpanel and the
 * dieline sidebar all read the same instance. Extracted from illustration.component (refactor-plan 2.2b).
 */
@Injectable()
export class PackageCreatorService implements OnDestroy {
  private host!: PackageCreatorHost;
  bind(host: PackageCreatorHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager(); }

  // ── Package Creator ─────────────────────────────────────────────────────────
  scene3dPkgCreatorOpen = false;
  pkgCreatorId: string | null = null;
  pkgStyle = 'simpleBox';
  pkgWidth  = 80;
  pkgHeight = 60;
  pkgDepth  = 40;
  pkgBleed  = 3;
  pkgFoldAmount = 0;
  // Style-specific params
  pkgTuckStyle: 'reverse' | 'straight' = 'reverse';
  pkgLockTabs = true;
  pkgRestOpenAmount = 0;
  pkgLidDepth = 0;        // 0 = Salsa default (full telescope)
  pkgBoardThickness = 2;
  pkgBoardPreset: 'white' | 'kraft' = 'white';
  pkgStageMode = 'gradient';
  private _pkgDimDebounce: any = null;
  private _pkgFoldRaf?: number;
  // Dieline pane handle (from attachDielinePane) — LIVE handle, re-use on resize/setDimensions
  private _pkgDielinePane: any = null;
  pkgGuideTypes = new Set<string>(['cut', 'fold', 'bleed', 'panel', 'slit']);
  pkgLayerStack: Array<{layerId: string; name: string; visible: boolean; opacity: number; active: boolean; kind: 'raster' | 'vector'}> = [];
  // 3D = no pane; split/2d = pane mounted in the subpanel canvas
  pkgViewMode: '3d' | 'split' | '2d' = '3d';
  // 3D = no pane; split/2d = pane mounted in the subpanel canvas

  /** The editor is entering another mode: leave the creator without touching selection or the gizmo. */
  exitQuietly(): void {
    if (this.scene3dPkgCreatorOpen) {
      this.scene3dPkgCreatorOpen = false;
      this.pkgLayerStack = [];
      this.shapeManager.packaging?.exitCreatorMode();
      this._pkgDielinePane = null;
      if (this._pkgFoldRaf != null) { cancelAnimationFrame(this._pkgFoldRaf); this._pkgFoldRaf = undefined; }
    }
  }

  ngOnDestroy(): void {
    if (this._pkgFoldRaf != null) { cancelAnimationFrame(this._pkgFoldRaf); this._pkgFoldRaf = undefined; }
    if (this._pkgDimDebounce) clearTimeout(this._pkgDimDebounce);
  }

  openPkgCreator(packageId?: string | null): void {
    this.host.exitAllScene3dModes();
    this.scene3dPkgCreatorOpen = true;
    this.pkgViewMode = '3d';
    const sm = this.shapeManager;
    const params: any = { width: this.pkgWidth, height: this.pkgHeight, depth: this.pkgDepth, bleed: this.pkgBleed };
    const opts: any = { params };
    if (packageId) {
      opts.packageId = packageId;
    } else {
      opts.style = this.pkgStyle;
      this._applyStyleParams(params);
    }
    const st = sm.packaging?.enterCreatorMode(opts);
    if (st?.packageId) {
      this.pkgCreatorId = st.packageId;
      this.pkgFoldAmount = st.foldAmount ?? 0;
      if (st.style) this.pkgStyle = st.style;
      const preset = sm.packaging?.getBoardPreset(st.packageId);
      if (preset) this.pkgBoardPreset = preset;
      const stageBg = sm.packaging?.getStageBackground();
      if (stageBg?.mode) this.pkgStageMode = stageBg.mode;
      this._refreshPkgLayerStack();
    }
    this.host.updateGizmoPosition();
  }

  closePkgCreator(): void {
    this.scene3dPkgCreatorOpen = false;
    this.pkgViewMode = '3d';
    this.pkgLayerStack = [];
    this.host.onVectorLayerSelected(null);
    const sm = this.shapeManager;
    sm.packaging?.exitCreatorMode();
    this._pkgDielinePane = null;
    if (this._pkgFoldRaf != null) { cancelAnimationFrame(this._pkgFoldRaf); this._pkgFoldRaf = undefined; }
    this.host.updateGizmoPosition();
  }

  pkgSetViewMode(mode: '3d' | 'split' | '2d'): void {
    this.pkgViewMode = mode;
    const sm = this.shapeManager;
    if (mode === '3d') {
      sm.packaging?.detachDielinePane();
      this._pkgDielinePane = null;
    } else if (!this._pkgDielinePane) {
      // Canvas just appeared in the DOM — attach fresh
      setTimeout(() => this._attachDielinePane(), 0);
    } else {
      // Mode switched but pane already attached; canvas resized → redraw overlay
      setTimeout(() => this._drawDielinePaneGuides(), 0);
    }
  }

  pkgDimChanged(): void {
    if (this._pkgDimDebounce) clearTimeout(this._pkgDimDebounce);
    this._pkgDimDebounce = setTimeout(() => {
      if (!this.pkgCreatorId) return;
      const params: any = { width: this.pkgWidth, height: this.pkgHeight, depth: this.pkgDepth, bleed: this.pkgBleed };
      this._applyStyleParams(params);
      const s = this.shapeManager.packaging?.setDimensions(this.pkgCreatorId, params);
      if (s?.id) this.pkgCreatorId = s.id;
      this._drawDielinePaneGuides();
    }, 40);
  }

  _applyStyleParams(params: any): void {
    if (this.pkgStyle === 'tuckEnd') {
      params.tuckStyle = this.pkgTuckStyle;
    } else if (this.pkgStyle === 'rollEndMailer') {
      params.lockTabs = this.pkgLockTabs;
      params.restOpenAmount = this.pkgRestOpenAmount;
    } else if (this.pkgStyle === 'rigidTwoPiece') {
      if (this.pkgLidDepth > 0) params.lidDepth = this.pkgLidDepth;
      params.boardThickness = this.pkgBoardThickness;
    }
  }

  pkgFold(): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.fold(this.pkgCreatorId);
    this._pkgSyncFoldTween();
  }

  pkgUnfold(): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.unfold(this.pkgCreatorId);
    this._pkgSyncFoldTween();
  }

  pkgFoldScrub(): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.setFoldAmount(this.pkgCreatorId, this.pkgFoldAmount);
  }

  private _pkgSyncFoldTween(): void {
    if (this._pkgFoldRaf != null) cancelAnimationFrame(this._pkgFoldRaf);
    const tick = () => {
      const st = this.shapeManager.packaging?.get(this.pkgCreatorId!);
      if (st != null) this.pkgFoldAmount = st.foldAmount;
      const settled = Math.abs(this.pkgFoldAmount - Math.round(this.pkgFoldAmount)) < 0.002;
      this._pkgFoldRaf = settled ? undefined : requestAnimationFrame(tick);
    };
    this._pkgFoldRaf = requestAnimationFrame(tick);
  }

  async pkgExportDieline(): Promise<void> {
    if (!this.pkgCreatorId) return;
    const blob = await this.shapeManager.packaging?.exportDielinePng(this.pkgCreatorId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dieline.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  pkgToggleGuide(type: string, on: boolean): void {
    on ? this.pkgGuideTypes.add(type) : this.pkgGuideTypes.delete(type);
    this._drawDielinePaneGuides();
  }

  private _refreshPkgLayerStack(): void {
    if (!this.pkgCreatorId) { this.pkgLayerStack = []; return; }
    const stack: any[] = this.shapeManager.packaging?.getLayerStack(this.pkgCreatorId) ?? [];
    this.pkgLayerStack = [...stack].reverse(); // API returns bottom→top; UI shows top→bottom
  }

  pkgAddLayer(): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.addLayer(this.pkgCreatorId);
    this._refreshPkgLayerStack();
  }

  pkgAddVectorLayer(): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.addVectorLayer(this.pkgCreatorId);
    this._refreshPkgLayerStack();
  }

  pkgSetActiveLayer(layerId: string): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.setActiveLayer(this.pkgCreatorId, layerId);
    this._refreshPkgLayerStack();
    // Wire the active layer into the ephemera/vector system
    const active = this.pkgLayerStack.find(l => l.layerId === layerId);
    this.host.onVectorLayerSelected(active?.kind === 'vector' ? layerId : null);
  }

  pkgSetLayerVisible(layerId: string, visible: boolean): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.setLayerVisible(this.pkgCreatorId, layerId, visible);
    this._refreshPkgLayerStack();
  }

  pkgSetLayerOpacity(layerId: string, opacity: number, commit = true): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.setLayerOpacity(this.pkgCreatorId, layerId, opacity);
    if (commit) this._refreshPkgLayerStack();
  }

  pkgRemoveLayer(layerId: string): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.removeLayer(this.pkgCreatorId, layerId);
    this._refreshPkgLayerStack();
  }

  pkgReorderLayer(layerId: string, toIndex: number): void {
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.reorderLayer(this.pkgCreatorId, layerId, toIndex);
    this._refreshPkgLayerStack();
  }

  pkgSetStyle(style: string): void {
    this.pkgStyle = style;
    // If creator is open, apply the style change to the live box immediately.
    if (!this.pkgCreatorId || !this.scene3dPkgCreatorOpen) return;
    const s = this.shapeManager.packaging?.setStyle(this.pkgCreatorId, style as any);
    if (s?.id) {
      this.pkgCreatorId = s.id;
      this._refreshPkgLayerStack();
      this._drawDielinePaneGuides();
    }
  }

  pkgSetBoardPreset(preset: 'white' | 'kraft'): void {
    this.pkgBoardPreset = preset;
    if (!this.pkgCreatorId) return;
    this.shapeManager.packaging?.setBoardPreset(this.pkgCreatorId, preset);
  }

  pkgSetStageMode(mode: string): void {
    this.pkgStageMode = mode;
    this.shapeManager.packaging?.setStageBackground({ mode: mode as any });
  }

  get pkgRasterLayerCount(): number {
    return this.pkgLayerStack.filter(l => l.kind === 'raster').length;
  }

  /** True when a raster layer is active (paint mode); false when a vector layer is active (place mode). */
  get pkgIsActivePaintable(): boolean {
    return this.shapeManager.packaging?.isActivePaintable() ?? true;
  }

  private _attachDielinePane(): void {
    const sm = this.shapeManager;
    if (!sm.packaging) return;
    const paneCanvas = this.host.dielinePaneCanvas();
    if (!paneCanvas) return;
    const renderer = sm.createUVCanvasRenderer(paneCanvas);
    if (!renderer) return;
    const pane = sm.packaging.attachDielinePane(renderer);
    if (!pane) return;
    this._pkgDielinePane = pane;
    // Salsa fires onPaneResize after its internal ResizeObserver re-syncs the backing store;
    // redraw our overlay there so guide coordinates are always in the new mapping.
    pane.onPaneResize = () => this._drawDielinePaneGuides();
    this._drawDielinePaneGuides();
  }

  private _drawDielinePaneGuides(): void {
    const pane = this._pkgDielinePane;
    const guideCanvas = this.host.dielineGuideCanvas();
    const paneEl = this.host.dielinePaneCanvas();
    if (!pane || !guideCanvas || !paneEl) return;
    // Match guide canvas backing store to the pane canvas (uvToCanvas returns backing-store px)
    const dpr = window.devicePixelRatio || 1;
    const cssW = paneEl.clientWidth;
    const cssH = paneEl.clientHeight;
    if (!cssW || !cssH) return;
    const physW = Math.round(cssW * dpr);
    const physH = Math.round(cssH * dpr);
    guideCanvas.width  = physW;
    guideCanvas.height = physH;
    guideCanvas.style.width  = cssW + 'px';
    guideCanvas.style.height = cssH + 'px';
    const ctx = guideCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, physW, physH);

    // Dim-outside-the-net: fill the texture area minus each panel rect (evenodd)
    const panels: any[] = pane.panels ?? [];
    if (panels.length) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      const [bx0, by0] = pane.uvToCanvas(0, 0);
      const [bx1, by1] = pane.uvToCanvas(1, 1);
      ctx.rect(bx0, by0, bx1 - bx0, by1 - by0);
      for (const p of panels) {
        const r = p.uvRect;
        const [x0, y0] = pane.uvToCanvas(r.u0, r.v0);
        const [x1, y1] = pane.uvToCanvas(r.u1, r.v1);
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
      }
      ctx.fill('evenodd');
      ctx.restore();
    }

    // Guide lines (types filtered by user toggles)
    const guides: any[] = pane.guides ?? [];
    for (const g of guides) {
      if (!this.pkgGuideTypes.has(g.type)) continue;
      ctx.strokeStyle = g.color ?? '#888888';
      ctx.lineWidth = g.type === 'panel' ? dpr : 2 * dpr;
      ctx.setLineDash(g.type === 'fold' ? [6 * dpr, 4 * dpr] : []);
      ctx.globalAlpha = g.type === 'panel' ? 0.5 : 1;
      ctx.beginPath();
      for (const [a, b] of (g.segments ?? [])) {
        const [x0, y0] = pane.uvToCanvas(a[0] / pane.canvasWidth, a[1] / pane.canvasHeight);
        const [x1, y1] = pane.uvToCanvas(b[0] / pane.canvasWidth, b[1] / pane.canvasHeight);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Panel labels centred on each panel rect
    if (panels.length) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.font = `${11 * dpr}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of panels) {
        const r = p.uvRect;
        const [cx, cy] = pane.uvToCanvas((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2);
        ctx.fillText(p.label, cx, cy);
      }
    }
    ctx.globalAlpha = 1;
  }
}
