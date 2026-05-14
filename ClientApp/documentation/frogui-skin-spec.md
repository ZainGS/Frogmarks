# `.frogui` Skin Specification

A `.frogui` file is a renamed ZIP archive containing a `manifest.json`, a `tokens.css`, and an `assets/` folder of image files. No JavaScript is permitted. The skin engine validates all files on import before applying anything.

---

## Archive Structure

```
my-skin.frogui  (ZIP)
├── manifest.json
├── preview.png          (400×250 — shown in the skin picker lottery)
└── assets/
    ├── dashboard-bg.png
    ├── sidebar-bg.png
    ├── panel-border.png
    ├── action-card-bg.png
    ├── action-card-border.png
    ├── search-bg.png
    ├── nav-item-hover.png
    ├── nav-item-active.png
    ├── chip-selected.png
    ├── chip-unselected.png
    ├── context-menu-bg.png
    ├── overlay-card-bg.png
    ├── popup-border-sprite.png
    ├── storage-bar-track.png
    ├── storage-bar-fill.png
    ├── thumbnail-hover-border.png
    └── logo.png
```

---

## `manifest.json`

```json
{
  "froguiVersion": 1,
  "name": "Acid Frog",
  "author": "Your Name",
  "description": "A short description shown in the skin picker.",
  "preview": "preview.png",
  "entry": "tokens.css",
  "permissions": {
    "externalUrls": false,
    "scripts": false
  }
}
```

---

## Color Tokens (`tokens.css`)

These are CSS custom properties applied to `:root`. Every value can be overridden even if no image asset is provided.

