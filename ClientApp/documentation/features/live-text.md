# Feature: Live Text

Live Text nodes are vector-backed text objects that render as rich HTML-like text within the illustration scene graph. Unlike raster text (which stamps pixels into a layer), a Live Text node remains editable at any time. It supports font, size, bold/italic, writing mode, text effects, and optional custom WebGPU shaders per node.

Keyboard shortcut to activate: `Shift+Y`.

---

## Activation

```typescript
controlPanelActiveTool = 'live-text'
// No engine enable call — tool state is purely Angular-side
// Click on canvas → placeLiveText(worldX, worldY)
```

---

## Placing a Node

```typescript
placeLiveText(worldX: number, worldY: number): void {
  const node = sm.createLiveText(worldX, worldY, {
    text: this.liveTextText,
    font: this.liveTextFont,
    fontSize: this.liveTextFontSize,
    bold: this.liveTextBold,
    italic: this.liveTextItalic,
    writingMode: this.liveTextWritingMode,
    padding: this.liveTextPadding,
    effects: this._buildLiveTextEffects(),
    // color, maxWidth also passed
  });
  this.liveTextNodeId = node.id ?? node.getId?.();
  sm.beginLiveTextEditing?.(this.liveTextNodeId);
  this.liveTextIsEditing = true;
}
```

After placement, the engine immediately enters edit mode on the new node.

---

## Sidebar State in `IllustrationComponent`

```typescript
liveTextNodeId: string | null        // ID of the currently targeted node
liveTextText: string                 // current text content
liveTextFont: string                 // CSS font family (default 'Arial')
liveTextFontSize: number             // px (default 48)
liveTextBold: boolean
liveTextItalic: boolean
liveTextWritingMode: 'horizontal-tb' | 'vertical-rl'
liveTextColor: string                // hex
liveTextMaxWidth: number             // 0 = no wrap
liveTextPadding: number              // px (default 16)
liveTextEffectChain: TextEffectEntry[]
liveTextIsEditing: boolean
```

---

## Selecting an Existing Node

Two paths:
1. **Single-click** while `controlPanelActiveTool === 'live-text'` — checks `sm.getLiveTextNode?.(hitNodeId)`; if found, calls `_syncLiveTextSidebar(id)` + `sm.beginLiveTextEditing?.(id)`.
2. **Double-click** anywhere on canvas — if the double-clicked shape is a Live Text node (`interactionService.onSelectionChanged` fires first), auto-switches to `'live-text'` tool and enters edit mode.

### `_syncLiveTextSidebar(nodeId)`

Reads the node back from the engine to populate the sidebar:

```typescript
const node = sm.getLiveTextNode?.(nodeId);
this.liveTextFont     = node.font ?? 'Arial';
this.liveTextFontSize = node.fontSize ?? 48;
this.liveTextBold     = node.bold ?? false;
this.liveTextItalic   = node.italic ?? false;
this.liveTextWritingMode = node.writingMode ?? 'horizontal-tb';
this.liveTextPadding  = node.padding ?? 16;
if (node.textColor)   this.liveTextColor = this._rgba01ToHex(node.textColor);
if (node.maxWidth != null) this.liveTextMaxWidth = node.maxWidth;
// restore effect chain from node.effects
```

---

## Style Updates

Style changes during editing call:

```typescript
sm.setLiveTextStyle(this.liveTextNodeId, { [field]: value })
// color is converted: { color: this._hexToRgba01(hex) }
```

---

## Edit Lifecycle

```typescript
sm.beginLiveTextEditing?.(nodeId)   // enter edit mode (caret appears)
sm.endLiveTextEditing(nodeId)       // commit text; called on Escape or tool switch
sm.flattenLiveText(nodeId)          // rasterize node into active raster layer → returns Promise<boolean>
```

`Escape` is handled specially: it always reaches `handleHotkeys` even during editing so `endLiveTextEditing()` can be called and `liveTextIsEditing` synced.

---

## Text Effects

Effects are a stackable chain of GPU post-process passes applied to the node's texture. Defined in `src/app/illustrate/models/text-effect.model.ts`.

### `TextEffectEntry`

```typescript
interface TextEffectEntry {
  id: number;           // client-side identity (for list mutation)
  type: TextEffectType;
  params: Record<string, any>;
}

type TextEffectType = 'chromatic-aberration' | 'glow' | 'wave' | 'glitch' | 'outline';
```

### Effect parameters (defaults)

| Effect | Key params | Defaults |
|--------|-----------|---------|
| `outline` | `thickness`, `color: [r,g,b,a]` | `thickness: 2`, black |
| `glow` | `radius`, `intensity`, `color: [r,g,b]` | `radius: 4`, `intensity: 1.5`, white |
| `chromatic-aberration` | `strength`, `angle` | `strength: 0.005`, `angle: 0` |
| `wave` | `amplitude`, `frequency`, `speed`, `time` | `amplitude: 3`, `frequency: 10` |
| `glitch` | `intensity`, `blockSize`, `time` | `intensity: 0.3`, `blockSize: 8` |

### Effect chain management

```typescript
addLiveTextEffect(type?: TextEffectType): void
// Appends a new effect entry with default params, then _pushLiveTextEffects()

removeLiveTextEffect(id: number): void
moveLiveTextEffect(id: number, direction: -1 | 1): void
onLiveTextEffectTypeChange(entry, type): void
onLiveTextEffectParamChange(entry, key, value): void
applyLiveTextEffectPreset(preset: TextEffectPreset): void
// Replaces the entire chain with a preset (Impact, Energy, Ghost, Horror, Glitch, Clean, Neon, Boom)
```

All changes call `_pushLiveTextEffects()`:

```typescript
private _pushLiveTextEffects(): void {
  sm.setLiveTextEffects(this.liveTextNodeId, this._buildLiveTextEffects());
}
```

---

## Custom WebGPU Shaders

Live Text nodes optionally support a custom WGSL compute shader applied as a post-process. This is an advanced/experimental path:

```typescript
sm.setCustomShader?.(nodeId, shaderCode, advanced, params, ...)
sm.removeCustomShader?.(nodeId)
sm.setCustomShaderParams?.(nodeId, params: [number, number, number, number])
```

Predefined `SHADER_SNIPPETS` in `text-effect.model.ts` (Grayscale, Invert, Sepia, Ripple, Pixelate, Vignette, Rainbow, Breathe, Scan Line) serve as copy-paste starting points in the shader editor UI.
