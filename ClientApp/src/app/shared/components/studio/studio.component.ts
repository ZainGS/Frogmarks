import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import ShapeManager from '@zaings/salsa/shape-manager';
import { isRendererLive, startWebGPURendering } from '@zaings/salsa';
import { LocalIllustrationService } from '../../services/illustrate/local-illustration.service';
import { markFreshLocalDocument } from '../../services/illustrate/fresh-local-document';
import { NewIllustrationDialogComponent } from '../new-illustration-dialog/new-illustration-dialog.component';
import { APP_BUILD_LABEL, APP_VERSION_LABEL } from '../../../app-version';
import { preloadIllustrateModule } from '../../../illustrate-loader';
import { perfMark, shellPerfFlags } from '../../utilities/perf-marks';

interface AriaSlot { id: string; name: string }

/** What the New Illustration dialog closes with (null / undefined = cancelled). */
interface NewIllustrationResult { name?: string; docW?: number | null; docH?: number | null; bounded?: boolean }

/** Salsa reads this when its automatic pipeline warm-up fires (webgpu-renderer `_schedulePipelineWarmup`): true = the
 *  host warms explicitly with bootAndWarm() once its own UI is calm. */
type WarmupHoldGlobal = { salsaHoldPipelineWarmup?: boolean };

/** The Shell must show this much smooth animation before the editor pipeline warm-up starts (touch devices). */
const WARMUP_SMOOTH_MS = 2000;
/** …but it starts after this long regardless. */
const WARMUP_MAX_WAIT_MS = 8000;
/** A frame this long or shorter counts as smooth (two 60 Hz frames). */
const SMOOTH_FRAME_MS = 34;
/** Idle on the home this long → fetch + evaluate the editor chunk in the background. */
const IDLE_PRELOAD_MS = 3000;
/** After the home → Illustrations flip: wait out the rest of the cross-fade before preloading. */
const GRID_PRELOAD_MS = 450;

@Component({
  selector: 'app-studio',
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.scss']
})
export class StudioComponent implements OnInit, OnDestroy {
  private sm: ShapeManager = null;
  private _activateSub?: { unsubscribe(): void };
  private _changeSub?: { unsubscribe(): void };
  private _deleteSub?: { unsubscribe(): void };
  private _newlyCreatedIds = new Set<string>();
  private _pendingNewProjectResult: any = null;
  private _destroyed = false;

