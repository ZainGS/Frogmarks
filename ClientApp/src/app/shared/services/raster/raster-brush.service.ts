import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import ShapeManager from '@zaings/salsa/shape-manager';
import {
  BrushPreset,
  RasterLayer,
  LayerBlendMode,
  StabilizationMethod,
  EraserStyle,
  EraserHardness,
  CurvePoint,
  CanvasGrainSettings,
  CanvasGrainType,
} from '../../../boards/models/brush-preset.model';

/**
 * RasterBrushService
 * ------------------
 * Wraps the ShapeManager singleton's raster / brush-preset API so that
 * Angular components can bind to reactive state without touching
 * the engine directly.
 */
@Injectable({ providedIn: 'root' })
export class RasterBrushService {

  // ── Observable state ────────────────────────────────────────

  private _presets$ = new BehaviorSubject<BrushPreset[]>([]);
  presets$: Observable<BrushPreset[]> = this._presets$.asObservable();

  private _activePresetId$ = new BehaviorSubject<string | null>(null);
  activePresetId$: Observable<string | null> = this._activePresetId$.asObservable();

  private _layers$ = new BehaviorSubject<RasterLayer[]>([]);
  layers$: Observable<RasterLayer[]> = this._layers$.asObservable();

  private _activeLayerId$ = new BehaviorSubject<string | null>(null);
  activeLayerId$: Observable<string | null> = this._activeLayerId$.asObservable();

  // ── Cached ShapeManager ref ─────────────────────────────────

  private get sm(): ShapeManager | null {
    return ShapeManager.getInstance?.() ?? null;
  }

  // ── Presets ─────────────────────────────────────────────────

  refreshPresets(): void {
    const sm = this.sm;
    if (!sm) return;
    const presets = (sm.getBrushPresets?.() ?? []) as BrushPreset[];
    this._presets$.next(presets);
    this._activePresetId$.next(sm.getActiveBrushPresetId?.() ?? null);
  }

  setActivePreset(id: string): void {
    this.sm?.setActiveBrushPreset(id);
    this._activePresetId$.next(id);
  }

  getActivePreset(): BrushPreset | null {
    const id = this._activePresetId$.value;
    if (!id) return null;
    return (this.sm?.getBrushPreset?.(id) as BrushPreset | undefined) ?? null;
  }

  // ── Tool activation ─────────────────────────────────────────

  enableBrushTool(presetId?: string): void {
    const sm = this.sm; if (!sm) return;
    sm.enableRasterTool();
    if (presetId) { sm.setActiveBrushPreset(presetId); }
    this.refreshPresets();
  }

  enableEraserTool(style: EraserStyle = 'fade'): void {
    const sm = this.sm; if (!sm) return;
    if (style === 'clear') {
      sm.enableRasterClearEraserTool();
    } else {
      sm.enableRasterEraserTool();
    }
  }

  disableRasterTool(): void {
    this.sm?.disableRasterTool();
  }

  // ── Core brush properties ───────────────────────────────────

  setColor(hex: string): void {
    this.sm?.setRasterBrushColor(hex);
  }

  setSize(radius: number): void {
    this.sm?.setRasterBrushSize(radius);
  }

  /** Mutate current preset's maxSize/minSize and re-register */
  updatePresetSize(minSize: number, maxSize: number): void {
    const engine = this.sm?.getRasterPaintEngine?.();
    const id = this._activePresetId$.value;
    if (!engine || !id) return;
    const preset = engine.getPreset?.(id);
    if (!preset) return;
    preset.minSize = minSize;
    preset.maxSize = maxSize;
    engine.registerPreset(preset);
    engine.setActivePreset(preset.id);
    this.refreshPresets();
  }

  updateOpacity(value: number): void {
    this._mutatePreset(p => { p.blending.opacity = value; });
  }

  updateFlow(value: number): void {
    this._mutatePreset(p => { p.blending.flow = value; });
  }

  // ── Stabilization ───────────────────────────────────────────

  updateStabilization(method: StabilizationMethod, level: number, pullStringLength?: number): void {
    this._mutatePreset(p => {
      p.stabilization.method = method;
      p.stabilization.level = level;
      if (pullStringLength !== undefined) {
        p.stabilization.pullStringLength = pullStringLength;
      }
    });
    // Forward to Salsa engine
    const sm = this.sm;
    if (sm) {
      (sm as any).setActiveStabilization?.({ method, level, pullStringLength });
    }
  }

  // ── Tip Shape ───────────────────────────────────────────────

