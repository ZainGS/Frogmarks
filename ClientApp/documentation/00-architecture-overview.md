# 00 — Architecture Overview

Frogmarks is an Angular 17.3 illustration, comic, and animation editor. It renders via `@zaings/salsa` — a WebGPU rendering engine consumed from a local workspace dependency (`file:../../../salsa`). The frontend is a standalone SPA with no server-side rendering.

---

## Repository Layout

```
Frogmarks/ClientApp/           ← Angular workspace root
├── src/app/
│   ├── illustrate/            ← Illustration editor module
│   │   ├── components/illustration/   ← Main editor component (~4 500 lines)
│   │   └── models/                    ← Domain models (Illustration, PanelLayout, etc.)
│   ├── boards/                ← Vector boards module
│   │   ├── components/raster-layers/  ← Raster layer panel component
│   │   └── models/                    ← BrushPreset, RasterLayer, LayerBlendMode, etc.
│   └── shared/
│       ├── services/
│       │   ├── illustrate/    ← IllustrationService, FrogFileService, LocalIllustrationService
│       │   └── raster/        ← RasterBrushService, RasterAnimationService,
│       │                        RasterSelectionService, RasterAutoSaveService
│       └── components/
│           ├── home/          ← HomeComponent (landing screen, route `/`)
│           ├── dashboard/     ← DashboardComponent (file browser, route `/dashboard`)
│           └── ...            ← ColorPickerComponent, other shared UI
├── documentation/             ← This folder
├── ILLUSTRATION_API_REFERENCE.md
└── BACKEND_RASTER_SAVE_SPEC.md
```

---

## Module Breakdown

| Module | Route(s) | Purpose |
|--------|----------|---------|
| `IllustrateModule` | `/illustrate/:uid`, `/illustration/local/:uuid` | Full illustration editor — raster painting, 3D, animation, panels |
| `BoardsModule` | `/board/:id` | Vector whiteboard with shape/layer management |
| `SharedModule` | `/`, `/dashboard` | Home screen, dashboard, services, models, color picker, and UI primitives shared by both modules |

`IllustrationComponent` (in `IllustrateModule`) is the primary consumer of all Salsa APIs. It handles both cloud-synced illustrations (`/illustrate/:uid`) and local-only illustrations (`/illustration/local/:uuid`, `syncMode === 2`). `BoardComponent` (in `BoardsModule`) uses a subset of Salsa focused on vector shapes and `RasterLayersComponent` for layer management.

### Illustration Sync Modes

| `syncMode` | Name | Storage | Route |
|-----------|------|---------|-------|
| `0` (default) | Cloud | Full cloud save — scene JSON + pixel blobs in blob storage | `/illustrate/:uid` |
| `1` | No-cloud | Pixel data stored locally (OPFS); metadata in cloud | `/illustrate/:uid` |
| `2` | Local-only | Entirely OPFS — no pixel data sent to server; managed by `LocalIllustrationService` | `/illustration/local/:uuid` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Angular 17.3, standalone: false (NgModule) |
| Rendering | `@zaings/salsa` (WebGPU, local file dep) |
| HTTP | Angular `HttpClient`, `withCredentials: true` |
| Reactive state | RxJS `BehaviorSubject` + `Observable` in services |
| Local persistence | OPFS (Origin Private File System) via Salsa engine |
| Portable export | JSZip (`.frog` files), fflate (`.frogmarks` files, Salsa-side) |
| Auth | Cookie-based session, `AuthService` |
| Notifications | `NotifyService` wrapper |

---

## Salsa Integration

Salsa is accessed exclusively via the **`ShapeManager` singleton**:

```typescript
import ShapeManager from '@zaings/salsa/shape-manager';
import WorldManager from '@zaings/salsa/world-manager';
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering } from '@zaings/salsa';

// Bootstrap (called once per component lifecycle)
await startWebGPURendering('webgpuCanvas');
// or on soft-navigation re-entry:
await reinitializeWebGPURendering('webgpuCanvas');

// Acquire singleton
const shapeManager = ShapeManager.getInstance();
```

