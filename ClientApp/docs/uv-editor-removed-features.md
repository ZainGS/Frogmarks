# UV Editor — Removed UI Features

**Last Updated:** 2026-06-14

The UV editor panel was simplified to a minimal workflow: Unwrap → Paint → Export. Several features were removed from the Frogmarks UI because they added complexity without fitting the app's core use case. All of them remain fully supported in the Salsa engine.

---

## What was removed and why

### Seams (Mark / Clear / Suggest)
**Salsa APIs:** `markSeam3D`, `clearSeam3D`, `clearAllSeams3D`, `suggestSeams3D`

Seams tell the unwrap algorithm where to cut the mesh open before flattening it, giving precise control over island layout. For Frogmarks' "unwrap and paint" workflow, Smart Project (`autoUnwrap3D`) places its own cuts automatically — manual seam marking is only useful when carefully hand-placing UV islands for multi-pass texture atlas work, which is not a current Frogmarks use case.

### Layout — Pack Islands
**Salsa API:** `packUVIslands3D(meshId, margin?)`

Packs all UV islands into the [0,1] UV space as efficiently as possible. Useful when building texture atlases across multiple meshes. Removed as it targets a workflow Frogmarks doesn't currently support.

### Transform (Move / Scale / Rotate / Mirror)
**Salsa APIs:** `moveSelectedUVs3D`, `scaleSelectedUVs3D`, `rotateSelectedUVs3D`, `mirrorUVs3D`

Numeric transform controls for UV islands. Removed in favour of the viewport-driven UV paint workflow. If precise island placement becomes a need, these can be re-added.

### Weld / Split
**Salsa APIs:** `weldSelectedUVs3D`, `splitSelectedUVs3D`

Merges nearby UV vertices (weld) or separates them at selected edges (split). Advanced operations for fixing seams in imported meshes or detailed manual UV editing. Not relevant to the paint workflow.

### Pin / Unpin
**Salsa APIs:** `pinSelectedUVs3D`, `unpinSelectedUVs3D`, `unpinAllUVs3D`

Locks UV vertices in place so they don't move when re-unwrapping. Only useful when doing multi-pass unwrap work — pinning positions you've manually adjusted so a subsequent unwrap doesn't overwrite them. Not relevant when unwrapping once and painting.

### Link Illustration Layer (formerly "Live Texture")
**Salsa APIs:** `linkLiveTexture3D`, `unlinkLiveTexture3D`, `syncLiveTextures3D`, `isLiveTextureLinked3D`, `getLiveTextureLayerId3D`

Mapped a 2D raster illustration layer onto the mesh as its diffuse texture. The limitation was that you painted on the illustration canvas without seeing the UV layout (paint-blind). Removed in favour of UV Texture Paint, which lets you paint directly on the unwrapped UV with live feedback on the 3D mesh.

### Selection Mode Tabs (Vertex / Edge / Face)
**Salsa API:** `session.selection.mode`

UV selection mode was used by the removed transform/weld/split operations. With those gone, and with Salsa owning all canvas interaction during paint mode, the selection tabs have no remaining function in the simplified panel.

---

## What was kept

| Feature | Salsa API |
|---------|-----------|
| Display toggles (wireframe, islands) | `session.showWireframe`, `session.showIslands` |
| Unwrap Mesh (Smart Project) | `autoUnwrap3D(meshId)` |
| UV Texture Paint | `enterUVPaintMode3D`, `exitUVPaintMode3D`, `setUVPaintBrush3D`, `isUVPaintActive3D` |
| Export UV Layout | `exportUVLayout3D(meshId, w, h)` |

---

## Re-enabling any of these

All removed APIs are still present in the Salsa engine. To re-add any feature, wire the Salsa API call back into the panel component (`uv-editor-panel.component.ts`) and add the corresponding UI to `uv-editor-panel.component.html`. No Salsa changes needed.
