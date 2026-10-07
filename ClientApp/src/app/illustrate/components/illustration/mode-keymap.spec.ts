import { MOD_KEYMAP, TOOL_KEYMAP } from './editor-keymap';
import { keymapMayHandle } from './hotkey-zone-gate';
import {
  activeKeymapMode, cheatsheetColumnsWithModes, dispatchModeKey, KeymapMode, MESH_EDIT_KEYMAP, meshEditKeyLabels, PASS_THROUGH,
} from './mode-keymap';

function key(k: string, mods: { shift?: boolean; alt?: boolean; ctrl?: boolean; repeat?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, shiftKey: !!mods.shift, altKey: !!mods.alt, ctrlKey: !!mods.ctrl, repeat: !!mods.repeat, cancelable: true });
}

/** UI review 2026-10-07 top-10 #5: the mode-scoped keymap (Edit Mesh / Armature / UV paint). */
describe('mode keymap', () => {
  function editor(o: { mode?: KeymapMode | null; bevel?: boolean; bevelActive?: boolean; shortcut?: boolean } = {}) {
    const mode = o.mode === undefined ? 'meshEdit' : o.mode;
    const sm: any = {
      isShortcutActive3D: !!o.shortcut,
      canUndo2DShapes: false, canRedo2DShapes: false,
      interactionService: { selectedNodes: new Set(), suppressBoxSelect: true },
      deleteSelectedShapes: jasmine.createSpy('del2D'),
    };
    if (o.bevel) {
      sm.beginBevel3D = jasmine.createSpy('beginBevel3D').and.returnValue(true);
      sm.getBevelState3D = () => (o.bevelActive ? { phase: 'adjust' } : null);
    }
    return {
      shapeManager: sm,
      editorState: { scene3dPanelVisible: true, scene3dSelectedMeshId: 'm1' },
      meshEdit: {
        scene3dIsEditingMesh: mode === 'meshEdit',
        scene3dEditTool: 'select',
        setSelectionMode: jasmine.createSpy('setSelectionMode'),
        toggleSelectAll: jasmine.createSpy('toggleSelectAll'),
        deselectAll: jasmine.createSpy('deselectAll'),
        deleteSelectedElements: jasmine.createSpy('deleteSelectedElements'),
        loopCutSelectedEdge: jasmine.createSpy('loopCutSelectedEdge'),
        deleteSelectedFaces: jasmine.createSpy('deleteSelectedFaces'),
        toggleKnifeTool: jasmine.createSpy('toggleKnifeTool'),
      },
      scene3dArmaturePanelOpen: mode === 'armature',
      uv: { uvEditorOpen: mode === 'uvPaint', scene3dClothingPaintActive: null, closeUVEditor: jasmine.createSpy('closeUVEditor') },
      decal: { scene3dDecalToolActive: false },
      rasterSelectionService: {
        info: { hasSelection: false, isTransforming: false },
        selectAll: jasmine.createSpy('rasterSelectAll'), cut: jasmine.createSpy('cut'), deselectAll: jasmine.createSpy('deselect'),
      },
      is3DContextActive: true,
      scene3dUndo: jasmine.createSpy('scene3dUndo'),
      scene3dRedo: jasmine.createSpy('scene3dRedo'),
      rasterUndo: jasmine.createSpy('rasterUndo'),
      rasterRedo: jasmine.createSpy('rasterRedo'),
      saveNow: jasmine.createSpy('saveNow'),
      setActiveTool: jasmine.createSpy('setActiveTool'),
      selectCursor: jasmine.createSpy('selectCursor'),
      toggleUI: jasmine.createSpy('toggleUI'),
      deleteSelectionOrLayers: jasmine.createSpy('deleteSelectionOrLayers'),
      scene3dDeleteSelected: jasmine.createSpy('scene3dDeleteSelected'),
      scene3dDuplicateMesh: jasmine.createSpy('scene3dDuplicateMesh'),
      animationService: { fillSelection: jasmine.createSpy('fill') },
      draw: { selectedPenColor: '#000' },
      animationEnabled: false,
    } as any;
  }
  const run = (ed: any, e: KeyboardEvent, mod = e.ctrlKey) => dispatchModeKey(activeKeymapMode(ed)!, ed, e, mod);

  describe('activeKeymapMode', () => {
    it('Edit Mesh, then the armature panel, then UV paint; none = the normal keymap', () => {
      expect(activeKeymapMode(editor({ mode: 'meshEdit' }))).toBe('meshEdit');
      expect(activeKeymapMode(editor({ mode: 'armature' }))).toBe('armature');
      expect(activeKeymapMode(editor({ mode: 'uvPaint' }))).toBe('uvPaint');
      expect(activeKeymapMode(editor({ mode: null }))).toBeNull();
      const clothing = editor({ mode: null });
      clothing.uv.scene3dClothingPaintActive = 'top';
      expect(activeKeymapMode(clothing)).toBe('uvPaint');
    });
  });

  describe('Edit Mesh', () => {
    it('swallows the 2D tool keys: B / Shift+B / W / E / P / G-fill never switch tools', () => {
      for (const e of [key('b'), key('B', { shift: true }), key('w'), key('e'), key('p'), key('v'), key('t'), key('m')]) {
        const ed = editor();
        expect(run(ed, e)).withContext(e.key).toBeTrue();
        expect(e.defaultPrevented).withContext(e.key).toBeTrue();
        expect(ed.setActiveTool).withContext(e.key).not.toHaveBeenCalled();
        expect(ed.selectCursor).withContext(e.key).not.toHaveBeenCalled();
      }
    });

    it('X deletes / dissolves the selected elements instead of hiding the UI', () => {
      const ed = editor();
      expect(run(ed, key('x'))).toBeTrue();
      expect(ed.meshEdit.deleteSelectedElements).toHaveBeenCalledTimes(1);
      expect(ed.toggleUI).not.toHaveBeenCalled();
      run(ed, key('Delete'));
      expect(ed.meshEdit.deleteSelectedElements).toHaveBeenCalledTimes(2);
      expect(ed.scene3dDeleteSelected).not.toHaveBeenCalled();
    });

    it('Ctrl+R is the loop cut (claimed: no page reload, no plain-R rotate); plain R is left to the HUD', () => {
      const ed = editor();
      const e = key('r', { ctrl: true });
      expect(run(ed, e)).toBeTrue();
      expect(e.defaultPrevented).toBeTrue();
      expect(ed.meshEdit.loopCutSelectedEdge).toHaveBeenCalledTimes(1);
      const plain = key('r');
      expect(run(ed, plain)).toBeFalse();
      expect(ed.meshEdit.loopCutSelectedEdge).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+B starts the Chamfer when the engine has it, and never the raster brush', () => {
      const ed = editor({ bevel: true });
      expect(run(ed, key('b', { ctrl: true }))).toBeTrue();
      expect(ed.shapeManager.beginBevel3D).toHaveBeenCalledTimes(1);
      expect(ed.setActiveTool).not.toHaveBeenCalled();
      const old = editor();   // an older dist: no Chamfer — still swallowed
      const e = key('b', { ctrl: true });
      expect(run(old, e)).toBeTrue();
      expect(e.defaultPrevented).toBeTrue();
      expect(old.setActiveTool).not.toHaveBeenCalled();
    });

    it('1 / 2 / 3 switch vertex / edge / face; A selects all; Alt+A deselects', () => {
      const ed = editor();
      run(ed, key('1')); run(ed, key('2')); run(ed, key('3'));
      expect(ed.meshEdit.setSelectionMode.calls.allArgs()).toEqual([['vertex'], ['edge'], ['face']]);
      run(ed, key('a'));
      expect(ed.meshEdit.toggleSelectAll).toHaveBeenCalledTimes(1);
      run(ed, key('a', { alt: true }));
      expect(ed.meshEdit.deselectAll).toHaveBeenCalledTimes(1);
      expect(ed.meshEdit.toggleSelectAll).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+A is not the raster Select All', () => {
      const ed = editor();
      const e = key('a', { ctrl: true });
      expect(run(ed, e)).toBeTrue();
      expect(e.defaultPrevented).toBeTrue();
      expect(ed.rasterSelectionService.selectAll).not.toHaveBeenCalled();
      expect(ed.meshEdit.toggleSelectAll).not.toHaveBeenCalled();
    });

    it('element keys wait while the Chamfer or the keyboard transform runs', () => {
      for (const ed of [editor({ bevel: true, bevelActive: true }), editor({ shortcut: true })]) {
        run(ed, key('a')); run(ed, key('x')); run(ed, key('1')); run(ed, key('r', { ctrl: true }));
        expect(ed.meshEdit.toggleSelectAll).not.toHaveBeenCalled();
        expect(ed.meshEdit.deleteSelectedElements).not.toHaveBeenCalled();
        expect(ed.meshEdit.setSelectionMode).not.toHaveBeenCalled();
        expect(ed.meshEdit.loopCutSelectedEdge).not.toHaveBeenCalled();
        expect(ed.toggleUI).not.toHaveBeenCalled();
      }
    });

    it('a key the HUD already claimed (the 3D transform X axis) is not run again', () => {
      const ed = editor();
      const e = key('x');
      e.preventDefault();
      run(ed, e);
      expect(ed.meshEdit.deleteSelectedElements).not.toHaveBeenCalled();
    });

    it('undo, save, Esc and K still work', () => {
      const ed = editor();
      run(ed, key('z', { ctrl: true }));
      run(ed, key('s', { ctrl: true }));
      run(ed, key('k'));
      expect(ed.scene3dUndo).toHaveBeenCalledTimes(1);
      expect(ed.saveNow).toHaveBeenCalledTimes(1);
      expect(ed.meshEdit.toggleKnifeTool).toHaveBeenCalledTimes(1);
      run(ed, key('Escape'));
      expect(ed.selectCursor).toHaveBeenCalledOnceWith('cursor');
    });

    it('a key no binding knows is left alone (the browser default stays)', () => {
      const ed = editor();
      const e = key('j');
      expect(run(ed, e)).toBeFalse();
      expect(e.defaultPrevented).toBeFalse();
    });
  });

  describe('Armature / UV paint', () => {
    it('swallow the 2D tools and Delete (it used to remove the posed / painted mesh); X still hides the UI', () => {
      for (const mode of ['armature', 'uvPaint'] as const) {
        const ed = editor({ mode });
        for (const e of [key('b'), key('e'), key('w'), key('g'), key('Delete'), key('b', { ctrl: true }), key('a', { ctrl: true })]) {
          expect(run(ed, e)).withContext(`${mode} ${e.key}`).toBeTrue();
          expect(e.defaultPrevented).withContext(`${mode} ${e.key}`).toBeTrue();
        }
        expect(ed.setActiveTool).not.toHaveBeenCalled();
        expect(ed.scene3dDeleteSelected).not.toHaveBeenCalled();
        expect(ed.deleteSelectionOrLayers).not.toHaveBeenCalled();
        expect(ed.rasterSelectionService.selectAll).not.toHaveBeenCalled();
        run(ed, key('x'));
        expect(ed.toggleUI).withContext(mode).toHaveBeenCalledTimes(1);
        // the Edit Mesh keys are Edit Mesh's only
        run(ed, key('1')); run(ed, key('r', { ctrl: true }));
        expect(ed.meshEdit.setSelectionMode).not.toHaveBeenCalled();
        expect(ed.meshEdit.loopCutSelectedEdge).not.toHaveBeenCalled();
      }
    });

    it('Esc leaves UV paint', () => {
      const ed = editor({ mode: 'uvPaint' });
      run(ed, key('Escape'));
      expect(ed.uv.closeUVEditor).toHaveBeenCalledTimes(1);
    });
  });

  describe('tables', () => {
    it('every pass-through names a real global binding (a renamed help text would silently swallow it)', () => {
      const helps = new Set([...MOD_KEYMAP, ...TOOL_KEYMAP].map(b => b.help));
      for (const [mode, pass] of Object.entries(PASS_THROUGH)) {
        for (const h of pass) expect(helps.has(h)).withContext(`${mode}: ${h}`).toBeTrue();
      }
    });

    it('the panel chips come from the bindings', () => {
      expect(meshEditKeyLabels()).toEqual({
        vertexMode: '1', edgeMode: '2', faceMode: '3', selectAll: 'A', deselectAll: 'Alt+A', delete: 'X', loopCut: 'Ctrl+R',
        chamfer: 'Ctrl+B', knife: 'K',
      });
    });

    it('the cheatsheet lists the Edit Mesh keys', () => {
      const sec = cheatsheetColumnsWithModes().flat().find(s => s.title === 'Edit Mesh');
      expect(sec?.rows.length).toBe(MESH_EDIT_KEYMAP.length);
      expect(sec?.rows.map(r => r.chord)).toContain('Ctrl+R');
    });

    it('the zone gate enters the zone for the Edit Mesh keys', () => {
      expect(keymapMayHandle(key('1'), false)).toBeTrue();
      expect(keymapMayHandle(key('a'), false)).toBeTrue();
      expect(keymapMayHandle(key('r', { ctrl: true }), true)).toBeTrue();
    });
  });
});
