import {
  activeContextPill, canRouteDuplicate, cheatsheetColumns, chordLabel, CONTEXT_PILLS, dispatchKey, KeyBinding, MOD_KEYMAP, pillButtons,
  routeDelete, routeDuplicate, routeUndo, TOOL3D_ACTIONS, TOOL_KEYMAP,
} from './editor-keymap';

function key(k: string, mods: { shift?: boolean; alt?: boolean; repeat?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, shiftKey: !!mods.shift, altKey: !!mods.alt, repeat: !!mods.repeat, cancelable: true });
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

    it('a held key (auto-repeat) runs a binding once unless it is marked repeat', () => {
      const once = jasmine.createSpy('once');
      const held = jasmine.createSpy('held');
      const table: KeyBinding[] = [
        { keys: ['x'], group: 'Edit', help: '', run: once },
        { keys: ['+'], repeat: true, group: 'View', help: '', run: held },
      ];
      dispatchKey(table, ed, key('x'), false);
      const rep = key('x', { repeat: true });
      expect(dispatchKey(table, ed, rep, false)).toBeFalse();   // plain key: nothing, the default isn't claimed
      expect(rep.defaultPrevented).toBeFalse();
      expect(once).toHaveBeenCalledTimes(1);
      dispatchKey(table, ed, key('+'), false);
      dispatchKey(table, ed, key('+', { repeat: true }), false);
      expect(held).toHaveBeenCalledTimes(2);
    });

    it('a held Ctrl chord stays claimed on the repeats (no browser default) but runs once', () => {
      const run = jasmine.createSpy('save');
      const table: KeyBinding[] = [{ keys: ['s'], mod: true, group: 'File', help: '', run }];
      const rep = key('s', { repeat: true });
      expect(dispatchKey(table, ed, rep, true)).toBeTrue();
      expect(rep.defaultPrevented).toBeTrue();
      expect(run).not.toHaveBeenCalled();
    });

    it('the real tables: undo / redo / zoom repeat; save, paste, duplicate, toggles and tools do not', () => {
      const repeatable = [...MOD_KEYMAP, ...TOOL_KEYMAP].filter(b => b.repeat).map(b => b.help).sort();
      expect(repeatable).toEqual(['Redo', 'Undo (Shift: redo)', 'Zoom in', 'Zoom out']);
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
        editorState: { scene3dPanelVisible: false, scene3dSelectedMeshId: null },
        shapeManager: { interactionService: { selectedNodes: new Set(), suppressBoxSelect: false }, deleteSelectedShapes: jasmine.createSpy('del2D') },
        meshEdit: { scene3dIsEditingMesh: false, deleteSelectedFaces: jasmine.createSpy('delFaces') },
        scene3dDeleteSelected: jasmine.createSpy('del3D'),
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

    it("the engine's selected layer is the 3D scene layer (a city document): the 3D undo, not raster (mobile-parity 7.3c)", () => {
      const withLayer = (type: string) => {
        const ed = host({});
        Object.assign(ed.shapeManager, {
          rasterLayerManager: { getSelectedLayerId: () => 'L' },
          getRasterLayers: () => [{ id: 'X', type: 'layer' }, { id: 'L', type }],
        });
        return ed;
      };
      const city = withLayer('3d-scene');
      routeUndo(city as any, false);
      routeUndo(city as any, true);
      expect(city.scene3dUndo).toHaveBeenCalledTimes(1);
      expect(city.scene3dRedo).toHaveBeenCalledTimes(1);
      expect(city.rasterUndo).not.toHaveBeenCalled();
      expect(city.rasterRedo).not.toHaveBeenCalled();
      const paint = withLayer('layer');
      routeUndo(paint as any, false);
      expect(paint.rasterUndo).toHaveBeenCalled();
      expect(paint.scene3dUndo).not.toHaveBeenCalled();
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
        rasterSelectionService: { deselectAll: jasmine.createSpy('deselectPixels') },
      };
    }

    // mobile-parity 7.2 (the Delete fix's twin): the engine claims Ctrl+D when nodes are selected and calls routeDuplicate
    // through its duplicate-key hook; the keymap binding is the fallback, so one press never duplicates twice.
    describe('Ctrl+D = Edit › Duplicate', () => {
      const ctrlD = (o: { repeat?: boolean } = {}) => key('d', o);

      it('a selected 3D mesh is duplicated once, through the 3D duplicate (never the 2D path)', () => {
        const ed = host({ panel3D: true, meshId: 'm1', nodes2D: 1 });
        const e = ctrlD();
        spyOn(e, 'stopImmediatePropagation').and.callThrough();
        expect(dispatchKey(MOD_KEYMAP, ed as any, e, true)).toBeTrue();
        expect(ed.scene3dDuplicateMesh).toHaveBeenCalledOnceWith('m1');
        expect(ed.shapeManager.duplicateSelectedShapes).not.toHaveBeenCalled();
        expect(ed.rasterSelectionService.deselectAll).not.toHaveBeenCalled();
        expect(e.stopImmediatePropagation).toHaveBeenCalled();
      });

      it('the key and the menu do the same thing (2D shapes via the 2D duplicate; nothing else)', () => {
        const viaKey = host({ nodes2D: 2 });
        const viaMenu = host({ nodes2D: 2 });
        dispatchKey(MOD_KEYMAP, viaKey as any, ctrlD(), true);
        expect(routeDuplicate(viaMenu as any)).toBeTrue();
        for (const ed of [viaKey, viaMenu]) {
          expect(ed.shapeManager.duplicateSelectedShapes).toHaveBeenCalledTimes(1);
          expect(ed.scene3dDuplicateMesh).not.toHaveBeenCalled();
          expect(ed.rasterSelectionService.deselectAll).not.toHaveBeenCalled();
        }
      });

      it('the engine already ran Edit › Duplicate for this press (default prevented) → the binding does nothing more', () => {
        const ed = host({ panel3D: true, meshId: 'm1', nodes2D: 1 });
        const e = ctrlD();
        e.preventDefault();   // the engine's Ctrl+D handler claimed it (and called routeDuplicate itself)
        expect(dispatchKey(MOD_KEYMAP, ed as any, e, true)).toBeTrue();
        expect(ed.scene3dDuplicateMesh).not.toHaveBeenCalled();
        expect(ed.shapeManager.duplicateSelectedShapes).not.toHaveBeenCalled();
        expect(ed.rasterSelectionService.deselectAll).not.toHaveBeenCalled();
      });

      it('a held Ctrl+D duplicates once: the auto-repeats are claimed but run nothing', () => {
        const ed = host({ panel3D: true, meshId: 'm1' });
        dispatchKey(MOD_KEYMAP, ed as any, ctrlD(), true);
        const rep = ctrlD({ repeat: true });
        expect(dispatchKey(MOD_KEYMAP, ed as any, rep, true)).toBeTrue();
        dispatchKey(MOD_KEYMAP, ed as any, ctrlD({ repeat: true }), true);
        expect(rep.defaultPrevented).toBeTrue();
        expect(ed.scene3dDuplicateMesh).toHaveBeenCalledTimes(1);
      });

      it('nothing to duplicate → deselects the pixel selection (Edit › Duplicate is disabled then)', () => {
        const ed = host();
        dispatchKey(MOD_KEYMAP, ed as any, ctrlD(), true);
        expect(ed.rasterSelectionService.deselectAll).toHaveBeenCalledTimes(1);
        expect(ed.scene3dDuplicateMesh).not.toHaveBeenCalled();
      });

      it('the key never duplicates the selected 3D object while a creator mode owns input (the menu still does)', () => {
        const ed = host({ panel3D: true, meshId: 'm1', suppress: true });
        dispatchKey(MOD_KEYMAP, ed as any, ctrlD(), true);
        expect(ed.scene3dDuplicateMesh).not.toHaveBeenCalled();
        expect(ed.rasterSelectionService.deselectAll).not.toHaveBeenCalled();
        expect(routeDuplicate(ed as any)).toBeTrue();
        expect(ed.scene3dDuplicateMesh).toHaveBeenCalledTimes(1);
      });
    });

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

    // mobile-parity 7.2: the Delete key only unlinked a selected 3D mesh (no outliner / undo / character teardown)
    it('the Delete and Backspace keys route through the same Edit › Delete (3D items, mesh-edit faces)', () => {
      for (const k of ['Delete', 'Backspace']) {
        const ed = host({ panel3D: true, meshId: 'm1' });
        expect(dispatchKey(TOOL_KEYMAP, ed as any, key(k), false)).toBeTrue();
        expect(ed.scene3dDeleteSelected).toHaveBeenCalledTimes(1);
        expect(ed.shapeManager.deleteSelectedShapes).not.toHaveBeenCalled();
        const edit = host({ panel3D: true, meshId: 'm1', editing: true, suppress: true });
        dispatchKey(TOOL_KEYMAP, edit as any, key(k), false);
        expect(edit.meshEdit.deleteSelectedFaces).toHaveBeenCalledTimes(1);
        expect(edit.scene3dDeleteSelected).not.toHaveBeenCalled();
      }
    });

    it('the key fallback leaves 2D shapes to the engine (it declined: Backspace typing into a selected text shape)', () => {
      const ed = host({ nodes2D: 1 });
      dispatchKey(TOOL_KEYMAP, ed as any, key('Backspace'), false);
      expect(ed.shapeManager.deleteSelectedShapes).not.toHaveBeenCalled();
      expect(ed.deleteSelectionOrLayers).toHaveBeenCalledTimes(1);   // the pixel selection, like Edit › Delete
    });

    it('the key never deletes the selected 3D object while a creator mode (UV paint, armature…) owns input', () => {
      const ed = host({ panel3D: true, meshId: 'm1', suppress: true });
      dispatchKey(TOOL_KEYMAP, ed as any, key('Delete'), false);
      expect(ed.scene3dDeleteSelected).not.toHaveBeenCalled();
      routeDelete(ed as any);   // the menu is explicit
      expect(ed.scene3dDeleteSelected).toHaveBeenCalledTimes(1);
    });
  });

  describe('Esc leaves the UV editor (mobile-parity 7.2)', () => {
    function host(o: { uvOpen?: boolean; clothing?: string | null; transforming?: boolean } = {}) {
      return {
        decal: { scene3dDecalToolActive: false },
        meshEdit: { scene3dIsEditingMesh: false, scene3dEditTool: 'select' },
        rasterSelectionService: { info: { isTransforming: !!o.transforming }, cancelTransform: jasmine.createSpy('cancelTransform') },
        uv: { uvEditorOpen: !!o.uvOpen, scene3dClothingPaintActive: o.clothing ?? null, closeUVEditor: jasmine.createSpy('closeUV') },
        selectCursor: jasmine.createSpy('selectCursor'),
      };
    }

    it('through the panel Close (the full exit), for the UV editor and clothing paint', () => {
      for (const ed of [host({ uvOpen: true }), host({ clothing: 'top' })]) {
        dispatchKey(TOOL_KEYMAP, ed as any, key('Escape'), false);
        expect(ed.uv.closeUVEditor).toHaveBeenCalledTimes(1);
        expect(ed.selectCursor).not.toHaveBeenCalled();
      }
    });

    it('a selection transform is cancelled first; with nothing open Esc is still the cursor tool', () => {
      const t = host({ uvOpen: true, transforming: true });
      dispatchKey(TOOL_KEYMAP, t as any, key('Escape'), false);
      expect(t.rasterSelectionService.cancelTransform).toHaveBeenCalledTimes(1);
      expect(t.uv.closeUVEditor).not.toHaveBeenCalled();
      const none = host();
      dispatchKey(TOOL_KEYMAP, none as any, key('Escape'), false);
      expect(none.selectCursor).toHaveBeenCalledOnceWith('cursor');
      expect(none.uv.closeUVEditor).not.toHaveBeenCalled();
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

  describe('touch 3D tool pill (TOUCH-10: Multi / Snap / Frame / Grab / Rotate / Scale / X / Y / Z)', () => {
    /** A host in the 3D view. `engine` = the newer Salsa APIs present (sm.setAdditiveSelect3D ...); off = an old dist. */
    function host(o: { selected?: string | null; editing?: boolean; tool?: 'select' | 'knife'; subMode?: boolean; shortcut?: boolean;
                       axis?: 'x' | 'y' | 'z' | null; engine?: boolean; panel?: boolean } = {}) {
      const latches = { additive: false, snap: false };
      const sm: any = {
        isShortcutActive3D: !!o.shortcut,
        shortcutAxis3D: o.axis ?? null,
        beginTransform3D: jasmine.createSpy('beginTransform3D'),
        constrainAxis3D: jasmine.createSpy('constrainAxis3D'),
        appendNumericInput: jasmine.createSpy('appendNumericInput'),
        commitTransform3D: jasmine.createSpy('commitTransform3D'),
        cancelTransform3D: jasmine.createSpy('cancelTransform3D'),
        frameMesh3D: jasmine.createSpy('frameMesh3D'),
        frameAllMeshes3D: jasmine.createSpy('frameAllMeshes3D'),
      };
      if (o.engine !== false) {
        sm.setAdditiveSelect3D = jasmine.createSpy('setAdditiveSelect3D').and.callFake((on: boolean) => { latches.additive = on; });
        sm.getAdditiveSelect3D = () => latches.additive;
        sm.setSnapToggle3D = jasmine.createSpy('setSnapToggle3D').and.callFake((on: boolean) => { latches.snap = on; });
        sm.getSnapToggle3D = () => latches.snap;
        sm.frameSelected3D = jasmine.createSpy('frameSelected3D').and.returnValue(true);
      }
      return {
        shapeManager: sm,
        decal: { scene3dDecalToolActive: false },
        meshEdit: { scene3dIsEditingMesh: !!o.editing, scene3dEditTool: o.tool ?? 'select', cancelKnifeCut: jasmine.createSpy('cancelKnife') },
        rasterSelectionService: { info: { isTransforming: false, hasSelection: false } },
        liveTextOptions: { liveTextIsEditing: false },
        editorState: { scene3dPanelVisible: o.panel !== false, scene3dSelectedMeshId: o.selected === undefined ? 'm1' : o.selected },
        scene3dInSubMode: !!o.subMode || !!o.editing,
        hud: { syncShortcutHud: jasmine.createSpy('syncShortcutHud') },
        latches,
      };
    }
    const btn = (ed: any, id: string) => pillButtons(activeContextPill(ed)!, ed).find(b => b.id === id)!;

    it('object mode: Multi / Snap / Frame on a selected mesh; nothing without the 3D view, a selection, or in a sub-mode', () => {
      const ed = host();
      const pill = activeContextPill(ed as any)!;
      expect(pill).toBe(CONTEXT_PILLS.object3d);
      expect(pillButtons(pill, ed as any).map(b => b.id)).toEqual(['multi', 'snap', 'frame']);
      expect(activeContextPill(host({ selected: null }) as any)).toBeNull();
      expect(activeContextPill(host({ panel: false }) as any)).toBeNull();
      expect(activeContextPill(host({ subMode: true }) as any)).toBeNull();   // armature / UV editor / world panel
    });

    it('Multi and Snap are latches on the engine (aria-pressed from the engine); hidden on an old Salsa dist', () => {
      const ed = host();
      const multi = btn(ed, 'multi'), snap = btn(ed, 'snap');
      expect(multi.pressed!(ed as any)).toBeFalse();
      multi.run(ed as any);
      expect(ed.shapeManager.setAdditiveSelect3D).toHaveBeenCalledOnceWith(true);
      expect(multi.pressed!(ed as any)).toBeTrue();
      multi.run(ed as any);
      expect(ed.latches.additive).toBeFalse();
      snap.run(ed as any);
      expect(ed.shapeManager.setSnapToggle3D).toHaveBeenCalledOnceWith(true);
      expect(snap.pressed!(ed as any)).toBeTrue();
      const old = host({ engine: false });
      expect(pillButtons(activeContextPill(old as any)!, old as any).map(b => b.id)).toEqual(['frame']);
    });

    it('Frame: the engine frame-selected when present, else the selected mesh', () => {
      const ed = host();
      btn(ed, 'frame').run(ed as any);
      expect(ed.shapeManager.frameSelected3D).toHaveBeenCalledTimes(1);
      const old = host({ engine: false });
      btn(old, 'frame').run(old as any);
      expect(old.shapeManager.frameMesh3D).toHaveBeenCalledOnceWith('m1', 1.4);
    });

    it('Edit Mesh: Multi / Frame / Grab / Rotate / Scale; Grab starts the G transform and syncs the HUD', () => {
      const ed = host({ editing: true });
      const pill = activeContextPill(ed as any)!;
      expect(pill).toBe(CONTEXT_PILLS.meshEdit);
      expect(pillButtons(pill, ed as any).map(b => b.id)).toEqual(['multi', 'frame', 'grab', 'rotate', 'scale']);
      btn(ed, 'grab').run(ed as any);
      btn(ed, 'rotate').run(ed as any);
      btn(ed, 'scale').run(ed as any);
      expect(ed.shapeManager.beginTransform3D.calls.allArgs()).toEqual([['grab'], ['rotate'], ['scale']]);
      expect(ed.hud.syncShortcutHud).toHaveBeenCalledTimes(3);
      // The knife keeps its own Cancel pill
      expect(activeContextPill(host({ editing: true, tool: 'knife' }) as any)).toBe(CONTEXT_PILLS.knife);
    });

    it('during the 3D transform: X / Y / Z pick the axis, the field sends the digits, Apply / Cancel = Enter / Esc', () => {
      const ed = host({ editing: true, shortcut: true, axis: 'y' });
      const pill = activeContextPill(ed as any)!;
      expect(pill).toBe(CONTEXT_PILLS.transform3d);
      expect(pill.numeric).toBeTrue();
      expect(pillButtons(pill, ed as any).map(b => b.id)).toEqual(['x', 'y', 'z']);
      expect(btn(ed, 'y').pressed!(ed as any)).toBeTrue();
      btn(ed, 'x').run(ed as any);
      expect(ed.shapeManager.constrainAxis3D).toHaveBeenCalledWith('x');
      ed.shapeManager.constrainAxis3D.calls.reset();
      // setValue: re-constrain (clears the engine buffer), then each character like a key press; junk is dropped
      TOOL3D_ACTIONS.setValue(ed as any, '-1.5m');
      expect(ed.shapeManager.constrainAxis3D).toHaveBeenCalledOnceWith('y');
      expect(ed.shapeManager.appendNumericInput.calls.allArgs()).toEqual([['-'], ['1'], ['.'], ['5']]);
      pill.apply!.run(ed as any);
      pill.cancel!.run(ed as any);
      expect(ed.shapeManager.commitTransform3D).toHaveBeenCalledTimes(1);
      expect(ed.shapeManager.cancelTransform3D).toHaveBeenCalledTimes(1);
    });

    it('the typed amount waits for an axis (the engine ignores digits without one)', () => {
      const ed = host({ editing: true, shortcut: true, axis: null });
      TOOL3D_ACTIONS.setValue(ed as any, '2');
      expect(ed.shapeManager.appendNumericInput).not.toHaveBeenCalled();
    });
  });
});
