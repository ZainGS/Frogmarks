import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import ShapeManager from '@zaings/salsa/shape-manager';
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering } from '@zaings/salsa';
import { Subscription } from 'rxjs';
import { OpfsMetadataService } from 'app/shared/services/illustrate/opfs-metadata.service';
import { LocalIllustrationService } from 'app/shared/services/illustrate/local-illustration.service';
import { RasterAutoSaveService } from 'app/shared/services/raster/raster-autosave.service';
import { PackagingStateDto } from 'app/shared/services/illustrate/illustration.service';

@Component({
  selector: 'app-package-editor',
  standalone: false,
  templateUrl: './package-editor.component.html',
  styleUrl:    './package-editor.component.scss',
})
export class PackageEditorComponent implements OnInit, OnDestroy {

  @ViewChild('webgpuCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('guideCanvas',  { static: true }) guideCanvasRef!: ElementRef<HTMLCanvasElement>;

  private _sm: any = null;
  private _docId = '';
  private _pkgId: string | null = null;
  private _dielineLayerId: string | null = null;
  private _routeSub?: Subscription;
  private _strokeSub?: { unsubscribe?(): void };
  private _saveDebounce: ReturnType<typeof setTimeout> | null = null;
  private _dimDebounce:  ReturnType<typeof setTimeout> | null = null;
  private _foldTweenRaf?: number;
  private _lastDocW = 0;
  private _lastDocH = 0;

  isLoading = true;
  projectName = 'Package';
  isLocalMode = false;

  // ── Dimension params (mm) ───────────────────────────────────
  boxWidth  = 80;
  boxHeight = 60;
  boxDepth  = 40;
  bleed     = 3;

  // ── Fold state ───────────────────────────────────────────────
  foldAmount = 0;   // 0 = flat dieline, 1 = closed box

  // ── Guide toggles ────────────────────────────────────────────
  showCutGuides   = true;
  showFoldGuides  = true;
  showBleedGuide  = true;
  showPanelGuides = true;

  constructor(
    private route:    ActivatedRoute,
    private router:   Router,
    private ngZone:   NgZone,
    private opfsMeta: OpfsMetadataService,
    private localIllustrationService: LocalIllustrationService,
    private autoSaveService: RasterAutoSaveService,
  ) {}

  ngOnInit(): void {
    this._routeSub = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) this._init(id);
    });
  }

  ngOnDestroy(): void {
    this._routeSub?.unsubscribe();
    this._strokeSub?.unsubscribe?.();
    if (this._saveDebounce) clearTimeout(this._saveDebounce);
    if (this._dimDebounce)  clearTimeout(this._dimDebounce);
    if (this._foldTweenRaf != null) cancelAnimationFrame(this._foldTweenRaf);
    // Disarm 3D painting + orbit; box, fold state and layer link persist.
    if (this._pkgId && this._sm?.packaging) this._sm.packaging.exitEditor?.(this._pkgId);
    this.autoSaveService.disable();
  }

  private async _init(uuid: string): Promise<void> {
    this.isLoading = true;
    this.isLocalMode = this.route.snapshot.data?.['local'] === true;
    this._docId = `local-${uuid}`;

    // Load project name
    const local = await this.localIllustrationService.getByUuid(uuid);
    if (local) this.projectName = local.name;

    // ── WebGPU bootstrap ────────────────────────────────────────
    if (!isRendererLive) {
      await startWebGPURendering('webgpuCanvas');
    } else {
      await reinitializeWebGPURendering('webgpuCanvas');
    }

    this._sm = ShapeManager.getInstance();
    await this._sm.whenWebGPUReady?.();

    const pkg = this._sm.packaging;
    if (!pkg) {
      console.warn('[PackageEditor] sm.packaging is null — PACKAGING_ENABLED may be off');
      this.isLoading = false;
      return;
    }

    // ── Load or create packaging state ─────────────────────────
    const savedMeta = await this.opfsMeta.read(this._docId);
    const savedPkg  = savedMeta?.packaging as PackagingStateDto | undefined | null;

    if (savedPkg?.packagingId) {
      // Restore — re-create from saved params, then enter editor with the saved layer id.
      this.boxWidth   = savedPkg.params.width;
      this.boxHeight  = savedPkg.params.height;
      this.boxDepth   = savedPkg.params.depth;
      this.bleed      = savedPkg.params.bleed ?? 3;
      this.foldAmount = savedPkg.foldAmount;

      const state = pkg.create(savedPkg.style, savedPkg.params);
      this._pkgId = state.id;
      pkg.setFoldAmount(this._pkgId, this.foldAmount);

      // Load pixel data before enterEditor so the dieline layer already has artwork.
      await this.autoSaveService.loadDocument(this._docId);

      const h = pkg.enterEditor?.(this._pkgId, { layerId: savedPkg.dielineLayerId });
      this._dielineLayerId = h?.dielineLayerId ?? savedPkg.dielineLayerId ?? null;
      if (h?.canvasWidth)  this._lastDocW = h.canvasWidth;
      if (h?.canvasHeight) this._lastDocH = h.canvasHeight;
      this._drawGuides(h?.guides);
    } else {
      // Brand new packaging project.
      const params = { width: this.boxWidth, height: this.boxHeight, depth: this.boxDepth, bleed: this.bleed };
      const state  = pkg.create('simpleBox', params);
      this._pkgId  = state.id;

      // enterEditor sizes the doc, creates + links the dieline layer, frames + orbits the box,
      // and arms 3D-surface painting — one call replaces the manual setup.
      const h = pkg.enterEditor?.(this._pkgId);
      this._dielineLayerId = h?.dielineLayerId ?? null;
      if (h?.canvasWidth)  this._lastDocW = h.canvasWidth;
      if (h?.canvasHeight) this._lastDocH = h.canvasHeight;
      this._drawGuides(h?.guides);

      await this._saveState();
    }

    // Select the dieline layer so flat raster tools draw onto the box surface.
    if (this._dielineLayerId) this._sm.selectRasterLayer?.(this._dielineLayerId);

    // ── Auto-save ───────────────────────────────────────────────
    this.autoSaveService.enable(this._docId, this.projectName);

    // ── Flat stroke-end → syncLiveTextures3D ────────────────────
    // 3D-surface strokes sync automatically; flat raster strokes need an explicit call.
    this._strokeSub = this._sm.onRasterStrokeEnd?.(() => {
      this._sm.syncLiveTextures3D?.();
    });

    this.isLoading = false;
  }

  // ── Dimension change ─────────────────────────────────────────

  onDimensionChanged(): void {
    if (this._dimDebounce) clearTimeout(this._dimDebounce);
    this._dimDebounce = setTimeout(() => {
      if (!this._pkgId || !this._sm.packaging) return;
      const params = { width: this.boxWidth, height: this.boxHeight, depth: this.boxDepth, bleed: this.bleed };
      const state = this._sm.packaging.setDimensions(this._pkgId, params);
      if (state?.canvasWidth && state?.canvasHeight &&
          (state.canvasWidth !== this._lastDocW || state.canvasHeight !== this._lastDocH)) {
        this._sm.setDocumentSize?.(state.canvasWidth, state.canvasHeight);
        this._lastDocW = state.canvasWidth;
        this._lastDocH = state.canvasHeight;
      }
      this._drawGuides(state?.guides);
      this._debounceSave();
    }, 40);
  }

  // ── Fold controls ────────────────────────────────────────────

  onFoldChanged(): void {
    if (!this._pkgId || !this._sm.packaging) return;
    this._sm.packaging.setFoldAmount(this._pkgId, this.foldAmount);
    this._debounceSave();
  }

  fold(): void {
    if (!this._pkgId || !this._sm.packaging) return;
    this._sm.packaging.fold(this._pkgId);
    this._syncFoldTween();
  }

  unfold(): void {
    if (!this._pkgId || !this._sm.packaging) return;
    this._sm.packaging.unfold(this._pkgId);
    this._syncFoldTween();
  }

  private _syncFoldTween(): void {
    if (this._foldTweenRaf != null) cancelAnimationFrame(this._foldTweenRaf);
    const tick = () => {
      const state = this._sm.packaging?.get?.(this._pkgId!);
      if (state != null) this.foldAmount = state.foldAmount;
      const settled = Math.abs(this.foldAmount - Math.round(this.foldAmount)) < 0.002;
      this._foldTweenRaf = settled ? undefined : requestAnimationFrame(tick);
    };
    this._foldTweenRaf = requestAnimationFrame(tick);
  }

  // ── Guide overlay ────────────────────────────────────────────

  private _drawGuides(guides?: any[]): void {
    if (!this._pkgId || !this._sm.packaging) return;
    const g = guides ?? this._sm.packaging.getGuides?.(this._pkgId);
    if (!g?.length) return;

    const canvas = this.guideCanvasRef?.nativeElement;
    if (!canvas) return;

    // Guide coordinates are in dieline document space — size the canvas to match.
    const pkgState = this._sm.packaging.get?.(this._pkgId);
    const docW = pkgState?.canvasWidth  || canvas.clientWidth;
    const docH = pkgState?.canvasHeight || canvas.clientHeight;
    canvas.width  = docW;
    canvas.height = docH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, docW, docH);

    // Draw panel guides first (under everything else).
    const order = [
      ...g.filter((x: any) => x.type === 'panel'),
      ...g.filter((x: any) => x.type !== 'panel'),
    ];

    for (const guide of order) {
      const show = guide.type === 'cut'   ? this.showCutGuides
                 : guide.type === 'fold'  ? this.showFoldGuides
                 : guide.type === 'bleed' ? this.showBleedGuide
                 : guide.type === 'panel' ? this.showPanelGuides
                 : false;
      if (!show) continue;

      ctx.strokeStyle = guide.color ?? '#888888';
      ctx.lineWidth   = guide.type === 'panel' ? 1 : guide.type === 'cut' ? 2 : 1;
      ctx.setLineDash(guide.type === 'fold' ? [6, 4] : []);
      ctx.globalAlpha = guide.type === 'panel' ? 0.5 : 1;

      ctx.beginPath();
      for (const [[x1, y1], [x2, y2]] of (guide.segments ?? [])) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  toggleGuides(): void {
    this._drawGuides();
  }

  // ── Export ───────────────────────────────────────────────────

  async exportDielinePng(): Promise<void> {
    if (!this._pkgId || !this._sm.packaging) return;
    const blob = await this._sm.packaging.exportDielinePng?.(this._pkgId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.projectName}-dieline.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // ── Navigation ───────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/']);
  }

  // ── Save state ───────────────────────────────────────────────

  private _debounceSave(): void {
    if (this._saveDebounce) clearTimeout(this._saveDebounce);
    this._saveDebounce = setTimeout(() => this._saveState(), 500);
  }

  private async _saveState(): Promise<void> {
    if (!this._pkgId || !this._dielineLayerId) return;
    const pkgDto: PackagingStateDto = {
      packagingId:    this._pkgId,
      style:          'simpleBox',
      params:         { width: this.boxWidth, height: this.boxHeight, depth: this.boxDepth, bleed: this.bleed },
      dielineLayerId: this._dielineLayerId,
      foldAmount:     this.foldAmount,
    };
    await this.opfsMeta.write(this._docId, {
      version:   1,
      animation: null,
      sceneGraph: null,
      layers:    [],
      savedAt:   Date.now(),
      packaging: pkgDto,
    });
  }
}
