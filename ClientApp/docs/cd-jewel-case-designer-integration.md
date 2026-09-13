# CD Jewel-Case Designer — Frogmarks UI Integration Guide

**Audience:** Frogmarks developers.  
**Date:** 2026-08-27 · **Engine spec:** `salsa/docs/specs/cd-jewel-case-designer.md`

---

## 0. What it is

A **CD kit** is the whole product — case + disc + front insert + tray card + booklet — as one 3D object with a **scrub** (closed → lid opens → exploded). The **component dropdown** switches between **Complete** (full assembly + scrub) and each **printed piece** (isolated, laid flat for art upload).

```
Add CD Kit → component dropdown → upload art → scrub open → export print files
```

---

## 1. State fields (illustration.component.ts ~line 1337)

```ts
cdDesignerActive = false;
cdKitRootId: string | null = null;
cdActiveComponent = 'complete';
cdScrub = 0;
```

---

## 2. Methods

```ts
cdAddKit()                   // createCDKit3D(0,0,0) + enterCDDesigner3D → sets cdDesignerActive
cdExitDesigner()             // exitCDDesigner3D() + clears state
cdSetComponent(c: string)    // setCDActiveComponent3D(c)
cdSetScrub(t: number)        // setCDKitScrub3D(rootId, t) — Complete mode only
cdUploadArt(event)           // setCDPieceArt3D(rootId, component, file)
cdOnDrop(event)              // drag-drop variant of cdUploadArt
async cdExportPrintSet()     // exportCDKitPrintSet3D → download each PNG blob
```

---

## 3. UI surfaces

### Add Mesh menu
"CD Kit" item calls `cdAddKit()` directly — creates kit and immediately enters designer mode.

### CD Designer panel
Appears in `.layer-panel` slot when `cdDesignerActive === true` (the normal layer panel is hidden via `*ngIf="!layerTreeHidden && !cdDesignerActive"`).

Panel layout:
- **Header**: "💿 CD Designer" + Done button (`cdExitDesigner()`)
- **Component select**: Complete / Front Insert / Tray Card / Disc / Booklet
- **Scrub slider** (Complete only): 0 → 100%, drives `cdSetScrub()`
- **Art upload zone** (piece only): drag-drop or click-to-browse → `cdUploadArt()` / `cdOnDrop()`
- **Piece spec** (piece only): shows real mm dimensions
- **Case style toggle** (always visible): Black ⇄ Clear segmented button → `cdSetTrayClear(bool)`
- **Fold flaps slider** (Tray Card only): 0 = flat, 1 = fully folded 90° over case sides → `cdSetTrayCardFold()`
- **Print Files… button**: `cdExportPrintSet()` — downloads all 4 PNGs at 300 DPI

---

## 4. Engine API quick-reference

| Call | Effect |
|---|---|
| `sm.createCDKit3D(x?, y?, z?)` | Build kit at point → `{ rootId, pieces }` |
| `sm.deleteCDKit3D(rootId)` | Delete kit (exits designer if active) |
| `sm.enterCDDesigner3D(rootId)` | Enter designer — isolates kit, frames it |
| `sm.exitCDDesigner3D()` | Restore scene |
| `sm.setCDActiveComponent3D(component)` | Switch view: `'complete' \| 'frontInsert' \| 'trayCard' \| 'disc' \| 'booklet'` |
| `sm.getCDActiveComponent3D()` | Current component |
| `sm.setCDKitScrub3D(rootId, t)` | Animate assembly open (0 = closed, 1 = exploded) |
| `sm.isCDDesignerActive3D` | Boolean — designer on? |
| `sm.getCDDesignerRootId3D()` | Which kit is active |
| `await sm.setCDPieceArt3D(rootId, piece, source)` | Upload art (File/Blob/ImageBitmap) |
| `sm.getCDActivePieceNode3D()` | Node id of the focused piece |
| `await sm.exportCDKitPrintSet3D(rootId, { marks?, dpi? })` | All 4 pieces → `[{ piece, blob, widthMm, heightMm, dpi }]` |
| `await sm.exportCDPiecePrint3D(rootId, piece, { marks?, dpi? })` | One piece → Blob |
| `sm.setCDTrayCardFold3D(rootId, fold)` | Fold tray card flaps: 0 = flat, 1 = fully folded (90° over case sides) |
| `sm.getCDTrayCardFold3D(rootId)` | Current tray card fold value |
| `sm.setCDTrayClear3D(rootId, clear)` | Toggle tray: false = classic black, true = all-clear |
| `sm.isCDTrayClear3D(rootId)` | Query current tray style |

---

## 5. Key rules (from Salsa doc)

- **Complete vs piece**: Complete = whole assembly + scrub live + no upload. Piece = only that piece, laid flat, upload target. Slider disabled for pieces, upload disabled for Complete.
- **The case isn't editable**: `lid` / `trayBack` are plastic shells — not in the component dropdown.
- **Printed piece dimensions** (fixed for print correctness): Front Insert 120×120 mm · Tray Card 150×118 mm · Disc 120 mm Ø · Booklet 118×120 mm.
- **Persistence is automatic**: kit structure and uploaded art survive save/reload. The active component is transient; re-enter on Complete.
- **Isolation is engine-owned**: entering the designer hides the rest of the scene. Don't toggle visibility manually.
- **Deleting**: Outliner X on the kit calls `deleteCDKit3D` automatically.

---

## 6. Not yet wired (future phases)

- Share Clip (cinematic-camera spin export in Complete mode)
- Order flow (quantity, checkout, fulfillment — host-side)
- Marks/proof mode (`marks: true` in `exportCDKitPrintSet3D` for crop/bleed/fold marks)
- Re-entering designer on an existing kit (currently must re-enter from scratch)
