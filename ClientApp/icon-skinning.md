# Icon Skinning System — Frogmarks Skin Builder

## Overview

Every `mat-icon` in the dashboard UI becomes replaceable. A new `<fm-icon>` wrapper
component renders the Material icon by default and switches to a user-uploaded image
(PNG, WebP, or SVG) when one is present in the active skin. All icons are square.
The skin builder gains an **Icons** section (section 4, before Export) with a
click-to-replace flow: when Icons mode is active, clicking any icon in the
live dashboard opens a file picker for that specific icon slot.

---

## 1. `FmIconComponent`

**Selector:** `<fm-icon name="explore">`  
**Module:** declare in `SharedModule`; import wherever `MatIconModule` is used

### Inputs

| Input | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Material icon name (e.g. `"explore"`) |

### Template logic

```
if skinService.getIconUrl(name) exists
  → <img [src]="url" [attr.data-fm-icon]="name">
else
  → <mat-icon [attr.data-fm-icon]="name">{{ name }}</mat-icon>
```

The `data-fm-icon` attribute is present on **whichever element renders** so the
inspector always has something to target via `querySelector`.

### Host styling (`fm-icon.component.scss`)

```scss
:host {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  // Matches mat-icon's default 24px square
  width: 1em;
  height: 1em;
  font-size: inherit; // inherits from parent so 18px / 24px / 36px contexts all work
}

img {
  width: 100%;
  height: 100%;
  object-fit: contain; // square-enforced; letterboxes non-square uploads
  display: block;
}
```

### Color token compatibility

- **PNG / WebP / JPEG** — rendered as `<img>`; ignores CSS color tokens intentionally.
  The user is supplying a pre-colored image.
- **SVG** — also rendered as `<img>` in v1 (simplest, works for all SVGs). SVGs that
  use `fill="currentColor"` will NOT auto-tint in this mode. A future opt-in `tint`
  input could inline the SVG as an `<object>` or data-URI to restore `currentColor`
  tinting. Deferred.

### File size limit

2 MB per icon (same as image slots). Enforced in the skin builder upload handler.

---

## 2. Icon Catalog — `FM_ICON_GROUPS`

A constant parallel to `FM_COLOR_GROUPS`, defined in `frogui-skin.service.ts`.
Each entry: `{ group: string; label: string; icons: string[] }`.

### Group 1 — Navigation

Icons in the left sidebar (primary nav + social/utility rows).

| Icon name | Where used |
|---|---|
| `explore` | Explore nav item |
| `storefront` | Design Center nav item |
| `view_quilt` | Templates nav item |
| `history_edu` | Tutorials nav item |
| `inventory_2` | Archive nav item |
| `newspaper` | Updates nav item |
| `help` | Help & Feedback nav item |
| `discord` | Discord social link |
| `photo_camera` | Instagram social link |
| `add` | Team section add button |

### Group 2 — Header

Icons in the top toolbar bar.

| Icon name | Where used |
|---|---|
| `search` | Search input magnifier |
| `check_box_outline_blank` | Batch select toggle (off state) |
| `check_box` | Batch select toggle (on state) |
| `notifications_none` | Notifications button |
| `settings` | Settings button |
| `person` | Profile / sign-in button |
| `add` | Invite members button |
| `logout` | Sign out menu item |

> `add` appears in both Navigation and Header; uploading a custom icon applies to
> **all** occurrences of that name across the entire UI. If per-occurrence overrides
> are ever needed, they get distinct registered names (e.g. `add-nav`, `add-header`).
> Deferred to a future version.

### Group 3 — Gallery

Icons in and around the grid/list view.

| Icon name | Where used |
|---|---|
| `grid_view` | Grid view toggle button |
| `menu` | List view toggle button |
| `favorite_border` | Un-favourited heart icon |
| `favorite` | Favourited heart icon |
| `drag_indicator` | Template drag handle |
| `radio_button_unchecked` | Batch checkbox (unchecked) |
| `check_circle` | Batch checkbox (checked) |
| `draw` | List-view type icon |

### Group 4 — Popup Card