```css
:root {
  /* ── Global shell ─────────────────────────────────────── */
  --fm-app-bg:                  #0d0d0d;   /* fallback if no dashboard-bg.png */
  --fm-app-bg-image:            none;      /* url('assets/dashboard-bg.png') */
  --fm-app-bg-size:             cover;     /* cover | contain | repeat | tile */

  /* ── Sidebar ──────────────────────────────────────────── */
  --fm-sidebar-bg:              #111111;
  --fm-sidebar-bg-image:        none;      /* url('assets/sidebar-bg.png') */
  --fm-sidebar-border-right:    1px solid #222222;
  --fm-sidebar-width:           240px;     /* don't shrink below 160px */

  /* ── Sidebar nav items ────────────────────────────────── */
  --fm-nav-item-text:           #cccccc;
  --fm-nav-item-icon:           #888888;
  --fm-nav-item-hover-bg:       rgba(255,255,255,0.06);
  --fm-nav-item-hover-bg-image: none;      /* url('assets/nav-item-hover.png') */
  --fm-nav-item-active-bg:      rgba(255,255,255,0.10);
  --fm-nav-item-active-bg-image:none;      /* url('assets/nav-item-active.png') */
  --fm-nav-item-active-text:    #ffffff;
  --fm-nav-item-active-icon:    #ffffff;
  --fm-nav-item-radius:         6px;
  --fm-nav-divider:             rgba(255,255,255,0.08);

  /* ── Work pane ────────────────────────────────────────── */
  --fm-pane-bg:                 #0d0d0d;

  /* ── Header row ───────────────────────────────────────── */
  --fm-header-bg:               transparent;
  --fm-header-border-bottom:    none;

  /* ── Search bar ───────────────────────────────────────── */
  --fm-search-bg:               #1a1a1a;
  --fm-search-bg-image:         none;      /* url('assets/search-bg.png') */
  --fm-search-border:           1px solid #2a2a2a;
  --fm-search-text:             #e0e0e0;
  --fm-search-placeholder:      #666666;
  --fm-search-icon:             #666666;
  --fm-search-radius:           8px;
  --fm-search-height:           36px;

  /* ── Action cards (New whiteboard / illustration / etc) ─ */
  --fm-action-card-bg:          #1a1a1a;
  --fm-action-card-bg-image:    none;      /* url('assets/action-card-bg.png') */
  --fm-action-card-bg-size:     cover;
  --fm-action-card-border:      1px solid #2a2a2a;
  --fm-action-card-border-image:none;      /* url('assets/action-card-border.png') 8 fill / 8px */
  --fm-action-card-radius:      10px;
  --fm-action-card-shadow:      none;
  --fm-action-card-title:       #ffffff;
  --fm-action-card-subtitle:    #aaaaaa;
  --fm-action-card-icon:        #888888;
  --fm-action-card-hover-bg:    #222222;
  --fm-action-card-height:      80px;

  /* ── Filter chips (Recently viewed / All files / sort) ── */
  --fm-chip-selected-bg:        #333333;
  --fm-chip-selected-bg-image:  none;      /* url('assets/chip-selected.png') */
  --fm-chip-selected-text:      #ffffff;
  --fm-chip-selected-border:    1px solid #555555;
  --fm-chip-unselected-bg:      transparent;
  --fm-chip-unselected-bg-image:none;      /* url('assets/chip-unselected.png') */
  --fm-chip-unselected-text:    #888888;
  --fm-chip-unselected-border:  1px solid #333333;
  --fm-chip-radius:             20px;
  --fm-chip-height:             28px;

  /* ── Gallery grid ─────────────────────────────────────── */
  --fm-grid-gap:                8px;
  --fm-grid-item-radius:        8px;
  --fm-grid-item-border:        none;
  --fm-grid-item-hover-border:  2px solid rgba(255,255,255,0.3);
  --fm-grid-item-hover-border-image: none; /* url('assets/thumbnail-hover-border.png') 4 fill / 4px */
  --fm-grid-item-shadow:        none;
  --fm-grid-item-hover-shadow:  0 4px 20px rgba(0,0,0,0.5);
  --fm-grid-item-selected-border: 2px solid #7b5ea7;

  /* ── Thumbnail overlay (shown on hover) ───────────────── */
  --fm-overlay-gradient:        linear-gradient(transparent 50%, rgba(0,0,0,0.85) 100%);
  --fm-overlay-title-color:     #ffffff;
  --fm-overlay-date-color:      #aaaaaa;
  --fm-overlay-font-size:       12px;

  /* ── Context menu ─────────────────────────────────────── */
  --fm-context-bg:              #1e1e1e;
  --fm-context-bg-image:        none;      /* url('assets/context-menu-bg.png') */
  --fm-context-border:          1px solid #333333;
  --fm-context-radius:          8px;
  --fm-context-shadow:          0 8px 32px rgba(0,0,0,0.6);
  --fm-context-item-text:       #e0e0e0;
  --fm-context-item-hover-bg:   rgba(255,255,255,0.07);
  --fm-context-divider:         rgba(255,255,255,0.08);

  /* ── Item overlay popup card ──────────────────────────── */
  --fm-popup-bg:                #1e1e1e;
  --fm-popup-bg-image:          none;      /* url('assets/overlay-card-bg.png') — composited over the dots pattern */
  --fm-popup-border:            1px solid #333333;
  --fm-popup-radius:            12px;
  --fm-popup-shadow:            0 16px 48px rgba(0,0,0,0.7);
  --fm-popup-title-color:       #ffffff;
  --fm-popup-primary-btn-bg:    #7b5ea7;
  --fm-popup-primary-btn-text:  #ffffff;
  --fm-popup-primary-btn-radius:6px;
  --fm-popup-icon-btn-bg:       #2a2a2a;
  --fm-popup-icon-btn-icon:     #cccccc;
  --fm-popup-icon-btn-radius:   6px;
  --fm-popup-meta-text:         #888888;
  --fm-popup-tail-color:        #1e1e1e;

  /* ── Popup card border runner ─────────────────────────── */
  --fm-popup-border-sprite:      none;     /* url('assets/popup-border-sprite.png') */
  --fm-popup-border-sprite-size: 24px;    /* size of each tiled sprite unit */
  --fm-popup-border-speed:       4s;      /* full loop duration — increase to slow down */
  --fm-popup-border-animate:     0;       /* set to 1 to run the march animation */

  /* ── Storage bars (OPFS / Cloud) ──────────────────────── */
  --fm-storage-track-bg:        #2a2a2a;
  --fm-storage-track-bg-image:  none;      /* url('assets/storage-bar-track.png') */
  --fm-storage-track-radius:    4px;
  --fm-storage-track-height:    6px;
  --fm-storage-fill-bg:         #7b5ea7;
  --fm-storage-fill-bg-image:   none;      /* url('assets/storage-bar-fill.png') */
  --fm-storage-fill-warn-bg:    #c0392b;
  --fm-storage-label-color:     #888888;
  --fm-storage-value-color:     #cccccc;

  /* ── Notification / Settings panel ───────────────────────*/
  --fm-panel-bg:                #141414;
  --fm-panel-border-left:       1px solid #2a2a2a;
  --fm-panel-title-color:       #ffffff;

  /* ── Footer ticker ────────────────────────────────────── */
  --fm-footer-bg:               #0a0a0a;
  --fm-footer-text:             #444444;
  --fm-footer-alt-bg:           #111111;
  --fm-footer-height:           28px;
  --fm-footer-font-size:        11px;

  /* ── Typography ───────────────────────────────────────── */
  --fm-font-ui:                 'Inter', system-ui, sans-serif;
  --fm-font-display:            inherit;   /* headings / titles */
  --fm-font-mono:               'Fira Mono', monospace;

  /* ── Global accent ────────────────────────────────────── */
  --fm-accent:                  #7b5ea7;
  --fm-accent-hover:            #9b7ec7;
  --fm-text-primary:            #e0e0e0;
  --fm-text-secondary:          #888888;
  --fm-text-disabled:           #444444;
}
```

