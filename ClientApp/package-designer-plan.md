# 3D UI Expansion Plan

Tracking new Salsa capabilities that need Frogmarks UI surface. Organized by effort, smallest first.

---

## Phase 1 — One-liners (single button or param)

### 1.1 Cylinder taper / cone
**What:** Expose `radiusTop` on cylinder creation so users can make cones and frustums.  
**API:** `sm.createCylinder3D(x, y, z, radius, height, radialSegments, material?, radiusTop?)`  
**Files:**
- `illustration.component.html` — add a `radiusTop` number input to the cylinder form (same pattern as the Polygon/Circle inline forms)
- `illustration.component.ts` — pass `radiusTop` through to the `createCylinder3D` call (~line 2784)

**UI:** Inline form under the Cylinder menu item. Two fields: Radius Top (default = same as base → cylinder), with 0 = cone labeled clearly. A quick-pick row: "Cylinder · Cone · Frustum" that presets the ratio.

---

### 1.2 Bevel vertex
**What:** One button in Edit-Mesh mode, vertex ops section.  
**API:** `sm.bevelVertex3D(id, vertexIndex, amount)`  
**Files:**
- `mesh-edit-panel.component.html` — add "Bevel Vertex" button alongside existing Weld in vertex ops (~line 207)
- `mesh-edit-panel.component.ts` — handler that reads `getEditSelection3D`, calls `bevelVertex3D` with selected vertex index + a drag-to-set amount

**UI:** Same style as edge Bevel (Ctrl+B). Click to activate, drag on canvas to set amount, confirm on release.

---

### 1.3 Studio lighting preset
**What:** One button that sets a good default directional + ambient light.  
**API:**
```
sm.setDirectionalLight3D(0.5, -1, -0.5, 1, 1, 1, 1.3)
sm.setAmbientLight3D(1, 1, 1, 0.5)
```
**Files:**
- `illustration.component.html` — add "Studio" button near the existing Environment / IBL section (~line 2691)
- `illustration.component.ts` — one-liner handler

**UI:** Small preset button labeled "Studio". Optionally a second preset "Cinematic" (single hard key light, deep shadow ambient 0.1) for contrast.

---

### 1.4 Fit content to artboard
**What:** Scale + center all scene objects to fill the artboard bounds. Different from the existing camera-zoom fit.  
**API:** `sm.fitContentToArtboard3D(padding?)`  
**Files:**
- `illustration.component.html` — add button near existing Fit Artboard (camera) zoom control (~line 3421). Label: "Fit Objects" to distinguish from camera fit.
- `illustration.component.ts` — handler

**UI:** Icon button in the viewport toolbar row. Tooltip: "Scale and center all objects to fill the artboard."

---

## Phase 2 — Medium panels

### 2.1 Displace modifier
**What:** Add a Displace entry to the existing modifiers panel.  
**API:** `sm.addDisplaceModifier3D(id, { strength, frequency, seed, octaves, direction })`  
**Files:**
- `mesh-edit-panel.component.html` — add Displace item to the modifier list section (~line 241–270), same add/toggle/apply/remove pattern as Subdivision and Mirror
- `mesh-edit-panel.component.ts` — `addDisplace()` handler + params object

**UI:**
```
[+ Displace]
  Strength  ────────●──  0.30
  Frequency ──●────────  2.0
  Octaves   [1][2][3][4]
  Seed      [____42____]
  Direction [X][Y][Z][XYZ]
  [Toggle] [Apply] [Remove]
```
Add a subtle hint below: "Tip: add Subdivision first for smooth results." A "Rock" quick-preset button sets strength 0.4, frequency 3, octaves 4.

---

### 2.2 Boolean CSG
**What:** Contextual toolbar when exactly 2 meshes are selected. Three ops: Union, Subtract, Intersect.  
**API:** `sm.booleanMesh3D(idA, idB, 'union'|'subtract'|'intersect', { keepOperands: false })`  
**Files:**
- `selection-toolbar.component.html` — add a "Boolean" section that appears when `selectedIds.length === 2` (check existing `*ngIf` patterns)
- `selection-toolbar.component.ts` — `runBoolean(op)` handler; after op, call `mergeByDistance3D` on result for cleanup

