import { Injectable } from '@angular/core';
import type ShapeManager from '@zaings/salsa/shape-manager';

/** localStorage key: '1' = Fast compositing (Salsa's raster dirty-rect compositing) is on for this machine. Salsa keeps
 *  that switch for the session only (a static on its renderer), so Frogmarks stores it and re-applies it after every
 *  renderer boot (applyStoredExperiments). Absent = off (the engine default). */
export const EXP_DIRTY_COMPOSITING_KEY = 'fm-exp-dirty-compositing';
/** Salsa's own keys (salsa/docs/ui/gpu-diagnostics.md): the stored safe mode, and the loss history that
 *  `?salsaSafe=0` clears with it. */
export const SALSA_SAFE_MODE_KEY = 'salsa.gpu.safeMode';
export const SALSA_LOSS_TIMES_KEY = 'salsa.gpu.lossTimes';
/** The URL switch Salsa reads at start-up: `?salsaSafe=1` = safe mode for that load, `?salsaSafe=0` = clear it. */
export const SALSA_SAFE_QUERY = 'salsaSafe';

/** The engine calls behind the Experimental menu. Every one is optional: the Salsa dist may be older than this app, so
 *  each call is guarded with `typeof … === 'function'` and its menu item is hidden when the method is missing. */
export type ExperimentalEngineApi = Partial<Pick<ShapeManager,
  'setStrokePrediction' | 'getStrokePrediction' | 'setRasterDirtyCompositing' | 'getRasterDirtyCompositing' |
  'setTouchSmoothing' | 'getTouchSmoothing' | 'runStrokePredictionSelfTest' | 'getGpuDiagnostics3D'>>;
type EngineHandle = ExperimentalEngineApi | null | undefined;

export type FingerSmoothing = 'off' | 'light' | 'normal';
export const FINGER_SMOOTHING_OPTIONS: ReadonlyArray<{ value: FingerSmoothing; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'light', label: 'Light' },
  { value: 'normal', label: 'Brush setting' },
];

/** The small read-and-copy dialog the two actions (self-test, GPU info) show. */
export interface ExperimentalDialog { title: string; text: string; busy: boolean; copied: boolean }

function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Re-apply the experiments Salsa does not persist itself. Call once after every renderer boot (each editor load, and
 *  each re-init). Stroke prediction and finger smoothing are persisted by Salsa, so only Fast compositing is here. */
export function applyStoredExperiments(sm: EngineHandle): void {
  if (readStored(EXP_DIRTY_COMPOSITING_KEY) !== '1') return;
  if (typeof sm?.setRasterDirtyCompositing !== 'function') return;
  try { sm.setRasterDirtyCompositing(true); } catch { /* an experiment must never block the editor boot */ }
}

/**
 * The editor's Experimental menu (top menubar): per-machine engine experiments a tester can flip on a tablet without
 * a console. The engine handle is passed into every call (the menubar hands over the editor's ShapeManager), so this
 * service holds no engine reference and survives renderer re-inits.
 */
@Injectable({ providedIn: 'root' })
export class ExperimentalSettingsService {
  readonly smoothingOptions = FINGER_SMOOTHING_OPTIONS;

  // Which items exist in this Salsa dist (refresh). A missing API hides its item.
  hasStrokePrediction = false;
  hasDirtyCompositing = false;
  hasTouchSmoothing = false;
  hasSelfTest = false;
  hasGpuInfo = false;

  // The values the menu shows; read from the engine when the menu opens and after each change.
  strokePrediction = false;
  dirtyCompositing = false;
  touchSmoothing: FingerSmoothing = 'light';
  safeMode = false;

  dialog: ExperimentalDialog | null = null;

