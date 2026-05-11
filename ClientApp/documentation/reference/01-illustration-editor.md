# 01 — Illustration Editor

`IllustrationComponent` at `src/app/illustrate/components/illustration/illustration.component.ts` is the single large component that drives the entire illustration editor. It is ~4 500 lines, declared in `IllustrateModule`, and routed at `/illustrate/:uid`.

---

## Lifecycle

### `ngOnInit`

Subscribes to `route.paramMap` and calls `initForIllustration(uid)` whenever the UID changes. This allows soft-navigation between illustrations without destroying the component.

### `initForIllustration(uid)`

```
1. Cleanup subscriptions and reset scene state
2. Bootstrap WebGPU:
     startWebGPURendering('webgpuCanvas')     // first load
     reinitializeWebGPURendering('webgpuCanvas') // subsequent navigation
3. Call afterRendererBoot() — acquires ShapeManager, wires all engine subscriptions
4. GET illustration by UID → loadIllustrationV2()
5. Wire sceneChanged$ → saveIllustrationV2() (auditTime 2s)
6. autoSaveService.enable() — OPFS crash-recovery autosave
7. Wire sceneChanged$ → saveThumbnailIfChanged() (auditTime 5s)
```

### `afterRendererBoot()`

- Acquires `ShapeManager` singleton (tries to pass renderer to constructor for raster layer seeding).
- Subscribes to `interactionService.onSceneGraphChanged` — rebuilds `layerTree` and refreshes raster layers on every change.
- Subscribes to `interactionService.onSelectionChanged` — syncs `selectedLayerIds` and balloon/live-text sidebars.
- Subscribes to `onRasterStrokeEnd` — triggers OPFS notifyStrokeEnd and cloud auto-save.
- Sets illustration mode on the engine: `shapeManager.setIllustrationMode(true)`, `setIllustrationBounds(1, 1.417)` (B4 aspect ratio), `setBackgroundPatternFixed(true)`.

---

## Tool Switching

The active tool is stored in `controlPanelActiveTool: string`. Switching a tool generally:
1. Disables the previous tool on the engine (e.g. `sm.disableRasterTool()`).
2. Enables the new tool on the engine (e.g. `sm.enableRasterTool()`, `sm.enableRasterSelection()`).
3. Updates `controlPanelActiveTool` so the template shows the correct sidebar panel.

| `controlPanelActiveTool` value | Engine call | Panel shown |
|-------------------------------|-------------|-------------|
| `'brush'` | `rasterBrushService.enableBrushTool()` | Brush settings |
| `'eraser'` | `rasterBrushService.enableEraserTool(style)` | Eraser settings |
| `'select:rect'` | `sm.enableRasterSelection('rect')` | Selection toolbar |
| `'select:ellipse'` | `sm.enableRasterSelection('ellipse')` | Selection toolbar |
| `'select:lasso'` | `sm.enableRasterSelection('lasso')` | Selection toolbar |
| `'select:magic-wand'` | `sm.enableRasterSelection('magic-wand')` | Magic wand options |
| `'fill'` | `(sm as any).enableFloodFillTool?.()` / `disableFloodFillTool?.()` | Fill settings |
| `'raster-text'` | `sm.enableRasterText()` | Raster text sidebar |
| `'live-text'` | No engine enable — places LiveText nodes on click | LiveText sidebar |
| `'balloon'` | No engine enable — places balloons on click | Balloon sidebar |
| `'panel-layout'` | No engine enable — triggers Salsa panel shape API | Panel options |
| `'3d-scene'` / `scene3dPanelVisible` | `scene3d.enableTransformControls()` | 3D scene panel |

Shape tools (rectangle, circle, polygon, etc.) set `selectedShapeType` and call `shapeManager.setPreviewShape()` / `shapeManager.confirmPreviewShape()` on each click.

---

## Canvas Setup

`@ViewChild('webgpuCanvas', { static: true })` provides the canvas ref. The canvas element's ID `webgpuCanvas` is passed to `startWebGPURendering()` / `reinitializeWebGPURendering()`. Salsa owns the WebGPU context; Angular never touches the canvas directly.

The component sets:
- **Illustration bounds:** `setIllustrationBounds(1, 1.417)` — maps the canvas to B4 paper proportions.
- **Background color:** default `#191919` (set via `onBgColorSelected`).
- **Dot color:** default `#191919`.

---

## Keyboard Shortcuts

All shortcuts are handled in `handleHotkeys(e: KeyboardEvent)` registered on `window.keydown`.

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | `saveIllustrationV2()` (cloud save) |
| `Ctrl+Z` | `rasterBrushService.undo()` |
| `Ctrl+Shift+Z` | `rasterBrushService.redo()` |
| `Ctrl+C` | Copy selected shape |
| `Ctrl+V` | Paste shape |
| `Ctrl+0` | `fitArtboard()` — zoom to fit illustration bounds |
| `Ctrl+J` | `duplicateActiveLayer()` |
| `Delete` / `Backspace` | Delete selected shape node |
| `B` | Switch to Brush tool |
| `E` | Switch to Eraser tool |
| `G` | Toggle grid |
| `H` | Toggle UI (`toggleUI()`) |
| `F` | Toggle fullscreen |
| `ArrowLeft` / `ArrowRight` | Previous / next animation frame |
| `Space` | Toggle animation play/pause |

