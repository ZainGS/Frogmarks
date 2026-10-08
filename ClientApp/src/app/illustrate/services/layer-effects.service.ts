import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { hexToRgba01, rgba01ToHex } from '../utils/color-utils';
import { DEFAULT_DITHER_CONFIG, DEFAULT_FRAME_LINK_ANIMATION, DitherAlgorithm, DitherAlgorithmMenuValue, DitherColorMode, DitherConfig, DITHER_ALGORITHM_OPTIONS, FrameLinkAnimation, FrameLinkAnimationType, FrameLinkLoopMode, FRAME_LINK_TYPE_OPTIONS, FRAME_LINK_LOOP_MODE_OPTIONS, HalftoneShapeGroup, ditherAlgorithmMenuValue, halftoneShapeGroupsFor, isHalftoneAlgorithm, resolveDitherAlgorithmMenuChoice } from 'app/boards/models/brush-preset.model';

/** The engine's own dither types. Frogmarks' DitherAlgorithm can list halftone shapes a published Salsa build predates
 *  (that engine skips an unknown shape; the Shape dropdown hides them, see halftoneShapeGroups). */
type EngineDitherAlgorithm = Parameters<ShapeManager['setDitherAlgorithm']>[0];
type EngineDitherConfig = NonNullable<Parameters<ShapeManager['setLayerDitherConfig']>[1]>;

/** A default dither config with its own colour arrays — the alpha handlers write foregroundColor[3] /
 *  backgroundColor[3] in place, which on a shallow copy changed DEFAULT_DITHER_CONFIG itself (every later layer
 *  inherited the edited alpha). */
function freshDitherConfig(): DitherConfig {
  return {
    ...DEFAULT_DITHER_CONFIG,
    foregroundColor: [...DEFAULT_DITHER_CONFIG.foregroundColor] as DitherConfig['foregroundColor'],
    backgroundColor: [...DEFAULT_DITHER_CONFIG.backgroundColor] as DitherConfig['backgroundColor'],
  };
}

/** What the 2D layer effects need from the editor that hosts them. */
export interface LayerEffectsHost {
  shapeManager(): ShapeManager;
  markStateDirty(): void;
  /** Current pen colour — seeds duotone foreground colours. */
  penColor(): string;
  /** Frame Link needs the timeline: turn animation mode on if it is off. */
  ensureAnimationMode(): void;
}

/**
 * 2D layer effects: the global dither, per-layer dither (incl. GPU edge effects) and per-layer Frame Link
 * animation. Component-scoped (provided by IllustrationComponent); persistence reads / writes these configs.
 * Extracted from illustration.component (refactor-plan 2.10a).
 */
@Injectable()
export class LayerEffectsService {
  private host!: LayerEffectsHost;
  bind(host: LayerEffectsHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager(); }

  // Dither effect
  ditherConfig: DitherConfig = freshDitherConfig();

  ditherAlgorithmOptions = DITHER_ALGORITHM_OPTIONS;

  /** The halftone shape "Halftone" resumes when picked in the Algorithm dropdown (global dither / per layer). */
  lastHalftoneAlgorithm: DitherAlgorithm = DEFAULT_DITHER_CONFIG.algorithm;
  private lastLayerHalftone = new Map<string, DitherAlgorithm>();

  /** The Algorithm dropdown's value for a stored algorithm (every halftone shape is the one "Halftone" entry). */
  ditherMenuValue(algorithm: DitherAlgorithm): DitherAlgorithmMenuValue { return ditherAlgorithmMenuValue(algorithm); }

