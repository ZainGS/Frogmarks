# Instance Group UV Share — Spec

## Problem

`sm.commitUVTexture3D(meshId)` creates a **brand-new `GPUTexture`** on every stroke-end. Any mesh that was previously given the same texture via `sm.shareUVTexture3D` now holds a stale reference. Frogmarks must re-share after every commit.

Frogmarks also needs a data model to know which meshes are "the same model" so it can pass the right sibling IDs to `shareUVTexture3D`.

---

## Data model: instanceGroupId

Frogmarks owns this concept — it is not in Salsa. It lives entirely in `illustration.component.ts`.

```ts
// groupId (UUID string) → Set of meshIds that share a UV texture
private _instanceGroups = new Map<string, Set<string>>();

// meshId → groupId (reverse lookup for O(1) sibling queries)
private _meshGroupId = new Map<string, string>();
```

### Invariants

- Every meshId appears in at most one group.
- A group with fewer than 2 members is allowed (a single mesh can be the only member of its group while waiting for duplicates).
- A group is removed from `_instanceGroups` when it drops to 0 members.

---

## When to assign a groupId

### On GLTF / OBJ import

All meshes returned from a single `importGltfFile3D` call share one `instanceGroupId` — they come from the same source file and logically represent the same model.

```ts
// After importGltfFile3D:
const groupId = crypto.randomUUID();
this._instanceGroupRegister(groupId, meshes.map((m: any) => m.id ?? m.nodeId));

// After importObjFile3D (single mesh):
const groupId = crypto.randomUUID();
this._instanceGroupRegister(groupId, [mesh.id ?? mesh.nodeId]);
```

### On duplicate

A duplicated mesh inherits the **original's group**. If the original has no group yet (e.g. it was a primitive created before this system existed), create a new group containing both.

```ts
const copyId = copy.id ?? copy.nodeId;
const existingGroupId = this._meshGroupId.get(id);
if (existingGroupId) {
  this._instanceGroupRegister(existingGroupId, [copyId]);
} else {
  const groupId = crypto.randomUUID();
  this._instanceGroupRegister(groupId, [id, copyId]);
}
```

### On delete

Remove the mesh from its group so it no longer receives texture shares.

```ts
this._instanceGroupRemove(id);
```

---

## Helper methods

```ts
private _instanceGroupRegister(groupId: string, meshIds: string[]): void {
  if (!this._instanceGroups.has(groupId)) {
    this._instanceGroups.set(groupId, new Set());
  }
  const group = this._instanceGroups.get(groupId)!;
  for (const id of meshIds) {
    group.add(id);
    this._meshGroupId.set(id, groupId);
  }
}

private _instanceGroupRemove(meshId: string): void {
  const groupId = this._meshGroupId.get(meshId);
  if (!groupId) return;
  this._meshGroupId.delete(meshId);
  const group = this._instanceGroups.get(groupId);
  if (group) {
    group.delete(meshId);
    if (group.size === 0) this._instanceGroups.delete(groupId);
  }
}

private _instanceGroupSiblings(meshId: string): string[] {
  const groupId = this._meshGroupId.get(meshId);
  if (!groupId) return [];
  const group = this._instanceGroups.get(groupId);
  if (!group) return [];
  return [...group].filter(id => id !== meshId);
}
```

---

## UV paint pointerup — shareUVTexture3D wiring

In `_attachUVPointerHandlers`, after `commitUVTexture3D`:

```ts
canvas.addEventListener('pointerup', () => {
  if (isPainting) {
    isPainting = false;
    const meshId = this.scene3dSelectedMeshId;
    sm.commitUVTexture3D?.(meshId);
    const siblings = this._instanceGroupSiblings(meshId);
    if (siblings.length) sm.shareUVTexture3D?.(meshId, siblings);
    this._uvDraw();
  }
});
```

**Why after commitUVTexture3D?** `commitUVTexture3D` creates a new `GPUTexture` and assigns it to `meshId`. `shareUVTexture3D` then copies that new texture reference to each sibling. The order is mandatory — sharing before committing would push the old (now-stale) texture.

**Why siblings only?** `shareUVTexture3D(meshId, others)` pushes the texture from `meshId` to `others`. The source mesh already has the new texture from `commitUVTexture3D`, so it does not appear in its own sibling list.

---

## Salsa API reference

```ts
// Upload the painted CPU canvas to a new GPUTexture and assign to meshId
sm.commitUVTexture3D(meshId: string): void

// Push meshId's current GPUTexture (set by commitUVTexture3D) to all targets
sm.shareUVTexture3D(meshId: string, targetMeshIds: string[]): void
```

`shareUVTexture3D` must be called **again after every** `commitUVTexture3D` because `commitUVTexture3D` allocates a new `GPUTexture` object. Any sharing from a previous stroke is now stale.

---

## Persistence

`_instanceGroups` and `_meshGroupId` are in-memory only. They are rebuilt from import/duplicate history during a session. On reload, the user re-imports or re-duplicates.

Future work: serialize the map into the scene document if persistence across sessions is needed.

---

## Edge cases

| Scenario | Behavior |
|---|---|
| Single mesh with no siblings | `_instanceGroupSiblings` returns `[]`; `shareUVTexture3D` is not called |
| Mesh deleted mid-session | `_instanceGroupRemove` cleans up maps; future shares skip deleted ID |
| GLTF with 1 mesh | That mesh is its own solo group until duplicated |
| Duplicate of a duplicate | Inherits same `instanceGroupId` — all instances stay in sync |
| Primitives (not imported) | No group assigned unless explicitly duplicated |
