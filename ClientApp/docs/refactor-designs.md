# illustration.component — extraction designs (research, 2026-10-03)

Companion to `refactor-plan.md`. Five read-only research passes designed the remaining Phase 2 splits. This file is the
condensed version: the step order for each area and the bugs each pass noticed. Everything is anchored on member
names (line numbers drift). Status markers: ✅ done, ⬜ open.

## Target: what the editor keeps

`IllustrationComponent` ends as a layout + glue orchestrator (≈1.5k TS / ≈2.5k HTML):

- Layout template: shell, canvas, top bar, toolbars, right-column tabs, child tags, loading and save banners.
- Route → `initForIllustration` dispatch (viewer / local / router state / API).
- `afterRendererBoot`: get the engine, connect services, one-time engine config.
- Cross-child glue handlers.
- A few top-level flags: `isLoading` / `loadingState` / `markLoaded`, `isViewerMode`, `isLocalMode`, `uiHidden`,
  `rightPanelTab`, `animationEnabled`.

**Rules:**

- State that persistence or several areas read goes in a **component-scoped service** (`providers` on the editor,
  like `PackageCreatorService`).
- UI-only state goes in a child component.
- Fields move with their owner. Don't wrap leftovers in state objects.
- Finish with one field-sort pass that keeps initialiser dependency order.

## Orchestrator steps

1. ✅ **B0** Make boot and teardown idempotent: `_teardownEngineSubs`, `_removeInputListeners`.
2. ✅ (lite: handler bodies are named methods; no separate service needed) **B1** `EngineEventsService`: every engine callback becomes a Subject re-entered with `ngZone.run`. This includes
   the engine-status pill. The handler bodies stay where they are.
3. ✅ (lite: real closes instead of flag flips; no registry needed) **B2** `EditorModeService`: a `register(mode, exitFn)` / `enter(mode)` registry that replaces
   `_exitAllScene3dModes` and `scene3dInSubMode`.
   - This is a behaviour change: the real exit functions run instead of flipping flags. That fixes the world panel
     skipping `exitCityMode`, and the char panel leaving hair sim and eye-draw on.
4. ⬜ **B3** `GizmoPositionService`: `claim(id)` / `release(id)` replaces the flag OR in `_updateGizmoPosition`.
5. ⬜ **B4** Smaller extractions:
   - `<app-editor-menubar>`
   - `<app-publish-share-dialog>`
   - `ArtboardOverlayService` (document size, artboard overlay, fit, resize dialog)
   - root `ThemeService` (retro theme)
6. 🟨 (lite: split into guards / ctrl / tool-key handlers + 3 bugs fixed; table open) **B5** Hotkeys become a keymap table `{ combo, when?, run }` that owners register into. Do this **last**.
7. ⬜ **B6** Field-sort pass.

## Characters (2.5) — ✅ done

- ✅ 2.5a: `utils/character-randomizer.ts`
- ✅ 2.5b: `<app-character-panel>`
- ⬜ Optional: split clothing and charms into children of the panel. Host them with `[hidden]`, not `*ngIf`, so their UI
  state survives.

## Animation / camera / cloth / play (2.7)

1. ✅ 2.7.0 Shared styles to the partial:
   - `.scene3d-details`, `.scene3d-vec3-row` / `-label`, `.scene3d-input-small`, `.scene3d-subsection-title`,
     `.scene3d-shortcut-hint`
   - `.scene3d-seg-btn`: it is **defined twice**; move both blocks, in order.
2. ✅ 2.7a Armature cleanup moves into `ArmaturePanelComponent.ngOnDestroy` (also calls `stopClip()`).
   - `closeArmaturePanel` becomes a flag flip.
3. ✅ 2.7b `<app-cloth-inspector>`:
   - Moves: re-simulate, live cloth, wind frame-link, wind zones.
   - Reloads in `ngOnChanges(meshId)`. Add `reload()` and call it from `onClothBuilderCreated`, because the id doesn't
     change when the builder rebuilds the same mesh.
