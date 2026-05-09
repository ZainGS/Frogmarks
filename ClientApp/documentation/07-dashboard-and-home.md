# 07 — Dashboard & Home Screen

---

## Home Screen (`HomeComponent`)

**File:** `src/app/shared/components/home/home.component.ts`
**Route:** `/` (root)

The landing page shown before the user enters the application. Clicking anywhere or pressing any key navigates to `/dashboard`.

### Exit Animations

Two exit animation modes are controlled by `animationType: number`:

| Value | Behaviour |
|-------|-----------|
| `1` | Freeze-frame → pixelate + glitch. Outer element scales up with `image-rendering: pixelated` (CSS `@property --pf` animatable via `fm-pixelate`), inner element scales down to compensate — net visual size unchanged but rasterised at 1/pf resolution. The wordmark plays `fm-exit-glitch` simultaneously. |
| `2` (default) | Simple dark overlay fade (`fm-exit-overlay--active`), then navigate after 450 ms. |

`showFrog: boolean` (default `false`) toggles a frog sprite / palette variant. When true, `animationType === 1` adds a 325 ms freeze before transitioning.

### Wordmark

Font: **Sixtyfour Convergence** (variable font). Axis ranges:
- `BLED` 0–100, `SCAN` −53–100, `XELA` −100–100, `YELA` −100–100

Two animations:
- `fm-idle-glitch` (0.9 s, linear, infinite) — low-amplitude axis drift while idle
- `fm-exit-glitch` (0.4 s, steps, forwards) — rapid escalating crash synced with the pixelation effect, applied via `.fm-wordmark--glitch` class

### Background Particles

12 geometric shapes (circles, squares, triangles) are generated in `_spawnParticles()` at `ngOnInit` and stored in `particles: HomeParticle[]`. Each SVG particle is positioned absolutely and animated via a single CSS `@keyframes fm-particle-fly` that combines `translateX` and `rotate` in one `transform` value:

```scss
@keyframes fm-particle-fly {
  from { transform: translateX(-300px) rotate(0deg); }
  to   { transform: translateX(calc(100vw + 300px)) rotate(360deg); }
}
```

**Note:** Translate and rotate must be in the same `transform` keyframe on SVG elements. Using the standalone CSS `rotate` property alongside `transform: translateX` causes compositing conflicts on SVGs across browsers — the rotation interferes with the translation and produces "floaty" movement.

Per-particle CSS custom properties (`--dur`, `--del`) control duration and delay. Negative delays start particles mid-flight on load. Sizes range 100–280 px; opacity 0.01–0.03.

---

## Dashboard (`DashboardComponent`)

**File:** `src/app/shared/components/dashboard/dashboard.component.ts`
**Route:** `/dashboard`

The main file browser. Shows all boards and illustrations for the current team.

---

### Data Model

```typescript
type DashboardItem = Board | Illustration;
```

Three parallel lists are maintained:
- `listItems: DashboardItem[]` — full list after fetching from all sources
- `filteredListItems: DashboardItem[]` — list after applying filters (file type, search, etc.)
- `boards: Board[]` — boards-only subset (used for board-specific operations)

`filteredListItems` is what both the grid and list views render from.

---

### Grid View

The grid is a **justified NSO-style layout** — rows of variable-aspect items that stretch to fill the full container width, with row height controlled by TypeScript.

**Data structure:**

```typescript
interface GridRowItem {
  item: DashboardItem;
  globalIndex: number;
  aspect: number;          // width/height ratio
}

interface GridRow {
  items: GridRowItem[];
  height: number;          // px, computed from container width and aspect sums
}

gridRows: GridRow[]        // what the template iterates
```

**Rebuild trigger:** `_gridDirty = true` flags that `recomputeGrid()` should run. `ngAfterViewChecked` checks this flag and calls `recomputeGrid()` via `setTimeout(..., 0)` once the container has a measurable width. A `ResizeObserver` also calls `recomputeGrid()` whenever the container resizes.

**`trackBy`:** `trackByRowItem` returns `ri.item.uuid ?? ri.globalIndex.toString()` — essential for FLIP animations and efficient DOM updates.

---

### Archive FLIP Animation

When a tile is archived (`onArchiveItem`), the removal plays a three-phase animation instead of snapping:

