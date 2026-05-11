# Feature: Panel Layout

The Panel Layout tool generates a comic/manga page grid as vector shape nodes in the illustration's scene graph. Panels are created by Salsa and remain individually selectable, resizable, and styleable shapes after placement.

Keyboard shortcut: `Shift+G`.

---

## Activation

```typescript
controlPanelActiveTool = 'panel-layout'
// → (sm as any).enablePanelLayoutTool?.()
// Deactivation:
// → (sm as any).disablePanelLayoutTool?.()
```

---

## Templates

```typescript
type PanelTemplate =
  | 'grid-2x2'
  | 'grid-3x2'
  | 'grid-2x3'
  | 'manga-4-panel'
  | 'manga-action'
  | 'manga-dialog'
  | 'full-page'
  | 'two-strip'
  | 'three-strip';
```

| Template | Description |
|----------|-------------|
| `'grid-2x2'` | 4 equal panels, 2 columns × 2 rows |
| `'grid-3x2'` | 6 equal panels, 3 columns × 2 rows (default) |
| `'grid-2x3'` | 6 equal panels, 2 columns × 3 rows |
| `'manga-4-panel'` | Yonkoma — 4 panels stacked vertically |
| `'manga-action'` | Asymmetric action layout (large + small panels) |
| `'manga-dialog'` | Asymmetric dialog layout |
| `'full-page'` | Single full-page panel |
| `'two-strip'` | 2 horizontal strips |
| `'three-strip'` | 3 horizontal strips |

---

## `PanelLayoutOptions`

Defined in `src/app/illustrate/models/panel-layout.model.ts`:

```typescript
interface PanelLayoutOptions {
  template: PanelTemplate;
  pageWidth: number;          // normalized engine units
  pageHeight: number;
  gutterWidth: number;        // space between panels (engine units)
  bleedMargin: number;        // bleed area outside panels (engine units)
  borderWidth: number;        // panel border stroke width
  borderColor: { r, g, b, a };
  backgroundColor: { r, g, b, a };
  showBleedGuides: boolean;
  showGutterGuides: boolean;
}
```

### Page Size Presets

```typescript
PAGE_SIZE_PRESETS = [
  { name: 'B4 Manga',  width: 2.0, height: 3.0  },   // 257 × 364 mm
  { name: 'A4 Comic',  width: 2.0, height: 2.83 },   // 210 × 297 mm
  { name: 'US Comic',  width: 2.0, height: 3.10 },   // 168 × 260 mm
  { name: 'Webtoon',   width: 2.0, height: 3.20 },   // 800 × 1280 px
  { name: 'Square',    width: 2.0, height: 2.0  },   // 1:1
]
```

### Defaults (`DEFAULT_PANEL_LAYOUT_OPTIONS`)

```typescript
{
  template: 'grid-3x2',
  pageWidth: 2.0, pageHeight: 3.0,
  gutterWidth: 0.02, bleedMargin: 0.01,
  borderWidth: 0.004,
  borderColor: { r: 0, g: 0, b: 0, a: 1 },
  backgroundColor: { r: 1, g: 1, b: 1, a: 1 },
  showBleedGuides: true,
  showGutterGuides: true,
}
```

---

## Creating a Layout

`createPanelLayout()` in `IllustrationComponent` tries the illustration-aware API first, then falls back to the generic one:

```typescript
createPanelLayout(): void {
  const useFit = typeof sm.createPanelLayoutForIllustration === 'function';
  if (useFit) {
    layout = sm.createPanelLayoutForIllustration({
      template: this.panelTemplate,
      gutterWidth: this.panelGutterWidth,
      bleedMargin: this.panelBleedMargin,
    });
  } else if (sm.createPanelLayout) {
    const ps = /* page size from preset */;
    layout = sm.createPanelLayout(0, 0, ps.width, ps.height, {
      template: this.panelTemplate,
      gutterWidth: this.panelGutterWidth,
      bleedMargin: this.panelBleedMargin,
    });
  }
  this.activePanelLayoutId = layout?.getId?.() ?? null;
}
```

`createPanelLayoutForIllustration` auto-sizes to the illustration's current bounds (`setIllustrationBounds`). The fallback `createPanelLayout(x, y, w, h, opts)` takes explicit coordinates.

The returned layout object's ID is stored as `activePanelLayoutId` — all subsequent mutation calls use this ID.

---

## Modifying an Existing Layout

Once a layout is created, the sidebar allows live updates without destroying and recreating:

```typescript
// Change template (re-arranges panels):
onPanelTemplateChange(template: PanelTemplate): void {
  this.panelTemplate = template;
  (sm as any).applyPanelTemplate?.(this.activePanelLayoutId, template);
}

// Adjust gutter width:
onPanelGutterChange(v: string): void {
  this.panelGutterWidth = +v;
  (sm as any).setPanelGutter?.(this.activePanelLayoutId, this.panelGutterWidth);
}

// Adjust bleed margin:
onPanelBleedChange(v: string): void {
  this.panelBleedMargin = +v;
  (sm as any).setPanelBleed?.(this.activePanelLayoutId, this.panelBleedMargin);
}
```

---

## Guide Overlays

After creation, the component can retrieve guide geometry from the engine to draw overlay indicators:

```typescript
// Bleed guide — a rect showing the bleed boundary:
this.bleedGuideRect = sm.getPanelBleedGuide(this.activePanelLayoutId) ?? null;

// Gutter guides — lines between panels:
this.gutterGuideLines = sm.getPanelGutterGuides(this.activePanelLayoutId) ?? null;
```

Guides are controlled by `panelShowBleedGuides` / `panelShowGutterGuides` boolean flags in the sidebar.

---

## Component State

```typescript
activePanelLayoutId: string | null  // ID of the most-recently created layout node
panelTemplate: PanelTemplate        // currently selected template
panelGutterWidth: number            // default 0.02
panelBleedMargin: number            // default 0.01
panelShowBleedGuides: boolean
panelShowGutterGuides: boolean
bleedGuideRect: any | null
gutterGuideLines: any[] | null
```

A new `createPanelLayout()` call replaces `activePanelLayoutId`. The old layout nodes stay in the scene graph as regular vector shapes — they are not removed automatically.

---

## Panels as Vector Shapes

After creation, each panel is a regular `Rectangle` shape node in the scene graph. The user can select, resize, reorder, and style individual panels using the standard vector shape tools. The panel layout ID is only needed for the template/gutter/bleed mutation APIs; it does not affect the shapes once placed.
