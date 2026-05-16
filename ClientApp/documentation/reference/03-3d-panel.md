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

Hierarchy node types: `'mesh'`, `'3DMeshGroup'`, and `'3DArrayGroup'`. Group nodes have a `children` array; `3DArrayGroup` nodes are **leaves** (no children — instances are GPU-only). Array group nodes include an `instanceCount: number` field populated by Salsa — no extra API call is needed for the outliner badge.

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

## Multi-Material Submesh Slots

A mesh can have multiple material slots — each slot covers a named subset of the mesh's geometry (for multi-part models like imported GLBs). Each slot has its own diffuse color, opacity, and render style, independent of the mesh-level material.

### Component state

```typescript
scene3dSubmeshes: Array<{
  label: string;
  color: string;       // hex
  opacity: number;     // 0–1
  renderStyle: string; // 'default' | 'cel' | 'sketch' | 'ink'
}>
```

Populated by `_scene3dReloadSubmeshes()`, which is called every time a mesh is selected:

```typescript
private _scene3dReloadSubmeshes(): void {
  const rawSubs = sm.getMeshSubmeshes3D?.(id) ?? [];
  this.scene3dSubmeshes = rawSubs.map((s, i) => ({
    label: s.label ?? `Slot ${i}`,
    color: /* hex from s.material.diffuse */,
    opacity: s.material?.opacity ?? 1,
    renderStyle: s.material?.renderStyle ?? 'default',
  }));
}
```

### CRUD operations

| Method | Salsa call | Notes |
|--------|-----------|-------|
| `scene3dAddSubmesh()` | `(sm as any).appendMeshSubmesh3D?.(id, { label, material })` | Appends a new white slot; reloads list |
| `scene3dRemoveSubmesh(slotIndex)` | `(sm as any).removeMeshSubmesh3D?.(id, slotIndex)` | Removes by slot index; reloads list |
| `scene3dClearSubmeshes()` | `(sm as any).clearMeshSubmeshes3D?.(id)` | Removes all slots |

### Per-slot mutation

All three read the live slot data from the engine before writing, to avoid clobbering unrelated material fields:

```typescript
scene3dUpdateSubmeshColor(slotIndex): void
// reads rawSubs[slotIndex], merges diffuseColor, calls setMeshSubmesh3D

scene3dUpdateSubmeshOpacity(slotIndex): void
// reads rawSubs[slotIndex], merges opacity, calls setMeshSubmesh3D

scene3dUpdateSubmeshRenderStyle(slotIndex, style): void
// reads rawSubs[slotIndex], merges renderStyle, calls setMeshSubmesh3D

scene3dUpdateSubmeshLabel(slotIndex): void
// calls setMeshSubmesh3D with { label } only — no material read needed
```

All mutations call `scene3dMarkDirty()` to trigger a re-render.

### Salsa API summary

| Call | Purpose |
|------|---------|
| `(sm as any).getMeshSubmeshes3D?.(meshId)` | Returns `any[]` — current slot array |
| `(sm as any).appendMeshSubmesh3D?.(meshId, slot)` | Adds a new slot |
| `(sm as any).setMeshSubmesh3D?.(meshId, index, partial)` | Updates an existing slot (partial merge) |
| `(sm as any).removeMeshSubmesh3D?.(meshId, index)` | Removes slot at index |
| `(sm as any).clearMeshSubmeshes3D?.(meshId)` | Removes all slots |

---

## Cloth Simulation

Cloth meshes are a special mesh type created via `ClothBuilderComponent`. They use a position-based physics solver (Salsa-internal) to simulate hanging fabric and draped cloth.

### Cloth Builder

Opened via `scene3dOpenClothBuilder(meshId?)`:

```typescript
// New cloth (no existing mesh)
scene3dOpenClothBuilder()
// → clothBuilderExistingId = null; clothBuilderVisible = true

// Edit existing cloth
scene3dOpenClothBuilder(meshId)
// → reads cfg = scene3d.getClothConfig(meshId)
// → clothBuilderExistingId = meshId
// → clothBuilderInitialGrid, clothBuilderInitialPhysics, clothBuilderInitialSimMode, clothBuilderInitialSimPositions
// → clothBuilderVisible = true
```