**UI:**
```
  Boolean  [∪ Union]  [− Subtract]  [∩ Intersect]
```
Subtract uses the second-selected mesh as the cutter (show order hint: "A − B where A = first selected"). After the operation completes, auto-select the result and run `mergeByDistance3D(id, 0.001)` for clean edges.

---

## Phase 3 — New parametric shape panels

These need new Angular components.

### 3.1 Revolve / Lathe
**What:** Create a surface of revolution by sweeping a 2D profile around the Y axis.  
**API:** `sm.createRevolve3D(x, y, z, profile, radialSegments, material?)`  
where `profile = [radius, y][]` (the silhouette curve)

**New component:** `revolve-editor/revolve-editor.component` — a small modal or subpanel  
**Files:**
- `revolve-editor.component.html` — SVG canvas showing the right half of the silhouette; user clicks to add points, drags to move, right-click to delete
- `revolve-editor.component.ts` — manages `profile: [number, number][]`; emits on change so a live preview re-calls `createRevolve3D` each time
- `revolve-editor.component.scss`
- `illustration.component.html` — add "Revolve…" to the Add Mesh menu; clicking opens the editor panel
- `illustration.component.ts` — `openRevolveEditor()` / `onRevolveConfirm(profile)`

**UI:**
```
  ┌─ Revolve editor ──────────────────────┐
  │  •─────────────•  ← drag points       │
  │  •                                    │
  │      •                                │
  │  •─────────────•  ← radius 0 = point  │
  │  Segments [8──────●─────32]           │
  │  [Cancel]              [Add to Scene] │
  └───────────────────────────────────────┘
```
Constraints: first and last point can have radius 0 (tip/point). Profile is stored on the node so the editor can reopen for editing.

---

### 3.2 Tube / Loft
**What:** Sweep a circle of varying radius along a 3D spine path.  
**API:** `sm.createTube3D(x, y, z, path, radii, radialSegments, material?)`  
where `path = [x, y, z][]` and `radii = number[]` (one per path point)

**New component:** `tube-editor/tube-editor.component`  
**Files:**
- `tube-editor.component.html` — two views: a top-down 2D view for placing spine points (XZ plane), and a side slider list for per-point radius
- `tube-editor.component.ts` — manages `path` and `radii` arrays; emits for live preview
- `tube-editor.component.scss`
- `illustration.component.html` — add "Tube…" to the Add Mesh menu
- `illustration.component.ts` — `openTubeEditor()` / `onTubeConfirm(path, radii)`

**UI:**
```
  ┌─ Tube editor ─────────────────────────┐
  │  [top-down canvas: click to add pts]  │
  │                                       │
  │  Point radii:                         │
  │  P1  ──●──── 0.20                     │
  │  P2  ────●── 0.35                     │
  │  P3  ──●──── 0.15                     │
  │  Segments [8──────●─────16]           │
  │  [Cancel]              [Add to Scene] │
  └───────────────────────────────────────┘
```
Good for: pipes, horns, branches, cables, tails.

---

## Phase 4 — Organic shapes (new §1b from 2026-08-19 writeup)

### 4.1 Metaballs
**What:** SDF blobs that smooth-fuse into organic shapes (creatures, slime, coral, clouds).  
**API:** `sm.createMetaballMesh3D(x, y, z, blobs, resolution?, material?)`  
where each blob = `{ shape, ax, ay, az, bx?, by?, bz?, radius, blend, subtract? }`  
(`b` point only used for capsule shapes — the second endpoint)

**Files:**
- `illustration.component.html` — add "Metaballs…" to the Add Mesh menu; inline quick-form with a blob list
- `illustration.component.ts` — `scene3dMetaballBlobs[]`, `scene3dMetaballResolution`, `scene3dAddBlob()`, `scene3dRemoveBlob(i)`, `scene3dAddMetaball()`