Icons in the overlay card that appears when clicking a gallery item.

| Icon name | Where used |
|---|---|
| `link` | Copy link icon button |
| `file_copy` | Duplicate icon button |
| `text_fields` | Rename icon button |
| `inventory_2` | Archive icon button |
| `unarchive` | Restore icon button (archive view) |
| `local_fire_department` | Delete permanently icon button |

### Group 5 — Context Menu

Icons in the right-click context menu.

| Icon name | Where used |
|---|---|
| `open_in_new` | Open in new tab item |
| `link` | Copy link item |
| `file_copy` | Duplicate item |
| `text_fields` | Rename item |
| `inventory_2` | Archive item |
| `unarchive` | Restore item (archive view) |
| `local_fire_department` | Delete permanently (archive view) |

### Group 6 — Storage Panel

Icons in the OPFS and cloud storage bars.

| Icon name | Where used |
|---|---|
| `save` | OPFS storage bar header |
| `info` | OPFS tooltip trigger |
| `download` | Backup button |
| `cloud` | Cloud storage bar header |

### Group 7 — Settings Panel

Icons in the settings slide-out panel.

| Icon name | Where used |
|---|---|
| `close` | Close notification / settings panel |
| `campaign` | Empty notifications illustration |
| `palette` | Edit/Create skin button |
| `file_upload` | Import skin label |
| `format_color_reset` | Remove skin button |
| `delete_forever` | Archive-empty trash illustration |

### Out of scope (v1)

- **Material Symbols Outlined `<span>` elements** — the decorative chevron icons
  on action cards (`interests`, `draw`, `animated_images`, `upload`) use a different
  font class and are rendered in `<span>` not `<mat-icon>`. Skip v1; migrate if demand.
- **Skin builder own icons** (`save`, `undo`, `close`, `check`, `add_photo_alternate`,
  `remove`, `add` inside `.sb-panel`) — not skinnable by design.
- **Illustration / Board editor icons** — separate UI surface; address there when
  skin support is added to those views.

---

## 3. Data Model

### `FroguiSkinService` additions

```typescript
private _iconFiles = new Map<string, File>();    // name → uploaded File (for export)
private _iconUrls  = new Map<string, string>();  // name → object URL  (live preview)

/** Returns a blob URL if the active skin overrides this icon, else null. */
getIconUrl(name: string): string | null {
  return this._iconUrls.get(name) ?? null;
}

setIcon(name: string, file: File): void {
  const old = this._iconUrls.get(name);
  if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
  this._iconFiles.set(name, file);
  this._iconUrls.set(name, URL.createObjectURL(file));
}

removeIcon(name: string): void {
  const old = this._iconUrls.get(name);
  if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
  this._iconFiles.delete(name);
  this._iconUrls.delete(name);
}

/** All icon files — used by export. */
get iconEntries(): ReadonlyMap<string, File> { return this._iconFiles; }
```

`getIconUrl` is called from `FmIconComponent` on every render. Because Angular's
change detection re-evaluates the getter on each CD cycle, live-preview works
automatically after `setIcon` is called (no manual change notification needed).

### Manifest format (`manifest.json` inside `.frogui` ZIP)

```jsonc
{
  "name": "My Skin",
  "version": "1",
  "author": "...",
  "description": "...",
  "preview": "preview.png",
  "tokens": { "--fm-accent": "#7b5ea7", ... },
  "icons": {
    "explore": "icons/explore.svg",
    "storefront": "icons/storefront.png"
  }
}
```

Only overridden icons appear in `icons`. Absent entries fall back to the Material font.

### Archive layout

```
my-skin.frogui   (renamed ZIP)
├── manifest.json
├── preview.png
├── images/
│   ├── popup-bg.png
│   └── ...
└── icons/
    ├── explore.svg
    └── storefront.png
```

### Import changes in `FroguiSkinService.importSkin()`

When extracting the ZIP:
1. Read `manifest.icons` map
2. For each entry, extract the file from `icons/<filename>`, create a `File` object,
   call `this.setIcon(name, file)`