  private _engineDitherAlgorithms: readonly string[] | null | undefined;
  private _shapeGroups = new Map<string, HalftoneShapeGroup[]>();
  /** The Shape dropdown's groups: only shapes the linked Salsa build lists in ShapeManager.DitherAlgorithms (an older
   *  build lacks the 2026-10-08 shapes), plus the current one. Cached: the template calls this every check. */
  halftoneShapeGroups(current: DitherAlgorithm): HalftoneShapeGroup[] {
    if (this._engineDitherAlgorithms === undefined) {
      try {
        const list = (ShapeManager as unknown as { DitherAlgorithms?: readonly string[] }).DitherAlgorithms;
        this._engineDitherAlgorithms = Array.isArray(list) ? list : null;
      } catch { this._engineDitherAlgorithms = null; }
    }
    const supported = this._engineDitherAlgorithms;
    const key = supported && !supported.includes(current) ? current : '';
    let groups = this._shapeGroups.get(key);
    if (!groups) { groups = halftoneShapeGroupsFor(supported, current); this._shapeGroups.set(key, groups); }
    return groups;
  }

  onDitherEnabledChange(enabled: boolean): void {
    this.ditherConfig.enabled = enabled;
    // Seed FG from the current pen color when enabling
    if (enabled && this.ditherConfig.colorMode === 'duotone') {
      const fgRgba = hexToRgba01(this.host.penColor() || '#000000');
      fgRgba[3] = this.ditherConfig.foregroundColor[3];
      this.ditherConfig.foregroundColor = fgRgba;
      this.shapeManager.setDitherForegroundColor(fgRgba[0], fgRgba[1], fgRgba[2], fgRgba[3]);
    }
    this.shapeManager.setDitherEnabled(enabled);
    this.host.markStateDirty();
  }

  /** Algorithm dropdown: "Halftone" resumes the last halftone shape. */
  onDitherAlgorithmChange(choice: DitherAlgorithmMenuValue): void {
    if (isHalftoneAlgorithm(this.ditherConfig.algorithm)) this.lastHalftoneAlgorithm = this.ditherConfig.algorithm;
    const algorithm = resolveDitherAlgorithmMenuChoice(choice, this.lastHalftoneAlgorithm);
    this.ditherConfig.algorithm = algorithm;
    this.shapeManager.setDitherAlgorithm(algorithm as EngineDitherAlgorithm);
    this.host.markStateDirty();
  }

  onDitherColorLevelsChange(levels: number): void {
    this.ditherConfig.colorLevels = +levels;
    this.shapeManager.setDitherColorLevels(+levels);
    this.host.markStateDirty();
  }

  onDitherStrengthChange(strength: number): void {
    this.ditherConfig.strength = +strength;
    this.shapeManager.setDitherStrength(+strength / 100);
    this.host.markStateDirty();
  }

  onDitherPatternScaleChange(scale: number): void {
    this.ditherConfig.patternScale = +scale;
    this.shapeManager.setDitherPatternScale(+scale);
    this.host.markStateDirty();
  }

  onDitherPerChannelChange(perChannel: boolean): void {
    this.ditherConfig.perChannel = perChannel;
    this.shapeManager.setDitherPerChannel(perChannel);
    this.host.markStateDirty();
  }

  onDitherBayerLevelChange(level: number): void {
    this.ditherConfig.bayerLevel = +level;
    this.shapeManager.setDitherBayerLevel(+level);
    this.host.markStateDirty();
  }

  onDitherHalftoneAngleChange(angle: number): void {
    this.ditherConfig.halftoneAngle = +angle;
    this.shapeManager.setDitherHalftoneAngle(+angle);
    this.host.markStateDirty();
  }

  onDitherHalftoneFrequencyChange(freq: number): void {
    this.ditherConfig.halftoneFrequency = +freq;
    this.shapeManager.setDitherHalftoneFrequency(+freq);
    this.host.markStateDirty();
  }

  onDitherHalftoneShapeChange(algorithm: DitherAlgorithm): void {
    this.ditherConfig.algorithm = algorithm;
    this.lastHalftoneAlgorithm = algorithm;
    this.shapeManager.setDitherAlgorithm(algorithm as EngineDitherAlgorithm);
    this.host.markStateDirty();
  }

  get ditherStrengthPercent(): number {
    return Math.round(this.ditherConfig.strength * 100);
  }

  set ditherStrengthPercent(val: number) {
    this.ditherConfig.strength = val / 100;
    this.shapeManager.setDitherStrength(val / 100);
    this.host.markStateDirty();
  }

