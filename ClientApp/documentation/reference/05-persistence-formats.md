# 05 — Persistence Formats

Frogmarks uses four distinct persistence mechanisms. They are not mutually exclusive — cloud V2 save and OPFS auto-save run in parallel whenever the editor is open.

---

## 1. Cloud V2 Save

The primary persistence layer. Metadata is stored in the backend database; pixel data is stored in blob storage (Azure Blob / S3 / local). Two-step save: metadata first, then pixel data.

### Save Flow

```
Step 1:  PUT /api/illustration/{id}/state
         Body: IllustrationStateDto (JSON, typically < 10 KB)
         — Creates/updates DB rows for layers and cels
         — Must complete before step 2/3 (DB rows must exist)

Step 2:  For each dirty static layer:
         PUT /api/illustration/{id}/layer/{layerId}?width=W&height=H&format=webp
         Body: multipart/form-data, field 'pixelData'

Step 3:  For each dirty animated cel:
         PUT /api/illustration/{id}/cel/{celId}?width=W&height=H&format=webp
         Body: multipart/form-data, field 'pixelData'

Step 4:  (Optional) For deleted cels:
         DELETE /api/illustration/{id}/cel/{celId}
```

Steps 2 and 3 can run in parallel. Steps 2/3 require Step 1 to complete first.

### IllustrationStateDto Schema

```json
{
  "version": 2,
  "sceneGraph": "{ ...stringified scene graph JSON... }",
  "animation": {
    "enabled": true,
    "frameCount": 48,
    "fps": 12,
    "loopMode": "loop",
    "playRangeStart": 1,
    "playRangeEnd": 48,
    "onionSkin": {
      "enabled": true,
      "framesBefore": 2,
      "framesAfter": 1,
      "opacity": 0.3,
      "tintBefore": [1.0, 0.2, 0.2],
      "tintAfter": [0.2, 0.5, 1.0]
    }
  },
  "layers": [
    {
      "layerId": "r_226hpha",
      "name": "Background",
      "order": 0,
      "visible": true,
      "locked": false,
      "blendMode": "normal",
      "opacity": 1.0,
      "clipped": false,
      "lockTransparency": false,
      "animated": false,
      "cels": [],
      "ditherConfig": null,
      "frameLinkAnimation": null
    },
    {
      "layerId": "r_8lf0gui",
      "name": "Layer 2",
      "order": 1,
      "animated": true,
      "cels": [
        { "celId": "cel_gbkefy4", "frame": 1, "duration": 6, "isKey": true, "celType": "key" }
      ]
    }
  ],
  "savedAt": 1745000000000
}
```

### Load Flow

```
Step 1:  GET /api/illustration/{id}/state
         Returns IllustrationStateDto with pixelDataUrl SAS URLs populated

Step 2:  Check version:
         version === 1 → legacy path (sceneGraph is raw canvasData string)
         version >= 2  → continue

Step 3:  Apply sceneGraph: sm.loadSceneGraphJSON(state.sceneGraph)

Step 4:  Download pixel data from SAS URLs in parallel:
         Static layers: fetch layer.pixelDataUrl
         Animated layers: fetch each cel.pixelDataUrl

Step 5:  Import: sm.importRasterLayersFromDataURLs(layers[])

Step 6:  Restore animation state via RasterAnimationService

Step 7:  Restore per-layer dither configs if present
```

SAS URLs expire after 1 hour. On 403 errors during pixel download, re-fetch state to obtain fresh URLs.

### Delta Save Optimization

```
POST /api/illustration/{id}/cel-status
Body: { "celIds": ["cel_a", "cel_b", "cel_c"] }

Response: {
  "cel_a": { "exists": true,  "hash": "abcdef..." },
  "cel_b": { "exists": false, "hash": null },
  "cel_c": { "exists": true,  "hash": "987654..." }
}
```

Compare local SHA-256 hashes against server hashes. Only re-upload cels whose hash differs or that don't exist server-side.

### Backend Database Layout

```sql
Illustration     -- id, uuid, name, sceneVersion, animationEnabled, frameCount,
                 -- fps, loopMode, playRangeStart, playRangeEnd, onionSkinConfig (JSON)
IllustrationLayer-- id, illustrationId, layerId, name, sortOrder, visible, locked,
                 -- blendMode, opacity, clipped, lockTransparency, animated,
                 -- pixelDataUrl, pixelWidth, pixelHeight
IllustrationCel  -- id, layerDbId, celId, frame, duration, isKey, celType,
                 -- pixelDataUrl, pixelWidth, pixelHeight, contentHash (SHA-256)
```

Blob storage path: `{illustrationId}/{layerId}.webp` (static layers), `{illustrationId}/{celId}.webp` (cels).

---

## 2. .frog Legacy Format

A ZIP archive with extension `.frog`. Portable, browser-downloaded file. Does **not** require a server round-trip.

### Structure

