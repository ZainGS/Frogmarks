/**
 * The scene outliner's row ✕: which deletes the engine records as ONE 3D undo step (so the row can go at once with
 * an Undo toast) and which can't be undone (so the row asks first).
 *
 * Undoable (Salsa scene3d-manager / scene3d-grouping push these descriptions): a plain mesh ('Delete mesh'), a mesh
 * group ('Delete group'), an array group ('Delete array'). Not undoable: a procedural character (body + parts +
 * skeleton), a package, a CD kit, a procedural creator object, a decal.
 */

/** The outliner's node-kind id sets (SceneOutlinerService) a delete depends on. */
export interface OutlinerDeleteKinds {
  characterBodyIds: ReadonlySet<string>;
  packageIds: ReadonlySet<string>;
  cdKitIds: ReadonlySet<string>;
  creatorIds: ReadonlySet<string>;
  decalIds: ReadonlySet<string>;
}

export interface OutlinerDeletePlan {
  /** The 3D undo step the delete records (the toast's Undo takes it), or null when it can't be undone. */
  undoStep: string | null;
  /** The confirm question when it can't be undone, else null. */
  confirmText: string | null;
}

export function outlinerDeletePlan(node: { id: string; type?: string }, kinds: OutlinerDeleteKinds): OutlinerDeletePlan {
  const ask = (confirmText: string): OutlinerDeletePlan => ({ undoStep: null, confirmText });
  const id = node.id;
  if (kinds.characterBodyIds.has(id)) return ask('Delete this character with its hair and clothes? This can\'t be undone.');
  if (kinds.packageIds.has(id)) return ask('Delete this package? This can\'t be undone.');
  if (kinds.cdKitIds.has(id)) return ask('Delete this CD kit? This can\'t be undone.');
  if (kinds.creatorIds.has(id)) return ask('Delete this object? This can\'t be undone.');
  if (kinds.decalIds.has(id)) return ask('Delete this decal? This can\'t be undone.');
  if (node.type === '3DArrayGroup') return { undoStep: 'Delete array', confirmText: null };
  if (node.type === '3DMeshGroup') return { undoStep: 'Delete group', confirmText: null };
  return { undoStep: 'Delete mesh', confirmText: null };
}

/** Is a node with this id anywhere in the outliner tree (children included)? */
export function outlinerHasNode(nodes: ReadonlyArray<{ id: string; children?: ReadonlyArray<any> }> | null | undefined, id: string): boolean {
  for (const n of nodes ?? []) {
    if (n.id === id) return true;
    if (n.children?.length && outlinerHasNode(n.children, id)) return true;
  }
  return false;
}

/**
 * May the toast's Undo run? Only while the step Ctrl+Z would take next is still this delete (`nextUndo`) and the
 * node is still gone (a Ctrl+Z already brought it back, and then the next step is an older one).
 */
export function canUndoOutlinerDelete(toast: { id: string; undoStep: string } | null, nextUndo: string | null, stillListed: boolean): boolean {
  return !!toast && nextUndo === toast.undoStep && !stillListed;
}