After boot, `ShapeManager.getInstance()` returns the live engine instance. All Angular services hold a `private get sm()` accessor that calls `ShapeManager.getInstance?.() ?? null` on demand rather than caching the reference, because the singleton may be replaced when the renderer is reinitialized.

Many new APIs are not yet in the public TypeScript types for `ShapeManager`. Frogmarks calls them via `(this.shapeManager as any).someNewMethod?.()`. This is documented per-feature in `02-salsa-integration.md`.

---

## Rendering Pipeline Summary

```
User interaction (pointer/keyboard)
    │
    ▼
IllustrationComponent (Angular)
    │  calls ShapeManager public API
    ▼
ShapeManager (Salsa singleton)
    ├── scene3d (Scene3DManager)   → 3D mesh CRUD, camera, lighting
    ├── raster (RasterLayerManager)→ layer compositor, brush paint engine
    ├── animation                  → frame timeline, onion skin, cel management
    ├── drawing (DrawingServices)  → live stroke staging, shape preview
    ├── text                       → SDF text, LiveText nodes
    └── persist                    → OPFS auto-save, .frogmarks pack/unpack
    │
    ▼
WebGPURenderer (single render pass)
    ├── BG Raster Compositor (layers below 3D divider)
    ├── Vector Shapes (indirect draw calls)
    ├── 3D Mesh Pass (Renderer3D — shadow pre-pass + opaque + transparent + gizmos)
    ├── FG Raster Compositor (layers above 3D divider)
    ├── Staging strokes (live preview, triple-buffered)
    ├── LiveText quads
    └── Overlays (selection handles, carets, dots)
    │
    ▼
<canvas id="webgpuCanvas"> — blit to swap chain
```

The 3D pass injects between background and foreground raster composites so 3D meshes can be sandwiched between 2D layers. The raster divider entry in the layer stack marks the split point.

---

## Data Flow: User Action → Salsa API → WebGPU Canvas

### Example: Paint stroke

```
1. User presses pointer on canvas
2. Salsa's internal event handler (attached to the canvas) receives the event
3. Paint engine records stroke samples into a triple-buffered staging buffer
4. Each frame: WebGPURenderer composites staging buffer on top of the current raster layer
5. On pointer-up: engine commits the stroke into the persistent raster texture
6. ShapeManager fires onRasterStrokeEnd()
7. IllustrationComponent handler:
     a. calls autoSaveService.notifyStrokeEnd()   → debounced OPFS save
     b. calls getSceneGraphJSONWithRasterData()   → triggers sceneChanged$ subject
     c. sceneChanged$ (auditTime 2s) → saveIllustrationV2() → PUT /api/illustration/{id}/state
                                                             + PUT /api/illustration/{id}/layer/{id}
```

### Example: Switch active layer

```
1. User clicks layer in RasterLayersComponent
2. rasterBrushService.selectLayer(id)
3. → sm.selectRasterLayer(id)   (Salsa: sets active paint target)
4. → _activeLayerId$.next(id)   (RxJS: Angular templates re-bind)
5. Next stroke paints into the newly active layer
```

### Example: Navigate to illustration

```
1. Router resolves /illustrate/:uid
2. IllustrationComponent.ngOnInit → route.paramMap subscription
3. initForIllustration(uid):
     a. startWebGPURendering('webgpuCanvas') / reinitializeWebGPURendering()
     b. afterRendererBoot() — acquires ShapeManager singleton, wires subscriptions
     c. getIllustrationByUid(uid) → loadIllustrationV2()
          - GET /api/illustration/{id}/state
          - applies sceneGraph to engine via sm.loadSceneGraphJSON()
          - downloads SAS pixel URLs, imports via sm.importRasterLayersFromDataURLs()
          - restores animation state via RasterAnimationService
     d. autoSaveService.enable(docId, name, { intervalMs: 30s })
```
