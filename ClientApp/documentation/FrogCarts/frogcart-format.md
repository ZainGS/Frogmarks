# .frogcart File Format

## Overview

A `.frogcart` file is a renamed ZIP archive containing a structured payload.  
It is the unit of sharing in the Frogmarks ecosystem — created from a `.frogmarks` project, distributed to others, and played in FrogPlayer.

---

## Container

Standard ZIP. Renamed `.frogcart` for identity / UX.  
Web: parsed with the File System Access API or a JS ZIP library (e.g. `fflate`, `JSZip`).

---

## Directory Structure

```
my-cart.frogcart (ZIP)
├── manifest.json
├── thumbnail.png
└── payload/
    └── [type-specific files]
```

---

## manifest.json

```jsonc
{
  "version": "1",
  "type": "artwork",           // artwork | world | minigame | template
  "id": "uuid-v4",
  "title": "Midnight Garden",
  "author": "szain",
  "authorId": "user-uuid",
  "createdAt": "2026-05-14T00:00:00Z",
  "description": "A short description shown in the cart tooltip",
  "thumbnail": "thumbnail.png",
  "payload": "payload/",
  "tags": ["illustration", "night"],
  "frogmarksVersion": "1.0.0"
}
```

### `type` values

| Type | Payload contents | FrogPlayer behavior |
|------|-----------------|---------------------|
| `artwork` | `image.png` or `canvas.json` | Display illustration in TV frame |
| `world` | Salsa scene data | Load 3D world viewer |
| `minigame` | JS bundle + assets | Run sandboxed in TV frame |
| `template` | `.frogmarks` project file | Preview + "Open in Frogmarks" button |

---

## thumbnail.png

Required. Shown in:
- The collection strip in FrogPlayer
- Cart hover tooltip
- StreetPass encounter card

Recommended size: **320×200px** (16:10, matches Frogmarks canvas default aspect).

---

## Payload — `artwork` type

```
payload/
└── image.png         (or image.webp / canvas.json for vector)
```

For MVP, a flat PNG export is sufficient.  
Future: `canvas.json` carries the full Frogmarks layer data for interactive viewing.

---

## Payload — `world` type

```
payload/
├── scene.json        (Salsa scene descriptor)
└── assets/
    └── [textures, meshes, etc.]
```

---

## Payload — `template` type

```
payload/
└── project.frogmarks
```

When loaded in FrogPlayer, shows the thumbnail with an "Open in Frogmarks" CTA that copies the project into the user's workspace.

---

## Creation Flow (from Frogmarks)

1. User finishes a project
2. File menu → "Export as FrogCart..."
3. App generates:
   - `manifest.json` (auto-filled from project metadata)
   - `thumbnail.png` (auto-rendered from canvas)
   - `payload/` (exported canvas data)
4. Zipped and offered as `<project-name>.frogcart` download

---

## Security Considerations

- Carts should be treated as untrusted input
- `minigame` type payloads run in a sandboxed iframe with no parent access
- No arbitrary JS execution for `artwork` or `world` types
- Future: signed carts with creator keypair for StreetPass provenance