```
{name}.frog          (ZIP archive, DEFLATE level 6)
├── manifest.json    — FrogManifest (metadata + animation + layer list)
├── scene.json       — vector scene graph string
├── thumbnail.webp   — 512px thumbnail (optional)
└── layers/
    ├── {layerId}.webp         — static layer pixel data
    └── {layerId}/
        └── {celId}.webp       — animated layer cel pixel data
```

### manifest.json Schema

```typescript
interface FrogManifest {
  version: number;              // matches IllustrationStateDto.version (always 2)
  name: string;
  createdAt: string;            // ISO date
  animation: AnimationStateDto | null;
  layers: LayerStateDto[];      // includes animated, cels[], blendMode, opacity, etc.
  ditherConfig?: DitherConfigDto | null;
}
```

### FrogFileService Export

Source: `FrogFileService.exportFrogFile(illustrationName, canvas)`.

Pixel data is read from Salsa via:
- Static layers: `sm.exportRasterLayerToBlob?.(layerId, 'image/webp')`
- Animated cels: `sm.getCelPixelDataBlob?.(layerId, celId, 'image/webp')` with fallback to `sm.exportRasterLayerToBlob`

### FrogFileService Import

Source: `FrogFileService.importFrogFile()` → `parseFrogFile(file)`.

Returns `FrogImportResult` with `manifest`, `sceneGraph`, `thumbnail`, and `layerPixelData` (array of `imageDataUrl: string` data URIs). The caller (`IllustrationComponent`) is responsible for restoring the state into the engine.

After import, `frogFileService.pendingImport` is set so `IllustrationComponent` can consume it on the next load cycle.

### Limitations

The `.frog` format does **not** include:
- 3D scene data (mesh nodes, keyframes)
- GLTF/GLB model files
- TextureLibrary (3D textures)
- Per-layer Frame Link Animation configs (present in `manifest.layers` as DTO but engine restore is partial)

---

## 3. .frogmarks Portable ZIP Format

A full-fidelity project archive. Salsa's `ShapeManager` owns the core pack/unpack logic; `IllustrationComponent` wraps it to inject Frogmarks-specific metadata and handle the restore UX.

### Archive Structure

Salsa's `sm.packProject()` produces the inner ZIP. `frogmarksSave()` opens it with JSZip, injects an additional file, recombines, and triggers a browser download:

```
{name}.frogmarks      (ZIP archive)
├── frogmarks-state.json  — Frogmarks envelope (injected by frogmarksSave, not Salsa)
├── thumbnail.png         — 300px thumbnail captured at save time (optional, non-fatal)
│
│   ── Contents produced by sm.packProject() ──────────────────────────────────────
├── manifest.json     — Salsa DocumentManifest + 3D node list + package metadata
├── scene.json        — vector scene graph (sceneGraphJSON)
├── brushes.json      — all brush presets (brushPresetsJSON)
├── scene3d.json      — 3D mesh node states (Mesh3DNodeState[])
├── textures3d.json   — TextureLibrary snapshot (base64 image data)
├── layers/
│   └── {layerId}.bin — raster layer RGBA pixel data (raw)
├── cels/
│   └── {celId}.bin   — animation cel pixel data (raw)
└── models3d/
    └── {meshId}.glb  — raw GLB buffer for GLTF-imported meshes
```

### frogmarks-state.json Envelope

```json
{
  "formatVersion": 1,
  "packedAt": "2026-04-28T14:23:01.000Z",
  "name": "My Illustration",
  "uuid": "abc123-...",
  "illustrationId": 42,
  "teamId": 7,
  "deviceName": "MacBook Pro"
}
```

`deviceName` is read from `localStorage.getItem('frogmarks-device-name')`. All fields except `formatVersion` and `packedAt` may be `null` for local-only illustrations.

### frogmarksSave() — Export Flow

Source: `IllustrationComponent.frogmarksSave()` (~line 6519)

```typescript
async frogmarksSave(): Promise<void> {
  const salsaBlob: Blob = await sm.packProject();      // Salsa packs the full project
  const zip = await JSZip.loadAsync(salsaBlob);        // open the ZIP
  zip.file('frogmarks-state.json', JSON.stringify({    // inject metadata envelope
    formatVersion: 1, packedAt, name, uuid, illustrationId, teamId, deviceName
  }));
  const thumbBlob = await sm.captureThumbnailBlob(300); // optional, non-fatal
  if (thumbBlob) zip.file('thumbnail.png', thumbBlob);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  // trigger browser download as {safeName}.frogmarks
}
```

After a successful save, `_startExportReminder()` is called. For no-cloud and local-only illustrations this schedules a reminder toast after 20 minutes, prompting the user to export again.

### frogmarksLoad() — Import Flow

Source: `IllustrationComponent.frogmarksLoad()` (~line 6560)

