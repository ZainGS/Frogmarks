import { canvasMenuItems, clampMenuPosition, runCanvasMenuItem, type CanvasMenuId } from './canvas-context-menu';

/** A fake editor: what the routes read (selection state) and what they call (spies). */
function host(o: { nodes2D?: number; pixels?: boolean; clipboard?: boolean; panel3D?: boolean; meshId?: string; editingMesh?: boolean;
                   canUndo2D?: boolean } = {}) {
  const selected = new Set(Array.from({ length: o.nodes2D ?? 0 }, (_, i) => ({ id: 'n' + i })));
  return {
    shapeManager: {
      interactionService: { selectedNodes: selected, suppressBoxSelect: false },
      canUndo2DShapes: !!o.canUndo2D, canRedo2DShapes: false,
      undo2DShapes: jasmine.createSpy('undo2DShapes'), redo2DShapes: jasmine.createSpy('redo2DShapes'),
      duplicateSelectedShapes: jasmine.createSpy('duplicateSelectedShapes'),
      deleteSelectedShapes: jasmine.createSpy('deleteSelectedShapes'),
    },
    editorState: { scene3dPanelVisible: !!o.panel3D, scene3dSelectedMeshId: o.meshId ?? null },
    meshEdit: { scene3dIsEditingMesh: !!o.editingMesh, deleteSelectedFaces: jasmine.createSpy('deleteSelectedFaces') },
    is3DContextActive: !!o.panel3D,
    scene3dUndo: jasmine.createSpy('scene3dUndo'), scene3dRedo: jasmine.createSpy('scene3dRedo'),
    rasterUndo: jasmine.createSpy('rasterUndo'), rasterRedo: jasmine.createSpy('rasterRedo'),
    scene3dDuplicateMesh: jasmine.createSpy('scene3dDuplicateMesh'),
    scene3dDeleteSelected: jasmine.createSpy('scene3dDeleteSelected'),
    deleteSelectionOrLayers: jasmine.createSpy('deleteSelectionOrLayers'),
    rasterSelectionService: {
      info: { hasSelection: !!o.pixels }, hasClipboard: !!o.clipboard,
      cut: jasmine.createSpy('cut').and.resolveTo(), copy: jasmine.createSpy('copy').and.resolveTo(),
      paste: jasmine.createSpy('paste'),
    },
  };
}

const enabled = (ed: ReturnType<typeof host>): Record<CanvasMenuId, boolean> =>
  Object.fromEntries(canvasMenuItems(ed as any).map(i => [i.id, i.enabled])) as Record<CanvasMenuId, boolean>;

describe('canvas context menu', () => {
  it('lists Undo / Redo / Cut / Copy / Paste / Duplicate / Delete', () => {
    expect(canvasMenuItems(host() as any).map(i => i.id)).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'duplicate', 'delete']);
  });

  it('nothing selected, nothing copied: only Undo / Redo are enabled', () => {
    expect(enabled(host())).toEqual({ undo: true, redo: true, cut: false, copy: false, paste: false, duplicate: false, delete: false });
  });

  it('a pixel selection enables Cut / Copy / Delete; something copied enables Paste', () => {
    const e = enabled(host({ pixels: true, clipboard: true }));
    expect([e.cut, e.copy, e.paste, e.delete, e.duplicate]).toEqual([true, true, true, true, false]);
  });

  it('selected 2D shapes enable Duplicate / Delete and route to the engine (like Ctrl+D / Del)', () => {
    const ed = host({ nodes2D: 2 });
    expect(enabled(ed).duplicate).toBeTrue();
    runCanvasMenuItem(ed as any, 'duplicate');
    expect(ed.shapeManager.duplicateSelectedShapes).toHaveBeenCalledTimes(1);
    runCanvasMenuItem(ed as any, 'delete');
    expect(ed.shapeManager.deleteSelectedShapes).toHaveBeenCalledTimes(1);
    expect(ed.deleteSelectionOrLayers).toHaveBeenCalledTimes(1);
  });

  it('a selected 3D mesh duplicates / deletes through the 3D routes', () => {
    const ed = host({ panel3D: true, meshId: 'm1' });
    runCanvasMenuItem(ed as any, 'duplicate');
    expect(ed.scene3dDuplicateMesh).toHaveBeenCalledOnceWith('m1');
    runCanvasMenuItem(ed as any, 'delete');
    expect(ed.scene3dDeleteSelected).toHaveBeenCalledTimes(1);
    expect(ed.shapeManager.duplicateSelectedShapes).not.toHaveBeenCalled();
  });

  it('Undo / Redo go through routeUndo: the 2D object stack first, else the raster history', () => {
    const vec = host({ canUndo2D: true });
    runCanvasMenuItem(vec as any, 'undo');
    expect(vec.shapeManager.undo2DShapes).toHaveBeenCalledTimes(1);
    expect(vec.rasterUndo).not.toHaveBeenCalled();
    const ras = host();
    runCanvasMenuItem(ras as any, 'undo');
    runCanvasMenuItem(ras as any, 'redo');
    expect(ras.rasterUndo).toHaveBeenCalledTimes(1);
    expect(ras.rasterRedo).toHaveBeenCalledTimes(1);
    const in3D = host({ panel3D: true });
    runCanvasMenuItem(in3D as any, 'undo');
    expect(in3D.scene3dUndo).toHaveBeenCalledTimes(1);
  });

  it('Cut / Copy / Paste run the pixel selection, like Ctrl+X / C / V', () => {
    const ed = host({ pixels: true, clipboard: true });
    runCanvasMenuItem(ed as any, 'cut');
    runCanvasMenuItem(ed as any, 'copy');
    runCanvasMenuItem(ed as any, 'paste');
    expect(ed.rasterSelectionService.cut).toHaveBeenCalledTimes(1);
    expect(ed.rasterSelectionService.copy).toHaveBeenCalledTimes(1);
    expect(ed.rasterSelectionService.paste).toHaveBeenCalledTimes(1);
  });

  it('a disabled item runs nothing', () => {
    const ed = host();
    runCanvasMenuItem(ed as any, 'cut');
    runCanvasMenuItem(ed as any, 'delete');
    expect(ed.rasterSelectionService.cut).not.toHaveBeenCalled();
    expect(ed.deleteSelectionOrLayers).not.toHaveBeenCalled();
  });

  it('stays on screen: flips left / up near the right / bottom edge', () => {
    expect(clampMenuPosition(100, 100, 200, 300, 1000, 800)).toEqual({ x: 100, y: 100 });
    expect(clampMenuPosition(950, 700, 200, 300, 1000, 800)).toEqual({ x: 750, y: 400 });
    expect(clampMenuPosition(50, 50, 200, 300, 220, 320)).toEqual({ x: 8, y: 8 });
  });
});
