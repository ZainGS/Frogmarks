# Mode chrome

Shared, presentational UI for the Edit Mesh / Edit Armature redesign (salsa `docs/reviews/ui-review-2026-10-07.md` §4).
Every component is controlled: the mode owns the state, passes it in, and handles the outputs. Nothing here talks to
the engine. All are declared and exported by `IllustrateModule`.

| Piece | Selector | Where |
|---|---|---|
| Header bar | `app-mode-header-bar` | fixed, below the top bar (`top: --fm-topbar-h`), from 70 px to the right edge |
| Tool strip (+ hint line) | `app-mode-tool-strip` | fixed, the left rail's slot: `left 0`, 70 px wide, full height |
| Operation pill | `app-mode-op-pill` | fixed, bottom centre of the free viewport (all devices) |
| Radial menu | `app-mode-radial-menu` | fixed full-screen layer around a press point |
| Properties panel | `app-mode-props-panel` | fixed, the right column's slot (280 px + 4 px border) below the header bar |
| Long-press helper | `LongPressDetector` (`long-press.ts`) | plain TS, attach to the canvas |

Types: `mode-chrome.types.ts`. Icons: `mode-icons.ts`. Value logic: `op-pill-logic.ts`, `radial-layout.ts`.

**Round-2 feedback (2026-10-08) supersedes parts of what follows:** no mode uses the header bar or the tool strip any
more (their files stay). In a mode the main rail, its sub-panels and the "3D TOOLS" strip stay visible; only the colour
picker, the right column and its drawer handle are hidden (`.mode-chrome-active` in illustration.component.scss; the
green frame closes where the picker was). Rail tools the mode uses itself stay inside it, any other rail tool leaves the
mode first: the per-mode allowlist `MODE_RAIL_TOOLS` in `mode-toolbar-scope.ts` (buttons are tagged
`data-rail-tool="…"`). The op pill takes `[showCancel]="false"` and `[showFrame]="true"` (always shown, Frame only when
no tool is active); the props panel starts below the top bar (the mode's host sets `--mpp-top`) and holds the mode's
switches and icon-only tools. Esc leaves the mode; the top bar's Undo / Redo are the mode's.

## Switching a mode on (IllustrationComponent)

- `useModeChrome: Record<'meshEdit' | 'armature', boolean>`: every switch is `false` for now, so nothing changes yet. Flip
  your mode's switch to `true` in the initializer when its content has moved.
- `activeModeChrome`: `'meshEdit' | 'armature' | null`. It is set when the switch is on and the mode is active
  (`meshEdit.scene3dIsEditingMesh && scene3dSelectedMeshId`, or `scene3dArmaturePanelOpen`).
- `modeChromeVisible`: `activeModeChrome && !uiHidden`. Mount the chrome under it.
- While `activeModeChrome` is set, `<body class="mode-chrome-active">` hides the rail, its tool sub-panels and mode label,
  the right column and its drawer handle, and the colour picker. They stay mounted. The canvas does not resize, because
  the strip is exactly the rail's 70 px.
- Fit (`ArtboardService.fitArtboard`) already counts `.mode-header-bar`, `.mode-tool-strip` and `.mode-props-panel` as
  docked UI, and `.mode-op-pill` and `.mode-props-handle` as floating UI.
- Things the mode still has to do: stop mounting its old overlay (`<app-mesh-edit-panel>` / `<app-armature-panel>`) when
  its switch is on. Keep `modePanelOpen` and the touch `contextPill` from also showing a pill for the mode (the op pill
  replaces the touch pill). Stop the canvas context menu's long-press (`canvasExtras.menuAllowed`) from competing with
  the radial menu. It is already off while `scene3dPanelVisible`.

```html
<!-- illustration.component.html, next to the old overlay (see the "Mode chrome" comment there) -->
<ng-container *ngIf="modeChromeVisible && activeModeChrome === 'meshEdit'">
  <app-mode-header-bar title="Edit Mesh" [subtitle]="editorState.scene3dSelectedMeshName"
      [segments]="meshSelectSegments" [activeSegment]="meshSelectMode" (segmentChange)="setMeshSelectMode($event)"
      [multiLatch]="meshMulti" (multiLatchChange)="meshMulti = $event"
      [canUndo]="true" [canRedo]="true" (undo)="editUndo()" (redo)="editRedo()" (frame)="frameMeshSelection()"
      [menuItems]="meshMenu" (menuAction)="runMeshMenu($event)" (done)="meshEdit.exitMeshEditMode()"></app-mode-header-bar>

  <app-mode-tool-strip [tools]="MESH_TOOLS" [activeTool]="meshTool" (toolChange)="setMeshTool($event)"></app-mode-tool-strip>

  <app-mode-op-pill *ngIf="meshOp as op" [class.above-timeline]="animationEnabled"
      [title]="op.title" [params]="op.params" [note]="op.note"
      (paramChange)="setMeshOpParam($event)" (apply)="applyMeshOp()" (cancel)="cancelMeshOp()" (action)="meshOpAction($event)"></app-mode-op-pill>

  <app-mode-props-panel title="Mesh" [class.above-timeline]="animationEnabled">
    <app-mesh-edit-props [shapeManager]="shapeManager" [meshId]="editorState.scene3dSelectedMeshId!"></app-mesh-edit-props>
  </app-mode-props-panel>

  <app-mode-radial-menu [open]="radial.open" [x]="radial.x" [y]="radial.y" [items]="radial.items" [title]="radial.title"
      (pick)="runRadial($event); radial.open = false" (closed)="radial.open = false"></app-mode-radial-menu>
</ng-container>
```

Pass arrays and objects as stable references, such as constants or fields you replace when they change. Don't build
them in a getter on every check. The tool strip works out its group dividers in `ngOnChanges`, so if you edit the same
array in place, the dividers aren't recomputed.

## Components

### `app-mode-header-bar` (ModeHeaderBarComponent)
Inputs:
- `title: string`
- `subtitle?: string` (truncates)
- `segments: ModeSegment[]` (`{id, label, key?, title?}`)
- `activeSegment: string | null`
- `segments2?: ModeSegment[]` (for example, Rig | Animate)
- `activeSegment2?: string | null`
- `multiLatch: boolean | null` (`null` hides it)
- `canUndo = true`, `canRedo = true`, `showFrame = true`
- `menuItems: ModeMenuItem[]` (`{id, label, checked?, disabled?, separatorBefore?}`; `checked` set to anything other than `undefined` makes the row checkable)
- `doneLabel = 'Done'`

Outputs:
- `segmentChange(id)` and `segment2Change(id)`. Neither emits for the segment that's already picked.
- `multiLatchChange(bool)`
- `undo`, `redo`, `frame`
- `menuAction(id)`. It doesn't emit for disabled rows, and picking a row closes the menu.
- `done`

Behaviour:
- Layout order: title, then the segments, Multi and `segments2`, then Undo, Redo, Frame, ⋯ and a large green Done.
- On narrow screens the title shrinks first. Below 600 px wide the bar wraps to two rows: title and actions on the
  first, the segments on the second (they scroll sideways if needed). The page never scrolls sideways at 360 px.
- The ⋯ menu registers with `OverlayManagerService`: Esc or a tap outside closes it, and opening it closes any other
  menu.
- While mounted, the bar publishes `--fm-modebar-h` set to its measured height: 40 px, 48 px on a coarse pointer, and
  94 to 96 px when it has two rows.

### `app-mode-tool-strip` (ModeToolStripComponent)
Inputs:
- `tools: ModeTool[]` (`{id, label, icon, key?, hint, group?, disabled?}`)
- `activeTool: string`

Outputs:
- `toolChange(id)`. It doesn't emit for the active tool or a disabled one.

Behaviour:
- `icon` is either a short glyph or letter, shown as text, or `'svg:<id>'` for a built-in line icon. The built-in ids
  are `select move rotate scale extrude inset loopcut knife bevel bone addBone ik brush merge delete child`.
- Each button shows the icon and a small label. Below 560 px of height only the icon shows.
- A key chip appears on desktop hover and focus. The tooltip reads "Label (key) — hint".
- A divider is drawn wherever `group` changes.
- The active tool's hint is one line beside the strip, just below the header bar (`.mode-tool-hint`). It's live text
  (`aria-live`) that ignores pointer events.
- While mounted, the strip publishes `--fm-modestrip-w: 70px`.

### `app-mode-op-pill` (ModeOpPillComponent)
Inputs:
- `title: string`
- `params: ModeOpParam[]`
- `showApplyCancel = true`
- `applyLabel = 'Apply'`, `cancelLabel = 'Cancel'`
- `note?: string`
- `applyDisabled = false` (Apply shown greyed out, e.g. nothing selected for the op yet; Enter does nothing)

Add `class="above-timeline"` when the animation timeline is open.

Each `ModeOpParam` is `{id, label, kind, value, min?, max?, step?, unit?, options?, disabled?, title?}`. How each kind
behaves:
- `'number'` and `'int'`:
  - Drag sideways on the label to scrub it, with mouse, pen or finger. A number moves one step per 2 px, or a tenth of
    a step with Shift. An int moves 1 per 8 px.
  - Tap the value (or the label) to type. Enter commits, Esc backs out, and text that isn't a number is ignored.
    Accepted forms include `0,5` and `45°`.
  - On touch there are − and + buttons. ↑ and ↓ step the focused value.
  - Values are clamped to `min` and `max`. Ints are rounded. The step sets the precision shown (default 0.01).
- `'toggle'`: the value is a boolean, shown as a pressed button.
- `'axis'`: X, Y and Z chips (or `options`). A single pick (value `'x' | 'y' | 'z' | null`) gets a None chip, and
  tapping the picked axis again clears it. An array value (for example Mirror `['x', 'z']`) means multi-select.
- `'choice'`: chips for `options`. The value is the picked id.
- `'button'`: emits `action(id)`.
- `'text'` (added for Armature): a short name field. Enter or blur commits (`paramChange` with the string), Esc puts
  the value back. No key reaches the keymap or the pill's Enter = Apply.
- `'select'` (added for Armature): a dropdown of `options` for lists too long for chips (joints, clips). The value is
  the picked option id (a string).

Outputs:
- `paramChange({id, value})`. Write the new value back into `params`; the pill never changes them itself.
- `apply`, `cancel`, `action(id)`

Keys work only while focus is inside the pill (your keymap owns the global keys):
- Enter applies. Enter on Cancel cancels.
- Esc cancels.
- Neither key reaches the editor. Typing in a value field doesn't reach the keymap either.

Layout: the pill spans from 70 px to `--fm-modeprops-w` + 116 px (the zoom widget). When that space is under 600 px wide
(a container query), the pill drops to two rows: title and Apply/Cancel, then the params in one row that scrolls
sideways. On a screen 700 px wide or less it sits 112 px up, above the zoom widget.

### `app-mode-radial-menu` (ModeRadialMenuComponent)
Inputs:
- `open: boolean`
- `x`, `y`: the press point in client px
- `items: ModeRadialItem[]` (`{id, label, icon?, danger?, disabled?}`)
- `title?: string`

Outputs:
- `pick(id)`
- `closed`

In both cases, set `open = false`.

Behaviour:
- Items sit on a ring around the point: the first at the top, then clockwise. The ring grows with the item count and
  is moved to stay inside the viewport.
- Targets are 72 × 52 px, with a 52 px ✕ in the centre.
- Two ways to pick:
  - Drag and release: the press that opened the menu slides toward an item (it highlights) and lifts. Lifting within
    12 px of the press point picks nothing and leaves the menu open.
  - Tap: lift first, then tap an item. The opening press's own lift (a touch's compatibility click on the ✕ under the
    finger) is ignored: a click counts only after a pointerdown on the menu (keyboard clicks always count).
