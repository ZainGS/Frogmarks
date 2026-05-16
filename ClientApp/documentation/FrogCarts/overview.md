# FrogCarts — Overview

## The Concept

FrogCarts is the distribution and play layer of Frogmarks. Where Frogmarks is the creation tool, a `.frogcart` is the distributable artifact — a self-contained playable/shareable package that anyone can load into **FrogPlayer**, the cartridge console embedded in the app.

This separates the creative workspace from the play/exploration space, which is both good UX architecture and a fundamentally different bet than becoming another algorithmic art feed.

```
.frogmarks  →  editable project (stays in your workspace)
.frogcart   →  packaged, playable, shareable artifact
FrogPlayer  →  the console/room that loads and plays carts
```

---

## Why Not Explore / Algorithmic Feed

The internet already has:
- Endless-scroll feeds
- Pinterest/Behance/Dribbble clones
- Engagement optimization
- Recommendation systems
- Moderation nightmares
- Image hosting at scale

FrogCarts avoids all of that. Carts are exchanged directly — person to person, locally, or through future StreetPass-style proximity encounters. No server-side feed. No ranking. No algorithms.

This keeps Frogmarks:
- Local-first
- Cheaper to operate
- Distinctly toy-like and emotional
- Aligned with old-web / Winamp / Nintendo instincts

---

## The FrogPlayer UI Vision

FrogPlayer is a virtual bedroom with a TV, a console, and a cartridge slot.

**State: empty**
- Cozy bedroom renders — TV off, console sitting on the shelf
- "Drag a .frogcart here" affordance on the cartridge slot

**State: cart inserted**
- Drag a `.frogcart` file onto the window
- Cart physically slides into the slot (animation)
- CRT powers on — little boot animation / loading screen
- Cart content plays/renders inside the TV frame

**Stretch goals:**
- Customizable bedroom themes (wallpaper, furniture, lighting)
- A cartridge shelf showing your collection
- Memory card metaphor for saved state
- Ambient room lighting that reacts to cart content

---

## File Format — `.frogcart`

A `.frogcart` is a ZIP-like container (exact spec TBD) holding:

```
manifest.json       — metadata: title, author, version, thumbnail, type
payload/            — the actual content (art, mini-app, world, etc.)
thumbnail.png       — cover art shown in collection view
signature (future)  — tamper detection for StreetPass exchange
```

**Cart types (initial thinking):**
- `artwork` — a static or animated illustration to view
- `world` — an interactive 3D scene
- `minigame` — a tiny playable experience built in Frogmarks
- `template` — a starting canvas for the recipient

---

## StreetPass / Proximity Exchange (Future)

The longer-term vision adds passive discovery — phones advertising nearby, exchanging tiny cart payloads over BLE when two Frogmarks users are in proximity.

See [streetpass.md](./streetpass.md) for the full architecture spec.

The key insight: you do **not** need full replication of Nintendo 3DS StreetPass. Even:

> open app occasionally → sync nearby encounters → receive a cart from someone you passed

...would already feel magical.
