import { ModeUndoScope } from './mode-undo-scope';

/** A fake engine 3D undo history: `stack` (top = last), `undone` (redo, top = last). */
function engine(o: { peek?: boolean } = {}) {
  const sm: any = { stack: [] as object[], undone: [] as object[] };
  Object.defineProperty(sm, 'canUndo3D', { get: () => sm.stack.length > 0 });
  Object.defineProperty(sm, 'canRedo3D', { get: () => sm.undone.length > 0 });
  if (o.peek !== false) sm.scene3d = { peekUndoCommand3D: () => sm.stack[sm.stack.length - 1] ?? null };
  else sm.scene3d = {};
  sm.undo = () => sm.undone.push(sm.stack.pop());
  sm.redo = () => sm.stack.push(sm.undone.pop());
  return sm;
}

describe('ModeUndoScope (undo / redo scoped to Edit Mesh / Armature)', () => {
  it('undo stops at the 3D step on top when the mode was entered', () => {
    const sm = engine();
    sm.stack.push({ description: 'Add mesh' });
    const scope = new ModeUndoScope(() => sm);
    scope.enter();
    expect(scope.takeStep(false)).toBeFalse();   // nothing done in the mode yet
    sm.stack.push({ description: 'Move joint' }, { description: 'Move joint' });
    expect(scope.takeStep(false)).toBeTrue(); sm.undo();
    expect(scope.takeStep(false)).toBeTrue(); sm.undo();
    expect(scope.takeStep(false)).toBeFalse();   // back at the floor: the Add is not undone
    expect(sm.stack.length).toBe(1);
  });

  it('an empty history at entry: the floor is "nothing on top"', () => {
    const sm = engine();
    const scope = new ModeUndoScope(() => sm);
    scope.enter();
    sm.stack.push({ description: 'Move joint' });
    expect(scope.takeStep(false)).toBeTrue(); sm.undo();
    expect(scope.takeStep(false)).toBeFalse();
  });

  it('redo only re-does what was undone inside the mode', () => {
    const sm = engine();
    sm.undone.push({ description: 'undone before the mode' });
    const scope = new ModeUndoScope(() => sm);
    scope.enter();
    expect(scope.takeStep(true)).toBeFalse();    // a redo left over from before the mode
    sm.undone.length = 0;
    sm.stack.push({ description: 'Move joint' });
    expect(scope.takeStep(false)).toBeTrue(); sm.undo();
    expect(scope.takeStep(true)).toBeTrue(); sm.redo();
    expect(scope.takeStep(true)).toBeFalse();
    expect(sm.stack.length).toBe(1);
  });

  it('nothing to redo in the engine: declined (the count is not spent)', () => {
    const sm = engine();
    const scope = new ModeUndoScope(() => sm);
    scope.enter();
    sm.stack.push({ description: 'Move joint' });
    expect(scope.takeStep(false)).toBeTrue(); sm.undo();
    sm.undone.length = 0;                        // a new step cleared the redo stack
    expect(scope.takeStep(true)).toBeFalse();
  });

  it('an older engine without peekUndoCommand3D: no floor (undo runs as before)', () => {
    const sm = engine({ peek: false });
    sm.stack.push({ description: 'Add mesh' });
    const scope = new ModeUndoScope(() => sm);
    scope.enter();
    expect(scope.takeStep(false)).toBeTrue(); sm.undo();
    expect(scope.takeStep(false)).toBeFalse();   // canUndo3D false
    expect(scope.takeStep(true)).toBeTrue();     // what was undone in the mode
  });

  it('leave() drops the floor and the count; no engine: declined', () => {
    const sm = engine();
    sm.stack.push({ description: 'Add mesh' });
    const scope = new ModeUndoScope(() => sm);
    scope.enter();
    scope.leave();
    expect(scope.takeStep(false)).toBeTrue();    // no floor after leaving
    sm.undo();
    scope.enter();
    expect(scope.takeStep(true)).toBeFalse();    // a fresh entry: nothing undone in it yet
    expect(new ModeUndoScope(() => null).takeStep(false)).toBeFalse();
  });
});