---

## Auto-Save

Two parallel save paths run simultaneously:

**1. Cloud V2 Save (`sceneChanged$`)**
- A `Subject<string>` that receives the current scene JSON whenever a change occurs (scene graph changes, raster stroke end).
- Piped through `auditTime(2000)` and `distinctUntilChanged()`.
- Calls `saveIllustrationV2()` — serializes full state via `FrogFileService.buildStatePayload()` and uploads via `IllustrationService.saveState()` + per-layer/cel pixel PUT requests.

**2. OPFS Auto-Save (`RasterAutoSaveService`)**
- Enabled via `autoSaveService.enable(docId, name, { intervalMs: 30000, strokeDebounceMs: 5000 })` after load.
- On each `onRasterStrokeEnd` event: calls `autoSaveService.notifyStrokeEnd()`.
- Salsa engine handles the actual OPFS write; the service reflects state via `state$: Observable<AutoSaveState>`.
- State values: `'idle' | 'saving' | 'saved' | 'error' | 'unavailable'`.

---

## Animation Timeline Integration

Animation state is managed by `RasterAnimationService` (injected as `animationService`). The component wires:

- `animationService.currentFrame$` → `_currentAnimFrame` (used for 3D keyframe recording).
- `toggleAnimationMode()` calls `animationService.setAnimationEnabled(bool)`.
- The timeline panel (in the HTML template) binds to `animationService` observables directly: `currentFrame$`, `frameCount$`, `fps$`, `isPlaying$`, `loopMode$`, `timelineLayers$`.

3D animation can run synced or independently:
- When `scene3dAnimSyncWithTimeline = true`: `scene3d.startSyncedPlayback()` / `pauseSyncedPlayback()` / `stopSyncedPlayback()`.
- When false: `getAnimationPlayer3D().play()` / `pause()` / `stop()`.

---

## Control Panel Tabs

The right-side control panel is tab-driven. The relevant component properties and associated Salsa calls per tab:

### Brush tab
- `controlPanelActiveTool = 'brush'`
- Properties: `brushSize`, `brushOpacity`, `brushFlow`, `brushColor`, `activePresetId`
- Delegated to `RasterBrushService` — see `04-services-reference.md`

### Layers tab
- Displays `rasterLayers` (from `rasterBrushService.layers$`)
- Layer add/delete/reorder delegated to `rasterBrushService`
- Folders: `rasterBrushService.addFolder()` / `setFolderCollapsed()`
- 3D scene entry: `rasterBrushService.add3DScene()` / `remove3DScene()`

### Shapes tab
- `selectedShapeType` bound to shape buttons
- Calls `shapeManager.setPreviewShape(type, event)` on activation
- Calls `shapeManager.confirmPreviewShape()` on canvas click

### SDF Text tab
- Properties: `selectedSDFTextColor`, `selectedSDFTextFont`, `selectedSDFTextFontSize`, `selectedSDFTextOutlineColor`, `selectedSDFTextThreshold`, `selectedSDFTextSmoothing`, `selectedSDFTextOutlineWidth`
- Calls: `shapeManager.setSDFTextColor()`, `setSDFTextFont()`, `setSDFTextFontSize()`, etc.

### Live Text tab (`controlPanelActiveTool = 'live-text'`)
- Places `LiveTextNode` via `(sm as any).createLiveTextNode(x, y, html)` on canvas click
- Edit mode entered on double-click or re-click of existing node
- Properties: `liveTextContent`, `liveTextFontSize`, `liveTextFontFamily`, `liveTextBold`, `liveTextItalic`, `liveTextColor`, `liveTextEffects`, `liveTextIsEditing`
- Text effects: `(sm as any).setLiveTextEffects(nodeId, effects)` — see `TextEffectEntry[]` in `src/app/illustrate/models/text-effect.model.ts`

### Balloons tab (`controlPanelActiveTool = 'balloon'`)
- Places `SpeechBalloon` shape via `shapeManager.addSpeechBalloon(options)` on canvas click
- `SpeechBalloonOptions` from `src/app/illustrate/models/speech-balloon.model.ts`
- Properties: `balloonStyle`, `balloonTailSide`, `balloonTailPosition`, `balloonShowTail`, `balloonFillColor`, `balloonStrokeColor`, `balloonFontSize`, `balloonWritingMode`
- Syncs sidebar when an existing balloon node is selected (`_syncBalloonSidebar(id)`)