---

## Image Asset Catalogue

Each asset is optional. If omitted, the CSS token fallback color is used.

| Asset file | Dimensions | CSS property | Notes |
|---|---|---|---|
| `preview.png` | **400 × 250** | shown in skin picker | Required |
| `dashboard-bg.png` | any (recommend 1920×1080) | `--fm-app-bg-image` | Tiled or cover |
| `sidebar-bg.png` | **240 × 900+** | `--fm-sidebar-bg-image` | Repeats vertically |
| `nav-item-hover.png` | **200 × 36** | `--fm-nav-item-hover-bg-image` | 9-slice or repeat-x |
| `nav-item-active.png` | **200 × 36** | `--fm-nav-item-active-bg-image` | 9-slice or repeat-x |
| `action-card-bg.png` | **400 × 80** | `--fm-action-card-bg-image` | Cover, any aspect ratio works |
| `action-card-border.png` | **16 × 16** (9-slice) | `--fm-action-card-border-image` | `border-image` — corners must be 4px |
| `search-bg.png` | **300 × 36** | `--fm-search-bg-image` | Stretched horizontally |
| `chip-selected.png` | **80 × 28** | `--fm-chip-selected-bg-image` | Stretched, or use `border-image` |
| `chip-unselected.png` | **80 × 28** | `--fm-chip-unselected-bg-image` | Same |
| `thumbnail-hover-border.png` | **16 × 16** (9-slice) | `--fm-grid-item-hover-border-image` | `border-image`, 4px corners |
| `context-menu-bg.png` | **180 × 200** | `--fm-context-bg-image` | Cover |
| `overlay-card-bg.png` | **320 × 240** | `--fm-popup-bg-image` | Cover — composited over the dots pattern |
| `popup-border-sprite.png` | any square (rec **24 × 24**) | `--fm-popup-border-sprite` | Single sprite unit tiled around the card border; see §Menu Card Skinning |
| `storage-bar-track.png` | **100 × 6** | `--fm-storage-track-bg-image` | Repeat-x |
| `storage-bar-fill.png` | **100 × 6** | `--fm-storage-fill-bg-image` | Repeat-x |
| `logo.png` | **160 × 40** | replaces Frogmarks logo in sidebar | PNG with transparency |

---

## Menu Card Skinning

The item overlay popup (`.menu-card`) has two independent skin layers on top of its signature black-dots pattern.

### Overlay Image (`--fm-popup-bg-image`)

Set `--fm-popup-bg-image` to a `url(...)` value or upload `overlay-card-bg.png` in the Skin Builder. The image is composited **above** the dots and solid-black layers using `background-size: cover`, so the dots pattern remains visible only when the token is `none`.

### Border Runner (`popup-border-sprite.png`)

Upload a small square sprite (e.g. a cloud, star, or icon). The skin engine tiles four copies of it — one along each edge of the card — and can march them clockwise around the frame.

| Token | Default | Effect |
|---|---|---|
| `--fm-popup-border-sprite` | `none` | URL of the sprite; set automatically when you upload in the builder |
| `--fm-popup-border-sprite-size` | `24px` | Rendered dimensions of each sprite unit (square) |
| `--fm-popup-border-sprite-spacing` | `0px` | Transparent gap between adjacent sprites; animation step size adjusts automatically so the loop stays seamless |
| `--fm-popup-border-speed` | `4s` | Time for one full loop; increase to slow down |
| `--fm-popup-border-animate` | `0` | Set to `1` to start the marching animation |

**Direction**: top strip marches right → right strip marches down → bottom strip marches left → left strip marches up (clockwise).

**Clipping**: the strips are absolutely positioned inside `.menu-card`, so the chamfered-corner `clip-path` clips them automatically — no extra work needed.

