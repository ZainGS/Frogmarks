import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import ShapeManager from '@zaings/salsa/shape-manager';

// ── Types ──────────────────────────────────────────────────────

export type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error' | 'unavailable';

export interface AutoSaveInterval {
  label: string;
  value: number;      // ms, 0 = manual only
  tooltip: string;
}

export const AUTO_SAVE_INTERVALS: AutoSaveInterval[] = [
  { label: 'Frequent (15s)', value: 15_000, tooltip: 'Save every 15 seconds. Safest, but may cause brief pauses on large documents.' },
  { label: 'Normal (30s)',   value: 30_000, tooltip: 'Save every 30 seconds. Good balance of safety and performance.' },
  { label: 'Relaxed (60s)',  value: 60_000, tooltip: 'Save every minute. Less frequent saves, fewer interruptions.' },
  { label: 'Manual only',    value: 0,      tooltip: 'Only save when you press Ctrl+S. Not recommended — you may lose work.' },
];

export interface DocumentInfo {
  docId: string;
  name: string;
  savedAt: number;   // epoch ms
  canvasWidth: number;
  canvasHeight: number;
  layerCount: number;
}

// ── Service ────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class RasterAutoSaveService {

  // ── Observable state ────────────────────────────────────────
  private _state$ = new BehaviorSubject<AutoSaveState>('idle');
  private _docName$ = new BehaviorSubject<string>('Untitled');
  private _available$ = new BehaviorSubject<boolean>(false);
  private _lastSaved$ = new BehaviorSubject<number>(0);

  readonly state$: Observable<AutoSaveState> = this._state$.asObservable();
  readonly docName$: Observable<string> = this._docName$.asObservable();
  readonly available$: Observable<boolean> = this._available$.asObservable();
  readonly lastSaved$: Observable<number> = this._lastSaved$.asObservable();

  get state(): AutoSaveState { return this._state$.value; }
  get docName(): string { return this._docName$.value; }
  get isAvailable(): boolean { return this._available$.value; }

  // ── Internal state ──────────────────────────────────────────
  private _docId = '';
  private _intervalMs = 30_000;
  private _strokeDebounceMs = 5_000;
  private _intervalTimer: ReturnType<typeof setInterval> | null = null;
  private _strokeTimer: ReturnType<typeof setTimeout> | null = null;
  private _enabled = false;
  private _saveCheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private ngZone: NgZone) {
    this._checkAvailability();
  }

  // ── ShapeManager access ─────────────────────────────────────
  private get sm(): any | null {
    return ShapeManager?.getInstance?.() ?? null;
  }

  // ── Availability ────────────────────────────────────────────

  private async _checkAvailability(): Promise<void> {
    try {
      const available = this.sm?.isAutoSaveAvailable?.() ?? false;
      if (available) {
        this._available$.next(true);
        return;
      }
      // Fallback: check OPFS support directly
      if (typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in (navigator.storage || {})) {
        this._available$.next(true);
      } else {
        this._available$.next(false);
        this._state$.next('unavailable');
      }
    } catch {
      this._available$.next(false);
      this._state$.next('unavailable');
    }
  }

  // ── Enable / Disable ───────────────────────────────────────

  enable(docId: string, name: string, options?: { intervalMs?: number; strokeDebounceMs?: number }): void {
    this._docId = docId;
    this._docName$.next(name);
    this._intervalMs = options?.intervalMs ?? 30_000;
    this._strokeDebounceMs = options?.strokeDebounceMs ?? 5_000;
    this._enabled = true;

    // Wire Salsa engine auto-save if available
    this.sm?.enableAutoSave?.(docId, name, {
      intervalMs: this._intervalMs,
      strokeDebounceMs: this._strokeDebounceMs,
      pixelFormat: 'raw',
    });

    // Subscribe to Salsa save events for UI indicator
    this.sm?.onSaveEvent?.(
      () => this.ngZone.run(() => this._state$.next('saving')),
      (success: boolean) => this.ngZone.run(() => {
        if (success) {
          this._state$.next('saved');
          this._lastSaved$.next(Date.now());
          // Fade back to idle after 3s
          this._clearSaveCheck();
          this._saveCheckTimer = setTimeout(() => this._state$.next('idle'), 3000);
        } else {
          this._state$.next('error');
        }
      }),
    );

    // Fallback periodic timer if engine doesn't handle it
    this._startFallbackTimer();

    if (this._state$.value === 'unavailable') {
      // Re-check
      this._checkAvailability();
    }
    if (this._state$.value !== 'unavailable') {
      this._state$.next('idle');
    }
  }

  disable(): void {
    this._enabled = false;
    this.sm?.disableAutoSave?.();
    this._stopFallbackTimer();
    this._clearSaveCheck();
  }

  // ── Manual save (Ctrl+S) ──────────────────────────────────

  async saveNow(): Promise<boolean> {
    if (!this._docId) return false;
    this._state$.next('saving');
    try {
      const success = await this.sm?.saveDocument?.() ?? false;
      if (success) {
        this._state$.next('saved');
        this._lastSaved$.next(Date.now());
        this._clearSaveCheck();
        this._saveCheckTimer = setTimeout(() => this._state$.next('idle'), 3000);
      } else {
        this._state$.next('error');
      }
      return success;
    } catch {
      this._state$.next('error');
      return false;
    }
  }

  // ── Document management ────────────────────────────────────

  async loadDocument(docId: string): Promise<{ success: boolean; layers: any[] }> {
    const result = await this.sm?.loadDocument?.(docId);
    // Handle both old (boolean) and new ({ success, layers }) return shapes
    if (result && typeof result === 'object' && 'success' in result) {
      return result as { success: boolean; layers: any[] };
    }
    return { success: !!result, layers: [] };
  }

  async listDocuments(): Promise<DocumentInfo[]> {
    return await this.sm?.listSavedDocuments?.() ?? [];
  }

  async deleteDocument(docId: string): Promise<void> {
    await this.sm?.deleteSavedDocument?.(docId);
  }

  setDocumentName(name: string): void {
    this._docName$.next(name);
    this.sm?.setDocumentName?.(name);
  }

  getDocumentName(): string {
    return this.sm?.getDocumentName?.() ?? this._docName$.value;
  }

  // ── Stroke notification ────────────────────────────────────

  notifyStrokeEnd(): void {
    if (!this._enabled) return;
    this.sm?.notifyStrokeEnd?.();

    // Fallback debounced save
    if (this._strokeTimer) clearTimeout(this._strokeTimer);
    this._strokeTimer = setTimeout(() => {
      if (this._enabled) this.saveNow();
    }, this._strokeDebounceMs);
  }

  // ── Interval setting ───────────────────────────────────────

  setInterval(ms: number): void {
    this._intervalMs = ms;
    this._stopFallbackTimer();
    if (ms > 0 && this._enabled) {
      this._startFallbackTimer();
    }
  }

  // ── Private helpers ────────────────────────────────────────

  private _startFallbackTimer(): void {
    this._stopFallbackTimer();
    if (this._intervalMs <= 0) return;
    this.ngZone.runOutsideAngular(() => {
      this._intervalTimer = setInterval(() => {
        if (this._enabled) {
          this.ngZone.run(() => this.saveNow());
        }
      }, this._intervalMs);
    });
  }

  private _stopFallbackTimer(): void {
    if (this._intervalTimer) {
      clearInterval(this._intervalTimer);
      this._intervalTimer = null;
    }
  }

  private _clearSaveCheck(): void {
    if (this._saveCheckTimer) {
      clearTimeout(this._saveCheckTimer);
      this._saveCheckTimer = null;
    }
  }
}
