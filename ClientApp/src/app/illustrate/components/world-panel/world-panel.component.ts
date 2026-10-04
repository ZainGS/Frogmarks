import { Component, EventEmitter, Input, NgZone, OnDestroy, Output } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { hexToRgba01Obj } from '../../utils/color-utils';
import { TEMPORAL_AA_OPTIONS } from '../../services/scene3d-settings.service';

/**
 * World / City panel: generation, regions, time of day, city look & style packs, performance, streaming.
 * Extracted from illustration.component (refactor-plan Phase 2.4d). The editor owns whether the panel is
 * open (it gates selection/pointer/gizmo code) and its mesh list; the panel asks via outputs.
 */
@Component({
  selector: 'app-world-panel',
  templateUrl: './world-panel.component.html',
  styleUrls: ['./world-panel.component.scss'],
})
export class WorldPanelComponent implements OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  /** The editor's scene3dWorldPanelOpen (the Performance poll stops itself when the panel closes). */
  @Input() open = false;
  @Output() dirty = new EventEmitter<void>();
  /** Regeneration changed the mesh set — the editor rebuilds its mesh list. */
  @Output() refreshMeshes = new EventEmitter<void>();
  /** The city was cleared — the editor closes the panel and rebuilds its mesh list. */
  @Output() cleared = new EventEmitter<void>();
  /** The engine's character-outline state, read while syncing the city look (an editor field). */
  @Output() charOutlinesSynced = new EventEmitter<boolean>();

  constructor(private ngZone: NgZone) {}

  ngOnDestroy(): void {
    this._stopStreamStats();
    this._perfStopPoll();
  }

  /** Called by the editor when the panel opens (moved from openWorldPanel). */
  onOpen(): void {
    const sm = this.shapeManager;
    if (this.worldHasWorld && sm.world?.hasWorld) {
      sm.world?.enterCityMode();              // resume existing city, no regen
    } else {
      sm.world?.enterCityMode(this._worldParams());  // fresh city
      this.worldHasWorld = true;
      this.worldRefreshRegions();
    }
    this.worldInitGradeKeys();
    this._syncCityStyleFromEngine();   // the city's saved look (render style + toon + rim)
    this._perfOnPanelOpen();           // Performance group: read the engine + start the live readout (if open)
    const overrideFlag = sm.world?.overrideGlobalLighting;
    if (overrideFlag != null) this.worldOverrideGlobalLighting = overrideFlag;
  }

  /** City generation params (the GARP "regenerate city" action reuses them). */
  worldParams() { return this._worldParams(); }
  /** Re-read the city's style after the environment style changes. */
  syncCityStyleFromEngine(): void { this._syncCityStyleFromEngine(); }

  worldMode: 'diorama' | 'tiled' = 'diorama';
  worldTileRadius = 0;
  worldTileDetail: 'flat' | 'focus' | 'full' = 'focus';
  worldStreamFollow = false;
  worldStreamStats = '';
  /** Salsa P10.D / P17: what streams OUTSIDE the active Tile-radius window ('hlod' = merged distant buildings, the
   *  engine default since 2026-10-03 | 'none' | 'flat' | 'massing'). Session state. */
  worldStreamOutside: 'hlod' | 'none' | 'flat' | 'massing' = 'hlod';
  /** Salsa P17: the HLOD skyline distance in tiles (salsaWorld.hlod({ skylineTiles }); engine default 10). Session state. */
  worldHlodSkyline = 10;
  worldBorder: 'circle' | 'square' | 'hexagon' | 'octagon' = 'square';
  worldPattern: 'radial' | 'grid' = 'grid';
  worldSeed = 3;
  worldRadius = 10;
  worldSpokeCount = 8;
  worldRingCount = 4;
  worldGridCols = 11;
  worldGridRows = 11;
  worldLotsRadial = 2;
  worldLotsAngular = 3;
  worldStreetWidth = 0.40;
  worldPlazaRadius = 0.09;
  worldParkChance = 0.12;
  worldWaterChance = 0.06;
  worldHasWorld = false;
  worldEnabledRegions: number[] | null = null;  // null = all enabled
  worldRegions: Array<{ id: number; type: string }> = [];
  worldLandmarks = true;
  worldShotengai = false;
  worldAwnings = true;
  worldFrontageDressing = true;   // Salsa persona polish D1: nobori flags / noren / wall bikes at shopfronts
  worldPedestrianStyle: 'flat' | 'default' | 'cel' | 'cel-hd' | 'ink' = 'flat';
  worldSetPedestrianStyle(v: string): void {
    this.worldPedestrianStyle = v as typeof this.worldPedestrianStyle;   // the <select> hands back a string
    this.shapeManager?.world?.setPedestrianStyle(this.worldPedestrianStyle);   // live restyle, no regen
    this.dirty.emit();
  }
  worldStreetFurniture = true;
  worldPowerLines = true;
  worldParkedCars = true;
  worldNightMode = false;
  worldStreetTrees = true;
  worldBicycles = true;
  worldLanterns = true;
  worldRailway = true;
  // Salsa railway upgrade (R1/R2): stations, metro entrances, EMU consist
  worldStations = true;
  worldMetroEntrances = true;
  worldRailCars = 8;
  worldRailLivery: 'auto' | 'green' | 'silver' | 'cream' = 'auto';
  worldRailDwellScale = 1;
  worldRailViaduct: 'portal' | 'arcade' = 'portal';   // arcade = beside the road with shops/izakaya in the arches (grid only)
  worldLocalLine = false;                               // at-grade local line with level crossings (grid only)
  worldLocalLineCars = 2;
  worldRooftops = true;
  worldFacadeDetail = true;
  worldDetailedBuildings = true;
  worldPedestrians = true;
  worldPedestrianDensity = 1;
  worldFog = true;
  worldClouds = true;
  worldCloudDensity = 0.55;
  worldHolograms = false;
  worldVoidGrid = true;
  worldBorderGlow = true;
  worldTerrainApron = false;
  worldVoidExtent = 2.0;
  worldVoidLineWidth = 0.05;
  worldBorderGlowHeight = 1.2;
  worldWarp = 0.35;
  worldPalette: 'auto' | 'terracotta' | 'slate' | 'pastel' | 'brick' | 'mint' | 'phantom' | 'inaba' = 'auto';
  worldLeafColor = '#ffffff';
  worldLeafColorVar = 0.08;
  // Live controls (no regen)
  worldTimeOfDay: number | null = null;
  worldDayCyclePlaying = false;
  worldDayCycleSec = 120;
  worldRenderStyle: string | null = null;
  worldTrafficRunning = true;
  worldTurntableOn = false;
  worldWeather: 'clear' | 'rain' | 'snow' | 'overcast' = 'clear';
  worldCinematicGrade = true;
  worldOverrideGlobalLighting = true;
  worldGradePhase: 'night' | 'dawn' | 'noon' | 'dusk' = 'noon';
  worldGradeKeys: Record<string, Record<string, number>> = {
    night: { bloomIntensity: 1.35, vignette: 0.35 },
    dawn:  { bloomIntensity: 0.8,  vignette: 0.2  },
    noon:  { bloomIntensity: 0.6,  vignette: 0.15 },
    dusk:  { bloomIntensity: 1.1,  vignette: 0.25 },
  };
  worldJunctionVariety = 0.3;
  worldElevation = 0.45;
  worldTerraces = true;
  worldSidewalks = true;
  worldRoadPaint = true;
  worldStreetLights = true;
  worldTrafficLights = true;
  worldCornerStyle: 'sharp' | 'chamfer' | 'round' | 'mixed' = 'mixed';
  worldRoofStyle: 'flat' | 'pointed' | 'parapet' | 'chamfer' | 'rounded' | 'helipad' | 'tower' | 'spire' | 'mansard' | 'mixed' = 'mixed';
  worldSignage = false;
  private _worldDebounce: any = null;
  private _streamStatsTimer: any = null;
  private _worldMeshIdsKey = '';

  private _worldParams(): Record<string, unknown> {
    const p: Record<string, unknown> = {
      seed: this.worldSeed,
      border: this.worldBorder,
      radius: this.worldRadius,
      pattern: this.worldPattern,
      streetWidth: this.worldStreetWidth,
      plazaRadius: this.worldPlazaRadius,
      lotsRadial: this.worldLotsRadial,
      lotsAngular: this.worldLotsAngular,
      parkChance: this.worldParkChance,
      waterChance: this.worldWaterChance,
      elevation: this.worldElevation,
      warp: this.worldWarp,
      clouds: this.worldClouds,
      cloudDensity: this.worldCloudDensity,
      holograms: this.worldHolograms,
      sidewalks: this.worldSidewalks,
      roadPaint: this.worldRoadPaint,
      streetLights: this.worldStreetLights,
      trafficLights: this.worldTrafficLights,
      cornerStyle: this.worldCornerStyle,
      roofStyle: this.worldRoofStyle,
      signage: this.worldSignage,
      landmarks: this.worldLandmarks,
      awnings: this.worldAwnings,
      frontageDressing: this.worldFrontageDressing,
      streetFurniture: this.worldStreetFurniture,
      powerLines: this.worldPowerLines,
      parkedCars: this.worldParkedCars,
      nightMode: this.worldNightMode,
      streetTrees: this.worldStreetTrees,
      bicycles: this.worldBicycles,
      lanterns: this.worldLanterns,
      railway: this.worldRailway,
      stations: this.worldStations,
      metroEntrances: this.worldMetroEntrances,
      railCars: this.worldRailCars,
      railLivery: this.worldRailLivery,
      railDwellScale: this.worldRailDwellScale,
      railViaduct: this.worldRailViaduct,
      localLine: this.worldLocalLine,
      localLineCars: this.worldLocalLineCars,
      rooftops: this.worldRooftops,
      facadeDetail: this.worldFacadeDetail,
      detailedBuildings: this.worldDetailedBuildings,
      pedestrians: this.worldPedestrians,
      pedestrianDensity: this.worldPedestrianDensity,
      fog: this.worldFog,
      palette: this.worldPalette,
      leafColor: this.worldLeafColor !== '#ffffff' ? this.worldLeafColor : undefined,
      leafColorVar: this.worldLeafColorVar,
      traffic: this.worldTrafficRunning,
      weather: this.worldWeather,
      worldMode: this.worldMode,
      tileRadius: this.worldTileRadius,
      tileDetail: this.worldTileDetail,
      voidGrid: this.worldVoidGrid,
      borderGlow: this.worldBorderGlow,
      terrainApron: this.worldTerrainApron,
      voidExtent: this.worldVoidExtent,
      voidLineWidth: this.worldVoidLineWidth,
      borderGlowHeight: this.worldBorderGlowHeight,
    };
    if (this.worldPattern === 'radial') {
      p['spokeCount'] = this.worldSpokeCount;
      p['ringCount'] = this.worldRingCount;
    } else {
      p['gridCols'] = this.worldGridCols;
      p['gridRows'] = this.worldGridRows;
      p['junctionVariety'] = this.worldJunctionVariety;
      p['terraces'] = this.worldTerraces;
      p['shotengai'] = this.worldShotengai;
    }
    return p;
  }

  worldGenerate(): void {
    // Re-enters the mode → reframes the camera. Use for Generate button.
    const sm = this.shapeManager;
    sm.world?.enterCityMode(this._worldParams());
    this.worldHasWorld = true;
    this.worldEnabledRegions = null;
    this.worldRefreshRegions();
    this.dirty.emit();
  }

  worldRefreshRegions(): void {
    const regions = this.shapeManager.world?.regions;
    this.worldRegions = Array.isArray(regions) ? regions : [];
    this.worldEnabledRegions = null;
  }

  worldToggleRegion(id: number): void {
    const sm = this.shapeManager;
    sm.world?.toggleRegion(id);
    const active = sm.world?.activeRegions;
    this.worldEnabledRegions = Array.isArray(active) ? active : null;
    this.dirty.emit();
  }

  worldEnableAllRegions(): void {
    const sm = this.shapeManager;
    sm.world?.setActiveRegions(null);
    this.worldEnabledRegions = null;
    this.dirty.emit();
  }

  worldSetTimeOfDay(t: number): void {
    this.worldTimeOfDay = t;
    this.shapeManager.world?.setTimeOfDay(t);
  }

  worldToggleDayCycle(): void {
    const sm = this.shapeManager;
    if (this.worldDayCyclePlaying) {
      sm.world?.stopDayCycle();
      this.worldDayCyclePlaying = false;
    } else {
      sm.world?.playDayCycle(this.worldDayCycleSec);
      this.worldDayCyclePlaying = true;
    }
  }

  worldApplyCycleSpeed(): void {
    if (!this.worldDayCyclePlaying) return;
    const sm = this.shapeManager;
    sm.world?.stopDayCycle();
    sm.world?.playDayCycle(this.worldDayCycleSec);
  }

  worldSetRenderStyle(style: string | null): void {
    this.worldRenderStyle = style;
    this.shapeManager.world?.setRenderStyle(style as any);   // persisted with the city since 2026-09-29
  }

  // ── Environment styling (Salsa 2026-09-29): city / blocks / props keep a SAVED look ─────────────────────────────
  // A checkbox OFF sends null (= "don't override", back to the generator's own look), not false.
  worldToonShadows = false;
  worldRimLight = false;
  worldSetCityStyleFlag(field: 'toonShadow' | 'rimLight', on: boolean): void {
    this.shapeManager.setCityStyle3D({ [field]: on ? true : null });
    this.dirty.emit();
  }
  private _syncCityStyleFromEngine(): void {
    const sm = this.shapeManager;
    this.worldRenderStyle = sm.world?.renderStyle ?? null;
    const cs = sm.getCityStyle3D();
    this.worldToonShadows = !!cs?.toonShadow;
    this.worldRimLight = !!cs?.rimLight;
    this._syncCityLookFromEngine();
  }

  // ── City panel sections (Salsa city-quality U1, 2026-09-29) ─────────────────────────────────────────────────────
  // The panel is grouped into collapsible sections; which are open is a per-browser convenience (localStorage).
  worldSecOpen: Record<string, boolean> = (() => {
    const d: Record<string, boolean> = { presets: true, look: true, time: true, layout: false, streets: false, life: false, edge: false, perf: false };
    try { const v = JSON.parse(localStorage.getItem('frogmarks.citySections') ?? 'null'); if (v && typeof v === 'object') Object.assign(d, v); } catch { /* storage blocked */ }
    return d;
  })();
  worldToggleSec(key: string): void {
    this.worldSecOpen = { ...this.worldSecOpen, [key]: !this.worldSecOpen[key] };
    try { localStorage.setItem('frogmarks.citySections', JSON.stringify(this.worldSecOpen)); } catch { /* storage blocked */ }
  }
  worldSetAllSecs(open: boolean): void {
    const n: Record<string, boolean> = {};
    for (const k of Object.keys(this.worldSecOpen)) n[k] = open;
    this.worldSecOpen = n;
    try { localStorage.setItem('frogmarks.citySections', JSON.stringify(n)); } catch { /* storage blocked */ }
  }

  // ── City panel PERFORMANCE group (Salsa docs/ui/performance.md §Resolution scaling / §LOD settings, 2026-10-01) ──
  // Resolution scaling is a per-machine viewport preference (the engine keeps it in localStorage, never in the doc);
  // the LOD settings are saved with the city (opt-in: untouched = today's defaults). Every call is guarded with ?.()
  // because this app types against the built dist. Arrays bound in *ngFor are CACHED fields, updated in place.
  perfResMode: 'off' | 'fixed' | 'auto' = 'off';
  perfResScale = 0.75;
  perfResTargetFps = 60;
  perfResMinScale = 0.6;
  perfResCurrent = 1;
  perfGpuMs: number | null = null;
  perfResTiming = '';
  perfDistanceLod = true;
  perfGlobal = 1;
  perfAerialBias = true;
  perfZoomTiers = true;
  perfZoom: Record<string, number> = { detail: 1, roof: 1.25, props: 1.2, flatmap: 1.4, structure: 1.7 };
  readonly perfZoomKeys: { key: string; label: string; title: string }[] = [
    { key: 'detail', label: 'Fine detail', title: 'Balconies, trim, people, wires: hidden past this zoom (x F)' },
    { key: 'roof', label: 'Roof objects', title: 'Roof equipment and markings (x F)' },
    { key: 'props', label: 'Props', title: 'Trees, cars, lamps, street furniture (x F)' },
    { key: 'flatmap', label: 'Paving', title: 'Sidewalks, courtyards, plazas (x F)' },
    { key: 'structure', label: 'Structure', title: 'Past this only roads, buildings and ground remain (x F)' },
  ];
  perfTwins: Record<string, number> = { crowdM: 30, chipsM: 18 };
  perfTwinKeys: { key: string; label: string; title: string; max: number }[] = [];
  perfPcf: '5x5' | '3x3' = '5x5';
  perfSlack = 16;
  /** Shadow quality preset (Salsa performance-plan §P14; setCityLodSettings3D({ shadow: { quality } })): low / medium /
   *  high / ultra, or 'custom' once the filter or the cascades were changed on their own. */
  perfShadowQuality: string = 'high';
  perfDebugTint = false;
  /** Simulation LOD (Salsa performance-plan §P13): how often movers, the live crowd, character idles and spring bones
   *  update by distance / visibility / fog (setSimLod3D / getSimLodStats3D; saved with the city LOD settings). */
  perfSim: { enabled: boolean; nearM: number; midM: number; midHz: number; farHz: number; offscreenHz: number; fogFreeze: boolean } =
    { enabled: true, nearM: 40, midM: 120, midHz: 10, farHz: 2, offscreenHz: 2, fogFreeze: true };
  perfSimLine = '';
  perfFamilies: { id: string; label: string; multiplier: number; metres: number }[] = [];
  perfFamStats: { id: string; label: string; shown: number; lodHidden: number; zoomHidden: number; trisK: number }[] = [];
  perfStatsLine = '';
  perfStatsLine2 = '';
  /** Salsa step 3: the scene against its budgets (getSceneBudget3D) — the warning line, or a quiet 'within budget' summary. */
  perfBudgetLine = '';
  perfBudgetOver = false;
  private _perfTimer: any = null;
  private static readonly PERF_TWIN_LABELS: Record<string, { label: string; title: string; max: number }> = {
    crowdM: { label: 'Crowd detail', title: 'Within this distance people use the detailed figure; beyond, the simple one (metres)', max: 150 },
    chipsM: { label: 'Edge chips', title: 'Within this distance stone edges show chips; beyond, the clean piece (metres)', max: 100 },
    treesM: { label: 'Tree crowns', title: 'Within this distance trees use the full crown; beyond, the thinned one (metres)', max: 500 },
  };
  perfTrackId(_i: number, x: { id?: string; key?: string }): string { return x.id ?? x.key ?? ''; }
  /** GPU CULLING (Salsa performance-plan §P15, docs/ui/performance.md §GPU-driven rendering): 'auto' / 'on' / 'off'
   *  (setGpuCullingMode3D / getGpuCullingMode3D). A per-machine preference the engine keeps in localStorage, never in
   *  the document. The option list is a static cached array (bound in *ngFor). */
  static readonly GPU_CULL_OPTIONS: { key: 'auto' | 'on' | 'off'; label: string; desc: string }[] = [
    { key: 'auto', label: 'Auto (recommended)', desc: 'Picks the faster path from moment to moment: GPU culling while the CPU is the bottleneck (big scenes, Play, window-sized views), the classic path while the GPU is the bottleneck (full-screen views of big tiled worlds). Switching is seamless, at most every 1.5 s.' },
    { key: 'on', label: 'On', desc: 'The GPU decides what to draw. Frees the CPU (about a third of the main-thread render time in a city); can cost a little GPU time in very large tiled worlds.' },
    { key: 'off', label: 'Off', desc: 'The classic CPU path: the CPU decides and submits every draw. For comparison, or when the GPU is the bottleneck all the time.' },
  ];
  readonly perfGpuCullOptions = WorldPanelComponent.GPU_CULL_OPTIONS;
  perfGpuCull: 'auto' | 'on' | 'off' = 'auto';
  perfGpuCullDesc = WorldPanelComponent.GPU_CULL_OPTIONS[0].desc;
  /** Live: "Active: GPU · reason: CPU-bound" (empty when the engine has no GPU culling mode). */
  perfGpuCullLine = '';

  perfToggleSec(): void {
    this.worldToggleSec('perf');
    if (this.worldSecOpen['perf']) { this.perfSync(); this._perfStartPoll(); } else this._perfStopPoll();
  }
  private _perfOnPanelOpen(): void {
    if (this.worldSecOpen['perf']) { this.perfSync(); this._perfStartPoll(); }
  }
  /** Read the engine state into the panel fields (arrays updated in place, so the sliders keep their DOM). */
  perfSync(): void {
    const sm = this.shapeManager;
    const r = sm.getResolutionScale3D();
    if (r) {
      this.perfResMode = r.mode; this.perfResScale = r.scale; this.perfResMinScale = r.minScale;
      this.perfResTargetFps = Math.round(960 / (r.targetMs || 16));   // fps <-> ms with 4 % headroom: 60 fps = 16.0 ms
      this.perfResCurrent = r.current; this.perfGpuMs = r.gpuMs; this.perfResTiming = r.timing === 'estimate' ? 'est.' : '';
    }
    this._perfReadGpuCull(sm.getGpuCullingMode3D());
    this._perfReadTaa(sm.getTemporalAA3D());
    this._perfApplyView(sm.getCityLodSettings3D());
  }
  /** The GPU culling mode + its live line from getGpuCullingMode3D's result (null = an engine without it). */
  private _perfReadGpuCull(g: any): void {
    if (!g) { this.perfGpuCullLine = ''; return; }
    if (g.mode === 'auto' || g.mode === 'on' || g.mode === 'off') this.perfGpuCull = g.mode;
    this.perfGpuCullDesc = (WorldPanelComponent.GPU_CULL_OPTIONS.find(o => o.key === this.perfGpuCull) ?? WorldPanelComponent.GPU_CULL_OPTIONS[0]).desc;
    this.perfGpuCullLine = `Active: ${g.active === 'cpu' ? 'CPU' : 'GPU'} · reason: ${g.reasonText ?? g.reason ?? '–'}`;
  }
  perfSetGpuCull(m: 'auto' | 'on' | 'off'): void {
    this.perfGpuCull = m;
    this._perfReadGpuCull(this.shapeManager.setGpuCullingMode3D(m));
  }
  private _perfApplyView(v: any): void {
    if (!v) return;
    this.perfDistanceLod = v.distanceLod !== false;
    this.perfGlobal = v.global ?? 1;
    this.perfAerialBias = v.aerialBias !== false;
    this.perfZoomTiers = v.zoomTiers !== false;
    if (v.zoom) for (const k of Object.keys(this.perfZoom)) if (typeof v.zoom[k] === 'number') this.perfZoom[k] = v.zoom[k];
    if (v.twins) {
      for (const k of Object.keys(v.twins)) this.perfTwins[k] = v.twins[k];
      const keys = Object.keys(v.twins);
      if (keys.join() !== this.perfTwinKeys.map(t => t.key).join()) {
        this.perfTwinKeys = keys.map(k => ({ key: k, ...(WorldPanelComponent.PERF_TWIN_LABELS[k] ?? { label: k.replace(/M$/, ''), title: 'Near / far swap distance (metres)', max: 300 }) }));
      }
    }
    if (v.shadow) {
      this.perfPcf = v.shadow.pcf === '3x3' ? '3x3' : '5x5';
      this.perfSlack = v.shadow.slackTexels ?? 16;
      this.perfShadowQuality = v.shadow.qualityShown ?? v.shadow.quality ?? 'high';
      if (typeof v.shadow.cascades === 'number') this.worldShadowCascades = v.shadow.cascades;
      if (typeof v.shadow.nearMetres === 'number') this.worldShadowNearM = v.shadow.nearMetres;
    }
    this.perfDebugTint = !!v.debugTint;
    if (v.sim && typeof v.sim === 'object') Object.assign(this.perfSim, v.sim);
    const list: any[] = Array.isArray(v.familyList) ? v.familyList : [];
    if (list.map(f => f.id).join() !== this.perfFamilies.map(f => f.id).join()) {
      this.perfFamilies = list.map(f => ({ id: f.id, label: f.label, multiplier: f.multiplier, metres: f.metres }));
    } else {
      list.forEach((f, i) => { const o = this.perfFamilies[i]; o.multiplier = f.multiplier; o.metres = f.metres; });
    }
  }
  perfSetRes(patch: Record<string, unknown>): void {
    const r = this.shapeManager.setResolutionScale3D(patch);
    if (r) { this.perfResMode = r.mode; this.perfResScale = r.scale; this.perfResMinScale = r.minScale; this.perfResCurrent = r.current; }
  }
  perfSetResMode(m: 'off' | 'fixed' | 'auto'): void { this.perfResMode = m; this.perfSetRes({ mode: m }); }
  // ── Anti-aliasing / Upscaling (Salsa sm.setTemporalAA3D; per machine; same setting as Global -> Rendering) ──
  readonly perfTaaOptions = TEMPORAL_AA_OPTIONS;
  perfTaa: 'off' | 'taa' | 'taau' = 'off';
  perfTaaDesc = TEMPORAL_AA_OPTIONS[0].desc;
  perfTaaNote = '';
  private _perfReadTaa(t: any): void {
    if (t && (t.mode === 'off' || t.mode === 'taa' || t.mode === 'taau')) this.perfTaa = t.mode;
    this.perfTaaDesc = (TEMPORAL_AA_OPTIONS.find(o => o.key === this.perfTaa) ?? TEMPORAL_AA_OPTIONS[0]).desc;
    const why: Record<string, string> = { retro: 'Off for this look (retro / PS1).', ink: 'Off for this look (ink outlines).', compiling: 'Starting…' };
    this.perfTaaNote = t && t.mode !== 'off' && !t.active ? (why[t.reason] ?? '') : t && t.active && t.mode === 'taau' ? `Rendering at ${Math.round((t.renderScale ?? 1) * 100)} %.` : '';
  }
  perfSetTaa(m: 'off' | 'taa' | 'taau'): void {
    this.perfTaa = m;
    this._perfReadTaa(this.shapeManager.setTemporalAA3D({ mode: m }) ?? { mode: m, active: true });
  }
  perfSetResScale(v: number): void { this.perfResScale = v; this.perfSetRes({ scale: v }); }
  perfSetTargetFps(fps: number): void { this.perfResTargetFps = fps; this.perfSetRes({ targetMs: 960 / Math.max(10, fps) }); }
  perfSetMinScale(v: number): void { this.perfResMinScale = v; this.perfSetRes({ minScale: v }); }
  /** Apply an LOD settings patch (live in the engine, saved with the city). */
  perfSetLod(patch: Record<string, unknown>): void {
    const sm = this.shapeManager;
    sm.setCityLodSettings3D(patch);
    this._perfApplyView(sm.getCityLodSettings3D());
    this.dirty.emit();
  }
  /** Apply a sim-LOD patch (live; saved with the city). Older engines without setSimLod3D take it through the LOD settings. */
  perfSetSim(patch: Record<string, unknown>): void {
    const sm = this.shapeManager;
    const s = sm.setSimLod3D ? sm.setSimLod3D(patch) : sm.setCityLodSettings3D({ sim: patch })?.sim;
    if (s && typeof s === 'object') Object.assign(this.perfSim, s);
    this.dirty.emit();
  }
  perfSetFamily(id: string, v: number): void { this.perfSetLod({ families: { [id]: v } }); }
  perfSetZoom(key: string, v: number): void { this.perfZoom[key] = v; this.perfSetLod({ zoom: { [key]: v } }); }
  perfSetTwin(key: string, v: number): void { this.perfTwins[key] = v; this.perfSetLod({ twins: { [key]: v } }); }
  perfSetShadow(patch: Record<string, unknown>): void { this.perfSetLod({ shadow: patch }); }
  /** Pick a shadow quality preset: it also sets the filter and the cascades (re-read by _perfApplyView). */
  perfSetShadowQuality(q: string): void { if (q === 'custom') return; this.perfShadowQuality = q; this.perfSetLod({ shadow: { quality: q } }); }
  /** Back to the defaults: resolution scaling off, GPU culling Auto, every LOD setting as shipped (incl. 2 cascades / 24 m). */
  perfReset(): void {
    const sm = this.shapeManager;
    sm.setResolutionScale3D({ mode: 'off', scale: 0.75, targetMs: 16, minScale: 0.6, maxScale: 1 });
    sm.setCityLodSettings3D({ reset: true });
    sm.setGpuCullingMode3D('auto');
    sm.setTemporalAA3D({ mode: 'off' }); this.perfTaa = 'off';   // anti-aliasing / upscaling back to the default
    this.perfResMode = 'off'; this.perfResScale = 0.75; this.perfResTargetFps = 60; this.perfResMinScale = 0.6; this.perfResCurrent = 1;
    this.perfSync();   // (an engine without these APIs keeps the local defaults just set)
    this.dirty.emit();
  }
  /** The Performance group's displayed values (template rounding). */
  private _perfSig(): string {
    return [this.perfResCurrent == null ? '' : (+this.perfResCurrent).toFixed(2), this.perfGpuMs == null ? 'n' : (+this.perfGpuMs).toFixed(1), this.perfResTiming,
      this.perfStatsLine, this.perfStatsLine2, this.perfSimLine, this.perfBudgetLine, this.perfGpuCull, this.perfGpuCullLine, JSON.stringify(this.perfFamStats)].join('|');
  }
  private _perfStartPoll(): void {
    this._perfStopPoll();
    // Salsa step 2: the poll runs OUTSIDE Angular's zone; the tick body is unchanged and assigns the panel fields,
    // then one zone entry (= one change detection) happens only when a displayed value changed.
    this._perfTimer = this.ngZone.runOutsideAngular(() => setInterval(() => {
      const before = this._perfSig();
      this._perfPollTick();
      if (this._perfSig() !== before) this.ngZone.run(() => { /* change detection for the updated panel fields */ });
    }, 500));
  }
  private _perfPollTick(): void {
    {
      if (!this.open || !this.worldSecOpen['perf']) { this._perfStopPoll(); return; }
      const sm = this.shapeManager;
      const st = sm.getCityLodStats3D();
      const r = sm.getResolutionScale3D();
      if (r) { this.perfResCurrent = r.current; this.perfGpuMs = r.gpuMs; this.perfResTiming = r.timing === 'estimate' ? 'est.' : ''; }
      this._perfReadGpuCull(sm.getGpuCullingMode3D());   // the live "Active: GPU · reason: …" line
      if (!st) return;
      const f: any = st.frame ?? {};
      const k = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n ?? 0);
      const gpu = f.gpuMs != null ? `${f.gpuMs.toFixed(1)} ms${this.perfResTiming ? ' ' + this.perfResTiming : ''}` : '–';
      this.perfStatsLine = `${f.fps ?? 0} fps · GPU ${gpu} · scale ${(this.perfResCurrent ?? 1).toFixed(2)}`;
      // P11: trisDrawn mixes every pass (main + shadow maps + prepasses); show the colour pass and the shadow maps apart when the engine reports them
      this.perfStatsLine2 = f.trisMain != null
        ? `${k(f.trisMain)} tris drawn · shadow ${k(f.trisShadow)} · ${f.drawCalls ?? 0} draws · culled ${f.meshesCulled ?? 0} · LOD-hidden ${f.lodHidden ?? 0}`
        : `${k(f.trisDrawn)} tris · ${f.drawCalls ?? 0} draws · culled ${f.meshesCulled ?? 0} · LOD-hidden ${f.lodHidden ?? 0}`;
      const bud = sm.getSceneBudget3D();   // Salsa step 3: budgets (drawn tris / draw calls / geometry MB / instances)
      if (bud) {
        this.perfBudgetOver = !bud.ok;
        this.perfBudgetLine = bud.warning ?? `Within budget · ${k(bud.drawnTris)} / ${k(bud.limits.drawnTris)} tris · ${bud.drawCalls} / ${bud.limits.drawCalls} draws · ${Math.round(bud.geometryMB)} / ${bud.limits.geometryMB} MB`;
      }
      const sl = sm.getSimLodStats3D();
      if (sl?.total) {
        const t = sl.total;
        this.perfSimLine = sl.enabled ? `near ${t.near} · mid ${t.mid} · far ${t.far} · off-screen ${t.offscreen} · frozen ${t.frozen} · updated ${t.updates} / skipped ${t.skipped}` : 'off: everything updates every frame';
      }
      const rows: any[] = Array.isArray(st.families) ? st.families.filter((x: any) => x.objects > 0) : [];
      if (rows.map(x => x.id).join() !== this.perfFamStats.map(x => x.id).join()) {
        this.perfFamStats = rows.map(x => ({ id: x.id, label: x.label, shown: x.shown, lodHidden: x.lodHidden, zoomHidden: x.zoomHidden, trisK: Math.round(x.trisShown / 1000) }));
      } else {
        rows.forEach((x, i) => { const o = this.perfFamStats[i]; o.shown = x.shown; o.lodHidden = x.lodHidden; o.zoomHidden = x.zoomHidden; o.trisK = Math.round(x.trisShown / 1000); });
      }
    }
  }
  private _perfStopPoll(): void {
    if (this._perfTimer != null) { clearInterval(this._perfTimer); this._perfTimer = null; }
  }

  // ── City LOOK (Salsa city-quality P1–P9): packs, sky lighting, reflections, SSAO, outlines, haze, lamps, tints ──
  worldActiveStyle: string | null = null;
  get worldStyleNames(): string[] { return this.shapeManager?.world?.styleNames ?? []; }
  worldStyleLabel(name: string): string {
    const l = this.shapeManager?.world?.styles?.find(s => s.name === name)?.label ?? name;
    return l.replace(/\s*\(P[45]\)$/, '');
  }
  worldStyleTitle(name: string): string { return this.shapeManager?.world?.styles?.find(s => s.name === name)?.label ?? name; }
  worldSkyLighting = false;
  worldWetReflections = false;
  worldSSAO = false;
  worldOutlines = false;
  worldOutlineColor = '#14101e';
  worldOutlineThreshold = 1;   // edge-outline LINE WIDTH in px (Salsa's "threshold")
  worldHeightFog = 0;
  worldLampColor = '#ffd98c';
  worldShadowTints: Record<string, string> = { night: '#6670b8', dawn: '#8a86c0', noon: '#7f93c4', dusk: '#8a70b0' };

  private _rgb01ToHex(c: ArrayLike<number> | null | undefined, fallback = '#ffffff'): string {
    if (!c || c.length < 3) return fallback;
    const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    return '#' + h(c[0]) + h(c[1]) + h(c[2]);
  }
  private _hexToRgb01(hex: string): [number, number, number] {
    const c = hexToRgba01Obj(hex);
    return [c.r, c.g, c.b];
  }
  worldSetSkyLighting(on: boolean): void { this.worldSkyLighting = on; this.shapeManager.world?.setSkyLighting(on); this.dirty.emit(); }
  worldSetWetReflections(on: boolean): void { this.worldWetReflections = on; this.shapeManager.world?.setWetReflections(on); this.dirty.emit(); }
  worldSetSSAO(on: boolean): void { this.worldSSAO = on; this.shapeManager.world?.setSSAO(on); this.dirty.emit(); }
  worldSetOutlines(on: boolean): void {
    this.worldOutlines = on;
    const c = hexToRgba01Obj(this.worldOutlineColor);
    this.shapeManager.world?.setCityOutlines(on ? { color: [c.r, c.g, c.b, 1], threshold: this.worldOutlineThreshold, ...(this.worldInkFoliage !== 'full' ? { foliage: this.worldInkFoliage } : {}) } as any : null);
    this.dirty.emit();
  }
  worldSetHeightFog(v: number): void { this.worldHeightFog = v; this.shapeManager.world?.setHeightFog(v); this.dirty.emit(); }
  worldSetLampColor(hex: string): void { this.worldLampColor = hex; this.shapeManager.world?.setLampColor(this._hexToRgb01(hex)); this.dirty.emit(); }
  worldShadowTintHex(phase: string): string { return this.worldShadowTints[phase] ?? '#8090c0'; }
  worldSetShadowTint(phase: string, hex: string): void {
    this.worldShadowTints = { ...this.worldShadowTints, [phase]: hex };
    this.shapeManager.world?.setShadowTints({ [phase]: this._hexToRgb01(hex) } as any);
    this.dirty.emit();
  }
  worldGradeTintHex(field: 'shadowTint' | 'highlightTint'): string {
    const k = this.shapeManager?.world?.timeGradeKeys?.[this.worldGradePhase];
    return this._rgb01ToHex(k?.[field], '#ffffff');
  }
  worldSetGradeTint(field: 'shadowTint' | 'highlightTint', hex: string): void {
    this.shapeManager.world?.setTimeGradeKey(this.worldGradePhase, { [field]: this._hexToRgb01(hex) });
    this.dirty.emit();
  }
  worldHeroView(): void { this.shapeManager.world?.heroView(); }

  // ── Scene presets + clean look (Salsa polish round 3 T1) ──
  worldScenePreset: string | null = null;
  worldShowStylePacks = false;
  // ★ Cached: a getter returning FRESH objects each change-detection pass makes *ngFor rebuild the buttons every
  //   tick, so clicks landed on destroyed elements and the presets "didn't work".
  private _scenePresetsCache: { name: string; label: string; timeOfDay: number; weather: string }[] = [];
  get worldScenePresets(): { name: string; label: string; timeOfDay: number; weather: string }[] {
    if (!this._scenePresetsCache.length) this._scenePresetsCache = this.shapeManager?.world?.scenePresets ?? [];
    return this._scenePresetsCache;
  }
  private _streetPick = 0;
  worldStreetView(): void { this.shapeManager?.world?.streetView({ pick: this._streetPick++ }); }
  worldApplyScenePreset(name: string): void {
    const w = this.shapeManager.world;
    if (!w?.applyScenePreset(name)) return;
    this.worldActiveStyle = null;
    const p = w.params;
    if (p?.weather != null) this.worldWeather = p.weather;
    if (p?.clouds != null) this.worldClouds = p.clouds;
    if (p?.cloudDensity != null) this.worldCloudDensity = p.cloudDensity;
    if (w.timeOfDay != null) this.worldTimeOfDay = w.timeOfDay;
    this.worldGraphicLook = !!w.graphicLook;
    this._syncCityStyleFromEngine();
    this.worldInitGradeKeys();
    this.dirty.emit();
  }
  // ── Graphic look (Salsa visual-polish #8, 2026-10-03): cel-hd + toon shadows + rim + depth-faded ink layered over the
  //    current scene preset (Golden Hour when none). Off = the plain preset. The 'Graphic' preset button is data-driven. ──
  worldGraphicLook = false;
  worldSetGraphicLook(on: boolean): void {
    const w = this.shapeManager.world;
    if (!w?.setGraphicLook(on)) { this.worldGraphicLook = !!w?.graphicLook; return; }
    this.worldActiveStyle = null;
    this.worldGraphicLook = !!w.graphicLook;
    this.worldScenePreset = w.scenePreset ?? null;
    if (w.timeOfDay != null) this.worldTimeOfDay = w.timeOfDay;
    this._syncCityStyleFromEngine();
    this._syncCityLookFromEngine();
    this.worldInitGradeKeys();
    this.dirty.emit();
  }
  worldGroundFinish: 'clean' | 'weathered' = 'clean';
  worldPaving: 'tiles' | 'slabs' = 'tiles';
  worldBuildingMute = 0.35;
  worldPaintedClouds = true;
  // ── Sky dome (Salsa visual-polish #9) ──
  worldSkyDomeOn = true;
  worldSkyClouds: 'anime' | 'cards' = 'anime';
  worldSkyStars = 1;
  worldSkyMoon = 1;
  worldSkyCityGlow = 0.6;
  worldSkyGlowColor = '#ff8c52';
  /** Merge `patch` into the city's sky dome (`{}` = on with the current / default settings) or turn it off (null). */
  worldSetSkyDome(patch: Record<string, unknown> | null): void {
    const w = this.shapeManager.world;
    this.worldSkyDomeOn = patch !== null;
    w?.setSkyDome(patch);
    this.worldScenePreset = w?.scenePreset ?? null;
    this.dirty.emit();
  }
  worldSetSkyGlowColor(hex: string): void { this.worldSkyGlowColor = hex; this.worldSetSkyDome({ cityGlowColor: this._hexToRgb01(hex) }); }
  worldShadowSoftness = 1.9;
  worldSunWarmth = 0.8;
  worldEdgeWear: 'off' | 'subtle' | 'heavy' = 'off';
  // ── Rendering (Salsa persona polish pass A) ──
  scene3dAAMode: 'off' | 'low' | 'medium' | 'high' = 'medium';
  scene3dSetAA(v: string): void {
    this.scene3dAAMode = v as any;
    const s3 = this.shapeManager.scene3d;
    s3?.setAntiAliasing3D(v === 'off' ? { mode: 'off' } : { mode: 'fxaa', quality: v as any });
    this.dirty.emit();
  }
  worldShadowCascades = 2;
  worldShadowNearM = 24;
  worldSetShadowCascades(n: number | null, nearM: number | null): void {
    if (n != null) this.worldShadowCascades = n;
    if (nearM != null) this.worldShadowNearM = nearM;
    this.shapeManager?.world?.setShadowCascades({ cascades: this.worldShadowCascades, nearMetres: this.worldShadowNearM });
    this.dirty.emit();
  }
  worldGroundContactOn = true;
  worldGroundContactStrength = 0.55;
  worldSetGroundContact(on: boolean, strength: number | null): void {
    this.worldGroundContactOn = on;
    if (strength != null) this.worldGroundContactStrength = strength;
    this.shapeManager?.world?.setGroundContact(on, this.worldGroundContactStrength);
    this.dirty.emit();
  }
  worldKeyFill = 1;
  worldAerialHaze = 1;
  // ── Salsa visual-polish #5 / #7c / #3 (2026-10-03): night light spill, wet streets, the Play player light, ink on
  //    foliage. CityLook fields on the world manager. ──
  worldNightSpill = 1;
  worldWetSheen = 0;
  worldPlayerLight = 1;
  // ── Salsa visual-polish #11 / #16 (2026-10-04): district palette, roof variety, crowd + traffic density, mover
  //    shadows. ──
  worldDistrictPalette = true;
  worldRoofVariety = true;
  /** Salsa visual-polish #11 tail: roof plant style ('clustered' = new cities / presets; saved cities 'classic'). */
  worldRoofEquipment: 'classic' | 'clustered' = 'clustered';
  worldTrafficDensity = 1.3;
  worldMoverShadowsOn = true;
  worldMoverShadowsStrength = 0.55;
  worldSetCrowdDensity(v: number): void {
    this.worldPedestrianDensity = v;   // the same param as the layout section's Pedestrian density slider
    this.shapeManager?.world?.setCrowdDensity(v);
    this.dirty.emit();
  }
  worldSetMoverShadows(on: boolean, strength: number | null): void {
    this.worldMoverShadowsOn = on;
    if (strength != null) this.worldMoverShadowsStrength = strength;
    this.shapeManager?.world?.setMoverShadows(on, this.worldMoverShadowsStrength);
    this.dirty.emit();
  }
  worldInkFoliage: 'full' | 'silhouette' | 'off' = 'full';
  worldSetInkFoliage(mode: 'full' | 'silhouette' | 'off'): void {
    this.worldInkFoliage = mode;
    const w = this.shapeManager?.world;
    const o = w?.cityOutlines;
    if (o) {
      const next = { ...o };
      if (mode === 'full') delete next.foliage; else next.foliage = mode;
      w.setCityOutlines(next);
    }
    this.worldScenePreset = w?.scenePreset ?? null;
    this.dirty.emit();
  }

  /** One setter for the clean-look controls: call world[method](value), mirror the field, re-read the preset tag. */
  worldSetLookValue(method: string, value: unknown, field: string): void {
    const w = this.shapeManager.world;
    (this as any)[field] = value;
    // Dispatch by name from the template; an unknown name is a no-op (check the template when renaming a setter).
    const setter = w ? (w as unknown as Record<string, ((v: unknown) => void) | undefined>)[method] : undefined;
    setter?.call(w, value);
    this.worldScenePreset = w?.scenePreset ?? null;
    this.dirty.emit();
  }
  worldSignalGreen = 11;
  worldSetSignalGreen(sec: number): void { this.worldSignalGreen = sec; this.shapeManager.world?.setSignalTiming({ green: sec }); this.dirty.emit(); }
  private _syncCityLookFromEngine(): void {
    const w = this.shapeManager?.world;
    if (!w) return;
    this.worldSkyLighting = !!w.skyLighting;
    this.worldWetReflections = !!w.wetReflections;
    this.worldSSAO = !!w.ssao;
    const o = w.cityOutlines;
    this.worldOutlines = !!o;
    if (o) { this.worldOutlineColor = this._rgb01ToHex(o.color, '#14101e'); this.worldOutlineThreshold = Math.max(1, Math.min(4, Math.round(o.threshold))); }
    this.worldHeightFog = w.heightFog ?? 0;
    { const wa = w;
      this.worldScenePreset = wa.scenePreset ?? null;
      this.worldGraphicLook = !!wa.graphicLook;   // Salsa visual-polish #8
      if (wa.groundFinish) this.worldGroundFinish = wa.groundFinish;
      if (wa.paving) this.worldPaving = wa.paving;
      if (typeof wa.buildingMute === 'number') this.worldBuildingMute = wa.buildingMute;
      if (typeof wa.paintedClouds === 'boolean') this.worldPaintedClouds = wa.paintedClouds;
      if (typeof wa.cityShadowSoftness === 'number') this.worldShadowSoftness = wa.cityShadowSoftness;
      if (typeof wa.sunWarmth === 'number') this.worldSunWarmth = wa.sunWarmth;
      if (wa.edgeWear) this.worldEdgeWear = wa.edgeWear;
      const sc = wa.shadowCascades; if (sc) { this.worldShadowCascades = sc.cascades; this.worldShadowNearM = Math.round(sc.nearMetres); }
      const gc = wa.groundContact; if (gc) { this.worldGroundContactOn = !!gc.on; this.worldGroundContactStrength = gc.strength; }
      if (typeof wa.keyFill === 'number') this.worldKeyFill = wa.keyFill;
      if (typeof wa.aerialHaze === 'number') this.worldAerialHaze = wa.aerialHaze;
      // Salsa visual-polish #5 / #7c / #3
      if (typeof wa.nightSpill === 'number') this.worldNightSpill = wa.nightSpill;
      if (typeof wa.wetSheen === 'number') this.worldWetSheen = wa.wetSheen;
      if (typeof wa.playerLight === 'number') this.worldPlayerLight = wa.playerLight;
      // Salsa visual-polish #11 / #16
      if (typeof wa.districtPalette === 'boolean') this.worldDistrictPalette = wa.districtPalette;
      if (typeof wa.roofVariety === 'boolean') this.worldRoofVariety = wa.roofVariety;
      if (wa.roofEquipment === 'classic' || wa.roofEquipment === 'clustered') this.worldRoofEquipment = wa.roofEquipment;
      if (typeof wa.trafficDensity === 'number') this.worldTrafficDensity = wa.trafficDensity;
      if (typeof wa.crowdDensity === 'number') this.worldPedestrianDensity = wa.crowdDensity;
      { const mv = wa.moverShadows; if (mv) { this.worldMoverShadowsOn = !!mv.on; this.worldMoverShadowsStrength = mv.strength; } }
      { const fol = (o as any)?.foliage; this.worldInkFoliage = fol === 'silhouette' || fol === 'off' ? fol : 'full'; }
      if ('skyDome' in wa) {   // Salsa visual-polish #9 (an older dist has no getter: keep the panel defaults)
        const sd = wa.skyDome;
        this.worldSkyDomeOn = !!sd;
        if (sd) {
          this.worldSkyClouds = sd.clouds === 'cards' ? 'cards' : 'anime';
          this.worldSkyStars = typeof sd.stars === 'number' ? sd.stars : 1;
          this.worldSkyMoon = typeof sd.moon === 'number' ? sd.moon : 1;
          this.worldSkyCityGlow = typeof sd.cityGlow === 'number' ? sd.cityGlow : 0.6;
          this.worldSkyGlowColor = this._rgb01ToHex(sd.cityGlowColor, '#ff8c52');
        }
      }
      { const aa = this.shapeManager.scene3d?.antiAliasing3D; if (aa) this.scene3dAAMode = aa.mode === 'off' ? 'off' : aa.quality; }
      this.charOutlinesSynced.emit(!!this.shapeManager.getCharacterOutlines3D()); }
    const st = w.signalTiming;
    if (st) this.worldSignalGreen = Math.round(st.green);
    this.worldLampColor = this._rgb01ToHex(w.lampColor, '#ffd98c');
    const t = w.shadowTints;
    if (t) this.worldShadowTints = { night: this._rgb01ToHex(t.night), dawn: this._rgb01ToHex(t.dawn), noon: this._rgb01ToHex(t.noon), dusk: this._rgb01ToHex(t.dusk) };
  }

  worldInitGradeKeys(): void {
    const keys = this.shapeManager.world?.timeGradeKeys;
    if (keys) {
      this.worldGradeKeys = ({
        night: { ...this.worldGradeKeys['night'], ...(keys['night'] ?? {}) },
        dawn:  { ...this.worldGradeKeys['dawn'],  ...(keys['dawn']  ?? {}) },
        noon:  { ...this.worldGradeKeys['noon'],  ...(keys['noon']  ?? {}) },
        dusk:  { ...this.worldGradeKeys['dusk'],  ...(keys['dusk']  ?? {}) },
      }) as any;
    }
  }

  worldSetCinematicGrade(on: boolean): void {
    this.worldCinematicGrade = on;
    this.shapeManager.world?.setCinematicGrade(on);
  }

  worldSetOverrideLighting(on: boolean): void {
    this.worldOverrideGlobalLighting = on;
    this.shapeManager.world?.setOverrideGlobalLighting(on);
  }

  worldSetGradeKey(field: string, value: number): void {
    const phase = this.worldGradePhase;
    this.worldGradeKeys = {
      ...this.worldGradeKeys,
      [phase]: { ...this.worldGradeKeys[phase], [field]: value },
    };
    this.shapeManager.world?.setTimeGradeKey(phase, { [field]: value });
  }

  worldApplyStyle(name: string): void {
    const sm = this.shapeManager;
    sm.world?.applyStyle(name);
    this.worldActiveStyle = name;
    this._syncCityStyleFromEngine();   // the pack's look (style / toon / rim / sky lighting / outlines / haze / tints)
    this.worldInitGradeKeys();
    this.dirty.emit();
    // Sync sliders back from the pack's merged params
    const p = sm.world?.params;
    if (!p) return;
    if (p.border != null) this.worldBorder = p.border;
    if (p.pattern != null) this.worldPattern = p.pattern;
    if (p.seed != null) this.worldSeed = p.seed;
    if (p.radius != null) this.worldRadius = p.radius;
    if (p.elevation != null) this.worldElevation = p.elevation;
    if (p.warp != null) this.worldWarp = p.warp;
    if (p.palette != null) this.worldPalette = p.palette as any;
    if (p.leafColor != null) this.worldLeafColor = p.leafColor as any;
    if (p.leafColorVar != null) this.worldLeafColorVar = p.leafColorVar;
    if (p.fog != null) this.worldFog = p.fog;
    if (p.clouds != null) this.worldClouds = p.clouds;
    if (p.cloudDensity != null) this.worldCloudDensity = p.cloudDensity;
    if (p.holograms != null) this.worldHolograms = p.holograms;
    if (p.worldMode != null) this.worldMode = p.worldMode;
    if (p.tileRadius != null) this.worldTileRadius = p.tileRadius;
    if (p.tileDetail != null) this.worldTileDetail = p.tileDetail;
    if (p.voidGrid != null) this.worldVoidGrid = p.voidGrid;
    if (p.borderGlow != null) this.worldBorderGlow = p.borderGlow;
    if (p.terrainApron != null) this.worldTerrainApron = p.terrainApron;
    if (p.voidExtent != null) this.worldVoidExtent = p.voidExtent;
    if (p.voidLineWidth != null) this.worldVoidLineWidth = p.voidLineWidth;
    if (p.borderGlowHeight != null) this.worldBorderGlowHeight = p.borderGlowHeight;
    if (p.weather != null) this.worldWeather = p.weather;
    if (p.nightMode != null) this.worldNightMode = p.nightMode;
    if (p.streetWidth != null) this.worldStreetWidth = p.streetWidth;
    if (p.parkChance != null) this.worldParkChance = p.parkChance;
    if (p.waterChance != null) this.worldWaterChance = p.waterChance;
    if (p.powerLines != null) this.worldPowerLines = p.powerLines;
    if (p.railway != null) this.worldRailway = p.railway;
    { const pa = p as any;
      if (pa.stations != null) this.worldStations = pa.stations;
      if (pa.metroEntrances != null) this.worldMetroEntrances = pa.metroEntrances;
      if (pa.railCars != null) this.worldRailCars = pa.railCars;
      if (pa.railLivery != null) this.worldRailLivery = pa.railLivery;
      if (pa.railDwellScale != null) this.worldRailDwellScale = pa.railDwellScale; }
    { const pb = p as any;
      if (pb.railViaduct != null) this.worldRailViaduct = pb.railViaduct;
      if (pb.localLine != null) this.worldLocalLine = pb.localLine;
      if (pb.localLineCars != null) this.worldLocalLineCars = pb.localLineCars; }
    if (p.signage != null) this.worldSignage = p.signage;
    if ((p as any).frontageDressing != null) this.worldFrontageDressing = (p as any).frontageDressing;
    if ((p as any).pedestrianStyle != null) this.worldPedestrianStyle = (p as any).pedestrianStyle;
    const t = sm.world?.timeOfDay;
    if (t != null) this.worldTimeOfDay = t;
  }

  worldToggleTraffic(): void {
    this.worldTrafficRunning = !this.worldTrafficRunning;
    this.worldParamChanged();
  }

  worldToggleTurntable(): void {
    this.worldTurntableOn = !this.worldTurntableOn;
    this.shapeManager.world?.setTurntable(this.worldTurntableOn ? 6 : 0);
  }

  worldClear(): void {
    const sm = this.shapeManager;
    sm.world?.exitCityMode();
    sm.world?.clear();
    this.worldHasWorld = false;
    this._worldMeshIdsKey = '';
    this.worldEnabledRegions = null;
    this.worldRegions = [];
    this.worldTimeOfDay = null;
    this.worldDayCyclePlaying = false;
    this.worldRenderStyle = null;
    this.worldToonShadows = false;
    this.worldRimLight = false;
    sm.setCityStyle3D({ renderStyle: null, toonShadow: null, rimLight: null });   // else the next city inherits it
    this.worldActiveStyle = null;
    this.worldTrafficRunning = false;
    if (this.worldTurntableOn) {
      this.shapeManager.world?.setTurntable(0);
      this.worldTurntableOn = false;
    }
    this.cleared.emit();   // editor closes the panel + rebuilds its mesh list
    this.dirty.emit();
  }

  worldRandomizeSeed(): void {
    this.worldSeed = (Math.random() * 1e9) | 0 || 1;
    this.shapeManager.world?.updateCity({ seed: this.worldSeed });
    this.dirty.emit();
  }

  /** `on` = the checkbox's new value. (The template used [(ngModel)] AND toggled here, so it flipped twice —
   *  checking the box turned follow OFF.) No argument = toggle. */
  worldToggleStreamFollow(on?: boolean): void {
    this.worldStreamFollow = on ?? !this.worldStreamFollow;
    this.shapeManager.world?.setStreamFollow(this.worldStreamFollow);
    if (this.worldStreamFollow) {
      this.shapeManager.world?.setStreamOutsideTiles(this.worldStreamOutside);
      if (this.worldStreamOutside === 'hlod') this._syncHlodSkyline();
      this._startStreamStats();
    } else {
      this._stopStreamStats();
    }
  }

  private _startStreamStats(): void {
    this._stopStreamStats();
    // Salsa step 2: outside Angular's zone; the zone is entered only when the stats line changes.
    this._streamStatsTimer = this.ngZone.runOutsideAngular(() => setInterval(() => {
      const before = this.worldStreamStats;
      this._streamStatsTick();
      if (this.worldStreamStats !== before) this.ngZone.run(() => { /* change detection for the stats line */ });
    }, 500));
  }
  private _streamStatsTick(): void {
    {
      const s = this.shapeManager.world?.getStreamStats() as any;
      if (!s) return;
      const pending = s.pending ? ` (+${s.pending})` : '';
      const workers = s.workers != null ? ` · workers ${s.workers ? 'on' : 'off'}` : '';
      // Salsa P10.D: `full` is the ACTUAL full-tile count now (it used to be the constant budget 9); `windowTiles` =
      // the Tile radius window; `centre` = 'resident' | 'parked' | 'restoring' (the original city streams too).
      const win = s.windowTiles != null && s.eyeWindow ? `/${s.windowTiles}` : '';
      const cheap = (s.flat ? ` · flat ${s.flat}` : '') + (s.massing ? ` · massing ${s.massing}` : '') + (s.lite ? ` · lite ${s.lite}` : '')
        + (s.hlodMid || s.hlodFar ? ` · HLOD ${s.hlodMid ?? 0} mid / ${s.hlodFar ?? 0} far` : '');   // Salsa P17
      const centre = s.centre && s.centre !== 'resident' ? ` · centre ${s.centre}` : '';
      this.worldStreamStats = `live ${s.live} · full ${s.full ?? 0}${win}${cheap}${centre}${pending}${workers}${s.cached ? ` · cached ${s.cached}` : ''}`;
    }
  }

  /** Salsa P10.D / P17: Outside tiles — HLOD / None / Flat / Massing beyond the active window (live, no regen). */
  worldSetStreamOutside(mode: 'hlod' | 'none' | 'flat' | 'massing'): void {
    this.worldStreamOutside = mode;
    this.shapeManager?.world?.setStreamOutsideTiles(mode);
    if (mode === 'hlod') this._syncHlodSkyline();
  }

  /** Salsa P17: the HLOD Skyline distance slider (tiles; live, no regen). */
  worldSetHlodSkyline(tiles: number): void {
    this.worldHlodSkyline = Math.max(2, Math.min(24, Math.round(+tiles || 10)));
    this.shapeManager?.world?.setStreamHlod({ skylineTiles: this.worldHlodSkyline });
  }
  /** Read the engine's current HLOD settings back (it clamps; another surface may have changed them). */
  private _syncHlodSkyline(): void {
    const h = this.shapeManager?.world?.streamHlod;
    if (h && typeof h.skylineTiles === 'number') this.worldHlodSkyline = h.skylineTiles;
  }

  private _stopStreamStats(): void {
    if (this._streamStatsTimer != null) { clearInterval(this._streamStatsTimer); this._streamStatsTimer = null; }
    this.worldStreamStats = '';
  }

  worldParamChanged(): void {
    if (this._worldDebounce) clearTimeout(this._worldDebounce);
    if (!this.worldHasWorld) return;
    if (this.worldMode !== 'tiled' && this.worldStreamFollow) {
      this.worldStreamFollow = false;
      this.shapeManager.world?.setStreamFollow(false);
      this._stopStreamStats();
    }
    this._worldDebounce = setTimeout(() => {
      this.shapeManager.world?.updateCity(this._worldParams());
      this.dirty.emit();
      // Skip the O(n) mesh rebuild for selective regens that don't change mesh IDs.
      const s3d = this.shapeManager.scene3d;
      const newIds = (s3d?.getAllMeshes() ?? [] as any[]).map((m: any) => m.id ?? m.nodeId).join('\n');
      if (newIds !== this._worldMeshIdsKey) {
        this._worldMeshIdsKey = newIds;
        this.refreshMeshes.emit();   // editor rebuilds its mesh list (past its world-panel early-return)
      }
    }, 10);
  }

}
