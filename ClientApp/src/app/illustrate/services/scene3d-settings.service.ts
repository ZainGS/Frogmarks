import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { hexToRgba01, hexToRgba01Obj } from '../utils/color-utils';

/** What the scene settings need from the editor that hosts them. */
export interface Scene3dSettingsHost {
  shapeManager(): ShapeManager;
  markDirty(): void;
  /** The city follows the Environment style. */
  syncCityStyleFromEngine(): void;
}

export const GPU_CULL_OPTIONS: { key: 'auto' | 'on' | 'off'; label: string; desc: string }[] = [
  { key: 'auto', label: 'Auto (recommended)', desc: 'Picks the faster path from moment to moment: GPU culling while the CPU is the bottleneck, the classic path while the GPU is. Live status in City -> Performance.' },
  { key: 'on', label: 'On', desc: 'The GPU decides what to draw. Frees the CPU; can cost a little GPU time in very large tiled worlds.' },
  { key: 'off', label: 'Off', desc: 'The classic CPU path: the CPU decides and submits every draw.' },
];

/** ANTI-ALIASING / UPSCALING (Salsa engine-roadmap step 6, sm.setTemporalAA3D): shared by Global -> Rendering and
 *  City -> Performance (Resolution group). A per-machine setting; the engine keeps it in localStorage. */
export const TEMPORAL_AA_OPTIONS: { key: 'off' | 'taa' | 'taau'; label: string; desc: string }[] = [
  { key: 'off', label: 'Off (FXAA)', desc: 'No temporal anti-aliasing: the 3D view uses the Anti-aliasing (FXAA) setting. Crisp stills; thin wires and edges shimmer in motion.' },
  { key: 'taa', label: 'TAA (native resolution)', desc: 'Temporal anti-aliasing: blends slightly shifted frames for smooth edges, thin wires, sign text and dither fades. Replaces FXAA, costs about the same GPU time. Exports stay native; retro / PS1 looks keep it off.' },
  { key: 'taau', label: 'TAAU upscaling (faster)', desc: 'Renders the 3D scene at 65 % (or at the Resolution scaling scale when that is on) and rebuilds a sharp full-size image from previous frames. Much less GPU time on big screens; a little softer in fast motion.' },
];

/**
 * Scene-wide 3D render / environment settings: PS1 retro, lighting, wind, background, fog (+ horizon), visual
 * quality, IBL + sky, SSR, post-processing, SSAO, shadows, culling, grid, snap, environment style, export.
 * Component-scoped (provided by IllustrationComponent). Persistence reads and writes these fields — one owner
 * for the editor copy of each setting. Extracted from illustration.component (refactor-plan 2.9B).
 */
@Injectable()
export class Scene3dSettingsService {
  private host!: Scene3dSettingsHost;
  bind(host: Scene3dSettingsHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager(); }

  // 3D Ground Grid
  scene3dGridVisible = true;

  scene3dGridOpacity = 0.30;

  scene3dGridColor: [number, number, number] = [64/255, 64/255, 64/255];

