# 04 — Services Reference

All services are `providedIn: 'root'` singletons. They wrap the Salsa `ShapeManager` singleton and expose reactive `BehaviorSubject`-backed `Observable`s for Angular templates.

---

## IllustrationService

**File:** `src/app/shared/services/illustrate/illustration.service.ts`

Extends `ApiService`. Handles all HTTP communication with the Frogmarks backend for illustration CRUD, state persistence, thumbnail management, and utility operations.

### Key DTOs

```typescript
interface IllustrationStateDto {
  version: number;              // 2 for v2 saves
  sceneGraph: string | null;    // stringified scene graph JSON
  animation: AnimationStateDto | null;
  layers: LayerStateDto[];
  savedAt?: number;             // epoch ms
  ditherConfig?: DitherConfigDto | null;
}

interface LayerStateDto {
  layerId: string;
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  blendMode: string;            // 'normal', 'multiply', etc.
  opacity: number;              // 0–1
  clipped: boolean;
  lockTransparency: boolean;
  animated: boolean;
  cels: CelStateDto[];
  pixelDataUrl?: string | null; // SAS URL on load, null on save
  ditherConfig?: DitherConfigDto | null;
  frameLinkAnimation?: FrameLinkAnimationDto | null;
}

interface CelStateDto {
  celId: string;
  frame: number;                // 1-indexed
  duration: number;
  isKey: boolean;
  celType: 'key' | 'inbetween';
  pixelDataUrl?: string | null;
  width?: number | null;
  height?: number | null;
}
```

### CRUD Methods

| Method | HTTP | Notes |
|--------|------|-------|
| `createIllustration(illustration)` | `POST /api/illustration` | Returns created entity |
| `getIllustrationById(id)` | `GET /api/illustration/{id}` | |
| `getIllustrationByUid(uid)` | `GET /api/illustration/GetIllustrationByUid/{uid}` | Includes collaborators |
| `getAllIllustrations()` | `GET /api/illustration` | |
| `searchIllustrations(filter, sort, page, size)` | `GET /api/illustration/search?...` | Manages thumbnail cache in localStorage |
| `getIllustrationsByTeamId(id, ...)` | `GET /api/illustration/search?teamId=...` | Manages thumbnail cache in localStorage |
| `updateIllustration(illustration)` | `PUT /api/illustration` | |
| `renameIllustration(id, name)` | `PUT /api/illustration/rename/{id}` | |
| `favoriteIllustration(illustration)` | `PUT /api/illustration/favorite` | |
| `deleteIllustration(id)` | `DELETE /api/illustration/{id}` | |
| `duplicateIllustration(id, payload)` | `POST /api/illustration/duplicate/{id}` | Copies layers, cels, blobs |

### V2 State Methods

| Method | HTTP | Notes |
|--------|------|-------|
| `saveState(id, state)` | `PUT /api/illustration/{id}/state` | Step 1 of save flow — metadata only |
| `loadState(id)` | `GET /api/illustration/{id}/state` | Returns state with SAS URLs |
| `uploadCelPixelData(id, celId, blob, w?, h?, format?)` | `PUT /api/illustration/{id}/cel/{celId}` | Multipart, format default `'webp'` |
| `uploadLayerPixelData(id, layerId, blob, w?, h?, format?)` | `PUT /api/illustration/{id}/layer/{layerId}` | Multipart |
| `deleteCel(id, celId)` | `DELETE /api/illustration/{id}/cel/{celId}` | |
| `getCelStatus(id, celIds[])` | `POST /api/illustration/{id}/cel-status` | Returns `Record<celId, { exists, hash }>` for delta detection |

### Thumbnail Methods

| Method | Notes |
|--------|-------|
| `uploadThumbnail(uid, blob, isCustom?)` | `POST /api/illustration/thumbnails/{uid}` |
| `getThumbnail(uid)` | Returns `Blob` |
| `setIsCustomThumbnail(id, isCustom)` | `PATCH /api/illustration/{id}` |
| `cacheThumbnail(url, key)` | Writes to `localStorage['cachedIllustrationThumbnails']` |

