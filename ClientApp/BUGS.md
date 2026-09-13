# Bug Backlog — Illustration Component

Identified 2026-09-13 via automated audit of `illustration.component.ts` / `.html`.

---

## Tool Logic

- [ ] **#1 — `drawing:eraser` never properly disabled**
  `enableRasterClearEraserTool()` is called on activation, but deactivation calls `disableRasterTool()` (wrong API). `disableRasterClearEraserTool` is never called anywhere. Eraser mode may persist in the engine after switching away.

- [ ] **#2 — Keyboard shortcuts unintentionally toggle off the active tool**
  The toggle guard added to `setActiveTool` applies to all callers including hotkeys. Pressing `b` while brush is active now deactivates it instead of being idempotent. Toggle should only apply to toolbar button clicks.

- [ ] **#3 — `setActiveTool('')` runs all disable calls even when nothing is active**
  When called with `''` (from `selectCursor`, `selectRasterLayer`, `openEphemeraPanel`) the toggle guard is skipped (falsy input), and every `disableXxx()` fires unnecessarily — including `_disableRasterText()` unsubscribing its observable, `rasterSelectionService.disable()` tearing down overlays, etc.

- [ ] **#4 — `toggleRasterTool()` bypasses `setActiveTool` entirely**
  Directly mutates `controlPanelActiveTool` without calling `setActiveTool`, so any previously active tool (e.g. `raster:brush`) never gets its disable path run — leaves stale engine state.

- [ ] **#5 — Double-clicking a live-text node bypasses `setActiveTool`**
  `onDblClick` directly sets `controlPanelActiveTool = 'live-text'` without calling `setActiveTool`. Previously active tool (e.g. brush) is never disabled in the engine — both can be simultaneously active.

- [ ] **#6 — `selectionToolSubscription` directly mutates `controlPanelActiveTool`**
  Switching rect/ellipse/lasso selection mode sets the property directly instead of going through `setActiveTool`, bypassing all current and future side effects.

- [ ] **#7 — `enableLineDrawing()` called twice when arrow tool activates**
  Once via ternary (~line 10213) and again in the dedicated arrow block (~line 10245). If the engine registers listeners per call, they'd be doubled.

- [ ] **#8 — `setPreviewShapeSelected(null, event!)` called with `undefined` at runtime**
  `event` is optional and often absent (keyboard triggers, layer switches), but `event!` asserts non-null. If `setPreviewShapeSelected` dereferences the event argument it throws.

- [ ] **#9 — `selectRasterLayer()` clears ALL tools on every layer switch — too aggressive**
  Switching between raster layers deactivates whatever tool is active. Switching vector layers only clears incompatible tools. A user with `raster:brush` active must reselect it after every raster layer switch.

---

## Panel Visibility

- [ ] **#10 — `polygon:freeform`, `arrow`, `shape:*` not cleared when leaving a vector layer**
  `onVectorLayerSelected(null)` only clears `drawing:*`, `raster:*`, and `fill` tools. Vector-only tools stay active (and their hint panels stay visible) after switching to a raster layer.

- [ ] **#11 — Ephemera panel missing `!uiHidden` guard**
  Pressing H to hide the UI leaves the ephemera panel visible. Every other fixed overlay gates on `!uiHidden`.

- [ ] **#12 — Ephemera panel stays open when entering 3D scene mode**
  `onScene3dSelected(true)` never clears `showEphemeraPanel`, and `activeVectorLayerId` is never cleared by 3D scene selection, so the ephemera panel floats over the 3D viewport.

- [ ] **#13 — UV Editor missing `!uiHidden` guard**
  Same as #11 — pressing H leaves the UV editor panel visible.

- [ ] **#14 — UV Editor never auto-closes on layer switch**
  Switching from a 3D mesh to a vector or raster layer leaves the UV editor open with a stale/empty mesh reference.

- [ ] **#15 — Vector shapes panel and 3D scene panel can appear simultaneously**
  `activeVectorLayerId` is never cleared when entering 3D mode. With `rightPanelTab === 'scene'`, both the Vector shapes section and the 3D scene section render at the same time in the right panel.

- [ ] **#16 — Old shape color-palette toolbar panel still present — double-panel when shape tool is active**
  The legacy `shape-subcontrol-panel` (color swatches inline in the toolbar) was not removed when the new compact floating subpanel was introduced. Both render simultaneously. Also missing `!scene3dPanelVisible` guard.

- [ ] **#17 — `pen-subcontrol-panel-dark` and `stamp-subcontrol-panel-dark` missing `!scene3dPanelVisible`**
  These inline toolbar panels can render alongside the 3D viewport if `scene3dPanelVisible` is set without clearing `controlPanelActiveTool`.

- [ ] **#18 — Stamp tool renders in two panels simultaneously**
  The old inline `stamp-subcontrol-panel-dark` and the shared floating `tool-subpanel` both show stamp content when stamp is active — left un-reconciled by the compact panel refactor.