  showInstallDialog  = false;
  showSettingsOverlay = false;
  installUrlInput    = '';
  ariaSlots: AriaSlot[] = [];
  /** Shown in the Settings dialog (deploy check; bump APP_VERSION in app-version.ts). */
  readonly appVersionLabel = APP_VERSION_LABEL;
  readonly appBuildLabel = APP_BUILD_LABEL;

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private dialog: MatDialog,
    private localIllustrationService: LocalIllustrationService,
  ) {}

  async ngOnInit(): Promise<void> {
    // webgpuCanvas persists in AppComponent but must not intercept shell input.
    const webgpuCanvas = document.getElementById('webgpuCanvas') as HTMLCanvasElement | null;
    if (webgpuCanvas) webgpuCanvas.style.pointerEvents = 'none';

    // Editor pipeline warm-up (mobile-parity UI-17 d). It used to start the moment the device was ready, compiling
    // ~a hundred pipelines while the Shell drew its first frames. On a touch device it now waits until the Shell has
    // animated smoothly for a couple of seconds; `?shellskip=warmup` turns it off entirely (an A/B on the device).
    // The hold must be in place BEFORE the device exists: Salsa's own automatic warm-up reads it when it fires.
    const skipWarmup = shellPerfFlags().skip.has('warmup');
    this._holdWarmup = skipWarmup || this._isTouchDevice();
    if (this._holdWarmup) (globalThis as WarmupHoldGlobal).salsaHoldPipelineWarmup = true;

    // The renderer + Shell rAF loops, pointer listeners and pipeline warm-up run OUTSIDE the Angular zone (as in
    // illustration.component) — inside it every Shell frame triggered app-wide change detection (mobile-parity UI-16).
    // Shell → Angular callbacks below re-enter the zone with ngZone.run.
    if (!isRendererLive) {
      await this.ngZone.runOutsideAngular(() => startWebGPURendering('shellCanvas'));
    }

    this.sm = ShapeManager.getInstance();
    await this.sm.whenWebGPUReady();
    // fire-and-forget: warms all pipelines while user browses shell (at once on desktop; also when this component
    // was already left during the awaits above — nobody else would release the hold)
    if (!this._holdWarmup || (this._destroyed && !skipWarmup)) this._warmNow();

    // Point the shell at our IndexedDB illustration store so project IDs match.
    this.sm.shell?.setDocumentSource({
      listProjects: async () => {
        const items = await this.localIllustrationService.getAll(false);
        return items.map(i => ({
          id:               i.uuid,
          name:             i.name,
          kind:             i.kind ?? 'illustration',
          thumbnailDataUrl: i.thumbnailDataUrl,
          lastModified:     i.updatedAt,
        }));
      },
      createProject: async (name: string) => {
        const item = await this.localIllustrationService.create(name);
        this._newlyCreatedIds.add(item.uuid);
        return { id: item.uuid, name: item.name, thumbnailDataUrl: item.thumbnailDataUrl };
      },
      deleteProject: (id: string) => this.localIllustrationService.delete(id),
      renameProject: (id: string, name: string) => this.localIllustrationService.rename(id, name),
      // Required by the interface; only used when createProject is absent
      newProjectId: () => crypto.randomUUID(),
    });

    await this.sm.shell?.load();
    this.sm.setShellLogo('assets/images/logo.png');

    this._activateSub = this.sm.shell?.onActivate?.subscribe(({ id, kind, dashboardKind }: any) => {
      this.ngZone.run(() => this._handleActivation(id, kind, dashboardKind));
    });

    this._changeSub = this.sm.shell?.onChange?.subscribe((reason?: string) => {
      // Only a change of the slot / project LIST concerns Angular (the offscreen ARIA tree). Hover, selection and the
      // mode flip (which fires in the middle of the cross-fade) never re-enter the zone: no change detection there.
      if (reason === 'mode') { this._onShellModeChanged(); return; }
      if (reason === 'loaded' || reason === 'registry' || reason === 'projects') this._scheduleAriaRefresh();
    });

    this._deleteSub = this.sm.shell?.onProjectDelete?.subscribe(({ id }: { id: string }) => {
      this.ngZone.run(() => void this.localIllustrationService.delete(id).then(() => {
        // (notifyProjectsChanged never existed — the shell list never refreshed after a delete)
        void this.sm.shell?.refreshProjects();
      }));
    });

    const shellCanvas = document.getElementById('shellCanvas') as HTMLCanvasElement;
    await this.ngZone.runOutsideAngular(() => this.sm.shell?.initializeScene(shellCanvas));
    if (this._destroyed) return;
    this.ngZone.run(() => this._refreshAria());

    this.ngZone.runOutsideAngular(() => {
      if (this._holdWarmup && !skipWarmup) this._warmWhenShellIsSmooth();
      // Editor chunk: at an idle moment on the home, and at the latest when a card is pressed.
      this._idlePreloadTimer = setTimeout(() => this._preloadEditorWhenIdle(), IDLE_PRELOAD_MS);
      this._onCanvasPointerDown = () => {
        if (this.sm?.shell?.getViewState().mode === 'illustrations') preloadIllustrateModule();
      };
      shellCanvas?.addEventListener('pointerdown', this._onCanvasPointerDown, { passive: true });
      this._shellCanvas = shellCanvas ?? null;
    });
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    this._activateSub?.unsubscribe();
    this._changeSub?.unsubscribe();
    this._deleteSub?.unsubscribe();
    clearTimeout(this._idlePreloadTimer);
    clearTimeout(this._gridPreloadTimer);
    clearTimeout(this._ariaTimer);
    if (this._warmRaf) cancelAnimationFrame(this._warmRaf);
    if (this._shellCanvas && this._onCanvasPointerDown) this._shellCanvas.removeEventListener('pointerdown', this._onCanvasPointerDown);
    // destroyScene restarts the editor loop (play()) — keep that rAF loop outside the zone too.
    this.ngZone.runOutsideAngular(() => this.sm?.shell?.destroyScene());
    // Leaving for an editor before the delayed warm-up ran: it must not wait any longer.
    if (this._holdWarmup && !shellPerfFlags().skip.has('warmup')) this.ngZone.runOutsideAngular(() => this._warmNow());
    const webgpuCanvas = document.getElementById('webgpuCanvas') as HTMLCanvasElement | null;
    if (webgpuCanvas) webgpuCanvas.style.pointerEvents = '';
  }

  // ── editor pipeline warm-up ──────────────────────────────────────────────

  private _holdWarmup = false;
  private _warmed = false;
  private _warmRaf = 0;

  private _isTouchDevice(): boolean {
    try { return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
  }

  /** Start the warm-up now (idempotent here and in Salsa) and release the hold on Salsa's automatic one. */
  private _warmNow(): void {
    if (this._warmed || !this.sm) return;
    this._warmed = true;
    (globalThis as WarmupHoldGlobal).salsaHoldPipelineWarmup = false;
    this.ngZone.runOutsideAngular(() => this.sm.bootAndWarm());
  }

  /** Watch the Shell's frames (outside the zone): warm once WARMUP_SMOOTH_MS of consecutive smooth frames went by,
   *  or after WARMUP_MAX_WAIT_MS. */
  private _warmWhenShellIsSmooth(): void {
    const start = performance.now();
    let last = 0, smooth = 0;
    const tick = (t: number) => {
      this._warmRaf = 0;
      if (this._warmed || this._destroyed) return;
      if (last) { const dt = t - last; smooth = dt <= SMOOTH_FRAME_MS ? smooth + dt : 0; }
      last = t;
      if (smooth >= WARMUP_SMOOTH_MS || performance.now() - start >= WARMUP_MAX_WAIT_MS) { this._warmNow(); return; }
      this._warmRaf = requestAnimationFrame(tick);
    };
    this._warmRaf = requestAnimationFrame(tick);
  }

  // ── editor chunk preload ─────────────────────────────────────────────────

  private _idlePreloadTimer: ReturnType<typeof setTimeout> | undefined;
  private _gridPreloadTimer: ReturnType<typeof setTimeout> | undefined;
  private _shellCanvas: HTMLCanvasElement | null = null;
  private _onCanvasPointerDown?: () => void;

  /** Fetch + evaluate the editor chunk at the browser's next idle slot (never inside the zone). */
  private _preloadEditorWhenIdle(): void {
    if (this._destroyed) return;
    this.ngZone.runOutsideAngular(() => {
      const ric = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
      if (typeof ric === 'function') ric(() => preloadIllustrateModule(), { timeout: 1500 });
      else setTimeout(() => preloadIllustrateModule(), 0);
    });
  }

  /** The Shell flipped home ↔ Illustrations (called outside the zone, in the middle of the cross-fade). */
  private _onShellModeChanged(): void {
    clearTimeout(this._gridPreloadTimer);
    if (this.sm?.shell?.getViewState().mode !== 'illustrations') return;
    // The grid is where an illustration gets opened: have the editor chunk ready — once the fade has finished.
    this._gridPreloadTimer = setTimeout(() => this._preloadEditorWhenIdle(), GRID_PRELOAD_MS);
  }

  private _handleActivation(id: string, kind: string, dashboardKind?: string): void {
    switch (kind) {
      case 'project':
        if (this._newlyCreatedIds.has(id)) {
          this._newlyCreatedIds.delete(id);
          this._openNewProject(id, dashboardKind);
        } else {
          this._openProject(id, dashboardKind);
        }
        break;
      case 'empty':
        if (id === '__new_project__') {
          if (dashboardKind === 'packaging') {
            void this._initiateNewPackagingProject();
          } else {
            this._initiateNewProject();
          }
        } else {
          this.showInstallDialog = true;
        }
        break;
      case 'system':
        if (id === 'system:settings') this.showSettingsOverlay = true;
        break;
    }
  }

  private _openProject(projectId: string, dashboardKind?: string): void {
    if (dashboardKind === 'packaging') {
      void this.router.navigate(['/packaging/local', projectId]);
    } else {
      perfMark('nav-start');
      void this.router.navigate(['/illustration/local', projectId]);
    }
  }

  private async _initiateNewPackagingProject(): Promise<void> {
    const name = 'Product Packaging';
    const item = await this.localIllustrationService.create(name, undefined, 'packaging');
    void this.router.navigate(['/packaging/local', item.uuid]);
  }

  private _initiateNewProject(): void {
    if (this.dialog.openDialogs.length > 0) return;
    perfMark('create:click');
    const dialogRef = this.dialog.open(NewIllustrationDialogComponent, {
      width: '420px',
      panelClass: ['new-illustration-dialog', 'fm-dialog'],
      disableClose: false,
      enterAnimationDuration: '0ms',
      data: { isLoggedIn: false },
    });
    // The dialog is static UI: a good moment to get the editor chunk (after its first paint).
    this.ngZone.runOutsideAngular(() => setTimeout(() => preloadIllustrateModule(), 150));
    // beforeClosed (was afterClosed): the document is created and the navigation started the moment the user
    // confirms, while the dialog plays its usual exit animation — not after it.
    dialogRef.beforeClosed().subscribe((result: NewIllustrationResult | null | undefined) => {
      if (!result) return;
      perfMark('dialog-closed');
      void this._createAndOpen(result);
    });
  }

  /** Create the local document and open it in the editor. Straight to the local store: the Shell (which is about to
   *  be left) is not told, so no optimistic tile, model rebuild or ARIA refresh runs in the middle of the navigation —
   *  it re-reads the project list on its next mount. */
  private async _createAndOpen(result: NewIllustrationResult): Promise<void> {
    const item = await this.localIllustrationService.create(result.name ?? 'Untitled');
    perfMark('doc-created');
    // Hand the record to the editor (in memory, one-shot): it skips reading it back and probing OPFS for a save
    // that cannot exist yet. See fresh-local-document.ts for why this is not router state.
    markFreshLocalDocument(item);
    perfMark('nav-start');
    if (result.bounded && result.docW && result.docH) {
      void this.router.navigate(['/illustration/local', item.uuid], {
        queryParams: { docW: result.docW, docH: result.docH },
      });
    } else {
      void this.router.navigate(['/illustration/local', item.uuid]);
    }
  }

  private _openNewProject(projectId: string, dashboardKind?: string): void {
    if (dashboardKind === 'packaging') {
      void this.router.navigate(['/packaging/local', projectId]);
      return;
    }
    const result = this._pendingNewProjectResult;
    this._pendingNewProjectResult = null;
    if (result?.bounded && result.docW && result.docH) {
      void this.router.navigate(['/illustration/local', projectId], {
        queryParams: { docW: result.docW, docH: result.docH },
      });
    } else {
      void this.router.navigate(['/illustration/local', projectId]);
    }
  }

  // ── offscreen ARIA tree ──────────────────────────────────────────────────

  private _ariaTimer: ReturnType<typeof setTimeout> | undefined;
  private _ariaSignature = '';

  /** The list changed: refresh the ARIA tree a little later, once (called outside the zone; a burst of changes — a
   *  refresh after a save, an optimistic patch — becomes one zone entry instead of one per change). */
  private _scheduleAriaRefresh(): void {
    if (this._ariaTimer !== undefined) return;
    this._ariaTimer = setTimeout(() => {
      this._ariaTimer = undefined;
      if (this._destroyed) return;
      const next = this._buildAria();
      if (next.signature === this._ariaSignature) return;   // same ids + names: nothing for Angular to do
      this.ngZone.run(() => { this.ariaSlots = next.slots; this._ariaSignature = next.signature; });
    }, 250);
  }

  private _buildAria(): { slots: AriaSlot[]; signature: string } {
    const slots    = this.sm?.shell?.getSlots()    ?? [];
    const projects = this.sm?.shell?.getProjects() ?? [];
    const out: AriaSlot[] = [
      ...slots.map((s: any)    => ({ id: s.id,   name: s.name  ?? s.id })),
      ...projects.map((p: any) => ({ id: p.id,   name: p.name  ?? 'Untitled' })),
    ];
    return { slots: out, signature: out.map(s => s.id + '\u0001' + s.name).join('\u0002') };
  }

  private _refreshAria(): void {
    const next = this._buildAria();
    this.ariaSlots = next.slots;
    this._ariaSignature = next.signature;
  }

  /** ngFor identity: a refreshed list keeps the DOM nodes of the entries that are still there. */
  trackAriaSlot(_index: number, slot: AriaSlot): string { return slot.id; }

  closeInstallDialog(): void {
    this.showInstallDialog = false;
    this.installUrlInput   = '';
  }

  closeSettingsOverlay(): void {
    this.showSettingsOverlay = false;
  }

  async installCartFromUrl(): Promise<void> {
    // Phase 4 — wire when Salsa cart install APIs land
    this.closeInstallDialog();
  }
}
