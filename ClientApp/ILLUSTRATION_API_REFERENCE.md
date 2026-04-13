# Illustration API Reference

> **Base URL:** `/api/illustration`
> **Auth:** All endpoints require `Authorization: Bearer <token>` header.

---

## Response Envelope

Most endpoints wrap responses in a `ResultModel` envelope:

```json
{
  "resultType": 0,
  "fieldName": null,
  "extendedMessage": "Success",
  "resultObject": { ... }
}
```

| `resultType` | Meaning |
|---|---|
| `0` | Success |
| `1` | Failure |
| `2` | Not Found |
| `3` | Already Exists |
| `4` | Unauthorized |
| `5` | Bad Request |

**Important:** Endpoints using `GenerateResponseActionResult` (thumbnail upload, pixel uploads, delete cel) return **just the `resultObject`** directly on success (no envelope). All other endpoints return the full `ResultModel` envelope.

---

## Table of Contents

1. [CRUD & Dashboard](#1-crud--dashboard)
2. [V2 Save/Load (State + Pixel Data)](#2-v2-saveload)
3. [Save Flow (How to Save)](#3-save-flow)
4. [Load Flow (How to Load)](#4-load-flow)
5. [TypeScript Interfaces](#5-typescript-interfaces)

---

## 1. CRUD & Dashboard

### Create Illustration

```
POST /api/illustration
Content-Type: application/json
```

**Body:**
```json
{
  "name": "My Illustration",
  "teamId": 1,
  "width": 1920,
  "height": 1080
}
```

**Response:** `ResultModel<Illustration>` — the created entity with generated `id` and `uuid`.

---

### Get Illustration by ID

```
GET /api/illustration/{id}
```

**Response:** `ResultModel<IllustrationDto>` — `resultObject` is the illustration DTO. Also records a view log for the current user.

---

### Get Illustration by UUID

```
GET /api/illustration/GetIllustrationByUid/{uid}
```

**Response:** `ResultModel<IllustrationDto>` — includes `collaborators` with roles.

---

### Search Illustrations

```
GET /api/illustration/search?teamId=1&name=&favorites=false&sortBy=name&sortDirection=desc&pageIndex=0&pageSize=24&cachedThumbnailIllustrationIds=&isArchived=false
```

| Param | Type | Default | Notes |
|---|---|---|---|
| `name` | string | `""` | Prefix search on name |
| `teamId` | long | `0` | `0` = all teams |
| `favorites` | bool | `false` | Filter to favorites only |
| `sortBy` | string | `"name"` | `"alphabetical"` or anything else (defaults to `created` date) |
| `sortDirection` | string | `"desc"` | `"asc"` or `"desc"` |
| `pageIndex` | int | `0` | Zero-indexed page |
| `pageSize` | int | `10` | Items per page |
| `cachedThumbnailIllustrationIds` | string | `""` | Comma-separated IDs already cached client-side (skips SAS URL generation) |
| `isArchived` | bool | `false` | Filter archived state |

**Response:** `ResultModel<IllustrationDto[]>` — `resultObject` is the array of illustration DTOs with `thumbnailUrl` SAS URLs populated for non-cached items.

---

### Explore (alias for Search)

```
GET /api/illustration/explore?...
```

Same params and response as Search.

---

### Update Illustration Metadata

```
PUT /api/illustration
Content-Type: application/json
```

**Body:** Full `IllustrationDto`. Only non-null fields are applied (AutoMapper conditional mapping).

**Response:** `ResultModel<Illustration>`

---

### Rename Illustration

```
PUT /api/illustration/rename/{id}
Content-Type: application/json
```

**Body:**
```json
{
  "newName": "Renamed Illustration"
}
```

**Response:** `ResultModel<IllustrationDto>`

---

### Favorite / Unfavorite

```
PUT /api/illustration/favorite
Content-Type: application/json
```

**Body:** `IllustrationDto` with `id` and `isFavorite` set.

**Response:** `ResultModel<Illustration>`

---

### Duplicate Illustration

```
POST /api/illustration/duplicate/{id}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Copy name",
  "teamId": 1,
  "copyThumbnail": true
}
```

All fields are optional. Omitting `name` defaults to `"Copy of {original}"`. Copies all v2 data (layers, cels, blob pixel data).

**Response:** `ResultModel<IllustrationDto>`

---

### Delete Illustration

```
DELETE /api/illustration/{id}
```

**Response:** `ResultModel<Illustration>` — cascade-deletes layers, cels. (Blob cleanup is NOT automatic — blobs orphan.)

---

### Upload Thumbnail

```
POST /api/illustration/thumbnails/{illustrationUid}?isCustom=true
Content-Type: multipart/form-data
```

**Form field:** `thumbnail` — the PNG image file.

**Response (unwrapped on success):** `string` — the blob URI.

---

## 2. V2 Save/Load

### Save Illustration State

```
PUT /api/illustration/{id}/state
Content-Type: application/json
```

Saves the full illustration state: scene graph, animation config, layers, and cel metadata. This is the **metadata-only** save — pixel data is uploaded separately.

**Body:**
```json
{
  "version": 2,
  "sceneGraph": "{ ... stringified scene graph JSON ... }",
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
      "cels": []
    },
    {
      "layerId": "r_8lf0gui",
      "name": "Layer 2",
      "order": 1,
      "visible": true,
      "locked": false,
      "blendMode": "multiply",
      "opacity": 0.85,
      "clipped": false,
      "lockTransparency": true,
      "animated": true,
      "cels": [
        {
          "celId": "cel_gbkefy4",
          "frame": 1,
          "duration": 6,
          "isKey": true,
          "celType": "key"
        },
        {
          "celId": "cel_abc1234",
          "frame": 7,
          "duration": 3,
          "isKey": false,
          "celType": "inbetween"
        }
      ]
    }
  ]
}
```

**Behavior:**
- Upserts layers by `layerId` — layers not in the payload are deleted (cascade deletes their cels + DB rows).
- Upserts cels by `celId` within each layer — cels not in the payload are deleted from DB (blob cleanup happens via `DELETE cel` endpoint).
- Stores `animation.onionSkin` as a JSON string column on the illustration row.
- Sets `sceneVersion` to `version` from the payload.

**Response:** `ResultModel<IllustrationStateDto>` — echoes back the saved state.

---

### Load Illustration State

```
GET /api/illustration/{id}/state
```

**Response:** `ResultModel<IllustrationStateDto>`

The `resultObject` has this shape:

```json
{
  "version": 2,
  "sceneGraph": "{ ... }",
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
      "pixelDataUrl": "https://storage.blob.core.windows.net/.../r_226hpha.webp?sv=..."
    },
    {
      "layerId": "r_8lf0gui",
      "name": "Layer 2",
      "order": 1,
      "visible": true,
      "locked": false,
      "blendMode": "multiply",
      "opacity": 0.85,
      "clipped": false,
      "lockTransparency": true,
      "animated": true,
      "cels": [
        {
          "celId": "cel_gbkefy4",
          "frame": 1,
          "duration": 6,
          "isKey": true,
          "celType": "key",
          "pixelDataUrl": "https://storage.blob.core.windows.net/.../cel_gbkefy4.webp?sv=...",
          "width": 1024,
          "height": 768
        }
      ],
      "pixelDataUrl": null
    }
  ]
}
```

**Key details:**
- `pixelDataUrl` on layers is populated for **static (non-animated) layers** that have uploaded pixel data. It's a time-limited SAS URL (1 hour expiry).
- `pixelDataUrl` on cels is populated for cels that have uploaded pixel data.
- `width` / `height` on cels are the pixel dimensions stored during upload.
- Layers are sorted by `order` (ascending). Cels are sorted by `frame` (ascending).
- If `version` is `1` (legacy/never saved via v2), `animation` is `null`, `layers` is `[]`, and `sceneGraph` contains the raw legacy `canvasData` string.

---

### Upload Cel Pixel Data

```
PUT /api/illustration/{id}/cel/{celId}?width=1024&height=768&format=webp
Content-Type: multipart/form-data
```

**Form field:** `pixelData` — the WebP/PNG image file.

| Query Param | Type | Default | Notes |
|---|---|---|---|
| `width` | int? | null | Pixel width of the image |
| `height` | int? | null | Pixel height of the image |
| `format` | string? | `"webp"` | File extension used in blob path |

**Behavior:** Uploads to blob storage at `{illustrationId}/{celId}.{format}`. Updates the cel DB row with URL, dimensions, format, and computes a SHA-256 content hash for delta detection.

**Prerequisite:** The cel must already exist in the DB (created via `PUT state`). If the cel row doesn't exist yet, the blob is still uploaded but the DB row won't be updated.

**Response (unwrapped on success):** `string` — SAS URL for the uploaded blob.

---

### Upload Static Layer Pixel Data

```
PUT /api/illustration/{id}/layer/{layerId}?width=1024&height=768&format=webp
Content-Type: multipart/form-data
```

**Form field:** `pixelData` — the WebP/PNG image file.

Same query params as cel upload. Uploads to `{illustrationId}/{layerId}.{format}`.

**Prerequisite:** The layer must already exist in the DB (created via `PUT state`).

**Response (unwrapped on success):** `string` — SAS URL for the uploaded blob.

---

### Delete Cel

```
DELETE /api/illustration/{id}/cel/{celId}
```

Deletes the cel DB row and its blob from storage.

**Response (unwrapped on success):** `string` — `"Cel deleted."`

---

### Batch Cel Status (Delta Save Optimization)

```
POST /api/illustration/{id}/cel-status
Content-Type: application/json
```

**Body:**
```json
{
  "celIds": ["cel_a", "cel_b", "cel_c"]
}
```

**Response:** `ResultModel<Dictionary<string, CelStatusItemDto>>`

```json
{
  "resultType": 0,
  "resultObject": {
    "cel_a": { "exists": true, "hash": "abcdef1234..." },
    "cel_b": { "exists": false, "hash": null },
    "cel_c": { "exists": true, "hash": "987654fedc..." }
  }
}
```

Use this to compare local content hashes against server hashes — only re-upload cels whose hash differs.

---

## 3. Save Flow

When saving an illustration, the frontend should:

```
Step 1:  PUT /api/illustration/{id}/state
         → Send scene graph + animation config + layer list + cel list
         → This is small (<10KB), fast, and creates/updates all DB rows

Step 2:  For each dirty static layer:
           PUT /api/illustration/{id}/layer/{layerId}?width=W&height=H&format=webp
           → Upload the layer's pixel data as multipart/form-data

Step 3:  For each dirty cel:
           PUT /api/illustration/{id}/cel/{celId}?width=W&height=H&format=webp
           → Upload the cel's pixel data as multipart/form-data

Step 4:  (Optional) For deleted cels:
           DELETE /api/illustration/{id}/cel/{celId}
```

**Order matters:** Step 1 must complete before steps 2/3 because the layer/cel DB rows must exist before pixel uploads can update them.

Steps 2 and 3 can run in parallel.

**Delta saves:** To avoid re-uploading unchanged pixel data:
1. Call `POST /api/illustration/{id}/cel-status` with all cel IDs
2. Compare returned `hash` values against locally computed SHA-256 hashes
3. Only upload cels whose hash differs or doesn't exist

---

## 4. Load Flow

When loading an illustration, the frontend should:

```
Step 1:  GET /api/illustration/{id}/state
         → Returns full state with SAS URLs

Step 2:  Check response.resultObject.version
         → If version === 1: use legacy canvasData path (resultObject.sceneGraph is the raw JSON)
         → If version >= 2: continue to step 3

Step 3:  Apply sceneGraph to the engine

Step 4:  Download pixel data from SAS URLs in parallel:
         → For static layers: fetch layer.pixelDataUrl
         → For animated layers: fetch each cel.pixelDataUrl

Step 5:  Import pixel data into the engine:
         → shapeManager.importRasterLayersFromDataURLs(...)

Step 6:  Restore animation state:
         → animService.setAnimationEnabled(state.animation.enabled)
         → animService.setFrameCount(state.animation.frameCount)
         → animService.setFps(state.animation.fps)
         → animService.setLoopMode(state.animation.loopMode)
         → etc.
```

**SAS URLs expire after 1 hour.** If pixel data downloads fail with 403, re-call `GET state` to get fresh URLs.

---

## 5. TypeScript Interfaces

```typescript
// ─── Response Envelope ───────────────────────────────────────

interface ResultModel<T> {
  resultType: number;   // 0=Success, 1=Failure, 2=NotFound, 4=Unauthorized
  fieldName: string | null;
  extendedMessage: string | null;
  resultObject: T;
}

// ─── Illustration State (Save/Load Payload) ──────────────────

interface IllustrationStateDto {
  version: number;                    // 2 for new illustrations
  sceneGraph: string | null;          // stringified scene graph JSON
  animation: AnimationStateDto | null;
  layers: LayerStateDto[];
}

interface AnimationStateDto {
  enabled: boolean;
  frameCount: number;                 // default 24
  fps: number;                        // default 12
  loopMode: 'none' | 'loop' | 'ping-pong';
  playRangeStart: number;             // 1-indexed
  playRangeEnd: number;
  onionSkin: OnionSkinDto | null;
}

interface OnionSkinDto {
  enabled: boolean;
  framesBefore: number;
  framesAfter: number;
  opacity: number;                    // 0.0 – 1.0
  tintBefore: [number, number, number]; // RGB 0–1
  tintAfter: [number, number, number];
}

interface LayerStateDto {
  layerId: string;                    // e.g. "r_8lf0gui"
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  blendMode: string;                  // "normal", "multiply", etc.
  opacity: number;                    // 0.0 – 1.0
  clipped: boolean;
  lockTransparency: boolean;
  animated: boolean;
  cels: CelStateDto[];
  pixelDataUrl?: string | null;       // SAS URL, load response only
}

interface CelStateDto {
  celId: string;                      // e.g. "cel_gbkefy4"
  frame: number;                      // 1-indexed start frame
  duration: number;                   // frames this cel spans
  isKey: boolean;
  celType: 'key' | 'inbetween';
  pixelDataUrl?: string | null;       // SAS URL, load response only
  width?: number | null;              // load response only
  height?: number | null;             // load response only
}

// ─── Cel Status (Delta Saves) ────────────────────────────────

interface CelStatusRequest {
  celIds: string[];
}

interface CelStatusItem {
  exists: boolean;
  hash: string | null;                // SHA-256 hex, lowercase
}

// Response: ResultModel<Record<string, CelStatusItem>>

// ─── Illustration DTO (CRUD/Search) ──────────────────────────

interface IllustrationDto {
  id: number;
  uuid: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  isCustomThumbnail: boolean;
  collaborators?: IllustrationCollaboratorDto[];
  teamId?: number;
  team?: TeamDto;
  isDraft: boolean;
  isFavorite: boolean;
  preferencesId?: number;
  preferences?: any;
  projectId?: number;
  project?: any;
  permissionsId?: number;
  permissions?: any;
  lastViewed?: string;                // ISO date string
  sceneGraphData?: string;
  isArchived: boolean;
  width: number;
  height: number;
  created: string;                    // ISO date string
  dateModified: string;
}

// ─── Blend Modes ─────────────────────────────────────────────

type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity';
```

---

## Quick Reference Table

| Operation | Method | URL | Body | Response shape |
|---|---|---|---|---|
| Create | `POST` | `/api/illustration` | `IllustrationDto` (JSON) | `ResultModel<Illustration>` |
| Get by ID | `GET` | `/api/illustration/{id}` | — | `ResultModel<IllustrationDto>` |
| Get by UUID | `GET` | `/api/illustration/GetIllustrationByUid/{uid}` | — | `ResultModel<IllustrationDto>` |
| Search | `GET` | `/api/illustration/search?...` | — | `ResultModel<IllustrationDto[]>` |
| Explore | `GET` | `/api/illustration/explore?...` | — | `ResultModel<IllustrationDto[]>` |
| Update metadata | `PUT` | `/api/illustration` | `IllustrationDto` (JSON) | `ResultModel<Illustration>` |
| Rename | `PUT` | `/api/illustration/rename/{id}` | `{ newName }` (JSON) | `ResultModel<IllustrationDto>` |
| Favorite | `PUT` | `/api/illustration/favorite` | `IllustrationDto` (JSON) | `ResultModel<Illustration>` |
| Duplicate | `POST` | `/api/illustration/duplicate/{id}` | `{ name?, teamId?, copyThumbnail? }` (JSON) | `ResultModel<IllustrationDto>` |
| Delete | `DELETE` | `/api/illustration/{id}` | — | `ResultModel<Illustration>` |
| Upload thumbnail | `POST` | `/api/illustration/thumbnails/{uid}?isCustom=` | `thumbnail` (form-data) | `string` (blob URI) |
| **Save state** | **`PUT`** | **`/api/illustration/{id}/state`** | **`IllustrationStateDto`** (JSON) | **`ResultModel<IllustrationStateDto>`** |
| **Load state** | **`GET`** | **`/api/illustration/{id}/state`** | — | **`ResultModel<IllustrationStateDto>`** |
| **Upload cel** | **`PUT`** | **`/api/illustration/{id}/cel/{celId}?w&h&format`** | **`pixelData`** (form-data) | **`string`** (SAS URL) |
| **Upload layer** | **`PUT`** | **`/api/illustration/{id}/layer/{layerId}?w&h&format`** | **`pixelData`** (form-data) | **`string`** (SAS URL) |
| **Delete cel** | **`DELETE`** | **`/api/illustration/{id}/cel/{celId}`** | — | **`string`** |
| **Cel status** | **`POST`** | **`/api/illustration/{id}/cel-status`** | **`{ celIds }`** (JSON) | **`ResultModel<Record<string, CelStatusItem>>`** |
