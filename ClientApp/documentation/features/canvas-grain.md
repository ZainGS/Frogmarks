# Feature: Canvas Grain

Canvas Grain (Paper Texture) applies a global simulated paper surface to the illustration canvas. It modulates the GPU compositor output, making every layer appear as if painted on physical paper. This is distinct from Brush Grain, which modulates individual brush dab alpha.

---

## Two Independent Grain Systems

| System | Scope | Service method | Salsa call |
|--------|-------|----------------|------------|
| **Canvas Grain** (Paper) | Global — affects all layers in the compositor | `rasterBrushService.setPaperGrain(settings)` | `sm.setPaperGrain(settings)` |
| **Brush Grain** | Per-preset — modulates each brush dab's alpha mask | `rasterBrushService.setBrushGrain(settings)` | `sm.setBrushGrain(settings)` |

Canvas Grain is in the "Paper Grain" tab of the control panel. Brush Grain is inside the brush preset editor (Texture section).

---

## Canvas Grain: `CanvasGrainSettings`

Defined in `src/app/boards/models/brush-preset.model.ts`:

```typescript
interface CanvasGrainSettings {
  type: CanvasGrainType;   // see below
  scale: number;           // texture tile scale, 0.1–5.0
  strength: number;        // grain intensity, 0–1
}
```

### `CanvasGrainType`

```typescript
type CanvasGrainType =
  | 'none'
  | 'cold-press'
  | 'hot-press'
  | 'canvas-linen'
  | 'rough'
  | 'watercolor'
  | 'newsprint';
```

| Type | Description |
|------|-------------|
| `'none'` | No paper texture |
| `'cold-press'` | Medium-rough watercolor paper |
| `'hot-press'` | Smooth watercolor paper |
| `'canvas-linen'` | Woven canvas texture |
| `'rough'` | Heavy tooth drawing paper |
| `'watercolor'` | Classic watercolor paper grain |
| `'newsprint'` | Dot-screen halftone paper |

### Service calls

```typescript
// Apply new settings:
rasterBrushService.setPaperGrain(settings: CanvasGrainSettings): void
// → sm.setPaperGrain(settings)

// Read current settings (to init sidebar on load):
rasterBrushService.getPaperGrain(): CanvasGrainSettings | null
// → sm.getPaperGrain()

// Get list of available types (for dropdown):
rasterBrushService.getAvailableGrainTypes(): CanvasGrainType[]
// → sm.getAvailableGrainTypes()
```

---

## Brush Grain: Per-Dab Alpha Modulation

Unlike canvas grain (which is a compositor pass), brush grain applies a texture mask to each individual brush dab during painting. This gives the brush stroke a textured edge regardless of the canvas paper setting.

### `BrushTexture` (in `BrushPreset`)

```typescript
interface BrushTexture {
  imageData: string;          // base64 PNG texture
  scale: number;
  strength: number;
  mode: 'multiply' | 'subtract';
  fixedToCanvas: boolean;     // true = texture stays fixed; false = moves with brush
}
```

### Service calls

```typescript
rasterBrushService.setBrushGrain(settings: BrushTexture): void
// → sm.setBrushGrain(settings)

rasterBrushService.getBrushGrain(): BrushTexture | null
// → sm.getBrushGrain()
```

These read/write the grain settings on the currently active brush preset via the paint engine.

---

## IllustrationComponent Wiring

The Paper Grain tab is bound to three component properties:

```typescript
paperGrainType: CanvasGrainType   // bound to type selector
paperGrainScale: number           // bound to scale slider
paperGrainStrength: number        // bound to strength slider
```

Any change calls:

```typescript
onPaperGrainChange(): void {
  this.rasterBrushService.setPaperGrain({
    type: this.paperGrainType,
    scale: this.paperGrainScale,
    strength: this.paperGrainStrength,
  });
}
```

On load, the current paper grain is read back from the engine to initialize the sidebar:

```typescript
const existing = this.rasterBrushService.getPaperGrain();
if (existing) {
  this.paperGrainType = existing.type;
  this.paperGrainScale = existing.scale;
  this.paperGrainStrength = existing.strength;
}
```

---

## Persistence

Canvas grain settings are not saved as part of `IllustrationStateDto`. They are stored inside Salsa's `DocumentSavePayload` (persisted via OPFS auto-save and `.frogmarks` export). When loading from a cloud V2 state, the paper grain returns to the Salsa engine default (`'none'`, scale 1, strength 0) unless a `.frogmarks` restore is also performed.