  get scene3dGridColorHex(): string {
    const [r, g, b] = this.scene3dGridColor;
    return '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  scene3dSkyPresets: string[] = [];

  scene3dActiveSkyPreset: string | null = null;

  scene3dDiffuseIBL = 1.0;

  scene3dSpecularIBL = 1.0;

  scene3dSSREnabled = false;

  scene3dSSRIntensity = 1.0;

  scene3dSSRFillBlur = 2.0;

  scene3dSSRThickness = 2.0;

  scene3dSSRReach = 12.8;

  scene3dSSRShadow = 0.35;

  // Phase 4: shadows
  scene3dShadowsEnabled = false;

  scene3dShadowMapSize = 1024;

  /** Global shadow quality preset (Salsa setShadowQualityPreset3D); 'custom' = not chosen / set by hand. */
  scene3dShadowQuality: string = 'custom';

  scene3dShadowExtent = 15;

  scene3dShadowBias = 0.002;

  scene3dShadowStrength = 0.58;

  // Phase 4: performance/debug
  scene3dFrustumCulling = true;

  // PS1 config (spec defaults)
  scene3dPS1Jitter = 0.8;

  scene3dPS1Snap = 160;

  scene3dPS1Affine = 0.5;

  scene3dPS1ColorDepth = 32;

  scene3dPS1LoRes = false;

  scene3dPS1ResW = 320;

  scene3dPS1ResH = 240;

  scene3dPS1Dither = false;

  scene3dPS1DitherStrength = 0.45;

  scene3dPS1UVQuantize = false;

  scene3dPS1UVSteps = 64;

  /** Which meshes the colour depth + dither apply to (Salsa PS1Config.colorScope, persisted by Salsa):
   *  'all' = everything (default) · 'optIn' = only meshes/characters with Retro colour on. */
  scene3dRetroColorScope: 'all' | 'optIn' = 'all';

  // Scene background / skybox
  scene3dBgMode: 'none' | 'solid' | 'gradient' | 'wavy' | 'checkers' = 'none';

  scene3dBgColor1 = '#1a1a2e';

  scene3dBgColor2 = '#99aabb';

  // Enhanced visuals
  scene3dEnhancedVisuals = false;

  scene3dGlassQuality = false;

  scene3dAerialPerspective = 0;

  // Fog
  scene3dFogMode: 'off' | 'linear' | 'exponential' = 'off';

  scene3dFogColor = '#cccccc';

  scene3dFogNear = 5;

  scene3dFogFar = 20;

  scene3dFogDensity = 0.08;

  /** Hard fog edge (Salsa 2026-10-01): sharp linear cutoff — haze effects off, the city leaves the fog alone. */
  scene3dFogHardEdge = false;

  /** Fog horizon (Salsa 2026-10-01, sm.setFogHorizon3D; only while Hard edge + linear fog): past Far draw building
   *  silhouettes only, optionally with their signs / awnings / rooftop equipment, dissolving the rest over a fade band. */
  scene3dFogBuildingsOnly = false;

  scene3dFogIncludeAttachments = false;

  scene3dFogFadeM = 15;

  scene3dFogFadeStyle: 'dither' | 'dither-coarse' = 'dither';

  scene3dFogSilhouetteOutlines = true;

  // Texture sampling
  scene3dTextureFilter: 'nearest' | 'linear' = 'nearest';

  // Lighting (spec defaults — matches salsa's built-in default)
  scene3dLightAzimuth = -31;

  scene3dLightElevation = 54;

  scene3dLightIntensity = 1.0;

  scene3dKeyLightColorHex = '#ffffff';

  scene3dAmbientR = 0.17;

  scene3dAmbientG = 0.17;

  scene3dAmbientB = 0.17;

  scene3dAmbientIntensity = 1.0;

  scene3dAmbientColorHex = '#2b2b2b';

  // Scene wind (S1 foliage sway) — defaults match Salsa's DEFAULT_SCENE_WIND
  sceneWindDirDeg = 35;

  sceneWindStrength = 0.06;

  sceneWindSpeed = 1.0;

  // IBL / Environment Map (global scene)
  scene3dIblEnabled = false;

  scene3dIblIntensity = 1.0;

  // GLB export
  scene3dExportStats: string | null = null;

  // Post-processing (global scene)
  scene3dBloomEnabled = false;

  scene3dBloomThreshold = 0.8;

  scene3dBloomIntensity = 1.0;

  scene3dColorGradeEnabled = false;

  scene3dColorGradeBrightness = 0.0;

  scene3dColorGradeContrast = 0.0;

  scene3dColorGradeSaturation = 0.0;

  scene3dColorGradeTint = '#ffffff';

  scene3dVignetteEnabled = false;

  scene3dVignetteIntensity = 0.45;

  scene3dVignetteRadius = 0.75;

  scene3dVignetteSoftness = 0.45;

  // Film look (grain / colour fringing / halation — halation needs bloom)
  scene3dFilmEnabled = false;

  scene3dFilmGrain = 0.06;

  scene3dFilmGrainSize = 1.5;

  scene3dFilmAberration = 0.0025;

  scene3dFilmHalation = 0.35;

  scene3dFilmHalationTint = '#ff6a3d';

  // SSAO (ambient occlusion)
  scene3dSSAOEnabled         = false;

  scene3dSSAORadius          = 0.5;

  scene3dSSAOIntensity       = 0.8;

  scene3dSSAOPower           = 2.0;

  scene3dSSAOBias            = 0.025;

  scene3dSSAOResolutionScale = 0.5;

  scene3dSSAOSamples         = 8;

  scene3dSSAODebug           = false;

  scene3dSnapMode: 'none' | 'grid' | 'vertex' = 'grid';

  scene3dSnapGridSize = 0.05;

  scene3dSnapAngleDeg = 15;

  scene3dSnapScaleStep = 0.25;

  scene3dLoadSkyPresets(): void {
    const sm = this.shapeManager;
    this.scene3dSkyPresets = sm.listSkyPresets3D() ?? [];
  }

  scene3dApplySkyPreset(name: string): void {
    const sm = this.shapeManager;
    sm.applySkyPreset3D(name as any);
    this.scene3dActiveSkyPreset = name;
    this.scene3dSyncIBLSliders();
    this.host.markDirty();
  }

  scene3dClearSky(): void {
    this.shapeManager.resetSky3D();
    this.scene3dActiveSkyPreset = null;
    this.scene3dSyncIBLSliders();
    this.host.markDirty();
  }

  scene3dSyncIBLSliders(): void {
    const intensities = this.shapeManager.getIBLIntensities3D();
    if (intensities) {
      this.scene3dDiffuseIBL = intensities.diffuse ?? 1.0;
      this.scene3dSpecularIBL = intensities.specular ?? 1.0;
    }
  }

  scene3dSetDiffuseIBL(v: number): void {
    this.scene3dDiffuseIBL = v;
    this.shapeManager.setIBLDiffuseIntensity3D(v);
    this.host.markDirty();
  }

  scene3dSetSpecularIBL(v: number): void {
    this.scene3dSpecularIBL = v;
    this.shapeManager.setIBLSpecularIntensity3D(v);
    this.host.markDirty();
  }

  scene3dToggleSSR(): void {
    const sm = this.shapeManager;
    if (this.scene3dSSREnabled) {
      const r = sm.getReflections3D();
      if (r) {
        this.scene3dSSRIntensity = r.ssrIntensity ?? 1.0;
        this.scene3dSSRFillBlur = r.ssrFillBlur ?? 2.0;
        this.scene3dSSRThickness = r.ssrEdgeFeather ?? 2.0;
        this.scene3dSSRReach = r.ssrReach ?? 12.8;
        this.scene3dSSRShadow = r.ssrFallbackShadow ?? 0.35;
      }
    }
    sm.setSSR3D({ ssr: this.scene3dSSREnabled, ssrIntensity: this.scene3dSSRIntensity });
    this.host.markDirty();
  }

  scene3dSetSSRIntensity(v: number): void {
    this.scene3dSSRIntensity = v;
    if (this.scene3dSSREnabled) {
      this.shapeManager.setSSR3D({ ssrIntensity: v });
    }
    this.host.markDirty();
  }

  scene3dSetSSRFillBlur(v: number): void {
    this.scene3dSSRFillBlur = v;
    if (this.scene3dSSREnabled) {
      this.shapeManager.setSSR3D({ ssrFillBlur: v });
    }
    this.host.markDirty();
  }

  scene3dSetSSRThickness(v: number): void {
    this.scene3dSSRThickness = v;
    if (this.scene3dSSREnabled) {
      this.shapeManager.setSSR3D({ ssrEdgeFeather: v });
    }
    this.host.markDirty();
  }

  scene3dSetSSRReach(v: number): void {
    this.scene3dSSRReach = v;
    if (this.scene3dSSREnabled) {
      this.shapeManager.setSSR3D({ ssrReach: v });
    }
    this.host.markDirty();
  }

  scene3dSetSSRShadow(v: number): void {
    this.scene3dSSRShadow = v;
    if (this.scene3dSSREnabled) {
      this.shapeManager.setSSR3D({ ssrFallbackShadow: v });
    }
    this.host.markDirty();
  }

  /** Environment / IBL "Intensity": the diffuse IBL strength, applied live (it used to take effect only on the next
   *  HDR upload). Same engine value as the sky's diffuse IBL. */
  scene3dSetIblIntensity(v: number): void {
    const n = +v;
    if (!Number.isFinite(n)) return;
    this.scene3dIblIntensity = n;
    this.scene3dDiffuseIBL = n;
    this.shapeManager.setIBLDiffuseIntensity3D(n);
    this.host.markDirty();
  }

  async scene3dUploadEnvironmentMap(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const sm = this.shapeManager;
    sm.setEnvironmentMap3D(imageData, this.scene3dIblIntensity);
    this.scene3dIblEnabled = true;
    this.host.markDirty();
  }

  scene3dClearEnvironmentMap(): void {
    this.shapeManager.clearEnvironmentMap3D();
    this.scene3dIblEnabled = false;
    this.host.markDirty();
  }

  scene3dExportGlb(): void {
    const result = this.shapeManager.exportSceneGltf3D();
    if (!result?.blob) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.glb';
    a.click();
    URL.revokeObjectURL(url);
    this.scene3dExportStats =
      `${result.meshCount ?? 0} mesh, ${result.skeletonCount ?? 0} skel, ` +
      `${result.animationCount ?? 0} anim, ${result.vertexCount ?? 0} verts`;
  }

  scene3dApplyPostProcessing(): void {
    const tint = this.scene3dColorGradeTint;
    const tr = parseInt(tint.slice(1, 3), 16) / 255;
    const tg = parseInt(tint.slice(3, 5), 16) / 255;
    const tb = parseInt(tint.slice(5, 7), 16) / 255;
    this.shapeManager.setPostProcessing3D({
      bloom: {
        enabled: this.scene3dBloomEnabled,
        threshold: this.scene3dBloomThreshold,
        intensity: this.scene3dBloomIntensity,
      },
      colorGrade: {
        enabled: this.scene3dColorGradeEnabled,
        brightness: this.scene3dColorGradeBrightness,
        contrast: this.scene3dColorGradeContrast,
        saturation: this.scene3dColorGradeSaturation,
        tint: [tr, tg, tb] as [number, number, number],
      },
      vignette: {
        enabled: this.scene3dVignetteEnabled,
        intensity: this.scene3dVignetteIntensity,
        radius: this.scene3dVignetteRadius,
        softness: this.scene3dVignetteSoftness,
      },
      film: {
        enabled: this.scene3dFilmEnabled,
        grain: this.scene3dFilmGrain,
        grainSize: this.scene3dFilmGrainSize,
        aberration: this.scene3dFilmAberration,
        halation: this.scene3dFilmHalation,
        halationTint: hexToRgba01(this.scene3dFilmHalationTint).slice(0, 3) as [number, number, number],
      },
    });
    this.host.markDirty();
  }

  scene3dApplySSAO(): void {
    const sm = this.shapeManager;
    sm.scene3d?.setSSAO3D(this.scene3dSSAOEnabled, {
      radius:          this.scene3dSSAORadius,
      intensity:       this.scene3dSSAOIntensity,
      power:           this.scene3dSSAOPower,
      bias:            this.scene3dSSAOBias,
      resolutionScale: this.scene3dSSAOResolutionScale,
      samples:         this.scene3dSSAOSamples,
    });
    if (!this.scene3dSSAOEnabled && this.scene3dSSAODebug) {
      this.scene3dSSAODebug = false;
      sm.scene3d?.setSSAODebug3D(false);
    }
    this.host.markDirty();
  }

  scene3dToggleSSAODebug(on: boolean): void {
    this.scene3dSSAODebug = on;
    this.shapeManager.scene3d?.setSSAODebug3D(on);
    this.host.markDirty();
  }

  _scene3dLoadSnapSettings(): void {
    const sm = this.shapeManager;
    this.scene3dSnapMode      = sm.snapMode3D ?? 'grid';
    this.scene3dSnapGridSize  = sm.snapGridSize3D ?? 0.1;
    this.scene3dSnapAngleDeg  = Math.round(((sm.snapAngle3D ?? (Math.PI / 12)) * 180 / Math.PI) * 10) / 10;
    this.scene3dSnapScaleStep = sm.snapScaleStep3D ?? 0.25;
  }

  scene3dSetSnapMode(mode: 'none' | 'grid' | 'vertex'): void {
    this.scene3dSnapMode = mode;
    this.shapeManager.snapMode3D = mode;
    this.host.markDirty();
  }

  scene3dUpdateSnapSettings(): void {
    const sm = this.shapeManager;
    sm.snapGridSize3D   = this.scene3dSnapGridSize;
    sm.snapAngle3D      = this.scene3dSnapAngleDeg * Math.PI / 180;
    sm.snapScaleStep3D  = this.scene3dSnapScaleStep;
  }

  _loadScene3dGrid(): void {
    const sm = this.shapeManager;
    this.scene3dGridVisible = sm.sceneGridVisible3D ?? false;
    this.scene3dGridOpacity = sm.sceneGridOpacity3D ?? 0.5;
    this.scene3dGridColor   = sm.sceneGridColor3D ? [...sm.sceneGridColor3D] as [number, number, number] : [0.5, 0.5, 0.5];
  }

  applyScene3dGrid(): void {
    const sm = this.shapeManager;
    if (!sm) return;
    sm.sceneGridVisible3D = this.scene3dGridVisible;
    sm.sceneGridOpacity3D = this.scene3dGridOpacity;
    sm.sceneGridColor3D   = [...this.scene3dGridColor];
    this.host.markDirty();
  }

  // (Play settings popover → <app-scene-view-bar>)
  scene3dCharOutlines = false;

  scene3dSetCharOutlines(on: boolean): void {
    this.scene3dCharOutlines = on;
    this.shapeManager.setCharacterOutlines3D(on ? {} : null);
    this.host.markDirty();
  }

  /** The Environment style — the city + every block + every creator prop at once; new ones start with it.
   *  Characters keep their own style. '' = not set (each object keeps its generator's look). */
  envStyleRender = '';

  envStyleToon = false;

  envStyleRim = false;

  scene3dSetEnvStyleRender(style: string): void {
    this.envStyleRender = style;
    this.shapeManager.setEnvironmentStyle3D({ renderStyle: (style || null) as any });
    this.host.syncCityStyleFromEngine();   // the city follows the environment
    this.host.markDirty();
  }

  scene3dSetEnvStyleFlag(field: 'toonShadow' | 'rimLight', on: boolean): void {
    if (field === 'toonShadow') this.envStyleToon = on; else this.envStyleRim = on;
    this.shapeManager.setEnvironmentStyle3D({ [field]: on ? true : null });
    this.host.syncCityStyleFromEngine();
    this.host.markDirty();
  }

  _syncEnvironmentStyleFromEngine(): void {
    const es = this.shapeManager.getEnvironmentStyle3D();
    this.envStyleRender = es?.renderStyle ?? '';
    this.envStyleToon = !!es?.toonShadow;
    this.envStyleRim = !!es?.rimLight;
    this.scene3dCharOutlines = !!this.shapeManager.getCharacterOutlines3D();
  }

  scene3dToggleShadows(enabled: boolean): void {
    this.scene3dShadowsEnabled = enabled;
    const sm = this.shapeManager;
    if (enabled) {
      sm.scene3d?.enableShadows(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias);
    } else {
      sm.scene3d?.disableShadows();
    }
    this.host.markDirty();
  }

  scene3dApplyShadowsSettings(): void {
    if (!this.scene3dShadowsEnabled) return;
    const sm = this.shapeManager;
    sm.scene3d?.enableShadows(this.scene3dShadowMapSize, this.scene3dShadowExtent, this.scene3dShadowBias);
    sm.scene3d?.setShadowStrength3D(this.scene3dShadowStrength);
    this.scene3dShadowQuality = this.shapeManager.getShadowQualityPreset3D()?.quality ?? 'custom';   // a hand-set map size leaves the preset
    this.host.markDirty();
  }

  /** Shadow quality preset for the scene (Salsa setShadowQualityPreset3D): map size, cascades and edge filter together.
   *  In City mode the engine routes it to the city LOD settings (the Performance panel shows the same). */
  scene3dSetShadowQuality(q: string): void {
    if (q === 'custom') return;
    const sm = this.shapeManager;
    const r = sm.setShadowQualityPreset3D((q as any));
    this.scene3dShadowQuality = r?.quality ?? q;
    const size = sm.scene3d?.shadowMapSize3D;
    if (typeof size === 'number' && size > 0) this.scene3dShadowMapSize = size;
    this.host.markDirty();
  }

  scene3dSetFrustumCulling(enabled: boolean): void {
    this.scene3dFrustumCulling = enabled;
    const sm = this.shapeManager;
    if (sm.scene3d) sm.scene3d.frustumCulling = enabled;
    if ('frustumCulling3D' in sm) sm.frustumCulling3D = enabled;
    this.host.markDirty();
  }

  scene3dApplyRetroPreset(preset: 'wobble' | 'pocket' | 'off'): void {
    this.shapeManager.setRetroPreset3D(preset);
    this._syncScene3dPS1FromEngine();
    this.host.markDirty();
  }

  /** Read the PS1 panel fields back FROM the engine (2026-09-29). Salsa restores these settings with the document,
   *  but the panel kept its defaults (colour depth 32, dither off) — and every PS1 control sends the WHOLE panel
   *  (scene3dApplyPS1), so touching any slider after a reload silently reset dither / colour depth. Called after a
   *  retro preset and once when loading finishes (markLoaded). No dirty-mark: it only mirrors engine state. */
  _syncScene3dPS1FromEngine(): void {
    const cfg = (this.shapeManager.scene3d?.getPS1Config() as any) ?? {};
    this.scene3dRetroColorScope = cfg.colorScope === 'optIn' ? 'optIn' : 'all';
    this.scene3dPS1Jitter        = cfg.vertexJitter        ?? this.scene3dPS1Jitter;
    this.scene3dPS1Snap          = cfg.snapGridSize        ?? this.scene3dPS1Snap;
    this.scene3dPS1Affine        = cfg.affineStrength ?? cfg.affineWarp ?? this.scene3dPS1Affine;
    this.scene3dPS1ColorDepth    = cfg.colorDepth          ?? this.scene3dPS1ColorDepth;
    this.scene3dPS1Dither        = cfg.dither              ?? false;
    this.scene3dPS1DitherStrength = cfg.ditherStrength     ?? 0.45;
    this.scene3dPS1UVQuantize    = cfg.uvQuantize          ?? false;
    this.scene3dPS1UVSteps       = cfg.uvQuantizeSteps     ?? 64;
    if (cfg.renderResolution) {
      this.scene3dPS1LoRes = true;
      this.scene3dPS1ResW  = cfg.renderResolution[0];
      this.scene3dPS1ResH  = cfg.renderResolution[1];
    } else {
      this.scene3dPS1LoRes = false;
    }
  }

  /** Colour depth + dither on everything, or only on opted-in meshes / characters (Salsa, persisted). */
  scene3dSetRetroColorScope(scope: 'all' | 'optIn'): void {
    this.scene3dRetroColorScope = scope;
    this.shapeManager.setRetroColorScope3D(scope);
    this.host.markDirty();
  }

  scene3dApplyPS1(): void {
    const cfg: any = {
      vertexJitter:    +this.scene3dPS1Jitter,
      snapGridSize:    +this.scene3dPS1Snap,
      affineStrength:  +this.scene3dPS1Affine,
      colorDepth:      +this.scene3dPS1ColorDepth,
      dither:          this.scene3dPS1Dither,
      ditherStrength:  +this.scene3dPS1DitherStrength,
      uvQuantize:      this.scene3dPS1UVQuantize,
      uvQuantizeSteps: +this.scene3dPS1UVSteps,
      renderResolution: this.scene3dPS1LoRes
        ? [+this.scene3dPS1ResW, +this.scene3dPS1ResH] as [number, number]
        : null,
    };
    this.shapeManager.scene3d?.setPS1Config(cfg);
    this.host.markDirty();
  }

  scene3dApplyLighting(): void {
    const sm = this.shapeManager;
    const s3d = sm.scene3d;
    if (!s3d) return;
    sm.setLightAngles3D(this.scene3dLightAzimuth, this.scene3dLightElevation);
    sm.setLightIntensity3D(+this.scene3dLightIntensity);
    const kc = hexToRgba01(this.scene3dKeyLightColorHex);
    sm.setLightColor3D(kc[0], kc[1], kc[2]);
    const ac = hexToRgba01(this.scene3dAmbientColorHex);
    this.scene3dAmbientR = ac[0]; this.scene3dAmbientG = ac[1]; this.scene3dAmbientB = ac[2];
    s3d.setAmbientLight(ac[0], ac[1], ac[2], +this.scene3dAmbientIntensity);
    this.host.markDirty();
  }

  scene3dApplyWind(): void {
    this.shapeManager.setSceneWind3D({
      dirDeg:   this.sceneWindDirDeg,
      strength: +this.sceneWindStrength,
      speed:    +this.sceneWindSpeed,
    });
    this.host.markDirty();
  }

  scene3dApplySceneBg(): void {
    const c1 = hexToRgba01Obj(this.scene3dBgColor1);
    const c2 = hexToRgba01Obj(this.scene3dBgColor2);
    this.shapeManager.setSceneBg3D({
      mode: this.scene3dBgMode,
      color1: [c1.r, c1.g, c1.b, 1],
      color2: [c2.r, c2.g, c2.b, 1],
    });
    this.host.markDirty();
  }

  scene3dApplyFog(): void {
    const c = hexToRgba01Obj(this.scene3dFogColor);
    this.shapeManager.setFog3D({
      mode: this.scene3dFogMode,
      color: [c.r, c.g, c.b],
      near: +this.scene3dFogNear,
      far: +this.scene3dFogFar,
      density: +this.scene3dFogDensity,
    });
    this.host.markDirty();
  }

  scene3dSetFogHardEdge(on: boolean): void {
    this.scene3dFogHardEdge = on;
    this.shapeManager.setFogHardEdge3D(on);
    // Turning it on hands the fog to this panel: push the panel's values so they win over the city's.
    if (on) this.scene3dApplyFog();
    this.host.markDirty();
  }

  /** Push the fog-horizon settings (Salsa sm.setFogHorizon3D; inert unless Hard edge is on and the fog is linear). */
  scene3dApplyFogHorizon(): void {
    this.shapeManager.setFogHorizon3D({
      buildingsOnly: !!this.scene3dFogBuildingsOnly,
      includeAttachments: !!this.scene3dFogIncludeAttachments,
      fadeM: Math.max(0, +this.scene3dFogFadeM || 0),
      fadeStyle: this.scene3dFogFadeStyle === 'dither-coarse' ? 'dither-coarse' : 'dither',
      silhouetteOutlines: !!this.scene3dFogSilhouetteOutlines,
    });
    this.host.markDirty();
  }

  scene3dSetEnhancedVisuals(on: boolean): void {
    this.scene3dEnhancedVisuals = on;
    this.shapeManager.setEnhancedVisuals3D(on);
    if (on) {
      this.scene3dGlassQuality = true;
    }
    this.host.markDirty();
  }

  scene3dSetGlassQuality(on: boolean): void {
    this.scene3dGlassQuality = on;
    this.shapeManager.setGlassQuality3D(on);
    this.host.markDirty();
  }

  /** GPU CULLING (Salsa performance-plan §P15): the same per-machine setting as City -> Performance -> GPU culling
   *  (setGpuCullingMode3D; the engine keeps it in localStorage, never in the document). Static cached option list. */


  readonly scene3dGpuCullOptions = GPU_CULL_OPTIONS;

  scene3dGpuCull: 'auto' | 'on' | 'off' = 'auto';

  scene3dGpuCullDesc = GPU_CULL_OPTIONS[0].desc;

  _scene3dReadGpuCull(g: any): void {
    if (g && (g.mode === 'auto' || g.mode === 'on' || g.mode === 'off')) this.scene3dGpuCull = g.mode;
    this.scene3dGpuCullDesc = (GPU_CULL_OPTIONS.find(o => o.key === this.scene3dGpuCull) ?? GPU_CULL_OPTIONS[0]).desc;
  }

  /** The Rendering section opened: read the current mode (City -> Performance may have changed it). */
  scene3dSyncGpuCull(): void { this._scene3dReadGpuCull(this.shapeManager.getGpuCullingMode3D()); }

  scene3dSetGpuCull(m: 'auto' | 'on' | 'off'): void {
    this.scene3dGpuCull = m;
    this._scene3dReadGpuCull(this.shapeManager.setGpuCullingMode3D(m));
  }

  /** ANTI-ALIASING / UPSCALING (Salsa sm.setTemporalAA3D; per machine, never in the document). */
  readonly scene3dTaaOptions = TEMPORAL_AA_OPTIONS;
  scene3dTaa: 'off' | 'taa' | 'taau' = 'off';
  scene3dTaaDesc = TEMPORAL_AA_OPTIONS[0].desc;
  /** Why it is not running right now ('' = running or off): retro look, ink look, compiling. */
  scene3dTaaNote = '';
  _scene3dReadTaa(t: any): void {
    if (t && (t.mode === 'off' || t.mode === 'taa' || t.mode === 'taau')) this.scene3dTaa = t.mode;
    this.scene3dTaaDesc = (TEMPORAL_AA_OPTIONS.find(o => o.key === this.scene3dTaa) ?? TEMPORAL_AA_OPTIONS[0]).desc;
    const why: Record<string, string> = { retro: 'Off for this look (retro / PS1).', ink: 'Off for this look (ink outlines).', compiling: 'Starting…' };
    this.scene3dTaaNote = t && t.mode !== 'off' && !t.active ? (why[t.reason] ?? '') : '';
  }
  scene3dSyncTaa(): void { this._scene3dReadTaa(this.shapeManager.getTemporalAA3D()); }
  scene3dSetTaa(m: 'off' | 'taa' | 'taau'): void {
    this.scene3dTaa = m;
    this._scene3dReadTaa(this.shapeManager.setTemporalAA3D({ mode: m }) ?? { mode: m, active: true });
  }

  scene3dSetAerialPerspective(v: number): void {
    this.scene3dAerialPerspective = v;
    this.shapeManager.setAerialPerspective3D(v);
    this.host.markDirty();
  }

  scene3dSetTextureFilter(filter: 'nearest' | 'linear'): void {
    this.scene3dTextureFilter = filter;
    this.shapeManager.setTextureFilterMode3D(filter);
    this.host.markDirty();
  }

  onScene3dGridOpacityChange(val: string): void {
    this.scene3dGridOpacity = +val / 100;
    this.applyScene3dGrid();
  }
  onScene3dGridColorChange(hex: string): void {
    this.scene3dGridColor = [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
    this.applyScene3dGrid();
  }
}
