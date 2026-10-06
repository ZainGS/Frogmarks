# Illustrate editor — architecture map

Where things live in the Illustration editor (`components/illustration/`), and the patterns the code follows.
Read this before adding to the editor; the history of each move is in `docs/refactor-plan.md` (2.x rows).

## Module

Everything here is declared in `illustrate.module.ts`, which is **lazy-loaded** at `/illustration` and `/view` (it
also owns the routes and the flush-on-leave guard). A new editor component goes into its `declarations`, not
`app.module.ts`. Components shared with the eager app (colour picker, Boards brush options / raster layers / selection
toolbar) live in `shared/shared-ui.module.ts`.

## The editor component

`IllustrationComponent` is the shell. It still owns:

- engine boot and teardown (`initForIllustration`, `afterRendererBoot`, `_teardownEngineSubs`, `ngOnDestroy`)
- selection: 2D layers / shapes and the 3D mesh selection (`scene3dSelectMesh`, `scene3dSelectedMeshId`)
- tool switching (`setActiveTool` → the `_sync…Tool` steps) and the raster layer list
- canvas pointer routing (`scene3dCanvasPointerDown/Move/Up`: mesh edit / knife → UV stamp → ribbon handles → picking)
- entering / leaving 3D (`onScene3dSelected` → `_enter3dContext` / `_leave3dContext`), view mode (target × camera),
  exclusive 3D sub-modes (`_exitAllScene3dModes`), the 3D mesh lifecycle (delete / duplicate / group), the panel
  open flags, menus (`closeAllMenus`)
- hotkey dispatch: `handleHotkeys` → `editor-keymap.ts` (`MOD_KEYMAP`, then `TOOL_KEYMAP`; shortcuts are data)

Everything else is in a component-scoped service or a child view.

## Component-scoped services (`services/`)

All are listed in the editor's `providers`, so there is one instance per editor and child views inject the same one.
The editor template reaches them as `<var>.member`.

| var | service | owns |
|---|---|---|
| `editorState` | EditorStateService | **shared state**: 3D mesh list + selection (id / ids / type / group / name), 2D raster layers + layer selection, camera / view mode (projection, FOV, target × camera, 3D panel up). No dependencies — inject it anywhere |
| `persist` | IllustrationPersistenceService | load (local / OPFS / cloud), save, dirty tracking (`sceneChanged$`), thumbnails, autosave |
| `doc` | DocumentActionsService | title, new / duplicate, back to dashboard, set thumbnail, PNG exports, Export dialog flag, export reminder |
| `files` | ProjectFileService | .frogmarks / .frogcart / .frog files, publish + share, viewer-mode boot |
| `storage` | StorageSettingsService | sync-mode dialog, OPFS size, layer pixel codec |
| `engineStatus` | EngineStatusService | shader warm-up / worker-job pill, GPU device-lost banner, deferred-save notice |
| `artboard` | ArtboardService | document size, resize dialog, artboard shadow + size label, fit, zoom |
| `canvasLook` | CanvasAppearanceService | background + dot colours, paper grain, canvas grid |
| `draw` | DrawingOptionsService | 2D drawing options: colours + palettes + recent, pattern, stroke, brush, stamps, arrowheads, shapes, polygon presets, SDF defaults |
| `imports` | MediaImportService | image import (picker, paste, drag-drop) and 3D model import (.glb / .gltf / .obj) |
| `s3` | Scene3dSettingsService | scene-wide 3D render / environment settings (lighting, sky, fog, SSAO, grid, snap, …) |
| `anim` | SceneAnimationService | 3D animation player, keyframes + tracks, cinematic cameras, Play-mode player object |
| `add` | SceneAddService | Add-Mesh menu actions and quick-forms, procedural character |
| `procedural` | ProceduralPanelsService | building / foliage / block: add, selection flags, which editor panel is open, delete |
| `character` | CharacterEditService | Edit Character panel (which body), generated params, eye drawing, procedural idle |
| `stats` | SceneStatsService | 3D stats overlay + budget warning |
| `outliner` | SceneOutlinerService | scene hierarchy, node-kind id sets (cloth, character, building, decal, …), collapse / rename / visibility |
| `ribbon` | RibbonService | ribbon settings, control points, path presets, on-canvas handles |
| `meshEdit` | MeshEditService | mesh edit mode (enter / exit / `editMesh`), edit tool, knife start / preview / cut |
| `uv` | UvEditorService | UV editor session, UV canvas handlers, paint target, stamp tool, clothing paint slot |
| `hud` | ViewportHudService | keyboard-transform HUD (G/R/S), snap badge, gizmo angle label, screencast keys |
| `creator` | CreatorService | procedural creators |
| `decal` | DecalService | decal tool |
| `arrayTool` | ArrayToolService | array (repeat) tool |
| `pkg` | PackageCreatorService | package creator |
| `fx` | LayerEffectsService | 2D dither (global + per layer) and per-layer Frame Link |
| `pl` | PanelLayoutService | comic panel layout + bleed / gutter guides |
| `rt` | RasterTextService | raster text tool |
| `fw` | FillWandService | flood fill + magic wand options |

**Hosted services.** A service that needs editor state declares
`type XHost = Pick<IllustrationComponent, …exactly the members it uses>`, using a type-only import so there is
no runtime cycle. The editor calls `this.x.bind(this)` in `ngOnInit`. A renamed editor member then breaks the
Pick at compile time. Prefer injecting another service over adding it to a host Pick (e.g. `SceneAddService`
injects `SceneOutlinerService`) — **unless that would make an injection cycle**, which compiles but fails at runtime
(NG0200). Then the lower-level service reaches the higher one through its host instead: `this.host.doc.x` with
`'doc'` in its Pick (persistence / project files → `doc`, UV editor → `character`). `npm run check:di-cycles` guards
this. A moved method used as a callback must be bound to the service (`this.svc.fn.bind(this.svc)`).

