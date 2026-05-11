# 06 — Boards

`BoardComponent` at `src/app/boards/components/board/board.component.ts` is the infinite-whiteboard editor. It is declared in `BoardsModule` and routed at `/board/:id`. Boards are entirely separate from the illustration editor — they have no fixed canvas bounds, no raster pixel layers in the Salsa sense, no animation timeline, and no OPFS crash-recovery autosave. The Salsa engine runs in the same WebGPU context, but the component never calls `setIllustrationMode()` or `setIllustrationBounds()`, leaving the canvas unbounded and pannable in all directions.

---

## What a Board Is vs. an Illustration

| | Board | Illustration |
|---|---|---|
| Route | `/board/:id` | `/illustrate/:uid` |
| Canvas bounds | Infinite (no bounds set) | Fixed B4 aspect ratio (`1 × 1.417`) |
| Primary content | Vector shapes, SDF text, freehand strokes, sections, sticky notes, stamps | Raster pixel layers (WebGPU paint engine) |
| Raster layers | Optional overlay via `RasterBrushService` / `RasterLayersComponent` | Core feature |
| Persistence format | Single JSON blob (`sceneGraphData` on `Board`) | Multi-part V2 state (scene JSON + per-layer pixel blobs) |
| Autosave | `auditTime(1 s)` on `sceneChanged$` → single POST | `auditTime(2 s)` + OPFS stroke-level recovery |
| Thumbnail | Auto-generated via `ShapeManager.captureThumbnailBlob(300)` every 5 s if changed; custom thumbnail supported | Same mechanism |
| Collaboration model | `BoardCollaborator[]` + `BoardPermissions` stored on `Board` | Not modeled |

---

## Lifecycle

### `ngOnInit`

Subscribes to `route.paramMap`, extracts the `id` segment, and calls `initForBoard(id)` whenever the UID changes. This allows soft-navigation between boards without destroying the component instance.

### `initForBoard(boardUid)`

```
1. Unsubscribe existing autoSave / thumbnail / selectionChanged subscriptions
2. resetSceneState() — shapeManager.clear() + worldManager.resetWorldState()
3. Bootstrap WebGPU:
     startWebGPURendering('webgpuCanvas')          // first load (isRendererLive === false)
     reinitializeWebGPURendering('webgpuCanvas')   // subsequent board navigation
4. Acquire ShapeManager.getInstance() and WorldManager.getInstance()
5. loadPolygonPresets()
6. Subscribe to onSceneGraphChanged (one-shot) → markLoaded('sceneApplied'), saveThumbnail() if not custom
7. Subscribe to onSelectionChanged  → sync selectedLayerIds, selectedNode, shapeColor hex input
8. Subscribe to onSceneGraphChanged (persistent) → rebuild layerTree, push to sceneChanged$
9. GET /api/board/GetBoardByUid/{uid}
     a. If sceneGraphData present: await shapeManager.setSceneGraphJSON(data), buildLayerTree()
     b. Wire sceneChanged$ → saveBoard() (auditTime 1 s, distinctUntilChanged)
     c. Wire sceneChanged$ → saveThumbnailIfChanged() (auditTime 5 s)
10. Set initial tool state: stroke width, stamp texture/color/size, SDF text properties
11. Register DOM event listeners: mousemove (preview shape), click (confirm preview), keydown (hotkeys), mousedown (color picker dismiss)
```

### `ngOnDestroy`

Unsubscribes all RxJS subscriptions and removes all DOM event listeners. Calls `resetSceneState()` to clear the engine before the next board loads.

---

## Canvas Setup

```html
<canvas #webgpuCanvas id="webgpuCanvas"></canvas>
```

`@ViewChild('webgpuCanvas', { static: true })` provides the canvas ref. The string `"webgpuCanvas"` is passed to `startWebGPURendering()` / `reinitializeWebGPURendering()`. Angular never touches the canvas directly after that; Salsa owns the WebGPU context.

The board shell container is referenced as `#boardShell` and is passed to the Fullscreen API on `toggleFullscreen()`, so the entire UI chrome enters fullscreen rather than just the canvas.

---

## Loading State

Three independent signals must all fire before `isLoading` clears:

| Flag | Set when |
|---|---|
| `renderer` | `startWebGPURendering` / `reinitializeWebGPURendering` resolves |
| `board` | `getBoardByUid` observable emits success |
| `sceneApplied` | First `onSceneGraphChanged` fires after `setSceneGraphJSON`, or `requestAnimationFrame` fallback |

The loading overlay is removed only when all three flags are `true`.

---

## Tool Switching

