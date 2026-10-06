# Salsa Feature Tracker

Phase/spec status and Frogmarks UI work still needed.
Update this file as Salsa ships and as we wire things up.

> **Status check 2026-10-04 (dist vs code).** `@zaings/salsa` is `file:../../../salsa`, so the host reads `salsa/dist/`.
> The dist was rebuilt **2026-10-04 03:20**. Every "needs a Salsa dist rebuild; until then no-op / empty / hidden" note
> up to and including *Hair styles part 1*, *District palette* and *Character scale* is stale: the APIs are in the dist →
> **browser check pending** only (incl. the HLOD default + fly fixes). **Still needs a dist rebuild:** Roof equipment
> (`setRoofEquipment`), Landing dust / Idle variety (`setPlayLandingDust3D`, `setPlayIdleVariety3D`), Anime head
> (`headShape`) + hair styles part 2 (15 styles total), the energetic run + jog, P22 tile landing, clothing fit round 2
> (in progress in Salsa). **Engine-only perf A/Bs with no host UI** (P16 `setStreamHitchOptions3D`, P19
> `world.setStreamMotion` + optional impostor ring `setStreamHlod({ ring })`, P20 `world.setLighterTiles`, P21
> `setShaderVariants3D`, P22 `world.setTileLanding`): nothing to wire. File moves since the entries were written: perf / sim
> / step-3 → `world-panel.component.ts`, stats HUD → `scene-stats.service.ts`, device banner → `engine-status.service.ts`,
> fog / shadow quality → `scene3d-settings.service.ts` / `scene-render-settings.component.html`, No fog →
> `mesh-material-section.component.ts`. Salsa-side index: `salsa/docs/STATUS-2026-10-04.md`.

---

## Phase 1 — Retro Text Effects (Salsa: DONE · Frogmarks UI: DONE)

> ✅ Verified 2026-09-28: both effect chains carry the Outline color/offset/gap, Glow color,
> and Feather blocks (illustration.component.html ~10433 and ~10775). Section kept for the
> param-name mapping table below; no work remains.

### What Salsa built

- **Outline**: added `offset: [dx, dy]` (drop-shadow shift) and `gap` (transparent space between glyph and stroke). `color` already existed. `gap:0, offset:[0,0]` is pixel-identical to before.
- **Feather** (new): `mode: 'linear' | 'radial'`, `angle`, `start`, `end` — directional/radial alpha fade. `defaultFeather()` re-exported from ShapeManager.
- **Glow**: already had `glowColor`. No new salsa work needed.

### Frogmarks UI still needed

Both effects chains need updating — there are **two** in `illustration.component.html`:
1. **Live Text tool panel** (~line 3907) — uses `onLiveTextEffectParamChange`
2. **Text Effects standalone panel** (~line 4220) — uses `onTextEffectParamChange`

Make the same changes to both.

#### Outline block (currently only has Thickness)
Add after the existing Thickness row:
- `Color` — `<input type="color">` bound to `entry.params['color']`
- `Offset X` — range slider, min `-10`, max `10`, step `0.5`, bound to `entry.params['offsetX']` (salsa stores as `offset[0]`)
- `Offset Y` — range slider, min `-10`, max `10`, step `0.5`, bound to `entry.params['offsetY']` (salsa stores as `offset[1]`)
- `Gap` — range slider, min `0`, max `5`, step `0.5`, bound to `entry.params['gap']`

#### Glow block (currently has Radius + Intensity)
Add:
- `Color` — `<input type="color">` bound to `entry.params['glowColor']`

#### Feather block (new — not in the panel at all yet)
1. Add `{ value: 'feather', label: 'Feather' }` to `TEXT_EFFECT_TYPE_OPTIONS`.
2. In `createEffectEntry` factory: for `'feather'` case, spread `defaultFeather()` from ShapeManager.
3. Coerce missing optional fields on open: `entry.params.offset ??= [0,0]; entry.params.gap ??= 0;`
4. Add the UI block:
   - `Mode` — toggle buttons: `linear` / `radial`, bound to `entry.params['mode']`
   - `Angle` — range slider, min `0`, max `360`, step `1` (degrees; only shown when `mode === 'linear'`)
   - `Start` — range slider, min `0`, max `1`, step `0.01`
   - `End` — range slider, min `0`, max `1`, step `0.01`

---

## Phase 2 — Ephemera Kit + Blend Mode (Salsa: IN PROGRESS)

### What Salsa built (increment 1)
- `EphemeraPlacement.blendMode?: GlobalCompositeOperation` — applied in both live overlay and rasterize burn-in paths. Serializes for free.
- Set via: `updateEphemeraPlacement(layerId, placementId, { blendMode: 'multiply' })`
- Two new generators (auto-appear via `getEphemeraCategories()` / `getEphemeraGeneratorsByCategory()`):
  - `worn-edges:standard` — torn borders, fold creases, scuffs/dust. Params: style, wear (0–1), foldCount, color, seed. Use full-canvas + multiply (dark damage) or screen (light dust).
  - `media-icons:format` — MiniDisc / cassette / CD / cartridge / floppy flat-vector glyphs. body + accent color params.

### Frogmarks UI done
- `EphemeraPlacement` interface: added `blendMode?: string`
- Ephemera panel: Blend Mode dropdown in Place section (sets `placeBlendMode`) and edit block (sets `editBlendMode`)
- `placeCurrent()`: passes `{ blendMode: this.placeBlendMode }` as options bag to `addEphemeraPlacement`
- `startEdit()`: reads `p.blendMode ?? 'source-over'` into `editBlendMode`
- `commitEdit()`: passes `{ params, blendMode: this.editBlendMode }` to `updateEphemeraPlacement`
- Options: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn

### Ephemera glow/feather — DONE (Salsa + Frogmarks)
- `decorateEphemeraSvg(svg, glow?, feather?)` in `svg-effects.ts`
- `EphemeraPlacement` now has `glow?: EphemeraGlow | null` and `feather?: EphemeraFeather | null`
- Edit block: Glow (checkbox + radius/color/opacity), Feather (checkbox + mode toggle + start/end + angle for linear)
- `commitEdit()` builds glow/feather objects from UI state and passes to `updateEphemeraPlacement`
- **Caveat:** glow expands beyond SVG viewport — clips on full-canvas overlays (worn-edges, scanlines) where glow isn't useful anyway. Fine on icons/badges/seals which have internal margin.

### Full generator list (all auto-surface, no custom UI needed)
| typeId | Highlights |
|---|---|
| `worn-edges:standard` | torn frame, creases, scuffs; style, wear, foldCount, color, seed |
| `media-icons:format` | MiniDisc/cassette/CD/cartridge/floppy; body + accent colors |
| `holo-seal:standard` | iridescent gradient, scalloped edge, shine, center text |
| `badge:standard` | starburst/circle/seal/ribbon; PROMO, 1ST EDITION, SALE etc. |
| `memphis:confetti` | scattered geometric field; 4 palettes, seeded |
| `halftone:dots` | grid + density gradient + angle |
| `scanline:crt` | scanlines + vignette + screen sheen |
| `rainbow-strip:standard` | OBI bar, smooth/banded, H or V (wide non-square SVG) |
| `wireframe:solid` | cube/pyramid/octahedron, rotX/rotY |

**Usage notes:**
- `worn-edges`, `scanline`, `halftone` → place full-canvas + blendMode `multiply` (dark) or `screen` (light)
- `rainbow-strip` → `getDefaultPlacementSize` returns correct wide proportions automatically
- `worn-edges`, `memphis` → expose `seed` param for reproducible looks

---

## Backdrop Squiggles — 3D Wireframe Style (Salsa: DONE 2026-06-25)

### What Salsa built

- Launcher home decoration squiggles (drawn when `!inGrid`) now support a **3D wireframe tube** style alongside the original flat riso ribbons.
- Shader: `squigUV()` marches the same centreline, maps cross offset → tube angle via `asin` (longitudinal lines bunch at silhouette = round read), draws dense cross rings (`u*40`) + longitudinal lines (`ang01*8`), shaded `crest=sqrt(1-vN²)` (bright centre → dark edge). No `fwidth` — uses derivative-free AA grid lines.
- Toggle is a uniform `if (g.squiggle.w > 0.5)` — repurposed the unused `squiggle.w` slot (was theme alpha, always 1). No struct changes, nothing else moved.
- **Default = wireframe.**
- API: `shapeManager.setShellSquiggleStyle('wireframe'|'flat')` / `getShellSquiggleStyle()`. Choice survives leaving/re-entering the shell (persists in `ShellUIManager.squiggleWire`). Toggle picked up next rAF frame, no rebuild.
- Tune knobs in one place: ring count 40, longitudinal 8, tube radius `th*1.35`, line half-width 0.05.
- Pink/yellow blob left as-is (squiggles only).

### Frogmarks UI still needed

None required — default is wireframe. If we ever want a style picker in the dashboard (e.g. "Background style: Wireframe / Flat ribbons"), call `shapeManager.setShellSquiggleStyle(...)` from there.

---

## Package Designer (Salsa: DONE 2026-06-26 — Frogmarks: NOT STARTED)

> Status 2026-10-04: Frogmarks is **IN PROGRESS**, not "not started" — `package-designer/package-editor/package-editor.component.ts`,
> the `packaging/local/:id` + `packaging/:id` routes (`app.module.ts`) and `dashboardKind` routing (`studio.component.ts`)
> exist. Audit the checklist below against them.

### What Salsa built ✅
- Shell tile + packages sub-dashboard with "+ New Product Packaging" tile
- `sm.packaging.*` API: `create / setDimensions / fold / unfold / setFoldAmount / setDielineLayer / exportDielinePng / get / getAll / remove`
- Kraft-brown 3D box mesh; live-texture via `LiveTextureMode`; dieline PNG export
- All gated by `PACKAGING_ENABLED` — `sm.packaging` is `null` when off
- Key insight: flat dieline and folded box are the **same mesh** — `setFoldAmount(0)` = flat, `setFoldAmount(1)` = box (one canvas, fold scrub is the view toggle)

### Frogmarks work needed 🟦
Full spec in [package-designer-plan.md](package-designer-plan.md). Summary:
- `kind?: 'packaging'` on `LocalIllustration` + `create(name, kind?)` update
- `studio.component.ts`: route by `dashboardKind` in `onActivate`, pass `kind` in `listProjects`, add `_initiateNewPackagingProject()`
- `app.module.ts`: add `/packaging/local/:id` + `/packaging/:id` routes
- `illustration.service.ts`: extend `IllustrationStateDto` with optional `packaging?: PackagingStateDto`
- New `PackageEditorComponent`: sliders → `setDimensions`, fold scrub, guide overlay canvas, stroke-end → `syncLiveTextures3D`, OPFS save/load

### API key points
```ts
// onActivate event shape
interface ShellActivateEvent {
  id: string;
  kind: 'system' | 'project' | 'empty' | 'local' | 'remote';
  dashboardKind?: 'illustration' | 'packaging';
}
// createProject(name) does NOT receive dashboardKind — read it from the event
```

---

## Phase 3 — Arc Text (Salsa: NOT STARTED)

Spec file: `arc-text.md` (in Salsa repo)

Approach: quad-warp (not SVG textPath) so inline editing survives.

Frogmarks UI needed (TBD):
- Arc radius slider
- Direction toggle (top arc / bottom arc)
- Offset along arc

---

## Param key reference (confirm with Salsa)

| Effect   | Param        | Expected key in `entry.params` |
|----------|-------------|-------------------------------|
| outline  | thickness    | `thickness`                   |
| outline  | color        | `color`                       |
| outline  | offset       | `offset` as `[number, number]` — bind to `[0]` and `[1]` |
| outline  | gap          | `gap`                         |
| glow     | radius       | `radius`                      |
| glow     | intensity    | `intensity`                   |
| glow     | color        | `glowColor`                   |
| feather  | mode         | `mode`                        |
| feather  | angle        | `angle`                       |
| feather  | start        | `start`                       |
| feather  | end          | `end`                         |

---

## Engine asks from the `as any` burn-down (2026-09-28)