### Legacy (Deprecated)

```typescript
/** @deprecated Use saveState() */
saveIllustration(id, sceneGraph): Observable<any>   // POST /api/illustration/save

/** @deprecated Use loadState() */
loadIllustrationSceneGraph(id): Observable<string>  // GET /api/illustration/load/{id}
```

---

## FrogFileService

**File:** `src/app/shared/services/illustrate/frog-file.service.ts`

Handles `.frog` file import and export, and builds the `IllustrationStateDto` payload used by both cloud saves and local exports.

```typescript
pendingImport: FrogImportResult | null = null;
```

When set, `IllustrationComponent` consumes this on load instead of fetching from the server. Used after a `.frog` file is imported from disk.

### Export

```typescript
async exportFrogFile(illustrationName: string, canvas: HTMLCanvasElement | null): Promise<void>
```

1. Calls `buildStatePayload()` to gather state from ShapeManager + RasterAnimationService.
2. Calls `sm.captureThumbnailBlob?.(512)` for the thumbnail.
3. For animated layers: calls `sm.getCelPixelDataBlob(layerId, celId, 'image/webp')` per cel.
4. For static layers: calls `sm.exportRasterLayerToBlob(layerId, 'image/webp')`.
5. Packages everything into a JSZip archive and triggers browser download as `{name}.frog`.

### Import

```typescript
async importFrogFile(): Promise<FrogImportResult>
async parseFrogFile(file: File): Promise<FrogImportResult>
```

Opens a file picker (or accepts a `File` directly), reads the ZIP, parses `manifest.json` + `scene.json` + pixel data, and returns:

```typescript
interface FrogImportResult {
  manifest: FrogManifest;
  sceneGraph: string;
  thumbnail: Blob | null;
  ditherConfig?: DitherConfigDto | null;
  layerPixelData: Array<{
    layerId: string;
    celId?: string;
    name: string;
    imageDataUrl: string;     // data:image/webp;base64,...
    blendMode: string;
    opacity: number;
    visible: boolean;
    locked: boolean;
    clipped: boolean;
    lockTransparency: boolean;
  }>;
}
```

### `buildStatePayload(name?)`

Shared between export and cloud save. Reads:
- `sm.getSceneGraphJSON()` — vector scene graph
- `sm.getRasterLayers()` — layer metadata
- `sm.getLayerDitherConfig?(layerId)` — per-layer dither (guarded, may not exist)
- `sm.getLayerFrameLinkAnimation?(layerId)` — per-layer frame link animation (guarded)
- All `RasterAnimationService` BehaviorSubjects via `firstValueFrom()`

Returns `{ state: IllustrationStateDto, sceneGraph: string }`.

---

## RasterBrushService

**File:** `src/app/shared/services/raster/raster-brush.service.ts`

Central service for raster tool state — brush presets, layer management, and compositor properties.

### Observable State

```typescript
presets$: Observable<BrushPreset[]>
activePresetId$: Observable<string | null>
layers$: Observable<RasterLayer[]>
activeLayerId$: Observable<string | null>
```

### Brush Preset API

| Method | Salsa call | Notes |
|--------|-----------|-------|
| `refreshPresets()` | `sm.getBrushPresets()` + `getActiveBrushPresetId()` | Pushes to BehaviorSubjects |
| `setActivePreset(id)` | `sm.setActiveBrushPreset(id)` | |
| `getActivePreset()` | `sm.getBrushPreset(id)` | Returns `BrushPreset | null` |
| `savePresetAs(name)` | `sm.importBrushPreset(json)` | Clones current preset |
| `createPreset(preset)` | `sm.importBrushPreset(json)` | New preset from scratch |
| `exportPreset(id)` | `sm.exportBrushPreset(id)` | Returns JSON string |
| `importPreset(json)` | `sm.importBrushPreset(json)` | |
| `exportAll()` | `sm.exportAllBrushPresets()` | Returns JSON string |
| `importAll(json)` | `sm.importBrushPresets(json)` | Returns `string[]` (new IDs) |
| `deletePreset(id)` | `sm.deleteBrushPreset(id)` | |