An edit button (✎) appears next to cloth entries in the outliner (`scene3dClothIds: Set<string>` tracks which node IDs are cloth).

### ClothBuilderComponent

`ClothBuilderComponent` is declared in `IllustrateModule`, receives `@Input() existingMeshId`, `initialGrid`, `initialPhysics`, `initialSimMode`, `initialSimPositions`, and `scene3dManager`.

**Grid parameters:**

| Property | Range | Description |
|----------|-------|-------------|
| `cols` | 2–64 | Columns of cloth vertices |
| `rows` | 2–64 | Rows of cloth vertices |
| `cellSize` | 0.01–2.0 | Size of each grid cell |

**Physics parameters:**

| Property | Range | Description |
|----------|-------|-------------|
| `gravity` | 0–20 | Downward acceleration |
| `damping` | 0–1 | Velocity damping per step |
| `stiffness` | 0–1 | Constraint stiffness |
| `thickness` | 0–0.5 | Collision shell radius |
| `wind` | vec3 | Wind force applied per step |

**Simulation modes** (live preview in the builder):

| `liveSimMode` | Behaviour |
|---------------|-----------|
| `'off'` | No simulation — flat cloth grid displayed |
| `'hang'` | Pins the top row, gravity pulls cloth down |
| `'drape'` | Drops cloth onto a proxy collider (ground plane, sphere, or box) |

**Editor modes:**

| `editorMode` | Function |
|--------------|---------|
| `'draw'` | Add/remove pinned vertices |
| `'pin'` | Toggle individual vertex pins |
| `'stitch'` | Draw stitch connections between vertex pairs |
| `'paint-stiffness'` | Paint per-face bend stiffness (0–1) |

### On Confirm: `onClothBuilderCreated(result)`

```typescript
const { grid, physics, simulatedPositions, simMode, existingMeshId, previewMeshId, stitches, bendStiffnessMap } = result;

// Edit path:
if (existingMeshId) {
  s3d.replaceClothMesh(existingMeshId, grid, physics, simulatedPositions, simMode);
  if (previewMeshId && previewMeshId !== existingMeshId)
    s3d.removeNode(previewMeshId);  // clean up preview temp mesh
}
// Create path (no existing, but had a preview):
else if (previewMeshId) {
  s3d.replaceClothMesh(previewMeshId, grid, physics, simulatedPositions, simMode);
}
// Create path (no preview):
else {
  s3d.createClothMesh(cx, cy, cz, grid, physics, simulatedPositions, 'Cloth');
}
// Optional post-process:
s3d.setClothStitches(targetMeshId, stitches);
s3d.setClothBendStiffness(targetMeshId, bendStiffnessMap);
```

> `previewMeshId` is always initialized to `existingMeshId` when editing (not `null`). This prevents a duplicate mesh when the user re-opens an existing cloth in the builder.

### Cloth Inspector

Shown in the 3D panel when the selected mesh is a cloth node (`scene3dIsCloth === true`):

```typescript
clothInfoGrid: { cols: number; rows: number; cellSize: number } | null
clothInfoSim: { isSimulated: boolean; simulationMode: string } | null
clothInfoVertexCount: number | null
clothInfoTriCount: number | null
```

Read on every mesh select:
```typescript
const cfg = s3d.getClothConfig(meshId);      // → { grid, physics }
const mesh = s3d.getNode(meshId);             // → includes simState
const geom = s3d.getClothGeometryResult(meshId); // → { vertexCount, geometry.indices }
```

The inspector also shows **Re-simulate** and **Edit Cloth** buttons.

### Live Physics

```typescript
async setLiveCloth(enabled: boolean): Promise<void>
```

| Enabled | Salsa call |
|---------|-----------|
| `true` | `s3d.enableLiveCloth(meshId)` — Salsa ticks the cloth solver every render frame |
| `false` | `await s3d.disableLiveCloth(meshId, true)` — stops ticking, optionally freezes positions |

