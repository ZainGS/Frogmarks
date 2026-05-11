# Feature: Brush System

The brush system covers preset management, tool activation, brush dynamics, and advanced per-brush effects (bleed, smudge, grain). All state flows through `RasterBrushService`.

---

## Presets

A `BrushPreset` is the complete brush definition. It is owned by Salsa's `RasterPaintEngine` — Frogmarks never holds a long-lived mutable copy. Mutations always go through `_mutatePreset(fn)`.

### `BrushPreset` structure

```typescript
interface BrushPreset {
  id: string;
  name: string;
  category: BrushCategory;   // string tag (e.g. 'Ink', 'Watercolor')
  icon?: string;

  tip: BrushTip;             // 'parametric' (hardness/roundness/angle) or 'image' (stamp)
  spacing: number;           // dab spacing, 0.01–2.0

  dynamics: BrushDynamics;   // pressure/velocity curves + jitter
  texture?: BrushTexture;    // per-dab grain overlay
  blending: BrushBlending;   // mode, opacity, flow, colorMixing
  stabilization: BrushStabilization; // method + level

  bleed?: BrushBleed;        // wet paint spread
  smudge?: BrushSmudge;      // canvas color pickup

  antiAliasing: boolean;
  minSize: number;           // px
  maxSize: number;           // px
  version: number;           // always 1
}
```

### Preset CRUD

```typescript
rasterBrushService.refreshPresets()        // reads from engine → pushes to presets$ / activePresetId$
rasterBrushService.setActivePreset(id)     // sm.setActiveBrushPreset(id)
rasterBrushService.savePresetAs(name)      // clones active preset with new name
rasterBrushService.createPreset(preset)    // new from scratch
rasterBrushService.deletePreset(id)
rasterBrushService.exportPreset(id)        // → JSON string
rasterBrushService.importPreset(json)
rasterBrushService.exportAll()             // all presets → JSON
rasterBrushService.importAll(json)         // bulk import, returns new IDs
```

### `_mutatePreset(fn)` pattern

The central mutation idiom — reads the live preset from the engine, applies the mutation, re-registers it:

```typescript
private _mutatePreset(mutate: (p: BrushPreset) => void): void {
  const engine = this.sm?.getRasterPaintEngine?.();
  const id = this._activePresetId$.value;
  const preset = engine.getPreset?.(id) as BrushPreset;
  mutate(preset);
  engine.registerPreset(preset);
  engine.setActivePreset(preset.id);
  this.refreshPresets();
}
```

All `update*` methods use this pattern. Never mutate a stale preset copy directly.

---

## Tool Activation

```typescript
rasterBrushService.enableBrushTool(presetId?)
// → sm.enableRasterTool()
// Optional: sm.setActiveBrushPreset(presetId)

rasterBrushService.enableEraserTool(style: EraserStyle)
// style = 'fade' → sm.enableRasterEraserTool()
// style = 'clear' → sm.enableRasterClearEraserTool()

rasterBrushService.disableRasterTool()
// → sm.disableRasterTool()
```

---

## Dynamics

`BrushDynamics` holds all pressure/velocity response curves and scatter/jitter settings:

```typescript
interface BrushDynamics {
  sizePressureCurve: CurvePoint[];       // maps stylus pressure to size
  opacityPressureCurve: CurvePoint[];    // maps pressure to opacity
  flowPressureCurve: CurvePoint[];       // maps pressure to flow
  rotationPressureCurve?: CurvePoint[];
  scatterPressureCurve?: CurvePoint[];
  sizeVelocityCurve?: CurvePoint[];      // maps stroke speed to size
  sizeRandomJitter?: number;             // 0–1: random per-dab size variation
  rotationRandomJitter?: number;         // random rotation per dab
  scatterDistance?: number;              // max lateral scatter distance
}
```

Each `CurvePoint` is `{ x: number; y: number }` (0–1 on both axes). The curves are piecewise linear; the engine interpolates between points.

Update methods:

```typescript
rasterBrushService.updateSizeCurve(pts: CurvePoint[])
rasterBrushService.updateOpacityCurve(pts: CurvePoint[])
rasterBrushService.updateFlowCurve(pts: CurvePoint[])
rasterBrushService.updateVelocitySizeCurve(pts: CurvePoint[])
rasterBrushService.updateScatterPressureCurve(pts: CurvePoint[])
rasterBrushService.updateSizeJitter(v: number)
rasterBrushService.updateRotationJitter(v: number)
rasterBrushService.updateScatterDistance(v: number)
```

---

## Stabilization

```typescript
interface BrushStabilization {
  method: StabilizationMethod;       // 'none' | 'moving-average' | 'predictive' | 'catmull-rom' | 'pull-string'
  level: number;                     // 0–10
  pullStringLength?: number;         // 10–60px (pull-string only)
}
```

Set via:
```typescript
rasterBrushService.updateStabilization(method, level, pullLength?)
// → _mutatePreset: preset.stabilization.*
// → sm.setActiveStabilization?.(method, level, pullLength)
```

---

## Brush Bleed

Spreads wet paint into surrounding pixels, simulating liquid media.

```typescript
interface BrushBleed {
  enabled: boolean;
  perDab: boolean;   // true = ping-pong bleed every stamp; false = diffusion at end-of-stroke
  radius: number;    // 1–32 px
  strength: number;  // 0–1
}
```

```typescript
rasterBrushService.setBrushBleed(settings: BrushBleed)
// → (sm as any).setBrushBleed(activePresetId, settings)
```

`perDab: true` applies the bleed on every dab during the stroke (more paint-like, heavier). `perDab: false` applies a single diffusion pass on pen lift (lighter, edge-softening).

---

## Brush Smudge

Picks up the existing canvas color and mixes it into the stroke, creating a smear effect.

```typescript
interface BrushSmudge {
  enabled: boolean;
  strength: number;     // 0–1, scaled by stylus pressure per-dab
  sampleRadius: number; // reserved — currently unused by engine, defaults to 0
}
```

```typescript
rasterBrushService.setBrushSmudge(settings: BrushSmudge)
// → (sm as any).setBrushSmudge(activePresetId, settings)
```

Smudge reads one dab behind the current position (1-dab lag), picks up the canvas color there, and mixes it into the current dab proportionally to `strength × pressure`.

---

## Dual Brush, Color Jitter, Wet Edges, Stroke Texture

Additional advanced effects on `BrushPreset`:

```typescript
rasterBrushService.setDualBrush(settings)
// → sm.setBrushDualBrush(id, settings)
// Overlays a second texture brush per dab

rasterBrushService.setColorJitter(jitter)
// → sm.setBrushColorJitter(id, jitter)
// Per-dab HSB/opacity randomization

rasterBrushService.setWetEdges(settings)
// → sm.setBrushWetEdges(id, settings)
// Accumulates extra opacity at stroke edges (watercolor look)

rasterBrushService.setStrokeTexture(settings)
// → sm.setBrushStrokeTexture(id, settings)
// Applies a continuous texture strip along the stroke path
```

---

## Brush Pack Import/Export

```typescript
rasterBrushService.importBrushPack(json: string)
// → sm.importBrushPresets(json)

rasterBrushService.exportAll(): string
// → sm.exportAllBrushPresets()
```

Brush pack files are JSON strings containing an array of serialized `BrushPreset` objects. The import/export UI is in the brush preset editor panel in `IllustrationComponent`.
