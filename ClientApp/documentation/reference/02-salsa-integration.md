# 02 — Salsa Integration

This document describes how Frogmarks consumes `@zaings/salsa`. For Salsa's own internal architecture see `c:\Users\szain\source\repos\salsa\docs\reference\00-architecture-overview.md`.

---

## Dependency Declaration

```json
// package.json
"@zaings/salsa": "file:../../../salsa"
```

Salsa is a local workspace dependency. It is not published to npm. Changes to the salsa package take effect after re-running `npm install` in the ClientApp directory.

Salsa exports:
- `@zaings/salsa/shape-manager` — `ShapeManager` default export
- `@zaings/salsa/world-manager` — `WorldManager` default export
- `@zaings/salsa` — `startWebGPURendering`, `reinitializeWebGPURendering`, `isRendererLive`

---

## The `as any` Pattern

`ShapeManager`'s TypeScript types reflect the stable API surface. Many newer capabilities have not been promoted to the public type yet. Frogmarks calls them via `(this.shapeManager as any).method?.()`. The optional-chaining guard (`?.`) makes these calls no-ops if the API does not exist on the currently installed version of Salsa.

Examples throughout the codebase:

```typescript
// Scene3D sub-manager
(this.shapeManager as any).scene3d?.createBox(x, y, z)
(this.shapeManager as any).setRenderStyle3D?.(meshId, 'cel')

// Animation sub-manager
(this.shapeManager as any).addCelAtFrame?.(layerId, frame)
(this.shapeManager as any).setCelDuration?.(layerId, celId, n)

// Raster layer compositor properties
(this.shapeManager as any).rasterLayerManager?.setBlendMode(id, mode)
(this.shapeManager as any).rasterLayerManager?.setOpacity(id, opacity)

// Persistence
(this.shapeManager as any).getSceneGraphJSONWithRasterData?.('image/webp')
(this.shapeManager as any).getCelPixelDataBlob?.(layerId, celId, 'image/webp')
(this.shapeManager as any).exportRasterLayerToBlob?.(layerId, 'image/webp')

// Viewport sync for 3D
(this.shapeManager as any).syncIllustrationCamera3D?.(panX, panY, zoom, w, h)
(this.shapeManager as any).setIllustrationProjection3D?.('orthographic')
```

All Angular services follow the same pattern via their `private get sm()` accessor:

```typescript
private get sm(): ShapeManager | null {
  return ShapeManager.getInstance?.() ?? null;
}
// Usage:
(this.sm as any).newMethod?.();
```

---

## WorldManager Singleton Pattern

`WorldManager` is the second Salsa singleton, imported from `@zaings/salsa/world-manager`. It owns the viewport state — zoom level, pan position, and world reset. `ShapeManager` handles scene content; `WorldManager` handles the camera/viewport.

```typescript
import WorldManager from '@zaings/salsa/world-manager';
```

### Acquisition

Like `ShapeManager`, it is never `new`d. Both components acquire it after the renderer boots:

```typescript
// In IllustrationComponent.afterRendererBoot() and BoardComponent.initForBoard():
this.worldManager = WorldManager.getInstance();
```

The reference is held directly (not via a `get wm()` accessor) because `WorldManager` does not get replaced on `reinitializeWebGPURendering`.

### API used by Frogmarks

| Method | Effect |
|--------|--------|
| `worldManager.zoomIn()` | Zoom in one step (keyboard `+`) |
| `worldManager.zoomOut()` | Zoom out one step (keyboard `-`) |
| `worldManager.resetWorldState()` | Resets pan, zoom, and world transform to defaults |

`resetWorldState()` is called at the top of every `initForIllustration()` / `initForBoard()` to clear leftover viewport state before loading the new scene.

### Boards vs. Illustrations

Both `BoardComponent` and `IllustrationComponent` hold a `worldManager` field and call the same three methods. The illustration editor additionally calls `fitArtboard()` (a ShapeManager method that auto-zooms to the illustration bounds) which is separate from WorldManager.

---

## ShapeManager Singleton Pattern

Salsa uses a module-level singleton. Frogmarks never `new`s `ShapeManager`. It calls `ShapeManager.getInstance()` — which may optionally accept a renderer reference:

```typescript
// In IllustrationComponent.afterRendererBoot():
const possibleRenderer = wmAny?.renderer ?? wmAny?.getRenderer?.() ?? null;
if (possibleRenderer) {
  this.shapeManager = (ShapeManager as any).getInstance?.(possibleRenderer)
                      ?? ShapeManager.getInstance();
} else {
  this.shapeManager = ShapeManager.getInstance();
}
```

After `reinitializeWebGPURendering()` the old singleton reference may be stale. Services re-acquire it on each call via the `get sm()` accessor so they always use the freshest instance.

---

## Event Subscriptions

Frogmarks subscribes to these Salsa-emitted events:

| Event | Source | Consumer |
|-------|--------|---------|
| `interactionService.onSceneGraphChanged` | Vector shapes change | `IllustrationComponent` — rebuilds layer tree, triggers cloud save |
| `interactionService.onSelectionChanged` | User selects/deselects shape | `IllustrationComponent` — syncs sidebar for balloon/live-text |
| `onRasterStrokeEnd(callback)` | Paint stroke committed | `IllustrationComponent` — triggers OPFS + cloud save |
| `onRasterTextStateChanged(callback)` | Raster text tool state update | `IllustrationComponent` — syncs `rasterTextState` |
| `onAnimationEvent(callback)` | Frame change, playback, cel events | `RasterAnimationService` — syncs all animation observables |
| `onSaveEvent(onStart, onComplete)` | OPFS save start/complete | `RasterAutoSaveService` — syncs `state$` observable |
| `interactionService.onViewportChanged` | Pan/zoom | `IllustrationComponent` — calls `scene3dSyncIllustrationCamera()` |