Context: removed all 630 `(shapeManager as any)` casts from `illustration.component.ts` and
typechecked against the real facade. Compile is green. These are the **engine gaps** the pass
exposed — each has a `TODO`/`PHANTOM`/`NOTE` comment at the call site in `illustration.component.ts`.

### Missing getters (host sync-back is impossible today)
- [ ] `getHtmlTexture3D(meshId)` — counterpart to `setHtmlTexture3D`. Without it, re-selecting an
      HTML-textured mesh cannot repopulate the editor (content field comes back empty).
- [ ] Decal param getters (size / rotation) — `setDecalSize3D`/`setDecalRotation3D` exist but the
      panel can't read current values back (`getDecalParams3D` was a phantom).
- [ ] `isCDKit3D(nodeId)` facade — Frogmarks currently peeks at `worldParams.kind === 'cdkit'`
      via `getNodeById`; a real facade method would be cleaner.

### Missing capabilities
- [ ] Mesh/outliner **reorder** API — the outliner ↑↓ arrows have no engine backing
      (`moveLayerUp3D`/`moveLayerDown3D` never existed; now an explicit console.warn stub).
- [ ] `createCylinder` **radiusTop** (cone/frustum) — the "Radius top" control was silently dropped
      (engine signature has no such param). *(2026-10-04: engine DONE — `createCylinder3D(..., radiusTop?)`, in the dist;
      host wiring pending at `scene-add.service.ts` TODO.)*
- [ ] Magic wand **`mode`** option — host sends it, engine options are only
      `{tolerance, contiguous, referenceLayerId}`; the Mode control is a no-op.
- [ ] Cinematic export host flow — `exportCinematicFrames3D` requires `(opts, onFrame)`; the old
      0-arg call was always a no-op. Needs a real Frogmarks export dialog + frame sink (host work,
      but flagging since the menu item is currently stubbed with a warn).

### Facade type gaps (their audit's "forwards drop the types" case, confirmed live)
- [ ] `updateArrayParams3D` patch type declares only `{countX, spacing, countY, spacingY, radius}`
      but the engine actually consumes `count, arcDeg, axis, mode, gapFill, weldThreshold,
      objectOffsetId, spacingX…`. Host casts `as any` at ~10 sites until the type is widened.
- [ ] `getArrayParams3D` return type likewise narrower than the real per-mode unions.
- [ ] `getRibbonHandleScreenPositions3D` returns `{x, y, index}` — host expected `depth` too
      (used for hit-priority). If depth is available cheaply, add it back to the descriptor.

### FYI — real bugs fixed host-side by the burn-down (no Salsa action, just context)
- Texture library save/restore called phantoms at 5 sites → now `scene3d.getTextureLibraryData()`
  / `restoreTextureLibraryData()`. 3D textures were silently not persisted via these paths.
- Wind zone panel called scene-level signatures; engine is per-mesh → all 5 calls fixed.
- Camera: create passed `{fov}` as x; marker sprite got a filename (needs Blob); delete was a
  phantom (`deleteNode3D` → `deleteCameraNode3D`); cut drop had swapped args.
- Mesh inspector read `rotation?.x`/`scale?.x` (never existed) → `rotationX`/`scaleX` etc.
- Boolean result is an id string — `.id` on it broke post-op selection + auto-merge.
- `persist.saveNow()` → `saveDocument()`; `removeUISound` → `unregisterUISound`;
  `registerUISound` needs a URL not a File; focus chain → `frameMesh3D`;
  `bakeHairToPart3D` needs the name arg; decal metric size takes a bare number;
  overlay read `clipRef` → `clip`; submesh material key `diffuseColor` → `diffuse` (RGBA object);
  cloth stitch had an extra `side` arg; cloth preview cleanup `removeNode` → `deleteMesh`.
- Phantom tool toggles (`enableFloodFillTool` / `enableSpeechBalloonTool` /
  `enablePanelLayoutTool`) removed — tools work via other paths; markers left in code.

### Follow-ups on the Frogmarks side (not Salsa)
- [ ] ESLint rule banning `as any` on `shapeManager` (regrowth guard).
- [ ] Same burn-down for `armature-panel`, `board.component`, and the other components.
- [ ] Second pass tightening the ~50 remaining argument-level `as any` casts (unions/DTOs).

---

## Environment Style — city / blocks / props (Salsa + Frogmarks edits, 2026-09-29)

Edited **directly in Frogmarks** by the Salsa session; guide in Salsa `docs/ui/environment-style.md`.

- `illustration.component.ts`
  - City: `worldToonShadows` / `worldRimLight` + `worldSetCityStyleFlag()`, and `_syncCityStyleFromEngine()` (called
    in `openWorldPanel`). `worldClear` now also clears the city's saved style, since the panel resets to PBR.
  - Environment: `envStyleRender` / `envStyleToon` / `envStyleRim`, `scene3dSetEnvStyleRender()` /
    `scene3dSetEnvStyleFlag()`, and `_syncEnvironmentStyleFromEngine()` (called in `markLoaded`).
  - Block: `blockStyleRender` / `blockStyleToon` / `blockStyleRim`, `scene3dSetBlockStyleRender()` /
    `scene3dSetBlockStyleFlag()`, and `_syncBlockStyleFromEngine()` (called in `_refreshBlockStats`).
- `illustration.component.html`: an "Environment Style" details section (before Lighting), a "Style" strip at the top
  of EDIT BLOCK, and Toon shadows / Rim light rows under the City Look Style dropdown.
- **Needs a Salsa rebuild** for `setEnvironmentStyle3D`, `setCityStyle3D`, `setBlockStyle3D` and their getters.
- Not built: a per-prop style row in the generic creator panel (Salsa `setCreatorStyle3D` is ready).

## Retro colour opt-in + persistence fixes (Salsa + Frogmarks edits, 2026-09-29)

Edited **directly in Frogmarks** by the Salsa session; full write-up in Salsa
`docs/ui/frogmarks-update-2026-09-28.md` ("Persistence audit + fixes on the FROGMARKS side").

- `illustration.component.ts`
  - New `_syncScene3dPS1FromEngine()` (split out of `scene3dApplyRetroPreset`), called from `markLoaded`. The PS1
    panel now shows the restored values instead of its defaults.
  - `_syncSkinShading` reads `getRenderStyle3D` + `getMeshRetroColor3D`, so the character Style dropdown and the
    Retro colour checkbox show the real state.
  - `loadIllustrationV2` (local mode): the post-load `setSceneGraphJSON(opfsMeta.sceneGraph)` runs only when
    Salsa's `loadDocument` restored nothing. It used to wipe the freshly restored scene.
  - New `scene3dRetroColorScope`, `scene3dSetRetroColorScope()`, `charRetroColor`, `scene3dSetCharRetroColor()`.
- `illustration.component.html`: an "Apply to" select under Color Depth, and a "Retro colour" checkbox under the
  character Style row.
- **Needs a Salsa rebuild** for the three new facade methods (`setRetroColorScope3D`, `setCharacterRetroColor3D`,
  `getMeshRetroColor3D`) to type-check.
- `scene3dCanvasPointerDown`: returns unless it's a **plain left click** (`event.button !== 0 || event.altKey`).
  Middle, right and Alt+left used to select, or clear the selection. Salsa's transform controller got the same Alt
  guard.
- Still open: the local-mode meta saves omit `scene3dGlobalSettings`. In the cloud path, Frogmarks' copy is
  applied after Salsa's, so a stale copy would win.

## Persistence hardening (Salsa P1/P2, shipped 2026-09-28) — Frogmarks UI needed

Salsa now **pauses saving** when a load fails or partly fails, so autosave can't overwrite the
good copy on disk. Frogmarks must surface this or saves stop with no visible message:

- [x] On load completion, check `sm.getLastRestoreIssues()` (exported `RestoreIssue[]`) — if
      non-empty, show a notice listing what failed to load. *(built: `_checkSaveBlocked()` + `save-blocked-banner`; audited 2026-10-01)*