  onDitherColorModeChange(mode: DitherColorMode): void {
    this.ditherConfig.colorMode = mode;
    // Seed duotone FG from the current pen color
    if (mode === 'duotone') {
      const fgRgba = hexToRgba01(this.host.penColor() || '#000000');
      fgRgba[3] = this.ditherConfig.foregroundColor[3]; // preserve alpha
      this.ditherConfig.foregroundColor = fgRgba;
      this.shapeManager.setDitherForegroundColor(fgRgba[0], fgRgba[1], fgRgba[2], fgRgba[3]);
    }
    this.shapeManager.setDitherColorMode(mode);
    this.host.markStateDirty();
  }

  onDitherForegroundColorChange(hex: string): void {
    const c = hexToRgba01(hex);
    this.ditherConfig.foregroundColor = c;
    this.shapeManager.setDitherForegroundColor(c[0], c[1], c[2], c[3]);
    this.host.markStateDirty();
  }

  onDitherBackgroundColorChange(hex: string): void {
    const c = hexToRgba01(hex);
    this.ditherConfig.backgroundColor = c;
    this.shapeManager.setDitherBackgroundColor(c[0], c[1], c[2], c[3]);
    this.host.markStateDirty();
  }

  onDitherSwapColors(): void {
    const tmp = [...this.ditherConfig.foregroundColor] as [number, number, number, number];
    this.ditherConfig.foregroundColor = [...this.ditherConfig.backgroundColor] as [number, number, number, number];
    this.ditherConfig.backgroundColor = tmp;
    this.shapeManager.swapDitherColors();
    this.host.markStateDirty();
  }

  onDitherInvertPatternChange(invert: boolean): void {
    this.ditherConfig.invertPattern = invert;
    this.shapeManager.setDitherInvertPattern(invert);
    this.host.markStateDirty();
  }

  onDitherDuotoneBiasChange(value: number): void {
    this.ditherConfig.duotoneBias = +value / 100;
    this.shapeManager.setDitherDuotoneBias(+value / 100);
    this.host.markStateDirty();
  }

  onDitherTintOpacityChange(opacity: number): void {
    this.ditherConfig.tintOpacity = +opacity / 100;
    this.shapeManager.setDitherTintOpacity(+opacity / 100);
    this.host.markStateDirty();
  }

  get ditherTintPercent(): number {
    return Math.round(this.ditherConfig.tintOpacity * 100);
  }

  get ditherFgHex(): string {
    return rgba01ToHex(this.ditherConfig.foregroundColor);
  }

  get ditherBgHex(): string {
    return rgba01ToHex(this.ditherConfig.backgroundColor);
  }

  get ditherFgAlphaPercent(): number {
    return Math.round(this.ditherConfig.foregroundColor[3] * 100);
  }

  get ditherBgAlphaPercent(): number {
    return Math.round(this.ditherConfig.backgroundColor[3] * 100);
  }

  onDitherFgAlphaChange(alpha: number): void {
    this.ditherConfig.foregroundColor[3] = +alpha / 100;
    const c = this.ditherConfig.foregroundColor;
    this.shapeManager.setDitherForegroundColor(c[0], c[1], c[2], c[3]);
    this.host.markStateDirty();
  }

  onDitherBgAlphaChange(alpha: number): void {
    this.ditherConfig.backgroundColor[3] = +alpha / 100;
    const c = this.ditherConfig.backgroundColor;
    this.shapeManager.setDitherBackgroundColor(c[0], c[1], c[2], c[3]);
    this.host.markStateDirty();
  }

  // Per-layer dither
  layerDitherConfigs: Map<string, DitherConfig> = new Map();

  getLayerDitherEnabled(layerId: string): boolean {
    return this.layerDitherConfigs.get(layerId)?.enabled ?? false;
  }