  /** Read which APIs exist and their current values. Called when the menu opens. */
  refresh(sm: EngineHandle): void {
    this.hasStrokePrediction = typeof sm?.setStrokePrediction === 'function' && typeof sm.getStrokePrediction === 'function';
    this.hasDirtyCompositing = typeof sm?.setRasterDirtyCompositing === 'function' && typeof sm.getRasterDirtyCompositing === 'function';
    this.hasTouchSmoothing = typeof sm?.setTouchSmoothing === 'function' && typeof sm.getTouchSmoothing === 'function';
    this.hasSelfTest = typeof sm?.runStrokePredictionSelfTest === 'function';
    this.hasGpuInfo = typeof sm?.getGpuDiagnostics3D === 'function';
    try {
      if (typeof sm?.getStrokePrediction === 'function') this.strokePrediction = !!sm.getStrokePrediction();
      if (typeof sm?.getRasterDirtyCompositing === 'function') this.dirtyCompositing = !!sm.getRasterDirtyCompositing();
      if (typeof sm?.getTouchSmoothing === 'function') this.touchSmoothing = sm.getTouchSmoothing();
    } catch { /* keep the last known values */ }
    this.safeMode = this.readSafeMode(sm);
  }

  /** Stroke prediction. Salsa persists it per machine. */
  toggleStrokePrediction(sm: EngineHandle): void {
    if (typeof sm?.setStrokePrediction !== 'function') return;
    const on = typeof sm.getStrokePrediction === 'function' ? !sm.getStrokePrediction() : !this.strokePrediction;
    sm.setStrokePrediction(on);
    this.strokePrediction = on;
  }

  /** Fast compositing (changed-area only). Salsa keeps it for the session; the choice is stored here per machine. */
  toggleDirtyCompositing(sm: EngineHandle): void {
    if (typeof sm?.setRasterDirtyCompositing !== 'function') return;
    const on = typeof sm.getRasterDirtyCompositing === 'function' ? !sm.getRasterDirtyCompositing() : !this.dirtyCompositing;
    sm.setRasterDirtyCompositing(on);
    this.dirtyCompositing = on;
    try {
      if (on) localStorage.setItem(EXP_DIRTY_COMPOSITING_KEY, '1');
      else localStorage.removeItem(EXP_DIRTY_COMPOSITING_KEY);
    } catch { /* storage blocked (private mode): on for this session only */ }
  }

  /** Finger smoothing: 'off' | 'light' | 'normal' (= the brush's own setting). Salsa persists it per machine. */
  setTouchSmoothing(sm: EngineHandle, mode: FingerSmoothing): void {
    if (typeof sm?.setTouchSmoothing !== 'function') return;
    sm.setTouchSmoothing(mode);
    this.touchSmoothing = typeof sm.getTouchSmoothing === 'function' ? sm.getTouchSmoothing() : mode;
  }

  /** Run Salsa's on-device stroke prediction check and show the verdict + summary in the dialog. */
  async runPredictionSelfTest(sm: EngineHandle): Promise<void> {
    if (typeof sm?.runStrokePredictionSelfTest !== 'function') return;
    const dialog: ExperimentalDialog = { title: 'Stroke prediction self-test', text: 'Running…', busy: true, copied: false };
    this.dialog = dialog;
    try {
      const report = await sm.runStrokePredictionSelfTest();
      if (!report) {
        dialog.text = 'Not run: the renderer has no GPU device yet. Try again once the canvas is showing.';
      } else {
        const lines = [report.ok
          ? 'PASS: stroke prediction is safe to turn on on this device.'
          : 'FAIL: keep stroke prediction off on this device.'];
        if (report.summary) lines.push('', report.summary);
        if (report.errors?.length) lines.push('', 'GPU errors:', ...report.errors);
        dialog.text = lines.join('\n');
      }
    } catch (e) {
      dialog.text = 'The self-test threw:\n' + (e instanceof Error ? (e.stack || e.message) : String(e));
    }
    dialog.busy = false;
  }