- [~] Anywhere save status is shown, display `sm.getSaveBlockedReason()` when saving is paused. *(the banner shows it on load; other save-status spots don't yet)*
- [x] Offer a "Keep what loaded / resume saving" action wired to `sm.clearSaveBlock()`. *(`saveBlockedKeepWhatLoaded()`, plus Reload)*

## City panel reorganised + city look controls (Salsa city-quality U1, 2026-09-29)

- `illustration.component.html`: the City Tool subpanel is split into collapsible sections: Presets, Look, Time &
  Weather, Layout, Streets & Buildings, Life & Props, Edge.
  - The Regenerate / Hero view / Clear row and Expand / Collapse all sit on top.
  - All the old controls are kept and just moved; the old "Detail" grab-bag is split by topic.
  - New Look controls: Sky lighting, Wet reflections, Contact shadows, Ink outlines (+ colour, sensitivity), Street
    haze, Lamp colour, and per-phase Shadow colour.
  - Grade gains Shadow tone and Highlight tone.
  - Pack buttons now come from `world.styleNames` (Persona packs included). The Palette select gains Phantom and
    Inaba.
- `illustration.component.ts`:
  - New `worldSecOpen` / `worldToggleSec` / `worldSetAllSecs` (localStorage `frogmarks.citySections`).
  - New `worldActiveStyle`, `worldStyleNames`, `worldStyleLabel`, `worldStyleTitle`.
  - New `worldSet{SkyLighting,WetReflections,SSAO,Outlines,HeightFog,LampColor,ShadowTint,GradeTint}` and
    `worldHeroView`.
  - New `_syncCityLookFromEngine`, called from `_syncCityStyleFromEngine`, so load and pack-apply both sync.
  - New `_rgb01ToHex` / `_hexToRgb01` helpers.
  - `worldApplyStyle` now re-syncs the look and grade keys. `worldClear` resets the active pack.
- `illustration.component.scss`: `.city-sec-head` header style.
- Backups in the Salsa session scratchpad: `*.citypanel.bak`.
- **Needs a Salsa rebuild** for the new `WorldManager` members to type-check.
- Follow-ups after the three city agents landed (2026-09-29):
  - Lots (Radial / Angular) sliders show only for Radial layouts. Grid blocks now use frontage strips.
  - New **Signal green** slider under Traffic lights: `worldSignalGreen`, `worldSetSignalGreen` → `world.setSignalTiming`, synced from `world.signalTiming`.
  - Edit Building panel: new **Japan details** group, above Features.
    - `buildingJpFlags`: 14 BuildingParams checkboxes (sash, shop interior, fascia, lanterns, signs, corridor, stair, AC, utilities, laundry, aerial, solar).
    - A **Shutters down** slider and a **Balcony style** select.
    - Synced from the engine params. New archetypes (zakkyo, apato, mansion, konbini, izakaya, jp-house) appear on their own, since the list comes from `buildingArchetypeNames3D`.
  - Build fix: widened `buildingMaterial` (+ `'siding'`) and `buildingDoorStyle` (+ `'sliding'`) to match Salsa's new BuildingParams, and added both options to the selects.
  - Style gating: the *Toon shadows* checkboxes (City Look, Environment style, Block style, Character) show only when Style is Cel or Cel HD. The redundant "needs Cel style" hint was removed.
  - City Look: *Contact shadows* is relabelled **SSAO** (tooltip warns it's GPU-heavy).
  - Ink outlines: *Sensitivity* 0.02–0.6 is now **Line width** 1–4 px. `worldOutlineThreshold` defaults to 1, and the engine value synced back is clamped/rounded. Salsa treats this value as a pixel width, so values below 1 drew nothing before.

## Random character defaults (Salsa polish round 3 T6, 2026-09-29)
- `_randomizeCharacterInputs` now uses these ranges:
  - eyes: width 0.37–0.43, height 0.18–0.22, `lowerLash: false`
  - hair: `capLayers: 6`
  - top: `hemHeight` −0.10…0, never cropped (the reference-bias clamp is now ≤ 0)
  - bottom: `thickness` (looseness) 0.016–0.020
- `scene3dGenerateCharacter` passes `rimLight: true` to `createFullCharacter3D`. This is a new optional param, so it **needs a Salsa rebuild** to type-check.
- Salsa also has its own seeded randomizer (`sm.randomCharacterParams3D` / `createRandomCharacter3D`) with the same limits. Frogmarks keeps its own randomizer so the reference-character bias still works.
- Backup: `illustration.component.ts.randchar.bak` in the Salsa session scratchpad.

## Adverts panel (Salsa polish round 3 T2, 2026-09-30)
- In the Skins (GARP) subpanel, a new **Adverts** section after Regenerate City. It is always visible, because the signage pool is hidden from `garp.listPools()`.
  - One row per bucket (portrait / landscape / square / fascia) from `signageBuckets3D()`, with the recommended px.
  - Thumbnails from `listSignageImages3D()`. Each has a ☀ Lit toggle (`setSignageImageLit3D`) and ✕ remove (`removeSignageImage3D`).
  - A **+** add per bucket, and **+ Add any (auto-sort)** (`addSignageImage3D('auto', …)`).
  - A Share slider (`setSignageShare3D`) and Clear all (`clearSignage3D`).
  - Salsa rebuilds the city itself, debounced. Multi-file adds pass `regen: false` until the last file.
- TS: `advertBuckets`, `advertImages`, `advertsRefresh()` (called when the Skins panel opens), `advertAdd`, `advertRemove`, `advertToggleLit`, `advertSetShare`, `advertClear`.
- Backups: `*.adverts.bak` in the Salsa session scratchpad.

## City scene presets + clean look (Salsa polish round 3 T1, 2026-09-30)
- **Presets:** buttons come from `world.scenePresets`, and clicking one calls `world.applyScenePreset(name)`. The presets are Morning, Noon, Golden Hour, Dusk, Night, Rainy Evening, Snowy Morning and Overcast; they are time + weather on PBR, and the layout is kept. The button matching `world.scenePreset` is highlighted.
- **Old style packs:** hidden behind a "Show style packs" checkbox.
- **Street view:** a new button beside Hero view calls `world.streetView({pick})`. Each click moves to the next street.
- **New Look controls** go through one generic setter, `worldSetLookValue(method, value, field)`:
  - Ground finish (`setGroundFinish`)
  - Paving (`setPaving`)
  - Mute buildings (`setBuildingMute`)
  - Painted clouds (`setPaintedClouds`)
  - Shadow softness (`setCityShadowSoftness`)
  - Golden warmth (`setSunWarmth`)
- **Sync:** these controls are read back in `_syncCityLookFromEngine`.
- **Weather:** the dropdown and the `worldWeather` type gain `'overcast'`.
- **Backups:** `*.t1.bak`.

## Play settings (Salsa polish round 3 T5, 2026-09-30)
- **Top toolbar:** a ⚙ button next to 1P/3P opens a popover with:
  - **Player height:** a 0.5–2.5 m slider plus an Auto button. It calls `setPlayerEyeHeight3D(m | null, metresPerUnit)`.
    - In a city, metres are converted with `cityMetresPerUnit()`; otherwise 1 unit = 1 m.
    - Auto means `null`.
  - **Auto default character:** calls `setAutoDefaultPlayer3D`.
- **Engine behaviour:** in third-person with no Player set, Salsa spawns an animated default body (idle / walk / run). It is never saved and never shown in the outliner.
- **Sync:** the popover reads its values on open (`getPlayerEyeHeight3D`, `getDefaultPlayerEyeHeight3D`, `getAutoDefaultPlayer3D`).
- **Backups:** `*.t5.bak`.
- **Fix (2026-09-30):** the scene preset buttons "didn't work". `worldScenePresets` was a getter returning fresh objects on every change-detection pass, so `*ngFor` rebuilt the buttons each tick and clicks landed on destroyed elements. The list is now cached in `_scenePresetsCache`. Watch for the same pattern elsewhere: a getter that feeds an `*ngFor` must return stable object references.
- **Play settings, Move speed (2026-09-30):** a new slider in the ⚙ popover (0.5–12 m/s, with a Default button → `null`). It calls `setPlayerMoveSpeed3D(mps)` and syncs from `getPlayerMoveSpeed3D()`. Salsa converts to city scale itself, so no metresPerUnit is passed. The auto default character is now dressed (seeded random character) and 1.7 m tall in a city.
- **Play settings, camera (R6.2, 2026-09-30):** two new sliders in the ⚙ popover, plus a Default camera button (both → `null`), and a hint line about Shift walk/run and the gamepad.
  - **Camera distance:** 1.5–12 m, `setPlayCameraDistance3D`.
  - **Camera FOV:** 40–100°, `setPlayCameraFov3D`.
  - **Sync:** both read back from the getters in `_syncPlaySettings`.
- **Building facades (persona polish B4/D2, 2026-09-30):** the Edit Building Material dropdown gains **Metal panel** (`'panel'`), and Japan details gains a **Window sills** checkbox (`windowSills`, default on in Salsa).
- **Shop windows panel (persona polish C4, 2026-09-30):** a new Skins-panel section after Adverts.
  - Interior and Poster rows come from `shopImageBuckets3D()`.
  - Each has thumbnails (`listShopImages3D`) with ☀ Lit (`setShopImageLit3D`) and ✕ (`removeShopImage3D`), plus a **+** button (`addShopImage3D(bucket, dataUrl, {name, regen})`).
  - There's a Share slider (`setShopImageShare3D`) and a Clear all button (`clearShopImages3D`).
  - The section refreshes when the Skins panel opens.
  - Backups: `*.shop.bak`.
- **Frontage dressing (persona polish D1, 2026-09-30):** a new city checkbox under Awnings in Streets & Buildings. It sets `worldFrontageDressing`, sent as the `frontageDressing` param (default on), and is synced in `worldApplyStyle`. `paintedClouds` is deliberately not exposed, because the Look's Painted clouds control drives it.
- **Edge wear + character outlines (persona polish E2/E3, 2026-09-30):**
  - **Edge wear:** a City Look dropdown with Off / Subtle / Heavy. It calls `world.setEdgeWear` through `worldSetLookValue`, and is synced from `world.edgeWear`.
  - **Character outlines:** a checkbox under the Environment style Rim light row. It calls `setCharacterOutlines3D({} | null)`, and is synced from `getCharacterOutlines3D()` in both `_syncEnvironmentStyleFromEngine` and the city look sync.
- **Rendering group (persona polish pass A, 2026-09-30):** a new "Rendering" subgroup at the top of the City Look block (before Edge wear). All values are synced in the city look sync.
  - **Anti-aliasing:** Off / FXAA low / medium / high → `sm.scene3d.setAntiAliasing3D`. This is scene-global; the default is FXAA medium.
  - **Shadow quality:** 1 / 2 / 3 cascades, plus a Crisp range slider of 8–80 m → `world.setShadowCascades({cascades, nearMetres})`.
  - **Ground contact:** checkbox plus strength → `world.setGroundContact(on, strength)`. This is separate from SSAO.
  - **Key / fill** → `world.setKeyFill`.
  - **Aerial haze** → `world.setAerialHaze`.
  - Backups: `*.passa.bak`.

## Railway upgrade (Salsa R1/R2, 2026-09-30)
- Streets & Buildings: under Railway (shown only when Railway is on) there are new controls. All are city params sent via `worldParamChanged`, and all are synced in `worldApplyStyle`.

| Control | Param | Default |
|---|---|---|
| Stations checkbox | `stations` | on |
| Metro entrances checkbox | `metroEntrances` | on |
| Train cars slider, 2–10 | `railCars` | 8 |
| Livery select | `railLivery`: auto / green / silver / cream | auto |
| Station wait slider, 0–3× | `railDwellScale` | 1 |
- **Railway phase 3 (2026-09-30):** all are full-regen city params, synced in `worldApplyStyle`.

| Control | Location | Param | Values |
|---|---|---|---|
| Viaduct select | under Railway | `railViaduct` | `portal` (over the road) / `arcade` (shops under, grid only) |
| Local line checkbox | after the Railway block | `localLine` | default off |
| Local cars slider | shown when Local line is on | `localLineCars` | 2–4 |

## Play mode: editor hotkeys + hover off (2026-09-30)
- `handleHotkeys` was already gated on `scene3dViewIsPlaying`. Now also gated:
  - `onCtrlSnapKeyDown`, the Ctrl snap indicator (Ctrl = sneak in Play).
  - `raster-layers.component` `onKeyDown`.
  - `animation-timeline.component` `onKeyDown`. Both of these read a new global, `window.__frogmarksPlaying`, which is set from `onPlayStateChanged3D`. *(2026-10-04: renamed — the Play state is now `editorState.playing` (`illustration.component.ts`, read in `animation-timeline.component.ts`); raster-layers uses `hotkeysSuspended`.)*
- `scene3dCanvasPointerMove` returns early during Play: no landmark hover raycast, no ribbon handles.
- **Play settings, gaits (Round 8):**
  - The Move speed slider is now **Run speed**: 2–12 m/s, `setPlayerMoveSpeed3D`, default 5.2 (was 3.5).
  - New **Walk speed** slider: 0.5–3 m/s, `setPlayerWalkSpeed3D` / `getPlayerWalkSpeed3D`, default 1.6.
  - A **Default speeds** button resets both.
  - The hint line now reads: walk by default, Shift toggles run, Ctrl or C to sneak, Space jumps, gamepad B sneaks.
- **Pedestrian style (Round 8, 2026-09-30):** Life & Props → Pedestrians has a new **Style** select: Flat (default), PBR, Cel, Cel HD, Ink.
  - It calls `world.setPedestrianStyle`, which restyles live with no regen.
  - It is synced from `params.pedestrianStyle` in `worldApplyStyle`.

## Performance status pill + batched adverts (Salsa performance plan P2/P3, 2026-09-30)
- **Status pill:** a bottom-centre `engine-status-pill` above the zoom controls. It shows:
  - "Preparing shaders… compiled/total" while `onPipelineWarmup3D` reports `waitingDraws > 0`;
  - otherwise the first foreground worker job label from `onWorkerJobProgress3D` (e.g. "Building city…", "Generating character… n/m").
  - It is hidden when idle. Background jobs never show it.
  - Subscribed via `_subscribeEngineStatus()`; unsubscribed in `ngOnDestroy`.
- **Adverts:** `advertAdd` now calls the batched `sm.addSignageImages3D([...])`, giving one pack, one atlas rebuild and one city regen for N files. It falls back to the per-file call.
- **Backups:** `*.status.bak`.

## Bug-hunt follow-ups: phantom API calls fixed (2026-10-01)
- `armature-panel.component.ts` `globalLibPromotePose`: `sm.getSavedPoses3D?.(sk.id)` → `sm.getPoses3D?.(sk.id)`. The real API returns `{ id, name, region? }[]`, so the promoted pose now keeps its name (it was always 'Pose').
- `frog-file.service.ts` `getCelBlob`: removed the dead `sm.getCelPixelDataBlob` branch. `exportRasterLayerToBlob` is the real path.
- `docs.component.ts` Grease Pencil help: `sm.getSkeleton3D(id)?.data.joints` → `sm.getSkeletonJoints3D(id)`, and `sm.scheduleRender3D()` → `sm.scheduleRender()`.
- Engine side, no host change: `sm.saveDocument()` during Play now resolves after Stop (the save indicator shows "saving" until then). `setCameraMode3D` / `setTarget3D` during Play apply on Stop.
- **Backups:** `*.bak` in the Salsa agent scratchpad (`fm-bak/`).

## City panel: Performance group (Salsa resolution scaling + LOD settings, 2026-10-01)
- **Where:** a new collapsible **Performance** section at the bottom of the City Tool panel (`worldSecOpen.perf`, closed by default; remembered with the other sections).
- **Readout:** two monospace lines polled every 500 ms while the section is open: fps · GPU ms · render scale / triangles · draw calls · culled · LOD-hidden (`sm.getCityLodStats3D?.()`). Polling stops when the section or the panel closes and in `ngOnDestroy`.
- **Resolution scaling:** Mode (Off / Fixed / Automatic), Scale slider (fixed), Target fps (30–144, sent as `targetMs = 960 / fps`, so 60 fps = 16.0 ms) and Min scale (auto), plus a live "Current scale · GPU ms" line. Calls `sm.setResolutionScale3D?.()` / `getResolutionScale3D?.()`. It is a per-machine preference kept by the engine (localStorage), so it does not mark the document dirty.
- **Draw distance (LOD):** Distance LOD toggle, Everything (global ×), Aerial bias toggle, and one slider per LOD family (label + the resulting distance in metres). The family rows come from `sm.getCityLodSettings3D?.().familyList`, so families the engine adds later show up without host changes.
- **Zoom tiers:** on/off + the five thresholds (× F). **Near / far swaps:** crowd, edge chips, tree crowns (metres; rows come from the engine's `twins` keys).
- **Shadows:** filter Soft 5×5 / Fast 3×3, Cascades (the same `worldSetShadowCascades` as the Rendering group), Shadow slack (texels).
- **Debug:** LOD debug tint toggle (not saved), and a per-family "shown / LOD-hidden / zoom-hidden · triangles" list.
- **Reset to defaults:** resolution scaling off + `sm.setCityLodSettings3D?.({ reset: true })`.
- The LOD settings are saved with the city (opt-in), so their setters call `scene3dMarkDirty()`.
- **Bindings:** all calls guarded with `?.()` (the app types against the built dist; until the dist is rebuilt these calls are no-ops and the family / swap lists stay empty). The `*ngFor` arrays (`perfFamilies`, `perfFamStats`, `perfTwinKeys`, `perfZoomKeys`) are cached fields, updated in place, never getters.
- **Files:** `illustration.component.ts` (the `perf*` fields and methods after `worldSetAllSecs`, `_perfOnPanelOpen()` in `openWorldPanel`, `_perfStopPoll()` in `ngOnDestroy`, `perf: false` in the section defaults), `.html` (the section after Edge), `.scss` (`.perf-readout`, `.perf-fam-stats`).
- **Backups:** `*.perf.bak` in the Salsa agent scratchpad.

## 2026-10-01 — Hard fog edge
- [x] Global settings → Fog → "Hard edge" checkbox → `sm.setFogHardEdge3D(on)` (illustration.component.ts/.html;
      `fogHardEdge` in the scene settings type, illustration.service.ts). Applied before the fog on restore.
      Needs a Salsa dist rebuild to take effect.

## 2026-10-01 — Fog horizon (silhouette skyline)
- [x] Global settings → Fog, under **Hard edge** (shown only while Hard edge is on): **Buildings only in fog**,
      **Include signs, awnings & rooftop equipment** (shown with Buildings only), **Fade distance** (0–60 m) and
      **Fade style** (Dither / Dither (coarse), shown when the fade is > 0), **Silhouette outlines**. All call
      `sm.setFogHorizon3D({ buildingsOnly, includeAttachments, fadeM, fadeStyle, silhouetteOutlines })` through
      `scene3dApplyFogHorizon()` (illustration.component.ts/.html, `.scene3d-row-wide` / `.scene3d-row-sub` in .scss).
- [x] Saved in the host scene settings as `fogHorizon` (type in illustration.service.ts); restored AFTER the hard
      edge. Older saves (no `fogHorizon`) restore the defaults. Salsa also saves it in its own global settings (only the
      non-default fields).
- Needs a Salsa dist rebuild; until then the calls are no-ops (cast + `?.()`). Backups: `*.bak` in the Salsa agent
  scratchpad (fogh/bak).

## 2026-10-01 — Per-object "No fog" (fog-horizon follow-ups)
- [x] 3D object material panel, under "True mirror": **No fog** select (Off / Always / Hard edge only) →
      `(this.shapeManager as any).setMeshNoFog3D?.(id, false | true | 'hardEdge')` (`scene3dMeshNoFog`,
      `scene3dUpdateMeshNoFog()` in illustration.component.ts; the row in .html). Read back from
      `mesh.material.noFog` when a mesh is selected. Persists with the mesh material (Salsa side), so no host save field.
- The city's sky / clouds default to "Hard edge only" (engine side; no host change).
- Needs a Salsa dist rebuild; until then the call is a no-op. Backups: the Salsa agent scratchpad
  (frogmarks-backup-fogh2/).

## 2026-10-01 — Stream-to-camera checkbox fix
- [x] "Stream to camera" toggled twice ([(ngModel)] + a toggling handler), so checking it turned follow OFF.
      Now [ngModel] + worldToggleStreamFollow($event). Stats line used non-existent focusTile/window fields →
      now "live · full · pending · workers · cached" from getStreamStats().
- [ ] "Tiled" starts at 1×1 (worldTileRadius = 0) — no neighbour tiles until the slider moves. Decide a default (1 = 3×3?).

## 2026-10-01 — Streaming: Tile radius = the active window, Outside tiles (Salsa P10.D) — BUILT in Frogmarks
- [x] Salsa: with "Stream to camera" on in a Full tiled world, the **Tile radius** is the ACTIVE window of full tiles
      (1×1 = 1, 3×3 = 9, 5×5 = 25), centred on the tile under the camera eye (the player in Play), ~12 % hysteresis
      at borders. The original centre city streams too (despawns when the window leaves it, re-attached on return).
      Root cause of "full 9 at 1×1": follow mode ignored tileRadius (fixed 9 full seats) and the stats line read the
      constant budget, not the live count.
- [x] Frogmarks: **Outside tiles** select (None / Flat / Massing, default Flat) under Stream to camera, shown for Full
      detail → `(this.shapeManager as any).world?.setStreamOutsideTiles?.(mode)` (`worldStreamOutside`,
      `worldSetStreamOutside()`; re-applied when follow is switched on). Session state, not saved.
- [x] Frogmarks: Tile radius tooltip explains the window; stats line now
      "live · full N/window · flat · massing · lite · centre parked|restoring · (+pending) · workers · cached"
      from the new `getStreamStats()` fields (`full` is the ACTUAL count, `windowTiles`, `flat`, `massing`, `lite`,
      `centre`, `eyeWindow`, `focusTile`, `outside`, `proxyCached`).
- [ ] Default Tile radius is still 0 (1×1). With the new window, 1×1 = one full tile under the camera; 3×3 may be the
      nicer default for exploring. Product decision, unchanged.
- Needs a Salsa dist rebuild; until then the select is a no-op (cast + `?.()`) and the stats line shows the old fields.

## 2026-10-01 — Honest triangle counts in the perf HUDs (Salsa P11 culling) — BUILT in Frogmarks
- [x] Salsa: `getRenderStats3D().triangles` was always the SCENE total (every visible-flagged mesh summed, before
      culling / distance LOD / twins; instanced copies once), so it read "millions" even facing a wall. It is unchanged
      for compatibility; new fields: `drawn` / `drawCalls` = `{ main, shadow, other, total, shadowThisFrame, passes }`
      (main = the colour pass incl. characters, shadow = far map + near cascades at their last refresh, other = outline /
      SSAO-SSR / mirror prepasses), `sceneTriangles`, `culling`. `getCityLodStats3D().frame` gains `trisMain`,
      `trisShadow`, `trisOther`, `drawsMain`, `drawsShadow`, `drawsOther`.
- [x] Frogmarks: the 3D stats HUD headline is now `drawn.main` ("tris drawn", budget colour on it), plus a line
      "shadow · other passes · draws" and "in scene N tris" (illustration.component.html, the `scene3d-stats-hud`
      block; falls back to the old line when the engine has no `drawn`). The City → Performance stats line shows
      "tris drawn · shadow" from `trisMain` / `trisShadow` (falls back to `trisDrawn`).
- Needs a Salsa dist rebuild; until then the HUD shows the old scene total.

## 2026-10-01 — Simulation LOD controls (Salsa engine-roadmap step 1, performance-plan §P13) — BUILT in Frogmarks
- [x] Salsa: movers, the live crowd, character idles and spring bones update by distance / visibility / fog (near every
      frame, mid ~10 Hz, far / off-screen ~2 Hz, past the fog horizon frozen); walkers and trains are a function of the
      clock, so a frozen one reappears where it should be. APIs `setSimLod3D` / `getSimLod3D` / `getSimLodStats3D`, and
      `setCityLodSettings3D({ sim })` (saved with the city LOD settings, non-default fields only).
- [x] Frogmarks: City → Performance → **Simulation** group (illustration.component.html / .ts): on/off, Every frame (m),
      Mid range (m), Mid / Far / Off-screen rate (Hz), Freeze in fog, and a live band / updated-skipped line from
      `getSimLodStats3D()` on the existing perf poll. `perfSim`, `perfSimLine`, `perfSetSim()`; `_perfApplyView` reads
      `v.sim`. All calls `?.()`-guarded. Backups `illustration.component.*.simlod.bak` in the agent scratchpad.
- Needs a Salsa dist rebuild; until then the group shows its defaults and the line stays empty.

## 2026-10-01 — Step 2: Angular off the per-frame path (Salsa engine-roadmap step 2, performance-plan §P13) — BUILT in Frogmarks
- [x] Salsa: the editor's per-frame 2D scans, the host node scans and the structure-change hitches removed (tiled Play
      p95 frame 47 → 22 ms); A/B `setFrameScanOptions3D` / `getFrameScanOptions3D` / `getFrameScanStats3D`; resolution
      setting gains `motion` ('auto' default: the 0.78 camera-motion drop in Play only while the GPU is over budget) and
      `motionScale`.
- [x] Frogmarks: the 3D canvas pointermove is registered outside Angular's zone (`_canvasPointerMoveOutsideZone`, the
      template `(pointermove)` binding removed); it enters the zone only on a ribbon-handle change or while a button is
      held (drags). Stats HUD / Performance / stream polls run outside the zone and enter it only when a shown value
      changed (`_scene3dStatsSig`, `_perfSig` + `_perfPollTick`, `_streamStatsTick`). Mouse-move change detection
      17.7 → 0 ms/s. Backups in the agent scratchpad `fm-backup-step2/`.
- [ ] Optional: a "While the camera moves" select (`setResolutionScale3D({ motion })`) in City → Performance.
- Needs a Salsa dist rebuild for the engine half; the host half works with any dist.

## 2026-10-02 — Shadow quality presets + shadow caching (Salsa engine-roadmap step 7, performance-plan §P14) — BUILT in Frogmarks
- [x] Salsa: far shadow map range-culled per caster (tiled refresh 6.7–7.6 M → 3.6–4.9 M tris), near cascades with a
      cached static layer (Play: 0.9–1.3 M → 0.3–0.45 M shadow tris a frame), streamed tiles join the cached layers in
      batches, shadows follow the sun in 0.15° steps; pixel-identical (frozen-clock A/B). Presets Low / Medium / High /
      Ultra (High = today): `setCityLodSettings3D({ shadow: { quality } })` (saved with the city) and
      `setShadowQualityPreset3D` / `getShadowQualityPreset3D`. A/B `setShadowCacheOptions3D`, stats `getShadowCacheStats3D`.
- [x] Frogmarks: City → Performance → Shadows → **Shadow quality** select (`perfShadowQuality`, `perfSetShadowQuality`;
      `_perfApplyView` reads `v.shadow.qualityShown`), and 3D Global settings → Shadows → **Quality**
      (`scene3dShadowQuality`, `scene3dSetShadowQuality`; saved as `shadowQuality` in the 3D global settings and
      re-applied on load). All calls `?.()`-guarded. Backups in the agent scratchpad `frogmarks-backup/`.
- Needs a Salsa dist rebuild; until then the selects call nothing (guarded) and the Performance select shows High.

## 2026-10-02 — Step 3: lighter tiles, no hitches + scene budgets (Salsa engine-roadmap step 3, performance-plan §P13 "Step 3") — BUILT in Frogmarks
- [x] Salsa: incremental / sliced City bounds after tile settles (the 132 ms timer task), Play collision cells (merged
      per-cell BVHs in a worker; same hits), ≤ 4 MB of geometry uploaded a frame, crowd cells built in a worker,
      overlays culled past the fog horizon's Far, the backdrop follows the tile window, re-attached tiles re-dressed.
      A/B `setStep3Options3D` / `getStep3Options3D`; stats `getStep3Stats3D`, `getCollisionStats3D`.
- [x] Salsa: scene budgets `getSceneBudget3D()` (drawn tris, draw calls, geometry MB, instances, `over`, `warning`) and
      `setSceneBudget3D(limits | null)` (defaults 3 M / 2 k / 500 MB / 200 k; session only).
- [x] Frogmarks: stats HUD amber warning line (`scene3dBudgetWarning`, `.scene3d-stats-warn`) and a City → Performance
      readout line (`perfBudgetLine`, `.perf-budget-over`), both from the existing outside-zone polls. All calls
      `?.()`-guarded. Backups in the agent scratchpad `fm-backup-step3/`.
- Needs a Salsa dist rebuild; until then neither line shows.

## 2026-10-03 — GPU culling mode Auto / On / Off (Salsa engine-roadmap step 4, performance-plan §P15) — BUILT in Frogmarks
- [x] Salsa: `setGpuCullingMode3D('auto' | 'on' | 'off')` / `getGpuCullingMode3D()` → `{ mode, active: 'gpu' | 'cpu',
      reason, reasonText, warm, ready, timer, auto: { switches, lastSwitch, last, ratioCpu, ratioGpu, dwellMs },
      subBundles: { on, segments, kept, omittedDraws, omittedTotal } }`. Default 'auto'; a per-machine preference
      (localStorage `salsa.viewport.gpuCulling`), never document data.
- [x] Salsa: sub-bundle omission (the D3D12 zero-draw cost), on by default; A/B `setGpuDriven3D({ subBundles, rankCellM })`.
- [x] Frogmarks: City → Performance → **GPU culling** select (Auto (recommended) / On / Off) with the selected option's
      description under it and a live line "Active: GPU · reason: CPU-bound" (from the existing outside-zone 500 ms
      poll, part of `_perfSig`). Reset to defaults sets Auto. Fields `perfGpuCull`, `perfGpuCullDesc`, `perfGpuCullLine`,
      static cached `GPU_CULL_OPTIONS` (world-panel.component.ts / .html).
- [x] Frogmarks: Global → Rendering → **GPU culling** (the same setting, synced when the section opens; no live line):
      `scene3dGpuCull`, `scene3dSetGpuCull`, `scene3dSyncGpuCull` (illustration.component.ts / .html).
- All calls `(this.shapeManager as any).fn?.()`-guarded. Backups in the agent scratchpad `fm-backup-gdauto/`.
- Needs a Salsa dist rebuild; until then the selects show Auto and call nothing, and the live line is hidden.

## 2026-10-03 — Graphic look + visual-polish quick wins (Salsa visual-polish-next #1a/#3a/#4/#6a/#7a/#8/#14) — BUILT in Frogmarks
- [x] Salsa: a **Graphic** scene preset (Golden Hour + cel-hd, toon shadows, rim, ink outlines that thin + fade with
      distance) and `world.setGraphicLook(on)` / `world.graphicLook` (layers the look over the current preset; off = the
      plain preset). Fixed: any look WITH outlines (Graphic, Phantom Night) had its ink switched off again by applyLook.
- [x] Salsa: Phantom Night (P5) retuned (no blue wash, red/black/white, no cloud deck), lit-window glow cap
      (`CityLook.windowGlow`, opt-in), sign lettering always contrasts with its box.
- [x] Salsa: new cities get designed ad screens (`LayoutParams.adScreens`, default true); a city saved before keeps the
      old screens. Play camera: FOV 50, 3 m, shoulder offset, only for documents that never set distance / FOV.
- [x] Frogmarks: City panel → Presets: the **Graphic** button appears on its own (the preset list is data-driven,
      cached `worldScenePresets`); new **Graphic look** checkbox under the buttons (`worldGraphicLook`,
      `worldSetGraphicLook`, synced in `worldApplyScenePreset` and `_syncCityLookFromEngine`)
      (world-panel.component.ts / .html).
- All calls `?.()`-guarded (`(this.shapeManager.world as any)?.setGraphicLook?.(on)`). Backups in the agent scratchpad
  `frogmarks-backup-polish2/`. `npx tsc -p tsconfig.app.json --noEmit` clean.
- Needs a Salsa dist rebuild; until then the checkbox stays off and does nothing, and the Graphic button is absent.

## 2026-10-03 — GPU device-lost recovery banner + "waiting for Play" toast (Salsa docs/ui/device-recovery.md) — BUILT in Frogmarks
- [x] Salsa: the engine recovers from a lost GPU device by itself (new device, the document rebuilt from its CPU
      snapshot + the raster read-back shadow). API: `getDeviceStatus()`, `onDeviceStatusChange(fn)`, `onDeviceLost(fn)`,
      `recoverDevice()`, `setAutoRecoverDevice(on)`, `simulateDeviceLoss()` (test), `refreshDeviceReadbackShadow()`,
      `setDeviceReadbackShadowInterval(ms)`, `isDeviceReadbackShadowCurrent()`, `onPersistDeferred(fn)`.
- [x] Frogmarks: a top-centre banner (illustration.component.ts / .html / .scss, `deviceBanner`, `deviceBannerDetail`,
      `_subscribeDeviceStatus`, `_onDeviceStatus`, `deviceBannerReload`, `deviceBannerDismiss`): "Graphics device was
      reset — recovering…" (spinner) → "Recovered." for 2.5 s (8 s + Dismiss when `unrecovered` lists something, shown
      as "Not restored: …") → or "Couldn't recover the graphics device — reload." with a **Reload** button.
