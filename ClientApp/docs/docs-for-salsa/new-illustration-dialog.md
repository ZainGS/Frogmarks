# New Illustration Dialog

This document describes the "New Illustration" dialog in Frogmarks (`NewIllustrationDialogComponent`). It is opened before a new illustration is created and collects all user preferences. Salsa should implement an equivalent UI in its shell flow whenever the user creates a new project.

---

## Overview

The dialog has two modes: **New Illustration** (default) and **Import** (triggered when importing a `.frogmarks` file). The mode is passed in as `data.importMode`. In import mode the canvas-size section is hidden (size comes from the file), and only the name + storage mode are shown.

Dialog title: `"New Illustration"` or `"Import Illustration"` depending on mode.

---

## Sections (New Illustration mode)

### 1. Canvas Mode

A two-button toggle:

| Button    | Value       | Description                                                  |
|-----------|-------------|--------------------------------------------------------------|
| Bounded   | `bounded=true` (default) | A fixed-size canvas with explicit pixel dimensions |
| Infinite  | `bounded=false`           | No fixed boundary; user pans/zooms freely          |

When `Infinite` is selected, all size/orientation controls are hidden and a hint text shows:
> "Infinite canvas — no fixed boundary. Pan and zoom freely."

---

### 2. Preset (only when Bounded)

A `<select>` dropdown. Selecting a preset auto-populates Width and Height. Available presets:

| Label                | Width (px) | Height (px) | Notes                          |
|----------------------|-----------|------------|-------------------------------|
| Square               | 1080      | 1080       |                               |
| Instagram Post       | 1080      | 1080       |                               |
| Instagram Story      | 1080      | 1920       |                               |
| Twitter / X Post     | 1200      | 675        |                               |
| A4 Print (300 dpi)   | 2480      | 3508       |                               |
| 4K                   | 3840      | 2160       |                               |
| HD 1080p             | 1920      | 1080       | **Default selection**         |
| Custom               | —         | —          | Typing custom values sets this |

Default selection: **HD 1080p** (1920 × 1080).

---

### 3. Size (only when Bounded)

Two numeric inputs for **Width** and **Height**, both clamped to `1–8192 px`.

Between them is a `×` separator and a `px` unit label.

An **aspect ratio lock** button (lock/lock_open icon) sits after the px label. When locked (default), changing width recalculates height and vice versa to preserve the ratio.

An aspect ratio label shows the simplified ratio (e.g. `"16 : 9"`, `"4 : 3"`) below the inputs.

If either dimension exceeds 4096 px a warning is shown:
> "⚠ Large canvases may be slow on some devices."

---

### 4. Orientation (only when Bounded)

Three-button toggle:

| Button    | Behavior                                          |
|-----------|---------------------------------------------------|
| Portrait  | Ensures height > width (swaps if needed)          |
| Landscape | Ensures width > height (swaps if needed)          |
| Square    | Sets both dimensions to `max(width, height)`      |

The active orientation is highlighted.

---

### 5. Aspect Ratio Preview (only when Bounded)

A small visual box (max 72 × 72 px container) that scales to show the aspect ratio of the chosen canvas size. No labels — purely visual.

---

### 6. Storage (shown in all modes)

Three cards, only one selectable at a time (`syncMode` is a number):

| Card label  | syncMode | Enabled for  | Description shown to user |
|-------------|----------|--------------|---------------------------|
| Local only  | `2` (default) | All users | "Zero cloud. Everything stored locally in this browser only." Full tooltip: pixel data lives in OPFS/IndexedDB. Clearing browser storage deletes it permanently. No server involved. |
| No-cloud    | `1` | Logged-in users only | "Metadata saved to server. Pixel data stays on this device — never uploaded to Azure." Full tooltip: settings synced to server for multi-device discovery; pixel data stays in OPFS. |
| Cloud       | `0` | Logged-in users only | "Syncs to cloud — accessible from any device." Full tooltip: artwork securely backed up, synced, shareable. |

If the user is not logged in, No-cloud and Cloud cards are visually disabled (`.nid-sync-btn--disabled` CSS class applied, click is no-op). A warning line shows:
> "Sign in to use Cloud or No-cloud storage."

Each card also has a `?` tooltip icon that the user can click for more detail without triggering card selection (`$event.stopPropagation()`).

---

## Footer Buttons

| Button   | Action                                |
|----------|---------------------------------------|
| Cancel   | Closes dialog, returns `null`         |
| Create   | Closes dialog, returns result object  |

---

## Result Object

On `Create`, the dialog closes with one of:

**Bounded illustration:**
```json
{
  "name": "Untitled Illustration",
  "docW": 1920,
  "docH": 1080,
  "bounded": true,
  "syncMode": 2
}
```

**Infinite illustration:**
```json
{
  "name": "Untitled Illustration",
  "docW": null,
  "docH": null,
  "bounded": false,
  "syncMode": 2
}
```

**Import mode:**
```json
{
  "name": "Imported Illustration",
  "syncMode": 2
}
```

`null` is returned on Cancel.

---

## How the result is used in Frogmarks

The caller reads `result.syncMode` to know which storage path to set up:
- `syncMode=2` → local only, OPFS + IndexedDB, UUID-keyed (`LocalIllustrationService`)
- `syncMode=1` → metadata to server, pixel data stays in OPFS
- `syncMode=0` → full cloud sync via Azure blob

`docW` / `docH` set the initial artboard/canvas dimensions via `shapeManager.setDocumentSize(docW, docH)`. If both are `null` (`bounded=false`), no fixed artboard is applied — the canvas is infinite.

---

## Implementation Notes for Salsa Shell

When Salsa's shell needs to create a new project, it should show a UI equivalent to this dialog before firing `createProject(name)`. The key fields Frogmarks needs back from the user:

1. **Canvas mode** (bounded vs infinite) — determines whether to call `setDocumentSize`
2. **Dimensions** (width × height in px, 1–8192, with presets) — passed to `setDocumentSize`
3. **Storage mode** (local / no-cloud / cloud) — determines `syncMode` value

Currently, the shell's `createProject(name)` hook only receives the name. In the future, storage mode and canvas size should be passed as well. For now, local-only (`syncMode=2`) is the default.
