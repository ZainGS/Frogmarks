import { ModeUndoScope } from '../../services/mode-undo-scope';
import { runCanvasMenuItem } from './canvas-context-menu';
import { installEditorChrome } from './editor-chrome';
import { routeUndo } from './editor-keymap';
import { dispatchModeKey } from './mode-keymap';

/**
 * Undo / redo in the Armature (Rig and Animate) are scoped like Edit Mesh's (ModeUndoScope): every entry path — the top
 * bar's buttons (editUndo / editRedo), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, two- / three-finger taps, the canvas context
 * menu — walks only the 3D steps made in the mode and never the 2D object stack.
 */
function armatureEditor(workspace: 'rig' | 'animate' = 'rig') {
  const sm: any = {
    stack: [{ description: 'Add character' }] as object[],
    undone: [{ description: 'undone before the Armature' }] as object[],
    // the 2D object stack has steps: the Armature must not touch them
    canUndo2DShapes: true, canRedo2DShapes: true,
    undo2DShapes: jasmine.createSpy('undo2DShapes'), redo2DShapes: jasmine.createSpy('redo2DShapes'),
    interactionService: { selectedNodes: new Set(), suppressBoxSelect: true },
  };
  Object.defineProperty(sm, 'canUndo3D', { get: () => sm.stack.length > 0 });
  Object.defineProperty(sm, 'canRedo3D', { get: () => sm.undone.length > 0 });
  sm.scene3d = { peekUndoCommand3D: () => sm.stack[sm.stack.length - 1] ?? null };
  const canvas = {};
  const ed: any = {
    shapeManager: sm,
    editorState: { scene3dPanelVisible: true, scene3dSelectedMeshId: null },
    meshEdit: { scene3dIsEditingMesh: false, takeUndoStep: jasmine.createSpy('takeUndoStep') },
    uv: { uvEditorOpen: false, scene3dClothingPaintActive: null },
    scene3dArmaturePanelOpen: true,
    armatureMode: { workspace, setTool() {}, setSegment() {}, keyPose() {} },
    armatureUndo: new ModeUndoScope(() => sm),
    is3DContextActive: true,
    scene3dUndo: jasmine.createSpy('scene3dUndo').and.callFake(() => { if (sm.stack.length) sm.undone.push(sm.stack.pop()); }),
    scene3dRedo: jasmine.createSpy('scene3dRedo').and.callFake(() => { if (sm.undone.length) sm.stack.push(sm.undone.pop()); }),
    rasterUndo: jasmine.createSpy('rasterUndo'), rasterRedo: jasmine.createSpy('rasterRedo'),
    rasterSelectionService: { info: { hasSelection: false }, hasClipboard: false },
    // what the chrome reads (the tap path)
    scene3dViewIsPlaying: false, isViewerMode: false, isLoading: false,
    persist: { documentMissing: false, rasterStrokeActive: false },
    canvasRef: { nativeElement: canvas },
  };
  // IllustrationComponent.editUndo / editRedo
  ed.editUndo = () => routeUndo(ed, false);
  ed.editRedo = () => routeUndo(ed, true);
  ed.armatureUndo.enter();   // openArmaturePanel
  return { ed, sm, canvas };
}

/** An Armature session through one entry path: a joint drag, undo it, undo again (the floor), redo, redo again. */
function expectScoped(undo: (ed: any) => void, redo: (ed: any) => void, workspace: 'rig' | 'animate' = 'rig'): void {
  const { ed, sm } = armatureEditor(workspace);
  redo(ed);                                      // the redo left over from before the Armature is not re-done
  expect(sm.undone.length).toBe(1);
  sm.undone.length = 0;                          // (a joint drag clears the redo stack)
  sm.stack.push({ description: 'Move joint' });
  undo(ed);
  expect(sm.stack.length).toBe(1);               // the Move joint
  undo(ed);
  expect(sm.stack.length).toBe(1);               // back at the step the Armature was entered on
  redo(ed);
  expect(sm.stack.length).toBe(2);               // the Move joint again
  redo(ed);
  expect(sm.stack.length).toBe(2);
  expect(sm.undo2DShapes).not.toHaveBeenCalled();
  expect(sm.redo2DShapes).not.toHaveBeenCalled();
  expect(ed.rasterUndo).not.toHaveBeenCalled();
  expect(ed.meshEdit.takeUndoStep).not.toHaveBeenCalled();
}

