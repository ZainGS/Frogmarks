# UX Backlog

Improvement ideas and known gaps, organized by area. Items within each section are roughly ordered by effort-to-value.

---

## Bugs / Incomplete Features

| # | Item | Status | Notes |
|---|------|--------|-------|
| B1 | **Multi-material slots on 3D meshes** | ✅ Done | Add/remove/edit material slots wired to `getMeshSubmeshes3D` / `appendMeshSubmesh3D` / `setMeshSubmesh3D` / `removeMeshSubmesh3D` / `clearMeshSubmeshes3D`. |
| B2 | **Undo/redo for keyframe operations** | ✅ Done | Salsa shipped the fix: `setMeshKeyframe`, `removeMeshKeyframe`, `clearMeshKeyframeTracks` now push to `UndoManager3D` internally. Existing `undo3D()`/`redo3D()` calls in Frogmarks already work — no code change needed. |
| B3 | **"Clear All Keyframes" scope** | ✅ Done | Per-track clear via right-click on track label (T2). Mesh-level clear-all via easing menu. Both options available. |

---

## Dashboard

| # | Item | Status | Notes |
|---|------|--------|-------|
| D1 | **Search / filter illustrations** | ✅ Done | Text filter on the grid. |
| D2 | **Sort order toggle** | ✅ Done | Newest first, name A–Z, date modified, date created. |
| D3 | **Batch select + delete** | ✅ Done | Checkbox batch mode with bulk delete. |

---

## Illustration Editor

| # | Item | Status | Notes |
|---|------|--------|-------|
| E1 | **Keyboard shortcut cheatsheet** | ✅ Done | `?` button opens modal listing all hotkeys. |
| E2 | **Zoom controls** | ✅ Done | Zoom % display (click to fit), `Ctrl+0` fits artboard, `+`/`-` zoom in/out. |
| E3 | **Color history swatches** | ✅ Done | Last 8 used colors shown near color picker. All picker entry points tracked. |

---

## Animation Timeline

| # | Item | Status | Notes |
|---|------|--------|-------|
| T1 | **Multi-keyframe selection** | ✅ Done | Shift+click diamonds, bulk move/delete bar. |
| T2 | **Per-track "Clear" from track label** | ✅ Done | Right-click track label to clear only that track. |

---

## Quick Wins (Q-series)

| # | Item | Status | Notes |
|---|------|--------|-------|
| Q1 | **Ctrl+0 → fit artboard** | ✅ Done | Wired into `handleHotkeys`. |
| Q2 | **Palette swatch customization** | ✅ Done | Right-click any palette circle → "Set to current color". Persisted in `localStorage('frog-pen-palette')`. |
| Q3 | **Collapse/expand all 3D mesh tracks** | ✅ Done | `▼▼/▶▶` toggle button in timeline transport bar. |
| Q4 | **Play range drag handles** | ✅ Done | Draggable start/end handles in the timeline frame header row. |

---

## Medium Features (M-series)

| # | Item | Status | Notes |
|---|------|--------|-------|
| M1 | **Duplicate layer (Ctrl+J) + Merge Down** | ✅ Done | Buttons in layers action bar; Ctrl+J keyboard shortcut. |
| M2 | **Canvas resize dialog** | ✅ Done | Width/height/anchor dialog, `⊞` button in top toolbar. |
| M3 | **Reference image layer** | ✅ Done | "📷 Reference Image" in `+Add` dropdown; file picker; distinct amber-tinted row. |
| M4 | **Brush preset save/load panel** | ✅ Done | Grid + editor already existed. Added "💾 Export Pack" alongside "📦 Import Pack". |

---

## Brush Effects

| # | Item | Status | Notes |
|---|------|--------|-------|
| BE1 | **Brush Bleed** | ✅ Done | Collapsible section in brush editor. Per-Dab (ping-pong every stamp) or End-of-Stroke (diffusion on pen lift). Calls `sm.setBrushBleed()`. |
| BE2 | **Brush Smudge** | ✅ Done | Collapsible section in brush editor. Picks up existing canvas color per-dab, scaled by stylus pressure (1-dab lag). Calls `sm.setBrushSmudge()`. |