- [x] Frogmarks: a toast when a save or export waits (`_onPersistDeferred` from `sm.onPersistDeferred`): "Export will
      finish when you stop Play" (also "when you leave the UI preview" / "Player mode" / "once the graphics device has
      recovered").
- Subscriptions live in `_engineStatusUnsubs` (torn down with the other engine subs). All calls
  `(this.shapeManager as any).fn?.()`-guarded. Backups in the agent scratchpad `frogmarks-backup-devrec/`.
  `npx tsc -p tsconfig.app.json --noEmit` clean.
- Needs a Salsa dist rebuild; until then nothing subscribes and the banner never shows.
- To test in the browser: call `simulateDeviceLoss()` on the ShapeManager from the devtools console (the banner shows "recovering…" then
  "Recovered."); start Play and click Export / Save: the toast shows and the file is written after Stop.

## 2026-10-03 — HLOD distant buildings + Skyline distance (Salsa engine-roadmap step 5, performance-plan §P17) — BUILT in Frogmarks
- [x] Salsa: Outside tiles `'hlod'` = merged distant buildings (mid tiles near the camera, 3-draw far tiles further
      out) streamed out to the **Skyline distance** (default 10 tiles), tier swaps dissolve (colour, shadow, AO / SSR
      prepasses; outline ink fades). **Now the engine default** (was `'flat'`); ortho / 2D views keep Flat / Massing.
      Fixed on the way: the GPU-driven scene kept every removed mesh alive (heap +30 MB/s in a fly), far tiles drained
      away in a fast fly (reassembly / worker starvation).
