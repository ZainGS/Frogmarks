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
  BrushBleed,
  BrushSmudge,
} from '../../../boards/models/brush-preset.model';

/**
 * A layer the brush paints on: a real pixel layer — not the vector / ephemera entry, a folder or the 3D scene, and not
 * an engine-owned (package) layer the panel hides. A new document's stack is [Vector, Background]: auto-selecting
 * `layers[0]` made the VECTOR entry the engine's paint layer, so strokes painted an orphan texture with no undo entry
 * and Ctrl+Z threw ("reading 'undo'") on a Salsa dist without the hasRasterHistory guard.
 */
export function isPaintableRasterLayer(l: Pick<RasterLayer, 'type'> & Partial<Pick<RasterLayer, 'systemOwner' | 'packageOwnerId'>>): boolean {
  return (l.type ?? 'layer') === 'layer' && !l.systemOwner && !l.packageOwnerId;
}

/** Types that can never be the selected raster layer (no pixels, and not the 3D-scene row's own selection). */
function isNeverRasterSelection(l: Pick<RasterLayer, 'type'>): boolean {
  return l.type === 'vector' || l.type === 'ephemera' || l.type === 'folder';
}

/**
 * The paint layer a (fresh / just-loaded) document starts on: the engine's own selection when it is a paint layer
 * (a new document selects Background, a load its topmost raster layer), else the topmost paint layer (last in the
 * array = visually highest), else null.
 */