**Performance**: the animation is a CSS `background-position` keyframe. If `--fm-popup-border-sprite` is `none`, the strips have no visible content and the animation has zero GPU cost.

---

## 9-Slice (`border-image`) Guide

For panel frames and card borders, assets use CSS `border-image` so corners stay crisp at any size.

```
┌─────┬─────────────┬─────┐
│ TL  │  top edge   │ TR  │
├─────┼─────────────┼─────┤
│left │   center    │right│
├─────┼─────────────┼─────┤
│ BL  │ bottom edge │ BR  │
└─────┴─────────────┴─────┘
```

Rule: corners must be **4 × 4 px** minimum for the `border-image: url(...) 4 fill / 4px` preset. Make the full source image **at least 12 × 12 px**. Larger is fine — just keep corners proportional.

---

## Validation Rules (enforced on import)

| Rule | Limit |
|---|---|
| Total archive size | ≤ 10 MB |
| Individual image file | ≤ 2 MB |
| Permitted file types | `.png`, `.jpg`, `.webp`, `.svg`, `.css`, `.json` |
| JavaScript | **not permitted** (any `.js` file = import rejected) |
| External URLs in CSS | **not permitted** |
| `manifest.json` present | required |
| `froguiVersion` | must be `1` |

---

## What Skins Cannot Change

To preserve usability, the following are **not skinnable**:

- Layout structure (sidebar width is constrained between 160–320px)
- Typography scale (font sizes)
- Focus ring styles (accessibility)
- Modal z-order
- Canvas / WebGPU renderer
- Animation timing of system transitions

---

## Scope: Dashboard Only (v1)

This spec covers the **dashboard** skin surface. The illustration editor (tool buttons, layer sliders, panel chrome) is a separate spec defined in `editor-skin-spec.md` once the dashboard skin system is validated.

---

## Skin Builder

The skin builder is an in-app tool (accessible from **Settings → Appearance → Create Skin**) that lets anyone produce a `.frogui` file without touching a ZIP archiver or writing CSS by hand.

### UX Flow

1. **Metadata** — user fills in skin name, author, and description.
2. **Colors** — color-picker grid for every `--fm-*` token. Grouped by zone (Global, Sidebar, Action Cards, etc.) with live preview on the right.
3. **Images** — upload slots for each asset (see mapping table below). Each slot shows the asset name, recommended dimensions, and a drag-and-drop target. Uploading an image immediately previews it in context.
4. **Preview** — full-width dashboard mockup that reflects all token and image choices in real time.
5. **Export** — "Download .frogui" button. Assembles and validates the archive client-side (no server round-trip), then triggers a file download.

### Image Slot → Asset Mapping

| Builder slot label | Asset filename | CSS token | Dimensions |
|---|---|---|---|
| App background | `dashboard-bg.png` | `--fm-app-bg-image` | any (rec 1920×1080) |
| Sidebar background | `sidebar-bg.png` | `--fm-sidebar-bg-image` | 240 × 900+ |
| Nav item hover | `nav-item-hover.png` | `--fm-nav-item-hover-bg-image` | 200 × 36 |
| Nav item active | `nav-item-active.png` | `--fm-nav-item-active-bg-image` | 200 × 36 |
| Action card background | `action-card-bg.png` | `--fm-action-card-bg-image` | 400 × 80 |
| Action card border (9-slice) | `action-card-border.png` | `--fm-action-card-border-image` | 16 × 16 |
| Search bar background | `search-bg.png` | `--fm-search-bg-image` | 300 × 36 |
| Filter chip (selected) | `chip-selected.png` | `--fm-chip-selected-bg-image` | 80 × 28 |
| Filter chip (unselected) | `chip-unselected.png` | `--fm-chip-unselected-bg-image` | 80 × 28 |
| Thumbnail hover border (9-slice) | `thumbnail-hover-border.png` | `--fm-grid-item-hover-border-image` | 16 × 16 |
| Context menu background | `context-menu-bg.png` | `--fm-context-bg-image` | 180 × 200 |
| Overlay card background | `overlay-card-bg.png` | `--fm-popup-bg-image` | 320 × 240 |
| Popup border sprite | `popup-border-sprite.png` | `--fm-popup-border-sprite` | any square (rec 24 × 24) |
| Storage bar track | `storage-bar-track.png` | `--fm-storage-track-bg-image` | 100 × 6 |
| Storage bar fill | `storage-bar-fill.png` | `--fm-storage-fill-bg-image` | 100 × 6 |
| Logo | `logo.png` | sidebar logo replacement | 160 × 40 |
| Skin preview thumbnail | `preview.png` | shown in skin picker | **400 × 250 (required)** |