**Phase 1 — Exit (0–180 ms):**
The tile receives `.grid-item--exit`, which CSS-transitions it to `opacity: 0; transform: scale(0.82)` while it still occupies space in the layout. This is immediate and plays via Angular change detection.

**Phase 2 — Snapshot (at 180 ms):**
Before touching `filteredListItems`, `getBoundingClientRect()` is recorded for every surviving tile into a `Map<uuid, DOMRect>`.

**Phase 3 — Rebuild + FLIP:**
- `_removeFromLists()` updates `filteredListItems`
- `recomputeGrid()` rebuilds `gridRows` (bypasses `_gridDirty` to prevent re-entry mid-animation)
- `cdr.detectChanges()` forces Angular to render the new layout synchronously
- `requestAnimationFrame` × 2: read each survivor's new position, compute `(oldRect − newRect)` delta, instantly apply `transform: translate(dx, dy)`, then transition to `transform: ''` over 320 ms cubic-bezier

The cross-row case (first item of row N+1 becomes last item of row N) is handled naturally — the FLIP delta has a large negative `dy` and the tile glides diagonally to its new position.

**Implementation:** `_animateArchive(item)` in `dashboard.component.ts`. Falls back to instant removal for list-view mode or when the grid container is unmounted.

---

### Filters

The left sidebar controls which items appear in `filteredListItems`:

| Filter | State flag | Data source |
|--------|-----------|-------------|
| Design Center (default) | `isDesignCenterActive` | All boards + illustrations for current team |
| Favorites | `isFavoritesFilterActive` | Boards/illustrations with `isFavorite = true` |
| Archive | `isArchivedFilterActive` | Boards/illustrations with `isArchived = true` |
| Templates | `isTemplatesActive` | Template-type boards |
| Updates | `isUpdatesActive` | Activity feed |

File type filter (`fileType: FileTypeOptions`) narrows to All / Illustrations / Boards. Sort and order are applied client-side after the fetch.

---

### Local-Only Illustrations

Illustrations with `syncMode === 2` ("local-only") are stored entirely in the browser via OPFS — no pixel data is ever sent to the server. They are loaded separately from the cloud fetch via `LocalIllustrationService.getAll(isArchived)` and merged into `listItems` alongside cloud items.

`isLocalIllustration(item)` returns true when `(item as Illustration).syncMode === 2`. Local items are identified by `uuid` rather than numeric `id` throughout `_removeFromLists`, archive, delete, and duplicate operations.

Route for local illustrations: `/illustration/local/:uuid`.

---

### Item Actions

All actions are available from two UI entry points:

1. **Context menu** (right-click on a tile) — `openBoardMenu($event, item)`
2. **Item overlay** (hover / click the `...` button on a tile) — `openItemOverlay`

| Action | Method | Notes |
|--------|--------|-------|
| Archive | `onArchiveItem(item)` | FLIP animation, then sets `isArchived = true` + API call |
| Unarchive | `onUnarchiveBoard(item)` | Instant remove from archived view + API call |
| Delete permanently | `onDeleteBoard(item)` | Instant remove + DELETE endpoint |
| Rename | `startInlineRename(item)` | In-place input in the tile |
| Duplicate | `duplicateItem(item)` | POST duplicate endpoint, prepends "Copy of" |
| Favorite | `toggleFavorite(uuid, item)` | Toggles `isFavorite`, updates `favorites: Set<string>` |
| Copy link | `copyItemLink(item)` | Writes share URL to clipboard; blocked for local-only items |
| Open in new tab | `openItemInNewTab(item)` | |
| Navigate | `navigateToItem(item)` | Blocked if `item.isArchived` |

---

### Sync Mode Badges

Tiles with `syncMode === 1` or `syncMode === 2` show a small `⬡` badge in the corner of the thumbnail:

| `syncMode` | Badge class | Tooltip |
|-----------|------------|---------|
| `1` (no-cloud) | (default) | `"No-cloud — pixel data on this device"` |
| `2` (local-only) | `sync-badge--local` | `"Local only — stored in this browser"` |

---

### Loading Strategy

`loadAllItems()` is called when a filter switches to Design Center or Favorites. It uses `forkJoin` to fetch boards and cloud illustrations in parallel via their respective services, then merges local OPFS items from `LocalIllustrationService.getAll()`. All three sources populate the same `listItems` array.

A separate `_loadOpfsStats()` method reads storage usage from `LocalIllustrationService` to populate storage indicators in the UI.