3. On import error, skip individual bad entries and report them non-fatally

### Export changes in `FroguiSkinService.exportSkin()`

1. Write all entries from `iconEntries` to `icons/<name>.<ext>` in the ZIP
2. Include the `icons` map in `manifest.json`

---

## 4. Skin Builder — Icons Section (Section 4)

Inserted between **Images** (section 3) and **Export** (section 5). Export
becomes section 5 and its heading numeral updates accordingly.

### Layout

Same group-tab pattern as the Colors section:
- A tab row with one tab per icon group (Navigation, Header, Gallery, Popup Card,
  Context Menu, Storage, Settings)
- Below: a scrollable list of icon slots for the active group

### Icon slot row

```
[ 24×24 icon preview ] [ icon name ]   [ Upload ]  [ × ]
```

- **Icon preview** — renders `<fm-icon [name]="slot.name">` so it shows the current
  custom icon (or the Material default). Clicking the preview is equivalent to clicking
  Upload.
- **Icon name** — human-readable label (e.g. "Explore nav", not the raw token name).
  Defined in a `FM_ICON_META` record alongside `FM_ICON_GROUPS`.
- **Upload button** — opens `<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">`
- **× button** — calls `removeIcon(name)`, restores Material default. Hidden when no
  custom icon is set.

### Hover interaction

When the Icons section is active and the user hovers any `[data-fm-icon]` element in
the dashboard:
- That icon slot row in the editor gets a `.token-highlight` highlight (same class
  used by color token rows)
- A label badge at the bottom of the screen shows the icon name

This reuses the existing `hoveredToken$` stream — the inspector treats
`data-fm-icon` values the same as `data-fm-token` values for the highlight system.

---

## 5. Click-to-Replace Flow

### `SkinInspectorService` addition

```typescript
private _iconClicked = new Subject<string>();
readonly iconClicked$ = this._iconClicked.asObservable();

clickIconFromDashboard(name: string): void { this._iconClicked.next(name); }
```

### `DashboardComponent._onInspectClick` extension

```typescript
// Inside _onInspectClick, after existing zone-click logic:
const iconEl = (event.target as Element).closest('[data-fm-icon]');
const iconName = iconEl?.getAttribute('data-fm-icon') ?? null;
if (iconName && this.skinInspector.isIconsGroupActive) {
  event.stopPropagation();
  event.preventDefault();
  this.skinInspector.clickIconFromDashboard(iconName);
}
```

`isIconsGroupActive` is a getter on the service that returns `true` when the skin
builder has the Icons section selected. Driven by a new
`private _iconsGroupActive = new BehaviorSubject<boolean>(false)` toggled from the
skin builder's `activeGroup` setter (same pattern as `setPopupPreview`).

### `SkinBuilderComponent` subscription

```typescript
this._inspectorSub.add(
  this.skinInspector.iconClicked$.subscribe(name => {
    // 1. Switch to Icons section
    this.activeGroup = ICONS_GROUP_INDEX;
    // 2. Switch to the correct icon group tab
    this.activeIconGroup = FM_ICON_GROUP_FOR[name];
    // 3. Trigger the file input for that slot (via a ViewChild or template ref map)
    this.iconFileInputs.get(name)?.nativeElement.click();
  })
);
```

---

## 6. Template Migration

### Scope

All `<mat-icon>` elements in **dashboard-facing** templates:

- `dashboard.component.html` — primary target (nav, header, gallery, popup, context
  menu, storage, settings panel)
- Any child components rendered inside the dashboard that contain skinnable icons

### Find-and-replace pattern

Before:
```html
<mat-icon class="list-item-icon">explore</mat-icon>
```

After:
```html
<fm-icon name="explore" class="list-item-icon"></fm-icon>
```

The `fm-icon` host element is an `inline-flex` 1em×1em box, so it occupies the same
space as `mat-icon`. Existing CSS targeting `.list-item-icon` on `mat-icon` will also
target `fm-icon` since CSS class selectors don't care about element name.

### Conditionally-rendered icon names