  updateTipHardness(v: number): void { this._mutatePreset(p => { if (p.tip.type === 'parametric') (p.tip as any).hardness = v; }); }
  updateTipRoundness(v: number): void { this._mutatePreset(p => { if (p.tip.type === 'parametric') (p.tip as any).roundness = v; }); }
  updateTipAngle(rad: number): void { this._mutatePreset(p => { if (p.tip.type === 'parametric') (p.tip as any).angle = rad; }); }

  // ── Dynamics curves ─────────────────────────────────────────

  updateSizeCurve(pts: CurvePoint[]): void { this._mutatePreset(p => { p.dynamics.sizePressureCurve = pts; }); }
  updateOpacityCurve(pts: CurvePoint[]): void { this._mutatePreset(p => { p.dynamics.opacityPressureCurve = pts; }); }
  updateFlowCurve(pts: CurvePoint[]): void { this._mutatePreset(p => { p.dynamics.flowPressureCurve = pts; }); }
  updateVelocitySizeCurve(pts: CurvePoint[]): void { this._mutatePreset(p => { p.dynamics.sizeVelocityCurve = pts; }); }
  updateScatterPressureCurve(pts: CurvePoint[]): void { this._mutatePreset(p => { p.dynamics.scatterPressureCurve = pts; }); }

  // ── Brush blend mode ─────────────────────────────────────────────

  updateBrushBlendMode(mode: 'normal' | 'multiply' | 'screen' | 'overlay'): void {
    this._mutatePreset(p => { p.blending.mode = mode; });
  }

  // ── Spacing / scatter ───────────────────────────────────────

  updateSpacing(v: number): void { this._mutatePreset(p => { p.spacing = v; }); }
  updateScatterDistance(v: number): void { this._mutatePreset(p => { p.dynamics.scatterDistance = v; }); }
  updateSizeJitter(v: number): void { this._mutatePreset(p => { p.dynamics.sizeRandomJitter = v; }); }
  updateRotationJitter(v: number): void { this._mutatePreset(p => { p.dynamics.rotationRandomJitter = v; }); }

  // ── Brush Grain (per-brush dab alpha modulation) ────────────

  setBrushGrain(settings: CanvasGrainSettings): void {
    this.sm?.setBrushGrain?.(settings);
  }

  getBrushGrain(): CanvasGrainSettings | null {
    return (this.sm?.getBrushGrain?.() as CanvasGrainSettings | undefined) ?? null;
  }

  // ── Dual Brush (texture overlay per dab) ────────────────────

