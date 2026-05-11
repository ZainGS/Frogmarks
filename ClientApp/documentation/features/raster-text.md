# Feature: Raster Text

The raster text tool lets users paint text directly onto a raster layer. Unlike SDF text (which produces GPU-rendered vector glyphs) or Live Text (which embeds DOM HTML), raster text is stamped as pixels into the layer's texture on commit.

---

## Activation

```typescript
// IllustrationComponent tool switching:
controlPanelActiveTool = 'raster-text'
// → sm.enableRasterText()
```

The engine places a text caret on the canvas on the next click. The user types to compose text; the live preview updates each keystroke.

---

## State: `RasterTextState`

Defined in `src/app/boards/models/brush-preset.model.ts`. Reflects the full composing state of the active raster text session:

```typescript
interface RasterTextState {
  isActive: boolean;
  text: string;
  destX: number;
  destY: number;
  font: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  color: [number, number, number, number];  // RGBA 0–1
  maxWidth: number;
  lineHeight: number;
  caretIndex: number;
}
```

`IllustrationComponent` subscribes to state changes:

```typescript
// In afterRendererBoot():
(this.shapeManager as any).onRasterTextStateChanged?.((state: RasterTextState) => {
  this.ngZone.run(() => {
    this.rasterTextState = state;
  });
});
```

`rasterTextState` drives the text sidebar — all sidebar inputs are bound to properties from this state object.

---

## Updating Text Properties

Properties are pushed to the engine via:

```typescript
(this.shapeManager as any).updateRasterTextProperties?.(partial: Partial<RasterTextState>)
```

Each sidebar control calls this with the relevant partial update:

| Control | Property sent |
|---------|--------------|
| Font family picker | `{ font }` |
| Font size slider | `{ fontSize }` |
| Bold toggle | `{ bold }` |
| Italic toggle | `{ italic }` |
| Alignment (L/C/R) | `{ align }` |
| Color picker | `{ color: [r, g, b, a] }` |
| Max width slider | `{ maxWidth }` |
| Line height slider | `{ lineHeight }` |

All updates apply live to the preview before the text is committed.

---

## Commit / Cancel

The engine commits the text to the raster layer on:
- `Enter` (with Shift for newline within the text)
- Clicking outside the text caret
- Switching away from the raster-text tool

Cancel discards the in-progress text without writing to the layer. The tool reverts to the previous state.

---

## Caret Navigation

The `caretIndex` field in `RasterTextState` tracks the caret position within `text`. Arrow keys, Home, End, and click-to-position are handled internally by the engine. The Angular sidebar does not manipulate the caret directly.

---

## Fonts

The font picker shows fonts available to the Salsa raster text engine. Available fonts depend on the system and any web fonts loaded at startup. The `font` property takes a CSS font-family string (e.g. `'Arial'`, `'Noto Sans'`).
