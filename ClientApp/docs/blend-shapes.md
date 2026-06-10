# Blend Shapes — Integration Reference

## Overview

Blend shapes (morph targets) let meshes smoothly interpolate between their base geometry and any number of sculpted variants. They evaluate on the CPU before skinning, so facial expressions compose correctly with skeletal animation.

GLTF/GLB imports (VRoid, Character Creator, Blender) arrive with morph targets pre-populated at weight 0. No special import wiring is needed — `getBlendShapes3D` returns them immediately.

---

## Component state

```ts
// illustration.component.ts
scene3dBlendShapes: Array<{ name: string; weight: number }> = [];
scene3dBlendKeyframeTracks: Record<string, { frame: number; value: number; easing?: string }[]> | null = null;
```

`scene3dBlendShapes` is loaded in `scene3dSelectMesh()`:

```ts
this.scene3dBlendShapes = (this.shapeManager as any).getBlendShapes3D?.(id) ?? [];
this._refreshBlendKeyframeTracks();
```

The section is hidden when `scene3dBlendShapes.length === 0`.

---

## Setting weights

```ts
scene3dSetBlendWeight(index: number, weight: number): void {
  (this.shapeManager as any).setBlendWeight3D?.(this.scene3dSelectedMeshId, index, weight);
  this.scene3dMarkDirty();
}
```

`setBlendWeight3D` takes a **numeric index** (position in the array returned by `getBlendShapes3D`). The UI uses `*ngFor` with `let i = index` to get this.

---

## Keyframing

### Data model

Blend shape keyframe tracks are stored per mesh, keyed by **shape name** (string), not index:

```ts
Record<shapeName, { frame: number; value: number; easing?: string }[]>
```

This is separate from mesh transform keyframes (`mesh.keyframeTracks`). It lives at `mesh.keyframeTracks.blendWeights` but is accessed via the dedicated API.

### Salsa API

```ts
// Set a keyframe — defaults to 'linear' easing
sm.setBlendShapeKeyframe3D(meshId, shapeName, frame, weight, easing?)

// Remove a single keyframe
sm.removeBlendShapeKeyframe3D(meshId, shapeName, frame)

// Read all tracks (returns direct object reference from mesh — essentially free)
sm.getBlendShapeKeyframeTracks3D(meshId):
  Record<shapeName, { frame: number; value: number; easing?: string }[]> | null
```

Salsa samples blend weight tracks automatically in `applyAllKeyframesAtFrame`, which fires on every timeline scrub and playback tick. No extra wiring needed beyond what's already in place for mesh transform keyframes.

**Key difference from `setBlendWeight3D`:** keyframe methods use **shape name** (string), not numeric index. Use `shape.name` from `getBlendShapes3D` as the key.

### Frogmarks implementation

```ts
// Refresh the local track cache (called on mesh select and after each toggle)
private _refreshBlendKeyframeTracks(): void {
  if (!this.scene3dSelectedMeshId) { this.scene3dBlendKeyframeTracks = null; return; }
  this.scene3dBlendKeyframeTracks =
    (this.shapeManager as any).getBlendShapeKeyframeTracks3D?.(this.scene3dSelectedMeshId) ?? null;
}

// Used by the ◆ button template expression
scene3dBlendShapeHasKeyframe(shapeName: string): boolean {
  const track = this.scene3dBlendKeyframeTracks?.[shapeName];
  if (!track?.length) return false;
  const frame = this.animationService.getCurrentFrame?.() ?? 1;
  return track.some((kf: any) => kf.frame === frame);
}

// Toggle: set if no keyframe at current frame, remove if one exists
scene3dToggleBlendShapeKeyframe(shapeName: string, weight: number): void {
  const sm = this.shapeManager as any;
  const frame = this.animationService.getCurrentFrame?.() ?? 1;
  if (this.scene3dBlendShapeHasKeyframe(shapeName)) {
    sm.removeBlendShapeKeyframe3D?.(this.scene3dSelectedMeshId, shapeName, frame);
  } else {
    sm.setBlendShapeKeyframe3D?.(this.scene3dSelectedMeshId, shapeName, frame, weight);
  }
  this._refreshBlendKeyframeTracks();
  this.scene3dMarkDirty();
}
```

`_refreshBlendKeyframeTracks()` is also called at the end of `scene3dRefreshKeyframeTracks()`, which fires on every timeline scrub — keeping the ◆ button states accurate during playback.

### HTML — ◆ button

Each blend shape row includes a small keyframe toggle button:

```html
<div *ngFor="let shape of scene3dBlendShapes; let i = index" class="scene3d-material-row">
  <label class="scene3d-blend-name" [title]="shape.name">{{ shape.name }}</label>
  <input type="range" min="0" max="1" step="0.001"
         [(ngModel)]="shape.weight"
         (input)="scene3dSetBlendWeight(i, shape.weight)"
         class="scene3d-range">
  <input type="number" min="0" max="1" step="0.01"
         class="scene3d-short-input"
         [(ngModel)]="shape.weight"
         (change)="shape.weight = +$any($event.target).value; scene3dSetBlendWeight(i, shape.weight)">
  <button class="scene3d-blend-kf-btn"
          [class.has-kf]="scene3dBlendShapeHasKeyframe(shape.name)"
          (click)="scene3dToggleBlendShapeKeyframe(shape.name, shape.weight)"
          [title]="(scene3dBlendShapeHasKeyframe(shape.name) ? 'Remove' : 'Set')
                   + ' keyframe for ' + shape.name + ' at current frame'">◆</button>
</div>
```

Button states: grey outline = no keyframe at this frame; gold fill = keyframe exists. Matches the gold used by `kf-flash` animation on the main Record Keyframe button.

---

## Persistence

Blend shape keyframe tracks are serialized as part of `mesh.keyframeTracks` in the existing save/load path. No special handling needed in Frogmarks.

---

## Salsa API summary

```ts
sm.getBlendShapes3D(meshId): { name: string; weight: number }[]
sm.setBlendWeight3D(meshId, index: number, weight: number): void          // index-based
sm.addBlendShape3D(meshId, name: string, deltaVertices: Float32Array): number
sm.removeBlendShape3D(meshId, index: number): void

sm.setBlendShapeKeyframe3D(meshId, name, frame, weight, easing?): void   // name-based
sm.removeBlendShapeKeyframe3D(meshId, name, frame): void
sm.getBlendShapeKeyframeTracks3D(meshId):
  Record<string, { frame: number; value: number; easing?: string }[]> | null
```
