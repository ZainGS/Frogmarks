# UV Editor — Integration Reference

## Architecture

The UV Editor is a split-viewport mode. When open:

- The 3D canvas shrinks to 50% viewport width (`[style.width]="uvEditorOpen ? '50vw' : ''"`)
- A 2D HTML canvas (`#uvCanvas`) occupies `calc(50vw - 280px)` starting at `left: 50vw`, leaving the right panel clear
- All normal mesh inspector sections are hidden via `*ngIf="!uvEditorOpen"` in the right column
- A dedicated `app-uv-editor-panel` overlay takes over the right panel for the duration

### Component split

| Responsibility | Lives in |
|---|---|
| Canvas, pointer handlers, `_uvDraw()` | `illustration.component.ts` |
| Session, renderer, paint canvas objects | `illustration.component.ts` (passed to panel as inputs) |
| All UV operation buttons (seams, unwrap, etc.) | `UvEditorPanelComponent` |
| Paint mode toggle, brush color/radius | `UvEditorPanelComponent` (emits to parent) |

### Panel component

```
app-uv-editor-panel
  @Input()  shapeManager  — sm reference
  @Input()  meshId        — active mesh
  @Input()  session       — UVEditorSession (panel mutates display props directly)
  @Input()  layers        — {id, name}[] for Live Texture picker
  @Output() closeRequest        — user clicked Close
  @Output() redrawRequested     — panel called an SM op; parent should call _uvDraw()
  @Output() paintSettingsChange — {paintMode, color, radius} on any paint control change
```

Illustration component wires these in the overlay section (alongside armature/GP panels):

```html
<app-uv-editor-panel
    *ngIf="uvEditorOpen"
    [shapeManager]="$any(shapeManager)"
    [meshId]="scene3dSelectedMeshId"
    [session]="uvSession"
    [layers]="uvLayers"
    (closeRequest)="closeUVEditor()"
    (redrawRequested)="uvDraw()"
    (paintSettingsChange)="onUvPaintSettingsChange($event)">
</app-uv-editor-panel>
```

---

## Key objects

| Object | Created by | Description |
|---|---|---|
| `UVEditorSession` | `sm.openUVEditor3D(meshId)` | Display state: `showWireframe`, `showIslands`, `showStretchOverlay`, `islandHoverMode`, `panU`, `panV`, `zoom`, `selection.mode` |
| `UVCanvasRenderer` | `sm.createUVCanvasRenderer(canvas)` | Renders UV map into a 2D HTML canvas (not WebGPU) |
| Paint canvas | `sm.ensureUVPaintCanvas3D(meshId)` | CPU-side `HTMLCanvasElement`; draw on it with 2D context |

---

## Opening and closing

```ts
// In illustration.component.ts

get uvSession(): any { return this._uvSession; }   // public getter for template binding

openUVEditor(): void {
  const sm = this.shapeManager as any;
  // openUVEditor3D handles orbit setup internally — no enterMeshEditMode3D needed
  this._uvSession = sm.openUVEditor3D?.(this.scene3dSelectedMeshId);
  if (!this._uvSession) return;
  this.uvEditorOpen = true;
  setTimeout(() => {
    const uvCanvas = this.uvCanvasRef?.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    uvCanvas.width  = Math.round((window.innerWidth * 0.5 - 280) * dpr);
    uvCanvas.height = Math.round(window.innerHeight * dpr);
    this._uvRenderer = sm.createUVCanvasRenderer?.(uvCanvas);
    this._uvPaintCanvas = sm.ensureUVPaintCanvas3D?.(this.scene3dSelectedMeshId) ?? null;
    this.uvLayers = (sm.getLayers?.() ?? []).map((l: any) => ({ id: l.id, name: l.name }));
    this._uvDraw();
    this._attachUVPointerHandlers(uvCanvas);
  });
}

closeUVEditor(): void {
  sm.closeUVEditor3D?.(this.scene3dSelectedMeshId);
  this._uvSession = null; this._uvRenderer = null; this._uvPaintCanvas = null;
  this.uvEditorOpen = false; this.uvPaintMode = false;
}

// Called by panel's (redrawRequested) output
uvDraw(): void { this._uvDraw(); }

// Called by panel's (paintSettingsChange) output
onUvPaintSettingsChange(e: { paintMode: boolean; color: string; radius: number }): void {
  this.uvPaintMode = e.paintMode;
  this.uvBrushColor = e.color;
  this.uvBrushRadius = e.radius;
}
```

**Important:** canvas pixel dimensions must be set explicitly before `createUVCanvasRenderer`. The default 300×150 canvas buffer produces a broken draw.

---

## Drawing

```ts
private _uvDraw(): void {
  const em = sm.getEditMesh3D?.(this.scene3dSelectedMeshId);
  this._uvRenderer.draw(this._uvSession, em, this._uvPaintCanvas ?? undefined);
}
```

- `em` (edit mesh) is required — `draw(session)` with one arg crashes with `computeUVIslands`
- `_uvPaintCanvas` is optional; overlay paint strokes on the UV grid when passed

---

## Pointer coordinates

All UV canvas methods take **CSS pixel coords** (offset from canvas top-left, not scaled by DPR):

