# FrogPlayer — UI Spec

## Entry Point

Nav item in the left sidebar: **FrogPlayer**  
Icon: `videogame_asset` (Material)  
Route behavior: replaces the main work pane content, same pattern as Design Center / Templates.

---

## Layout

```
┌─────────────────────────────────────────────────┐
│  sidebar  │         FrogPlayer viewport           │
│           │                                       │
│           │   ┌──────────────────────────────┐   │
│           │   │        bedroom scene          │   │
│           │   │                               │   │
│           │   │    TV  [cart slot]  shelf     │   │
│           │   │                               │   │
│           │   └──────────────────────────────┘   │
│           │                                       │
│           │   [collection strip — owned carts]    │
└─────────────────────────────────────────────────┘
```

---

## Bedroom Scene

The centerpiece. A stylized 2D or 2.5D bedroom illustration rendered inside the FrogPlayer viewport.

**Key elements:**
- **TV** — where the cart content plays. Black/off when empty. CRT scanline aesthetic.
- **Console** — sits beneath the TV. Has a visible **cartridge slot**.
- **Shelf** — shows a row of carts the user owns (their collection).
- **Room atmosphere** — ambient lighting, subtle idle animations (fan spinning, clock ticking, etc.)

**Visual style directions:**
- Pixel art (most authentic, easiest to theme)
- Lo-fi vector illustration (cleaner, scales better)
- CSS + SVG driven (no asset pipeline needed for MVP)

**Theming:**
- Bedroom wallpaper / furniture can be swappable skins
- Future: unlock themes by receiving special carts

---

## Loading a Cart

### Drag & Drop
1. User drags a `.frogcart` file onto the FrogPlayer viewport
2. Drop zone activates — cart slot glows / pulses
3. On drop: cart visually slides into the slot (CSS transform animation)
4. TV powers on — boot animation (brief static → loading bar → content)
5. Cart content renders inside the TV frame

### From Collection Strip
1. User clicks a cart in their collection strip below the bedroom
2. Same slot + boot animation plays
3. Cart content loads in TV

### Ejecting
- Click the console / eject button
- Cart slides back out
- TV powers off

---

## Collection Strip

A horizontal scrollable strip below the bedroom showing all locally stored `.frogcart` files.

Each cart shows:
- `thumbnail.png` from the cart's manifest
- Title and author (from manifest)
- A subtle indicator if the cart is new/unplayed

Empty state: "No carts yet — drag a .frogcart here, or wait for a StreetPass encounter"

---

## Cart Content Rendering (inside the TV)

The TV frame contains a sandboxed renderer. What renders depends on `manifest.json → type`:

| Type | Renderer |
|------|----------|
| `artwork` | Static or animated illustration viewer |
| `world` | Frogmarks 3D scene viewer (Salsa engine) |
| `minigame` | Sandboxed interactive experience |
| `template` | Preview + "Open in Frogmarks" CTA |

For MVP, `artwork` type is sufficient — just display the illustration fullscreen inside the TV.

---

## Empty State (no carts loaded, no collection)

```
[ console illustration ]
"Your FrogPlayer is empty."
"Drag a .frogcart file here to load it."

[ subtle pulsing cart slot affordance ]
```

---

## MVP Scope

1. Static bedroom illustration (can be simple CSS/SVG for now)
2. Drag & drop `.frogcart` file detection
3. Parse `manifest.json` from the dropped file
4. Display `thumbnail.png` inside the TV frame
5. Collection strip populated from localStorage (paths or file handles)
6. Eject / clear current cart

Full cart content rendering, StreetPass, and bedroom theming are post-MVP.
