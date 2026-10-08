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
  savedAt: string | number;   // engine returns an ISO string; older callers used epoch ms
  canvasWidth: number;
  canvasHeight: number;
  layerCount: number;
}

/** ShapeManager.saveDocument with the incremental option (Salsa 2026-10-09; typed here — Frogmarks types Salsa from its
 *  built dist, and an older dist's saveDocument takes no argument and simply ignores it). */
type SaveDocumentApi = { saveDocument(opts?: { incremental?: boolean }): Promise<boolean> };

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
  /** The engine runs the timed + stroke-debounced autosave itself (enableAutoSave) — then the fallbacks below stay
   *  off. They called saveNow(), an EXPLICIT save: every layer and cel read back from the GPU and PNG-encoded with
   *  no dirty check, not waiting for Play mode / timeline playback — a second full save on every tick and after
   *  every stroke, on top of the engine's own. */
  private _engineAutoSave = false;

  constructor(private ngZone: NgZone) {
    void this._checkAvailability();
  }

  // ── ShapeManager access ─────────────────────────────────────
  private get sm(): ShapeManager | null {
    return ShapeManager?.getInstance?.() ?? null;
  }

  // ── Availability ────────────────────────────────────────────

  private async _checkAvailability(): Promise<void> {
    // Available after all (the first check runs at construction, before the engine exists, and can fail there):
    // clear a stale 'unavailable' — enable()'s re-check never did, so the top bar said "Not saved" for good.
    const markAvailable = () => {
      this._available$.next(true);
      if (this._state$.value === 'unavailable') this._state$.next('idle');
    };
    try {
      const available = this.sm?.isAutoSaveAvailable() ?? false;
      if (available) {
        markAvailable();
        return;
      }
      // Fallback: check OPFS support directly
      if (typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in (navigator.storage || {})) {
        markAvailable();
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
    const sm = this.sm;
    this._engineAutoSave = typeof sm?.enableAutoSave === 'function';
    // M7: OUTSIDE the zone — the engine's save interval / stroke debounce / playback defer-poll timers would otherwise
    // each run an app change detection. The save events below re-enter for the indicator.
    this.ngZone.runOutsideAngular(() => sm?.enableAutoSave(docId, name, {
      intervalMs: this._intervalMs,
      strokeDebounceMs: this._strokeDebounceMs,
      pixelFormat: 'png',
    }));

    // Subscribe to Salsa save events for UI indicator
    this.sm?.onSaveEvent(
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

    // Fallback periodic timer if engine doesn't handle it (no-op when it does)
    this._startFallbackTimer();

    if (this._state$.value === 'unavailable') {
      // Re-check
      void this._checkAvailability();
    }
    if (this._state$.value !== 'unavailable') {
      this._state$.next('idle');
    }
  }

  /** Stop saving the current document. Called when the editor leaves it (after its pending change was saved): the
   *  document id is dropped too, so neither a stroke debounce nor an explicit saveNow() can write into it while
   *  the next document loads. enable() binds the next one. */
  disable(): void {
    this._enabled = false;
    this._engineAutoSave = false;
    this._docId = '';
    this.sm?.disableAutoSave();
    this._stopFallbackTimer();
    if (this._strokeTimer) { clearTimeout(this._strokeTimer); this._strokeTimer = null; }
    this._clearSaveCheck();
  }

  /** The document saves go to ('' when none is bound). */
  get docId(): string { return this._docId; }

  // ── Manual save (Ctrl+S) ──────────────────────────────────

  /** @param opts.incremental write only what changed since the document was last saved / loaded (perf audit 2026-10-09
   *  B5: leaving a document, Ctrl+S) — Salsa reads back + encodes only the changed layers / cels. An older Salsa dist
   *  ignores the option and saves everything (as before). Without it: a full save. */
  async saveNow(opts?: { incremental?: boolean }): Promise<boolean> {
    if (!this._docId) return false;
    this._state$.next('saving');
    try {
      const sm = this.sm as unknown as SaveDocumentApi | null;
      const success = await (opts?.incremental ? sm?.saveDocument({ incremental: true }) : sm?.saveDocument()) ?? false;
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
    // H3 (zone audit item 3): the engine load runs OUTSIDE the zone. It restores the whole document — a city's build,
    // stream pump, tile workers, traffic / day-cycle tickers start in it — and every timer / worker message it started
    // in the zone ran an app change detection. The await resumes in the CALLER's zone (the CLI downlevels async/await
    // to zone-aware promises; a continuation runs in the zone its await was in), so the callers' post-load work —
    // the editor's layers, title, loader; the package editor's state — stays in the zone and change-detected.
    const result = await this.ngZone.runOutsideAngular(() => this.sm?.loadDocument(docId));
    // Handle both old (boolean) and new ({ success, layers }) return shapes
    if (result && typeof result === 'object' && 'success' in result) {
      return result as { success: boolean; layers: any[] };
    }
    return { success: !!result, layers: [] };
  }

  async listDocuments(): Promise<DocumentInfo[]> {
    return await this.sm?.listSavedDocuments() ?? [];
  }

  async deleteDocument(docId: string): Promise<void> {
    await this.sm?.deleteSavedDocument(docId);
  }

  setDocumentName(name: string): void {
    this._docName$.next(name);
    this.sm?.setDocumentName(name);
  }

  getDocumentName(): string {
    return this.sm?.getDocumentName() ?? this._docName$.value;
  }

  // ── Stroke notification ────────────────────────────────────

  notifyStrokeEnd(): void {
    if (!this._enabled) return;
    this.sm?.notifyStrokeEnd();
    if (this._engineAutoSave) return;   // the engine debounces its own save

    // Fallback debounced save
    if (this._strokeTimer) clearTimeout(this._strokeTimer);
    this._strokeTimer = setTimeout(() => {
      if (this._enabled) void this.saveNow();
    }, this._strokeDebounceMs);
  }

  /** The document changed (not a raster stroke): Salsa schedules its debounced incremental save (sm.notifyDocumentChanged,
   *  Salsa 2026-10-09 — it also does so on every scene-graph change by itself). Outside the zone like the engine's
   *  other autosave timers (M7). No-op while no document is bound, or on an older dist. */
  notifyDocumentChanged(): void {
    if (!this._enabled) return;
    const sm = this.sm as unknown as { notifyDocumentChanged?: () => void } | null;
    const notify = sm?.notifyDocumentChanged;
    if (typeof notify !== 'function') return;
    this.ngZone.runOutsideAngular(() => notify.call(sm));
  }

  // ── Interval setting ───────────────────────────────────────

  setInterval(ms: number): void {
    this._intervalMs = ms;
    if (this._engineAutoSave) this.sm?.setAutoSaveConfig({ intervalMs: ms });   // the engine owns the timer
    this._stopFallbackTimer();
    if (ms > 0 && this._enabled) {
      this._startFallbackTimer();
    }
  }

  // ── Private helpers ────────────────────────────────────────

  private _startFallbackTimer(): void {
    this._stopFallbackTimer();
    if (this._intervalMs <= 0 || this._engineAutoSave) return;
    this.ngZone.runOutsideAngular(() => {
      this._intervalTimer = setInterval(() => {
        if (this._enabled) {
          void this.ngZone.run(() => this.saveNow());
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
