import { MeshEditService } from './mesh-edit.service';

/** The Edit Mesh element actions behind the mode keys (mode-keymap.ts: 1 / 2 / 3, A, X / Delete, Ctrl+R). */
describe('MeshEditService element actions', () => {
  // A two-quad strip: faces 0 [0,1,2,3] and 1 [1,4,5,2] share the edge 1–2 (half-edges 1 and 7, twins).
  function halfEdges() {
    const he = (vertex: number, prev: number, twin: number, face: number) => ({ vertex, prev, twin, face, next: -1, isSeam: false });
    return [
      he(1, 3, -1, 0), he(2, 0, 7, 0), he(3, 1, -1, 0), he(0, 2, -1, 0),
      he(4, 7, -1, 1), he(5, 4, -1, 1), he(2, 5, -1, 1), he(1, 6, 1, 1),
    ];
  }
  function setup() {
    const sel = { meshId: 'm1', vertices: new Set<number>(), edges: new Set<number>(), faces: new Set<number>() };
    const em = { vertices: new Array(6).fill(0).map(() => ({})), faces: [{}, {}], halfEdges: halfEdges() };
    const sm = {
      getEditMesh3D: jasmine.createSpy('getEditMesh3D').and.callFake(() => em),
      getEditSelection3D: () => sel,
      clearEditSelection3D: jasmine.createSpy('clear').and.callFake(() => { sel.vertices.clear(); sel.edges.clear(); sel.faces.clear(); }),
      selectVertex3D: (_: string, i: number) => sel.vertices.add(i),
      selectEdge3D: (_: string, i: number) => sel.edges.add(i),
      selectFace3D: (_: string, i: number) => sel.faces.add(i),
      setMeshEditSelectionMode: jasmine.createSpy('setMeshEditSelectionMode'),
      dissolveEdge3D: jasmine.createSpy('dissolveEdge3D').and.returnValue(true),
      loopCut3D: jasmine.createSpy('loopCut3D').and.returnValue(true),
      deleteEditFace3D: jasmine.createSpy('deleteEditFace3D'),
      requestRender3D: jasmine.createSpy('requestRender3D'),
    };
    const editorState = { scene3dSelectedMeshId: 'm1' };
    const svc = new MeshEditService(editorState as any, { run: (f: () => void) => f() } as any);
    svc.bind({ shapeManager: sm } as any);
    svc.scene3dIsEditingMesh = true;
    return { svc, sm, sel };
  }

  it('setSelectionMode switches the engine picker and clears the selection', () => {
    const { svc, sm, sel } = setup();
    sel.faces.add(0);
    svc.setSelectionMode('edge');
    expect(svc.selectionMode).toBe('edge');
    expect(sm.setMeshEditSelectionMode).toHaveBeenCalledWith('edge');
    expect(sel.faces.size).toBe(0);
  });

  it('A selects every element of the mode; again deselects', () => {
    const { svc, sel } = setup();
    svc.toggleSelectAll();
    expect([...sel.faces]).toEqual([0, 1]);
    svc.toggleSelectAll();
    expect(sel.faces.size).toBe(0);
    svc.selectionMode = 'vertex';
    svc.toggleSelectAll();
    expect(sel.vertices.size).toBe(6);
    svc.selectionMode = 'edge';
    svc.toggleSelectAll();
    expect(sel.edges.size).toBe(7);   // 8 half-edges, the shared edge once
    svc.toggleSelectAll();
    expect(sel.edges.size).toBe(0);
  });

  it('A in edge mode counts an edge picked by its other half as selected', () => {
    const { svc, sel } = setup();
    svc.selectionMode = 'edge';
    for (const i of [0, 2, 3, 4, 5, 6, 7]) sel.edges.add(i);   // 7 = the twin of 1
    svc.toggleSelectAll();
    expect(sel.edges.size).toBe(0);
  });

  it('X deletes the selected faces, else dissolves the selected edges (looked up by their end vertices)', () => {
    const { svc, sm, sel } = setup();
    sel.faces.add(1);
    expect(svc.deleteSelectedElements()).toBeTrue();
    expect(sm.deleteEditFace3D).toHaveBeenCalledOnceWith('m1', 1);
    sel.edges.add(7);
    expect(svc.deleteSelectedElements()).toBeTrue();
    expect(sm.dissolveEdge3D).toHaveBeenCalledOnceWith('m1', 1);   // the first interior half-edge of 1–2
    expect(svc.deleteSelectedElements()).toBeFalse();               // nothing selected now
  });

  it('deletes the selected faces as ONE undo step when the engine has deleteFaces3D', () => {
    const { svc, sm, sel } = setup();
    const deleteFaces3D = jasmine.createSpy('deleteFaces3D').and.returnValue(true);
    (sm as any).deleteFaces3D = deleteFaces3D;
    sel.faces.add(0); sel.faces.add(1);
    svc.deleteSelectedElements();
    expect(deleteFaces3D).toHaveBeenCalledOnceWith('m1', new Set([0, 1]));
    expect(sm.deleteEditFace3D).not.toHaveBeenCalled();
  });

  it('a boundary edge is not dissolved', () => {
    const { svc, sm, sel } = setup();
    sel.edges.add(0);
    expect(svc.dissolveSelectedEdges()).toBe(0);
    expect(sm.dissolveEdge3D).not.toHaveBeenCalled();
  });

  it('Ctrl+R cuts through the selected edge (index 0 works) and clears the selection; no edge: nothing', () => {
    const { svc, sm, sel } = setup();
    expect(svc.loopCutSelectedEdge()).toBeFalse();
    expect(sm.loopCut3D).not.toHaveBeenCalled();
    sel.edges.add(0);
    expect(svc.loopCutSelectedEdge(0.25)).toBeTrue();
    expect(sm.loopCut3D).toHaveBeenCalledOnceWith('m1', 0, 0.25);
    expect(sel.edges.size).toBe(0);
  });

  it('does nothing outside Edit Mesh', () => {
    const { svc, sm, sel } = setup();
    svc.scene3dIsEditingMesh = false;
    sel.edges.add(1);
    svc.toggleSelectAll();
    expect(svc.loopCutSelectedEdge()).toBeFalse();
    expect(svc.deleteSelectedElements()).toBeFalse();
    expect(sm.loopCut3D).not.toHaveBeenCalled();
    expect(sel.faces.size).toBe(0);
  });
});