The active tool is stored in `controlPanelActiveTool: string`. Switching a tool calls `setActiveTool(name)`, which disables every possible mode on the engine and then enables only the one matching the new value. The cursor mode (`cursorSelected` / `panHandSelected`) is orthogonal and controlled via `selectCursor('cursor' | 'panhand')`.

| `controlPanelActiveTool` | Engine call(s) | Notes |
|---|---|---|
| `''` (cursor) | `sm.disablePanningTool()` | Selection / move via Salsa default |
| `'panhand'` | `sm.enablePanningTool()` | Hand-pan mode |
| `'drawing:pen'` | `sm.enableScribbleDrawing()` | Freehand stroke |
| `'drawing:highlighter'` | `sm.enableHighlightDrawing()` | Highlight stroke; color mapped through `highlightColorMapping` |
| `'drawing:eraser'` | `sm.enableEraserTool()` | Vector eraser |
| `'drawing:pattern'` | `sm.enablePatternDrawing()` | Washi-tape / pattern fill stroke |
| `'connector'` | `sm.enableLineDrawing()`, `sm.setDefaultArrowheads(start, end)` | Arrow/connector line |
| `'text'` | `sm.enableTextDrawing()` | Plain text |
| `'sdftext'` | `sm.enableSDFTextDrawing()` | GPU-rendered SDF text |
| `'section'` | `sm.enableSectionDrawing()` | Region frame |
| `'stamp'` | `sm.enableStampDrawing()` | Image stamp placement |
| `'polygon:freeform'` | `sm.enablePolygonDrawing()` | Click-to-place vertices |
| `'shape:circle'` | `sm.setPreviewShape(ShapeType.Circle, event)` | Preview-then-confirm on click |
| `'shape:square'` | `sm.setPreviewShape(ShapeType.Rectangle, event)` | |
| `'shape:triangle'` | `sm.setPreviewShape(ShapeType.Triangle, event)` | |
| `'shape:polygon'` | `sm.setPreviewShape(ShapeType.Polygon, event)` | Uses `defaultPolygonSides` |
| `'postit'` | (double-click spawns via `spawnShape('stickynote')`) | Single-click activates, double-click places |
| `'misc'` | UI panel toggle only | No engine call |

Shape preview flow: `mousemove` calls `sm.updatePreviewShapePosition(event)`, and `click` calls `sm.confirmPreviewShape()` then `sm.setPreviewShape()` for the next placement.

---

## Shape Types

All vector shapes are managed through Salsa's `ShapeManager`. The following types can be created:

| Shape | API | Notes |
|---|---|---|
| Circle | `sm.createCircle(x, y, r, color, strokeWidth)` | |
| Rectangle | `sm.createRectangle(x, y, w, h, color, strokeWidth)` | |
| Triangle | `sm.createTriangle(x, y, w, h, color, strokeWidth)` | |
| Regular polygon | `sm.createRegularPolygon(x, y, r, sides, color, strokeWidth)` | `sides` from `defaultPolygonSides` |
| Preset polygon | `sm.createPresetPolygon(x, y, w, h, preset, color, strokeWidth)` | Named presets from `ShapeManager.PolygonPresets` |
| Sticky note | `sm.createStickyNote(x, y, text, color, authorName)` | StickyNote children hidden from layer tree |
| SDF text | `sm.enableSDFTextDrawing()` + click | Rendered as signed-distance-field bitmap |
| Section | `sm.enableSectionDrawing()` | Named region frame |
| Connector | `sm.enableLineDrawing()` | Supports arrowhead styles: `none`, `triangle`, `closedCircle`, `openCircle` |
| Stamp | `sm.setStampTexture(path)` + `sm.enableStampDrawing()` | PNG stamp placed at click point |
| Freehand stroke | `sm.enableScribbleDrawing()` | Parametric brush |
| Highlight stroke | `sm.enableHighlightDrawing()` | Semi-transparent overlay |
| Pattern stroke | `sm.enablePatternDrawing()` | Tiling SVG/WebP pattern |

---

## Arrowhead Options

Configured on `BoardComponent` as `arrowheadStart` / `arrowheadEnd` (defaults: `'none'` / `'triangle'`) and pushed to the engine whenever the connector tool activates or the user changes the dropdowns.

```typescript
export type ArrowheadStyle = 'none' | 'triangle' | 'closedCircle' | 'openCircle';
```

`arrowheadSize` (default `6`) is stored locally but not yet wired to a distinct engine call in the current code.

---

## Stamp Tool

The stamp palette contains eight slots (six fixed icons + an ice cream slot that randomises on selection from eight variants). Selecting a stamp calls:

```typescript
sm.setStampTexture(path);   // PNG asset path
sm.setStampColor(color);    // hex string
sm.setStampSize(size);      // normalised 0–1 (default 0.10)
```

---