- Disabled items are never picked.
- Esc (overlay manager), a tap on the dimmed backdrop (the tap is eaten) or the ✕ close it.

### `app-mode-props-panel` (ModePropsPanelComponent)
Inputs:
- `title: string`

Outputs:
- `collapsedChange(bool)`

Content is projected with `<ng-content>`. Add `class="above-timeline"` when the timeline is open.

Placement: the editor's right-column slot. The top is `--fm-topbar-h` + `--fm-modebar-h`. The bottom is 0, or
`--fm-timeline-h` when `above-timeline` is set.

Collapsing:
- The handle on its left edge collapses and expands the panel.
- Docked (desktop, tablet landscape): the state is remembered in `localStorage['fm.modeProps.collapsed']` (`'1'` means
  collapsed), wrapped in try/catch.
- Drawer (`SidePanelService.drawerMode`: touch narrower than 1024 px): it overlays the canvas like the editor's drawer.
  It starts open only when at least 560 px of canvas stays beside it, and the state lasts only for the session.
- It publishes `--fm-modeprops-w`: `284px` when open, `0px` when collapsed.

### `LongPressDetector` (`long-press.ts`)

```ts
private readonly longPress = new LongPressDetector({
  onLongPress: p => this.ngZone.run(() => this.openRadial(p.clientX, p.clientY)),
  // delayMs 450, moveTolerancePx 8, pointerTypes ['touch', 'pen'] by default
});
// ngAfterViewInit:  this.detachLongPress = this.ngZone.runOutsideAngular(() => this.longPress.attach(canvasEl));
// ngOnDestroy:      this.detachLongPress?.();
// pointerup:        if (this.longPress.fired) { /* swallow the tap / selection this press would make */ }
```

