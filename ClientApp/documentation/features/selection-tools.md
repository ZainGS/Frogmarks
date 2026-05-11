# Feature: Selection Tools

Raster selection tools let the user draw a selection mask over the active layer, then transform or clip operations to that region. All state is managed by `RasterSelectionService`.

---

## Tools

| Tool | `SelectionTool` value | How selection is drawn |
|------|-----------------------|------------------------|
| Rectangle | `'rect'` | Drag to define axis-aligned bounding rectangle |
| Ellipse | `'ellipse'` | Drag to define elliptical bounds |
| Lasso | `'lasso'` | Freehand draw a closed polygon path |
| Magic Wand | `'magic-wand'` | Click to flood-fill by color similarity |

### Activating a tool

From `IllustrationComponent`:

```typescript
// The controlPanelActiveTool values:
'select:rect'        → sm.enableRasterSelection('rect')
'select:ellipse'     → sm.enableRasterSelection('ellipse')
'select:lasso'       → sm.enableRasterSelection('lasso')
'select:magic-wand'  → sm.enableRasterSelection('magic-wand')
```

All four share the same sidebar (`controlPanelActiveTool.startsWith('select:')`). The magic wand has additional options exposed below the tool selector.

---

## `RasterSelectionService`

**File:** `src/app/shared/services/raster/raster-selection.service.ts`

### Observable State

```typescript
tool$: Observable<SelectionTool>
hasSelection$: Observable<boolean>
selectionInfo$: Observable<SelectionInfo | null>
```

`SelectionInfo`:

```typescript
interface SelectionInfo {
  hasSelection: boolean;
  bounds: SelectionBounds | null;   // { x, y, w, h } in texel space
  isTransforming: boolean;
  transform: TransformState | null; // { translateX, translateY, scaleX, scaleY, rotation }
}
```

### Core Methods

```typescript
enableTool(tool: SelectionTool): void
// → sm.enableRasterSelection(tool)

clearSelection(): void
// → (sm as any).clearRasterSelection?.()

invertSelection(): void
// → (sm as any).invertRasterSelection?.()

copySelection(): void          // → (sm as any).copyRasterSelection?.()
cutSelection(): void           // → (sm as any).cutRasterSelection?.()
pasteSelection(): void         // → (sm as any).pasteRasterSelection?.()
```

---

## Magic Wand Options

```typescript
interface MagicWandOptions {
  tolerance: number;          // 0–255: color distance threshold for flood-fill
  contiguous: boolean;        // true = connected pixels only; false = all matching pixels in layer
  mode: WandSelectionMode;    // 'new' | 'add' | 'subtract'
  referenceLayerId?: string;  // sample from a different layer than the active one
}
```

Set via:
```typescript
setMagicWandOptions(opts: MagicWandOptions): void
// → (sm as any).setMagicWandOptions?.(opts)
```

`IllustrationComponent` exposes `wandTolerance`, `wandContiguous`, `wandMode` bound to the magic wand options sidebar. Any change calls `rasterSelectionService.setMagicWandOptions(...)`.

---

## Transform / Float

When the user activates a transform on a selection (via the Transform button in the selection toolbar), the selection becomes "floating" — a GPU-lifted copy that can be repositioned:

```typescript
commitTransform(): void
// → (sm as any).commitRasterSelectionTransform?.()
// Merges the floated selection back into the layer at its new position

cancelTransform(): void
// → (sm as any).cancelRasterSelectionTransform?.()
// Discards the float and restores the original pixels
```

While `selectionInfo.isTransforming === true`, the selection toolbar shows Commit / Cancel buttons instead of the standard clipboard actions.

---

## Feather

```typescript
feather$: Observable<number>  // feather radius in pixels

setFeather(px: number): void
// → (sm as any).setRasterSelectionFeather?.(px)
```

Feather softens the selection edge. Default is `0` (hard edge).

---

## Keyboard Shortcuts (within `handleHotkeys`)

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` (while a selection tool is active) | Select All |
| `Ctrl+D` | Deselect |
| `Ctrl+Shift+I` | Invert selection |
