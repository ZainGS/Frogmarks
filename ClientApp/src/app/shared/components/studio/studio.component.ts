import { Component, OnInit, OnDestroy, NgZone, HostBinding } from '@angular/core';
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
import { AppUpdateService } from '../../services/pwa/app-update.service';
import { updatePromptFor, updatePromptText } from '../../services/pwa/app-update.logic';
import { StoragePersistenceService } from '../../services/pwa/storage-persistence.service';
import { installShellEscapeGuard } from '../../utilities/shell-escape-guard';
import { PendingProjectDeletes, type PendingProjectDelete } from './pending-project-deletes';
import { nextShellDeviceBanner, type ShellDeviceBanner, type ShellDeviceStatusLike } from './shell-device-banner';
import { AppInstallService } from '../../services/pwa/app-install.service';
import {
  SHELL_THEME_OPTIONS, DEFAULT_SHELL_THEME, readSavedShellTheme, saveShellTheme, readLocalModelUrl, normalizeLocalModelUrl,
  saveLocalModelUrl, type ShellThemeId,
} from './shell-settings';
import { shellKeyItems, shellKeySignature, type ShellKeyItem } from './shell-keys';

/** A FrogCart tile was opened: what its dialog shows. */
interface CartDialog { id: string; name: string; description: string; removable: boolean; confirmRemove: boolean; removing: boolean }