Some icons switch based on state (e.g. `check_box` ↔ `check_box_outline_blank`). Use
a ternary on `name`:

```html
<fm-icon [name]="batchMode ? 'check_box' : 'check_box_outline_blank'"
         class="..."></fm-icon>
```

### Dynamic icon names (ngFor, loops)

Wherever the icon name is already a variable, just pass it through:

```html
<fm-icon [name]="item.icon"></fm-icon>
```

### Icons with complex class bindings (`[ngClass]`)

The `favorite` heart icon has animated classes:

```html
<!-- Before -->
<mat-icon [ngClass]="{ 'material-symbols-outlined': !isFavorite(uuid), 'favorited-icon': ... }">
  {{ isFavorite(uuid) ? 'favorite' : 'favorite_border' }}
</mat-icon>

<!-- After -->
<fm-icon [name]="isFavorite(uuid) ? 'favorite' : 'favorite_border'"
         [class.favorited-icon]="isFavorite(uuid)"
         [class.heart-animate]="isFavorite(uuid)"
         class="favorite-icon HeartAnimation"></fm-icon>
```

The `material-symbols-outlined` class on the unfavourited state was only needed to
pick the outlined font variant. With `fm-icon`, the icon name controls appearance
and that class can be dropped.

### `FmIconComponent` change detection

Use `ChangeDetectionStrategy.OnPush` with a call to `markForCheck()` inside `setIcon`
and `removeIcon` on the service (or use an observable). Alternatively, keep Default
strategy for v1 simplicity — re-evaluate if profiling shows CD cost.

---

## 7. Inspection CSS

The existing token inspection CSS in `styles.scss` already covers `[data-fm-token]`.
Add parallel rules for `[data-fm-icon]` using the same visual treatment:

```scss
// Icons highlight identically to token elements when inspecting
.sb-inspecting [data-fm-icon]:hover,
.sb-inspecting [data-fm-icon][data-fm-icon-active] {
  outline: 2px solid rgba(190, 150, 255, 1) !important;
  outline-offset: 1px;
  background-color: rgba(150, 100, 255, 0.35) !important;
  cursor: pointer !important; // signals "click to replace"
}

.sb-inspecting [data-fm-icon]:hover::after {
  content: attr(data-fm-icon);
  // ...same fixed badge styles as data-fm-token...
}
```

`data-fm-icon-active` is set by `_applyIconActive(name)` in `SkinInspectorService`
when the cursor is over a matching icon slot row in the editor (reverse highlight).

---

## 8. Build Order

1. **`FmIconComponent`** + register in `SharedModule`
2. **`FM_ICON_GROUPS` + `FM_ICON_META`** constants in `frogui-skin.service.ts`
3. **`FroguiSkinService`** — add `_iconFiles`/`_iconUrls`, `getIconUrl`,
   `setIcon`, `removeIcon`, `iconEntries`; extend `importSkin` + `exportSkin`
4. **`SkinInspectorService`** — add `iconClicked$`, `clickIconFromDashboard`,
   `isIconsGroupActive`, `_applyIconActive`
5. **Template migration** — replace `mat-icon` with `fm-icon` in
   `dashboard.component.html` (and any child component templates)
6. **Icons section UI** in `skin-builder.component.html` + `.ts` + `.scss`
7. **`DashboardComponent`** — extend click handler for icon clicks
8. **Inspection CSS** — add `[data-fm-icon]` rules to `styles.scss`
9. **E2E smoke test** — upload an icon, verify it renders in the dashboard,
   export `.frogui`, re-import, verify icon persists

---

## 9. Future: Draw Your Own Icon

When the illustration editor is available in-app, an icon slot's "Upload" button gets
a second option: **Draw in Frogmarks**. This opens a minimal illustration canvas
pre-sized to 24×24 (or a 10× working canvas that exports at 240×240 and is displayed
at 24×24). On save, the result is exported as a PNG and passed directly to `setIcon`
— no file system round-trip required.

The icon slot system is agnostic to how the image is sourced (file picker or
illustration export), so no changes to the data model are needed for this feature.
