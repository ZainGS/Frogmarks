# Retro Chrome Theme — Frogmarks Illustration UI
## Design Specification  (v2 — full coverage)

---

### Concept

A late-90s / PS1-era dark chrome application shell. Inspired by the Frogcarts launcher UI: sharp-edged windows with green titlebars, beveled chrome borders, and a CRT-terminal feel. Every panel looks like a widget ripped from a 1998 compositing application — correct for an indie/retro animation tool.

The default Frogmarks theme stays untouched. The retro theme is a pure additive layer activated by a single body class: `theme-retro-chrome`.

---

### How to toggle

**In the UI:** Click the `◻ RETRO` button in the top-right corner of the illustration view. It turns `◼ RETRO` (filled square = active). Preference persists in `localStorage` under the key `fm-theme`.

**In code / DevTools:**
```js
// Activate
document.body.classList.add('theme-retro-chrome');
localStorage.setItem('fm-theme', 'retro-chrome');

// Deactivate
document.body.classList.remove('theme-retro-chrome');
localStorage.removeItem('fm-theme');
```

**To revert all styles permanently:** Remove the `@import './retro-chrome-theme.scss'` line from `src/styles.scss` and delete `src/retro-chrome-theme.scss`. No other files need changes.

---

### Color palette

| Token | Value | Usage |
|---|---|---|
| `--rc-canvas-bg` | `#0a0a0a` | Canvas / page background |
| `--rc-panel-bg` | `#1a1a1a` | All panel shells |
| `--rc-surface` | `#242424` | Buttons, list items, tool buttons |
| `--rc-surface-raise` | `#2e2e2e` | Hover state of surfaces |
| `--rc-bevel-light` | `#6a6a6a` | Chrome highlight edge (top/left) |
| `--rc-bevel-dark` | `#111` | Chrome shadow edge (bottom/right) |
| `--rc-bevel-mid` | `#3a3a3a` | Secondary borders |
| `--rc-green` | `#2e6b28` | Titlebar background, active tool background |
| `--rc-green-hi` | `#3d8e35` | Hover green, section title text |
| `--rc-green-text` | `#c8f0c4` | Text on green backgrounds |
| `--rc-text` | `#c8c8c8` | Primary text |
| `--rc-text-muted` | `#777` | Secondary / disabled text |
| `--rc-text-label` | `#a0a0a0` | Form labels, value readouts |
| `--rc-accent` | `#3d8e35` | Active state accent |
| `--rc-danger` | `#a02020` | Destructive button bg |

---

### Border system — the bevel

All borders use a 4-value `border-color` shorthand to simulate the raised/sunken chrome bevel of classic OS widgets.

```css
/* Raised (default panels and buttons) */
border: 2px solid;
border-color: #6a6a6a #111 #111 #6a6a6a;
/*            top     right bottom left
              light   dark  dark   light  = surface looks raised */

/* Sunken (inputs, active/pressed buttons) */
border: 2px solid;
border-color: #111 #6a6a6a #6a6a6a #111;
/*            top  right   bottom  left
              dark light   light   dark  = surface looks pressed in */
```

**Rule of thumb:** raised = light on top-left, dark on bottom-right. Sunken = inverted.

---

### Typography

Every label, title, and button uses `'Courier New', Courier, monospace`. This is intentional — monospace gives the retro CRT-terminal feel without requiring a custom font load.

Font sizes:
- Panel titles (uppercase): `10px`, `letter-spacing: 0.8–1px`
- Section titles: `9px`, `letter-spacing: 1px`, `text-transform: uppercase`
- Body labels: `10–11px`
- Code-style readouts (slider values, coordinates): `10px` monospace

---

### Component-by-component spec

#### Left toolbar (`.vertical-control-panel`)
- Dark panel bg, raised right edge (double chrome line: light inner, dark outer)
- Tool buttons: 46×46 px, raised bevel, no border-radius
- Selected tool: sunken bevel + green background (active state = "pressed in")
- Hover: slightly lighter surface, no transform/slide
- Section dividers: 1px dark line, no gap

#### Bottom control panel (`.control-panel-dark`)
- Raised chrome border all four sides
- Panel header text: green-hi color, Courier New, uppercase
- Tool option items: no radius, hover = surface-raise bg
- Active item: green background, sunken bevel

#### Panels (Ephemera, Mesh Edit, Grease Pencil, Layer)
All follow the same shell pattern:
```
┌────────────────────────────────────┐  ← raised bevel (2px)
│ ██ PANEL TITLE          [btn] [x] │  ← green titlebar
├────────────────────────────────────┤  ← dark separator
│ ▌SECTION                          │  ← section title (left green bar)
│ label  [ input ]     value        │
│ label  [────────────] value       │
├────────────────────────────────────┤
│ ...                               │
└────────────────────────────────────┘
```

- **Titlebar**: green bg (`--rc-green`), green-text color, monospace uppercase
- **Section titles**: small caps with a 3px left green border strip
- **Inputs / textfields**: sunken bevel, `#111` background
- **Sliders** (`input[type=range]`): `accent-color: --rc-green-hi` (browser-native thumb goes green)
- **Buttons**: raised bevel, no radius. On press: border inverts to sunken.
- **Primary buttons**: green background with raised bevel
- **Danger buttons**: dark red background

#### Layer panel (`.raster-layers-panel`)
- Green titlebar with "LAYERS" label
- Active layer: left 3px green border + dim green tint on the row bg
- Blend mode dropdown: raised chrome panel, no shadow
- Rename input: sunken bevel, monospace

---

### What isn't themed

- The canvas itself (Salsa owns that rendering)
- Any Salsa-rendered HTML inside the canvas (FrogPlayer, etc.)
- The FrogCarts/dashboard shell (separate component, separate file)
- The hue-ring color wheel (SVG-based conic gradient — unaffected by CSS)

To extend the theme to other areas, add `body.theme-retro-chrome .your-class { }` rules to `retro-chrome-theme.scss`. Follow the raised/sunken bevel pattern and use the CSS variables defined in Section 1 of the file.

---

### File locations

| File | Purpose |
|---|---|
| `src/retro-chrome-theme.scss` | All theme rules (this file) |
| `src/retro-chrome-theme.spec.md` | This specification |
| `src/styles.scss` line 2 | `@import './retro-chrome-theme.scss'` |
| `illustration.component.ts` | `retroThemeActive`, `toggleRetroTheme()`, `ngOnInit` restore |
| `illustration.component.html` | `<button class="rc-theme-toggle">` |

---

### Extending / customising

**Change the green:** Edit `--rc-green` and `--rc-green-hi` in the `:root`-equivalent block at the top of `retro-chrome-theme.scss`.

**Add a panel to the theme:** Copy the Ephemera panel block (Section 3) as a template. Replace `.ep-` with your component's prefix. The five things every panel needs: shell border (raised), header (green), section-title (green left-bar), inputs (sunken), buttons (raised + active=sunken).

**Change the bevel weight:** Currently `2px`. Change all `border: 2px solid` to `border: 1px solid` for a subtler look, or `3px` for a heavier 98-era feel.

**Font swap:** Replace `'Courier New', Courier, monospace` with any monospace web font loaded in `index.html`. A pixel font (e.g. `"Press Start 2P"`) would push it further into retro territory.
