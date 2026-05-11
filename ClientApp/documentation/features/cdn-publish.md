# Feature: CDN Publish

The CDN Publish feature packages the current illustration into a `.frogmarks` archive, uploads it to the backend CDN, and marks the illustration as publicly viewable. After publishing, a share dialog shows the view URL and a `<salsa-viewer>` embed snippet.

---

## Flow

```
1. User clicks "Publish" in the top toolbar
2. IllustrationComponent.publishIllustration() runs
3. sm.packProject()  → Promise<Blob> (.frogmarks ZIP, auto-collects all scene state)
4. IllustrationService.publishIllustration(id, blob)  → POST /api/illustration/{id}/publish
5. On success:
   a. Update illustration.isPublic / publishedVersion / publishedAt
   b. Build view URL and embed code
   c. Open share dialog (showPublishShareDialog = true)
```

---

## `publishIllustration()` in `IllustrationComponent`

State fields:

```typescript
isPublishing = false;
showPublishShareDialog = false;
publishShareViewUrl = '';
publishShareEmbedCode = '';
```

The method is `async` with a top-level `try/finally` so any synchronous throw from `packProject` (e.g. if ShapeManager is null) is caught and surfaces as an error toast rather than a silent no-op:

```typescript
async publishIllustration(): Promise<void> {
  if (!this.illustration?.id || this.isPublishing) return;
  this.isPublishing = true;
  this.closeContextMenu();
  try {
    const sm = this.shapeManager as any;
    if (!sm?.packProject) throw new Error('packProject not available');
    const bundle: Blob = await sm.packProject();
    await new Promise<void>((resolve, reject) => {
      this.illustrationService.publishIllustration(id, bundle, title).subscribe({
        next: (res) => { /* build share URLs, showPublishShareDialog = true */ resolve(); },
        error: (err) => reject(err),
      });
    });
  } catch (e) {
    this.notifyService.error(...);
  } finally {
    this.isPublishing = false;
  }
}
```

---

## Share Dialog

Shown via `*ngIf="showPublishShareDialog"`. Contains:

- **View link** — read-only input showing `publishShareViewUrl`; click to auto-select text
- **Embed on your site** — read-only textarea showing `publishShareEmbedCode`; click to auto-select
- Copy buttons for each field (`copyPublishUrl()`, `copyEmbedCode()`) — use `navigator.clipboard.writeText()`
- Close button / backdrop click → `closePublishShareDialog()`

Template uses `$any($event.target).select()` to call `.select()` on the inputs, bypassing `EventTarget` type constraints.

---

## `<salsa-viewer>` Embed

The embed snippet loads a viewer web component:

```html
<script src="https://app.frogmarks.io/salsa-viewer.js"></script>
<salsa-viewer src="https://app.frogmarks.io/view/{uid}"></salsa-viewer>
```

Embedding this in any HTML page renders an interactive illustration viewer (pan/zoom, 3D, animation playback) backed by the published `.frogmarks` CDN file.

---

## Unpublish

```typescript
unpublishIllustration(): void
// IllustrationService.unpublishIllustration(id)
// → PUT /api/illustration/{id}/unpublish (or DELETE variant)
// Sets illustration.isPublic = false
// The share dialog is never shown for unpublish
```

---

## Salsa Pack API

The publish flow uses Salsa's project packaging system. See `features/persistence-formats.md` → `.frogmarks` section for the full pack format and API.

```typescript
// Called inside publishIllustration():
const blob = await (sm as any).packProject?.({
  docPayload: sm.snapshotDocument(),
  nodes3d: (sm as any).getScene3DNodeStates?.() ?? [],
  models3d: (sm as any).getGltfBuffers3D?.() ?? {},
  textureLibrary: null,
});
```

The resulting `Blob` is a ZIP archive. It is uploaded via `multipart/form-data` to the backend CDN endpoint.

---

## IllustrationService Endpoints

| Method | HTTP | Notes |
|--------|------|-------|
| `publishIllustration(id, blob)` | `PUT /api/illustration/{id}/publish` | Multipart; uploads `.frogmarks` to CDN |
| `unpublishIllustration(id)` | `PUT /api/illustration/{id}/unpublish` | Marks `isPublic = false`; CDN file may remain but is unlisted |