### Tool Activation

```typescript
enableBrushTool(presetId?)    // sm.enableRasterTool() + optional setActiveBrushPreset
enableEraserTool(style)       // sm.enableRasterClearEraserTool() or enableRasterEraserTool()
disableRasterTool()           // sm.disableRasterTool()
```

`EraserStyle`: `'fade'` (opacity eraser) | `'clear'` (hard clear eraser).

### Brush Properties

All property mutations go through `_mutatePreset(fn)` which reads the preset from the engine, mutates it, re-registers it, and refreshes.

| Method | Mutates |
|--------|---------|
| `setColor(hex)` | `sm.setRasterBrushColor(hex)` (direct) |
| `setSize(radius)` | `sm.setRasterBrushSize(radius)` (direct) |
| `updatePresetSize(min, max)` | `preset.minSize`, `preset.maxSize` |
| `updateOpacity(v)` | `preset.blending.opacity` |
| `updateFlow(v)` | `preset.blending.flow` |
| `updateStabilization(method, level, pullLength?)` | `preset.stabilization.*` + `sm.setActiveStabilization?.(...)` |
| `updateTipHardness/Roundness/Angle(v)` | `preset.tip.hardness/roundness/angle` |
| `updateSizeCurve(pts)` | `preset.dynamics.sizePressureCurve` |
| `updateOpacityCurve(pts)` | `preset.dynamics.opacityPressureCurve` |
| `updateFlowCurve(pts)` | `preset.dynamics.flowPressureCurve` |
| `updateVelocitySizeCurve(pts)` | `preset.dynamics.sizeVelocityCurve` |
| `updateScatterPressureCurve(pts)` | `preset.dynamics.scatterPressureCurve` |
| `updateBrushBlendMode(mode)` | `preset.blending.mode` |
| `updateSpacing(v)` | `preset.spacing` |
| `updateScatterDistance(v)` | `preset.dynamics.scatterDistance` |
| `updateSizeJitter(v)` | `preset.dynamics.sizeRandomJitter` |
| `updateRotationJitter(v)` | `preset.dynamics.rotationRandomJitter` |

### Advanced Effects

| Method | Salsa call | Description |
|--------|-----------|-------------|
| `setBrushGrain(settings)` | `sm.setBrushGrain(settings)` | Per-brush dab alpha modulation |
| `getBrushGrain()` | `sm.getBrushGrain()` | |
| `setDualBrush(settings)` | `sm.setBrushDualBrush(id, settings)` | Texture overlay per dab |
| `setColorJitter(jitter)` | `sm.setBrushColorJitter(id, jitter)` | Per-dab HSB/opacity randomization |
| `setWetEdges(settings)` | `sm.setBrushWetEdges(id, settings)` | Watercolor edge darkening |
| `setStrokeTexture(settings)` | `sm.setBrushStrokeTexture(id, settings)` | Continuous strip along stroke path |
| `importBrushPack(json)` | `sm.importBrushPresets(json)` | |
| `setPaperGrain(settings)` | `sm.setPaperGrain(settings)` | Global canvas paper material |
| `getPaperGrain()` | `sm.getPaperGrain()` | |
| `getAvailableGrainTypes()` | `sm.getAvailableGrainTypes()` | Returns `CanvasGrainType[]` |
| `setBrushBleed(settings)` | `(sm as any).setBrushBleed(id, settings)` | `BrushBleed`: `{ enabled, perDab, radius, strength }` |
| `setBrushSmudge(settings)` | `(sm as any).setBrushSmudge(id, settings)` | `BrushSmudge`: `{ enabled, strength, sampleRadius }` |