/** The Salsa Shell APIs added after the dist Frogmarks may still be built against (typeof-guarded at each use). */
type ShellNewer = { importCart?: () => void };

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

  showSettingsOverlay = false;
  /** A cart tile was opened (carts can't run yet: the dialog says so and offers Remove). */
  cartDialog: CartDialog | null = null;
  /** The keyboard / screen-reader strip (shell-keys.ts): one real button per tile, chip or project card. */
  keyItems: ShellKeyItem[] = [];

  // ── Settings: theme, local model, install (one home for the Shell's settings) ──
  readonly themeOptions = SHELL_THEME_OPTIONS;
  themeId: ShellThemeId = DEFAULT_SHELL_THEME;
  localModelUrl = '';
  localModelStatus: '' | 'saved' | 'invalid' = '';
  /** Shown in the Settings dialog (deploy check; bump APP_VERSION in app-version.ts). */
  readonly appVersionLabel = APP_VERSION_LABEL;
  readonly appBuildLabel = APP_BUILD_LABEL;

  /** Card ✕ → hidden at once, deleted after the Undo toast's time unless Undo (pending-project-deletes.ts). */
  readonly pendingDeletes = new PendingProjectDeletes(
    (id) => this.localIllustrationService.delete(id),
    () => { void this.sm?.shell?.refreshProjects(); },
    undefined, undefined, undefined,
    (id, err) => console.warn('[Studio] deleting project ' + id + ' failed:', err),
  );

  /** A modal (Settings / Install) is up: the host layer (Shell canvas + modal) goes above Salsa's top-right cluster
   *  (z-index 50, on <body>), so the cluster is covered and can't be clicked under the modal. */
  @HostBinding('class.shell-raised') get raised(): boolean { return this.modalOpen; }
  get modalOpen(): boolean { return this.showSettingsOverlay || !!this.cartDialog; }

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private dialog: MatDialog,
    private localIllustrationService: LocalIllustrationService,
    readonly updates: AppUpdateService,
    readonly storageInfo: StoragePersistenceService,
    readonly install: AppInstallService,
  ) {}

  // ── PWA: update popup + storage notice (salsa/docs/ui/pwa.md) ────────────

  /** "New version available" popup (never on its own: Reload is the user's). */
  get showUpdatePopup(): boolean {
    return updatePromptFor('shell', this.updates.state, this.updates.dismissedOnShell) === 'popup';
  }
  get updateText(): string {
    return updatePromptText(this.updates.state, this.updates.latestVersion, this.updates.currentVersion);
  }
  /** Shown under the text when the reload was held back (a document in a background editor is still unsaved). */
  get updateBlocked(): boolean { return this.updates.blockedByUnsaved; }

  reloadForUpdate(): void { void this.updates.applyUpdate(); }
  laterForUpdate(): void { this.updates.dismissShellPrompt(); }

  /** Shell › Settings: ask the browser for persistent storage again. */
  requestPersistentStorage(): void { void this.storageInfo.requestPersistence(); }
  openStorageSettings(): void {
    this.cartDialog = null;
    this.showSettingsOverlay = true;
    this.themeId = this._currentThemeId();
    this.localModelUrl = readLocalModelUrl(this._storage());
    this.localModelStatus = '';
    this._syncModalChrome();
    void this.storageInfo.refreshEstimate();
  }

  // ── Settings › Theme ──

  pickTheme(id: ShellThemeId): void {
    this.themeId = id;
    saveShellTheme(this._storage(), id);
    const shell = this.sm?.shell;
    if (shell && typeof shell.setTheme === 'function') this.ngZone.runOutsideAngular(() => shell.setTheme(id));
  }

  private _currentThemeId(): ShellThemeId {
    const shell = this.sm?.shell;
    const now = shell && typeof shell.getThemeName === 'function' ? shell.getThemeName() : null;
    return (SHELL_THEME_OPTIONS.some(o => o.id === now) ? now : readSavedShellTheme(this._storage()) ?? DEFAULT_SHELL_THEME) as ShellThemeId;
  }

  /** The theme saved in Settings, applied before the Shell scene is built (no flash of the default theme). */
  private _applySavedTheme(): void {
    const saved = readSavedShellTheme(this._storage());
    const shell = this.sm?.shell;
    if (saved && shell && typeof shell.setTheme === 'function') shell.setTheme(saved);
  }

  // ── Settings › Local AI model ──

  saveLocalModel(): void {
    const url = normalizeLocalModelUrl(this.localModelUrl);
    if (url === null) { this.localModelStatus = 'invalid'; return; }
    saveLocalModelUrl(this._storage(), url);
    this.localModelUrl = url;
    this.localModelStatus = 'saved';
  }

  // ── Settings › Install app ──

  installApp(): void { void this.install.install(); }

  private _storage(): Storage | null {
    try { return window.localStorage; } catch { return null; }
  }

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

    // Escape in a dialog (Material or the Settings modal) must not also reach the Shell's window-level Escape.
    this.ngZone.runOutsideAngular(() => {
      this._escapeGuardOff = installShellEscapeGuard(document, {
        hostModalOpen: () => this.modalOpen,
        closeHostModal: () => this.ngZone.run(() => this.closeModal()),
      });
    });

    // The renderer + Shell rAF loops, pointer listeners and pipeline warm-up run OUTSIDE the Angular zone (as in
    // illustration.component) — inside it every Shell frame triggered app-wide change detection (mobile-parity UI-16).
    // Shell → Angular callbacks below re-enter the zone with ngZone.run.
    if (!isRendererLive) {
      await this.ngZone.runOutsideAngular(() => startWebGPURendering('shellCanvas'));
    }

    this.sm = ShapeManager.getInstance();
    await this.sm.whenWebGPUReady();
    if (this._destroyed) return;
    this._subscribeDeviceStatus();
    // fire-and-forget: warms all pipelines while user browses shell (at once on desktop; also when this component
    // was already left during the awaits above — nobody else would release the hold)
    if (!this._holdWarmup || (this._destroyed && !skipWarmup)) this._warmNow();

    // Point the shell at our IndexedDB illustration store so project IDs match.
    this.sm.shell?.setDocumentSource({
      listProjects: async () => {
        const items = (await this.localIllustrationService.getAll(false))
          .filter(i => !this.pendingDeletes.isHidden(i.uuid));   // a ✕'d card stays hidden while its Undo is up
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

    this._applySavedTheme();
    await this.sm.shell?.load();
    this.sm.setShellLogo('assets/images/logo.png');

    this._activateSub = this.sm.shell?.onActivate?.subscribe(({ id, kind, dashboardKind }: any) => {
      this.ngZone.run(() => this._handleActivation(id, kind, dashboardKind));
    });

    this._changeSub = this.sm.shell?.onChange?.subscribe((reason?: string) => {
      // Only a change of the slot / project LIST concerns Angular (the offscreen ARIA tree). Hover, selection and the
      // mode flip (which fires in the middle of the cross-fade) never re-enter the zone: no change detection there.
      if (reason === 'mode') { this._onShellModeChanged(); return; }
      if (reason === 'loaded' || reason === 'registry' || reason === 'projects') this._scheduleKeysRefresh();
    });

    // Card ✕ (illustration + packaging grids): hide the card and offer Undo; the delete happens when the toast ends.
    // (It used to delete for good on one tap.)
    this._deleteSub = this.sm.shell?.onProjectDelete?.subscribe(({ id, dashboardKind }: { id: string; dashboardKind?: string }) => {
      this.ngZone.run(() => {
        const name = this.sm?.shell?.getProject?.(id)?.name || 'Untitled';
        this.pendingDeletes.schedule({ id, name, dashboardKind: dashboardKind === 'packaging' ? 'packaging' : 'illustration' });
      });
    });

    const shellCanvas = document.getElementById('shellCanvas') as HTMLCanvasElement;
    await this.ngZone.runOutsideAngular(() => this.sm.shell?.initializeScene(shellCanvas));
    if (this._destroyed) return;
    this.ngZone.run(() => this._refreshKeys());

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
    // Leaving the Shell (or the app closing) with an Undo toast up: nothing is deleted — the project comes back.
    this.pendingDeletes.cancelAll();
    this._escapeGuardOff?.();
    this._deviceStatusOff?.();
    clearTimeout(this._deviceBannerTimer);
    this._activateSub?.unsubscribe();
    this._changeSub?.unsubscribe();
    this._deleteSub?.unsubscribe();
    clearTimeout(this._idlePreloadTimer);
    clearTimeout(this._gridPreloadTimer);
    clearTimeout(this._keysTimer);
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
    // The keyboard strip follows the view (home tiles <-> Back / New / project cards) — after the cross-fade.
    this._scheduleKeysRefresh(GRID_PRELOAD_MS);
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
          this.importCart();
        }
        break;
      case 'system':
        if (id === 'system:settings') this.openStorageSettings();
        break;
      case 'local':
      case 'remote':
        // A cart tile opened (double-click, or a tap on the selected cart). Carts can't run yet (Salsa launchSlot is
        // Phase 6) — it used to do nothing at all; now it says so, and an installed cart can be removed.
        this.openCartDialog(id);
        break;
    }
  }

  // ── FrogCarts ──

  openCartDialog(id: string): void {
    const slot = this.sm?.shell?.getSlot?.(id) ?? null;
    this.showSettingsOverlay = false;
    this.cartDialog = {
      id,
      name: slot?.name || (id === '__demo_cart__' ? 'Demo Cart' : 'FrogCart'),
      description: slot?.description || (id === '__demo_cart__' ? 'A sample cart that shows how installed FrogCarts look on the home screen.' : ''),
      removable: !!slot && slot.type !== 'system',
      confirmRemove: false,
      removing: false,
    };
    this._syncModalChrome();
  }

  closeCartDialog(): void {
    this.cartDialog = null;
    this._syncModalChrome();
  }

  /** Remove asks once ("Remove — sure?"), then deletes the cart's tile and its file from this device. */
  async removeCart(): Promise<void> {
    const d = this.cartDialog;
    const shell = this.sm?.shell;
    if (!d || !d.removable || !shell || d.removing) return;
    if (!d.confirmRemove) { d.confirmRemove = true; return; }
    d.removing = true;
    try {
      await this.ngZone.runOutsideAngular(() => shell.removeCartSlot(d.id));
    } catch (e) {
      console.warn('[Studio] removing cart ' + d.id + ' failed:', e);
    }
    if (this.cartDialog === d) this.closeCartDialog();
  }

  /** Open the .frogcart picker (the Import tile's action; newer Salsa builds only — it is in a click handler). */
  importCart(): void {
    const shell = this.sm?.shell as unknown as ShellNewer | undefined;
    if (shell && typeof shell.importCart === 'function') shell.importCart();
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

  // ── keyboard / screen-reader strip (shell-keys.ts) ──────────────────────

  private _keysTimer: ReturnType<typeof setTimeout> | undefined;
  private _keysSignature = '';
  /** A strip button changed the view: focus the new view's first button once it is there. */
  private _refocusKeys = false;

  /** The list or the view changed: rebuild the strip a little later, once (called outside the zone; a burst of
   *  changes — a refresh after a save, an optimistic patch — becomes one zone entry instead of one per change). */
  private _scheduleKeysRefresh(delayMs = 250): void {
    if (this._keysTimer !== undefined) clearTimeout(this._keysTimer);
    this._keysTimer = setTimeout(() => {
      this._keysTimer = undefined;
      if (this._destroyed) return;
      const next = this._buildKeys();
      const sig = shellKeySignature(next);
      if (sig !== this._keysSignature) this.ngZone.run(() => { this.keyItems = next; this._keysSignature = sig; });
      if (this._refocusKeys) {
        this._refocusKeys = false;
        setTimeout(() => (document.querySelector('.shell-keys button') as HTMLElement | null)?.focus(), 0);
      }
    }, delayMs);
  }

  private _buildKeys(): ShellKeyItem[] {
    const shell = this.sm?.shell;
    if (!shell) return [];
    const view = shell.getViewState?.();
    return shellKeyItems({
      mode: view?.mode ?? 'shell',
      dashboardKind: shell.getDashboardKind?.(),
      slots: shell.getSlots?.() ?? [],
      projects: view?.mode === 'illustrations' ? (shell.getProjects?.() ?? []) : [],
      canImport: typeof (shell as unknown as ShellNewer).importCart === 'function',
    });
  }

  private _refreshKeys(): void {
    this.keyItems = this._buildKeys();
    this._keysSignature = shellKeySignature(this.keyItems);
  }

  /** ngFor identity: a refreshed list keeps the DOM nodes of the entries that are still there. */
  trackKeyItem(_index: number, item: ShellKeyItem): string { return item.key; }

  /** A strip button: do what tapping that tile / chip / card does. */
  activateKey(item: ShellKeyItem): void {
    const shell = this.sm?.shell;
    if (!shell) return;
    const a = item.action;
    const kind = shell.getDashboardKind?.() ?? 'illustration';
    switch (a.type) {
      case 'system':
        if (a.systemKey === 'illustrator') { this._refocusKeys = true; this.ngZone.runOutsideAngular(() => shell.openIllustratorDashboard()); }
        else if (a.systemKey === 'packageDesigner') { this._refocusKeys = true; this.ngZone.runOutsideAngular(() => shell.openPackageDashboard()); }
        else this._handleActivation(a.id, 'system');
        break;
      case 'import': this.importCart(); break;
      case 'cart': this.openCartDialog(a.id); break;
      case 'back': this._refocusKeys = true; this.ngZone.runOutsideAngular(() => shell.closeIllustratorDashboard()); break;
      case 'new': this._handleActivation('__new_project__', 'empty', kind); break;
      case 'project': this._openProject(a.id, kind); break;
    }
  }

  closeSettingsOverlay(): void {
    this.showSettingsOverlay = false;
    this._syncModalChrome();
  }

  // ── Settings / cart modal: Esc, backdrop, the Shell chrome under it ──

  private _escapeGuardOff?: () => void;
  private _backdropPress = false;

  /** Close whichever Shell modal is open (Esc, a backdrop tap). */
  closeModal(): void {
    if (this.showSettingsOverlay) this.closeSettingsOverlay();
    else if (this.cartDialog) this.closeCartDialog();
  }

  /** A press that STARTS on the backdrop (not one dragged out of the card) closes the modal on release. */
  onOverlayPointerDown(e: Event): void { this._backdropPress = this.modalOpen && e.target === e.currentTarget; }
  onOverlayClick(e: Event): void {
    const close = this._backdropPress && e.target === e.currentTarget;
    this._backdropPress = false;
    if (close) this.closeModal();
  }

  /** Salsa's top-right cluster is not ours (Salsa appends it to <body>): while a modal is open it must not take focus
   *  or clicks. Newer Salsa builds tag it .salsa-shell-cluster; on older ones the raised host layer covers it. */
  private _syncModalChrome(): void {
    const cluster = document.querySelector('.salsa-shell-cluster');
    if (cluster) cluster.toggleAttribute('inert', this.modalOpen);
  }

  // ── Undo toast ──

  undoDelete(id: string): void { this.pendingDeletes.undo(id); }
  trackPendingDelete(_index: number, d: PendingProjectDelete): string { return d.id; }

  // ── GPU device lost → banner + Shell rebuild (same states as the editor's EngineStatusService banner) ──

  deviceBanner: ShellDeviceBanner = null;
  deviceBannerDetail: string[] = [];
  private _deviceStatusOff?: () => void;
  private _deviceBannerTimer: ReturnType<typeof setTimeout> | undefined;

  private _subscribeDeviceStatus(): void {
    const sm = this.sm;
    if (!sm || typeof sm.onDeviceStatusChange !== 'function') return;
    const off = sm.onDeviceStatusChange((info: ShellDeviceStatusLike) => this.ngZone.run(() => this._onDeviceStatus(info)));
    if (typeof off === 'function') this._deviceStatusOff = off;
    const now = typeof sm.getDeviceStatus === 'function' ? sm.getDeviceStatus() : null;
    if (now && now.status !== 'ok' && now.status !== 'initializing') this._onDeviceStatus(now);
  }

  private _onDeviceStatus(info: ShellDeviceStatusLike): void {
    if (this._destroyed) return;
    const step = nextShellDeviceBanner(this.deviceBanner, info);
    if (!step) return;
    clearTimeout(this._deviceBannerTimer); this._deviceBannerTimer = undefined;
    this.deviceBanner = step.banner;
    this.deviceBannerDetail = step.detail;
    if (step.autoHideMs) {
      this._deviceBannerTimer = setTimeout(() => { this.deviceBanner = null; this.deviceBannerDetail = []; }, step.autoHideMs);
    }
    if (step.remount) this._remountShellScene();
  }

  /** The Shell's GPU objects belonged to the lost device: tear the scene down and build it again on the new one. */
  private _remountShellScene(): void {
    const shell = this.sm?.shell;
    const canvas = document.getElementById('shellCanvas') as HTMLCanvasElement | null;
    if (this._destroyed || !shell || !canvas) return;
    this.ngZone.runOutsideAngular(() => {
      try { shell.destroyScene(); } catch (e) { console.warn('[Studio] Shell teardown after a device loss:', e); }
      shell.initializeScene(canvas).then(() => this._syncModalChrome()).catch((e: unknown) => {
        console.warn('[Studio] Shell rebuild after a device loss failed:', e);
        this.ngZone.run(() => {
          clearTimeout(this._deviceBannerTimer); this._deviceBannerTimer = undefined;
          this.deviceBanner = 'failed';
          this.deviceBannerDetail = [e instanceof Error ? e.message : String(e)];
        });
      });
    });
  }

  /** Banner › Retry: ask the engine for a device again (or, when the device is fine, rebuild the Shell). */
  retryDevice(): void {
    const sm = this.sm;
    if (!sm || typeof sm.recoverDevice !== 'function') { window.location.reload(); return; }
    this.deviceBanner = 'recovering';
    this.deviceBannerDetail = [];
    void sm.recoverDevice().then((ok: boolean) => {
      // No status event comes when the device was not lost (only the Shell rebuild had failed): rebuild it here.
      if (ok && this.deviceBanner === 'recovering') this.ngZone.run(() => this._onDeviceStatus({ status: 'ok' }));
    });
  }

  deviceBannerReload(): void { window.location.reload(); }
  deviceBannerDismiss(): void {
    clearTimeout(this._deviceBannerTimer); this._deviceBannerTimer = undefined;
    this.deviceBanner = null; this.deviceBannerDetail = [];
  }
}