All animation events are dispatched inside `NgZone.run()` in `RasterAnimationService` to ensure Angular change detection fires:

```typescript
this._unsubscribeEvent = sm.onAnimationEvent((event: AnimationEvent) => {
  this.zone.run(() => { /* update BehaviorSubjects */ });
});
```

---

## Viewport Sync (3D Camera)

When the 3D scene panel is active, the 3D camera must mirror the 2D viewport (pan offset + zoom) so 3D meshes appear to live in the same space as the 2D canvas.

Two Salsa APIs handle this:

### `syncIllustrationCamera3D(panX, panY, zoom, canvasW, canvasH)`

Called whenever the 2D viewport changes (onViewportChanged subscription) or canvas is resized (ResizeObserver):

```typescript
scene3dSyncIllustrationCamera(): void {
  const sm = this.shapeManager as any;
  const is = sm.interactionService;
  sm.syncIllustrationCamera3D?.(
    is.getPanOffset().x, is.getPanOffset().y,
    is.getZoomFactor(),
    this.canvas.width, this.canvas.height
  );
}
```

### `setIllustrationProjection3D(mode: 'perspective' | 'orthographic')`

Sets the 3D camera projection mode. Default is `'orthographic'` for the illustration viewport (avoids perspective distortion on flat artwork):

```typescript
(this.shapeManager as any).setIllustrationProjection3D?.(this.scene3dIllustrationProjection);
```

Both subscriptions are set up in `onScene3dSelected(true)` and torn down in `onScene3dSelected(false)`.

---

## Brush Service Integration

`RasterBrushService` wraps the brush and layer APIs. Key patterns:

### Preset mutation via paint engine

Salsa's `RasterPaintEngine` (obtained via `sm.getRasterPaintEngine()`) owns preset objects. Mutations go through it:

```typescript
private _mutatePreset(mutate: (p: BrushPreset) => void): void {
  const engine = this.sm?.getRasterPaintEngine?.();
  const id = this._activePresetId$.value;
  const preset = engine.getPreset?.(id) as BrushPreset;
  mutate(preset);
  engine.registerPreset(preset);
  engine.setActivePreset(preset.id);
  this.refreshPresets();
}
```

### Layer compositor via sub-manager

Blend mode and opacity are set on the `rasterLayerManager` sub-object, not top-level `ShapeManager`:

```typescript
(this.sm as any)?.rasterLayerManager?.setBlendMode(id, mode);
(this.sm as any)?.rasterLayerManager?.setOpacity(id, opacity);
```

### 3D scene layer lifecycle

The 3D "divider" entry in the layer stack maps to a `3d-scene` type in Frogmarks's model:

```typescript
add3DScene():  (sm as any)?.addRaster3DScene?.()  ?? (sm as any)?.addRaster3DDivider?.()
remove3DScene:(sm as any)?.removeRaster3DScene?.() ?? (sm as any)?.removeRaster3DDivider?.()
has3DScene:   sm?.hasRaster3DScene?.()             ?? sm?.hasRaster3DDivider?.()
```

The dual-call pattern handles the API rename from `Divider` to `Scene` across Salsa versions.

---

## Known Salsa Behaviour: Mesh Auto-Selection on Restore

`Scene3DManager.restoreMeshState()` internally calls `createBox` / `createSphere` / etc., which unconditionally call `setSelectedNode` + `setSelectedMeshIds`. This means every mesh restored from a saved state appears selected on load.

**Fix applied in Salsa** (`scene3d-manager.ts`): `this.clearSelection()` is called at the end of `restoreMeshState()`, just before `return mesh`. This ensures restored meshes are always in a deselected state after scene load.

If this fix is ever lost (e.g. a salsa reset), the symptom is that all 3D meshes appear selected (highlighted with gizmos) immediately on illustration load.

---

## What Salsa Provides vs. What Frogmarks Manages

| Responsibility | Owned by Salsa | Owned by Frogmarks |
|---------------|---------------|-------------------|
| WebGPU device + canvas context | Yes | No |
| Raster paint engine (brush, eraser, fill) | Yes | Config only |
| GPU compositor (blend modes, dithering) | Yes | Config only |
| Layer/cel data store (GPU textures) | Yes | Metadata IDs |
| Vector scene graph | Yes | Read/write via getSceneGraphJSON |
| 3D mesh geometry + rendering | Yes | Config + CRUD calls |
| OPFS auto-save (binary pixel data) | Yes | Enable/disable + state feedback |
| Animation frame clock + cel storage | Yes | Config + CRUD calls |
| Selection tool UI (handles, transforms) | Yes | Tool activation |
| Layer metadata (name, order, visible, opacity, blend, etc.) | Frogmarks reads it back | Frogmarks writes it |
| Illustration model (name, UUID, team) | No | Yes — `IllustrationService` |
| Cloud save / blob storage | No | Yes — `IllustrationService` |
| `.frog` zip export | No | Yes — `FrogFileService` |
| `.frogmarks` zip export | Yes (`packProject`/`unpackProject`) | Host for pack/unpack cycle |
