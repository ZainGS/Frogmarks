import {
  activeContextPill, canRouteDuplicate, cheatsheetColumns, chordLabel, CONTEXT_PILLS, dispatchKey, KeyBinding, MOD_KEYMAP, routeDelete,
  routeDuplicate, routeUndo, TOOL_KEYMAP,
} from './editor-keymap';

function key(k: string, mods: { shift?: boolean; alt?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, shiftKey: !!mods.shift, altKey: !!mods.alt, cancelable: true });
}

describe('editor keymap', () => {
  describe('dispatchKey', () => {
    const ed = {} as any;

    it('runs the first matching binding and prevents the default', () => {
      const a = jasmine.createSpy('a');
      const b = jasmine.createSpy('b');
      const table: KeyBinding[] = [{ keys: ['x'], group: 'Edit', help: '', run: a }, { keys: ['x'], group: 'Edit', help: '', run: b }];
      const e = key('x');
      expect(dispatchKey(table, ed, e, false)).toBeTrue();
      expect(a).toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
      expect(e.defaultPrevented).toBeTrue();
    });

    it('falls through when a binding declines (returns false), without preventing the default', () => {
      const table: KeyBinding[] = [{ keys: ['x'], group: 'Edit', help: '', run: () => false }];
      const e = key('x');
      expect(dispatchKey(table, ed, e, false)).toBeFalse();
      expect(e.defaultPrevented).toBeFalse();
    });

    it('honours mod / shift / alt constraints (omitted = either)', () => {
      const run = jasmine.createSpy('run');
      const table: KeyBinding[] = [{ keys: ['s', 'S'], mod: true, shift: false, group: 'Edit', help: '', run }];
      expect(dispatchKey(table, ed, key('s'), false)).toBeFalse();                    // mod required
      expect(dispatchKey(table, ed, key('S', { shift: true }), true)).toBeFalse();   // shift forbidden
      expect(dispatchKey(table, ed, key('s'), true)).toBeTrue();
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('matches event.key case-sensitively', () => {
      const run = jasmine.createSpy('run');
      expect(dispatchKey([{ keys: ['T'], shift: true, group: 'Edit', help: '', run }], ed, key('t', { shift: true }), false)).toBeFalse();
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe('the real tables', () => {
    function editor() {
      return {
        saveNow: jasmine.createSpy('saveNow'),
        rasterFlipVertical: jasmine.createSpy('flipV'),
        rasterSelectionService: { paste: jasmine.createSpy('paste'), info: { hasSelection: false, isTransforming: false } },
        setActiveTool: jasmine.createSpy('setActiveTool'),
        animationService: { fillSelection: jasmine.createSpy('fill') },
        draw: { selectedPenColor: '#123456' },
        deleteSelectionOrLayers: jasmine.createSpy('delete'),
      } as any;
    }

    it('Ctrl+S saves; Ctrl+Shift+V flips; Ctrl+V pastes', () => {
      const ed = editor();
      dispatchKey(MOD_KEYMAP, ed, key('s'), true);
      dispatchKey(MOD_KEYMAP, ed, key('V', { shift: true }), true);
      dispatchKey(MOD_KEYMAP, ed, key('v'), true);
      expect(ed.saveNow).toHaveBeenCalledTimes(1);
      expect(ed.rasterFlipVertical).toHaveBeenCalledTimes(1);
      expect(ed.rasterSelectionService.paste).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+T without a selection is declined (falls through to the T tool)', () => {
      const ed = editor();
      expect(dispatchKey(MOD_KEYMAP, ed, key('t'), true)).toBeFalse();
      expect(dispatchKey(TOOL_KEYMAP, ed, key('t'), true)).toBeTrue();
      expect(ed.setActiveTool).toHaveBeenCalledWith('raster:text');
    });

    it('Alt+Backspace fills with the pen colour; plain Backspace deletes', () => {
      const ed = editor();
      dispatchKey(TOOL_KEYMAP, ed, key('Backspace', { alt: true }), false);
      dispatchKey(TOOL_KEYMAP, ed, key('Backspace'), false);
      expect(ed.animationService.fillSelection).toHaveBeenCalledOnceWith('#123456');
      expect(ed.deleteSelectionOrLayers).toHaveBeenCalledTimes(1);
    });
  });

  describe('generated cheatsheet (audit Phase 5.6)', () => {
    it('lists every binding exactly once', () => {
      const rows = cheatsheetColumns().flat().flatMap(sec => sec.rows);
      expect(rows.length).toBe(MOD_KEYMAP.length + TOOL_KEYMAP.length);
    });

    it('labels chords with modifiers and folds case-only duplicate keys', () => {
      expect(chordLabel({ keys: ['h', 'H'], mod: true, shift: true, group: 'Edit', help: '', run: () => {} })).toBe('Ctrl+Shift+H');
      expect(chordLabel({ keys: ['Delete', 'Backspace'], group: 'Edit', help: '', run: () => {} })).toBe('Del / Backspace');
      expect(chordLabel({ keys: ['Backspace'], alt: true, group: 'Edit', help: '', run: () => {} })).toBe('Alt+Backspace');
    });
  });

  describe('routeUndo (Edit menu buttons, mobile-parity TOUCH-10)', () => {
    function host(o: { can2DUndo?: boolean; can2DRedo?: boolean; is3D?: boolean }) {
      return {
        shapeManager: {
          canUndo2DShapes: !!o.can2DUndo, canRedo2DShapes: !!o.can2DRedo,
          undo2DShapes: jasmine.createSpy('undo2D'), redo2DShapes: jasmine.createSpy('redo2D'),
        },
        is3DContextActive: !!o.is3D,
        scene3dUndo: jasmine.createSpy('u3'), scene3dRedo: jasmine.createSpy('r3'),
        rasterUndo: jasmine.createSpy('ur'), rasterRedo: jasmine.createSpy('rr'),
      };
    }

    it('takes the 2D object stack first', () => {
      const ed = host({ can2DUndo: true, is3D: true });
      routeUndo(ed as any, false);
      expect(ed.shapeManager.undo2DShapes).toHaveBeenCalled();
      expect(ed.scene3dUndo).not.toHaveBeenCalled();
      expect(ed.rasterUndo).not.toHaveBeenCalled();
    });

    it('then the 3D context, else raster', () => {
      const ed3 = host({ is3D: true });
      routeUndo(ed3 as any, true);
      expect(ed3.scene3dRedo).toHaveBeenCalled();
      const ed2 = host({});
      routeUndo(ed2 as any, false);
      expect(ed2.rasterUndo).toHaveBeenCalled();
      expect(ed2.shapeManager.undo2DShapes).not.toHaveBeenCalled();
    });
  });

  describe('Edit › Duplicate / Delete routing', () => {
    function host(o: { panel3D?: boolean; meshId?: string | null; nodes2D?: number; suppress?: boolean; editing?: boolean } = {}) {
      return {
        shapeManager: {
          interactionService: { selectedNodes: new Set(Array.from({ length: o.nodes2D ?? 0 }, (_, i) => ({ i }))), suppressBoxSelect: !!o.suppress },
          duplicateSelectedShapes: jasmine.createSpy('dup2D').and.returnValue([]),
          deleteSelectedShapes: jasmine.createSpy('del2D'),
        },
        editorState: { scene3dPanelVisible: !!o.panel3D, scene3dSelectedMeshId: o.meshId ?? null },
        meshEdit: { scene3dIsEditingMesh: !!o.editing, deleteSelectedFaces: jasmine.createSpy('delFaces') },
        scene3dDuplicateMesh: jasmine.createSpy('dup3D'),
        scene3dDeleteSelected: jasmine.createSpy('del3D'),
        deleteSelectionOrLayers: jasmine.createSpy('delLayers'),
      };
    }

    it('Duplicate: the selected 3D mesh in the 3D view (like Ctrl+D), else the selected 2D shapes', () => {
      const ed3 = host({ panel3D: true, meshId: 'm1', nodes2D: 1 });
      expect(canRouteDuplicate(ed3 as any)).toBeTrue();
      routeDuplicate(ed3 as any);
      expect(ed3.scene3dDuplicateMesh).toHaveBeenCalledOnceWith('m1');
      expect(ed3.shapeManager.duplicateSelectedShapes).not.toHaveBeenCalled();

      const ed2 = host({ nodes2D: 2 });
      expect(canRouteDuplicate(ed2 as any)).toBeTrue();
      routeDuplicate(ed2 as any);
      expect(ed2.shapeManager.duplicateSelectedShapes).toHaveBeenCalledTimes(1);
      expect(ed2.scene3dDuplicateMesh).not.toHaveBeenCalled();
    });

    it('Duplicate is disabled and a no-op with nothing selected (or while a creator mode owns input)', () => {
      for (const ed of [host(), host({ panel3D: true }), host({ nodes2D: 1, suppress: true }), host({ meshId: 'm1' })]) {
        expect(canRouteDuplicate(ed as any)).toBeFalse();
        routeDuplicate(ed as any);
        expect(ed.shapeManager.duplicateSelectedShapes).not.toHaveBeenCalled();
        expect(ed.scene3dDuplicateMesh).not.toHaveBeenCalled();
      }
    });

    it('Delete in 2D does what the Delete key does: the engine deletes the 2D shapes, then the keymap clean-up', () => {
      const ed = host({ nodes2D: 1 });
      routeDelete(ed as any);
      expect(ed.shapeManager.deleteSelectedShapes).toHaveBeenCalledTimes(1);
      expect(ed.deleteSelectionOrLayers).toHaveBeenCalledTimes(1);
      const raster = host();   // a pixel selection only: deleteSelectionOrLayers clears it
      routeDelete(raster as any);
      expect(raster.shapeManager.deleteSelectedShapes).not.toHaveBeenCalled();
      expect(raster.deleteSelectionOrLayers).toHaveBeenCalledTimes(1);
    });

    it('Delete in the 3D view: the selected items (outliner path), or the selected faces in mesh edit mode', () => {
      const ed = host({ panel3D: true, meshId: 'm1', nodes2D: 1 });
      routeDelete(ed as any);
      expect(ed.scene3dDeleteSelected).toHaveBeenCalledTimes(1);
      expect(ed.shapeManager.deleteSelectedShapes).not.toHaveBeenCalled();   // never the raw scene-graph unhook
      const edit = host({ panel3D: true, meshId: 'm1', editing: true });
      routeDelete(edit as any);
      expect(edit.meshEdit.deleteSelectedFaces).toHaveBeenCalledTimes(1);
      expect(edit.scene3dDeleteSelected).not.toHaveBeenCalled();
    });
  });

  describe('touch Apply / Cancel pill (activeContextPill)', () => {
    function host(o: { liveText?: boolean; decal?: boolean; editing?: boolean; tool?: 'select' | 'knife'; transforming?: boolean } = {}) {
      return {
        shapeManager: { exitDecalPlaceMode3D: jasmine.createSpy('exitDecal') },
        decal: { scene3dDecalToolActive: !!o.decal },
        meshEdit: { scene3dIsEditingMesh: !!o.editing, scene3dEditTool: o.tool ?? 'select', cancelKnifeCut: jasmine.createSpy('cancelKnife') },
        rasterSelectionService: {
          info: { isTransforming: !!o.transforming, hasSelection: !!o.transforming },
          commitTransform: jasmine.createSpy('commit'), cancelTransform: jasmine.createSpy('cancel'),
        },
        liveTextOptions: { liveTextIsEditing: !!o.liveText, endLiveTextEditing: jasmine.createSpy('endLiveText') },
        selectCursor: jasmine.createSpy('selectCursor'),
      };
    }

    it('shows nothing outside a modal state (incl. mesh edit with the select tool)', () => {
      expect(activeContextPill(host() as any)).toBeNull();
      expect(activeContextPill(host({ editing: true, tool: 'select' }) as any)).toBeNull();
      expect(activeContextPill({ ...host(), liveTextOptions: undefined } as any)).toBeNull();   // panel not mounted
    });

    it('selection transform: Apply commits, Cancel cancels (the Enter / Esc actions)', () => {
      const ed = host({ transforming: true });
      const pill = activeContextPill(ed as any)!;
      expect(pill).toBe(CONTEXT_PILLS.transform);
      expect(pill.apply!.label).toBe('Apply transform');
      pill.apply!.run(ed as any);
      pill.cancel!.run(ed as any);
      expect(ed.rasterSelectionService.commitTransform).toHaveBeenCalledTimes(1);
      expect(ed.rasterSelectionService.cancelTransform).toHaveBeenCalledTimes(1);
      // The keys run the same actions
      const k = host({ transforming: true });
      dispatchKey(MOD_KEYMAP, k as any, key('Enter'), false);
      dispatchKey(TOOL_KEYMAP, k as any, key('Escape'), false);
      expect(k.rasterSelectionService.commitTransform).toHaveBeenCalledTimes(1);
      expect(k.rasterSelectionService.cancelTransform).toHaveBeenCalledTimes(1);
    });

    it('knife: Cancel only (a drag cuts on release; no commit step)', () => {
      const ed = host({ editing: true, tool: 'knife' });
      const pill = activeContextPill(ed as any)!;
      expect(pill).toBe(CONTEXT_PILLS.knife);
      expect(pill.apply).toBeUndefined();
      expect(pill.cancel!.label).toBe('Cancel knife');
      pill.cancel!.run(ed as any);
      expect(ed.meshEdit.cancelKnifeCut).toHaveBeenCalledTimes(1);
    });

    it('decal placement: Done turns the tool off and leaves place mode, like Esc', () => {
      const ed = host({ decal: true });
      const pill = activeContextPill(ed as any)!;
      expect(pill).toBe(CONTEXT_PILLS.decal);
      expect(pill.apply!.label).toBe('Done placing decals');
      pill.apply!.run(ed as any);
      expect(ed.decal.scene3dDecalToolActive).toBeFalse();
      expect(ed.shapeManager.exitDecalPlaceMode3D).toHaveBeenCalledTimes(1);
      expect(activeContextPill(ed as any)).toBeNull();   // the mode ended: the pill goes away
    });

    it('LiveText editing: Done ends editing (the Esc action)', () => {
      const ed = host({ liveText: true });
      const pill = activeContextPill(ed as any)!;
      expect(pill).toBe(CONTEXT_PILLS.liveText);
      expect(pill.apply!.label).toBe('Done editing text');
      pill.apply!.run(ed as any);
      expect(ed.liveTextOptions.endLiveTextEditing).toHaveBeenCalledTimes(1);
    });

    it('resolves overlapping states in the order Esc does: live text, decal, knife, transform', () => {
      expect(activeContextPill(host({ liveText: true, decal: true, transforming: true }) as any)!.mode).toBe('liveText');
      expect(activeContextPill(host({ decal: true, editing: true, tool: 'knife', transforming: true }) as any)!.mode).toBe('decal');
      expect(activeContextPill(host({ editing: true, tool: 'knife', transforming: true }) as any)!.mode).toBe('knife');
    });
  });
});