- [x] Frogmarks (world-panel.component.ts / .html): **Outside tiles** select gains **HLOD (distant buildings)** (first
      option, now the default: `worldStreamOutside = 'hlod'`), and a **Skyline distance** slider (2-24 tiles, shown
      when HLOD is selected) → `(this.shapeManager.world as any)?.setStreamHlod?.({ skylineTiles })`
      (`worldHlodSkyline`, `worldSetHlodSkyline()`, `_syncHlodSkyline()` reads `world.streamHlod` back). The stats line
      adds "HLOD n mid / n far" (`hlodMid` / `hlodFar` from `getStreamStats()`). Session state, not saved.
- Backups in the agent scratchpad `fm-backup-hlod/`. `npx tsc -p tsconfig.app.json --noEmit` clean.
- The current Salsa dist already has `setStreamHlod` / `'hlod'`; the new default and the leak / starvation fixes need a
  dist rebuild.
- To test in the browser: a Full tiled world, Stream to camera on, Outside tiles = HLOD: the skyline reaches the
  horizon; drag Skyline distance to 4 and to 16; fly forward (WASD in free camera) and watch tiles dissolve in.

## 2026-10-03 — Anti-aliasing / Upscaling: TAA + TAAU (Salsa engine-roadmap step 6, performance-plan §P18) — BUILT in Frogmarks
- [x] Salsa: `sm.setTemporalAA3D({ mode: 'off' | 'taa' | 'taau', scale, sharpen, retroOff, inkOff })` /
      `sm.getTemporalAA3D()` (`active`, `reason`, `renderScale`). TAA = native-resolution temporal AA instead of FXAA;
      TAAU = the 3D scene at 65 % (or the Resolution scaling scale when that is on), reconstructed full size. Per machine
      (engine localStorage), never in the document; exports / thumbnails render natively. **Default Off.**
- [x] Frogmarks: an **Anti-aliasing / Upscaling** select (Off (FXAA) / TAA (native resolution) / TAAU upscaling (faster))
      with a description line in two places, both calling `(this.shapeManager as any).setTemporalAA3D?.({ mode })`:
  - City → Performance → Resolution scaling group (world-panel.component.ts / .html: `perfTaa`, `perfSetTaa()`,
    `_perfReadTaa()` from `perfSync()`; shows "Off for this look (retro / PS1)" etc. and "Rendering at 65 %"); Reset to
    defaults sets it Off;
  - Global → Rendering (scene-render-settings.component.html + scene3d-settings.service.ts: `TEMPORAL_AA_OPTIONS`,
    `scene3dTaa`, `scene3dSetTaa()`, `scene3dSyncTaa()` when the section opens).
- Backups in the agent scratchpad `fm-backup-taa/`. `npx tsc -p tsconfig.app.json --noEmit` clean.
- Needs a Salsa dist rebuild (the guarded calls are no-ops on the current dist).
- To test in the browser: a city street, pick TAA: wires / pole edges stop stepping; TAAU: the GPU time in the
  Performance readout drops, the image stays sharp; walk in Play: no trails behind the character or cars.

## 2026-10-03 — Night light spill, wet streets, Play player light, ink on foliage (Salsa visual-polish-next #5 / #7c / #3) — BUILT in Frogmarks
- [x] Salsa: new opt-in `CityLook` fields (absent = off, so saved cities look unchanged; saved with the city only when set):
      `nightSpill` 0–1.5 (warm light on the pavement in front of lit shops, sign-coloured light under shop signs, the
      street-lamp pools as soft lamp-coloured light instead of grey-white discs), `wetSheen` 0–1 (rain: glossy roads with
      puddles so the SSR reflections of signs show; dry night: damp asphalt with lamp highlights), `playerLight` 0–2 (in
      Play at night a small key light follows the player). `CityOutlines.foliage` ('full' / 'silhouette' / 'off') and
      `CityOutlines.creaseFade` (distant ledge ink fades out). Setters on the world manager: `setNightSpill(v)`,
      `setWetSheen(v)`, `setPlayerLight(v)`; getters `nightSpill`, `wetSheen`, `playerLight`; ink via `setCityOutlines`.
- [x] Salsa defaults: every scene preset now turns on `nightSpill: 1` + `playerLight: 1` (both only show after dusk);
      Night adds `wetSheen: 0.6`, Rainy Evening `wetSheen: 1`; the Graphic look and Phantom Night ink foliage as
      'silhouette' with a crease fade. A saved city keeps its own values until a preset is re-applied.
- [x] Frogmarks (world-panel.component.ts / .html), City panel → Look → Rendering, under Lamp colour:
  - **Night light spill** slider 0–1.5 → `worldSetLookValue('setNightSpill', v, 'worldNightSpill')`;
  - **Wet streets** slider 0–1 → `setWetSheen` (`worldWetSheen`);
  - **Player light** slider 0–2 → `setPlayerLight` (`worldPlayerLight`);
  - **Ink on foliage** select (Every leaf / Outline only / None, shown while Edge outlines is on) →
    `worldSetInkFoliage(mode)` re-sends `world.cityOutlines` with `foliage`; `worldSetOutlines` keeps the choice.
  - All four are read back in `_syncCityLookFromEngine` (preset / style / load).