const key = (k: string, shift = false) => new KeyboardEvent('keydown', { key: k, ctrlKey: true, shiftKey: shift, cancelable: true });

describe('undo / redo scoped to the Armature (every entry path)', () => {
  it('the Undo / Redo box above the zoom box (editUndo / editRedo)', () => {
    expectScoped(ed => ed.editUndo(), ed => ed.editRedo());
  });

  it('Ctrl+Z / Ctrl+Y and Ctrl+Z / Ctrl+Shift+Z (the mode keymap passes them through)', () => {
    expectScoped(ed => dispatchModeKey('armature', ed, key('z'), true), ed => dispatchModeKey('armature', ed, key('y'), true));
    expectScoped(ed => dispatchModeKey('armature', ed, key('z'), true), ed => dispatchModeKey('armature', ed, key('Z', true), true));
  });

  it('two- / three-finger taps on the canvas', () => {
    let tapEd: any;
    const fire = (fingers: number) => {
      const handlers: Record<string, (e: unknown) => void> = {};
      const win: any = { addEventListener: (t: string, f: (e: unknown) => void) => { handlers[t] = f; }, removeEventListener() {} };
      const overlays: any = { register: () => () => undefined, anyOpen: false };
      const zone: any = { run: (f: () => void) => f(), runOutsideAngular: (f: () => unknown) => f() };
      const off = installEditorChrome(tapEd, overlays, zone, win);
      const ev = (id: number, t: number) => ({ pointerId: id, pointerType: 'touch', clientX: 100 + id * 60, clientY: 100, timeStamp: t, target: tapEd.canvasRef.nativeElement });
      for (let i = 1; i <= fingers; i++) handlers['pointerdown'](ev(i, i * 10));
      for (let i = 1; i <= fingers; i++) handlers['pointerup'](ev(i, 100 + i * 10));
      off();
    };
    expectScoped(ed => { tapEd = ed; fire(2); }, ed => { tapEd = ed; fire(3); });
  });

  it('the canvas context menu\'s Undo / Redo', () => {
    expectScoped(ed => runCanvasMenuItem(ed, 'undo'), ed => runCanvasMenuItem(ed, 'redo'));
  });

  it('the Animate workspace is the Armature too', () => {
    expectScoped(ed => ed.editUndo(), ed => ed.editRedo(), 'animate');
    expectScoped(ed => dispatchModeKey('armature', ed, key('z'), true), ed => dispatchModeKey('armature', ed, key('y'), true), 'animate');
  });

  it('outside a mode the 2D object stack still goes first', () => {
    const { ed, sm } = armatureEditor();
    ed.scene3dArmaturePanelOpen = false;
    ed.editUndo();
    expect(sm.undo2DShapes).toHaveBeenCalledTimes(1);
    expect(ed.scene3dUndo).not.toHaveBeenCalled();
  });

  it('Edit Mesh keys skip the 2D object stack too (MeshEditService.takeUndoStep decides)', () => {
    const { ed, sm } = armatureEditor();
    ed.scene3dArmaturePanelOpen = false;
    ed.meshEdit.scene3dIsEditingMesh = true;
    ed.meshEdit.takeUndoStep.and.returnValue(true);
    dispatchModeKey('meshEdit', ed, key('z'), true);
    expect(ed.meshEdit.takeUndoStep).toHaveBeenCalledOnceWith(false);
    expect(ed.scene3dUndo).toHaveBeenCalledTimes(1);
    expect(sm.undo2DShapes).not.toHaveBeenCalled();
  });
});
