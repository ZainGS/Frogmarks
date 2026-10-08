import { canUndoOutlinerDelete, outlinerDeletePlan, outlinerHasNode } from './outliner-delete';

describe('outlinerDeletePlan (the outliner row ✕)', () => {
  const none = new Set<string>();
  const kinds = (over: Partial<Record<'characterBodyIds' | 'packageIds' | 'cdKitIds' | 'creatorIds' | 'decalIds', Set<string>>> = {}) => ({
    characterBodyIds: none, packageIds: none, cdKitIds: none, creatorIds: none, decalIds: none, ...over,
  });

  it('meshes, groups and array groups delete at once with the undo step the engine records', () => {
    expect(outlinerDeletePlan({ id: 'm', type: '3DMesh' }, kinds())).toEqual({ undoStep: 'Delete mesh', confirmText: null });
    expect(outlinerDeletePlan({ id: 'g', type: '3DMeshGroup' }, kinds())).toEqual({ undoStep: 'Delete group', confirmText: null });
    expect(outlinerDeletePlan({ id: 'a', type: '3DArrayGroup' }, kinds())).toEqual({ undoStep: 'Delete array', confirmText: null });
    expect(outlinerDeletePlan({ id: 'p', type: 'ParticleEmitter3D' }, kinds())).toEqual({ undoStep: 'Delete particle emitter', confirmText: null });
  });

  it('what the engine cannot undo asks first', () => {
    const s = new Set(['x']);
    for (const k of ['characterBodyIds', 'packageIds', 'cdKitIds', 'creatorIds', 'decalIds'] as const) {
      const plan = outlinerDeletePlan({ id: 'x', type: '3DMeshGroup' }, kinds({ [k]: s }));
      expect(plan.undoStep).withContext(k).toBeNull();
      expect(plan.confirmText).withContext(k).toContain('can\'t be undone');
    }
  });

  it('a character row (a virtual group whose id is the body) is never a plain group delete', () => {
    const plan = outlinerDeletePlan({ id: 'body', type: '3DMeshGroup' }, kinds({ characterBodyIds: new Set(['body']) }));
    expect(plan.undoStep).toBeNull();
    expect(plan.confirmText).toContain('character');
  });
});

describe('outlinerHasNode', () => {
  const tree = [{ id: 'a', children: [{ id: 'b', children: [{ id: 'c' }] }] }, { id: 'd' }];
  it('finds nested nodes and misses absent ones', () => {
    expect(outlinerHasNode(tree, 'c')).toBeTrue();
    expect(outlinerHasNode(tree, 'd')).toBeTrue();
    expect(outlinerHasNode(tree, 'z')).toBeFalse();
    expect(outlinerHasNode(null, 'a')).toBeFalse();
  });
});

describe('canUndoOutlinerDelete (the toast Undo)', () => {
  const t = { id: 'm', undoStep: 'Delete mesh' };
  it('undoes only while the delete is still the next undo step and the node is still gone', () => {
    expect(canUndoOutlinerDelete(t, 'Delete mesh', false)).toBeTrue();
    expect(canUndoOutlinerDelete(t, 'Move', false)).toBeFalse();          // something newer is on top
    expect(canUndoOutlinerDelete(t, null, false)).toBeFalse();            // nothing to undo
    expect(canUndoOutlinerDelete(t, 'Delete mesh', true)).toBeFalse();    // Ctrl+Z already brought it back (an older delete is next)
    expect(canUndoOutlinerDelete(null, 'Delete mesh', false)).toBeFalse();
  });
});
