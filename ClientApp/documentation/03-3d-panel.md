# 03 — 3D Panel Reference

The 3D panel is a subsystem of `IllustrationComponent`. It activates when the user selects the `3d-scene` layer entry in the raster layer panel. All 3D operations go through `(this.shapeManager as any).scene3d` (the `Scene3DManager` sub-object) or top-level `shapeManager` methods with a `3D` suffix.

---

## Activation

### `onScene3dSelected(selected: boolean)`

Called by the raster-layers component's `(scene3dSelected)` output event.

When `selected = true`:
1. Sets `scene3dPanelVisible = true`
2. Calls `scene3dRefreshMeshes()`, `scene3dRefreshHierarchy()`, `scene3dRefreshRuntimeState()`
3. Calls `scene3dEnsureAnimationPlayer()`
4. Calls `scene3d.enableTransformControls()` — activates gizmo hit-testing on the canvas
5. Sets illustration projection: `(sm as any).setIllustrationProjection3D?.(scene3dIllustrationProjection)` (default `'orthographic'`)
6. Calls `scene3dSyncIllustrationCamera()` once
7. Subscribes `interactionService.onViewportChanged` → `scene3dSyncIllustrationCamera()` (continuous pan/zoom sync)
8. Creates a `ResizeObserver` on `this.canvas` → `scene3dSyncIllustrationCamera()`

When `selected = false`: tears down both subscriptions.

The boolean getter `is3DContextActive` returns `true` when `scene3dPanelVisible || !!scene3dSelectedMeshId`.

---

## Scene Modes

| State | Description |
|-------|-------------|
| `scene3dPanelVisible` | 3D scene layer is selected in layer panel; 3D controls are shown |
| `scene3dSelectedMeshId` | A specific mesh is selected in the outliner |
| `scene3dOrbitEnabled` | Orbit-camera mode (pointer drags orbit instead of selecting/painting) |

Separate from the 3D panel, the `has3DScene` getter returns `true` if any layer in `rasterLayers` has `type === '3d-scene'` or `type === '3d-divider'`. Adding a 3D scene is done via the layer panel's "Add 3D Scene" button, which calls `rasterBrushService.add3DScene()`.

---

## Outliner (Hierarchy)

The outliner displays the full scene hierarchy including mesh groups. It is populated by `scene3dRefreshHierarchy()`:

```typescript
scene3dRefreshHierarchy(): void {
  const hierarchy = (sm as any).getScene3DHierarchy?.();
  if (hierarchy) {
    this.scene3dHierarchy = hierarchy;
  } else {
    // fallback: flat list from getAllMeshes()
    this.scene3dHierarchy = this.scene3dMeshes.map(m => ({
      id: m.id ?? m.nodeId,
      name: m.name ?? m.meshPrimitive ?? 'mesh',
      type: 'mesh',
      visible: m.visible !== false,
      normalMapLibraryId: m.normalMapLibraryId ?? null,
      children: [],
    }));
  }
}
```

Hierarchy node types: `'mesh'` and `'3DMeshGroup'`. Group nodes have a `children` array.

### Outliner operations

| Method | Salsa API | Notes |
|--------|-----------|-------|
| `scene3dToggleGroupCollapse(id)` | Local state only | `scene3dCollapsedGroups: Set<string>` |
| `scene3dToggleVisibility(node)` | `sm.setGroupVisible3D(id, v)` or `sm.setMeshVisible3D(id, v)` | Dispatches to group or mesh variant |
| `scene3dStartRename(node, event)` | — | Enters inline rename mode |
| `scene3dCommitRename(node)` | `sm.setGroupName3D(id, name)` or `sm.setMeshName3D(id, name)` | Commits inline rename |
| `scene3dCancelRename()` | — | Clears `scene3dRenamingId` |
| `scene3dDeleteGroup(id)` | `(sm as any).deleteMeshGroup3D(id)` | Deletes group + children |
| `scene3dAddGroup()` | `scene3d.createMeshGroup('Group')` | Creates empty group |

---

## Mesh CRUD

### Add Primitive

```typescript
scene3dAddMesh(primitive: 'box' | 'sphere' | 'plane' | 'cylinder' | 'torus'): void
```

Routes to `scene3d.createBox(0,0,0)`, `createSphere(...)`, etc. All primitives are spawned at origin. After creation, auto-selects the new mesh.

### Select Mesh

```typescript
scene3dSelectMesh(id: string): void
```

1. `(sm as any).setSelectedNode(id)` — engine selection (gizmo appears)
2. `scene3d.getMesh(id)` — reads current transform + material
3. Populates inspector fields: `scene3dMeshPosX/Y/Z`, `scene3dMeshRotX/Y/Z` (degrees), `scene3dMeshScaleX/Y/Z`, `scene3dMeshOpacity`
4. Reads `mesh.textureLibraryId` → `scene3dDiffuseTextureSet`
5. Reads `mesh.normalMapLibraryId` → `scene3dNormalMapSet`
6. Reads `mesh.material.renderStyle` → `scene3dRenderStyle`

### Delete Mesh

