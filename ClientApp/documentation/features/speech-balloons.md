# Feature: Speech Balloons

Speech balloons are vector shape nodes placed in the illustration's scene graph. They render as GPU-drawn shapes with optional tails, and contain text that can be edited live. Balloons are created via the Balloon tool (`controlPanelActiveTool = 'balloon'`).

---

## Types

```typescript
export type BalloonStyle = 'rounded-rect' | 'ellipse' | 'cloud' | 'burst' | 'thought';
export type TailSide = 'top' | 'right' | 'bottom' | 'left';
export type WritingMode = 'horizontal-tb' | 'vertical-rl';
```

| Style | Description |
|-------|-------------|
| `'rounded-rect'` | Standard speech balloon with rounded rectangle body |
| `'ellipse'` | Oval / thought-bubble shape |
| `'cloud'` | Cloud-edged balloon |
| `'burst'` | Spiky burst (shout / impact) |
| `'thought'` | Thought balloon with dotted tail bubbles |

---

## `SpeechBalloonOptions`

Defined in `src/app/illustrate/models/speech-balloon.model.ts`:

```typescript
interface SpeechBalloonOptions {
  text: string;
  writingMode: WritingMode;          // 'horizontal-tb' | 'vertical-rl'
  tailSide: TailSide;                // 'top' | 'right' | 'bottom' | 'left'
  tailPosition: number;              // 0–1 along the edge
  showTail: boolean;
  style: BalloonStyle;
  fillColor: { r: number; g: number; b: number; a: number };
  strokeColor: { r: number; g: number; b: number; a: number };
  textColor: { r: number; g: number; b: number; a: number };
  fontFamily: string;
  fontSize: number;
  maxWidth: number;                  // in scene units (1.5 = 150% of default width)
}
```

### Defaults (`DEFAULT_BALLOON_OPTIONS`)

```typescript
{
  text: '',
  writingMode: 'horizontal-tb',
  tailSide: 'bottom',
  tailPosition: 0.3,
  showTail: true,
  style: 'rounded-rect',
  fillColor: { r: 1, g: 1, b: 1, a: 1 },
  strokeColor: { r: 0, g: 0, b: 0, a: 1 },
  textColor: { r: 0, g: 0, b: 0, a: 1 },
  fontFamily: 'Arial',
  fontSize: 90,
  maxWidth: 1.5,
}
```

---

## Creating a Balloon

When `controlPanelActiveTool === 'balloon'`, clicking the canvas calls:

```typescript
this.shapeManager.addSpeechBalloon({
  ...this.currentBalloonOptions,
  // x and y from click event (scene coordinates)
});
```

The balloon is placed with the current sidebar settings as initial options.

---

## Editing an Existing Balloon

When the user clicks an existing balloon node:
1. `interactionService.onSelectionChanged` fires with the node ID
2. `IllustrationComponent._syncBalloonSidebar(id)` reads the node's current properties back from the engine and updates the sidebar state
3. Subsequent sidebar changes call `shapeManager.updateSpeechBalloon(id, partialOptions)` — or the equivalent `(sm as any)` call

Double-clicking a balloon enters text-editing mode inside the engine.

---

## Sidebar State in `IllustrationComponent`

```typescript
balloonStyle: BalloonStyle         // bound to style picker
balloonTailSide: TailSide          // bound to tail side selector
balloonTailPosition: number        // bound to position slider (0–1)
balloonShowTail: boolean           // bound to show/hide toggle
balloonFillColor: string           // hex, converted to { r,g,b,a } on change
balloonStrokeColor: string
balloonFontSize: number
balloonWritingMode: WritingMode    // bound to H/V toggle
```

Any change to a sidebar input rebuilds the options object and calls the engine update.

---

## Writing Mode

`'vertical-rl'` places text in manga-style vertical right-to-left columns. The tail and layout geometry adapt automatically. This is particularly useful for Japanese-style word balloons in manga panels.

---

## Text Effects on Balloons

Balloons support the same `TextEffectEntry[]` system as Live Text nodes:

```typescript
(sm as any).setLiveTextEffects?.(nodeId, effects: TextEffectEntry[])
```

`TextEffectEntry` is defined in `src/app/illustrate/models/text-effect.model.ts`. Effects include outline, glow, shadow, and color transforms applied to the balloon's text render.
