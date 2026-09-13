# Salsa Feature Tracker

Phase/spec status and Frogmarks UI work still needed.
Update this file as Salsa ships and as we wire things up.

---

## Phase 1 — Retro Text Effects (Salsa: DONE)

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