When live physics is disabled, any active wind animation is also disabled.

State: `clothLiveEnabled: boolean` — read from `mesh.liveConfig?.enabled` on mesh select.

### Wind Animation

Cloth meshes can animate continuously as waving flags via `FrameLinkAnimation3D` with `type: 'wind'`:

```typescript
applyWindAnimation(): void
// → (sm as any).setFrameLinkAnimation3D(meshId, {
//     enabled: clothWindEnabled,
//     type: 'wind',
//     axis: clothWindAxis,         // 'x' | 'y' | 'z'
//     amplitude: clothWindAmplitude,   // px of displacement
//     framesPerCycle: clothWindFramesPerCycle,
//     phase: clothWindPhase,
//   })
```

Wind animation requires live physics to be enabled first. The checkbox is only shown when `clothLiveEnabled === true`. State is read back on mesh select via `sm.getFrameLinkAnimation3D(meshId)` — if `windAnim.type === 'wind'`, the sliders are populated.

### Salsa API

| Call | Purpose |
|------|---------|
| `s3d.createClothMesh(x, y, z, grid, physics, positions?, name?)` | Create a new cloth mesh at world position |
| `s3d.replaceClothMesh(meshId, grid, physics, positions?, simMode?)` | Replace geometry and physics config of an existing cloth |
| `s3d.getClothConfig(meshId)` | Returns `{ grid, physics }` — full config snapshot |
| `s3d.getClothGeometryResult(meshId)` | Returns `{ vertexCount, geometry }` — for inspector display |
| `s3d.getClothStitches(meshId)` | Returns dense-index stitch array |
| `s3d.setClothStitches(meshId, stitches)` | Apply stitch constraints |
| `s3d.getClothBendStiffnessMap(meshId)` | Returns `Float32Array` per-face stiffness values |
| `s3d.setClothBendStiffness(meshId, map)` | Apply per-face bend stiffness |
| `s3d.enableLiveCloth(meshId)` | Start per-frame physics tick |
| `s3d.disableLiveCloth(meshId, freeze?)` | Stop tick; optionally freeze vertex positions |
| `s3d.getLiveClothHandle(meshId)` | Returns live handle for `reset(grid, physics, mode, proxy)` calls |
| `(sm as any).setFrameLinkAnimation3D(meshId, config)` | Set/update wind animation config |
| `(sm as any).getFrameLinkAnimation3D(meshId)` | Read current animation config |

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

## Array Tool (Repeat)

The Repeat tool lets the user select a mesh and stamp N GPU-instanced copies along a linear axis, across a 2D grid, or around a radial ring. Instances are not separate scene nodes — they are computed each frame from `arrayParams` and drawn in a single WebGPU draw call.

### Terminology

| Term | Meaning |
|------|---------|
| **Source mesh** | The original `Mesh3D` the array is derived from — stays as a sibling in scene root |
| **ArrayGroup3D** | The scene node that owns the array params (`type === '3DArrayGroup'`) |
| **Pre-commit** | Array tool is active but no array has been created yet |
| **Post-commit** | User clicked a handle; `ArrayGroup3D` is now selected and the Repeat panel shows |

### Component State

#### Tool-active state (pre-commit)

```typescript
scene3dArrayToolActive = false;
scene3dArrayToolMode: 'line' | 'grid' | 'radial' = 'line';
scene3dArrayToolCount = 3;
// Radial-specific pre-commit state (synced from engine):
scene3dArrayToolRadius: number | null = null;  // null = auto from source AABB
scene3dArrayToolArc = 360;
scene3dArrayToolAxis: 'x' | 'y' | 'z' = 'y';
```

#### Array Group panel state (post-commit)

```typescript
scene3dIsArrayGroup = false;
scene3dArrayMode: 'linear' | 'grid' | 'radial' = 'linear';
// Linear / Grid:
scene3dArrayCountX = 3;   scene3dArraySpacingX = 2.0;  scene3dArrayAxisX: 'x'|'y'|'z' = 'x';
scene3dArrayCountY = 3;   scene3dArraySpacingY = 2.0;  scene3dArrayAxisY: 'x'|'y'|'z' = 'z';
// Radial:
scene3dArrayRadialCount = 6;  scene3dArrayRadius = 3.0;
scene3dArrayArc = 360;        scene3dArrayRadialAxis: 'x'|'y'|'z' = 'y';
```

