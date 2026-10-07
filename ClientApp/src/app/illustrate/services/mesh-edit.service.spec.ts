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