- All calls are guarded (`w?.[method]?.()` through `worldSetLookValue`, `(this.shapeManager as any)?.world` +
  `setCityOutlines?.()`). Backups in the agent scratchpad `pupdrive/night/fm-backup/`. `npx tsc -p tsconfig.app.json --noEmit` clean.
- Needs a Salsa dist rebuild; until then the sliders call nothing.
- To test in the browser: City → Presets → Night, street view: warm pools in front of shops, coloured light under the
  signs, warm lamp pools. Rainy Evening: signs reflect in the road. Play at night: the player stays lit. Graphic preset:
  trees get one outline, no scribbles between leaves; set Ink on foliage to None / Every leaf to compare.

## 2026-10-03 — Asks from the Frogmarks persistence fixes — NEEDS SALSA

Found while fixing document persistence in the illustration editor (`illustrate/services/illustration-persistence.service.ts`).
Frogmarks-side fixes are done (see `docs/refactor-plan.md`, row "2.8 (bugs 1)"); these need an engine decision first.

1. **Cloud documents lose engine-owned scene settings.** A cloud document opened on another device (nothing in OPFS) has
   no Salsa `globalScene` — the cloud state carries only Frogmarks' own snapshot. So sky, IBL image, toon / rim, character
   outlines, environment style, scripts, animation library, play settings, player binding and the saved camera view are
   lost there. Proposed: ShapeManager façade methods `getGlobalSceneSettings3D()` / `restoreGlobalSceneSettings3D(s)`
   (wrapping `scene3d.getGlobalScene3DSettings` + `resetGlobalScene3DSettingsForLoad` + `restoreGlobalScene3DSettings`)
   that Frogmarks saves into / restores from the cloud state. **Question:** the payload includes the IBL image — how big
   can it get? (It would go into the SQL state row; if large, should it be a separate blob like meshes?)
2. **Animated layers upload the same pixels for every cel.** The cloud save calls `exportRasterLayerToBlob(layerId)` per
   cel, so every frame of an animated layer gets the whole current layer. Needed: a façade method that exports ONE cel
   as an encoded image (e.g. `exportCelToBlob(layerId, celId, 'image/webp')`) — `RasterLayerManager.exportCelPixels()`
   exists but returns raw buffers for all cels. Also confirm the cloud load applies cel blobs per cel.
3. **Play camera mode (1P / 3P) isn't persisted.** It lives only in the editor and is passed to `enterPlayMode3D`. Should
   the engine keep it with the play settings (like eye height / speeds)?
4. **Armature mode has no exit.** The armature panel calls `enterArmatureMode3D(meshId)`; there is no
   `exitArmatureMode3D`, so closing the panel only turns off bone placement / overlay / bg (its `ngOnDestroy`). Is an
   explicit exit needed (e.g. to restore the pre-armature camera / gizmo state)?

## Sky dome: night gradient + city glow, moon, stars, anime clouds (Salsa visual-polish #9, 2026-10-03) — BUILT in Frogmarks

Engine docs: `docs/ui/city-quality.md` "Sky dome".

- Engine: `world.setSkyDome(patch | null)` / `world.skyDome` — `{ stars, moon, cityGlow (0..1), cityGlowColor [r,g,b],
  moonAzimuthDeg, moonElevationDeg, clouds: 'anime' | 'cards' }`; `{}` = on with the defaults, null = the legacy flat sky.
  On in every scene preset + both Persona packs; persisted in the City marker (absent = legacy, so old cities keep their sky).
- Applied in Frogmarks (backups in the agent scratchpad `pupdrive/sky2/backup/fm-*`): City → Look, under Painted clouds:
  **Sky dome** checkbox + Cloud style / Stars / Moon / City glow / Glow colour (world-panel.component.html / .ts:
  `worldSkyDomeOn`, `worldSetSkyDome()`, `worldSetSkyGlowColor()`, read back in `_syncCityLookFromEngine`).
  Calls guarded `world?.setSkyDome?.(...)` (no-ops on an older dist); `npx tsc -p tsconfig.app.json --noEmit` clean.
- Please verify in the browser (after a Salsa dist rebuild): Night preset → navy sky with a warm horizon glow, stars,
  the moon with a halo; Golden Hour → cumulus with gold-lit tops; Sky dome off → the older flat sky.

## Face kit: brows, mouth, nose, hair shadow, blush + expressions (Salsa visual-polish-next #2, 2026-10-03) — BUILT in Frogmarks

Engine docs: `docs/ui/character-creator.md` §2.5b "Face kit".

- Engine API: `sm.getDefaultFaceFeatures3D()`, `sm.setFaceFeatures3D(bodyId, patch)` (live, persists; the first call turns the
  kit on for a face saved before it; `{ enabled: false }` hides it), `sm.getFaceFeatures3D(bodyId)` (null = off),
  `sm.getFaceFeatureOptions3D()` ({ browStyles, noseStyles, expressions }), `sm.setCharacterExpression3D(bodyId,
  'neutral' | 'smile' | 'open' | 'frown' | 'surprised' | 'default' | weights, { blendMs, weight, holdMs })`,
  `sm.getCharacterExpression3D(bodyId)`, `sm.pulseCharacterBrows3D(bodyId, amount)`. New random characters get the kit
  (`randomCharacterParams3D(...).face`); `createFullCharacter3D({ face })` (omit = defaults, false = eyes only). New eye
  param `lidShadow` (0..1). Old saved characters load unchanged (kit off).
- Applied in Frogmarks (backups in the agent scratchpad `pupdrive/face/backup/`), character-panel.component.html / .ts:
  a new **Face** menu button + section: Face kit checkbox; Expression preview buttons + **Resting** ("Use preview");
  Brows (style, thickness, length, height, tilt, follow hair colour / picker, over hair); Mouth (width, line, position);
  Nose (style, size); Shading (blush + colour + lines, cheeks, hair shadow + depth, eye shading, eyes over hair); Life
  (brow raise on blink, idle smiles). Eyes → Proc → Shape gained a **Lid shadow** slider. Option arrays cached for
  `*ngFor`; calls guarded `(this.shapeManager as any).fn?.()`; slider pushes throttled to one per frame;
  `npx tsc -p tsconfig.app.json --noEmit` clean.
- Please verify in the browser (after a Salsa dist rebuild): Generate a character → Face shows the kit on; the expression
  buttons blend the face; an old saved character shows the kit off until the checkbox is ticked.

## Persona face shading + character defaults (Salsa visual-polish-next #10, 2026-10-03) — BUILT in Frogmarks

Engine docs: `docs/ui/character-shading.md` "Anime face shading · matte · hair band · Play outlines"; random defaults in
`docs/ui/character-creator.md` "Random character".

- Engine: **anime face normals** (`BodyParams.faceNormals` 0..1 via `sm.setBodyParams3D(bodyId, { faceNormals })` — the Cel HD
  facet wedges across the nose / cheeks are gone; works in every style); **matte skin + cloth** (`sm.setCharacterMatte3D(bodyId,
  on)` / `getCharacterMatte3D`; `createFullCharacter3D({ matte })`); **hair highlight band** (`HairParams.sheenBand`, Cel / Cel HD);
  **outlines in Play** (`sm.setPlayCharacterOutlines3D(on)` / `getPlayCharacterOutlines3D()`, scene-wide, runtime-only, persists).
  New random characters get all four, plus a bang hairline kept above the eyes and no under-eye dots (the white "°°°" cheek
  specks). Saved characters / documents load exactly as they were (fields absent = the classic look).
- Applied in Frogmarks (backups in the agent scratchpad `pupdrive/face2/fm-backup/`), character-panel.component.html / .ts:
  shading section (after Rim light) gained an **Anime face** slider (0–1, writes `scene3dBodyParams.faceNormals` →
  `scene3dBodyParamChanged()`), a **Matte skin + cloth** checkbox and an **Outline in Play** checkbox (scene-wide); Hair →
  Render gained a **Highlight band** checkbox (`scene3dHairParams.sheenBand`). State read back in `_syncToonAndRim`. Calls guarded
  `(this.shapeManager as any).fn?.()`; no new `*ngFor`; `npx tsc -p tsconfig.app.json --noEmit` clean.
- Please verify in the browser (after a Salsa dist rebuild): Generate a character in Cel HD → a clean flat face, matte clothes, a
  light band on the hair; Anime face 0 brings back the faceted head; an old saved character shows Anime face 0 and Matte off;
  Play draws a thin ink outline round the characters and Stop removes it.

## Jump variety + motion looseness (Salsa animation feel, 2026-10-03) — BUILT in Frogmarks

Engine docs: `docs/ui/play-mode.md` §"Jump variety + a looser walk / run".

- **Engine (no wiring needed):**
  - The default Play jumps are a family: classic, tuck, reach, swing (layup) L/R, stride L/R and hop. One is picked per
    jump: seeded per character, never the same twice running, weighted by stand / walk / run and tap / hold.
  - The default walk / run got secondary motion: pelvis tilt and hip drop, a torso sway, a late head counter, the
    forearm and hand trailing the arm, the shoulders riding with the arms.
  - Also new: a stroll below the walk speed, a settle step on stops, a per-character walking personality, and an
    upper-body follow-through spring.
  - Authored clips / locomotion sets are unchanged. A set can opt in with `jumps: [...]`
    (`sm.setPlayerLocomotionSet3D({ ..., jumps })`).
- **API:**
  - `sm.setPlayJumpVariety3D(on)` / `getPlayJumpVariety3D()` (default on);
  - `sm.setPlayMotionLooseness3D(0..1 | null)` / `getPlayMotionLooseness3D()` (default 0.5; 0 = the clips exactly).
  - Both persist in `globalScene.play` only when not the default, and are live while playing.
  - `getPlayerAnimationState3D()` adds `jumpClip`, `jumpCount`, `strollMix`.
- **Applied in Frogmarks** (backups in the agent scratchpad `pupdrive/anim2/backup/fm__*`): in
  `scene-view-bar.component.html` / `.ts`, the Play settings popover gained, above "Auto default character":
  - a **Jump variety** checkbox;
  - a **Motion looseness** slider (0–1, step 0.05).
  State is read back in `_syncPlaySettings`. Calls are guarded `(this.shapeManager as any).fn?.()`, and each change
  emits `dirty`. `npx tsc -p tsconfig.app.json --noEmit` is clean.
- **Please verify in the browser** (after a Salsa dist rebuild):
  - Play, then jump a few times standing, walking and running: the jumps differ. A quick tap gives a small hop.
  - With Jump variety unticked, every jump is the classic.
  - Motion looseness at 0 vs 1 changes how much the upper body swings on a stop.

## Checks + CI: `npm run check`, ESLint, source sanity (2026-10-04) — ADDED (tooling only, no runtime change)

Full write-up: `salsa/docs/dev/checks-and-ci.md`. Frogmarks side:
- **`npm run check`** (`scripts/check.mjs`) runs every step, even after a failure, then prints a summary:
  `sanity` (`scripts/check-source-sanity.mjs`: 0-byte files, BOM, mixed CRLF/LF within one file, mojibake, U+FFFD)
  → `typecheck` (`tsc -p tsconfig.app.json --noEmit`) → `lint` → `sm-types` + `templates` (the existing guards).
  No `ng build`. `npm run check:fast` lints without type info. `npm run lint` shows the warnings as well.