### Panel Layout tab (`controlPanelActiveTool = 'panel-layout'`)
- `PanelLayoutOptions` from `src/app/illustrate/models/panel-layout.model.ts`
- Templates: `grid-2x2`, `grid-3x2`, `grid-2x3`, `manga-4-panel`, `manga-action`, `manga-dialog`, `full-page`, `two-strip`, `three-strip`
- Calls `(sm as any).createPanelLayout(options)` to generate the panel grid as vector shapes

### Dithering tab
- `DitherConfig` from `src/app/boards/models/brush-preset.model.ts`
- Applies per-layer or global dither via `(sm as any).setLayerDitherConfig(layerId, config)` or `(sm as any).setGlobalDitherConfig(config)`
- Algorithms: `bayer`, `halftone_dot`, `halftone_line`, `halftone_diamond`, `blue_noise`, `noise`
- Color modes: `quantize`, `duotone`
- Full reference: `features/dither.md`

### 3D Scene tab (`scene3dPanelVisible = true`)
- Activated when the `3d-scene` layer entry is selected in the layer panel
- Full reference in `03-3d-panel.md`

### Paper Grain tab
- `paperGrainType: CanvasGrainType`, `paperGrainScale`, `paperGrainStrength`
- Delegated to `rasterBrushService.setPaperGrain(settings)` / `getPaperGrain()`
- Types: `none`, `cold-press`, `hot-press`, `canvas-linen`, `rough`, `watercolor`, `newsprint`
- Full reference: `features/canvas-grain.md`

### Selection / Transform toolbar
- Active when `controlPanelActiveTool.startsWith('select:')`
- Backed by `RasterSelectionService` — see `features/selection-tools.md`

### Frame Link Animation
- Per-layer procedural animation applied via `(sm as any).setLayerFrameLinkAnimation(layerId, config)`
- Full reference: `features/frame-link-animation.md`

---

## Sync Modes

`IllustrationComponent` handles three sync modes, determined by `illustration.syncMode`:

| `syncMode` | Behaviour |
|-----------|-----------|
| `0` (cloud) | Full cloud save via `IllustrationService`. Pixel data uploaded to blob storage. |
| `1` (no-cloud) | Metadata in cloud, pixel data kept locally (OPFS). Uses same route `/illustrate/:uid`. |
| `2` (local-only) | Entirely OPFS. No pixel data reaches the server. Route `/illustration/local/:uuid`. `LocalIllustrationService` handles persistence metadata in IndexedDB. |

Local-only illustrations skip all `IllustrationService` HTTP calls. The save flow short-circuits to OPFS only.

---

## Load Flow (`loadIllustrationV2`)

```
1. GET /api/illustration/{id}/state
2. If version === 1 (legacy): parse raw canvasData / legacy sceneGraph path
3. If version >= 2:
     a. sm.loadSceneGraphJSON(state.sceneGraph)
     b. Download pixel data from SAS URLs (parallel fetch)
     c. sm.importRasterLayersFromDataURLs(layers[])
     d. Restore animation: animationService.setAnimationEnabled(state.animation.enabled), etc.
     e. Restore per-layer dither configs if present
     f. Restore per-layer frame link animation configs if present
4. Refresh raster layers: rasterBrushService.refreshLayers()
5. Check OPFS for fresher data (compare savedAt timestamps)
```

### Background Color Restore (bgColor Fix)

`resetSceneState()` (called at the top of every `initForIllustration`) calls `shapeManager.clear()`, which resets the engine background to white. For new illustrations with no layers yet, the V2 load block is skipped (condition: `state.version >= 2 && state.layers?.length > 0`). Without intervention, the fallback path would call `getBackgroundColor()` immediately after, read white from the engine, and corrupt `this.bgColor`. This would then be persisted on the next auto-save.

**Fix:** The V2 fallback path now calls `this.onBgColorSelected(state?.bgColor ?? this.bgColor)` before `requestAnimationFrame(() => this.markLoaded('sceneApplied'))`. This re-applies the component's current `bgColor` to the engine so `getBackgroundColor()` reads the correct value.

---

## Save Flow (`saveIllustrationV2`)

```
1. FrogFileService.buildStatePayload()
     - sm.getSceneGraphJSON()
     - sm.getRasterLayers() + animationService observables → IllustrationStateDto
     - sm.getLayerDitherConfig?(layerId) — per-layer dither
     - sm.getLayerFrameLinkAnimation?(layerId) — per-layer frame link animation
2. IllustrationService.saveState(id, state)         → PUT /api/illustration/{id}/state
3. For each dirty static layer:
     sm.exportRasterLayerToBlob(layerId, 'image/webp')
     IllustrationService.uploadLayerPixelData(...)  → PUT /api/illustration/{id}/layer/{layerId}
4. For each dirty animated cel:
     sm.getCelPixelDataBlob(layerId, celId, 'image/webp')
     IllustrationService.uploadCelPixelData(...)    → PUT /api/illustration/{id}/cel/{celId}
```