**Shared state goes through `EditorStateService`, not a host Pick.** Read and write selection / camera / layer
state on `editorState` (inject it). Behaviour that changes the selection stays with its owner: select through the
editor's `scene3dSelectMesh(id)`, and drop the selection with `clearMeshSelection()` (id + per-mesh flags + the engine's
selection) — never by assigning `scene3dSelectedMeshId = null`. Animation mode is the engine's: read
`animationEnabled`, change it with `setAnimationEnabled()`.

## Child views (`components/`)

- **Mesh inspector sections**: `mesh-*-section`, `cloth-inspector`, `ribbon-panel`, `array-group-panel`. They take
  `[meshId]`, load in `ngOnChanges`, and the editor calls `load(id)` on a same-id reselect.
- **Thin views over a service** inject it and bind `svc.member`: `creator-panel`, `decal-panel`, `array-tool-panel`,
  `scene-outliner`, `scene-render-settings`, `scene-advanced-settings`, `scene-anim-section`, the 2D tool-option panels
  (`fill-options`, `magic-wand-options`, `raster-text-options`, `panel-layout-options`, …).
- **Hosted views** (`[editor]="this"`, typed by a Pick) are for markup that calls many editor methods:
  `editor-menubar`.
- **Requests back to the editor** go through typed outputs: `(action)` unions on `scene-outliner` and
  `add-mesh-menu`, and plain outputs elsewhere.
- Feature panels with their own state: world, character, building / foliage / block, skins, CD designer, armature,
  mesh edit, UV editor, grease pencil, particle emitters, UI system, animation timeline, export modal, …

### Big feature panels: panel-scoped services (+ section components)

A panel too big for one class keeps the editor's pattern one level down. State and logic live in **panel-scoped
services** next to the panel (`providers: [...]` on the panel, `svc.bind(this)` in its constructor, host typed as a
`Pick<Panel, ...>`). The panel keeps its inputs / outputs, lifecycle and the loader that fills every service on open.
Each service clears its own timers / engine work in its own `ngOnDestroy` (Angular calls it for component-provided
services). Templates bind `svc.member`.

- **character-panel**: `look` (body, skin, shading, render style), `face` (face kit, expressions, blink, eyes, gaze),
  `hair`, `clothing` (all slots), `charms`. The template is split into `sections/char-*-section` components (body, face,
  eyes, hair, clothing, charms) that inject the panel as `cp` plus their service; the menu stays in the panel.
  `HAIR_CONTROL_MODES` / `HAIR_GATHERED_INERT` and the `hairShow()` helpers **must stay in
  character-panel.component.ts** — Salsa's `hair-control-modes.test.ts` reads that file to compare its copy.
- **armature-panel**: `rig` (skeletons, joints, IK, constraints), `binding` (bind + weight paint), `anim` (clips, NLA,
  retarget), `library` (preset poses, pose / animation / global library), `spring`. One template (stacked sections).

### Drill-down navigation (City, Edit Character)

Big panels don't show every control at once: a view is a short menu of buttons (`.nav-tile`, with a subtitle naming
the first few controls inside), each opening one group's controls, with a Back header (`.nav-header`, breadcrumb).
State is `utils/sub-nav.ts` `SubNav` (`id` null = the menu; `open(id, label)`, `close()`, `reset()`); styles are
`styles/_sub-nav.scss` (imported only by the panels that use it).

- City: `worldNav` (Presets, Look, Time & Weather, Layout, Streets & Buildings, Life & Props, Edge, Performance) →
  `worldSub` (the groups inside). The Performance readout polls only while that section is open.
- Character: `charSection` (the existing menu) → `cp.nav`, a `NavStack` of 3 levels exposed as `cp.sub` / `cp.sub2` /
  `cp.sub3` (opening a level resets deeper ones; Back closes the deepest). Eyes live under Face: Face › Eyes (eye
  states, gaze, blink) › a state's settings › Iris / Lashes / …. A charm opens `charm:<id>`; placing a new charm opens it.
- **Adding controls**: put them under an existing group heading (`<ng-container *ngIf="nav.id === 'x'">`), or add a
  new group = a wrapper `*ngIf="nav.id === 'new'"` plus a `.nav-tile` in the menu with the same conditions as the
  controls. Content outside every group shows on the menu view only.

## Styles

- `styles/_panel-controls.scss`: the shared control rules (`.scene3d-*`, sliders, rows, buttons). A child view
  `@import`s it first, then its own rules, which keeps the editor's cascade order.
- `styles/_modal-shell.scss`: the modal frame shared by the export modal and the Script API reference.
- A rule used by only one view lives in that view's stylesheet.

## Checks (run after moving code)

```
npx tsc --noEmit -p tsconfig.app.json
npx ng build --configuration development
npm run check:sm-types     # no untyped ShapeManager calls (also runs as prebuild)
npm run check:templates    # template identifiers exist on their component — strictTemplates is off
npm run check:di-cycles    # no injection cycles among the editor's services
npm run check              # all of the above + sanity + ESLint (no ng build)
npm run test:ci            # unit tests, headless Chrome (persistence save paths, OPFS meta queue, keymap, CSRF header)
```

`strictTemplates` is off, so event-handler expressions in templates are **not** type-checked. After moving a member,
`check:templates` is what catches a template still calling it on the old owner. It scans nested component folders
(e.g. `character-panel/sections/`) and also checks `svc.member` for constructor-injected classes it can resolve through
a relative import (panel-scoped services, the parent panel as `cp`).