It fires once a single touch or pen pointer stays still (within 8 px) for 450 ms. A second pointer cancels it, and no
new press starts until every pointer is up. `attach(el)` listens for pointerdown on `el`, and for move, up and cancel
on the window, all passive and in the capture phase. Use `pointerDown/Move/Up/Cancel(ev)` to feed it by hand, and
`cancel()` and `reset()` to stop it.

## CSS variables (on `<html>`, only while the owner is mounted)

| Var | Set by | Value |
|---|---|---|
| `--fm-modebar-h` | header bar | measured height (40 / 48 / about 94 px) |
| `--fm-modestrip-w` | tool strip | `70px` |
| `--fm-modeprops-w` | props panel | `284px` open, `0px` collapsed |

They're stacked per owner (`root-css-vars.ts`), so two bars swapping within one change detection never leave the value
missing. The editor's own `--fm-topbar-h` (40 px) and `--fm-timeline-h` (204 px) are set on the editor host.

## Z-index (fixed elements; `MODE_CHROME_Z` in the types)

| Layer | z |
|---|---|
| op pill, tool hint | 950 (the touch pill's level) |
| props panel and its handle | 999 |
| tool strip, header bar | 1000 (the rail's level; the top bar is 1001, so its menus open over the header bar) |
| header ⋯ dropdown | inside the header bar (1000), so it opens over the props panel |
| canvas context menu (existing) | 1200 |
| radial menu | 1300 |

## Styles

Every piece follows the retro-chrome look: `--rc-*` tokens with fallbacks, square corners only, raised and sunken
bevels, the `system-ui` font, and targets of at least 44 px under `(pointer: coarse)`.

- `src/app/illustrate/styles/_mode-chrome-mixins.scss` holds mixins only and outputs no CSS: `mode-raised`,
  `mode-sunken`, `mode-btn`, `mode-btn-on`, `mode-btn-primary` and `mode-surface`, plus `$mode-font`.
- `src/app/illustrate/styles/_mode-chrome.scss` holds the content classes for the props panel. Import it in your panel
  component's scss with `@import '../../styles/mode-chrome';`. `illustration.component.scss` already imports it, for
  markup written straight into the editor template. The classes are:
  - `.mode-props-section`: one block, with a divider between blocks
  - `.mode-props-section-title`: small caps, muted
  - `.mode-card`: a framed card, such as a modifier. Parts: `.mode-card-header`, `.mode-card-title`,
    `.mode-card-actions`
  - `.mode-row` and `.mode-row-label`
  - `.mode-btn`: modifiers `.on`, `.primary` and `.danger`; small size `.mode-btn-sm`
  - `.mode-chips`
  - `.mode-input` and `.mode-select`
  - `.mode-muted`

## Tests
- `long-press.spec.ts`
- `op-pill-logic.spec.ts`
- `radial-layout.spec.ts`
- `mode-chrome.components.spec.ts`: rendering, outputs, keys, overlay close, CSS vars, the stored collapse state
