import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import ShapeManager from '@zaings/salsa/shape-manager';
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering } from '@zaings/salsa';
import { PlayerCartService } from '../shared/services/player-cart.service';
import { resetEngineTo2DView } from '../shared/utilities/engine-view-reset';

/** From the Shell the screen is already black: a cart that loads within this long shows no spinner at all. */
export const SPINNER_DELAY_MS = 400;

@Component({
  selector: 'app-player',
  standalone: false,
  templateUrl: './player.component.html',
  styleUrl: './player.component.scss',
})
export class PlayerComponent implements OnInit, OnDestroy {

  private _sm: ShapeManager = null;
  private _rafId: number | null = null;
  private _lastT = 0;
  private _dragCounter = 0;
  private _msgListener: ((e: MessageEvent) => void) | null = null;

  isLoading = false;
  isLoaded  = false;
  cartTitle  = '';
  cartAuthor = '';
  isDragOver = false;
  errorMsg   = '';
  /** The cart came from the Shell's launch animation (the screen is already black): the spinner waits
   *  SPINNER_DELAY_MS (a quick load shows none) and the cart fades in from black. */
  fromShell = false;
  /** The loading spinner may show (at once for a dropped / picked file; after SPINNER_DELAY_MS from the Shell). */
  spinnerVisible = true;
  private _spinnerTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly ngZone: NgZone,
    private readonly playerCartService: PlayerCartService,
  ) {}

  ngOnInit(): void {
    const { cart, fromShell } = this.playerCartService.take();
    this.fromShell = fromShell;
    if (cart) void this._loadCart(cart);
  }

  ngOnDestroy(): void {
    clearTimeout(this._spinnerTimer);
    this._stopTick();
    this._sm?.exitUIPlayerMode();
    if (this._msgListener) {
      window.removeEventListener('message', this._msgListener);
      this._msgListener = null;
    }
  }

  // ── Drop zone ────────────────────────────────────────────────

  onDragEnter(e: DragEvent): void {
    e.preventDefault();
    this._dragCounter++;
    this.isDragOver = true;
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  onDragLeave(_e: DragEvent): void {
    this._dragCounter--;
    if (this._dragCounter <= 0) { this._dragCounter = 0; this.isDragOver = false; }
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this._dragCounter = 0;
    this.isDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) void this._loadCart(file);
  }

  onFileInput(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void this._loadCart(file);
  }

  // ── Load ─────────────────────────────────────────────────────

  private async _loadCart(blob: Blob): Promise<void> {
    this.isLoading = true;
    this.errorMsg  = '';
    clearTimeout(this._spinnerTimer);
    this.spinnerVisible = !this.fromShell;
    if (this.fromShell) this._spinnerTimer = setTimeout(() => { this.spinnerVisible = true; }, SPINNER_DELAY_MS);
    try {
      // Engine boot / load / mode entry run OUTSIDE Angular's zone (H8, zone audit): the timers and listeners they start
      // must not run app change detection. The awaits resume in the zone, so the state below is still bound normally.
      if (!isRendererLive) {
        await this.ngZone.runOutsideAngular(() => startWebGPURendering('playerCanvas'));
      } else {
        await this.ngZone.runOutsideAngular(() => reinitializeWebGPURendering('playerCanvas'));
      }
      this._sm = ShapeManager.getInstance();
      await this._sm.whenWebGPUReady();
      // mobile-parity 7.3c: the engine outlives every route — the previous screen's 3D view / Play / edit mode must not
      // stay on under the cart (the cart's own document restores its view state).
      this.ngZone.runOutsideAngular(() => resetEngineTo2DView(this._sm));

      const result = await this.ngZone.runOutsideAngular(() => this._sm.importFrogcart(blob));
      if (!result) throw new Error("it isn't a valid .frogcart file");

      this.cartTitle  = result.manifest?.title  ?? '';
      this.cartAuthor = result.manifest?.author  ?? '';

      // Deep-link: ?state= overrides the cart's configured initial state
      const deepState = this.route.snapshot.queryParamMap.get('state') ?? undefined;
      // (was result.config — never existed, so the cart's configured initial state was always ignored)
      const initialState = deepState ?? result.playerConfig?.initialState ?? undefined;

      this.ngZone.runOutsideAngular(() => this._sm.enterUIPlayerMode(initialState));
      this._wireBridge();

      this.isLoaded = true;
      this._startTick();

      // Notify any embedding page that the player is ready
      this._postToParent({ type: 'ready', title: this.cartTitle, author: this.cartAuthor });
    } catch (e: any) {
      console.error('[Player] load failed', e);
      this.errorMsg = e?.message || "it couldn't be loaded";
    }
    clearTimeout(this._spinnerTimer);
    this.isLoading = false;
  }

  // ── postMessage bridge ───────────────────────────────────────

  /** Forward engine UI events to the embedding page. */
  private _wireBridge(): void {
    // Outbound: engine events → parent window
    this._sm?.onUIEvent((event) => {
      this._postToParent({ type: 'uiEvent', event });
    });

    // Inbound: parent window → engine commands
    this._msgListener = (e: MessageEvent) => {
      if (!e.data || e.data.source !== 'frogmarks-host') return;
      this.ngZone.run(() => this._handleCommand(e.data));
    };
    window.addEventListener('message', this._msgListener);
  }

  private _postToParent(payload: object): void {
    try {
      window.parent.postMessage({ source: 'frogmarks-player', ...payload }, '*');
    } catch { /* cross-origin postMessage may throw in sandboxed iframes */ }
  }

  private _handleCommand(data: any): void {
    const sm = this._sm;
    if (!sm) return;
    switch (data.type) {
      // The engine keys states/variables by UI layer; the host may name one, else use the active layer.
      // (Previously the layer argument was missing, so both commands silently did nothing.)
      case 'goToState': {
        const layerId = data.layerId ?? sm.activeUILayerId;
        if (layerId) sm.goToUIState(layerId, data.stateId);
        break;
      }
      case 'setVariable': {
        const layerId = data.layerId ?? sm.activeUILayerId;
        if (layerId) sm.setUIVariable(layerId, data.name, data.value);
        break;
      }
      case 'playSound':
        sm.playUISound(data.soundId);
        break;
    }
  }

  // ── Tick ─────────────────────────────────────────────────────

  private _startTick(): void {
    this._lastT = performance.now();
    this.ngZone.runOutsideAngular(() => {
      const loop = (now: number) => {
        this._sm?.tickUI(now - this._lastT);
        this._lastT = now;
        this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
    });
  }

  private _stopTick(): void {
    if (this._rafId != null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  // ── Nav ──────────────────────────────────────────────────────

  goHome(): void {
    // The Shell fades in from this black (StudioComponent takes the flag).
    this.playerCartService.returningToShell = true;
    void this.router.navigate(['/']);
  }
}