export function pickDefaultPaintLayerId(layers: RasterLayer[], engineSelectedId: string | null | undefined): string | null {
  const engineSel = engineSelectedId ? layers.find(l => l.id === engineSelectedId) : undefined;
  if (engineSel && isPaintableRasterLayer(engineSel)) return engineSel.id;
  for (let i = layers.length - 1; i >= 0; i--) if (isPaintableRasterLayer(layers[i])) return layers[i].id;
  return null;
}

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
    const presets = (sm.getBrushPresets() ?? []) as BrushPreset[];
    this._presets$.next(presets);
    this._activePresetId$.next(sm.getActiveBrushPresetId() ?? null);
  }

  setActivePreset(id: string): void {
    this.sm?.setActiveBrushPreset(id);
    this._activePresetId$.next(id);
  }

  /**
   * PICK a brush (brush-list click): activates the preset AND leaves the eraser tool's erase mode, so a brush
   * picked after the Eraser paints instead of erasing. (setActivePreset only swaps the preset; it is also the
   * path for live edits of the active brush, which must not drop erase mode.)
   */
  selectBrush(id: string): void {
    const sm = this.sm;
    if (!sm) return;
    // Salsa's selectRasterBrushPreset (also releases the eraser's render lease) — fall back to the two calls it
    // makes for a Salsa dist built before it existed. Drop the fallback once the dist has it.
    const picker = sm as ShapeManager & { selectRasterBrushPreset?: (presetId: string) => boolean };
    if (typeof picker.selectRasterBrushPreset === 'function') {
      picker.selectRasterBrushPreset(id);
    } else if (sm.setActiveBrushPreset(id)) {
      sm.rasterDrawingService?.setEraserMode('paint');
    }
    this._activePresetId$.next(id);
  }

  getActivePreset(): BrushPreset | null {
    const id = this._activePresetId$.value;
    if (!id) return null;
    return (this.sm?.getBrushPreset(id) as BrushPreset | undefined) ?? null;
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

  /** The engine's current erase mode: null = painting, 1 = fade, 3 = fade (hard edge), 2 = clear. The ONE source of
   *  truth for "is the eraser on" — the rail tools, the keymap and the brush panel all switch it. */
  getEraseMode(): number | null {
    return this.sm?.rasterDrawingService?.getEraseMode() ?? null;
  }

  isEraserActive(): boolean {
    return this.getEraseMode() !== null;
  }

  /** Soft / hard edge for the fade eraser (clear is always a hard cutout). */
  setEraserHardness(hardness: EraserHardness): void {
    this.sm?.rasterDrawingService?.setEraserHard(hardness === 'hard');
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
    const engine = this.sm?.getRasterPaintEngine();
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
      sm.setActiveStabilization({ method, level, pullStringLength });
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

  // ── Bleed & Smudge ───────────────────────────────────────────

  setBrushBleed(settings: BrushBleed): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushBleed(id, settings);
    this._mutatePreset(p => { p.bleed = settings; });
  }

  setBrushSmudge(settings: BrushSmudge): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushSmudge(id, settings);
    this._mutatePreset(p => { p.smudge = settings; });
  }

  // ── Spacing / scatter ───────────────────────────────────────

  updateSpacing(v: number): void { this._mutatePreset(p => { p.spacing = v; }); }
  updateScatterDistance(v: number): void { this._mutatePreset(p => { p.dynamics.scatterDistance = v; }); }
  updateSizeJitter(v: number): void { this._mutatePreset(p => { p.dynamics.sizeRandomJitter = v; }); }
  updateRotationJitter(v: number): void { this._mutatePreset(p => { p.dynamics.rotationRandomJitter = v; }); }

  // ── Brush Grain (per-brush dab alpha modulation) ────────────

  setBrushGrain(settings: CanvasGrainSettings): void {
    this.sm?.setBrushGrain(settings);
  }

  getBrushGrain(): CanvasGrainSettings | null {
    return (this.sm?.getBrushGrain() as CanvasGrainSettings | undefined) ?? null;
  }

  // ── Dual Brush (texture overlay per dab) ────────────────────

  setDualBrush(settings: any): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushDualBrush(id, settings);
  }

  // ── Color Jitter (per-dab HSB/opacity randomization) ────────

  setColorJitter(jitter: any): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushColorJitter(id, jitter);
  }

  // ── Wet Edges (watercolor edge darkening) ───────────────────

  setWetEdges(settings: any): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushWetEdges(id, settings);
  }

  // ── Stroke Texture (continuous strip along stroke path) ─────

  setStrokeTexture(settings: any): void {
    const id = this._activePresetId$.value;
    if (id) this.sm?.setBrushStrokeTexture(id, settings);
  }

  // ── Brush Pack Import ───────────────────────────────────────

  importBrushPack(json: string): string[] {
    const ids = this.sm?.importBrushPresets(json) ?? [];
    this.refreshPresets();
    return ids;
  }

  // ── Paper Grain (global canvas paper material) ──────────────

  setPaperGrain(settings: CanvasGrainSettings): void {
    this.sm?.setPaperGrain(settings);
  }

  getPaperGrain(): CanvasGrainSettings | null {
    return (this.sm?.getPaperGrain() as CanvasGrainSettings | undefined) ?? null;
  }

  getAvailableGrainTypes(): CanvasGrainType[] {
    return (this.sm?.getAvailableGrainTypes() as CanvasGrainType[] | undefined) ?? [];
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

  /** Store a preview image dataURL on any preset (not just the active one). */
  updatePresetIcon(id: string, iconDataUrl: string | null): void {
    const engine = this.sm?.getRasterPaintEngine();
    if (!engine) return;
    const preset = engine.getPreset?.(id) as BrushPreset | undefined;
    if (!preset) return;
    preset.icon = iconDataUrl ?? undefined;
    engine.registerPreset(preset);
    this.refreshPresets();
  }

  // ── Raster layers ───────────────────────────────────────────

  refreshLayers(): void {
    // Use microtask delay so the engine has time to process GPU changes
    void Promise.resolve().then(() => {
      const raw: RasterLayer[] = this.sm?.getRasterLayers() ?? [];
      // Normalize: ensure type defaults to 'layer', map engine '3d-divider' → '3d-scene'
      const layers = raw.map(l => ({
        ...l,
        type: (l.type === '3d-divider' as any ? '3d-scene' : l.type ?? 'layer') as any,
        parentId: l.parentId ?? null,
      }));
      this._layers$.next(layers);

      // Auto-select a PAINT layer when none is selected, the active one was removed, or the active id is an entry
      // that can't take paint (never layers[0] blindly: in a new document that is the Vector entry).
      const currentId = this._activeLayerId$.value;
      const current = currentId ? layers.find(l => l.id === currentId) : undefined;
      if (!current || isNeverRasterSelection(current)) {
        const pick = pickDefaultPaintLayerId(layers, this.engineSelectedLayerId());
        if (pick) this.selectLayer(pick);
        else this._activeLayerId$.next(null);
      }
    });
  }

  addLayer(name: string): void {
    this.sm?.addRasterLayer(name);
    // refreshLayers is async (microtask) — select the new layer once it arrives
    void Promise.resolve().then(() => {
      const raw: RasterLayer[] = this.sm?.getRasterLayers() ?? [];
      const layers = raw.map(l => ({
        ...l,
        type: (l.type === '3d-divider' as any ? '3d-scene' : l.type ?? 'layer') as any,
        parentId: l.parentId ?? null,
      }));
      this._layers$.next(layers);
      if (layers.length > 0) {
        // New layer is appended at the end — find last actual layer (not folder/divider)
        const lastLayer = [...layers].reverse().find(l => l.type === 'layer') ?? layers[layers.length - 1];
        this.selectLayer(lastLayer.id);
      }
    });
  }

  deleteLayer(id: string): void {
    const layers = this._layers$.value;
    // Block deletion of the last remaining layer
    if (layers.length <= 1) return;
    // …and of the last PAINT layer (the vector entry alone left nothing to paint on)
    const target = layers.find(l => l.id === id);
    if (target && isPaintableRasterLayer(target) && layers.filter(isPaintableRasterLayer).length <= 1) return;

    // Find the nearest PAINT layer to select after deletion (below first, then above) — a vector / folder / 3D
    // neighbour can't take the selection.
    const idx = layers.findIndex(l => l.id === id);
    const neighborId = [...layers.slice(0, Math.max(idx, 0))].reverse().find(isPaintableRasterLayer)?.id
      ?? layers.slice(idx + 1).find(isPaintableRasterLayer)?.id ?? null;

    this.sm?.deleteRasterLayer(id);
    this.refreshLayers();

    // Select neighbor if we deleted the active layer
    if (this._activeLayerId$.value === id && neighborId) {
      this.selectLayer(neighborId);
    }
  }

  selectLayer(id: string): void {
    // A vector / ephemera layer or a folder is never the raster (paint) layer. Salsa refuses it since 2026-10-07, but
    // an older dist accepted it and every stroke / Ctrl+Z then hit a layer with no pixel history: ignore it here.
    const entry = this._layers$.value.find(l => l.id === id);
    if (entry && isNeverRasterSelection(entry)) return;
    this.sm?.selectRasterLayer(id);
    this._activeLayerId$.next(id);
  }

  /** The engine's selected raster layer (null without an engine / layer manager). */
  private engineSelectedLayerId(): string | null {
    const rlm = (this.sm as unknown as { rasterLayerManager?: { getSelectedLayerId?: () => string | null } } | null)?.rasterLayerManager;
    return rlm?.getSelectedLayerId?.() ?? null;
  }

  setLayerVisibility(id: string, visible: boolean): void {
    this.sm?.setRasterLayerVisibility(id, visible);
    this.refreshLayers();
  }

  setLayerName(id: string, name: string): void {
    this.sm?.setNodeName(id, name);
    this.refreshLayers();
  }

  // ── Layer compositor properties (Phase 2) ───────────────────

  setLayerBlendMode(id: string, mode: LayerBlendMode): void {
    this.sm?.rasterLayerManager?.setBlendMode(id, mode);
    this.refreshLayers();
  }

  setLayerOpacity(id: string, opacity: number): void {
    this.sm?.rasterLayerManager?.setOpacity(id, opacity);
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

  // ── Layer folders & 3D scene ────────────────────────────────

  addFolder(name?: string): void {
    this.sm?.addRasterFolder(name ?? 'Folder');
    this.refreshLayers();
  }

  setFolderCollapsed(id: string, collapsed: boolean): void {
    this.sm?.setRasterFolderCollapsed(id, collapsed);
    this.refreshLayers();
  }

  setLayerParent(layerId: string, parentId: string | null): void {
    this.sm?.setRasterLayerParent(layerId, parentId);
    this.refreshLayers();
  }

  add3DScene(name?: string): void {
    this.sm?.addRaster3DScene(name) ?? this.sm?.addRaster3DDivider(name);
    this.refreshLayers();
  }

  duplicateLayer(id: string): void {
    void this.sm?.duplicateLayer(id);
    this.refreshLayers();
  }

  mergeLayerDown(id: string): void {
    void this.sm?.mergeLayerDown(id);
    this.refreshLayers();
  }

  addReferenceImageLayer(name: string, file: File | Blob): void {
    void this.sm?.addReferenceImageLayer(name, file);
    this.refreshLayers();
  }

  remove3DScene(): void {
    this.sm?.removeRaster3DScene() ?? this.sm?.removeRaster3DDivider();
    this.refreshLayers();
  }

  has3DScene(): boolean {
    const sm = this.sm;
    if (typeof sm?.hasRaster3DScene === 'function') {
      return !!sm.hasRaster3DScene();
    }
    return !!sm?.hasRaster3DDivider();
  }

  // ── Undo / Redo ─────────────────────────────────────────────

  async undo(): Promise<void> { await this.sm?.rasterUndo(); }
  async redo(): Promise<void> { await this.sm?.rasterRedo(); }

  // ── Private helpers ─────────────────────────────────────────

  private _mutatePreset(mutate: (p: BrushPreset) => void): void {
    const engine = this.sm?.getRasterPaintEngine();
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