### Pre-commit: Tool Options Strip

Shown at the top of the 3D panel while `scene3dArrayToolActive` is true. The Mode + Count controls are always visible; Radius / Arc° / Axis / Orient appear only when Mode is Radial.

```
Mode: [●Line] [Grid] [Radial]   Count: 3
// Radial only:
Radius: [____auto]   Arc°: [360]   Axis: [X][Y][Z]   Orient: [W][L]
```

**Activation / deactivation:**

```typescript
scene3dToggleArrayTool()
// Calls sm.enableArrayTool(mode, count); syncs radial strip state if mode === 'radial'

scene3dDeactivateArrayTool()
// Calls sm.disableArrayTool(); clears scene3dArrayToolActive
```

**Mode switch:**

```typescript
scene3dSetArrayToolMode(mode)
// → sm.setArrayToolMode(mode); syncs radial strip if switching to 'radial'
```

**Radial pre-commit setters (live — update ghost immediately):**

| Method | Salsa call | Notes |
|--------|-----------|-------|
| `scene3dSetArrayToolCount(n)` | `sm.setArrayToolCount(n)` | 1–32 |
| `scene3dSetArrayToolRadius(r)` | `sm.setArrayToolRadius(r)` | `null` restores auto-AABB |
| `scene3dSetArrayToolArc(deg)` | `sm.setArrayToolArc(deg)` | 1–360 |
| `scene3dSetArrayToolAxis(axis)` | `sm.setArrayToolAxis(axis)` | `'x'|'y'|'z'` |

**`_scene3dSyncRadialToolStrip()`** — private — reads `getArrayToolAxis/Radius/Arc` back from engine and updates component state. Called on activation and on mode switch to radial. Also called from `onSceneGraphChanged` when the tool is active in radial mode (syncs scroll-wheel count and live param changes).

### Post-commit: Repeat Panel

Shown in the right panel when `scene3dSelectedMeshId && scene3dIsArrayGroup && !scene3dIsEditingMesh`.

**Selection detection** — `scene3dSelectMesh(id)` calls `sm.isArrayGroup3D(id)`. If true:
- Sets `scene3dIsArrayGroup = true`, `scene3dSelectedIsGroup = true`
- Calls `_scene3dSyncArrayPanel(id)` to populate panel state from `sm.getArrayParams3D(id)`
- Returns early (skips normal mesh inspector)

**`_scene3dSyncArrayPanel(groupId)`** — reads `params.mode` and fills all panel state variables. Also called from `onSceneGraphChanged` whenever `scene3dIsArrayGroup` is true, keeping the panel in sync with gizmo-drag spacing changes.

**`onSceneGraphChanged` post-commit detection** — when the tool is active, queries `sm.getSelectedNode3D?.()` for a newly committed array group. If detected: deactivates the tool, calls `scene3dRefreshMeshes()` and `scene3dSelectMesh(id)` to switch the panel.

#### Linear Mode

| Control | Binding | Method | Salsa call |
|---------|---------|--------|-----------|
| Count | `scene3dArrayCountX` | `scene3dUpdateArrayCountX(v)` | `updateArrayParams3D(id, { countX: v })` |
| Spacing | `scene3dArraySpacingX` (magnitude) | `scene3dUpdateArraySpacingX(mag)` | rescales spacing vector, calls `updateArrayParams3D` |
| Axis X/Y/Z | `scene3dArrayAxisX` | `scene3dSetArrayAxisX(axis)` | sets spacing vector to cardinal `[mag,0,0]` etc. |

#### Grid Mode

Same pattern as linear but with a second axis:

