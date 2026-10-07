import { Injectable } from '@angular/core';
import type ShapeManager from '@zaings/salsa/shape-manager';

/** localStorage key: '1' = Fast compositing (Salsa's raster dirty-rect compositing) is on for this machine. Salsa keeps
 *  that switch for the session only (a static on its renderer), so Frogmarks stores it and re-applies it after every
 *  renderer boot (applyStoredExperiments). Absent = off (the engine default). */
export const EXP_DIRTY_COMPOSITING_KEY = 'fm-exp-dirty-compositing';
/** localStorage key: '1' = show the developer buttons in the artist panels (e.g. the Armature panel's "Copy pose + body
 *  for Claude"). Off by default (UI review 2026-10-07 §2c: a developer button in the artist UI). */
export const EXP_DEV_TOOLS_KEY = 'fm-exp-dev-tools';
/** localStorage key: '1' = Edit Mesh uses the classic overlay panel instead of the mode chrome (header bar, tool strip,
 *  op pill, properties panel — UI review 2026-10-07 §4). Off by default: a fallback if the new layout breaks. */
export const EXP_CLASSIC_MESH_EDIT_KEY = 'fm-exp-classic-mesh-edit';
/** localStorage key: '1' = Armature uses the classic overlay panel instead of the mode chrome (Rig / Animate, tool
 *  strip, op pill, properties panel — UI review 2026-10-07 §4). Off by default: a fallback if the new layout breaks. */
export const EXP_CLASSIC_ARMATURE_KEY = 'fm-exp-classic-armature';
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
/** The Render debug calls (Salsa render-debug.ts, docs/ui/gpu-diagnostics.md "Render debug"). Declared here, loosely
 *  typed, so this app also builds against a Salsa dist that predates them; each call is guarded at runtime. */
export interface RenderDebugEngineApi {
  setRenderDebug3D?(patch: { [key: string]: boolean | undefined }): object;
  getRenderDebug3D?(): object;
  getRenderDebugFlagList3D?(): ReadonlyArray<{ key: string; label: string }>;
  getRenderDebugStatus3D?(): object;
  captureCanvasPNG3D?(opts?: { opaque?: boolean }): Promise<{ blob: Blob; dataUrl: string; width: number; height: number; source: string }>;
}
type EngineHandle = (ExperimentalEngineApi & RenderDebugEngineApi) | null | undefined;

/** One row of the Render debug section. */
export interface RenderDebugRow { key: string; label: string; on: boolean }

export type FingerSmoothing = 'off' | 'light' | 'normal';
export const FINGER_SMOOTHING_OPTIONS: ReadonlyArray<{ value: FingerSmoothing; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'light', label: 'Light' },
  { value: 'normal', label: 'Brush setting' },
];

