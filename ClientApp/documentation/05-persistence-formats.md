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

A full-fidelity project archive defined and implemented in `@zaings/salsa`:

**Salsa source:** `c:\Users\szain\source\repos\salsa\src\services\persistence\project-package.ts`

Uses `fflate` (not JSZip) for synchronous ZIP packing/unpacking.

### Structure

```
{name}.frogmarks      (ZIP archive)
├── manifest.json     — DocumentManifest + 3D node list + package metadata
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

### manifest.json Envelope

```json
{
  "formatVersion": 1,
  "packedAt": "2026-04-28T...",
  "document": { /* DocumentManifest */ },
  "nodes3dCount": 3,
  "models3dIds": ["mesh_abc", "mesh_def"]
}
```

`DocumentManifest` is Salsa's internal document structure (layer IDs, canvas dimensions, animation config, brush preset IDs, etc.).

### Mesh3DNodeState Schema

```typescript
interface Mesh3DNodeState {
  id: string;
  type: '3DMesh';
  name: string;
  x: number; y: number; z: number;
  rotationX: number; rotationY: number; rotation: number;
  scaleX: number; scaleY: number; scaleZ: number;
  primitive: string;         // 'box', 'sphere', 'plane', 'cylinder', 'torus', 'custom'
  config: any;               // primitive geometry params
  material: any;             // Material3D serialized
  textureLibraryId: string | null;
  normalMapLibraryId: string | null;
  keyframeTracks: any;       // AnimationPlayer3D keyframe data
  glbMeshId?: string;        // if set, re-import from models3d/{glbMeshId}.glb on load
}
```

### PackageInput / PackageOutput

```typescript
interface PackageInput {
  docPayload: DocumentSavePayload;    // from Salsa persist sub-manager
  nodes3d: Mesh3DNodeState[];
  models3d: Map<string, ArrayBuffer>; // meshId → raw GLB bytes
  textureLibrary: { entries: any[] } | null;
}

interface PackageOutput {
  docPayload: DocumentSavePayload;
  nodes3d: Mesh3DNodeState[];
  models3d: Map<string, ArrayBuffer>;
  textureLibrary: { entries: any[] } | null;
}
```

### Salsa API

```typescript
import { packProject, unpackProject } from '@zaings/salsa/persistence/project-package';

const blob = await packProject(input);   // → Blob (ZIP)
const data = await unpackProject(file);  // → PackageOutput
```

### Compression Strategy

| Content | ZIP level | Reason |
|---------|-----------|--------|
| JSON files (manifest, scene, brushes, scene3d, textures3d) | 6 | Text compresses well |
| `.bin` pixel data (layers, cels) | 1 | Already nearly incompressible (raw RGBA or WebP) |
| `.glb` model files | 0 | GLB is already internally compressed |

### Format Version

`PACKAGE_FORMAT_VERSION = 1`. On unpack, if `envelope.formatVersion > 1`, an error is thrown: "package version X is newer than this build". This ensures forward compatibility errors are surfaced clearly.

### Current Status: Live

All required Salsa APIs are now public on `ShapeManager`:

| Method | Returns | Purpose |
|---|---|---|
| `snapshotDocument()` | `DocumentSavePayload` | layers + scene + brushes + animation |
| `restoreDocument(payload)` | `Promise<void>` | full 2D restore |
| `getScene3DNodeStates()` | `any[]` | `Mesh3D.toJSON()` per node, including `glbMeshId` |
| `getGltfBuffers3D()` | `Record<string, ArrayBuffer>` | raw GLB bytes keyed by mesh ID |
| `restoreScene3DNodes(nodes, models3d)` | `Promise<void>` | clears + rebuilds 3D scene |

`IllustrationComponent.frogmarksSave()` / `frogmarksLoad()` implement the full pack/unpack cycle using these APIs + jszip.

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