  onLayerDitherEnabledChange(layerId: string, enabled: boolean): void {
    if (enabled) {
      if (!this.layerDitherConfigs.has(layerId)) {
        const cfg = { ...freshDitherConfig(), enabled: true };
        // Seed FG from pen color
        if (cfg.colorMode === 'duotone') {
          const fgRgba = hexToRgba01(this.host.penColor() || '#000000');
          fgRgba[3] = cfg.foregroundColor[3];
          cfg.foregroundColor = fgRgba;
        }
        this.layerDitherConfigs.set(layerId, cfg);
      } else {
        const cfg = this.layerDitherConfigs.get(layerId)!;
        cfg.enabled = true;
        this.layerDitherConfigs.set(layerId, cfg);
      }
      this.shapeManager.setLayerDitherConfig(layerId, this.layerDitherConfigs.get(layerId)! as EngineDitherConfig);
    } else {
      if (this.layerDitherConfigs.has(layerId)) {
        const cfg = this.layerDitherConfigs.get(layerId)!;
        cfg.enabled = false;
        this.layerDitherConfigs.set(layerId, cfg);
      }
      this.shapeManager.setLayerDitherConfig(layerId, undefined);
    }
    this.host.markStateDirty();
  }

  getLayerDitherConfig(layerId: string): DitherConfig {
    return this.layerDitherConfigs.get(layerId) ?? freshDitherConfig();
  }

  updateLayerDitherField(layerId: string, field: keyof DitherConfig, value: any): void {
    const cfg = this.getLayerDitherConfig(layerId);
    (cfg as any)[field] = value;
    this.layerDitherConfigs.set(layerId, cfg);
    if (cfg.enabled) {
      this.shapeManager.setLayerDitherConfig(layerId, cfg as EngineDitherConfig);
    }
    this.host.markStateDirty();
  }

  /** Algorithm dropdown: "Halftone" resumes this layer's last halftone shape. */
  onLayerDitherAlgorithmChange(layerId: string, choice: DitherAlgorithmMenuValue): void {
    const cur = this.getLayerDitherConfig(layerId).algorithm;
    if (isHalftoneAlgorithm(cur)) this.lastLayerHalftone.set(layerId, cur);
    this.updateLayerDitherField(layerId, 'algorithm', resolveDitherAlgorithmMenuChoice(choice, this.lastLayerHalftone.get(layerId)));
  }

  onLayerDitherStrengthChange(layerId: string, strength: number): void {
    this.updateLayerDitherField(layerId, 'strength', +strength / 100);
  }

  onLayerDitherColorLevelsChange(layerId: string, levels: number): void {
    this.updateLayerDitherField(layerId, 'colorLevels', +levels);
  }

  onLayerDitherColorModeChange(layerId: string, mode: DitherColorMode): void {
    this.updateLayerDitherField(layerId, 'colorMode', mode);
    // Seed duotone FG from pen color
    if (mode === 'duotone') {
      const cfg = this.getLayerDitherConfig(layerId);
      const fgRgba = hexToRgba01(this.host.penColor() || '#000000');
      fgRgba[3] = cfg.foregroundColor[3]; // preserve alpha
      this.updateLayerDitherField(layerId, 'foregroundColor', fgRgba);
    }
  }

  onLayerDitherFgChange(layerId: string, hex: string): void {
    this.updateLayerDitherField(layerId, 'foregroundColor', hexToRgba01(hex));
  }

  onLayerDitherBgChange(layerId: string, hex: string): void {
    this.updateLayerDitherField(layerId, 'backgroundColor', hexToRgba01(hex));
  }

  onLayerDitherFgAlphaChange(layerId: string, alpha: number): void {
    const cfg = this.getLayerDitherConfig(layerId);
    cfg.foregroundColor[3] = +alpha / 100;
    this.updateLayerDitherField(layerId, 'foregroundColor', [...cfg.foregroundColor]);
  }

  onLayerDitherBgAlphaChange(layerId: string, alpha: number): void {
    const cfg = this.getLayerDitherConfig(layerId);
    cfg.backgroundColor[3] = +alpha / 100;
    this.updateLayerDitherField(layerId, 'backgroundColor', [...cfg.backgroundColor]);
  }