/** The small read-and-copy dialog the two actions (self-test, GPU info) show. */
export interface ExperimentalDialog {
  title: string; text: string; busy: boolean; copied: boolean;
  /** A real screenshot to preview and open (a blob: URL, revoked when the dialog closes). */
  imageUrl?: string;
}

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
  hasRenderDebug = false;
  hasRealScreenshot = false;

  /** Render debug: the section is expanded, its rows (engine order), and the status line (resolution scale / lo-res path). */
  renderDebugOpen = false;
  renderDebugRows: RenderDebugRow[] = [];
  renderDebugStatus = '';
  /** How many render-debug switches are on (shown on the collapsed row). */
  get renderDebugOnCount(): number { return this.renderDebugRows.filter((r) => r.on).length; }

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
    this.hasRenderDebug = typeof sm?.setRenderDebug3D === 'function' && typeof sm.getRenderDebug3D === 'function';
    this.hasRealScreenshot = typeof sm?.captureCanvasPNG3D === 'function';
    this.readRenderDebug(sm);
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

  closeDialog(): void {
    if (this.dialog?.imageUrl) { try { URL.revokeObjectURL(this.dialog.imageUrl); } catch { /* already gone */ } }
    this.dialog = null;
  }

  // ── Render debug (bisect a device-only GPU glitch; Salsa docs/ui/gpu-diagnostics.md "Render debug") ──

  /** Read the switches + the status line from the engine. Rows follow the engine's list (its suggested bisect order). */
  readRenderDebug(sm: EngineHandle): void {
    if (typeof sm?.getRenderDebug3D !== 'function') { this.renderDebugRows = []; this.renderDebugStatus = ''; return; }
    try {
      const flags = sm.getRenderDebug3D() as Record<string, unknown>;
      const list = typeof sm.getRenderDebugFlagList3D === 'function'
        ? sm.getRenderDebugFlagList3D()
        : Object.keys(flags).map((key) => ({ key, label: key }));
      this.renderDebugRows = list.map(({ key, label }) => ({ key, label, on: flags[key] === true }));
    } catch { this.renderDebugRows = []; }
    this.renderDebugStatus = this.describeRenderStatus(sm);
  }

  /** "3D scale 0.75 (auto) · lo-res 960×540 · TAA" / "3D scale 1 (off) · native": is the tablet on the lo-res path? */
  private describeRenderStatus(sm: EngineHandle): string {
    if (typeof sm?.getRenderDebugStatus3D !== 'function') return '';
    try {
      const s = sm.getRenderDebugStatus3D() as {
        resolutionScale?: number; resolutionMode?: string; temporalAA?: boolean;
        loResPath?: { width: number; height: number; dynamic: boolean } | null;
      };
      const scale = typeof s.resolutionScale === 'number' ? String(Math.round(s.resolutionScale * 100) / 100) : '?';
      const parts = [`3D scale ${scale}${s.resolutionMode ? ` (${s.resolutionMode})` : ''}`];
      parts.push(s.loResPath ? `lo-res ${s.loResPath.width}×${s.loResPath.height}${s.loResPath.dynamic ? '' : ' (PS1)'}` : 'native');
      if (s.temporalAA) parts.push('TAA');
      return parts.join(' · ');
    } catch { return ''; }
  }

  toggleRenderDebug(sm: EngineHandle, key: string): void {
    if (typeof sm?.setRenderDebug3D !== 'function') return;
    const row = this.renderDebugRows.find((r) => r.key === key);
    try { sm.setRenderDebug3D({ [key]: !(row?.on ?? false) }); } catch { /* keep the menu usable */ }
    this.readRenderDebug(sm);
  }

  resetRenderDebug(sm: EngineHandle): void {
    if (typeof sm?.setRenderDebug3D !== 'function') return;
    try { sm.setRenderDebug3D({ reset: true }); } catch { /* keep the menu usable */ }
    this.readRenderDebug(sm);
  }

  /**
   * Save what the renderer actually produced (Salsa reads back the canvas texture at the end of the next frame): a PNG
   * download, plus a dialog with the preview, an "Open image" link (a new tab, for a tablet where the download is
   * hard to find) and the facts (source, size, switches on).
   */
  async saveRealScreenshot(sm: EngineHandle): Promise<void> {
    if (typeof sm?.captureCanvasPNG3D !== 'function') return;
    this.closeDialog();
    const dialog: ExperimentalDialog = { title: 'Real screenshot', text: 'Capturing the next frame…', busy: true, copied: false };
    this.dialog = dialog;
    try {
      const shot = await sm.captureCanvasPNG3D();
      const url = URL.createObjectURL(shot.blob);
      dialog.imageUrl = url;
      const name = `frogmarks-render-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      this.downloadUrl(url, name);
      const on = this.renderDebugRows.filter((r) => r.on).map((r) => r.key);
      const extra = shot as unknown as { format?: string; translucentPixels?: number };
      dialog.text = [
        `Saved ${name} (${shot.width}×${shot.height}).`,
        `Source: ${shot.source}${extra.format ? ` (${extra.format})` : ''}`,
        typeof extra.translucentPixels === 'number' ? `Pixels with alpha < 255: ${extra.translucentPixels}` : '',
        this.renderDebugStatus ? `Render: ${this.renderDebugStatus}` : '',
        `Render debug on: ${on.length ? on.join(', ') : 'none'}`,
      ].filter(Boolean).join('\n');
    } catch (e) {
      dialog.text = 'The screenshot failed:\n' + (e instanceof Error ? e.message : String(e));
    }
    dialog.busy = false;
  }

  /** Browser seam (the specs replace it): start a download of `url` as `name`. */
  downloadUrl(url: string, name: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

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

  // ── Developer buttons (per machine) ──

  /** The developer buttons are shown in the artist panels (read live: the panels bind to it). */
  get devTools(): boolean { return readStored(EXP_DEV_TOOLS_KEY) === '1'; }

  toggleDevTools(): void {
    try {
      if (this.devTools) localStorage.removeItem(EXP_DEV_TOOLS_KEY);
      else localStorage.setItem(EXP_DEV_TOOLS_KEY, '1');
    } catch { /* storage blocked (private mode): stays off */ }
  }

  // ── Classic Edit Mesh panel (per machine) ──

  private _classicMeshEdit = readStored(EXP_CLASSIC_MESH_EDIT_KEY) === '1';
  /** Edit Mesh shows the classic overlay panel instead of the mode chrome (IllustrationComponent.useModeChrome.meshEdit
   *  follows it). Read once per app start, then kept here (it is read on every change detection). */
  get classicMeshEdit(): boolean { return this._classicMeshEdit; }

  toggleClassicMeshEdit(): void {
    this._classicMeshEdit = !this._classicMeshEdit;
    try {
      if (this._classicMeshEdit) localStorage.setItem(EXP_CLASSIC_MESH_EDIT_KEY, '1');
      else localStorage.removeItem(EXP_CLASSIC_MESH_EDIT_KEY);
    } catch { /* storage blocked (private mode): this session only */ }
  }

  // ── Classic Armature panel (per machine) ──

  private _classicArmature = readStored(EXP_CLASSIC_ARMATURE_KEY) === '1';
  /** Armature shows the classic overlay panel instead of the mode chrome (IllustrationComponent.useModeChrome.armature
   *  follows it each time Armature opens). Read once per app start, then kept here. */
  get classicArmature(): boolean { return this._classicArmature; }

  toggleClassicArmature(): void {
    this._classicArmature = !this._classicArmature;
    try {
      if (this._classicArmature) localStorage.setItem(EXP_CLASSIC_ARMATURE_KEY, '1');
      else localStorage.removeItem(EXP_CLASSIC_ARMATURE_KEY);
    } catch { /* storage blocked (private mode): this session only */ }
  }

  // Browser seams (the specs replace them).
  currentUrl(): string { return window.location.href; }
  confirmReload(question: string): boolean { return window.confirm(question); }
  reloadPage(url: string): void {
    if (url === window.location.href) window.location.reload();
    else window.location.assign(url);
  }
}