### Layer Management

| Method | Salsa call | Notes |
|--------|-----------|-------|
| `refreshLayers()` | `sm.getRasterLayers()` | Uses microtask delay; normalizes `3d-divider` → `3d-scene` |
| `addLayer(name)` | `sm.addRasterLayer(name)` | Auto-selects new layer |
| `deleteLayer(id)` | `sm.deleteRasterLayer(id)` | Blocks if only 1 layer remains |
| `selectLayer(id)` | `sm.selectRasterLayer(id)` | |
| `setLayerVisibility(id, v)` | `sm.setRasterLayerVisibility(id, v)` | |
| `setLayerName(id, name)` | `sm.setNodeName(id, name)` | |
| `setLayerBlendMode(id, mode)` | `sm.rasterLayerManager?.setBlendMode(id, mode)` | Sub-manager access |
| `setLayerOpacity(id, opacity)` | `sm.rasterLayerManager?.setOpacity(id, opacity)` | Sub-manager access |
| `setLayerClipping(id, clipped)` | `sm.setRasterLayerClipping(id, clipped)` | |
| `setLayerLockTransparency(id, locked)` | `sm.setRasterLayerLockTransparency(id, locked)` | |
| `reorderLayers(orderedIds)` | `sm.reorderRasterLayers(orderedIds)` | |
| `addFolder(name?)` | `(sm as any).addRasterFolder(name)` | |
| `setFolderCollapsed(id, collapsed)` | `(sm as any).setRasterFolderCollapsed(id, collapsed)` | |
| `setLayerParent(layerId, parentId)` | `(sm as any).setRasterLayerParent(layerId, parentId)` | Reparent layer into/out of folder |
| `add3DScene(name?)` | `(sm as any).addRaster3DScene(name)` | |
| `remove3DScene()` | `(sm as any).removeRaster3DScene()` | |
| `has3DScene()` | `(sm as any).hasRaster3DScene()` | |
| `duplicateLayer(id)` | `(sm as any).duplicateLayer(id)` | GPU copy placed above source |
| `mergeLayerDown(id)` | `(sm as any).mergeLayerDown(id)` | Composites layer onto the one below, deletes upper |
| `addReferenceImageLayer(name, file)` | `(sm as any).addReferenceImageLayer(name, file)` | Letterbox-fits image, creates locked `'reference'` type layer at 50% opacity |
| `undo()` | `sm.rasterUndo()` | |
| `redo()` | `sm.rasterRedo()` | |

---

## RasterSelectionService

**File:** `src/app/shared/services/raster/raster-selection.service.ts`

Manages raster selection tools (rect, ellipse, lasso, magic wand) and floating selection transforms.

### Observable State

```typescript
tool$: Observable<SelectionTool>               // 'rect' | 'ellipse' | 'lasso' | 'magic-wand'
hasSelection$: Observable<boolean>
selectionInfo$: Observable<SelectionInfo | null>
```

`SelectionInfo` from `brush-preset.model.ts`:
```typescript
interface SelectionInfo {
  hasSelection: boolean;
  bounds: SelectionBounds | null;     // { x, y, w, h } in texel space
  isTransforming: boolean;
  transform: TransformState | null;   // { translateX, translateY, scaleX, scaleY, rotation }
}
```

### Key Methods

```typescript
enableTool(tool: SelectionTool): void
// → sm.enableRasterSelection(tool)

setMagicWandOptions(opts: MagicWandOptions): void
// → (sm as any).setMagicWandOptions?.(opts)
// MagicWandOptions: { tolerance: 0–255, contiguous: bool, mode: 'new'|'add'|'subtract', referenceLayerId? }

clearSelection(): void
// → (sm as any).clearRasterSelection?.()

commitTransform(): void
// → (sm as any).commitRasterSelectionTransform?.()

cancelTransform(): void
// → (sm as any).cancelRasterSelectionTransform?.()

copySelection(): void
cutSelection(): void
pasteSelection(): void
invertSelection(): void
// all → (sm as any).{operation}RasterSelection?.()
```