```
1. Open ZIP with JSZip; read frogmarks-state.json
2. If formatVersion > 1 → throw (forward-compat error)
3. Compare file UUID vs current illustration UUID:

   a. Different UUID (cross-illustration restore):
      window.confirm("X is from a different illustration. Replace current content?")
      → If OK: _doFrogmarksRestore(file, fileUuid)

   b. Same UUID (or no UUID in file — legacy / local-only):
      Extract thumbnail.png from ZIP and capture current thumbnail
      → Show frogmarksRestoreModal (side-by-side thumbnail comparison)
      → User clicks Confirm → confirmFrogmarksRestore() → _doFrogmarksRestore()
      → User clicks Cancel  → cancelFrogmarksRestore() → dismiss

4. _doFrogmarksRestore(file, fileUuid):
   - animationService.beginBulkRestore()
   - sm.unpackProject(file)  [Salsa handles all 2D+3D state restore]
   - animationService.endBulkRestore()
   - If cross-illustration: sm.setCurrentDocId(currentUid, name) + sm.persist.saveNow()
   - Refresh: animationService.refreshTimeline(), scene3dRefreshMeshes(), _invalidateUploadedLayers()
```

### frogmarksRestoreModal State

```typescript
frogmarksRestoreModal: {
  currentThumbnailUrl: string;  // object URL for current editor state
  currentDate: string;          // toLocaleString() of now
  fileThumbnailUrl: string;     // object URL from thumbnail.png in ZIP ('' if absent)
  fileDate: string;             // packedAt from frogmarks-state.json
} | null
```

Object URLs are revoked via `_closeFrogmarksRestoreModal()` on both confirm and cancel to prevent memory leaks.

### Salsa ShapeManager API

| Method | Returns | Purpose |
|--------|---------|---------|
| `sm.packProject()` | `Promise<Blob>` | Pack all document state (2D + 3D + brushes) into a ZIP blob |
| `sm.unpackProject(file)` | `Promise<void>` | Restore full project state from a `.frogmarks` File object |
| `sm.captureThumbnailBlob(size)` | `Promise<Blob \| null>` | Capture a PNG thumbnail at the given pixel size |

`packProject()` takes no arguments — it auto-collects all state internally (scene graph, raster layers, animation cels, 3D mesh nodes, GLB buffers, brush presets, texture library).

### Format Version

`formatVersion: 1` in `frogmarks-state.json`. If a file with `formatVersion > 1` is loaded, an error is shown: "This .frogmarks file requires a newer version of Frogmarks." The Salsa-internal `manifest.json` has its own separate version (`PACKAGE_FORMAT_VERSION`) that Salsa validates independently during `unpackProject`.

---

## 4. Local-Only (syncMode 2)

Illustrations with `syncMode === 2` bypass all cloud persistence. No pixel data is ever sent to the server.

- **Metadata** (name, uuid, `isArchived`, `isFavorite`, `syncMode`) is stored in **IndexedDB** via `LocalIllustrationService`.
- **Pixel data and scene graph** are stored in **OPFS** via the Salsa auto-save engine, using the illustration's `uuid` as the document ID.
- Route: `/illustration/local/:uuid`
- On the dashboard, these items are loaded via `LocalIllustrationService.getAll(isArchived)` and merged into the grid alongside cloud items.

There is no cloud save flow for these items. The `IllustrationComponent` detects `syncMode === 2` and skips `IllustrationService` HTTP calls entirely, saving only to OPFS.

---

## 5. OPFS Auto-Save (Salsa-Managed)

The Origin Private File System (OPFS) auto-save provides crash recovery for the current session. It is entirely managed by the Salsa engine; Frogmarks only enables/disables it via `RasterAutoSaveService`.

### Activation

```typescript
// In IllustrationComponent, after illustration loads:
autoSaveService.enable(
  illustration.id.toString(),  // docId
  illustration.name,            // name
  { intervalMs: 30_000, strokeDebounceMs: 5_000 }
);
```

### Engine Configuration

```typescript
sm.enableAutoSave(docId, name, {
  intervalMs: 30_000,
  strokeDebounceMs: 5_000,
  pixelFormat: 'raw',
});
```

### Internal Format

The exact binary format of OPFS data is determined by Salsa's `persist` sub-manager. It is not documented here because Frogmarks never reads it directly — it calls `sm.loadDocument(docId)` and receives hydrated layer data back.

The format is expected to be equivalent to `DocumentSavePayload.layers[].pixelData` — raw RGBA pixel buffers, one per layer and per cel.

### Freshness Comparison

`IllustrationStateDto.savedAt` (epoch ms) allows comparing OPFS data vs. cloud data on load:

```typescript
// In loadIllustrationV2():
const opfsDoc = await autoSaveService.loadDocument(docId);
// Compare opfsDoc's internal savedAt with state.savedAt
// If OPFS is newer, prefer restoring from OPFS
```

This prevents overwriting a user's recent uncommitted work with a staler cloud save. The exact freshness comparison logic lives in `IllustrationComponent.loadIllustrationV2()`.

### Availability

OPFS requires browser support for `navigator.storage.getDirectory`. Modern Chromium-based browsers and Firefox 111+ support it. Safari support was added in 15.2 but has historically had bugs. The `RasterAutoSaveService.available$` observable reports the availability status. If `'unavailable'`, the UI should indicate that crash recovery is disabled.