- **ESLint 9 flat config** (`eslint.config.mjs`): typescript-eslint + angular-eslint 20 (plugins only, no
  builder; works with Angular 17). Bug-finding rules only; no style or "prefer-standalone" rules. Type-aware via
  `projectService`.
  Baseline: **0 errors / 201 warnings** (99 `no-floating-promises`, 75 template `eqeqeq`, 23 unused vars, ...).
  **41 existing errors are recorded in `eslint-suppressions.json`** (they don't fail; a new one does):
  20 `eqeqeq` (`board.component.ts`, dashboard, api.service), 12 duplicate `class="..."` attributes in
  `board.component.html` (only one class survives), **7 `await-thenable`** (Salsa methods that are now synchronous
  but still awaited: `addBuildingToBlock3D`, `removeBlockBuilding3D`, `setPartTexture3D`, `createProceduralBuilding3D`,
  `createProceduralFoliage3D`, `createBlock3D`, `registerUISound`), 1 sparse array (a stray `,` hole in the
  `IllustrationComponent` providers list), 1 self-assign (`particle-emitters.component.ts`, `rec.id = rec.id`).
- **Sanity baseline** (`scripts/source-sanity-baseline.json`): mixed EOL in `illustration.component.scss` and
  `ribbon-panel.component.scss`; U+FFFD in `particle-emitters.component.html/.scss` comments.
- **CI**: `.github/workflows/client-check.yml` (repo root) checks out Frogmarks plus `ZainGS/salsa` in the layout
  that `file:../../../salsa` expects, builds Salsa (for `dist/*.d.ts`), then runs `npm run check` on Node 22.12.
  So a Salsa API rename that Frogmarks still calls now fails CI. If Salsa is private, add a read-only PAT as the
  secret `SALSA_READ_TOKEN`.
- **Optional pre-commit hook** (not installed): `git config core.hooksPath ClientApp/scripts/git-hooks` from the
  Frogmarks repo root runs `check:fast` when a commit touches ClientApp/. Undo it with `git config --unset core.hooksPath`.
- **Clean-up, later on 2026-10-04 (behaviour-neutral; Salsa `docs/dev/checks-and-ci.md` follow-ups 1–4):**
  - Sanity baseline: empty. The mixed EOL in `illustration.component.scss` / `ribbon-panel.component.scss` and the
    U+FFFD in the `particle-emitters` comments were repaired.
  - Suppressions 41 → **3**. `await-thenable`: the stray `await`s were removed in `block-panel`
    (`addBuildingToBlock3D`, `removeBlockBuilding3D`), `ui-system-panel` (`registerUISound`) and `procedural-panels.service.ts`
    (`createProceduralBuilding3D`, `createProceduralFoliage3D`, `createBlock3D`). Duplicate `class`: the 6 `<div class="mt-2" class="properties-panel-border">` in
    `board.component.html` became `class="properties-panel-border"` (Angular already kept only the last `class`).
    Also the stray `,` in the `IllustrationComponent` providers list, and `rec.id = rec.id` in
    `particle-emitters.resetToPreset` (it now saves the id first; the seeds have no `id`). `eqeqeq` ×19 → `===`/`!==`
    (`board.component.ts`, `dashboard.component.ts`; all string, boolean or number operands).
  - `no-floating-promises` warnings 99 → 0, and the rule is now an **error**. Fire-and-forget calls (mostly
    `router.navigate`, `saveNow`, `clipboard.writeText`, engine calls, the `gzip-utils` stream writer) got `void`.
    Nothing new is awaited and nothing was re-ordered.
  - Still suppressed: `character-panel` `await setPartTexture3D` and `cloth-builder:384` `disableLiveCloth` (other
    agents were editing those files), and `api.service.ts` `resultType == 3` (server JSON, so check that it is always
    a number before using `===`).

## 2026-10-03 — Natural walk / run + "Walk style: Natural / Stomp" (Salsa gait pass, 2026-10-03) — BUILT in Frogmarks

Engine docs: `docs/ui/play-mode.md` §"Natural walk / run + the Stomp walk style".

- **Engine (no wiring needed):** the runtime default `Walk`, `Run` and `Stroll` clips were rebuilt.
  - Walk: heel-to-toe roll; the pelvis is a smooth wave, highest at mid-stance, fitted so the landing foot glides onto
    its heel (it used to hang about 4 cm up and drop: the "stomp"); the swing knee folds to about 60°; the feet land
    apart.
  - Run: a shorter stride at a higher cadence, the foot landing nearer under the body, a flight phase, a heel kick and
    knee drive, and a whole-body lean.
  - Authored clips, library entries and locomotion sets are unchanged.
- **The old walk is kept as the runtime clip `Stomp`** (for custom use, e.g. wading through swamp water).
- **API:**
  - `sm.setPlayWalkStyle3D('natural' | 'stomp')` / `getPlayWalkStyle3D()`. Default `'natural'`. It swaps only the
    runtime default Walk, is live while playing, and persists as `globalScene.play.walkStyle` only when `'stomp'`.
  - Per avatar: `sm.setPlayerLocomotionSet3D({ idle: 'Stand', walk: 'Stomp', run: 'Run' })`. A runtime default clip
    name the rig lacks is generated for it.
- **Applied in Frogmarks** (backups: agent scratchpad `pupdrive/anim3/backup/`): the Play settings popover in
  `scene-view-bar.component.html` / `.ts` gained a **Walk style** select (Natural / Stomp) under "Motion looseness".
  - State is read back in `_syncPlaySettings`.
  - Calls are guarded `(this.shapeManager as any).fn?.()`, and a change emits `dirty`.
  - `npx tsc -p tsconfig.app.json --noEmit` is clean.
- **Please verify in the browser** (after a Salsa dist rebuild):
  - Play and walk: the steps should read light, heel to toe, with no foot dropping onto the ground.
  - Shift: the run should have both feet off the ground between steps.
  - Set Walk style to Stomp: the heavy tread comes back. Save and reload: the setting is kept.


## 2026-10-04 — Persona UI kit: HUD, menus, transitions (Salsa visual-polish-next #15) — BUILT in Frogmarks

Engine docs: `docs/ui/persona-ui-kit.md` (Salsa) and `docs/specs/ui-system.md` §"UI kit".

- **Engine:** screen-space kit widgets stored on a UI layer (`UILayerData.kit`, optional, so old documents load
  unchanged). They are laid out in a 1920x1080 design space by anchor, drawn by one instanced SDF / pattern shader on
  the final swapchain image (full resolution, unaffected by TAAU, resolution scaling, bloom and grading), and saved
  with the document like the rest of the UI layer.
- **Pieces (15 kinds, 21 presets):** slanted / torn panels, card, screen tone, heading, ransom letters, HP/SP bar,
  status panel, date / weather corner, mini-map frame, button prompt, menu list, splash text, damage number,
  location banner and call-out.
- **Transitions** (usable on any transition's Animation): `slash`, `shatter`, `stripeBurst`, `panelSlide` and
  `zoomPunch`. A covering transition keeps the old state's kit widgets on screen until the screen is covered.
- **Widgets act like shapes:** a widget id works in state shape visibility, show/hide actions, interactions and
  `playAnimation` (clips `intro | slide | pop | punch | drop | spin | shake | wobble | pulse`).
  - Menu items fire `click` triggers with targetId `<menuId>#<slug>` (e.g. `kit-1a2b3c4d#resume`).
  - Arrow keys, W/S, the d-pad, Enter and A drive a shown menu. `selectedVar` binds the selection to a variable.
- **API:**
  - `sm.listUIKitPresets()`, `sm.getUIKitSchema()` (property specs per kind for generic controls).
  - `sm.insertUIKitPreset(id, layerId?)`, `sm.insertUIKitDemo('hud' | 'pause')`.
  - `sm.getUIKitWidgets(layerId?)`, `sm.getUIKitWidget(id)`, `sm.updateUIKitWidget(id, patch)`,
    `sm.removeUIKitWidget(id)`, `sm.addUIKitWidget(kind, layerId?)`.
  - `sm.playUIKitClip(id, clip)`, `sm.previewUIKitTransition(type, ms?)`.
  - `sm.uiKitMenuMove(delta)`, `sm.uiKitMenuActivate()`, `sm.setUIKitClock(ms | null)` (frame capture).
- **Applied in Frogmarks** (backups: agent scratchpad `pupdrive/uikit/fm-backup/`): `ui-system-panel.component`
  `.ts` / `.html` / `.scss`.
  - A **Persona kit** section at the bottom of the UI panel (shown even before any UI layer exists):
    - **+ Persona HUD** and **+ Pause menu** demo buttons;
    - a preset select with **Insert**;
    - a transition select with **▶ Preview**;
    - the layer's piece list;
    - a property editor for the selected piece: name, anchor, x / y, scale, rotation, z, opacity, intro, play-clip,
      states, then every schema property (number / bool / select / colour token or custom colour / text);
    - **Delete piece**.
  - The transition **Animation** select gained a "Persona kit" option group.
  - Every call is guarded `(this.shapeManager as any).fn?.()`, and every `*ngFor` array is cached.
  - `npx tsc -p tsconfig.app.json --noEmit` is clean.
- **Please verify in the browser** (after a Salsa dist rebuild):
  - Click **+ Persona HUD**, then **+ Pause menu**, then **▶ Preview** in the UI panel.
  - Escape opens the pause menu with the stripe burst. The arrows move the highlight (it snaps and wobbles). Enter on
    RESUME closes it with the slash. F plays the splash.
  - Edit a piece's properties: the canvas updates live. Save and reload: the pieces and their edits are kept.

---

## Hair styles: big anime locks (Salsa hair-styles.md B–E: DONE 2026-10-04 · Frogmarks UI: DONE)

- Salsa: `hairMode: 'locks'` + 8 presets (15 with part 2, below; part 1 is in the 03:20 dist → browser check only); `sm.getHairStyles3D()`, `sm.getHairStylePreset3D(name, seed)`, `sm.applyHairStyle3D(bodyId, name)`.
- Frogmarks: character panel Hair → Style picker + Vary, Styled-mode Fringe / Length + locks / Tails + bun controls, Mode "Styled";
  Generate Hair + the random character use a style (`utils/character-randomizer.ts`). Guarded calls, cached lists, tsc clean.
- Still to check in the browser after a dist rebuild (Salsa docs/ui/frogmarks-update-2026-09-28.md, 2026-10-04 section).

---

## District palette, roof variety, density, mover shadows (Salsa visual-polish-next #11 / #16 + ink #3b: DONE 2026-10-04 · Frogmarks UI: DONE)

- Salsa: `world.setDistrictPalette(on)`, `world.setRoofVariety(on)`, `world.setCrowdDensity(v)`, `world.setTrafficDensity(v)`,
  `world.setMoverShadows(on, strength?)` (+ getters). Scene presets turn the palette + roof variety on; new cities default to
  crowd 1.4 / traffic 1.3; saved cities keep their old look. Graphic ink: `creaseFade.thinPx` (no dashed mid-range ledges).
- Frogmarks: City panel look section — District palette, Roof variety, Crowd density, Traffic density, Mover shadows (+ strength).
  Guarded calls, tsc clean.
- Still to check in the browser after a dist rebuild (Salsa docs/ui/frogmarks-update-2026-09-28.md, 2026-10-04 "District palette" section).

---

## Roof equipment: Classic / Clustered (Salsa visual-polish-next #11 tail: DONE 2026-10-04 · Frogmarks UI: DONE)

- Salsa: `world.setRoofEquipment('classic' | 'clustered')` / `world.roofEquipment` (CityLook `roofEquipment`). Clustered
  means one stair box, one coloured tank and one AC bank per flat roof, plus district extras. It is on for new cities and
  presets; saved cities are pinned to classic. Tiles are no heavier (0.06–0.34 MB lighter).
- Frogmarks: City panel look section, a **Roof equipment** select next to Roof variety. Guarded calls, synced from the
  engine, tsc clean.
- Still to check in the browser after a dist rebuild (Salsa docs/ui/frogmarks-update-2026-09-28.md, 2026-10-04 "Roof equipment" section).

---

## Character scale: Scale / Height (m) / Fit to city (Salsa 2026-10-04: DONE · Frogmarks UI: DONE)

- Salsa: `sm.getCharacterScale3D(id)`, `sm.setCharacterScale3D(id, s)`, `sm.setCharacterHeight3D(id, metres)`,
  `sm.fitCharacterToScene3D(id, metres = 1.7)`: uniform whole-character scale, feet planted, saved, undoable; Play's
  camera / eye height / capsule / stride follow the size; height-slider edits keep the feet; city spawn stands on its soles;
  the gizmo scales a character uniformly from its feet.
- Frogmarks: character panel **Size** group (Scale slider + box, Height (m), Fit to city). Guarded calls, tsc clean.
- Still to check in the browser after a dist rebuild (Salsa docs/ui/frogmarks-update-2026-09-28.md, 2026-10-04 "Character scale" section).

---

## Landing dust + Idle variety (Salsa Play polish extras 2026-10-04: DONE · Frogmarks UI: DONE)

- Salsa: `sm.setPlayLandingDust3D(on)` / `sm.getPlayLandingDust3D()` and `sm.setPlayIdleVariety3D(on)` /
  `sm.getPlayIdleVariety3D()`. Both default on and are saved with the document only when off. Landing dust = puffs on
  landings sized Land Soft / Land / Land Deep, running footstep puffs, splashes when wet; ground-coloured, lit, fogged,
  free while idle. Idle variety = Look Around / Stretch / Check Wrist / Foot Tap / Adjust Glasses (with a glasses charm)
  over the default Stand; never over an authored Idle. `sm.getPlayPolishStats3D()` for diagnostics.
- Frogmarks: Play settings popover (scene-view-bar), **Landing dust** and **Idle variety** checkboxes under Jump
  variety. Guarded calls, synced in `_syncPlaySettings`, tsc clean.
- Still to check in the browser after a dist rebuild (Salsa docs/ui/frogmarks-update-2026-09-28.md, 2026-10-04 "Landing dust + Idle variety" section).

---

## Anime head + chin shadow, 7 more hair styles, panel "controls that do nothing" audit (Salsa 2026-10-04: DONE · Frogmarks UI: DONE)

- Salsa: new bodies get `BodyParams.headShape: 1` (anime head) + a shaped chin shadow (the grey neck band is gone); hair
  styles part 2 (`braid`, `twin-braids`, `wavy`, `curls`, `spiky`, `drills`, `curly-volume`; HairParams `lockCurl`,
  `lockCurlType`, `lockCurlFreq`, `lockSpike`, `hairPoof`, `tailForm`, `drillTurns`); `hair-control-modes.ts` = the
  key → hair-mode map (unit-tested against the generator and against this panel's copy).
- Frogmarks (backups: agent scratchpad `pupdrive/look2/fm-backup/`): character panel. Hair: Hair type row first; every
  hair control gated by `hairShow(key)` (`HAIR_CONTROL_MODES` + gathered rule `HAIR_GATHERED_INERT`); Curl + volume and
  Tail form / Drill turns for Styled; Tail tip Chunky-only; Styled bun size range; Highlight band needs Sheen. Face kit:
  Nose size / Shadow depth hidden when inert. Eyes: Closed eye hides the eyeball controls. Clothing: Leg width for Shorts,
  Heel lift when set. Guarded calls, cached arrays, tsc clean.
- Still to check in the browser after a dist rebuild (Salsa docs/ui/frogmarks-update-2026-09-28.md, 2026-10-04 "Anime head + chin shadow, 7 more hair styles" section).

---

## Engine-only perf A/Bs P16–P22 (Salsa: DONE 2026-10-02 → 10-04 · Frogmarks: nothing to wire)

- All default ON in the engine; session-state A/B switches for diagnostics, no panel needed (salsa docs/ui/performance.md):
  P16 `sm.setStreamHitchOptions3D`, P19 `sm.world.setStreamMotion` (+ the optional skyline impostor ring
  `sm.world.setStreamHlod({ ring: true })`, default OFF — a possible "Skyline ring" checkbox), P20 `sm.world.setLighterTiles`,
  P21 `sm.setShaderVariants3D`, P22 `sm.world.setTileLanding` (**P22 needs a dist rebuild**).
- 0 hits for these in Frogmarks src (expected).

## Energetic run + jog, clothing fit round 2 (Salsa: 2026-10-04 · Frogmarks: automatic / pending)

- Run + jog (`jogMix` in `getPlayerAnimationState3D`): automatic, no UI. **Needs a dist rebuild**, then a Play check.
- Clothing fit round 2 (Salsa DONE 2026-10-04; salsa docs/specs/clothing-generation.md §16, docs/ui/character-creator.md
  "Fit round 2", play-mode.md "Skirt hem swing"): body-hiding mask, cloth lining, pelvis → thigh weight smoothing, the
  mid-thigh knee share, garment layer order (top over the bottom, trousers over socks), long hair layered over the shirt,
  and the Play skirt hem swing. All automatic (on by default). **Frogmarks (built 2026-10-04):** character panel —
  "Hide body under clothes" checkbox on the Top and Bottom tabs (`setHideBodyUnderClothes3D`; the panel also sets
  `hideBody` on its own param copies) and "Skirt swing" 0–1.5 on the Bottom tab for skirts (`setSkirtSwing3D`, writes
  `hemSwing` to the panel copy). Guarded `(this.shapeManager as any).fn?.()`; `npx tsc -p tsconfig.app.json --noEmit` clean.
  **Needs a dist rebuild**, then check: run in trousers (no knee skin), run in a long skirt (no knee cap, dark inside,
  the hem trails), untick Hide body (skin may poke again), Skirt swing 0 (no swing).

## Outliner: a new character is ONE "Character" row from the start, with a Player button (Frogmarks fix, 2026-10-04)

- **Bug:** adding a character showed its parts as loose rows (body + FaceEyes / FaceFeatures / FaceBrows + hair +
  garments); adding any other object then "fused" them into one 👤 Character row, and that row had no 🕹 Player button.
- **Root cause (Frogmarks, not Salsa):** the engine already nests a character for the outliner at creation
  (`getScene3DHierarchy` emits a virtual `{ id: bodyId, name: 'Character', type: '3DMeshGroup', character: true,
  children: overlays }` row). `scene-add.service.ts` skipped that: after `createFullCharacter3D` it pushed each
  `getNode3D(id)` (flat per-mesh rows) and never re-indexed the body / part id sets, so the outliner stayed flat until
  the next full `scene3dRefreshMeshes()`. The Player button was hidden on every `3DMeshGroup` row, which includes the
  virtual Character row.
- **Fix:** `SceneOutlinerService.scene3dAddCharacterNode(bodyId, nodeIds)` pushes ONE grouped row in the engine's shape
  and indexes the body + part ids (still O(1), no re-scan). The template shows 🕹 on the Character row (its id IS the
  body mesh, so `scene3dSetPlayerObject(node.id)` is unchanged) but not on its parts; parts are listed under an
  expanded Character row (the `scene3dCharPartIds` filter now only hides them at the top level); hovering the row
  highlights the character. A character row starts collapsed the first time it shows (engine `collapsed: true`).
  Selecting the row selects the body → the engine expands it to the whole character. No engine change, no dist rebuild.
- Files: `services/scene-add.service.ts`, `services/scene-outliner.service.ts`,
  `components/scene-outliner/scene-outliner.component.html`. `tsc -p tsconfig.app.json` + `ngc` clean.
- **Check:** add a character → one collapsed 👤 Character row with 🕹; expand → parts; 🕹 → Play follows it; add a box →
  the row doesn't change; reload → same.

## Play camera: hard vs soft occluders + "Camera: Auto / Block / Ignore" (Salsa 2026-10-04: DONE · Frogmarks UI: DONE)

- Salsa (`src/game/camera-occluders.ts`; play-mode.md "Hard vs soft occluders"): the 3P camera pulls in only for walls /
  buildings / ground / bridges / big solids; poles, lamps, signals, signs, trees, props, cars, walkers are passed through,
  and a soft object between the camera and the player dithers out (`Mesh3D.hlodFade` lane). Per-mesh override
  `sm.setMeshCameraBlock3D(id, 'auto' | 'block' | 'ignore')` / `getMeshCameraBlock3D(id)` (saved as `cameraBlock`);
  `sm.getCameraOccluderClass3D(id)` diagnostics.
- Frogmarks (backups: agent scratchpad `pupdrive/camocc/backup/`): `mesh-behavior-section.component.ts` / `.html`, a
  **Camera** select under the Behavior section. Guarded calls, tsc clean.
- **Needs a Salsa dist rebuild** (until then the select reads Auto and does nothing). Then check in the browser
  (Salsa docs/ui/frogmarks-update-2026-09-28.md, 2026-10-04 "Play camera ignores poles" section).

## 2026-10-06 — Mobile / touch batch (salsa docs/specs/mobile-parity.md TOUCH-1/2/4/10, BRUSH-2, UI-1)

- **Colour pickers** (persistent + shared): pointer events + capture + `touch-action:none`; per-instance `--hue`;
  `@ViewChild` instead of `document.querySelector('.color-gradient')`.
- **Global touch CSS** (`styles.scss`, `retro-chrome-theme.scss`, `index.html`): overscroll none, tap highlight off,
  `touch-action:manipulation`, coarse-pointer slider thumbs, `interactive-widget=resizes-visual`.
- **Brush lag (BRUSH-2)**: no zone entry per move during raster strokes; other drags coalesced to one CD per rAF;
  brush ring moved by a direct transform write (pen + touch).
- **UI-1**: tool rail scrolls; floating **Show UI** button on touch; editor `100vh` → `100dvh`.
- **Play touch overlay** (`app-play-touch-controls`, coarse pointers only): left stick, right-half look, Jump / Use /
  Run / Sneak / Stop; Play enters with `mouseLook:false` on touch. The stick needs Salsa's keyboard + host-input
  merge (TOUCH-4 Salsa half) and the `interact` copy in `setPlayInput3D`: both in Salsa source now, not yet in the dist.
- **Navigate** toggle (3D view bar, coarse pointers): calls `sm.setTouchNavigate3D(on)`. It's in Salsa source; the
  button stays hidden until the dist is rebuilt (guarded through a local type; drop the cast once the dist has it).
- ~~**Touch action bar** (`app-touch-action-bar`)~~: REMOVED, replaced by the menu items + contextual pill below.
- **Needs a Salsa dist rebuild**, then a check on the tablet.

## 2026-10-06 — Touch UI follow-up (TOUCH-10 replaced, UI-6 fullscreen, side panel)

- **Touch action bar removed.** Replaced by: Edit › **Duplicate** (`routeDuplicate` in `editor-keymap.ts`, like Ctrl+D:
  selected 3D mesh in the 3D view, else selected 2D shapes; disabled with nothing selected) and a context-routed Edit ›
  **Delete** (`routeDelete`: 2D = what the Delete key does; 3D = the outliner's delete path per item via
  `scene3dDeleteSelected`, selected faces in mesh edit mode via `MeshEditService.deleteSelectedFaces`).
- **File / Edit → View:** Toggle Full Screen (F), Toggle UI (X), Screencast Keys (was in Edit), and the old "Toggle
  Layer Tree" became **View › Side Panel** (`SidePanelService`, localStorage `fm-side-panel-visible`; display:none,
  panels stay mounted; the CD designer auto-shows it; zoom widget / stats move to the edge when it's off).
- **Contextual Apply / Cancel pill** (`app-touch-context-pill`, coarse pointers only, not in Play / hidden UI):
  `CONTEXT_PILLS` + `MODE_ACTIONS` shared with Enter / Esc. Transform (Apply / Cancel), knife (Cancel), decals (Done),
  LiveText (Done).
- **Brush list auto-close on touch** (`ToolSubpanelCollapse`, `<app-brush-options (brushPicked)>`): tap the tool again
  to reopen; desktop unchanged.
- **Fullscreen = `document.documentElement`** (`shared/utilities/app-fullscreen.ts`) in the illustration AND board
  editors (UI-6): the rail, sub-panels, colour picker, timeline and CDK overlays no longer vanish.
- **Persona kit hidden** in the UI panel (WIP): `SHOW_PERSONA_KIT = false` in `ui-system-panel.component.ts`; per-machine
  dev override `localStorage['fm-dev-persona-kit'] = '1'`. A transition already using a kit animation still lists it.
- **AI Scene Authoring tool hidden** (WIP): the rail button + sub-panel are gated by `SHOW_AI_TOOL = false`
  (`illustrate/utils/ai-tool-flag.ts`); dev override `localStorage['fm-dev-ai-tool'] = '1'`. No keyboard shortcut existed.
- Not yet checked on the tablet.
