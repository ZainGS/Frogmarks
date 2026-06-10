# 3D Animation & Keyframes — Integration Reference

## Overview

The 3D keyframe system records mesh transforms, camera state, and blend shape weights at specific timeline frames. Salsa interpolates between them during playback via `applyAllKeyframesAtFrame`, which fires automatically — no per-frame wiring needed in Frogmarks beyond what drives the timeline scrub.

---

## Timeline integration

The timeline is driven by `RasterAnimationService`. The 3D system hooks into it:

```ts
// illustration.component.ts ngOnInit / setup
this.animationService.currentFrame$.subscribe(f => {
  this._currentAnimFrame = f;
});
```

When the user scrubs the timeline, `animationService.currentFrame$` emits, which triggers `scene3dRefreshKeyframeTracks()`. Salsa's `applyAllKeyframesAtFrame(frame)` is called internally — Frogmarks doesn't need to call it manually.

---

## Recording keyframes

### ◆ Record Keyframe button

Snapshots the selected mesh's current position/rotation/scale at the current frame:

```ts
scene3dRecordKeyframe(): void {
  const frame = this.animationService.getCurrentFrame?.() ?? 1;
  const count = sm.recordKeyframesForSelectedMeshes3D?.(frame);
  if (!count && this.scene3dSelectedMeshId) {
    sm.recordKeyframeForMesh3D?.(this.scene3dSelectedMeshId, frame);
  }
  this.scene3dRefreshKeyframeTracks();
  this.scene3dKeyframeFlash = true;                     // gold flash animation
  this._scene3dFlashTimer = setTimeout(() => { this.scene3dKeyframeFlash = false; }, 600);
  this.scene3dMarkDirty();
}
```

`recordKeyframesForSelectedMeshes3D` handles multi-selection; fallback `recordKeyframeForMesh3D` handles single selection.

### Auto-key mode

When `sm.autoKey3D` is truthy, every transform change records a keyframe automatically. The Record Keyframe button shows a red tint (`scene3d-btn-autokey` class) when auto-key is active.

---

## Track data model

```ts
// Per mesh — lives on mesh.keyframeTracks
{
  positionX?: { frame, value, easing }[]
  positionY?: { frame, value, easing }[]
  positionZ?: { frame, value, easing }[]
  rotationX?: { frame, value, easing }[]
  rotationY?: { frame, value, easing }[]
  rotationZ?: { frame, value, easing }[]
  scaleX?:    { frame, value, easing }[]
  scaleY?:    { frame, value, easing }[]
  scaleZ?:    { frame, value, easing }[]
}

// Blend shape tracks — separate from the above; keyed by shape name
Record<shapeName, { frame, value, easing? }[]>

// Camera tracks
{
  position?: { frame, value: [x,y,z], easing }[]
  target?:   { frame, value: [x,y,z], easing }[]
  fov?:      { frame, value: number, easing }[]   // degrees; ignored in ortho mode
}
```

### Easing values

`'linear'` | `'step'` | `'ease-in'` | `'ease-out'` | `'ease-in-out'`

Default for `recordKeyframeForMesh3D` is `'ease-in-out'`. Blend shape keyframes default to `'linear'` when set via the ◆ button.

---

## `scene3dRefreshKeyframeTracks()`

Rebuilds `scene3dAllMeshTracks` from scratch. Called after every keyframe record, on mesh selection change, and on timeline scrub. Also refreshes blend shape keyframe tracks.

Priority order for track data per mesh:
1. `mesh.keyframeTracks` — live object property, always current
2. `sm.getMeshKeyframeTracks3D(id)` — Salsa public API
3. `sm.getAllMeshKeyframeTracks3D()` batch entry
4. `{}` — mesh exists, no keyframes yet

Camera row is synthesized as `{ meshId: '__camera__', name: '📷 Camera', isCamera: true }` and prepended when camera tracks exist.

---

## Camera keyframes

```ts
// Snapshot current camera state at the given frame
sm.recordCameraKeyframe3D(frame?)

// Read all camera tracks
sm.getCameraKeyframeTracks3D(): { position?, target?, fov? }

// Fine-grained control
sm.setCameraKeyframe3D(property: 'position'|'target'|'fov', frame, value, easing?)
sm.removeCameraKeyframe3D(property, frame)
sm.clearCameraKeyframeTracks3D()
```

Camera keyframes are rendered in the timeline using `camera3dTrackDefs` instead of `mesh3dTrackDefs`. `fov` keyframes are non-destructively ignored in orthographic mode.

---

## Blend shape keyframes

See `docs/blend-shapes.md` for the full blend shape keyframing reference.

Quick summary:
- Use `sm.setBlendShapeKeyframe3D(meshId, shapeName, frame, weight, easing?)`
- Shape name (string) — not index
- `getBlendShapeKeyframeTracks3D` returns a direct object reference (essentially free to call)
- Sampled automatically by `applyAllKeyframesAtFrame`

---

## Salsa API summary

### Mesh keyframes

```ts
sm.recordKeyframeForMesh3D(meshId, frame): void
sm.recordKeyframesForSelectedMeshes3D(frame): number   // returns count recorded
sm.getMeshKeyframeTracks3D(meshId): object
sm.getAllMeshKeyframeTracks3D(): { meshId, name, tracks }[]
sm.setMeshKeyframe3D(meshId, property, frame, value, easing?): void
sm.removeMeshKeyframe3D(meshId, property, frame): void
sm.clearMeshKeyframeTracks3D(meshId): void
sm.autoKey3D: boolean   // read/write — enables auto-record on transform
```

### Camera keyframes

```ts
sm.recordCameraKeyframe3D(frame?): void
sm.getCameraKeyframeTracks3D(): { position?, target?, fov? }
sm.setCameraKeyframe3D(property, frame, value, easing?): void
sm.removeCameraKeyframe3D(property, frame): void
sm.clearCameraKeyframeTracks3D(): void
```

### Blend shape keyframes

```ts
sm.setBlendShapeKeyframe3D(meshId, shapeName, frame, weight, easing?): void
sm.removeBlendShapeKeyframe3D(meshId, shapeName, frame): void
sm.getBlendShapeKeyframeTracks3D(meshId):
  Record<string, { frame: number; value: number; easing?: string }[]> | null
```

### Playback

```ts
sm.getAnimationPlayer3D(): AnimationPlayer3D | null
  .play() / .pause() / .stop()
  .currentFrame

// Synced to 2D timeline
sm.scene3d?.startSyncedPlayback?.()
sm.scene3d?.stopSyncedPlayback?.()
```

---

## Frogmarks component state

```ts
// illustration.component.ts
scene3dAllMeshTracks:      { meshId: string; name: string; tracks: any }[]
scene3dSelectedMeshTracks: any                           // tracks for the active mesh
scene3dBlendKeyframeTracks: Record<string, ...[]> | null // blend shapes for active mesh
scene3dKeyframeFlash:      boolean                       // drives kf-flash CSS animation
scene3dAutoKey:            boolean                       // getter → sm.autoKey3D
scene3dTimelineFrame:      number                        // displayed in frame badge
```
