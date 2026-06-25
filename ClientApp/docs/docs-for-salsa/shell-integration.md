# Shell Integration

This document describes how Frogmarks wires up Salsa's shell UI, the dual-canvas architecture, known working state, and open issues. Reference this when making changes to the shell, canvas management, or navigation.

---

## Architecture Overview

Two independent canvases exist simultaneously:

| Canvas | ID | Lives in | Used for |
|--------|----|----------|----------|
| `#shellCanvas` | `shellCanvas` | `StudioComponent` template | Shell UI rendering + input |
| `#webgpuCanvas` | `webgpuCanvas` | `IllustrationComponent` template | Illustration editor rendering + input |

They are completely independent — no shared canvas, no renderer handoff. The renderer starts fresh on whichever canvas is needed for the current route.

---

## Routes

| Path | Component | Canvas present |
|------|-----------|---------------|
| `/` | `StudioComponent` | `#shellCanvas` only |
| `/illustration/local/:id` | `IllustrationComponent` | `#webgpuCanvas` only |
| `/illustration/:id` | `IllustrationComponent` | `#webgpuCanvas` only |

---

## StudioComponent Setup

Full init sequence in `studio.component.ts`:

```typescript
async ngOnInit(): Promise<void> {
  // 1. Boot renderer on the shell canvas (cold start only)
  if (!isRendererLive) {
    await startWebGPURendering('shellCanvas');
  }

  // 2. Get ShapeManager + wait for WebGPU
  this.sm = ShapeManager.getInstance();
  await this.sm.whenWebGPUReady?.();

  // 3. Wire Frogmarks's IndexedDB store as the document source
  //    MUST be called BEFORE shell.load()
  this.sm.shell?.setDocumentSource?.({
    listProjects:  async () => { /* maps LocalIllustrationService.getAll() */ },
    createProject: async (name) => { /* LocalIllustrationService.create(name) */ },
    deleteProject: (id) => { /* LocalIllustrationService.delete(id) */ },
    renameProject: (id, name) => { /* LocalIllustrationService.rename(id, name) */ },
  });

  // 4. Load the shell
  await this.sm.shell?.load?.();
  this.sm.setShellLogo?.('assets/images/logo.png');

  // 5. Subscribe to shell events
  this._activateSub = this.sm.shell?.onActivate?.subscribe(({ id, kind }) => { ... });
  this._changeSub   = this.sm.shell?.onChange?.subscribe(() => { ... });

  // 6. Hand the shell canvas element directly — never getRendererCanvas()
  const shellCanvas = document.getElementById('shellCanvas') as HTMLCanvasElement;
  await this.sm.shell?.initializeScene?.(shellCanvas);
}

ngOnDestroy(): void {
  this._activateSub?.unsubscribe();
  this._changeSub?.unsubscribe();
  this.sm?.shell?.destroyScene?.();
}
```

### Why `getElementById('shellCanvas')` not `getRendererCanvas()`

`getRendererCanvas()` returns the renderer's primary canvas. If the user navigated back from an illustration, `isRendererLive` is `true` and `startWebGPURendering('shellCanvas')` is skipped — the renderer would still be on `webgpuCanvas`. Passing `getRendererCanvas()` to `initializeScene` would then bind shell input to the wrong canvas. Always pass the shell canvas element directly.

---

## Shell Canvas CSS Requirements

```html
<canvas id="shellCanvas"
  style="display:block; position:fixed; top:0; left:0;
         width:100vw; height:100vh; z-index:0;
         touch-action:none; pointer-events:auto;">
</canvas>
```