### Color Token Groups

The color step is divided into these collapsible groups, matching the zones in `tokens.css`:

| Group label | Tokens |
|---|---|
| Global | `--fm-accent`, `--fm-accent-hover`, `--fm-text-primary`, `--fm-text-secondary`, `--fm-text-disabled`, `--fm-app-bg`, `--fm-pane-bg` |
| Sidebar | `--fm-sidebar-bg`, `--fm-sidebar-border-right`, `--fm-nav-item-text`, `--fm-nav-item-icon`, `--fm-nav-item-hover-bg`, `--fm-nav-item-active-bg`, `--fm-nav-item-active-text`, `--fm-nav-item-active-icon`, `--fm-nav-divider` |
| Header & Search | `--fm-header-bg`, `--fm-header-border-bottom`, `--fm-search-bg`, `--fm-search-border`, `--fm-search-text`, `--fm-search-placeholder`, `--fm-search-icon` |
| Action Cards | `--fm-action-card-bg`, `--fm-action-card-border`, `--fm-action-card-title`, `--fm-action-card-subtitle`, `--fm-action-card-icon`, `--fm-action-card-hover-bg` |
| Filter Chips | `--fm-chip-selected-bg`, `--fm-chip-selected-text`, `--fm-chip-selected-border`, `--fm-chip-unselected-bg`, `--fm-chip-unselected-text`, `--fm-chip-unselected-border` |
| Gallery | `--fm-grid-item-border`, `--fm-grid-item-hover-border`, `--fm-grid-item-shadow`, `--fm-grid-item-hover-shadow`, `--fm-grid-item-selected-border`, `--fm-overlay-gradient`, `--fm-overlay-title-color`, `--fm-overlay-date-color` |
| Context Menu | `--fm-context-bg`, `--fm-context-border`, `--fm-context-shadow`, `--fm-context-item-text`, `--fm-context-item-hover-bg`, `--fm-context-divider` |
| Popup Card | `--fm-popup-bg`, `--fm-popup-border`, `--fm-popup-shadow`, `--fm-popup-title-color`, `--fm-popup-primary-btn-bg`, `--fm-popup-primary-btn-text`, `--fm-popup-icon-btn-bg`, `--fm-popup-icon-btn-icon`, `--fm-popup-meta-text`, `--fm-popup-border-sprite-size`, `--fm-popup-border-sprite-spacing`, `--fm-popup-border-speed`, `--fm-popup-border-animate` |
| Storage & Panel | `--fm-storage-track-bg`, `--fm-storage-fill-bg`, `--fm-storage-fill-warn-bg`, `--fm-storage-label-color`, `--fm-storage-value-color`, `--fm-panel-bg`, `--fm-panel-border-left`, `--fm-panel-title-color` |
| Footer | `--fm-footer-bg`, `--fm-footer-text`, `--fm-footer-alt-bg` |

### Export Assembly (client-side)

The export runs entirely in the browser using the [JSZip](https://stuk.github.io/jszip/) library:

1. Build `manifest.json` from metadata fields.
2. Build `tokens.css` by serializing all current token values into a `:root { }` block.
3. For each uploaded image, add it under `assets/<filename>` in the ZIP. Any un-uploaded optional slots are omitted (CSS fallback colors apply at runtime).
4. Run the same validation rules enforced on import (size limits, no JS, `froguiVersion: 1`).
5. If validation passes, call `zip.generateAsync({ type: 'blob' })` and trigger a download as `<skin-name>.frogui`.

### Import (Settings → Appearance → Import Skin)

1. User selects a `.frogui` file.
2. Client reads it as a ZIP using JSZip.
3. Validates: `manifest.json` present, `froguiVersion === 1`, no `.js` files, no external URLs in any `.css` file, total size ≤ 10 MB, individual images ≤ 2 MB.
4. Extracts `tokens.css` and injects it into the document as a `<style id="frogui-skin">` tag (replaces any existing tag).
5. For image assets, creates object URLs (`URL.createObjectURL`) and rewrites the corresponding CSS variable values before injection.
6. Persists the raw ZIP bytes (or extracted token map + image blobs) to OPFS so the skin survives page reload.
7. On load, if a persisted skin exists, re-apply step 4–5 before first paint to avoid flash of unstyled content.