```typescript
scene3dDeleteMesh(id: string): void
// → scene3d.deleteMesh(id)
```

### Import Model

```typescript
async scene3dImportModelFromPicker(event: Event): Promise<void>
async scene3dImportModelFile(file: File): Promise<void>
```

Detects format by file extension (`.obj`, `.gltf`, `.glb`) and routes to:
- **OBJ:** `scene3d.importObjFile(x, y, z, file)` → returns `Mesh3D`
- **GLB/GLTF:** `scene3d.importGltfFile(x, y, z, file)` → returns `Mesh3D[]`

Auto-scale is applied to normalize imported geometry to a reasonable size within the scene. The raw GLB buffer is stored via `scene3d.storeModelBuffer(meshId, buffer)` for `.frogmarks` serialization.

---

## Transform Inspector

The inspector is populated when a mesh is selected (`scene3dSelectMesh`). Changes are applied immediately on `(input)` or `(change)` events:

| Property | UI field | Method | Salsa call |
|----------|----------|--------|-----------|
| Position X/Y/Z | number inputs | `scene3dUpdateMeshPosition()` | `scene3d.setPosition(id, x, y, z)` |
| Rotation X/Y/Z | number inputs (degrees) | `scene3dUpdateMeshRotation()` | `scene3d.setRotation(id, rx*d2r, ry*d2r, rz*d2r)` |
| Scale X/Y/Z | number inputs | `scene3dUpdateMeshScale()` | `scene3d.setScale(id, sx, sy, sz)` |
| Diffuse color | color picker | `scene3dUpdateMeshColor()` | `scene3d.setDiffuseColor(id, r, g, b)` |
| Opacity | slider | `scene3dUpdateMeshOpacity()` | `scene3d.setOpacity(id, v)` |

Rotation is stored in radians by Salsa but displayed in degrees by the UI. Conversion: `d2r = Math.PI / 180`, `r2d = 180 / Math.PI`.

---

## Gizmo Mode

```typescript
scene3dSetGizmoMode(mode: 'move' | 'rotate' | 'scale'): void
// → scene3d.setGizmoMode(mode)  AND  sm.setGizmoMode3D(mode)
```

Both paths are called because the API may live on the sub-manager or top-level depending on Salsa version.

---

## Material and Render Styles

### Render Style

```typescript
scene3dSetRenderStyle(style: 'default' | 'cel' | 'sketch' | 'ink'): void
// → (sm as any).setRenderStyle3D(meshId, style)
```

| Style | Visual Effect |
|-------|--------------|
| `default` | Standard PS1-compatible Gouraud shading |
| `cel` | Stepped diffuse (3 bands) + hard specular cutoff — toon/anime |
| `sketch` | Procedural crosshatch based on light intensity |
| `ink` | Two-tone + view-space rim darkening — manga/comic |

Styles are GPU-implemented as branches in the mesh fragment shader; no pipeline switch is required.

### Diffuse Texture

```typescript
async scene3dUploadDiffuseTexture(event: Event): Promise<void>
// → scene3d.setMeshTexture(meshId, file)

scene3dClearDiffuseTexture(): void
// → scene3d.clearMeshTexture(meshId)
```

Uploading a diffuse texture switches the mesh to the textured GPU pipeline. The texture is stored in Salsa's `TextureLibrary` and referenced by `mesh.textureLibraryId`.

### Normal Map

```typescript
async scene3dUploadNormalMap(event: Event): Promise<void>
// → (sm as any).uploadAndApplyNormalMap3D(meshId, file)
// Switches mesh to per-pixel Phong lighting (from Gouraud)

scene3dClearNormalMap(): void
// → (sm as any).clearMeshNormalMap3D(meshId)
// Reverts to Gouraud shading
```

When a normal map is active, `mesh.normalMapLibraryId` is set. Gouraud vs. Phong is selected in the shader by the `hasNormalMap` material flag (bit 1 of the encoded material flags uniform).

---

## Lighting Controls

Applied via `scene3dApplyLighting()`:

```typescript
scene3d.setDirectionalLight(
  scene3dLightDirX, scene3dLightDirY, scene3dLightDirZ,   // direction vector
  1, 1, 1,                                                 // color (always white)
  scene3dLightIntensity                                    // 0.0–2.0
);
scene3d.setAmbientLight(
  scene3dAmbientR, scene3dAmbientG, scene3dAmbientB,       // RGB 0–1
  scene3dAmbientIntensity                                   // 0.0–2.0
);
```

Default values:

| Field | Default |
|-------|---------|
| `scene3dLightDirX` | `0.3` |
| `scene3dLightDirY` | `-0.8` |
| `scene3dLightDirZ` | `-0.5` |
| `scene3dLightIntensity` | `1.0` |
| `scene3dAmbientR/G/B` | `0.15, 0.15, 0.2` |
| `scene3dAmbientIntensity` | `1.0` |

---

## Shadow Configuration

```typescript
scene3dToggleShadows(enabled: boolean): void
// → scene3d.enableShadows(mapSize, extent, bias) OR disableShadows()

scene3dApplyShadowsSettings(): void
// Re-applies current shadow params when sliders change
```