**`pointer-events:auto` is required.** The `StudioComponent` host element has `pointer-events:none` in its SCSS (so the overlay doesn't block the canvas). Without the explicit `pointer-events:auto` on the canvas, it inherits `none` and all shell input is silently dropped.

**`z-index:0`** — do not raise this above 0. Angular Material dialogs use `.cdk-overlay-container` at `z-index:1000`. If `shellCanvas` is at `z-index:1` or higher and sits in a stacking context that beats the overlay, dialogs will render behind the canvas and be invisible/non-interactive.

---

## Activation Flow

```
shell fires onActivate({ id, kind })
    ↓
kind === 'project'
    ├── id is in _newlyCreatedIds  →  open NewIllustrationDialog → navigate to /illustration/local/:id
    └── id is not new             →  navigate directly to /illustration/local/:id

kind === 'empty'   →  show install-cart dialog
kind === 'system'  →  id === 'system:settings'  →  show settings overlay
```

### New project flow

When `createProject(name)` fires in the `setDocumentSource` hook, Frogmarks adds the new UUID to `_newlyCreatedIds`. When `onActivate` fires for that ID, Frogmarks opens `NewIllustrationDialogComponent` before navigating, so the user can pick canvas size and storage mode. The dialog result's `docW`/`docH` are passed as query params:

```typescript
this.router.navigate(['/illustration/local', projectId], {
  queryParams: { docW: result.docW, docH: result.docH },
});
```

`IllustrationComponent` reads these query params and calls `shapeManager.setDocumentSize(docW, docH)` to initialize the artboard. If the user cancels the dialog, navigation still proceeds with no size params (infinite canvas default).

---

## IllustrationComponent Canvas

`#webgpuCanvas` lives in `IllustrationComponent`'s template with Angular event bindings:

```html
<canvas #webgpuCanvas id="webgpuCanvas"
        [style.width]="uvEditorOpen ? '50vw' : ''"
        (dragover)="onCanvasDragOver($event)"
        (drop)="onCanvasDrop($event)"
        (pointerdown)="scene3dCanvasPointerDown($event)"
        (pointermove)="scene3dCanvasPointerMove($event)"
        (pointerup)="scene3dCanvasPointerUp($event)">
</canvas>
```

Bound via `@ViewChild('webgpuCanvas', { static: true })`.

### Why the canvas lives here (not AppComponent)

The canvas starts at 0×0, grows to fill the `.board-shell` container via normal layout. This triggers Salsa's `ResizeObserver → setCanvasSize()` after the document loads, which recalculates world-matrix / depth-texture / artboard. A persistent full-viewport canvas (position:fixed in AppComponent) never resizes, so `setCanvasSize` never re-ran after load → raster compositor drew against stale layout → black canvas. The natural resize from layout is what makes raster compositing work correctly.

### Post-load resize dispatch

`markLoaded()` (fires once when all three gates clear: `renderer`, `illustration`, `sceneApplied`) dispatches a synthetic resize event:

```typescript
window.dispatchEvent(new Event('resize'));
```

This triggers Salsa's `setCanvasSize` path as a belt-and-suspenders guarantee even on fast loads where the layout resize may have already settled.

---

## Boot Paths in IllustrationComponent

```typescript
if (!isRendererLive) {
  // Cold start — first page load, came directly to /illustration
  await startWebGPURendering('webgpuCanvas').then(() => this.afterRendererBoot());
} else {
  // Renderer already live — came from shell or another illustration
  await reinitializeWebGPURendering('webgpuCanvas').then(() => this.afterRendererBoot());
}
```

**Cold start (`isRendererLive = false`)** — confirmed working.

**`reinitializeWebGPURendering` path** — needed when navigating from the shell to an illustration. This path has **not been confirmed working** end-to-end. The renderer boots on `shellCanvas`; `reinitializeWebGPURendering('webgpuCanvas')` must re-attach it to `webgpuCanvas`. This is an open issue to resolve with Salsa.

---

## Known Working / Not Working

| Scenario | Status |
|----------|--------|
| Direct navigation to `/illustration/local/:id` (cold start) | ✅ Working |
| Shell renders at `/` with project thumbnails | ✅ Working |
| Shell pointer/mouse events | ✅ Working |
| New project dialog opens from shell | ✅ Working |
| Opening existing project from shell → illustration | ⚠️ Untested / likely broken via `reinitializeWebGPURendering` |
| Navigating back from illustration → shell | ⚠️ Untested |

---

## `clearDocumentSize` — Do Not Call in `afterRendererBoot`

The else-branch of `afterRendererBoot` (when no explicit doc size is set) should call `shapeManager.setIllustrationBounds(1, 1.417)` directly — **not** `clearDocumentSize`. Calling `clearDocumentSize` here creates `rasterWorldQuadVB` with `illustrationMode=false` before `setDocumentSize` can flip it to `true`, resulting in a white/broken canvas. This was a root-cause bug that has been fixed by removing the `clearDocumentSize` call.