  /** Show Salsa's GPU diagnostics (tier, caps, adapter, canvas size, last loss, then the rest) as copyable JSON. */
  showGpuInfo(sm: EngineHandle): void {
    if (typeof sm?.getGpuDiagnostics3D !== 'function') return;
    let text: string;
    try {
      const d = sm.getGpuDiagnostics3D();
      // The fields a tester reads first go on top; the spread keeps everything else after them.
      const ordered = {
        tier: d.tier, reasons: d.reasons, safeMode: d.safeMode, caps: d.caps, adapter: d.adapter, gpuName: d.gpuName,
        canvas: d.canvas, lastLoss: d.lastLoss, ...d,
      };
      text = JSON.stringify(ordered, null, 1);
    } catch (e) {
      text = 'Could not read the GPU diagnostics:\n' + (e instanceof Error ? e.message : String(e));
    }
    this.dialog = { title: 'GPU info', text, busy: false, copied: false };
  }

  closeDialog(): void { this.dialog = null; }

  /** Copy the dialog text. Falls back to a hidden textarea where the async clipboard API is missing or refused. */
  async copyDialog(): Promise<void> {
    const dialog = this.dialog;
    if (!dialog) return;
    let done = false;
    try {
      if (typeof navigator.clipboard?.writeText === 'function') { await navigator.clipboard.writeText(dialog.text); done = true; }
    } catch { /* not focused / not permitted: the fallback below */ }
    if (!done) {
      try {
        const ta = document.createElement('textarea');
        ta.value = dialog.text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- the only copy path without the async clipboard API
        done = document.execCommand('copy');
        ta.remove();
      } catch { /* the text stays selectable in the dialog */ }
    }
    dialog.copied = done;
  }

  /**
   * Safe mode: the same effect as loading with `?salsaSafe=1` (on) or `?salsaSafe=0` (off), kept across loads. On sets
   * Salsa's stored flag; off removes it and the loss history (exactly what `?salsaSafe=0` clears). Then the page
   * reloads, because Salsa picks its GPU tier at start-up. The query switch is taken off the URL either way, so a
   * stale `?salsaSafe=1` cannot keep safe mode on and a stale `=0` cannot keep clearing the crash-loop guard.
   */
  toggleSafeMode(sm: EngineHandle): void {
    const on = !this.readSafeMode(sm);
    const question = on
      ? 'Turn safe mode on? The editor reloads with shadows, SSAO, SSR and TAA off (same as ?salsaSafe=1).'
      : 'Turn safe mode off? The editor reloads with the normal GPU settings (same as ?salsaSafe=0).';
    if (!this.confirmReload(question)) return;
    let stored = false;
    try {
      if (on) {
        localStorage.setItem(SALSA_SAFE_MODE_KEY, JSON.stringify({ at: Date.now(), manual: true }));
      } else {
        localStorage.removeItem(SALSA_SAFE_MODE_KEY);
        localStorage.removeItem(SALSA_LOSS_TIMES_KEY);
      }
      stored = true;
    } catch { /* storage blocked: the URL switch below still gives this one load */ }
    const url = new URL(this.currentUrl());
    url.searchParams.delete(SALSA_SAFE_QUERY);
    if (on && !stored) url.searchParams.set(SALSA_SAFE_QUERY, '1');
    this.reloadPage(url.toString());
  }

  /** Safe mode is in force: the URL switch, the stored flag, or the engine saying so (the crash-loop guard tripped). */
  private readSafeMode(sm: EngineHandle): boolean {
    try {
      const q = new URL(this.currentUrl()).searchParams.get(SALSA_SAFE_QUERY);
      if (q === '1' || q === 'true') return true;
    } catch { /* no URL */ }
    if (readStored(SALSA_SAFE_MODE_KEY)) return true;
    try {
      if (typeof sm?.getGpuDiagnostics3D === 'function') return !!sm.getGpuDiagnostics3D().safeMode;
    } catch { /* renderer not ready */ }
    return false;
  }

  // Browser seams (the specs replace them).
  currentUrl(): string { return window.location.href; }
  confirmReload(question: string): boolean { return window.confirm(question); }
  reloadPage(url: string): void {
    if (url === window.location.href) window.location.reload();
    else window.location.assign(url);
  }
}
