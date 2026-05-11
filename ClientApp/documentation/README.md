# Frogmarks ClientApp Documentation

Three folders, same purpose as the Salsa docs:

- `reference/` — authoritative module-level reference (one file per major system)
- `features/` — per-feature integration guides (how Angular wires each feature to Salsa)
- `backlog/` — UX improvement backlog

---

## Reference

| File | What it covers |
|------|----------------|
| [reference/00-architecture-overview.md](reference/00-architecture-overview.md) | Repo layout, module breakdown, tech stack, Salsa integration summary, rendering pipeline |
| [reference/01-illustration-editor.md](reference/01-illustration-editor.md) | IllustrationComponent lifecycle, tool switching, auto-save, load/save flow, keyboard shortcuts |
| [reference/02-salsa-integration.md](reference/02-salsa-integration.md) | `as any` pattern, singleton lifecycle, event subscriptions, viewport sync, brush service integration |
| [reference/03-3d-panel.md](reference/03-3d-panel.md) | 3D panel activation, outliner, mesh CRUD, transform inspector, lighting, shadows, PS1 effects, keyframes |
| [reference/04-services-reference.md](reference/04-services-reference.md) | All Angular services: IllustrationService, FrogFileService, RasterBrushService, RasterSelectionService, RasterAnimationService, LocalIllustrationService, RasterAutoSaveService |
| [reference/05-persistence-formats.md](reference/05-persistence-formats.md) | Cloud V2 save, .frog format, .frogmarks format, local-only (syncMode 2), OPFS auto-save |
| [reference/06-boards.md](reference/06-boards.md) | BoardComponent lifecycle, tools, shapes, layer tree, save/load, keyboard shortcuts |
| [reference/07-dashboard-and-home.md](reference/07-dashboard-and-home.md) | HomeComponent animations, DashboardComponent grid layout, FLIP animation, filters, local items |

---

## Features

| File | What it covers |
|------|----------------|
| [features/brush-system.md](features/brush-system.md) | BrushPreset structure, CRUD, `_mutatePreset` pattern, dynamics curves, stabilization, bleed, smudge, dual brush, wet edges |
| [features/dither.md](features/dither.md) | DitherConfig, 6 algorithms, quantize/duotone color modes, per-layer wiring, Salsa API |
| [features/frame-link-animation.md](features/frame-link-animation.md) | FrameLinkAnimation, 5 animation types, loop modes, per-layer wiring, Salsa API |
| [features/selection-tools.md](features/selection-tools.md) | 4 selection tools, magic wand options, floating selection transform, feather |
| [features/raster-text.md](features/raster-text.md) | RasterTextState, font controls, live preview, commit/cancel, caret navigation |
| [features/speech-balloons.md](features/speech-balloons.md) | BalloonStyle, TailSide, SpeechBalloonOptions, text effects, writing mode |
| [features/cdn-publish.md](features/cdn-publish.md) | Publish flow, share dialog, salsa-viewer embed, unpublish, pack API |
| [features/canvas-grain.md](features/canvas-grain.md) | CanvasGrainSettings (paper), BrushTexture (per-dab grain), service methods, persistence notes |
| [features/live-text.md](features/live-text.md) | LiveTextNode placement/editing, style updates, TextEffectEntry chain (5 effect types), custom WGSL shaders |
| [features/panel-layout.md](features/panel-layout.md) | PanelTemplate (9 templates), PanelLayoutOptions, page size presets, guide overlays, live mutation API |

---

## Backlog

| File | What it covers |
|------|----------------|
| [backlog/ux-backlog.md](backlog/ux-backlog.md) | Known gaps, improvement ideas, and status tracking (all current items are ✅ Done) |
