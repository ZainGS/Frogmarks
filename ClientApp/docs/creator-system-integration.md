# Free-Camera & Targets — Frogmarks UI Integration Guide

**Audience:** Frogmarks (Angular host) developers wiring the view-mode toolbar + panel visibility.
**Date:** 2026-08-23 · **Engine spec:** `salsa/docs/specs/free-camera-and-scene-targets.md` · **Sibling:** [scene-authoring.md](./scene-authoring.md).

---

## 0. The model in one line

A document has **two independent axes**: a **target** (what it produces) and a **camera mode** (how you navigate). All six combinations are valid, and switching either is **non-destructive** — it never touches the data, only what renders / which tools show / how the camera moves.

```
                CAMERA MODE →   ortho2D          perspective2D      free3D (orbit/pan/dolly + WASD-fly)
  TARGET ↓
  illustration  (X×Y output)    today's default  today's persp      2D panels hidden; artboard = render frame
  scene         (interactive)   iso view         fixed persp        game-editor view + ▶ Play
```

---

## 1. Frogmarks implementation (done)

All wiring lives in `illustration.component.ts` / `.html` / `.scss`.

### State fields (illustration.component.ts ~line 1325)

```ts
scene3dViewTarget: 'illustration' | 'scene' = 'illustration';
scene3dViewCameraMode: 'ortho2D' | 'perspective2D' | 'free3D' = 'ortho2D';
scene3d2DPanelsActive = true;    // from ViewRules.twoDToolsActive
scene3dViewFly = false;
scene3dViewIsPlaying = false;
scene3dViewArtboardFrame = true;
```

### Core method: `applyViewUI3D(rules)`

```ts
private applyViewUI3D(rules: any): void {
  this.scene3d2DPanelsActive = rules.twoDToolsActive ?? true;
  const state = (this.shapeManager as any).getViewState3D?.() ?? {};
  this.scene3dViewTarget   = state.target     ?? 'illustration';
  this.scene3dViewCameraMode = state.cameraMode ?? 'ortho2D';
  this.scene3dViewArtboardFrame = state.showArtboardFrame ?? true;
  this.scene3dViewFly = (this.shapeManager as any).isFlyEnabled3D ?? false;
}
```

Called on every `onViewStateChanged3D` event **and** once on init (so panels come up correct on first load / doc restore).

### Engine setters

```ts
scene3dSetViewTarget(t)       → sm.setTarget3D(t)
scene3dSetViewCameraMode(m)   → sm.setCameraMode3D(m)
scene3dSetArtboardFrame(on)   → sm.setArtboardFrameVisible3D(on)
scene3dSetFly(on)             → sm.setFlyEnabled3D(on)
scene3dTogglePlay()           → sm.enterPlayMode3D() / sm.exitPlayMode3D()
```

### Subscriptions (init block)

```ts
this._viewStateSub = sm.onViewStateChanged3D?.subscribe?.(() =>
  this.applyViewUI3D(sm.getViewRules3D?.() ?? {}));
this.applyViewUI3D(sm.getViewRules3D?.() ?? {});   // call once on init

this._playStateSub = sm.onPlayStateChanged3D?.subscribe?.(() =>
  this.scene3dViewIsPlaying = sm.isPlaying3D ?? false);
```

---

## 2. What shows in each cell (2×3)

| | ortho2D | perspective2D | free3D |
|---|---|---|---|
| **illustration** | 2D panels ✅ + 3D panels ✅, locked ortho cam | same, perspective | **2D panels hidden**, 3D panels ✅, free orbit, artboard-frame outline optional |
| **scene** | 3D panels ✅, locked ortho ("iso") cam | 3D panels ✅, fixed persp | 3D panels ✅, free orbit — game-editor view |

**Key rule:** 3D object tools (Add-Mesh, gizmos, modifiers, UV-paint) **always stay visible** — only the 2D raster/vector panels toggle via `scene3d2DPanelsActive`. There is intentionally no `threeDToolsActive` flag.

---

## 3. Panel visibility gates (HTML)

Three `*ngIf` conditions updated to add `&& scene3d2DPanelsActive`:

```html
<!-- Raster layers right panel -->
<div *ngIf="rasterLayers?.length > 0 && scene3d2DPanelsActive" class="raster-layers-inline">

<!-- 2D left-side tools -->
<div class="tools-2d" *ngIf="tools2dVisible && scene3d2DPanelsActive && !activeVectorLayerId">

<!-- Vector tools -->
<div class="tools-vector" *ngIf="!!activeVectorLayerId && tools2dVisible && scene3d2DPanelsActive">
```

---

## 4. Top toolbar — camera mode bar

A `<div class="scene-view-bar">` appears in `.top-toolbar-right` when `has3DScene`:

- **3-way camera segmented control** — 2D Ortho / 2D Persp / 3D Free → `scene3dSetViewCameraMode()`
- **2-way target segmented control** — Illus / Scene → `scene3dSetViewTarget()`
- **⬜ Artboard frame** — icon button, shown only in illustration × free3D → `scene3dSetArtboardFrame()`
- **🛩 Fly** — icon button, shown only in free3D → `scene3dSetFly()`. WASD/E/Q, Shift boost; aim by orbit-drag.
- **▶ / ⏹ Play** — shown only in scene target. Flips ▶↔⏹ via `onPlayStateChanged3D`.

SCSS classes: `.scene-view-bar`, `.scene-view-seg`, `.scene-view-btn`, `.scene-view-icon-btn`, `.scene-view-play-btn` (`.playing` modifier for red stop state).

---

## 5. Engine API quick-reference

| Call | Effect |
|---|---|
| `sm.setCameraMode3D('ortho2D' \| 'perspective2D' \| 'free3D')` | Switches camera. Fires `onViewStateChanged3D`. |
| `sm.setTarget3D('illustration' \| 'scene')` | Switches doc target. Fires the event. |
| `sm.setArtboardFrameVisible3D(on)` | Show/hide artboard safe-frame in free3D. |
| `sm.getViewState3D()` | `{ target, cameraMode, showArtboardFrame, … }` |
| `sm.getViewRules3D()` | Derived `ViewRules` — drive all UI off this. |
| `sm.onViewStateChanged3D` | Fires on any target/camera/frame change + on doc restore. |
| `sm.setFlyEnabled3D(on)` / `sm.isFlyEnabled3D` | Editor WASD-fly (free3D only). |
| `sm.enterPlayMode3D()` / `sm.exitPlayMode3D()` / `sm.isPlaying3D` | Play mode (scene target). |
| `sm.onPlayStateChanged3D` | Fires on play enter/exit. |

**`ViewRules` fields used by UI:**

| Field | Used for |
|---|---|
| `twoDToolsActive` | Show/hide 2D panels (`scene3d2DPanelsActive`) |
| `projection` | Projection indicator (informational) |
| `outputIsArtboard` | Gates Export mode + Play slot |
| `artboardFrame` | Whether artboard safe-frame should be on |
| `freeNavigation` / `unclampCamera` | Cursor hints (informational) |

---

## 6. Persistence

Automatic — `onViewStateChanged3D` fires during doc restore, so `applyViewUI3D` runs and panels/toolbar come up correct. Back-compat: old docs load as `illustration / ortho2D`.

---

## 7. Not yet wired (future phases)

- P2: WASD-fly mouse-look, per-illustration scene camera persistence, "outside frame" cue for objects beyond the artboard
- P3: Physics/collision, scene-state snapshot on Play, input focus/Escape handling for play mode
- P4: Vectors-in-world (billboard/decal system)