## SDF Text Properties

Set at init time and updated live via sidebar controls:

| Property | Engine call | Default |
|---|---|---|
| Fill color | `sm.setSDFTextColor(hex)` | `#FFFFFF` |
| Outline color | `sm.setSDFTextOutlineColor(hex)` | `#000000` |
| Font family | `sm.setSDFTextFont(name)` | `Arial` |
| Font size | `sm.setSDFTextFontSize(px)` | `120` |
| Edge threshold | `sm.setSDFTextThreshold(0–1)` | `0.485` |
| Edge smoothing | `sm.setSDFTextSmoothing(0–1)` | `1` |
| Outline width | `sm.setSDFTextOutlineWidth(px)` | `0` |

Updating an already-placed SDF text node or sticky note calls `sm.updateSDFText(nodeId, changePartial)`.

---

## Layer Tree

Every `onSceneGraphChanged` event triggers a full rebuild of `layerTree: LayerTreeNode | null` by parsing the scene JSON and walking the `root` node recursively.

```typescript
export interface LayerTreeNode {
  id: string;
  type: string;       // e.g. 'Circle', 'Sticky Note', 'Section', etc.
  name?: string;
  visible: boolean;
  locked: boolean;
  children: LayerTreeNode[];
}
```

The left panel renders `filteredLayers` (a search-filtered, flat view of `layerTree.children`). Layer operations forward directly to `ShapeManager`:

| UI action | Engine call |
|---|---|
| Click layer (single) | `sm.deselectNode` others, `sm.addSelectedNode(id)` |
| Ctrl+click | `sm.addSelectedNode(id)` / `sm.deselectNode(id)` |
| Hover | `sm.addSelectedNode(id)` (temporary highlight) |
| Toggle visibility | `sm.setNodeVisibility(id, bool)` |
| Toggle lock | `sm.setNodeLocked(id, bool)` |
| Rename (blur / Enter) | `sm.setNodeName(id, name)` |
| Delete | `sm.deleteSelectedShapes()` |

Sticky notes suppress their internal children (text sub-node) from the layer tree display.

---

## Raster Layers Panel

`RasterLayersComponent` (`src/app/boards/components/raster-layers/raster-layers.component.ts`, selector `app-raster-layers`) is a standalone panel embedded in the board template. It manages a separate raster paint surface (handled by `RasterBrushService`) that sits alongside the vector scene — the same pattern used in the illustration editor, but the board does not enable `illustrationMode` on the engine.

### `RasterLayer` model

```typescript
export interface RasterLayer {
  id: string;
  name: string;
  type: RasterLayerType;     // 'layer' | 'folder' | '3d-scene'
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  blendMode: LayerBlendMode; // GPU compositor blend mode (0–11)
  opacity: number;           // 0–1
  clipped: boolean;
  lockTransparency: boolean;
  collapsed?: boolean;       // folders only
}
```

### Blend modes

`LayerBlendMode` is a numeric enum that maps directly to the Salsa `RasterCompositor` enum:

| Value | Name | Category |
|---|---|---|
| 0 | Normal | Normal |
| 1 | Multiply | Darken |
| 2 | Screen | Lighten |
| 3 | Overlay | Contrast |
| 4 | Soft Light | Contrast |
| 5 | Hard Light | Contrast |
| 6 | Color Dodge | Lighten |
| 7 | Color Burn | Darken |
| 8 | Darken | Darken |
| 9 | Lighten | Lighten |
| 10 | Add (Glow) | Lighten |
| 11 | Difference | Utility |

### Panel features

- Add / delete layers and folders via `RasterBrushService.addLayer()` / `addFolder()` / `deleteLayer()`
- Drag-and-drop reorder (`rasterService.reorderLayers(ids[])`) and up/down buttons
- Drag onto a folder row to parent / un-parent a layer (`rasterService.setLayerParent(id, parentId | null)`)
- Alt+click a layer row to toggle clipping mask
- Blend mode dropdown with position-aware open direction (opens upward when closer to viewport bottom)
- Opacity slider (`rasterService.setLayerOpacity(id, 0–1)`)
- Lock-transparency toggle; shortcut `/` toggles it on the active layer
- Inline double-click rename
- Search filter (live substring match on layer names)
- Special `3d-scene` layer type — selecting it emits `@Output() scene3dSelected: EventEmitter<boolean>` rather than calling the raster engine

### Boards vs. Illustration raster layers

In the illustration editor, raster layers are the primary surface and the raster engine is always active. In the board, `RasterLayersComponent` is present for optional painting on top of the vector scene, but the board has no animation timeline and no OPFS autosave for raster pixel data.

---

## Board Data Model

### `Board`

