# Backend Re-Architecture Spec: Raster Illustration Save/Load

> **Date:** April 7, 2026  
> **Status:** ✅ Backend API implemented. ✅ Frontend wired up to v2 endpoints.  
> **Purpose:** Documents the v2 save/load architecture for illustrations with full animation, layer, and pixel data persistence.

---

## Table of Contents

1. [Current Architecture (What Exists Today)](#1-current-architecture)
2. [What's Broken / Missing](#2-whats-broken--missing)
3. [Target Architecture](#3-target-architecture)
4. [API Contract Changes](#4-api-contract-changes)
5. [Database Schema Changes](#5-database-schema-changes)
6. [Data Models](#6-data-models)
7. [Frontend ↔ Backend Save Flow (Target)](#7-save-flow)
8. [Frontend ↔ Backend Load Flow (Target)](#8-load-flow)
9. [Migration Strategy](#9-migration-strategy)
10. [Dashboard Bug](#10-dashboard-bug)

---

## 1. Current Architecture

### Illustration Entity (Server-side DTO)

The current `Illustration` model sent between frontend and backend:

```
id              number
uuid            string
name            string
description     string
thumbnailUrl    string
isCustomThumbnail boolean
isDraft         boolean
isFavorite      boolean
collaborators   BoardCollaborator[]
boardItems      BoardItem[]
teamId          number
team            Team
preferences     BoardUserPreferences
permissions     BoardPermissions
canvasData      string          ← THE IMPORTANT FIELD: serialized JSON blob
isArchived      boolean
type            string          (always 'illustration')
```

### Current API Endpoints

| Operation | Method | URL |
|---|---|---|
| Create | `POST` | `/api/illustration` |
| Get by ID | `GET` | `/api/illustration/{id}` |
| Get by UID | `GET` | `/api/illustration/GetIllustrationByUid/{uid}` |
| Search | `GET` | `/api/illustration/search?cachedThumbnailIllustrationIds=...` |
| Update metadata | `PUT` | `/api/illustration` |
| **Save scene** | **`POST`** | **`/api/illustration/save`** |
| **Load scene** | **`GET`** | **`/api/illustration/load/{id}`** |
| Upload thumbnail | `POST` | `/api/illustration/thumbnails/{uid}` |
| Duplicate | `POST` | `/api/illustration/duplicate/{id}` |
| Rename | `PUT` | `/api/illustration/rename/{id}` |
| Favorite | `PUT` | `/api/illustration/favorite` |
| Delete | `DELETE` | `/api/illustration/{id}` |

### Current Save Payload (`POST /api/illustration/save`)

```json
{
  "illustrationId": 123,
  "sceneGraphData": "<stringified JSON>"
}
```

The `sceneGraphData` string is ONE of three variants the frontend may produce:

**Variant A — Engine enriched JSON** (best case):
If `shapeManager.getSceneGraphJSONWithRasterData('image/webp')` is available, the engine produces an opaque JSON string that may include per-layer raster pixel data.

**Variant B — Fallback enriched JSON** (common case):
```json
{
  "root": { /* scene graph tree */ },
  "embeddedRaster": {
    "imageData": "data:image/webp;base64,...",
    "mime": "image/webp",
    "timestamp": 1712500000000
  }
}
```
This is a **single flattened screenshot** of the entire canvas. All per-layer data is lost.

**Variant C — Plain scene graph** (worst case):
Just the vector shape tree. No raster data at all.

### Current Load Response (`GET /api/illustration/load/{id}`)

Returns the raw `canvasData` string. Frontend parses it and duck-types the format:
- If `raw.rasterLayers` array exists → imports per-layer pixel data
- Else if `raw.embeddedRaster.imageData` exists → imports as single "Raster" layer
- Else → no raster data

---

## 2. What's Broken / Missing

### ❌ Animation State — NOT PERSISTED AT ALL

The frontend `RasterAnimationService` manages:

| State | Type | Default |
|---|---|---|
| `animationEnabled` | `boolean` | `false` |
| `currentFrame` | `number` | `1` |
| `frameCount` | `number` | `24` |
| `fps` | `number` | `12` |
| `loopMode` | `'none' \| 'loop' \| 'ping-pong'` | `'loop'` |
| `playRangeStart` | `number` | `1` |
| `playRangeEnd` | `number` | `24` |
| `onionSkin` | `OnionSkinConfig` | `{ enabled: false, ... }` |
| `timelineLayers` | `TimelineLayerInfo[]` | `[]` |

**None of this is serialized.** On reload, animation mode resets to `false`, all cels are lost, and the timeline is empty.

#### Per-Layer Animation Data

Each animated layer has cels:

```typescript
interface CelInfo {
  id: string;          // e.g. "cel_gbkefy4"
  frame: number;       // start frame (1-indexed)
  duration: number;    // how many frames this cel spans
  isKey: boolean;      // true = key drawing, false = inbetween
  celType: 'key' | 'inbetween';
}

interface TimelineLayerInfo {
  id: string;          // raster layer ID, e.g. "r_8lf0gui"
  name: string;
  animated: boolean;   // false = static layer (shows on all frames)
  cels: CelInfo[];
}
```

Each cel represents a **drawing** that occupies one or more frames. The pixel data for each cel is stored in the Salsa engine at runtime. The backend has no knowledge of cels, frames, or animation.

### ❓ Raster Layer Properties — ENGINE-DEPENDENT

Each raster layer has these properties in the frontend:

```typescript
interface RasterLayerInfo {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  blendMode: string;        // 'normal', 'multiply', 'screen', 'overlay', etc.
  opacity: number;          // 0.0 – 1.0
  clipped: boolean;         // clipping mask
  lockTransparency: boolean;
}
```

Whether these round-trip through save/load depends entirely on the Salsa engine's `getEnrichedSceneGraphJSON`. The Angular code **never explicitly serializes** blend mode, opacity, visibility, lock transparency, or clipping. On load, the legacy import path only passes `{ name, imageData, width, height }` — all other properties are dropped.

### ❌ Save Payload is a Single Mega-String

The current `canvasData` field stores EVERYTHING as one giant JSON string — scene graph, raster pixel data (base64), and metadata all in one column. For a multi-layer illustration with animation cels, this could be 10–100+ MB of base64 image data.

---

## 3. Target Architecture

### Design Goals

1. **Full-fidelity save/load**: Every feature visible in the UI survives a round-trip
2. **Separate pixel data from metadata**: Don't store 50MB of base64 in a JSON column
3. **Per-layer, per-cel storage**: Each drawing (cel) is stored as a separate blob
4. **Incremental saves**: Only upload cels that changed, not the entire illustration
5. **Format versioning**: So old and new data can coexist

### Proposed Data Separation

```
┌─────────────────────────────────────────────────┐
│  Illustration (DB row)                          │
│  - id, uuid, name, teamId, metadata...          │
│  - sceneVersion: 2                              │
│  - sceneMetadata: JSON (small, <1KB)            │
│    └── animation config, layer order, etc.      │
├─────────────────────────────────────────────────┤
│  IllustrationLayer (DB rows, one per layer)     │
│  - id, illustrationId, layerId                  │
│  - name, order, visible, locked, blendMode,     │
│    opacity, clipped, lockTransparency           │
│  - animated (bool), isBackground (bool)         │
├─────────────────────────────────────────────────┤
│  IllustrationCel (DB rows, one per cel)         │
│  - id, layerId, celId                           │
│  - frame, duration, isKey, celType              │
│  - pixelDataUrl (Blob Storage URL)              │
│  - width, height, format                        │
├─────────────────────────────────────────────────┤
│  Blob Storage (Azure/S3/local)                  │
│  - One file per cel: {illustrationId}/{celId}.webp  │
│  - One file for static layers: {illustrationId}/{layerId}.webp │
└─────────────────────────────────────────────────┘
```

---

## 4. API Contract Changes

### 4.1 Save Illustration State (replaces `POST /api/illustration/save`)

**`PUT /api/illustration/{id}/state`**

Request body:
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

**Response:** `200 OK` with the saved state echoed back (or just `204 No Content`).

### 4.2 Upload Cel Pixel Data (NEW)

**`PUT /api/illustration/{id}/cel/{celId}`**

- Content-Type: `multipart/form-data` or `application/octet-stream`
- Body: WebP/PNG image data (the raster pixels for this cel)
- Query params: `?width=1024&height=768&format=webp`

This allows **incremental saves** — only upload cels that were modified since last save.

**Response:** `200 OK` with `{ "url": "https://storage.../cel_abc.webp" }`

### 4.3 Upload Static Layer Pixel Data (NEW)

**`PUT /api/illustration/{id}/layer/{layerId}`**

Same as cel upload, but for non-animated layers that have a single raster image.

### 4.4 Load Illustration State (replaces `GET /api/illustration/load/{id}`)

**`GET /api/illustration/{id}/state`**

Response:
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
    "onionSkin": { ... }
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
      "pixelDataUrl": "https://storage.../r_226hpha.webp"
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
          "pixelDataUrl": "https://storage.../cel_gbkefy4.webp",
          "width": 1024,
          "height": 768
        },
        {
          "celId": "cel_abc1234",
          "frame": 7,
          "duration": 3,
          "isKey": false,
          "celType": "inbetween",
          "pixelDataUrl": "https://storage.../cel_abc1234.webp",
          "width": 1024,
          "height": 768
        }
      ]
    }
  ]
}
```

### 4.5 Delete Cel (NEW)

**`DELETE /api/illustration/{id}/cel/{celId}`**

Removes the cel pixel data from blob storage and the DB row.

### 4.6 Batch Cel Status (NEW, optional optimization)

**`POST /api/illustration/{id}/cel-status`**

Request: `{ "celIds": ["cel_a", "cel_b", "cel_c"] }`

Response: `{ "cel_a": { "exists": true, "hash": "abc123" }, "cel_b": { "exists": false } }`

Allows frontend to determine which cels need re-uploading (delta saves).

---

## 5. Database Schema Changes

### New Tables

```sql
-- Raster layer metadata (one row per layer)
CREATE TABLE IllustrationLayer (
    Id              INT PRIMARY KEY IDENTITY,
    IllustrationId  INT NOT NULL REFERENCES Illustration(Id) ON DELETE CASCADE,
    LayerId         NVARCHAR(50) NOT NULL,    -- runtime ID like "r_8lf0gui"
    Name            NVARCHAR(200),
    SortOrder       INT NOT NULL DEFAULT 0,
    Visible         BIT NOT NULL DEFAULT 1,
    Locked          BIT NOT NULL DEFAULT 0,
    BlendMode       NVARCHAR(30) NOT NULL DEFAULT 'normal',
    Opacity         FLOAT NOT NULL DEFAULT 1.0,
    Clipped         BIT NOT NULL DEFAULT 0,
    LockTransparency BIT NOT NULL DEFAULT 0,
    Animated        BIT NOT NULL DEFAULT 0,
    -- For non-animated layers: single pixel data reference
    PixelDataUrl    NVARCHAR(500) NULL,
    PixelWidth      INT NULL,
    PixelHeight     INT NULL,
    PixelFormat     NVARCHAR(10) NULL DEFAULT 'webp',
    CreatedAt       DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT UQ_IllustrationLayer UNIQUE (IllustrationId, LayerId)
);

-- Animation cel (one row per drawing in an animated layer)
CREATE TABLE IllustrationCel (
    Id              INT PRIMARY KEY IDENTITY,
    LayerDbId       INT NOT NULL REFERENCES IllustrationLayer(Id) ON DELETE CASCADE,
    CelId           NVARCHAR(50) NOT NULL,    -- runtime ID like "cel_gbkefy4"
    Frame           INT NOT NULL,              -- 1-indexed start frame
    Duration        INT NOT NULL DEFAULT 1,    -- frames this cel spans
    IsKey           BIT NOT NULL DEFAULT 1,
    CelType         NVARCHAR(20) NOT NULL DEFAULT 'key', -- 'key' or 'inbetween'
    PixelDataUrl    NVARCHAR(500) NULL,
    PixelWidth      INT NULL,
    PixelHeight     INT NULL,
    PixelFormat     NVARCHAR(10) NULL DEFAULT 'webp',
    ContentHash     NVARCHAR(64) NULL,        -- SHA-256 for delta detection
    CreatedAt       DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT UQ_IllustrationCel UNIQUE (LayerDbId, CelId)
);
```

### Modify Illustration Table

```sql
ALTER TABLE Illustration ADD
    SceneVersion        INT NOT NULL DEFAULT 1,
    AnimationEnabled    BIT NOT NULL DEFAULT 0,
    FrameCount          INT NOT NULL DEFAULT 24,
    Fps                 INT NOT NULL DEFAULT 12,
    LoopMode            NVARCHAR(20) NOT NULL DEFAULT 'loop',
    PlayRangeStart      INT NOT NULL DEFAULT 1,
    PlayRangeEnd        INT NOT NULL DEFAULT 24,
    OnionSkinConfig     NVARCHAR(MAX) NULL;     -- JSON blob for onion skin settings
```

The existing `CanvasData` column should be kept for backward compatibility (v1 format). New saves use v2 with the normalized tables.

---

## 6. Data Models (C# DTOs)

### IllustrationStateDto (Save/Load payload)

```csharp
public class IllustrationStateDto
{
    public int Version { get; set; } = 2;
    public string? SceneGraph { get; set; }
    public AnimationStateDto? Animation { get; set; }
    public List<LayerStateDto> Layers { get; set; } = new();
}

public class AnimationStateDto
{
    public bool Enabled { get; set; }
    public int FrameCount { get; set; } = 24;
    public int Fps { get; set; } = 12;
    public string LoopMode { get; set; } = "loop";       // "none", "loop", "ping-pong"
    public int PlayRangeStart { get; set; } = 1;
    public int PlayRangeEnd { get; set; } = 24;
    public OnionSkinDto? OnionSkin { get; set; }
}

public class OnionSkinDto
{
    public bool Enabled { get; set; }
    public int FramesBefore { get; set; } = 2;
    public int FramesAfter { get; set; } = 1;
    public float Opacity { get; set; } = 0.3f;
    public float[] TintBefore { get; set; } = { 1.0f, 0.2f, 0.2f };
    public float[] TintAfter { get; set; } = { 0.2f, 0.5f, 1.0f };
}

public class LayerStateDto
{
    public string LayerId { get; set; } = "";
    public string Name { get; set; } = "";
    public int Order { get; set; }
    public bool Visible { get; set; } = true;
    public bool Locked { get; set; }
    public string BlendMode { get; set; } = "normal";
    public double Opacity { get; set; } = 1.0;
    public bool Clipped { get; set; }
    public bool LockTransparency { get; set; }
    public bool Animated { get; set; }
    public List<CelStateDto> Cels { get; set; } = new();
    // Populated on load response only:
    public string? PixelDataUrl { get; set; }
}

public class CelStateDto
{
    public string CelId { get; set; } = "";
    public int Frame { get; set; }
    public int Duration { get; set; } = 1;
    public bool IsKey { get; set; } = true;
    public string CelType { get; set; } = "key";
    // Populated on load response only:
    public string? PixelDataUrl { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
}
```

---

## 7. Save Flow (Target)

When the frontend saves, it will:

```
1. Serialize illustration state → PUT /api/illustration/{id}/state
   - Scene graph JSON (vector shapes, node tree)
   - Animation config (enabled, fps, frameCount, loopMode, ...)
   - Layer list (order, blend mode, opacity, visibility, ...)
   - Cel list per layer (frame, duration, isKey, celType)

2. For each dirty cel → PUT /api/illustration/{id}/cel/{celId}
   - Upload WebP pixel data as binary
   - Only upload cels modified since last save

3. For each dirty static layer → PUT /api/illustration/{id}/layer/{layerId}
   - Upload WebP pixel data for the single image
```

The state save (step 1) is small (<10KB typically). The pixel uploads (steps 2–3) are the heavy part but are **incremental** — unchanged cels are not re-uploaded.

---

## 8. Load Flow (Target)

```
1. GET /api/illustration/{id}/state
   → Returns full state with SAS URLs for each cel/layer's pixel data

2. Frontend applies scene graph to engine

3. Frontend downloads pixel data from SAS URLs in parallel
   → For animated layers: one download per cel
   → For static layers: one download per layer

4. Frontend calls engine APIs to import pixel data:
   - shapeManager.importRasterLayersFromDataURLs(layers)
   - animService.setAnimationEnabled(state.animation.enabled)
   - animService.setFrameCount(state.animation.frameCount)
   - animService.setFps(state.animation.fps)
   - etc.
```

---

## 9. Migration Strategy

### Phase 1: Keep Backward Compatibility
- Keep the `CanvasData` column and existing `POST /api/illustration/save` endpoint
- Add a `SceneVersion` column (default 1)
- New saves set `SceneVersion = 2` and use the new normalized tables
- Old illustrations with `SceneVersion = 1` continue loading from `CanvasData`

### Phase 2: Migration Script
- For each illustration with `SceneVersion = 1`:
  1. Parse `CanvasData` JSON
  2. Extract layer info from scene graph
  3. If `embeddedRaster` exists, upload to blob storage
  4. Create `IllustrationLayer` rows
  5. Set `SceneVersion = 2`

### Phase 3: Deprecate v1
- Once all data is migrated, the `CanvasData` column can be dropped
- Remove legacy `POST /api/illustration/save` and `GET /api/illustration/load/{id}`

---

## 10. Dashboard Bug

The dashboard currently shows "Couldn't find any matches" even though illustrations/boards exist.

### Current Flow
1. `ngOnInit` → gets user teams → calls `loadAllItems()`
2. `loadAllItems()` calls `forkJoin(boardsSearch, illustrationsSearch)`
3. Both hit `/api/board/search` and `/api/illustration/search` with query params
4. Response expected shape: `{ resultObject: [...] }`

### Likely Issues
1. **No error handling on forkJoin** — if either API fails, the success callback never runs (fixed in frontend, but backend should also return proper errors)
2. **Response structure mismatch** — frontend expects `res.resultObject` array. If backend returns `{ data: [...] }` or just `[...]`, items will be empty
3. **Team ID could be wrong** — `currentTeam = teams[0]` assumes the first team is the right one

### What the backend should verify:
- `GET /api/board/search?teamId=X&name=&favorites=false&isArchived=false&sortBy=name&sortDirection=desc&pageIndex=0&pageSize=24` returns `{ resultObject: Board[] }`
- `GET /api/illustration/search?teamId=X&...&cachedThumbnailIllustrationIds=` returns `{ resultObject: Illustration[] }`
- Both should return empty arrays (not null) when no results match
- Both should NOT error on empty `cachedThumbnailBoardIds` / `cachedThumbnailIllustrationIds` query param

---

## Appendix: Frontend Animation Types Reference

```typescript
export type LoopMode = 'none' | 'loop' | 'ping-pong';
export type CelType = 'key' | 'inbetween';

export interface OnionSkinConfig {
  enabled: boolean;
  framesBefore: number;    // how many previous frames to ghost
  framesAfter: number;     // how many next frames to ghost
  opacity: number;         // 0.0 – 1.0
  tintBefore: [number, number, number];  // RGB 0–1
  tintAfter: [number, number, number];   // RGB 0–1
}

export interface CelInfo {
  id: string;
  frame: number;       // 1-indexed
  duration: number;    // how many frames this cel occupies
  isKey: boolean;
  celType: CelType;
}

export interface TimelineLayerInfo {
  id: string;
  name: string;
  animated: boolean;
  cels: CelInfo[];
}

// Raster layer properties (from engine)
export interface RasterLayerInfo {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  blendMode: string;
  opacity: number;
  clipped: boolean;
  lockTransparency: boolean;
}
```

---

## Appendix: Blend Modes Supported

The frontend supports these blend modes (passed as strings):

```
normal, multiply, screen, overlay, darken, lighten,
color-dodge, color-burn, hard-light, soft-light,
difference, exclusion, hue, saturation, color, luminosity
```

The backend should store these as `NVARCHAR(30)` without validation (new modes may be added).