```ts
const { x, y } = { x: e.clientX - rect.left, y: e.clientY - rect.top };
```

Do NOT multiply by `canvas.width / rect.width` — the renderer expects CSS coords.

---

## Pointer handlers (in illustration.component.ts)

The pointer handlers stay in the illustration component because they need direct access to `_uvRenderer`, `_uvSession`, `_uvPaintCanvas`, and the instance-group sibling list.

| Event | Action |
|---|---|
| `pointermove` (not painting) | `hitTestFace(x, y, session, em)` → `setUVHoverFace3D` → redraw |
| `pointermove` (painting) | `canvasToUV(x, y, session)` → draw circle on paint canvas → redraw |
| `pointerdown` (not painting) | `hitTestFace` → `session.selectFace(fi, shiftKey)` |
| `pointerdown` (painting) | `canvas.setPointerCapture(pointerId)`, begin stroke |
| `pointerup` | `commitUVTexture3D` → `shareUVTexture3D(siblings)` → redraw |
| `pointerleave` | `setUVHoverFace3D(null)` → redraw |
| `wheel` | `session.zoom` clamped to `[0.1, 20]` |

Paint mode and brush settings are read from `this.uvPaintMode / uvBrushColor / uvBrushRadius`, which are kept in sync by `onUvPaintSettingsChange`.

---

## UV paint + instance group sharing

1. `ensureUVPaintCanvas3D(meshId)` returns (or creates) a CPU `HTMLCanvasElement`
2. Map UV coords: `px = u * canvas.width`, `py = v * canvas.height`
3. Draw strokes via 2D context
4. On `pointerup`:
   ```ts
   sm.commitUVTexture3D?.(meshId);                         // CPU → new GPUTexture
   const siblings = this._instanceGroupSiblings(meshId);
   if (siblings.length) sm.shareUVTexture3D?.(meshId, siblings);
   ```

**Caution:** `commitUVTexture3D` allocates a new `GPUTexture` every stroke-end. Previously-shared references go stale — re-share on every commit. See `docs/instance-group-uv-share.md`.

---

## Salsa API reference

All methods take `meshId` as first argument.

```ts
// Session lifecycle
sm.openUVEditor3D(meshId): UVEditorSession
sm.closeUVEditor3D(meshId): void

// Renderer
sm.createUVCanvasRenderer(canvas: HTMLCanvasElement): UVCanvasRenderer
  .draw(session, editMesh, paintCanvas?)
  .hitTestFace(x, y, session, editMesh): number | null   // CSS coords
  .canvasToUV(x, y, session): [u: number, v: number]     // CSS coords

// Edit mesh
sm.getEditMesh3D(meshId): EditMesh3D | null

// Hover
sm.setUVHoverFace3D(meshId, faceIndex: number | null): void

// Seams
sm.markSeam3D(meshId, halfEdgeIndices: number[]): void
sm.clearSeam3D(meshId, halfEdgeIndices: number[]): void
sm.clearAllSeams3D(meshId): void
sm.suggestSeams3D(meshId, angleThresholdDeg: number): void
sm.getEditSelection3D(meshId): { edges: number[] }

// Unwrap
sm.smartProjectUVs3D(meshId): void
sm.unwrapUVIslands3D(meshId): void
sm.followActiveQuadUVs3D(meshId): void

// Layout
sm.packUVIslands3D(meshId, margin: number): void

// Transform (rotate takes radians)
sm.moveSelectedUVs3D(meshId, du: number, dv: number): void
sm.scaleSelectedUVs3D(meshId, su: number, sv: number): void
sm.rotateSelectedUVs3D(meshId, radians: number): void
sm.mirrorUVs3D(meshId, axis: 'U' | 'V'): void

// Weld / split
sm.weldSelectedUVs3D(meshId, threshold: number): void
sm.splitSelectedUVs3D(meshId): void

// Pin
sm.pinSelectedUVs3D(meshId): void
sm.unpinSelectedUVs3D(meshId): void
sm.unpinAllUVs3D(meshId): void

// Texture paint
sm.ensureUVPaintCanvas3D(meshId): HTMLCanvasElement
sm.commitUVTexture3D(meshId): void
sm.shareUVTexture3D(meshId, targetIds: string[]): void

// Live texture
sm.linkLiveTexture3D(meshId, layerId: string): void
sm.unlinkLiveTexture3D(meshId): void
sm.syncLiveTextures3D(): void

// Export (returns HTMLCanvasElement → .toDataURL('image/png'))
sm.exportUVLayout3D(meshId, width: number, height: number): HTMLCanvasElement
```

---

## HTML canvas element

```html
<canvas #uvCanvas id="uvCanvas" *ngIf="uvEditorOpen"
  style="position:absolute;top:0;left:50vw;width:calc(50vw - 280px);height:100vh;
         z-index:1;background:#111;border-left:1px solid #333;cursor:crosshair;"></canvas>
```

The `#uvCanvas` `ViewChild` is accessed via `@ViewChild('uvCanvas') uvCanvasRef?: ElementRef<HTMLCanvasElement>` in the illustration component. `setTimeout` is required before accessing it because the DOM isn't yet painted when `uvEditorOpen` first flips to `true`.