```typescript
class Board {
  id?: number;
  uuid?: string;
  name?: string;                  // default 'Untitled'
  description?: string;
  thumbnailUrl?: string;
  isCustomThumbnail?: boolean;    // suppresses auto-thumbnail updates when true
  isDraft?: boolean;
  isFavorite?: boolean;
  backgroundColor?: string;
  collaborators?: BoardCollaborator[];
  boardItems?: BoardItem[];
  teamId?: number;
  team?: Team;
  preferences?: BoardUserPreferences;
  permissions?: BoardPermissions;
  sceneGraphData?: string;        // full Salsa scene graph JSON
  isArchived?: boolean;
  type?: string;                  // 'board'
}
```

`sceneGraphData` is the single source of truth for all vector content. It is the string returned by `shapeManager.getSceneGraphJSON()` and accepted by `shapeManager.setSceneGraphJSON(json)`.

---

## Saving and Loading

### Auto-save flow

```
sceneChanged$ (Subject<string>)
  ├─ auditTime(1 000 ms) + distinctUntilChanged
  │    └─ BoardService.saveBoard(board.id, json)
  │         POST /api/board/save  { boardId, sceneGraphData }
  └─ auditTime(5 000 ms)
       └─ saveThumbnailIfChanged()
            ├─ compare sceneGraphData to lastSavedThumbnailJSON
            └─ if changed: ShapeManager.captureThumbnailBlob(300)
                            → BoardService.uploadThumbnail(boardUid, blob)
                              POST /api/board/thumbnails/{uid}
```

### Load flow

```
1. GET /api/board/GetBoardByUid/{uid}
2. If board.sceneGraphData exists:
     await shapeManager.setSceneGraphJSON(sceneGraphData)
     buildLayerTree(JSON.parse(sceneGraphData).root)
3. rasterBrushService.refreshLayers()  (implicit via subscription)
```

### `BoardService` endpoints

| Method | HTTP | Path |
|---|---|---|
| `createBoard(board)` | POST | `/api/board` |
| `getBoardByUid(uid)` | GET | `/api/board/GetBoardByUid/{uid}` |
| `saveBoard(id, json)` | POST | `/api/board/save` |
| `loadBoardSceneGraph(id)` | GET | `/api/board/load/{id}` |
| `uploadThumbnail(uid, blob, isCustom?)` | POST | `/api/board/thumbnails/{uid}` |
| `duplicateBoard(id, payload)` | POST | `/api/board/duplicate/{id}` |
| `renameBoard(id, name)` | PUT | `/api/board/rename/{id}` |
| `updateBoard(board)` | PUT | `/api/board` |
| `favoritedBoard(board)` | PUT | `/api/board/favorite` |
| `deleteBoard(id)` | DELETE | `/api/board/{id}` |
| `getBoardsByTeamId(id, ...)` | GET | `/api/board/search` (with pagination params) |
| `searchBoards(query, ...)` | GET | `/api/board/search` |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Escape` / `v` | Cursor (selection) tool |
| `h` | Pan hand tool |
| `p` | Pen (scribble) tool |
| `i` | Highlighter tool |
| `e` | Eraser tool |
| `l` | Connector (line) tool |
| `t` | Text tool |
| `Shift+T` | SDF text tool |
| `s` | Section tool |
| `m` | Stamp tool |
| `+` / `=` | Zoom in (`worldManager.zoomIn()`) |
| `-` / `_` | Zoom out (`worldManager.zoomOut()`) |
| `Delete` | Delete selected shapes |
| `f` | Toggle fullscreen |
| `x` | Toggle UI chrome visibility |

The raster layers panel also registers `/` → toggle lock-transparency on the active raster layer.

---

## Key Differences from IllustrationComponent

| Aspect | Board | Illustration |
|---|---|---|
| Salsa mode | Default (no illustration mode) | `sm.setIllustrationMode(true)`, fixed bounds |
| Primary tools | Vector, SDF text, stamps, connectors, sections | Raster brush, selection, fill, live text, balloons, panels |
| Autosave | Single JSON POST at 1 s debounce | Multi-part V2 PUT (scene + pixel blobs) + OPFS stroke recovery |
| Animation | None | Full timeline via `RasterAnimationService` |
| 3D scene | Available as raster layer type | Full panel with `Scene3DManager` |
| Undo/Redo | Delegated to Salsa engine (no explicit calls in component) | `rasterBrushService.undo()` / `redo()` |
| Paper grain | Not present | `rasterBrushService.setPaperGrain()` |
| Board context menu | New / duplicate / set thumbnail | Not present |
| Fullscreen | `boardShellRef` fullscreen API | Not present |
| UI toggle (`x`) | `uiHidden` flag hides all chrome | Not present |
