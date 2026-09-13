import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import ShapeManager from '@zaings/salsa/shape-manager';
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering } from '@zaings/salsa';
import { PlayerCartService } from '../shared/services/player-cart.service';

@Component({
  selector: 'app-player',
  standalone: false,
  templateUrl: './player.component.html',
  styleUrl: './player.component.scss',
})
export class PlayerComponent implements OnInit, OnDestroy {

  private _sm: any = null;
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

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly ngZone: NgZone,
    private readonly playerCartService: PlayerCartService,
  ) {}

  ngOnInit(): void {
    const pending = this.playerCartService.pendingCart;
    this.playerCartService.pendingCart = null;
    if (pending) this._loadCart(pending);
  }

  ngOnDestroy(): void {
    this._stopTick();
    this._sm?.exitUIPlayerMode?.();
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
    if (file) this._loadCart(file);
  }

  onFileInput(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this._loadCart(file);
  }

  // ── Load ─────────────────────────────────────────────────────

  private async _loadCart(blob: Blob): Promise<void> {
    this.isLoading = true;
    this.errorMsg  = '';
    try {
      if (!isRendererLive) {
        await startWebGPURendering('playerCanvas');
      } else {
        await reinitializeWebGPURendering('playerCanvas');
      }
      this._sm = ShapeManager.getInstance();
      await this._sm.whenWebGPUReady?.();

      const result = await this._sm.importFrogcart?.(blob);
      if (!result) throw new Error('importFrogcart returned null');

      this.cartTitle  = result.manifest?.title  ?? '';
      this.cartAuthor = result.manifest?.author  ?? '';

      // Deep-link: ?state= overrides the cart's configured initial state
      const deepState = this.route.snapshot.queryParamMap.get('state') ?? undefined;
      const initialState = deepState ?? result.config?.initialState ?? undefined;

      this._sm.enterUIPlayerMode?.(initialState);
      this._wireBridge();

      this.isLoaded = true;
      this._startTick();

      // Notify any embedding page that the player is ready
      this._postToParent({ type: 'ready', title: this.cartTitle, author: this.cartAuthor });
    } catch (e: any) {
      console.error('[Player] load failed', e);
      this.errorMsg = e?.message ?? 'Failed to load .frogcart';
    }
    this.isLoading = false;
  }

  // ── postMessage bridge ───────────────────────────────────────

  /** Forward engine UI events to the embedding page. */
  private _wireBridge(): void {
    // Outbound: engine events → parent window
    this._sm?.onUIEvent?.((event: { name: string; payload?: any }) => {
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
      case 'goToState':
        sm.goToUIState?.(data.stateId);
        break;
      case 'setVariable':
        sm.setUIVariable?.(data.name, data.value);
        break;
      case 'playSound':
        sm.playUISound?.(data.soundId);
        break;
    }
  }

  // ── Tick ─────────────────────────────────────────────────────

  private _startTick(): void {
    this._lastT = performance.now();
    this.ngZone.runOutsideAngular(() => {
      const loop = (now: number) => {
        this._sm?.tickUI?.(now - this._lastT);
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
    this.router.navigate(['/']);
  }
}