---

## RasterAnimationService

**File:** `src/app/shared/services/raster/raster-animation.service.ts`

Manages the entire raster animation timeline — frame count, FPS, playback, onion skin, and cel lifecycle. All state is mirrored in `BehaviorSubject`s for Angular binding.

### Observable State

```typescript
animationEnabled$: Observable<boolean>
currentFrame$: Observable<number>        // 1-indexed
frameCount$: Observable<number>
fps$: Observable<number>
isPlaying$: Observable<boolean>
loopMode$: Observable<LoopMode>          // 'none' | 'loop' | 'ping-pong'
onionSkin$: Observable<OnionSkinConfig>
timelineLayers$: Observable<TimelineLayerInfo[]>
playRangeStart$: Observable<number>
playRangeEnd$: Observable<number>
```

### Key Methods

```typescript
setAnimationEnabled(enabled: boolean): void
// → sm.setAnimationEnabled(enabled)
// When true: subscribes to engine animation events, calls refreshTimeline()

setCurrentFrame(frame: number): void     // → sm.setCurrentFrame(frame)
nextFrame(): void                        // → sm.nextFrame()
prevFrame(): void                        // → sm.prevFrame()
togglePlayPause(): void                  // → sm.togglePlayPause()
stopPlayback(): void                     // → sm.stopPlayback()

setFps(fps: number): void                // → sm.setFps(fps)
setFrameCount(count: number): void       // → sm.setFrameCount(count)
addFrames(count: number): void           // → sm.addFrames(count)
setLoopMode(mode: LoopMode): void        // → sm.setLoopMode(mode)
setPlayRange(start, end): void           // → (sm as any).setPlayRange(start, end)
setOnionSkin(config: OnionSkinConfig): void // → sm.setOnionSkin(config)

setLayerAnimated(layerId, animated): void
// Guards: ensures animation is enabled before marking layer animated
// → sm.setLayerAnimated(layerId, animated)

addCelAtCurrentFrame(layerId): string | null
addCelAtFrame(layerId, frame): string | null
// Guards: enables animation + marks layer animated if needed
// → sm.addCelAtFrame(layerId, frame)

deleteCel(layerId, celId): void          // → sm.deleteCel(layerId, celId)
duplicateCel(layerId, celId, targetFrame): string | null
moveCel(layerId, celId, targetFrame): void
swapCels(layerId, celIdA, celIdB): void
setCelDuration(layerId, celId, duration): void
setCelType(layerId, celId, celType): void // celType: 'key' | 'inbetween'
getCels(layerId): CelInfo[]

insertFrame(at: number): void
deleteFrame(at: number): void

floodFill(x, y, color, options?): Promise<boolean>
fillSelection(color): Promise<void>
```

### `refreshTimeline()`

Reads all layers via `sm.getRasterLayers()`, checks `sm.isLayerAnimated(id)` and `(sm as any).getCels(id)` for each, and pushes to `timelineLayers$`. Called automatically on animation events.

Engine cel shape: `{ id, startFrame, duration, celType }`. Mapped to `CelInfo`: `{ id, frame (= startFrame), duration, isKey (celType==='key'), celType }`.

### Animation Events

`_subscribeEvents()` subscribes to `sm.onAnimationEvent(callback)`. Events:

| Event type | Action |
|-----------|--------|
| `frame-changed` | `_currentFrame$.next(event.frame)` |
| `playback-state-changed` | `_isPlaying$.next(sm.isPlaying?.())` |
| `timeline-changed` | `_frameCount$.next(sm.getFrameCount?.())` + `refreshTimeline()` |
| `cel-added` / `cel-removed` / `layer-type-changed` | `refreshTimeline()` |
| `onion-skin-changed` | `_onionSkin$.next(sm.getOnionSkin?.())` |