**UI:**
```
  ┌─ Metaballs ───────────────────────────────────┐
  │  Blob 1  [sphere▾]  x[0] y[0] z[0]  r[0.3]  │
  │           blend[0.3]  [subtract □]       [✕] │
  │  Blob 2  [capsule▾] a[0,0,0] b[0,.3,0] r[.2] │
  │  [+ Blob]                                     │
  │  Resolution  [──●─────  32]  Draft/Final      │
  │  [Add Metaballs]                              │
  └───────────────────────────────────────────────┘
```
**Perf note:** resolution is O(res³) — keep live-edit at ≤24, raise to 48–64 for final. A "Draft / Final" toggle swaps between two preset values.

---

### 4.2 Creature
**What:** Parametric animals — dog/cat/horse/lizard/bird/generic — with body sliders, seed randomization, and optional rigging.  
**API:** `sm.createCreature3D(params, x, y, z, resolution?, material?)`  
`params` = `{ species, bodyLength, bodyRadius, legCount, legLength, neckLength, headSize, tailLength, tailCurl, earSize, blend, roughness, eyes, rigged, seed }`

**Files:**
- `illustration.component.html` — add "Creature…" to the Add Mesh menu; inline quick-form
- `illustration.component.ts` — `scene3dCreatureParams`, `scene3dCreatureResolution`, `scene3dRandomizeCreature()`, `scene3dAddCreature()`

**UI:**
```
  ┌─ Creature ────────────────────────────────────┐
  │  Species   [dog ▾]                            │
  │  Body len  ──────●───  1.0                    │
  │  Body rad  ──●───────  0.3                    │
  │  Legs      [2][4]   Leg len  ──●────  0.5    │
  │  Neck len  ──●───────  0.3                    │
  │  Head size ──────●───  0.4                    │
  │  Tail len  ──●───────  0.4   Curl ──●──  0.3 │
  │  Ear size  ──●───────  0.2   Blend ──●──  0.3│
  │  Roughness ──────────●  0.0  [eyes ✓] [rig □]│
  │  Seed [42]  [🎲 Randomize]                    │
  │  Resolution [──●──────  32]                   │
  │  [Add Creature]                               │
  └───────────────────────────────────────────────┘
```
**Rigged toggle:** when on, the result is a SkinnedMesh with a bound skeleton — immediately poseable with the armature panel. Rigged creatures bake geometry (not params-only) so they persist as mesh data.

---

## Implementation order

| # | Item | Effort | Value | Status |
|---|------|--------|-------|--------|
| 1 | Studio lighting | ~30 min | Instant visual improvement | skipped |
| 2 | Fit content to artboard | ~30 min | Common workflow need | skipped |
| 3 | Cylinder taper / cone | ~1 hr | Fills obvious shape gap | ✓ done |
| 4 | Bevel vertex | ~1 hr | Completes edit-mesh suite | ✓ done |
| 5 | Displace modifier | ~2 hr | Unlocks rock/terrain/organic | ✓ done |
| 6 | Boolean CSG | ~3 hr | High-demand modeling op | ✓ done |
| 7 | Revolve editor | ~1 day | Unlocks vases, bottles, columns | ✓ done |
| 8 | Tube editor | ~1 day | Unlocks pipes, horns, branches | ✓ done |
| 9 | Metaballs | ~2 hr | Organic/SDF shapes | next |
| 10 | Creature panel | ~3 hr | Parametric animals + rigging | next |

---

## Notes

- All `*3D` ops are automatically undoable — no extra undo wiring needed.
- Wrap any multi-step op (e.g. boolean + mergeByDistance) in `sm.beginSceneGraphBatch3D()` / `sm.endSceneGraphBatch3D()` so it counts as one undo step.
- Subscribe to `sm.scene3d.onSceneGraphChanged` for outliner refresh — no manual wiring needed for new ops, it fires automatically.
- Revolve, Tube, Metaball, and Creature params persist for free (params-only save) — no persistence code needed. Exception: rigged creatures bake to geometry.
