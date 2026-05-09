import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import ShapeManager from '@zaings/salsa/shape-manager';

// ── Types ────────────────────────────────────────────────────

export type LoopMode = 'none' | 'loop' | 'ping-pong';

export interface OnionSkinConfig {
  enabled: boolean;
  framesBefore: number;
  framesAfter: number;
  opacity: number;
  tintBefore: [number, number, number];
  tintAfter: [number, number, number];
}

export interface AnimationEvent {
  type:
    | 'frame-changed'
    | 'playback-state-changed'
    | 'timeline-changed'
    | 'cel-added'
    | 'cel-removed'
    | 'layer-type-changed'
    | 'onion-skin-changed';
  frame?: number;
  layerId?: string;
  celId?: string;
}

export type CelType = 'key' | 'inbetween';

export interface CelInfo {
  id: string;
  frame: number;
  duration: number;
  isKey: boolean;
  celType?: CelType;
}

export interface FloodFillOptions {
  tolerance?: number;       // 0-255
  gapClosing?: number;      // 0-5
  contiguous?: boolean;
  referenceLayerId?: string;
}

export interface TimelineLayerInfo {
  id: string;
  name: string;
  animated: boolean;
  cels: CelInfo[];
}

// ── Service ──────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class RasterAnimationService {

  // ── Observable state ────────────────────────────────────────

  private _animationEnabled$ = new BehaviorSubject<boolean>(false);
  animationEnabled$: Observable<boolean> = this._animationEnabled$.asObservable();

  private _currentFrame$ = new BehaviorSubject<number>(1);
  currentFrame$: Observable<number> = this._currentFrame$.asObservable();

  private _frameCount$ = new BehaviorSubject<number>(24);
  frameCount$: Observable<number> = this._frameCount$.asObservable();

  private _fps$ = new BehaviorSubject<number>(12);
  fps$: Observable<number> = this._fps$.asObservable();

  private _isPlaying$ = new BehaviorSubject<boolean>(false);
  isPlaying$: Observable<boolean> = this._isPlaying$.asObservable();

  private _loopMode$ = new BehaviorSubject<LoopMode>('loop');
  loopMode$: Observable<LoopMode> = this._loopMode$.asObservable();

  private _onionSkin$ = new BehaviorSubject<OnionSkinConfig>({
    enabled: false,
    framesBefore: 2,
    framesAfter: 1,
    opacity: 0.3,
    tintBefore: [1.0, 0.2, 0.2],
    tintAfter: [0.2, 0.5, 1.0],
  });
  onionSkin$: Observable<OnionSkinConfig> = this._onionSkin$.asObservable();

  private _timelineLayers$ = new BehaviorSubject<TimelineLayerInfo[]>([]);
  timelineLayers$: Observable<TimelineLayerInfo[]> = this._timelineLayers$.asObservable();

  private _playRangeStart$ = new BehaviorSubject<number>(1);
  playRangeStart$: Observable<number> = this._playRangeStart$.asObservable();

  private _playRangeEnd$ = new BehaviorSubject<number>(24);
  playRangeEnd$: Observable<number> = this._playRangeEnd$.asObservable();

  private _unsubscribeEvent: (() => void) | null = null;
  private _suppressRefresh = false;

  /** Suppress refreshTimeline reactions to Salsa events. Call beginBulkRestore() before
   *  loadDocument() and endBulkRestore() after — events fired during restore are batched
   *  into a single refreshTimeline() call on end. */
  beginBulkRestore(): void { this._suppressRefresh = true; }
  /** Re-enable refreshTimeline reactions. The caller is responsible for calling
   *  refreshTimeline() (or refreshRasterLayers()) once after this returns. */
  endBulkRestore(): void { this._suppressRefresh = false; }

  private get sm(): ShapeManager | null {
    return ShapeManager.getInstance?.() ?? null;
  }

  constructor(private zone: NgZone) {}

  // ── Animation mode ──────────────────────────────────────────

  setAnimationEnabled(enabled: boolean): void {
    this.sm?.setAnimationEnabled?.(enabled);
    this._animationEnabled$.next(enabled);
    if (enabled) {
      this._subscribeEvents();
      this.refreshTimeline();
    } else {
      this._unsubscribeEvents();
    }
  }

  isAnimationEnabled(): boolean {
    return this._animationEnabled$.value;
  }

  // ── Frame navigation ────────────────────────────────────────

  setCurrentFrame(frame: number): void {
    this.sm?.setCurrentFrame?.(frame);
    this._currentFrame$.next(frame);
  }

  getCurrentFrame(): number {
    return this.sm?.getCurrentFrame?.() ?? this._currentFrame$.value;
  }

  nextFrame(): void {
    this.sm?.nextFrame?.();
    this._currentFrame$.next(this.getCurrentFrame());
  }

  prevFrame(): void {
    this.sm?.prevFrame?.();
    this._currentFrame$.next(this.getCurrentFrame());
  }

  // ── Playback ────────────────────────────────────────────────

  togglePlayPause(): void {
    this.sm?.togglePlayPause?.();
    this._isPlaying$.next(!this._isPlaying$.value);
  }

  stopPlayback(): void {
    this.sm?.stopPlayback?.();
    this._isPlaying$.next(false);
    this._currentFrame$.next(1);
  }

  // ── FPS & frame count ───────────────────────────────────────

  setFps(fps: number): void {
    this.sm?.setFps?.(fps);
    this._fps$.next(fps);
  }

  setFrameCount(count: number): void {
    this.sm?.setFrameCount?.(count);
    this._frameCount$.next(count);
    if (this._playRangeEnd$.value > count) {
      this._playRangeEnd$.next(count);
    }
  }

  addFrames(count: number): void {
    this.sm?.addFrames?.(count);
    const newTotal = (this.sm?.getFrameCount?.() as number) ?? this._frameCount$.value + count;
    this._frameCount$.next(newTotal);
  }

  setLoopMode(mode: LoopMode): void {
    this.sm?.setLoopMode?.(mode);
    this._loopMode$.next(mode);
  }

  setPlayRange(start: number, end: number): void {
    this._playRangeStart$.next(start);
    this._playRangeEnd$.next(end);
    (this.sm as any)?.setPlayRange?.(start, end);
  }

  // ── Onion skin ──────────────────────────────────────────────

  setOnionSkin(config: OnionSkinConfig): void {
    this.sm?.setOnionSkin?.(config);
    this._onionSkin$.next({ ...config });
  }

  getOnionSkin(): OnionSkinConfig {
    return this._onionSkin$.value;
  }

  // ── Layer animation toggle ──────────────────────────────────

  /**
   * Mark a layer as animated or static.
   * Correct call order: setAnimationEnabled(true) must be called first,
   * then setLayerAnimated(layerId, true), then addCelAtFrame.
   */
  setLayerAnimated(layerId: string, animated: boolean): void {
    console.log(`[AnimService] setLayerAnimated(${layerId}, ${animated})`);
    // Ensure animation system is enabled before marking a layer animated
    if (animated && !this._animationEnabled$.value) {
      console.log('[AnimService] animation not enabled yet, calling setAnimationEnabled(true)');
      this.setAnimationEnabled(true);
    }
    const sm = this.sm;
    console.log('[AnimService] sm exists:', !!sm);
    console.log('[AnimService] sm.setLayerAnimated exists:', typeof sm?.setLayerAnimated);
    sm?.setLayerAnimated?.(layerId, animated);
    console.log('[AnimService] after setLayerAnimated, isLayerAnimated:', sm?.isLayerAnimated?.(layerId));
    this.refreshTimeline();
  }

  isLayerAnimated(layerId: string): boolean {
    return this.sm?.isLayerAnimated?.(layerId) ?? false;
  }

  // ── Cel management ──────────────────────────────────────────

  addCelAtCurrentFrame(layerId: string): string | null {
    const frame = this._currentFrame$.value;
    return this.addCelAtFrame(layerId, frame);
  }

  /**
   * Add a cel at a specific frame. The layer MUST already be animated
   * (via setLayerAnimated) or the engine will reject the call.
   */
  addCelAtFrame(layerId: string, frame: number): string | null {
    console.log(`[AnimService] addCelAtFrame(${layerId}, ${frame})`);
    console.log('[AnimService] animationEnabled:', this._animationEnabled$.value);
    // Guard: ensure animation is enabled and layer is animated
    if (!this._animationEnabled$.value) {
      console.warn('[AnimService] addCelAtFrame: animation not enabled, enabling now');
      this.setAnimationEnabled(true);
    }
    const isAnim = this.isLayerAnimated(layerId);
    console.log(`[AnimService] isLayerAnimated(${layerId}):`, isAnim);
    if (!isAnim) {
      console.warn(`[AnimService] addCelAtFrame: layer ${layerId} not animated, marking animated now`);
      this.sm?.setLayerAnimated?.(layerId, true);
      console.log('[AnimService] after force setLayerAnimated, isLayerAnimated:', this.sm?.isLayerAnimated?.(layerId));
    }
    const sm = this.sm;
    console.log('[AnimService] sm.addCelAtFrame exists:', typeof (sm as any)?.addCelAtFrame);
    const celId = sm?.addCelAtFrame?.(layerId, frame) ?? null;
    console.log(`[AnimService] addCelAtFrame returned:`, celId);
    if (!celId) {
      console.warn(`[AnimService] addCelAtFrame returned null for layer=${layerId} frame=${frame}`);
      // Extra diagnostics
      console.log('[AnimService] getRasterLayers:', JSON.stringify(sm?.getRasterLayers?.()?.map((l: any) => ({ id: l.id, name: l.name }))));
      console.log('[AnimService] getCels:', JSON.stringify((sm as any)?.getCels?.(layerId)));
    }
    this.refreshTimeline();
    return celId;
  }

  deleteCel(layerId: string, celId: string): void {
    this.sm?.deleteCel?.(layerId, celId);
    this.refreshTimeline();
  }

  insertFrame(at: number): void {
    this.sm?.insertFrame?.(at);
    // Frame count is updated by the 'timeline-changed' event from the engine.
    // Read the engine's ground truth to keep in sync regardless of event timing.
    const engineCount = (this.sm?.getFrameCount?.() as number);
    if (engineCount != null) this._frameCount$.next(engineCount);
    this.refreshTimeline();
  }

  deleteFrame(at: number): void {
    this.sm?.deleteFrame?.(at);
    // Frame count is updated by the 'timeline-changed' event from the engine.
    // Read the engine's ground truth to keep in sync regardless of event timing.
    const engineCount = (this.sm?.getFrameCount?.() as number);
    if (engineCount != null) this._frameCount$.next(engineCount);
    this.refreshTimeline();
  }

  // ── Cel operations (duplicate / move / swap / type / duration) ──

  duplicateCel(layerId: string, celId: string, targetFrame: number): string | null {
    const newCelId = (this.sm as any)?.duplicateCel?.(layerId, celId, targetFrame) ?? null;
    this.refreshTimeline();
    return newCelId;
  }

  moveCel(layerId: string, celId: string, targetFrame: number): void {
    (this.sm as any)?.moveCel?.(layerId, celId, targetFrame);
    this.refreshTimeline();
  }

  swapCels(layerId: string, celIdA: string, celIdB: string): void {
    (this.sm as any)?.swapCels?.(layerId, celIdA, celIdB);
    this.refreshTimeline();
  }

  setCelDuration(layerId: string, celId: string, duration: number): void {
    (this.sm as any)?.setCelDuration?.(layerId, celId, duration);
    this.refreshTimeline();
  }

  setCelType(layerId: string, celId: string, celType: CelType): void {
    console.log(`[AnimService] setCelType(${layerId}, ${celId}, ${celType})`);
    console.log('[AnimService] sm.setCelType exists:', typeof (this.sm as any)?.setCelType);
    (this.sm as any)?.setCelType?.(layerId, celId, celType);
    this.refreshTimeline();
  }

  getCels(layerId: string): CelInfo[] {
    return (this.sm as any)?.getCels?.(layerId) ?? [];
  }

  // ── Flood fill ──────────────────────────────────────────────

  async floodFill(x: number, y: number, color: string, options?: FloodFillOptions): Promise<boolean> {
    return await (this.sm as any)?.floodFill?.(x, y, color, options) ?? false;
  }

  async fillSelection(color: string): Promise<void> {
    await (this.sm as any)?.fillSelection?.(color);
  }

  // ── Timeline data ───────────────────────────────────────────

  /**
   * Read timeline state directly from the Salsa engine.
   * Uses getCels() — returns full cel metadata with GPU-backed textures.
   *
   * Engine returns: { id, startFrame, duration, celType }
   * Our CelInfo:    { id, frame, duration, isKey, celType }
   */
  refreshTimeline(): void {
    if (this._suppressRefresh) return;
    const sm = this.sm;
    if (!sm) { console.warn('[AnimService] refreshTimeline: no ShapeManager instance'); return; }
    const layers: any[] = (sm.getRasterLayers?.() ?? []).filter(
      (l: any) => l.type !== '3d-scene' && l.type !== '3d-mesh' && l.type !== '3DMesh' && l.name !== 'Mesh3D'
    );
    console.log(`[AnimService] refreshTimeline: ${layers.length} layers`);
    const timelineLayers: TimelineLayerInfo[] = layers.map((l: any) => {
      const animated = sm.isLayerAnimated?.(l.id) ?? false;
      const rawCels: any[] = (sm as any).getCels?.(l.id) ?? [];
      // Map engine shape → our CelInfo interface
      const cels: CelInfo[] = rawCels.map((c: any) => ({
        id: c.id,
        frame: c.startFrame ?? c.frame ?? 1,    // engine uses startFrame
        duration: c.duration ?? 1,
        isKey: c.celType === 'key' || c.isKey === true,
        celType: c.celType ?? (c.isKey ? 'key' : 'inbetween'),
      }));
      console.log(`[AnimService]   layer ${l.id} (${l.name}): animated=${animated}, cels=${cels.length}`, JSON.stringify(cels));
      return {
        id: l.id,
        name: l.name ?? 'Layer',
        animated,
        cels,
      };
    });
    this._timelineLayers$.next(timelineLayers);
  }

  // ── Event subscription ──────────────────────────────────────

  private _subscribeEvents(): void {
    this._unsubscribeEvents();
    const sm = this.sm;
    if (!sm?.onAnimationEvent) return;
    this._unsubscribeEvent = sm.onAnimationEvent((event: AnimationEvent) => {
      this.zone.run(() => {
        switch (event.type) {
          case 'frame-changed':
            this._currentFrame$.next(event.frame ?? 1);
            break;
          case 'playback-state-changed':
            this._isPlaying$.next((sm as any).isPlaying?.() ?? false);
            break;
          case 'timeline-changed':
            this._frameCount$.next(sm.getFrameCount?.() ?? 24);
            this.refreshTimeline();
            break;
          case 'cel-added':
          case 'cel-removed':
          case 'layer-type-changed':
            this.refreshTimeline();
            break;
          case 'onion-skin-changed':
            const cfg = sm.getOnionSkin?.();
            if (cfg) this._onionSkin$.next(cfg);
            break;
        }
      });
    });
  }

  private _unsubscribeEvents(): void {
    if (this._unsubscribeEvent) {
      this._unsubscribeEvent();
      this._unsubscribeEvent = null;
    }
  }
}