4. 🟨 (helpers only; the builder's input-driven GPU lifecycle stays) 2.7c The open/apply logic moves into the existing `cloth-builder`:
   - `open(meshId?)` is added and emits `(applied)`.
   - This deletes 7 `clothBuilder*` editor fields.
5. 🟨 (the view bar is done; the service waits for a second consumer) 2.7d `SceneViewStateService` + `<app-scene-view-bar>` (view target / camera mode / fly / artboard frame / play,
   and the play-settings popover).
6. ✅ 2.7e `SceneAnimationService` + `<app-scene-camera-section>` + `<app-scene-anim-section>`:
   - The service owns: player config, keyframe tracks, cinematic cameras and cuts, locomotion.
   - The timeline inputs bind from the service.

## 3D Scene right panel (2.9)

1. ✅ A `<app-array-group-panel>` (REPEAT).
   - Inputs: group id and `scene3dMeshes`.
   - Outputs: `(editSource)`, `(baked)`.
   - The array **tool** stays in the editor.
2. ✅ B `Scene3dSettingsService` + `<app-scene-settings>`.
   - Covers PS1, lights, wind, bg, fog, post, SSAO, SSR, IBL, sky, shadows, frustum, GPU cull, grid, snap, env style.
   - It gains `snapshot()` and `applySaved(s)`, the first part of 2.8.
   - `static GPU_CULL_OPTIONS` moves with it.
3. ⬜ C `SceneSelectionService` (selection id, type flags, id sets, hierarchy).
   - `select(id)` emits a BehaviorSubject `{id, prevId, kind, seq}`.
   - The editor keeps getter proxies, so the 221 `scene3dSelectedMeshId` references compile unchanged.
4. ✅ D Inspector sections, one per step, each a verbatim slice of `scene3dSelectMesh`:
   outline → behavior → texture → blend → material → html-texture → frame-link → transform.
5. 🟨 (SceneAddService + add-mesh menu done; the tree stays) E `<app-scene-outliner>`: tree, add-mesh menu, primitive forms, boolean bar.
   - One typed `@Output() action` union for the cross-area adds.
6. ⬜ F Ribbon, after a ribbon-handle service exists.
   - UV stays in the editor (`uv-editor-panel` already exists; the rest is mode glue).

## 2D editing (2.10+)

1. ⬜ Delete dead UI.
   - The hidden `.control-panel-dark` block (about 450 HTML lines, all `display:none !important`).
   - The `#bg/dot/shapeColorPicker` ViewChilds, `handleBgColorPickerClick`, `toggleRasterTool`,
     `pushRasterSnapshot`, `setRasterBrushSize`, `showRasterControls`.
   - **Product decision first:** the palette context menu is only reachable from that hidden block.
2. ✅ Colour maths to `color-utils` (about 6 near-duplicate converters).
3. ✅ `LayerEffectsService` (dither + per-layer dither + frame link; persistence reads it) +
   `<app-layer-effects-panel>` + `<app-dither-options>`.
4. ✅ `<app-vector-layer-panel>`.
5. 🟨 (the picker is done; pen colours stay in the editor) `PenColorService` + `<app-persistent-color-picker>`.
6. ⬜ `ToolStateService`: `setActiveTool` body verbatim. Tool-specific branches become registered enter/exit hooks.
   The editor keeps getters.
7. ✅ Tool-option children, **always mounted** with `[active]` and their own `*ngIf`. Order: fill/wand, stamp,
   raster text, panel layout, balloon + text effects, live text + shader.
8. ⬜ `HotkeyService` / keymap + `<app-screencast-keys>` (same as B5).

## Persistence (2.8)

Two component-scoped services, both talking to the editor through a `PersistenceHost` adapter:

- `IllustrationPersistenceService`: lifecycle, dirty tracking, save, upload, load, thumbnails, title, sync mode, the
  save-blocked banner.
- `ProjectFileService`: `.frogmarks`, `.frogcart`, publish, viewer, `.frog` import.

**Steps:**

1. ⬜ Pure helpers. Deduplicate the 3 copies of the animation restore and the 2 copies of the raster apply-layer-props.
2. ⬜ Dirty tracking + upload.
3. ⬜ Save + subscriptions + `hasPendingWork`.
4. ⬜ Thumbnail / title / duplicate / new / sync mode / save-blocked.
5. 🟨 (moved verbatim; the split is open) Load, split into `loadLocal` / `loadFromOpfs` / `loadFromBackend` + `applyMeta`.
   - **Keep the async order exactly.**
   - Autosave subscribes only after the load.
6. ✅ `ProjectFileService`.
7. ⬜ 3D-settings ownership. This is a behaviour change, so do it on its own.
   - **Engine-owned (Salsa's `globalScene`):** projection, PS1, lighting, bg, fog, IBL, filter, post, SSAO, wind,
     shadows, snap, grid, haze, viewState, sky, ramp, toon, outlines, env, scripts, anim library, play.
   - **Frogmarks-owned:** camera cuts, can designs, frame-link buckets, groups, the 3D anim config.
   - **OPFS / local paths:** apply only the Frogmarks-owned keys, then mirror engine → UI.
   - **Cloud path:** also save and restore `getGlobalScene3DSettings()`.
8. ⬜ Fix the persistence bugs below, one at a time.

## Bugs noticed (not fixed unless marked)

**Lifecycle**

- ✅ A doc switch stacked engine handlers and DOM listeners, so hotkeys fired N times.
- ✅ `_viewStateSub` / `_playStateSub` / `_gizmoPosTimer` / `_rasterTextSub` were never released.
- ✅ `_playStateSub` ran outside the zone.
- ✅ Stray `>` after the hue-ring thumb.
- ✅ Character `_attachmentParamTimers` was never cleared.
- ✅ `loadingState` and the per-doc caches (`_dirtyLayerIds`, `_uploadedLayerIds`, `_texLibDirty`, the banner state,
  `layerDitherConfigs`, `layerFrameLinkConfigs`) are never reset on a doc switch.
- ✅ The `autoSaveService.state$` subscription leaks once per document.

**Persistence**

- ✅ Local-only docs never run a Frogmarks save. `LocalIllustration` has no `id`, so the `syncMode === 2` branch is
  dead and bg / dot / grain / dither / docSize / animation config are never saved or restored.
- ⬜ Animated layers upload the whole layer for every cel, so every frame gets identical pixels in cloud mode.
- ✅ Failed uploads are still marked uploaded. `_texLibDirty` is cleared before its upload.
- ✅ `_quickFlushOpfsMeta` writes meta without host 3D state (cuts, can designs, buckets). A refresh within about 2 s
  loses them.
- ✅ Sync-mode switching:
  - 1→0 uploads only dirty blobs, while `meshIds` lists all of them.
  - →2 isn't persisted.
  - `saveNow` saves only to OPFS.
- ✅ The OPFS path rebuilds `layerTree` from the meta's stale `sceneGraph`.
- ⬜ Cloud loads lose Salsa-only globals: sky, IBL image, toon, outlines, scripts, anim library, play, viewState.
- ✅ `.frogmarks` restore:
  - It doesn't refresh the layer tree, the raster layers or the 3D mirrors.
  - It carries no host state.
  - It doesn't mark blobs dirty.
- ✅ Rename doesn't call `autoSaveService.setDocumentName`. `frogmarksSave` names the file from the old title.
- ✅ Thumbnail problems:
  - "New" saves a thumbnail after navigating away.
  - Raster-only edits never refresh the thumbnail.
- ✅ `onRasterStrokeEnd` serializes the full scene **with raster data** on every stroke.
- ✅ Settings changes that never call `scene3dMarkDirty`: bg, fog, fog hard edge, fog horizon, enhanced, glass, aerial,
  texture filter, sky preset, IBL, SSR.
  - Check this against what Salsa persists.
- ✅ `garpCanDesigns` is restored only inside the post-processing `if`. The apply calls mark the doc dirty during load.
- 🟨 `scene3dPlayerObjectId` is never restored. `scene3dPlayCameraMode` is not saved.

**3D**

- ✅ Clicking the city row in the outliner throws: `world.syncSelectionFromOutliner` doesn't exist on WorldManager.
- ✅ The transform inspector is read only on select. After a gizmo drag, editing one axis snaps the others back.
- ✅ Submesh colours read `d[0..2]` off an `{r,g,b,a}` object and show `#NaNNaNNaN`.
- 🟨 (the inspector sections now reload on id change) Deleting the selected mesh assigns `meshes[0]` without selecting it, so the inspector shows stale values.
- ✅ Clothing paint opens the UV panel with the body id: wrong GARP target, and the inspector hides.
- ⬜ Write-only or dead state:
  - `_uvDraw` never draws.
  - `uvLayers` is never read.
  - `_instanceGroups` / `_meshGroupId` are never read or persisted.
- ✅ Change detection runs every frame from RAF loops inside the zone: the ribbon handle loop and the text-effect
  animation.
- ✅ The first HTML-texture apply ignores Transparent.
- ✅ The boolean bar uses a selection that viewport picks never update.
- ✅ `cel-hd` is missing from the `scene3dRenderStyle` union.
- ✅ Baking an array refreshes nothing.
- ✅ Hotkey `K` records a keyframe while animation is disabled.
- ⬜ `scene3dExportCinematic` is a no-op.
- ⬜ Armature:
  - Nothing calls `exitArmatureMode3D` (ask Salsa).
  - Parent-initiated closes skip `stopClip()`.

**Characters**

- ✅ The creation sliders preview on every tick: `_charPreviewTimer` is never assigned, so there is no debounce.
- ⬜ Preset lists:
  - ✅ Sock / undershirt / underpants preset lists aren't loaded on init.
  - The undershirt/underpants pattern defaults disagree between init and `initClothing`.
- ✅ `scene3dApplyClothingPreset` doesn't update the pattern UI and doesn't mark dirty.
- ✅ `scene3dImportCharacterPreset` doesn't mark dirty and doesn't refresh the expressions.
- ✅ `scene3dExportCharacterPreset` can pass a null id.

**2D / tools / keys**

- ✅ 3D shortcuts also fire 2D tool hotkeys: G grabs **and** selects fill; X toggles the UI.
  - Tool keys aren't gated by 2D/3D/vector context.
  - ✅ A focused `<select>` isn't treated as editable.
- ⬜ Clicking outside the canvas never ends live-text editing (the handler returns early).
- ✅ Double-clicking live text sets the tool without `setActiveTool`.
- ✅ Dither alpha edits mutate the shared `DEFAULT_DITHER_CONFIG` colour arrays (shallow copy).
- ⬜ Delete key:
  - ✅ It throws when `layerTree` is null.
  - It prunes the dither / frame-link maps by the wrong ids.
- ✅ The hue drag stops when the pointer leaves the ring.
- ✅ The cheatsheet and tooltips disagree with the bindings (E = Pen, "S: Section panel", swap "(X)").
  - Some keys are bound twice: Ctrl+D, Delete, Shift+O.
- ✅ `ditherRevealSubpanel` animates the first `.tool-subpanel` in the DOM, not the dither one.
- ✅ Colour setters disagree:
  - `setPenColor` doesn't set the stroke colour.
  - `onColorPickerSelection` doesn't set the raster brush colour.
- ✅ The sticky note author is hard-coded as `'Zain S.'`.
- ✅ `loadPolygonPresets` still has `(ShapeManager as any).PolygonPresets`.
