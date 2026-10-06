# OnPush change detection for the heavy editor panels — plan

Status: **not started** (written 2026-10-06). Goal: cheaper change detection, mostly for phones.
Related: `architecture-audit-2026-10-04.md` (Phase 5.4), `ClientApp/src/app/illustrate/ARCHITECTURE.md`.

## Why

Every async event in the editor (an engine callback, a timer, a promise, a click anywhere) runs Angular change
detection over the **whole** editor tree, including each open panel's template: Character (~3k template lines across
its sections), Armature (~900), City (~1k), the timeline. With `ChangeDetectionStrategy.OnPush`, a panel is skipped
unless something marks it dirty. On a phone's slower CPU this is the main-thread cost that's left after the
zone fixes already made (preview / poll timers moved outside the zone; window resize/scroll listeners too).

**Measure first.** Chrome remote debugging on an Android phone → Performance → record ~5 s in the editor with the 3D
view and a panel open. If most of the frame is "Scripting" inside Angular's `detectChanges` / template functions, this
plan pays off. If it's GPU / "Rendering", it won't help much; look at Salsa's mobile tier instead (SSAO / SSR).

## How OnPush behaves (the rules this plan relies on)

An OnPush component is re-checked only when:
1. one of its `@Input()` references changes (not an in-place mutation of an input object / array);
2. a DOM event fires in its template **or any descendant's** (clicks, `ngModelChange`, inputs: this covers all the
   normal "user edits a control" paths);
3. an `async` pipe in it emits;
4. code calls `cdr.markForCheck()` (marks it + ancestors for the next pass) or `cdr.detectChanges()` (checks it now).

So the bugs OnPush introduces are always the same kind: **a value changed by something that is not 1–3, and the
screen shows the old value until the next click in that panel.** Never a crash.

## Approach

- **Boundary = each panel's root component only.** Child components inside a panel (character `sections/*`, colour
  pickers, …) stay `Default`: they're checked whenever their OnPush parent is. One place per panel to mark.
- Each panel gets one helper, used everywhere below:
  ```ts
  constructor(private cdr: ChangeDetectorRef, ...) {}
  /** State changed outside an input / a template event (engine callback, timer, promise, the editor): re-render. */
  refresh(): void { this.cdr.markForCheck(); }
  ```
  Panel-scoped services reach it through their host (`'refresh'` added to the host `Pick`), as armature's services
  already do with `host.cdr`.
- **Not the editor component.** It's the hub every async path goes through; OnPush there is a different, much bigger
  project. The gain comes from the panels being skipped when the editor re-renders.
- One panel per commit, each with a browser pass (below). Reverting a panel = deleting one line
  (`changeDetection: ChangeDetectionStrategy.OnPush`).

## Checklist for every panel

1. Add `changeDetection: ChangeDetectionStrategy.OnPush` and the `refresh()` helper.
2. Find every write to panel / service state that is **not** directly inside a template event handler, and add
   `refresh()` after it:
   `subscribe(` · `setTimeout(` / `setInterval(` · `requestAnimationFrame(` · `.then(` / after `await` · engine
   callbacks (`onPlaced`, `onSceneGraphChanged`, …) · `ngZone.run(() => {})` used only to trigger detection.
3. Find the editor's calls **into** the panel (`@ViewChild` reach-ins) that change its state; call `refresh()` at the
   end of each such panel method.
4. Template method calls that read live **engine** state (not panel fields) — they only re-run when the panel is
   checked. Make sure whatever changes that engine state also calls `refresh()`.
5. Inputs: confirm the editor **reassigns** object / array inputs rather than mutating them in place.
6. `npm run check`, `npm run test:ci`, then the panel's browser pass.

## Per panel (order = risk, lowest first)

Line numbers are as of 2026-10-06; search by the symbol if they've moved.

### 1. mesh-edit-panel, building-panel — trivial
- No async writes in either. Inputs are primitives / ids, handled in `ngOnChanges`.
- Check: does either template show values changed by **viewport** interaction (e.g. a selection count updated when
  you click vertices)? If so, the editor's handler for that interaction must call the panel's `refresh()`.
- Browser pass: mesh edit — select / knife tool, switch tools, exit; building — select a building, change params.

### 2. ui-system-panel — small
- Preview loop (`_startUiTick`, ~l.492) already runs outside the zone and only calls the engine: no change.
- Editor reach-ins: `uiPanel.onStateChange(e.toState)` (editor ~l.831, from `onUIEvent`) and `uiPanel.uiRefreshLayers()`
  (editor ~l.1394, ~l.1403; persistence service ~l.988) → call `refresh()` at the end of both methods.
- Template methods `uiGetState(` / `uiGetVariable(` / `uiTransitionsFrom(` … read the panel's kit data (refreshed by
  the two methods above) — covered by them.
- Input `rasterLayers`: confirm the editor reassigns `editorState.rasterLayers` (not push / splice).
- Browser pass: preview on, trigger a state change in the preview, the state list highlight follows; add / remove a
  layer while the panel is open.