| Field | Default | Description |
|-------|---------|-------------|
| `scene3dShadowsEnabled` | `false` | Master toggle |
| `scene3dShadowMapSize` | `1024` | Depth map resolution (px, power of 2) |
| `scene3dShadowExtent` | `15` | Half-extent of orthographic light frustum |
| `scene3dShadowBias` | `0.002` | Depth bias to prevent self-shadowing acne |

Salsa implements PCF soft shadows (3×3 kernel). Shadows apply only to opaque meshes. Minimum fragment brightness when fully shadowed: 30% ambient.

---

## PS1 Effects

Applied via `scene3dApplyPS1()`:

```typescript
(sm as any).scene3d?.setPS1Config({
  vertexJitter: scene3dPS1Jitter,       // clip-space grid snap amount
  snapGridSize: scene3dPS1Snap,         // virtual resolution (e.g. 160)
  affineWarp: scene3dPS1Affine,         // 0=perspective correct, 1=full affine
  colorDepth: scene3dPS1ColorDepth,     // Gouraud quantization levels (32 ≈ PS1)
});
```

Defaults: jitter `0.8`, snap `160`, affine `0.5`, colorDepth `32`.

---

## Animation Keyframes

### Creating the Player

`scene3dEnsureAnimationPlayer()` creates the 3D animation player on first use:

```typescript
(sm as any).createAnimationPlayer3D({
  startFrame: scene3dAnimStartFrame,  // default 0
  endFrame: scene3dAnimEndFrame,      // default 120
  fps: scene3dAnimFps,                // default 24
  loop: scene3dAnimLoop,              // default true
});
```

### Recording a Keyframe

```typescript
scene3dRecordKeyframe(): void
```

Reads the selected mesh's current transform from the engine and records it:
```typescript
sm.setMeshKeyframe3D(meshId, 'position', frame, [px, py, pz]);
sm.setMeshKeyframe3D(meshId, 'rotation', frame, [rx, ry, rz]);
sm.setMeshKeyframe3D(meshId, 'scale',    frame, [sx, sy, sz]);
```

The current frame is read from `sm.animation?.getCurrentFrame?.() ?? 0`.

### Playback

| Method | Synced mode | Independent mode |
|--------|-------------|-----------------|
| `scene3dAnimationPlay()` | `scene3d.startSyncedPlayback()` | `getAnimationPlayer3D().play()` |
| `scene3dAnimationPause()` | `scene3d.pauseSyncedPlayback()` | `getAnimationPlayer3D().pause()` |
| `scene3dAnimationStop()` | `scene3d.stopSyncedPlayback()` | `getAnimationPlayer3D().stop()` |

`scene3dAnimSyncWithTimeline` (default `true`) controls which path is used.

### Undo / Redo

```typescript
scene3dUndo():  sm.undo3D?.()   // requires sm.canUndo3D === true
scene3dRedo():  sm.redo3D?.()   // requires sm.canRedo3D === true
```

After undo/redo, `scene3dRefreshMeshes()` is called to re-sync the outliner.

---

## Camera / Viewport Controls

```typescript
scene3dSetCameraMode(mode: 'perspective' | 'orthographic')
// → scene3d.setCameraMode(mode)

scene3dSetFOV(v: number)
// → scene3d.setFOV(v)    (degrees, clamped in engine to ~10–170)

scene3dResetCamera()
// → scene3d.resetCamera()

scene3dFrameAllMeshes()
// → scene3d.frameAllMeshes()   // auto-orbits to show all meshes in view

scene3dToggleOrbit()
// → scene3d.toggleOrbitControls(enabled)
//   OR scene3d.enableOrbitControls({ radius:5, elevation:0.4, azimuth:0, enableDamping:true, dampingFactor:0.08 })
//   OR scene3d.disableOrbitControls()
```

Frustum culling toggle:
```typescript
scene3dSetFrustumCulling(enabled: boolean)
// → scene3d.frustumCulling = enabled
//   OR sm.frustumCulling3D = enabled
```

---

## Illustration Viewport Projection

The 3D camera can mirror the 2D illustration viewport in two projection modes:

```typescript
scene3dSetIllustrationProjection(mode: 'perspective' | 'orthographic')
// → (sm as any).setIllustrationProjection3D(mode)
```

Default is `'orthographic'`. The camera is then kept in sync on every pan/zoom via `syncIllustrationCamera3D(panX, panY, zoom, w, h)`.

---

## Render State Refresh

`scene3dRefreshRuntimeState()` reads back the current engine state to sync UI sliders after external changes:

```typescript
scene3dOrbitEnabled     = !!s3d.getOrbitController?.()?.enabled
scene3dCameraMode       = cam.mode
scene3dFOV              = Math.round((cam.fov ?? Math.PI/3) * 180 / Math.PI)
scene3dShadowsEnabled   = !!(s3d.shadowsEnabled ?? sm.shadowsEnabled3D)
scene3dFrustumCulling   = (s3d.frustumCulling ?? sm.frustumCulling3D ?? true) !== false
```