All callbacks run inside `NgZone.run()`.

---

## LocalIllustrationService

**File:** `src/app/shared/services/illustrate/local-illustration.service.ts`

Manages local-only illustrations (`syncMode === 2`) — stored entirely in the browser (OPFS + IndexedDB for metadata). These illustrations never upload pixel data to the server.

### Key Methods

| Method | Notes |
|--------|-------|
| `getAll(isArchived: boolean)` | Returns `LocalIllustration[]` from IndexedDB, filtered by archive state |
| `archive(uuid: string, archived: boolean)` | Sets `isArchived` flag in IndexedDB |
| `delete(uuid: string)` | Removes IndexedDB record and OPFS data |
| `create(name?: string)` | Creates a new local-only illustration record, returns `LocalIllustration` |

### `LocalIllustration`

Implements the `DashboardItem` union type alongside `Board` and `Illustration`. Key distinguishing fields:

```typescript
{
  uuid: string;         // primary key (no numeric id)
  syncMode: 2;          // always 2
  isFavorite: boolean;
  isArchived: boolean;
}
```

Dashboard uses `isLocalIllustration(item)` (`syncMode === 2`) to route archive/delete operations through `LocalIllustrationService` rather than `IllustrationService`.

---

## RasterAutoSaveService

**File:** `src/app/shared/services/raster/raster-autosave.service.ts`

Wraps Salsa's OPFS auto-save API and provides a fallback interval timer.

### Observable State

```typescript
state$: Observable<AutoSaveState>    // 'idle' | 'saving' | 'saved' | 'error' | 'unavailable'
docName$: Observable<string>
available$: Observable<boolean>
lastSaved$: Observable<number>       // epoch ms
```

### Key Methods

```typescript
enable(docId, name, options?): void
// → sm.enableAutoSave(docId, name, { intervalMs, strokeDebounceMs, pixelFormat: 'raw' })
// → sm.onSaveEvent(onStart, onComplete) — syncs state$ observable
// → starts fallback setInterval timer (runs outside NgZone)

disable(): void
// → sm.disableAutoSave()

saveNow(): Promise<boolean>
// → sm.saveDocument()
// On success: state$ → 'saved', then 'idle' after 3s timeout

loadDocument(docId): Promise<{ success: boolean; layers: any[] }>
// → sm.loadDocument(docId)
// Handles both old (boolean) and new ({ success, layers }) return shapes

listDocuments(): Promise<DocumentInfo[]>
// → sm.listSavedDocuments()
// Returns: { docId, name, savedAt, canvasWidth, canvasHeight, layerCount }[]

deleteDocument(docId): Promise<void>
// → sm.deleteSavedDocument(docId)

setDocumentName(name): void
// → sm.setDocumentName(name)

notifyStrokeEnd(): void
// → sm.notifyStrokeEnd()
// + fallback debounced saveNow() after strokeDebounceMs

setInterval(ms): void
// Updates interval; ms=0 disables automatic saves
```

### Auto-Save Intervals (exported constant)

```typescript
export const AUTO_SAVE_INTERVALS: AutoSaveInterval[] = [
  { label: 'Frequent (15s)', value: 15_000, ... },
  { label: 'Normal (30s)',   value: 30_000, ... },
  { label: 'Relaxed (60s)', value: 60_000, ... },
  { label: 'Manual only',   value: 0,      ... },
];
```

The default interval used by `IllustrationComponent` is `30_000` ms (stored in `selectedAutoSaveInterval`).

### Availability

On construction, checks `sm.isAutoSaveAvailable?.()`. Falls back to checking `navigator.storage.getDirectory` (OPFS support). Sets `available$` accordingly. If OPFS is not supported, `state$` is permanently `'unavailable'`.
