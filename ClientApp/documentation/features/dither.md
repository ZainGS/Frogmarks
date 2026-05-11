# Feature: Dither

Per-layer dithering applies a GPU compositor effect that quantizes and patterns the layer's pixel output. It is entirely non-destructive — the raster texture is unchanged; the effect renders at composite time.

---

## Where It Lives in the UI

The Dither panel appears in the right-side control panel when a raster layer is selected in the Layers tab. It is implemented inside `IllustrationComponent` as an inline panel bound to `selectedRasterLayerId`.

---

## State: `DitherConfig`

Defined in `src/app/boards/models/brush-preset.model.ts`:

```typescript
export interface DitherConfig {
  enabled: boolean;
  algorithm: DitherAlgorithm;    // 'bayer' | 'halftone_dot' | 'halftone_line' | 'halftone_diamond' | 'blue_noise' | 'noise'
  colorLevels: number;           // 2 / 3 / 4 / 8 / 16 / 256 (256 = off)
  bayerLevel: number;            // 0–4 (2×2 → 32×32)
  halftoneAngle: number;         // degrees
  halftoneFrequency: number;     // lines per inch equivalent
  strength: number;              // 0–1
  patternScale: number;          // 0.01–2.0
  perChannel: boolean;           // apply quantize per R/G/B channel independently
  colorMode: DitherColorMode;    // 'quantize' | 'duotone'
  foregroundColor: [number, number, number, number];   // RGBA 0–1
  backgroundColor: [number, number, number, number];   // RGBA 0–1
  invertPattern: boolean;
  duotoneBias: number;           // 0–1 (threshold midpoint)
  tintOpacity: number;           // 0–1
}
```

### Defaults (`DEFAULT_DITHER_CONFIG`)

```typescript
{
  enabled: false,
  algorithm: 'halftone_dot',
  colorLevels: 2,
  bayerLevel: 2,          // 8×8 matrix
  halftoneAngle: 45,
  halftoneFrequency: 40,
  strength: 1.0,
  patternScale: 0.25,
  perChannel: false,
  colorMode: 'duotone',
  foregroundColor: [0, 0, 0, 1],
  backgroundColor: [1, 1, 1, 0],
  invertPattern: false,
  duotoneBias: 0.5,
  tintOpacity: 1.0,
}
```

---

## Algorithms

| Algorithm | `DitherAlgorithm` value | Description |
|-----------|------------------------|-------------|
| Bayer (Crosshatch) | `'bayer'` | Ordered dither using a Bayer matrix. `bayerLevel` sets matrix size (0=2×2 … 4=32×32). Classic retro look. |
| Halftone — Dot | `'halftone_dot'` | Circular halftone dots. `halftoneAngle` rotates the screen; `halftoneFrequency` sets dot density. |
| Halftone — Line | `'halftone_line'` | Parallel line screen. Same parameters as Dot. Good for crosshatch or newsprint. |
| Halftone — Diamond | `'halftone_diamond'` | Diamond-shaped halftone cells. |
| Blue Noise (Organic) | `'blue_noise'` | Stochastic high-frequency dither with no visible pattern. Natural-looking grain. |
| Random Noise | `'noise'` | Pure random quantization noise. Most crude, fastest to compute. |

---

## Color Modes

| Mode | `DitherColorMode` value | Description |
|------|------------------------|-------------|
| Quantize | `'quantize'` | Reduces each pixel to `colorLevels` steps. With `perChannel: true`, quantizes R/G/B independently. Preserves existing hue. |
| Duotone | `'duotone'` | Replaces pixels with one of two colors (`foregroundColor`, `backgroundColor`) based on luminance threshold (`duotoneBias`). `tintOpacity` blends the result over the original. |

---

## Per-Layer Wiring

`IllustrationComponent` maintains:

```typescript
layerDitherConfigs: Map<string, DitherConfig> = new Map();
```

### Reading the config

```typescript
getLayerDitherConfig(layerId: string | null): DitherConfig {
  if (!layerId) return { ...DEFAULT_DITHER_CONFIG };
  return this.layerDitherConfigs.get(layerId) ?? { ...DEFAULT_DITHER_CONFIG };
}
```

This is called directly in the template via `getLayerDitherConfig(selectedRasterLayerId).algorithm` etc.

### Writing back to the engine

```typescript
onDitherConfigChange(layerId: string, config: DitherConfig): void {
  this.layerDitherConfigs.set(layerId, { ...config });
  (this.shapeManager as any)?.setLayerDitherConfig?.(layerId, config);
}
```

Any change to any dither slider calls this method. The map is the source of truth for the UI; the engine applies it at render time.

### Loading from saved state

In `loadIllustrationV2()`, after importing layers:

```typescript
for (const layer of state.layers) {
  if (layer.ditherConfig) {
    this.layerDitherConfigs.set(layer.layerId, layer.ditherConfig);
    (sm as any)?.setLayerDitherConfig?.(layer.layerId, layer.ditherConfig);
  }
}
```

### Saving to state

In `FrogFileService.buildStatePayload()`:

```typescript
ditherConfig: (sm as any)?.getLayerDitherConfig?.(layer.layerId) ?? null,
```

This is stored in `LayerStateDto.ditherConfig` and persisted in both the cloud V2 state and the `.frog` manifest.

---

## Salsa API

| Call | Purpose |
|------|---------|
| `(sm as any).setLayerDitherConfig?.(layerId, config)` | Apply dither config to a layer. Null or `enabled: false` disables the effect. |
| `(sm as any).getLayerDitherConfig?.(layerId)` | Read current dither config for a layer. |

Both are guarded with `?.` — they are no-ops on older Salsa versions.
