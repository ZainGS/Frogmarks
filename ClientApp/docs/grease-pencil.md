# Grease Pencil — Integration Reference

## Overview

Grease Pencil (GP) lets users draw 2D strokes anchored to 3D mesh surfaces. It has its own object/layer model separate from the main Salsa layer system.

Component: `app-grease-pencil-panel` (`grease-pencil-panel.component.ts`)

## Data model

```
GpObject (gpId)
  └── GpLayer[] (layerId)
        └── strokes per frame
```

- A **GP object** can be paired with a skeleton (`skeletonId`) so strokes deform with the rig.
- Each **layer** has `visible`, `opacity`, and a list of strokes keyed by frame number.
- A **draw plane** (`GpDrawPlane`) is picked from the 3D viewport by hovering over a mesh face. It specifies `meshId`, `triangleIndex`, and an `offset` (world-space float, default 0.003) that lifts the stroke above the surface.

## Activation lifecycle

```ts
ngOnInit → sm.enterGpFaceSelectMode3D()   // user hovers mesh to pick draw plane
ngOnDestroy → sm.exitGpDrawMode3D()       // clean up on panel close
```

Draw plane poll runs at ~10 Hz via `setInterval`:
```ts
this.gpDrawPlane = sm.getGpDrawPlane3D?.() ?? null;
```

When the user clicks a face in the viewport, `gpDrawPlane` becomes non-null and drawing is enabled (`canDraw === true`).

## Stroke settings (GpDrawSettings)

| Field | Type | Description |
|---|---|---|
| `gpId` | `string \| null` | Active GP object |
| `layerId` | `string \| null` | Active layer |
| `tool` | `'draw' \| 'erase'` | Current tool |
| `color` | `{r,g,b,a}` | Stroke color (0–1 floats) |
| `width` | `number` | World-space stroke width (default 0.02) |
| `strokeOpacity` | `number` | 0–1 |
| `filled` | `boolean` | Fill closed strokes |
| `fillColor` | `{r,g,b,a}` | Fill color |
| `parentJoint` | `string` | Bone name for stroke parenting |
| `closed` | `boolean` | Auto-close stroke path |
| `eraserRadius` | `number` | World-space eraser radius |
| `frame` | `number` | Animation frame |

These are emitted via `drawSettingsChange` on every change so the parent illustration component can pass them to the active GP draw tool.

## Salsa API

```ts
// Mode lifecycle
sm.enterGpFaceSelectMode3D(): void
sm.exitGpDrawMode3D(): void

// Draw plane
sm.getGpDrawPlane3D(): GpDrawPlane | null   // poll to detect face pick

// GP objects
sm.createGpObject3D(name: string, skeletonId?: string): GpObject
sm.renameGpObject3D(gpId, name): void
sm.deleteGpObject3D(gpId): void
sm.getAllGpObjects3D(): GpObject[]
sm.setActiveGpObject3D(gpId): void
sm.pairGpWithSkeleton3D(gpId, skeletonId): void
sm.setGpRenderOrder3D(gpId, order: number): void

// Layers
sm.addGpLayer3D(gpId, name): GpLayer
sm.renameGpLayer3D(gpId, layerId, name): void
sm.deleteGpLayer3D(gpId, layerId): void
sm.getGpLayers3D(gpId): GpLayer[]
sm.setActiveGpLayer3D(gpId, layerId): void
sm.setGpLayerVisible3D(gpId, layerId, visible): void
sm.setGpLayerOpacity3D(gpId, layerId, opacity): void  // 0–1
sm.moveGpLayerUp3D(gpId, layerId): void
sm.moveGpLayerDown3D(gpId, layerId): void

// Joints for layer parenting
sm.getJointNames3D(skeletonId?): string[]

// Draw plane offset
sm.setGpDrawPlaneOffset3D(gpId, offset): void
```

## Parent component wiring

`illustration.component.ts` listens to `(drawSettingsChange)` and routes it to the active pointer-tool handler so strokes are drawn using those settings on the correct GP object + layer + frame.

`(closeRequest)` from the panel sets a flag to hide it and exits GP draw mode.