  onLayerDitherSwapColors(layerId: string): void {
    const cfg = this.getLayerDitherConfig(layerId);
    const tmp = [...cfg.foregroundColor] as [number, number, number, number];
    cfg.foregroundColor = [...cfg.backgroundColor] as [number, number, number, number];
    cfg.backgroundColor = tmp;
    this.layerDitherConfigs.set(layerId, cfg);
    if (cfg.enabled) this.shapeManager.setLayerDitherConfig(layerId, cfg as EngineDitherConfig);
    this.host.markStateDirty();
  }

  /** Bake Dither needs a Salsa build with sm.bakeLayerDither (2026-10-08). */
  canBakeLayerDither(): boolean {
    return typeof (this.shapeManager as unknown as { bakeLayerDither?: unknown } | undefined)?.bakeLayerDither === 'function';
  }

  /** A bake is running (the button is disabled meanwhile). */
  bakingLayerDither = false;

  /** Bake: the engine writes the layer's dithered look into its pixels (one raster undo entry) and turns the dither
   *  off, keeping the settings. Mirrored here so the panel and the saved document agree. */
  async onLayerDitherBake(layerId: string | null): Promise<void> {
    const sm = this.shapeManager as unknown as { bakeLayerDither?: (id: string) => Promise<boolean> } | undefined;
    if (!layerId || this.bakingLayerDither || typeof sm?.bakeLayerDither !== 'function') return;
    this.bakingLayerDither = true;
    try {
      if (!(await sm.bakeLayerDither(layerId))) return;
      const cfg = this.layerDitherConfigs.get(layerId);
      if (cfg) cfg.enabled = false;
      this.host.markStateDirty();
    } catch (e) {
      console.warn('[LayerEffects] bake dither failed', e);
    } finally {
      this.bakingLayerDither = false;
    }
  }

  /** After a raster undo / redo: undoing a Bake turns the layer's dither back on in the engine, redoing it turns it
   *  off — follow the engine's on / off state (only where it differs from ours). */
  syncLayerDitherEnabledFromEngine(): void {
    const sm = this.shapeManager;
    if (!sm?.getLayerDitherConfig) return;
    let changed = false;
    for (const layer of sm.getRasterLayers?.() ?? []) {
      try {
        const raw = sm.getLayerDitherConfig(layer.id);
        if (!raw || typeof raw.enabled !== 'boolean') continue;
        const cur = this.layerDitherConfigs.get(layer.id);
        if (cur && cur.enabled === raw.enabled) continue;
        this.layerDitherConfigs.set(layer.id, { ...raw } as DitherConfig);
        changed = true;
      } catch { /* API may not exist */ }
    }
    if (changed) this.host.markStateDirty();
  }

  /** Sync the UI-side layerDitherConfigs map from the engine's per-layer dither state. */
  _syncLayerDitherConfigsFromEngine(): void {
    const sm = this.shapeManager;
    if (!sm?.getLayerDitherConfig) return;
    const layers = sm.getRasterLayers() ?? [];
    for (const layer of layers) {
      try {
        const raw = sm.getLayerDitherConfig(layer.id);
        if (raw && raw.enabled !== undefined) {
          this.layerDitherConfigs.set(layer.id, { ...raw });
        }
      } catch { /* API may not exist */ }
    }
  }

  onLayerDitherInvertChange(layerId: string, invert: boolean): void {
    this.updateLayerDitherField(layerId, 'invertPattern', invert);
  }

  onLayerDitherBiasChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'duotoneBias', +value / 100);
  }

  onLayerDitherTintChange(layerId: string, opacity: number): void {
    this.updateLayerDitherField(layerId, 'tintOpacity', +opacity / 100);
  }

  onLayerDitherScaleChange(layerId: string, scale: number): void {
    this.updateLayerDitherField(layerId, 'patternScale', +scale);
  }

  onLayerDitherPerChannelChange(layerId: string, perChannel: boolean): void {
    this.updateLayerDitherField(layerId, 'perChannel', perChannel);
  }

  onLayerDitherBayerLevelChange(layerId: string, level: number): void {
    this.updateLayerDitherField(layerId, 'bayerLevel', +level);
  }

  onLayerDitherHalftoneShapeChange(layerId: string, algorithm: DitherAlgorithm): void {
    this.lastLayerHalftone.set(layerId, algorithm);
    this.updateLayerDitherField(layerId, 'algorithm', algorithm);
  }

  onLayerDitherHalftoneAngleChange(layerId: string, angle: number): void {
    this.updateLayerDitherField(layerId, 'halftoneAngle', +angle);
  }

  onLayerDitherHalftoneFrequencyChange(layerId: string, freq: number): void {
    this.updateLayerDitherField(layerId, 'halftoneFrequency', +freq);
  }

  onLayerDitherEdgeWidthChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'edgeWidth', +value);
  }

  onLayerDitherEdgeFadeChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'edgeFade', +value / 100);
  }

  onLayerDitherEdgeShrinkChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'edgeShrink', +value / 100);
  }

  onLayerDitherEdgeDensityChange(layerId: string, value: number): void {
    this.updateLayerDitherField(layerId, 'edgeDensity', +value / 100);
  }

  onLayerDitherEdgeSeedReroll(layerId: string): void {
    const current = (this.getLayerDitherConfig(layerId) as any)['edgeSeed'] ?? 0;
    this.updateLayerDitherField(layerId, 'edgeSeed', (current + 1) % 65536);
  }

  onLayerDitherEdgeModeChange(layerId: string, mode: 'content' | 'canvas' | 'both'): void {
    this.updateLayerDitherField(layerId, 'edgeMode', mode);
  }

  isGpuDitherAlgorithm(algorithm: DitherAlgorithm): boolean {
    return isHalftoneAlgorithm(algorithm) || ['bayer', 'blue_noise', 'noise'].includes(algorithm as string);
  }

  frameLinkTypeOptions = FRAME_LINK_TYPE_OPTIONS;

  frameLinkLoopModeOptions = FRAME_LINK_LOOP_MODE_OPTIONS;

  layerFrameLinkConfigs = new Map<string, FrameLinkAnimation>();

  getLayerFrameLinkConfig(layerId: string): FrameLinkAnimation {
    if (!this.layerFrameLinkConfigs.has(layerId)) {
      // Try reading from engine first
      const sm = this.shapeManager;
      const existing = sm?.getLayerFrameLinkAnimation(layerId);
      this.layerFrameLinkConfigs.set(layerId, existing ? { ...existing } : { ...DEFAULT_FRAME_LINK_ANIMATION });
    }
    return this.layerFrameLinkConfigs.get(layerId)!;
  }

  updateFrameLinkField<K extends keyof FrameLinkAnimation>(layerId: string, field: K, value: FrameLinkAnimation[K]): void {
    const cfg = this.getLayerFrameLinkConfig(layerId);
    (cfg as any)[field] = value;
    this.layerFrameLinkConfigs.set(layerId, cfg);
    this.host.markStateDirty();
    if (cfg.enabled) {
      this.shapeManager?.setLayerFrameLinkAnimation(layerId, cfg);
    }
  }

  onFrameLinkEnabledChange(layerId: string, enabled: boolean): void {
    const cfg = this.getLayerFrameLinkConfig(layerId);
    cfg.enabled = enabled;
    this.layerFrameLinkConfigs.set(layerId, cfg);
    const sm = this.shapeManager;
    if (enabled) {
      sm?.setLayerFrameLinkAnimation(layerId, cfg);
      // Auto-enable animation mode so the user sees the effect immediately
      this.host.ensureAnimationMode();
    } else {
      sm?.setLayerFrameLinkAnimation(layerId, undefined);
    }
    this.host.markStateDirty();
  }

  onFrameLinkTypeChange(layerId: string, type: FrameLinkAnimationType): void {
    this.updateFrameLinkField(layerId, 'type', type);
  }

  onFrameLinkAmplitudeChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'amplitude', +v);
  }

  onFrameLinkFrequencyChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'frequency', +v);
  }

  onFrameLinkSpeedChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'speed', +v / 100);
  }

  onFrameLinkDirectionChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'direction', +v);
  }

  onFrameLinkPhaseChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'phase', +v / 100);
  }

  onFrameLinkLoopModeChange(layerId: string, mode: FrameLinkLoopMode): void {
    this.updateFrameLinkField(layerId, 'loopMode', mode);
  }

  onFrameLinkDisplaceXChange(layerId: string, v: boolean): void {
    this.updateFrameLinkField(layerId, 'displaceX', v);
  }

  onFrameLinkDisplaceYChange(layerId: string, v: boolean): void {
    this.updateFrameLinkField(layerId, 'displaceY', v);
  }

  onFrameLinkRippleCenterXChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'rippleCenterX', +v / 100);
  }

  onFrameLinkRippleCenterYChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'rippleCenterY', +v / 100);
  }

  onFrameLinkOctavesChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'noiseOctaves', +v);
  }

  onFrameLinkLacunarityChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'noiseLacunarity', +v / 10);
  }

  onFrameLinkPersistenceChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'noisePersistence', +v / 100);
  }

  onFrameLinkSeedChange(layerId: string, v: number): void {
    this.updateFrameLinkField(layerId, 'shakeSeed', +v);
  }

  /**
   * Apply a saved dither configuration to both the local UI state and the engine.
   */
  _applyDitherConfig(config: any): void {
    this.ditherConfig = {
      enabled: config.enabled ?? false,
      algorithm: config.algorithm ?? 'halftone_dot',
      colorLevels: config.colorLevels ?? 2,
      bayerLevel: config.bayerLevel ?? 2,
      halftoneAngle: config.halftoneAngle ?? 45,
      halftoneFrequency: config.halftoneFrequency ?? 40,
      strength: config.strength ?? 1.0,
      patternScale: config.patternScale ?? 0.25,
      perChannel: config.perChannel ?? false,
      colorMode: config.colorMode ?? 'duotone',
      foregroundColor: config.foregroundColor ?? [0, 0, 0, 1],
      backgroundColor: config.backgroundColor ?? [1, 1, 1, 0],
      invertPattern: config.invertPattern ?? false,
      duotoneBias: config.duotoneBias ?? 0.5,
      tintOpacity: config.tintOpacity ?? 1.0,
      edgeWidth: config.edgeWidth ?? 0,
      edgeFade: config.edgeFade ?? 0,
      edgeShrink: config.edgeShrink ?? 0,
      edgeDensity: config.edgeDensity ?? 0,
      edgeSeed: config.edgeSeed ?? 0,
      edgeMode: config.edgeMode ?? 'content',
    };

    const sm = this.shapeManager;
    sm.setDitherEnabled(this.ditherConfig.enabled);
    sm.setDitherAlgorithm(this.ditherConfig.algorithm as EngineDitherAlgorithm);
    sm.setDitherColorLevels(this.ditherConfig.colorLevels);
    sm.setDitherBayerLevel(this.ditherConfig.bayerLevel);
    sm.setDitherHalftoneAngle(this.ditherConfig.halftoneAngle);
    sm.setDitherHalftoneFrequency(this.ditherConfig.halftoneFrequency);
    sm.setDitherStrength(this.ditherConfig.strength);
    sm.setDitherPatternScale(this.ditherConfig.patternScale);
    sm.setDitherPerChannel(this.ditherConfig.perChannel);
    sm.setDitherColorMode(this.ditherConfig.colorMode);
    const fg = this.ditherConfig.foregroundColor;
    sm.setDitherForegroundColor(fg[0], fg[1], fg[2], fg[3]);
    const bg = this.ditherConfig.backgroundColor;
    sm.setDitherBackgroundColor(bg[0], bg[1], bg[2], bg[3]);
    sm.setDitherInvertPattern(this.ditherConfig.invertPattern);
    sm.setDitherDuotoneBias(this.ditherConfig.duotoneBias);
    sm.setDitherTintOpacity(this.ditherConfig.tintOpacity);
  }
}