/** The mode chrome's tool strip (UI review 2026-10-07 §4): the tool → engine mapping, on a newer Salsa and the old dist. */
describe('MeshEditService tools (mode chrome)', () => {
  function setup(o: { newer?: boolean; chrome?: boolean } = {}) {
    const sel = { meshId: 'm1', vertices: new Set<number>(), edges: new Set<number>(), faces: new Set<number>([3]) };
    const em = { vertices: new Array(4).fill(0).map(() => ({})), faces: [{}, {}, {}, {}], halfEdges: [] as unknown[] };
    let knifePoints = 0;
    const sm: any = {
      getEditMesh3D: () => em,
      getEditSelection3D: () => sel,
      clearEditSelection3D: jasmine.createSpy('clear').and.callFake(() => { sel.vertices.clear(); sel.edges.clear(); sel.faces.clear(); }),
      selectFace3D: (_: string, i: number) => sel.faces.add(i),
      extrudeEditFace3D: jasmine.createSpy('extrudeEditFace3D'),
      insetEditFace3D: jasmine.createSpy('insetEditFace3D'),
      loopCut3D: jasmine.createSpy('loopCut3D').and.returnValue(true),
      beginTransform3D: jasmine.createSpy('beginTransform3D'),
      cancelTransform3D: jasmine.createSpy('cancelTransform3D'),
      isShortcutActive3D: false,
      requestRender3D: () => undefined,
    };
    if (o.newer) {
      Object.assign(sm, {
        setMeshEditActiveTool3D: jasmine.createSpy('setMeshEditActiveTool3D').and.returnValue(true),
        getMeshEditActiveTool3D: () => 'move',
        applyMeshEditKnife3D: jasmine.createSpy('applyMeshEditKnife3D').and.callFake(() => { knifePoints = 0; return 2; }),
        cancelMeshEditKnife3D: jasmine.createSpy('cancelMeshEditKnife3D').and.callFake(() => { knifePoints = 0; }),
        getMeshEditKnifePointCount3D: () => knifePoints,
        extrudeRegion3D: jasmine.createSpy('extrudeRegion3D').and.returnValue(true),
        insetRegion3D: jasmine.createSpy('insetRegion3D').and.returnValue(true),
        loopCuts3D: jasmine.createSpy('loopCuts3D').and.returnValue(true),
        beginBevel3D: jasmine.createSpy('beginBevel3D').and.returnValue(true),
        getBevelState3D: () => null,
      });
    }
    const host: any = { shapeManager: sm, activeModeChrome: o.chrome === false ? null : 'meshEdit', hud: { syncShortcutHud: jasmine.createSpy('sync') } };
    const svc = new MeshEditService({ scene3dSelectedMeshId: 'm1' } as any, { run: (f: () => void) => f() } as any);
    svc.bind(host);
    svc.scene3dIsEditingMesh = true;
    return { svc, sm, sel, host, setKnife: (n: number) => { knifePoints = n; } };
  }

  it('a newer Salsa: each tool is the engine tool; Bevel starts the Chamfer; the knife stays the engine one', () => {
    const { svc, sm } = setup({ newer: true });
    for (const t of ['select', 'move', 'rotate', 'scale', 'extrude', 'inset', 'loopcut', 'knife'] as const) {
      svc.setTool(t);
      expect(sm.setMeshEditActiveTool3D).toHaveBeenCalledWith(t);
      expect(svc.tool).toBe(t);
      expect(svc.scene3dEditTool).toBe('select');   // never Frogmarks' drag knife
    }
    expect(sm.beginTransform3D).not.toHaveBeenCalled();
    svc.setTool('bevel');
    expect(sm.beginBevel3D).toHaveBeenCalledTimes(1);
  });

  it('the old dist: Move / Rotate / Scale start the keyboard transform on the selection; Knife = the drag knife', () => {
    const { svc, sm, host } = setup();
    svc.setTool('rotate');
    expect(sm.beginTransform3D).toHaveBeenCalledOnceWith('rotate');
    expect(host.hud.syncShortcutHud).toHaveBeenCalled();
    svc.setTool('knife');
    expect(svc.scene3dEditTool).toBe('knife');
    svc.setTool('select');
    expect(svc.scene3dEditTool).toBe('select');
  });

  it('switching tools ends a running keyboard transform', () => {
    const { svc, sm } = setup();
    sm.isShortcutActive3D = true;
    svc.setTool('extrude');
    expect(sm.cancelTransform3D).toHaveBeenCalledTimes(1);
  });

  it('K toggles the chrome Knife tool; the classic panel keeps the drag knife', () => {
    const chrome = setup({ newer: true });
    chrome.svc.toggleKnifeTool();
    expect(chrome.svc.tool).toBe('knife');
    expect(chrome.sm.setMeshEditActiveTool3D).toHaveBeenCalledWith('knife');
    chrome.svc.toggleKnifeTool();
    expect(chrome.svc.tool).toBe('select');
    const classic = setup({ newer: true, chrome: false });
    classic.svc.toggleKnifeTool();
    expect(classic.svc.scene3dEditTool).toBe('knife');
    expect(classic.sm.setMeshEditActiveTool3D).not.toHaveBeenCalled();
  });

  it('E / I: switch to the tool and run it at once on the selected faces with the tool amounts', () => {
    const { svc, sm } = setup({ newer: true });
    svc.params.extrudeDistance = 0.7;
    svc.toolKey('extrude');
    expect(svc.tool).toBe('extrude');
    expect(sm.extrudeRegion3D).toHaveBeenCalledOnceWith('m1', new Set([3]), 0.7);
    svc.params.insetDepth = 0.2;
    svc.toolKey('inset');
    expect(sm.insetRegion3D).toHaveBeenCalledOnceWith('m1', new Set([3]), 0.1, 0.2);
    const old = setup();
    old.svc.toolKey('extrude');
    expect(old.sm.extrudeEditFace3D).toHaveBeenCalledOnceWith('m1', 3, 0.3);   // the per-face fallback
  });

  it('Knife points: Enter cuts from two points, Esc drops them; with none both decline', () => {
    const { svc, sm, setKnife } = setup({ newer: true });
    svc.setTool('knife');
    expect(svc.applyKnifePoints()).toBeFalse();
    expect(svc.cancelKnifePoints()).toBeFalse();
    setKnife(1);
    expect(svc.applyKnifePoints()).toBeFalse();    // one point: nothing to cut yet
    expect(svc.cancelKnifePoints()).toBeTrue();
    setKnife(3);
    expect(svc.applyKnifePoints()).toBeTrue();
    expect(sm.applyMeshEditKnife3D).toHaveBeenCalledTimes(1);
  });

  it('the Loop Cut tool cuts through the selected edge with its count / position (loopCuts3D)', () => {
    const { svc, sm, sel } = setup({ newer: true });
    sel.edges.add(5);
    svc.params.loopCutCount = 3;
    svc.params.loopCutPosition = 0.3;
    expect(svc.loopCutSelectedEdge()).toBeTrue();
    expect(sm.loopCuts3D).toHaveBeenCalledOnceWith('m1', 5, 3, 0.3);
  });

  it('Invert selects what was not selected', () => {
    const { svc, sel } = setup();
    svc.invertSelection();
    expect([...sel.faces].sort()).toEqual([0, 1, 2]);
  });

  // ── Round-2 feedback (2026-10-08) ──

  it('the main toolbar shows the tool: Move / Rotate / Scale light their rail button, the panel tools none', () => {
    const { svc, host } = setup({ newer: true });
    host.scene3dGizmoMode = 'move';
    svc.setTool('rotate');
    expect(host.scene3dGizmoMode).toBe('rotate');
    svc.setTool('extrude');
    expect(host.scene3dGizmoMode).toBeNull();
    svc.setTool('select');
    expect(host.scene3dGizmoMode).toBeNull();
  });

  it('a selection-type switch drops a panel tool the new type does not offer', () => {
    const { svc, sm } = setup({ newer: true });
    sm.setMeshEditSelectionMode = () => undefined;
    svc.setTool('extrude');
    svc.setSelectionMode('edge');
    expect(svc.tool).toBe('select');
    svc.setTool('loopcut');
    svc.setSelectionMode('face');
    expect(svc.tool).toBe('loopcut');
  });

  it('the panel verbs run on the selection; nothing fitting: false', () => {
    const { svc, sm, sel } = setup();
    sm.subdivideFace3D = jasmine.createSpy('subdivideFace3D');
    expect(svc.runVerb('subdivide')).toBeTrue();
    expect(sm.subdivideFace3D).toHaveBeenCalled();
    sel.faces.clear();
    expect(svc.runVerb('flip')).toBeFalse();
    expect(svc.runVerb('merge')).toBeFalse();
  });

  it('undo in Edit Mesh stops at the step it was entered on; redo only re-does what was undone in it', () => {
    const { svc, sm } = setup();
    const before = { description: 'Add mesh' }, op = { description: 'Extrude' };
    const stack: object[] = [before];
    let undone: object[] = [];
    sm.scene3d = { peekUndoCommand3D: () => stack[stack.length - 1] ?? null };
    Object.defineProperty(sm, 'canUndo3D', { get: () => stack.length > 0 });
    Object.defineProperty(sm, 'canRedo3D', { get: () => undone.length > 0 });
    sm.enterMeshEditMode3D = () => undefined;
    sm.setMeshEditSelectionMode = () => undefined;
    sm.attachMeshEditPointerHandlers = () => undefined;
    svc.editMesh('m1');
    // nothing done in Edit Mesh yet: the step below (the cube's Add) is not undone; a redo from before is not re-done
    expect(svc.takeUndoStep(false)).toBeFalse();
    undone = [{ description: 'older' }];
    expect(svc.takeUndoStep(true)).toBeFalse();
    undone = [];
    stack.push(op);
    expect(svc.takeUndoStep(false)).toBeTrue();   // the Extrude
    stack.pop(); undone.push(op);
    expect(svc.takeUndoStep(false)).toBeFalse();  // back at the floor
    expect(svc.takeUndoStep(true)).toBeTrue();    // the Extrude again
    stack.push(undone.pop()!);
    expect(svc.takeUndoStep(true)).toBeFalse();
  });

  it('leave(): the focus background goes and Edit Mesh exits', () => {
    const { svc, sm } = setup();
    sm.setMeshEditBgMode3D = jasmine.createSpy('setMeshEditBgMode3D');
    sm.detachMeshEditPointerHandlers = jasmine.createSpy('detach');
    sm.exitMeshEditMode3D = jasmine.createSpy('exitMeshEditMode3D');
    svc.leave();
    expect(sm.setMeshEditBgMode3D).toHaveBeenCalledOnceWith({ mode: 'none' });
    expect(sm.exitMeshEditMode3D).toHaveBeenCalledTimes(1);
    expect(svc.scene3dIsEditingMesh).toBeFalse();
  });
});