| Control | Binding | Method |
|---------|---------|--------|
| Count X / Y | `scene3dArrayCountX/Y` | `scene3dUpdateArrayCountX/Y(v)` |
| Spacing X / Y | `scene3dArraySpacingX/Y` (magnitude) | `scene3dUpdateArraySpacingX/Y(mag)` |
| Axis X / Y | `scene3dArrayAxisX/Y` | `scene3dSetArrayAxisX/Y(axis)` |

#### Radial Mode

| Control | Binding | Method | Salsa call |
|---------|---------|--------|-----------|
| Count | `scene3dArrayRadialCount` | `scene3dUpdateArrayRadialCount(v)` | `updateArrayParams3D(id, { count: max(1,v) })` |
| Radius | `scene3dArrayRadius` | `scene3dUpdateArrayRadius(v)` | `updateArrayParams3D(id, { radius: max(0.1,v) })` |
| Arc° | `scene3dArrayArc` | `scene3dUpdateArrayArc(v)` | `updateArrayParams3D(id, { arcDeg: clamp(1,360,v) })` |
| Axis | `scene3dArrayRadialAxis` | `scene3dSetArrayRadialAxis(axis)` | `updateArrayParams3D(id, { axis })` |
| Orient | `scene3dGizmoOrientation` | `scene3dToggleGizmoOrientation()` | `sm.setGizmoOrientation3D(mode)` |

**Orient (World / Local)**: Radial instances orbit around a world axis by default. In Local mode the ring plane follows the source mesh's `localMatrix` rotation, so a tilted mesh gets a tilted ring. This is the same toggle as the Move/Rotate/Scale gizmo orientation (shared state: `scene3dGizmoOrientation`).

#### Edit Source / Bake

```typescript
scene3dEditArraySource()
// → sm.getArraySourceId(groupId) → sm.enterMeshEditMode3D(sourceId)
// Hides Repeat panel; shows edit-mesh controls while editing

scene3dBakeArray()
// → window.confirm(...) → sm.bakeArray3D(groupId)
// Converts ArrayGroup3D + source into MeshGroup3D of N+1 independent meshes
// Pushes undo internally; baked group auto-selected
```

### Outliner Behavior

`3DArrayGroup` nodes appear as **leaves** in the outliner — no expand/collapse arrow. The `⊞` icon is shown. An instance count badge (`×N`) is rendered from `node.instanceCount` (included in `getScene3DHierarchy()` output; no extra call needed):

```
⊞  Repeat  ×4
```

Clicking the node calls `scene3dSelectMesh(node.id)` which routes to the array group panel.

### Salsa API Reference

| Method | Description |
|--------|-------------|
| `sm.enableArrayTool(mode?, count?)` | Activates hover-handle mode. `mode`: `'line'|'grid'|'radial'`, default `'line'` |
| `sm.disableArrayTool()` | Clears ghost/handle visuals |
| `sm.setArrayToolMode(mode)` | Switch mode while tool is active |
| `sm.setArrayToolCount(n)` | Set ghost count (1–32) |
| `sm.getArrayToolCount()` | Read back count (for scroll-wheel sync) |
| `sm.setArrayToolRadius(r)` | Pre-commit radial radius (`null` = auto-AABB) |
| `sm.getArrayToolRadius()` | Read back radius |
| `sm.setArrayToolArc(deg)` | Pre-commit arc (1–360) |
| `sm.getArrayToolArc()` | Read back arc |
| `sm.setArrayToolAxis(axis)` | Pre-commit radial axis |
| `sm.getArrayToolAxis()` | Read back axis |
| `sm.isArrayGroup3D(nodeId)` | `true` if the node is an `ArrayGroup3D` |
| `sm.getArrayParams3D(groupId)` | Returns `LinearArrayParams \| GridArrayParams \| RadialArrayParams \| null` |
| `sm.updateArrayParams3D(groupId, partial)` | Live-update params; triggers `onSceneGraphChanged`; does **not** push undo |
| `sm.getArraySourceId(groupId)` | Returns the source mesh ID |
| `sm.bakeArray3D(groupId)` | Bake to N+1 independent meshes; pushes undo |
| `sm.scene3d.pushCommand3D({ description, undo, redo })` | Push manual undo step for panel-driven param changes |

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