  setDualBrush(settings: any): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushDualBrush?.(id, settings);
  }

  // ── Color Jitter (per-dab HSB/opacity randomization) ────────

  setColorJitter(jitter: any): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushColorJitter?.(id, jitter);
  }

  // ── Wet Edges (watercolor edge darkening) ───────────────────

  setWetEdges(settings: any): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushWetEdges?.(id, settings);
  }

  // ── Stroke Texture (continuous strip along stroke path) ─────

  setStrokeTexture(settings: any): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushStrokeTexture?.(id, settings);
  }

  // ── Brush Pack Import ───────────────────────────────────────

  importBrushPack(json: string): string[] {
    const ids = this.sm?.importBrushPresets?.(json) ?? [];
    this.refreshPresets();
    return ids;
  }

  // ── Paper Grain (global canvas paper material) ──────────────

  setPaperGrain(settings: CanvasGrainSettings): void {
    this.sm?.setPaperGrain?.(settings);
  }

  getPaperGrain(): CanvasGrainSettings | null {
    return (this.sm?.getPaperGrain?.() as CanvasGrainSettings | undefined) ?? null;
  }

  getAvailableGrainTypes(): CanvasGrainType[] {
    return (this.sm?.getAvailableGrainTypes?.() as CanvasGrainType[] | undefined) ?? [];
  }

  // ── Texture ─────────────────────────────────────────────────

  updateTexture(patch: Partial<BrushPreset['texture']> | null): void {
    this._mutatePreset(p => {
      if (patch === null) { delete (p as any).texture; return; }
      if (!p.texture) {
        p.texture = { imageData: '', scale: 1, strength: 0.5, mode: 'multiply', fixedToCanvas: false };
      }
      Object.assign(p.texture, patch);
    });
  }

  // ── Preset management ───────────────────────────────────────

  savePresetAs(name: string): string | null {
    const sm = this.sm; if (!sm) return null;
    const active = this.getActivePreset();
    if (!active) return null;
    const clone = { ...active, id: undefined, name };
    const json = JSON.stringify(clone);
    const newId = sm.importBrushPreset(json);
    if (newId) {
      sm.setActiveBrushPreset(newId);
      this.refreshPresets();
    }
    return newId ?? null;
  }

  /** Create a brand-new preset from explicit values (not cloned from active) */
  createPreset(preset: Omit<BrushPreset, 'id'>): string | null {
    const sm = this.sm; if (!sm) return null;
    const json = JSON.stringify(preset);
    const newId = sm.importBrushPreset(json);
    if (newId) {
      sm.setActiveBrushPreset(newId);
      this.refreshPresets();
    }
    return newId ?? null;
  }

  exportPreset(id: string): string | null {
    return this.sm?.exportBrushPreset(id) ?? null;
  }

  importPreset(json: string): string | null {
    const newId = this.sm?.importBrushPreset(json) ?? null;
    if (newId) this.refreshPresets();
    return newId;
  }

  exportAll(): string | null {
    return this.sm?.exportAllBrushPresets() ?? null;
  }

  importAll(json: string): string[] {
    const ids = this.sm?.importBrushPresets(json) ?? [];
    this.refreshPresets();
    return ids;
  }

  deletePreset(id: string): void {
    this.sm?.deleteBrushPreset(id);
    this.refreshPresets();
  }

  // ── Raster layers ───────────────────────────────────────────

  refreshLayers(): void {
    // Use microtask delay so the engine has time to process GPU changes
    Promise.resolve().then(() => {
      const layers: RasterLayer[] = this.sm?.getRasterLayers?.() ?? [];
      this._layers$.next(layers);

      // Auto-select a layer if none is selected or the active one was removed
      const currentId = this._activeLayerId$.value;
      const stillExists = layers.some(l => l.id === currentId);
      if (layers.length > 0 && (!currentId || !stillExists)) {
        this.selectLayer(layers[0].id);
      } else if (layers.length === 0) {
        this._activeLayerId$.next(null);
      }
    });
  }

  addLayer(name: string): void {
    this.sm?.addRasterLayer(name);
    // refreshLayers is async (microtask) — select the new layer once it arrives
    Promise.resolve().then(() => {
      const layers: RasterLayer[] = this.sm?.getRasterLayers?.() ?? [];
      this._layers$.next(layers);
      if (layers.length > 0) {
        // New layer is appended at the end
        this.selectLayer(layers[layers.length - 1].id);
      }
    });
  }

  deleteLayer(id: string): void {
    const layers = this._layers$.value;
    // Block deletion of the last remaining layer
    if (layers.length <= 1) return;

    // Find neighbor to select after deletion
    const idx = layers.findIndex(l => l.id === id);
    const neighborId = layers[idx - 1]?.id ?? layers[idx + 1]?.id ?? null;

    this.sm?.deleteRasterLayer(id);
    this.refreshLayers();

    // Select neighbor if we deleted the active layer
    if (this._activeLayerId$.value === id && neighborId) {
      this.selectLayer(neighborId);
    }
  }

  selectLayer(id: string): void {
    this.sm?.selectRasterLayer(id);
    this._activeLayerId$.next(id);
  }

  setLayerVisibility(id: string, visible: boolean): void {
    this.sm?.setRasterLayerVisibility(id, visible);
    this.refreshLayers();
  }

  // ── Layer compositor properties (Phase 2) ───────────────────

  setLayerBlendMode(id: string, mode: LayerBlendMode): void {
    (this.sm as any)?.rasterLayerManager?.setBlendMode(id, mode);
    this.refreshLayers();
  }

  setLayerOpacity(id: string, opacity: number): void {
    (this.sm as any)?.rasterLayerManager?.setOpacity(id, opacity);
    this.refreshLayers();
  }

  setLayerClipping(id: string, clipped: boolean): void {
    this.sm?.setRasterLayerClipping(id, clipped);
    this.refreshLayers();
  }

  setLayerLockTransparency(id: string, locked: boolean): void {
    this.sm?.setRasterLayerLockTransparency(id, locked);
    this.refreshLayers();
  }

  reorderLayers(orderedIds: string[]): void {
    this.sm?.reorderRasterLayers(orderedIds);
    this.refreshLayers();
  }

  // ── Undo / Redo ─────────────────────────────────────────────

  async undo(): Promise<void> { await this.sm?.rasterUndo(); }
  async redo(): Promise<void> { await this.sm?.rasterRedo(); }

  // ── Private helpers ─────────────────────────────────────────

  private _mutatePreset(mutate: (p: BrushPreset) => void): void {
    const engine = this.sm?.getRasterPaintEngine?.();
    const id = this._activePresetId$.value;
    if (!engine || !id) return;
    const preset = engine.getPreset?.(id) as BrushPreset | undefined;
    if (!preset) return;
    mutate(preset);
    engine.registerPreset(preset);
    engine.setActivePreset(preset.id);
    this.refreshPresets();
  }
}