describe('MeshEditService Drag Lock', () => {
  afterEach(() => { try { localStorage.removeItem('fm-mesh-drag-lock'); } catch { /* */ } });
  function make(withApi = true) {
    const sm: any = withApi ? { setMeshEditDragMovesSelection3D: jasmine.createSpy('dragMoves') } : {};
    const svc = new MeshEditService({ scene3dSelectedMeshId: 'm1' } as any, { run: (f: () => void) => f() } as any);
    svc.bind({ shapeManager: sm } as any);
    return { svc, sm };
  }

  it('off by default; on = the engine stops drag-to-move, off = back on; remembered on this device', () => {
    try { localStorage.removeItem('fm-mesh-drag-lock'); } catch { /* */ }
    const { svc, sm } = make();
    expect(svc.dragLock).toBeFalse();
    svc.setDragLock(true);
    expect(sm.setMeshEditDragMovesSelection3D).toHaveBeenCalledWith(false);
    expect(make().svc.dragLock).toBeTrue();        // a new editor session reads it back
    svc.setDragLock(false);
    expect(sm.setMeshEditDragMovesSelection3D).toHaveBeenCalledWith(true);
    expect(make().svc.dragLock).toBeFalse();
  });

  it('an older engine without the switch: no throw', () => {
    const { svc } = make(false);
    expect(() => svc.setDragLock(true)).not.toThrow();
    expect(svc.dragLock).toBeTrue();
  });
});