### 3. world-panel (City) — small
- Perf readout poll (`_perfStartPoll`, ~l.513): `this.ngZone.run(() => { })` → `this.ngZone.run(() => this.refresh())`.
- Stream stats poll (~l.953): same change.
- `_worldDebounce` (~l.1006): check whether its callback writes panel fields; if so `refresh()`.
- Editor reach-ins: `worldPanel.onOpen()`, `worldPanel.syncCityStyleFromEngine()` (writes many fields),
  `worldPanel.worldParams` (read only) → `refresh()` at the end of the first two.
- Template methods `worldStyleLabel(` / `worldGradeTintHex(` … read panel fields: fine.
- Browser pass: open City (fields show the city's saved look), Presets apply, Performance live readout ticks,
  streaming stats update while flying the camera, Regenerate.

### 4. animation-timeline — medium
- Nine `animService.*$` subscriptions (~l.564–572) assign fields: add `refresh()` in each (or one `merge(...)` of them
  with a single `refresh()`). `currentFrame$` fires every frame during playback — `markForCheck` is cheap, that's fine.
- Inputs `mesh3dAllTracks` / `cameraCuts` / `cameraNodes`: the scene-animation service **reassigns** them (verified) —
  OK. `cameraPreviewOn` is a boolean — OK.
- `editorState.playing` is read in a keydown handler only (not the template) — OK.
- Template methods (`getCelAtFrame(`, `isCelStart(`, `hasAnyKeyframeAt(` …) read service state that arrives through
  the subscriptions above — covered.
- Browser pass: play / pause / scrub (playhead and frame number move), add / delete cels, onion skin toggle, loop mode,
  play range, 3D keyframe tracks appear when keys are added in the viewport, camera cuts.

### 5. character-panel — medium
Boundary: `CharacterPanelComponent` only (sections stay Default). Services get `'refresh'` in their host `Pick`.
- `char-charms.service`: both `onPlaced` callbacks (~l.109, ~l.141) refresh the attachment list and open the new
  charm's view → `this.host.refresh()` at the end. `_attachmentParamTimers` (~l.269): check if the callback writes state.
- `char-look.service` ~l.181: `setBodyParams3D(...).then(() => this._syncCharScale(id))` writes the scale / height
  fields → `refresh()` in the `then`.
- `char-face.service` ~l.122 (rAF) and ~l.236 (eye param timer): check whether the callbacks write fields shown in the
  template (expression list, eye maps) → `refresh()` if so.
- `char-clothing` / `char-hair` debounce timers (~l.206–246, ~l.108): these push params to the engine; add `refresh()`
  only if a callback writes panel state (e.g. reads back presets / pattern).
- Loader: `scene3dInitBodyParams()` runs from `ngOnChanges` (input change → fine) **and** from the menu button (click →
  fine). `_syncCharEquipState` runs from `ngOnChanges` (`generated` input) → fine.
- Editor reach-in: `charPanel.charms.scene3dEndPlacePick()` (editor `onEsc`) → `refresh()`.
- Drill-down nav (`cp.nav`, `SubNav`): opened by clicks → fine; `_openCharm` from `onPlaced` → covered above.
- Browser pass: every menu section opens and edits live; Generate character (all sections show the new values);
  place a charm by pick (its view opens), draw a chain; eye states: add, Edit › Iris, procedural slider changes;
  Face kit toggle; body scale / fit to city updates the height read-out.

### 6. armature-panel — medium (partly ready)
- Already has `cdr`; `arm-anim` / `arm-library` already call `host.cdr.markForCheck()` (~l.185, ~l.245, ~l.257,
  ~l.387) and the 12 fps preview uses `detectChanges()` (~l.400) — all correct under OnPush.
- Scene-graph subscription (`armature-panel` ~l.133) → `refreshAll()` etc. → add `refresh()` at the end of the callback.
- `arm-anim` over-idle poll (~l.167) re-enters the zone to `_endOverIdle()`, which already marks — OK.
- NLA / clip players: if `isPlaying` / playhead fields are updated from engine callbacks, mark there.
- Browser pass: create skeleton, place joints (viewport clicks update the joint list — that's the scene-graph sub),
  select joint in viewport (selection follows), IK, bind, weight paint, record clip, play / play over idle (Play button
  resets when it ends), NLA play, global library preview animates, retarget, spring chains.

## Done when

- The six panels are OnPush, each with its browser pass done.
- A remote-profiler recording on a phone shows the panels' template functions gone from frames where nothing in them
  changed (e.g. timeline playback with the Character panel open: Character should not be checked each frame).
- `ARCHITECTURE.md` gets a short "OnPush panels" rule: *state changed outside an input or a template event → call the
  panel's `refresh()`*, plus the list of OnPush panels.

## Possible follow-ups (not in this plan)

- Smaller leaf panels (mesh inspector sections, tool options) — cheap, but small templates; low gain.
