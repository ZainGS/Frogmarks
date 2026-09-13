# Cinematic Cameras — Frogmarks UI Integration Guide

**Audience:** Frogmarks developers.  
**Date:** 2026-08-25 · **Engine spec:** `salsa/docs/specs/cinematic-cameras.md`

---

## 0. What it is

A **camera node** is a named 3D scene node with a FOV. Multiple cameras can exist in one scene. A **cut** records `{ cameraId, frame }` — at that frame the engine switches to that camera for render/preview. The host (Frogmarks) owns cut persistence; the engine does not auto-serialize them.

---

## 1. State fields (illustration.component.ts ~line 1332)

```ts
scene3dCameraNodes: { id: string; name: string }[] = [];
scene3dLookThroughId: string | null = null;
scene3dCameraCuts: { cameraId: string; frame: number }[] = [];
scene3dCutPreviewOn = false;
```

---

## 2. Methods

```ts
scene3dRefreshCameraNodes()     // calls sm.listCameraNodes3D(), updates scene3dCameraNodes
scene3dAddCamera()              // createCameraNode3D + setCameraMarkerSprite3D('fishing_frog.png')
scene3dToggleLookThrough(id)    // lookThroughCamera3D(id|null), updates scene3dLookThroughId
scene3dDeleteCamera(id)         // deleteNode3D(id), clears look-through if needed
scene3dRefreshCuts()            // getCameraCuts3D() → scene3dCameraCuts
scene3dDropCut(cameraId, frame) // setCameraCut3D({ cameraId, frame })
scene3dRemoveCut(frame)         // removeCameraCut3D(frame)
scene3dToggleCutPreview()       // setPreviewThroughCameras3D(bool)
scene3dClearAllCuts()           // clearCameraCuts3D() + refreshCuts
scene3dExportCinematic()        // exportCinematicFrames3D()
```

---

## 3. Subscriptions (init block)

```ts
this._cameraCutsSub = sm.onCameraCutsChanged3D?.subscribe?.(() =>
  this.ngZone.run(() => this.scene3dRefreshCuts()));
```

`scene3dRefreshCameraNodes()` is also called inside `_sceneGraphChangedSub` so the camera list stays in sync with add/delete.

---

## 4. Persistence

Cuts are saved in `scene3dGlobalSettings.cameraCuts` (added to `IllustrationStateDto`).  
On restore in `_applyScene3dGlobalSettings`: `setCameraCuts3D(cuts)`, then `scene3dRefreshCuts()` + `scene3dRefreshCameraNodes()`.

---

## 5. UI surfaces

### Add Mesh menu
"Camera" item calls `scene3dAddCamera()` directly (no quick-form).

### Global tab — Cinematic Cameras panel
Visible only when `scene3dCameraNodes.length > 0`. Contains:
- **Preview Cuts / Stop Preview** toggle button
- **Export…** button
- Per-camera rows with look-through 👁 toggle and ✕ delete
- **Clear All Cuts** button (only when cuts exist)

### Animation timeline — Cameras lane
- Shown at the bottom of the 3D dope sheet when `cameraNodes.length > 0`
- "🎬 Cameras" header with a ▶ preview toggle button
- One sub-row per camera in both label panel and grid
- Clicking a frame in a camera's grid row emits `dropCutRequested`
- ▼ markers at cut frames; clicking removes via `removeCutRequested`
- Preview toggle emits `previewToggled`

### Timeline binding (illustration.component.html)
```html
<app-animation-timeline
  [cameraCuts]="scene3dCameraCuts"
  [cameraNodes]="scene3dCameraNodes"
  [cameraPreviewOn]="scene3dCutPreviewOn"
  (dropCutRequested)="scene3dDropCut($event.cameraId, $event.frame)"
  (removeCutRequested)="scene3dRemoveCut($event)"
  (previewToggled)="scene3dToggleCutPreview()">
```

---

## 6. Engine API quick-reference

| Call | Effect |
|---|---|
| `sm.createCameraNode3D({ fov })` | Creates camera, returns id |
| `sm.listCameraNodes3D()` | Returns `{ id, name }[]` |
| `sm.lookThroughCamera3D(id \| null)` | Live viewport through that camera |
| `sm.setCameraMarkerSprite3D(id, url)` | Billboard icon in viewport |
| `sm.setCameraFovKeyframe3D(id, frame, fov)` | Animatable FOV |
| `sm.setCameraCut3D({ cameraId, frame })` | Drop/update a cut |
| `sm.removeCameraCut3D(frame)` | Remove cut at that frame |
| `sm.clearCameraCuts3D()` | Remove all cuts |
| `sm.getCameraCuts3D()` | Returns `{ cameraId, frame }[]` |
| `sm.setCameraCuts3D(cuts)` | Bulk restore (for doc load) |
| `sm.setPreviewThroughCameras3D(on)` | Live cut preview |
| `sm.onCameraCutsChanged3D` | Observable — fires on any cut change |
| `sm.exportCinematicFrames3D()` | Export frame sequence |

---

## 7. Camera sprite

`fishing_frog.png` is used as a placeholder until the real `frog-cloud-camera.png` asset is provided. Swap by changing `setCameraMarkerSprite3D` call in `scene3dAddCamera()`.

---

## 8. Not yet wired

- Per-camera FOV keyframes (API ready: `setCameraFovKeyframe3D`)
- Camera rename
- Camera node selection / gizmo for repositioning (handled by existing mesh selection system)
