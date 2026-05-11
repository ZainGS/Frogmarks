# Feature: Frame Link Animation

Frame Link Animation is a per-layer procedural animation system. It displaces a layer's pixels over time using a mathematical waveform or noise function, synchronized to the animation frame clock. The effect is non-destructive — the pixel data is unchanged; displacement is applied at composite time.

The name "frame link" means the animation is linked to the frame timeline: it advances with each frame rather than running at wall-clock time.

---

## Where It Lives in the UI

The Frame Link Animation panel appears inside the Dither/Frame Link section of the control panel when a raster layer is selected. It is an inline panel in `IllustrationComponent` bound to `selectedRasterLayerId`.

---

## State: `FrameLinkAnimation`

Defined in `src/app/boards/models/brush-preset.model.ts`:

```typescript
export interface FrameLinkAnimation {
  enabled: boolean;
  type: FrameLinkAnimationType;      // 'wave' | 'shake' | 'ripple' | 'noise' | 'turbulence'
  amplitude: number;                 // displacement amount in pixels
  frequency: number;                 // spatial frequency (cycles per canvas width)
  speed: number;                     // animation speed (advance per frame)
  direction: number;                 // angle in degrees (0 = rightward)
  phase: number;                     // initial phase offset (0–2π)
  loopMode: FrameLinkLoopMode;       // 'free' | 'loop-to-fit'
  rippleCenterX: number;             // 0–1, relative to canvas width (ripple only)
  rippleCenterY: number;             // 0–1, relative to canvas height (ripple only)
  noiseOctaves: number;              // fractal layers (noise/turbulence only)
  noiseLacunarity: number;           // frequency multiplier per octave
  noisePersistence: number;          // amplitude falloff per octave
  shakeSeed: number;                 // random seed for shake pattern
  displaceX: boolean;                // apply displacement on X axis
  displaceY: boolean;                // apply displacement on Y axis
}
```

### Defaults (`DEFAULT_FRAME_LINK_ANIMATION`)

```typescript
{
  enabled: false,
  type: 'wave',
  amplitude: 10,
  frequency: 3.0,
  speed: 0.15,
  direction: 0,
  phase: 0,
  loopMode: 'free',
  rippleCenterX: 0.5,
  rippleCenterY: 0.5,
  noiseOctaves: 2,
  noiseLacunarity: 2.0,
  noisePersistence: 0.5,
  shakeSeed: 0,
  displaceX: true,
  displaceY: false,
}
```

---

## Animation Types

| Type | `FrameLinkAnimationType` | Description |
|------|--------------------------|-------------|
| Wave | `'wave'` | Sinusoidal displacement. `direction` controls wave propagation angle. Standard wave scroll. |
| Shake | `'shake'` | Random per-frame displacement using `shakeSeed`. Produces camera-shake effect. |
| Ripple | `'ripple'` | Circular ripple expanding from `(rippleCenterX, rippleCenterY)`. |
| Noise | `'noise'` | Smooth Perlin-style fractal noise. `noiseOctaves`, `noiseLacunarity`, `noisePersistence` control detail. |
| Turbulence | `'turbulence'` | Absolute-value variant of noise — sharper folds and ridges. Same parameters as Noise. |

---

## Loop Modes

| Mode | Description |
|------|-------------|
| `'free'` | Animation advances at `speed` per frame with no period constraint. Runs continuously. |
| `'loop-to-fit'` | Phase is adjusted so the animation completes exactly one cycle within the timeline's frame count. Useful for seamless loops. |

---

## Per-Layer Wiring

`IllustrationComponent` maintains:

```typescript
layerFrameLinkConfigs: Map<string, FrameLinkAnimation> = new Map();
```

### Reading the config

```typescript
getLayerFrameLinkConfig(layerId: string | null): FrameLinkAnimation {
  if (!layerId) return { ...DEFAULT_FRAME_LINK_ANIMATION };
  return this.layerFrameLinkConfigs.get(layerId) ?? { ...DEFAULT_FRAME_LINK_ANIMATION };
}
```

### Writing back to the engine

```typescript
onFrameLinkConfigChange(layerId: string, config: FrameLinkAnimation): void {
  this.layerFrameLinkConfigs.set(layerId, { ...config });
  (this.shapeManager as any)?.setLayerFrameLinkAnimation?.(layerId, config);
}
```

### Loading from saved state

In `loadIllustrationV2()`, after importing layers:

```typescript
for (const layer of state.layers) {
  if (layer.frameLinkAnimation) {
    this.layerFrameLinkConfigs.set(layer.layerId, layer.frameLinkAnimation);
    (sm as any)?.setLayerFrameLinkAnimation?.(layer.layerId, layer.frameLinkAnimation);
  }
}
```

### Saving to state

In `FrogFileService.buildStatePayload()`:

```typescript
frameLinkAnimation: (sm as any)?.getLayerFrameLinkAnimation?.(layer.layerId) ?? null,
```

Persisted in `LayerStateDto.frameLinkAnimation` in both cloud V2 state and the `.frog` manifest.

---

## Salsa API

| Call | Purpose |
|------|---------|
| `(sm as any).setLayerFrameLinkAnimation?.(layerId, config)` | Apply frame link animation config to a layer. |
| `(sm as any).getLayerFrameLinkAnimation?.(layerId)` | Read current config for a layer. |

Both calls are guarded with `?.`. The engine advances the animation phase each frame when `enabled: true` and the animation timeline is playing.
