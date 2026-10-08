import { TestBed } from '@angular/core/testing';
import { MeshEditChromeComponent } from './mesh-edit-chrome.component';

/** The Edit Mesh chrome's handlers (UI review 2026-10-07 §4, round-2 feedback): the long-press radial, the pill, adjust last,
 *  the touch multi-select latch. */
describe('MeshEditChromeComponent', () => {
  function setup(o: { pick?: { kind: 'vertex' | 'edge' | 'face'; index: number; selected: boolean } | null; lastOp?: boolean; coarse?: boolean } = {}) {
    const sel = { vertices: [] as number[], edges: [] as number[], faces: [] as number[] };
    const sm: any = {
      isShortcutActive3D: false,
      selectFace3D: jasmine.createSpy('selectFace3D'),
      selectEdge3D: jasmine.createSpy('selectEdge3D'),
      selectVertex3D: jasmine.createSpy('selectVertex3D'),
      requestRender3D: () => undefined,
      frameMesh3D: jasmine.createSpy('frameMesh3D'),
      setMeshEditBgMode3D: jasmine.createSpy('setMeshEditBgMode3D'),
      subdivideFace3D: jasmine.createSpy('subdivideFace3D'),
      clearEditSelection3D: jasmine.createSpy('clearEditSelection3D'),
      setMeshEditSelectionMode: () => undefined,
    };
    if (o.pick !== undefined) sm.pickMeshEditElementAt3D = jasmine.createSpy('pick').and.returnValue(o.pick);
    let last: { op: string; params: Record<string, number> } | null = o.lastOp ? { op: 'extrudeRegion', params: { distance: 0.3 } } : null;
    if (o.lastOp) {
      sm.getMeshEditLastOp3D = () => last;
      sm.redoMeshEditLastOp3D = jasmine.createSpy('redo').and.callFake((p: Record<string, number>) => { last = { op: last!.op, params: { ...last!.params, ...p } }; return true; });
    }
    const meshEdit: any = {
      scene3dIsEditingMesh: true, selectionMode: 'face', tool: 'select', bgMode: 'gradient',
      params: { extrudeDistance: 0.3, insetAmount: 0.1, insetDepth: 0, loopCutCount: 1, loopCutPosition: 0.5 },
      get selection() { return sel; },
      knifePointCount: 0,
      setTool: jasmine.createSpy('setTool').and.callFake((t: string) => { meshEdit.tool = t; }),
      runExtrude: jasmine.createSpy('runExtrude').and.returnValue(true),
      runInset: jasmine.createSpy('runInset').and.returnValue(true),
      deleteSelectedElements: jasmine.createSpy('deleteSelectedElements'),
      runVerb: jasmine.createSpy('runVerb').and.returnValue(true),
      loopCutSelectedEdge: jasmine.createSpy('loopCutSelectedEdge').and.returnValue(true),
      deselectAll: jasmine.createSpy('deselectAll'),
      toggleSelectAll: jasmine.createSpy('toggleSelectAll'),
      invertSelection: jasmine.createSpy('invertSelection'),
      exitMeshEditMode: jasmine.createSpy('exitMeshEditMode'),
      setBgMode: jasmine.createSpy('setBgMode'),
      // the live preview (next Edit Mesh batch §4)
      previewKind: null, previewSupported: false, appliedOpSig: null,
      cancelPreview: jasmine.createSpy('cancelPreview').and.returnValue(false),
      setPreviewParam: jasmine.createSpy('setPreviewParam'),
      applyPreview: jasmine.createSpy('applyPreview').and.returnValue(true),
      toolKey: jasmine.createSpy('toolKey'),
    };
    const ed: any = {
      shapeManager: sm, meshEdit, editorState: { scene3dSelectedMeshId: 'm1', scene3dSelectedMeshName: 'Box' },
      touchUi: { coarse: o.coarse ?? true }, uv: { openUVEditor: jasmine.createSpy('openUVEditor') },
      scene3dUndo: jasmine.createSpy('scene3dUndo'), scene3dMarkDirty: () => undefined, _updateGizmoPosition: () => undefined,
      canvasRef: null,
    };
    const c = TestBed.runInInjectionContext(() => new MeshEditChromeComponent());
    c.ed = ed;
    return { c, sm, meshEdit, ed, sel };
  }
  const press = { clientX: 10, clientY: 20, pointerId: 1, pointerType: 'touch' };

  it('long press on an unselected face selects it and offers the face ops', () => {
    const { c, sm } = setup({ pick: { kind: 'face', index: 4, selected: false } });
    c.openRadialAt(press);
    expect(sm.pickMeshEditElementAt3D).toHaveBeenCalledOnceWith(10, 20, true);
    expect(sm.selectFace3D).toHaveBeenCalledOnceWith('m1', 4, false);
    expect(c.radial.open).toBeTrue();
    expect(c.radial.title).toBe('Face');
    expect(c.radial.items.map(i => i.id)).toEqual(['extrude', 'inset', 'subdivide', 'delete']);
  });

  it('an already selected edge stays as it is; the edge ops show', () => {
    const { c, sm } = setup({ pick: { kind: 'edge', index: 7, selected: true } });
    c.openRadialAt(press);
    expect(sm.selectEdge3D).not.toHaveBeenCalled();
    expect(c.radial.items.map(i => i.id)).toEqual(['loopcut', 'bevel', 'fill', 'delete']);
  });

  it('no pick API (the old dist): acts on the selection; nothing selected = no menu', () => {
    const a = setup();
    a.c.openRadialAt(press);
    expect(a.c.radial.open).toBeFalse();
    const b = setup();
    b.sel.faces.push(1);
    b.c.openRadialAt(press);
    expect(b.c.radial.open).toBeTrue();
    expect(b.c.radial.title).toBe('Face');
  });

  it('radial picks run the op on the selection', () => {
    const { c, meshEdit } = setup({ pick: { kind: 'face', index: 1, selected: true } });
    c.openRadialAt(press);
    c.runRadial('extrude');
    expect(c.radial.open).toBeFalse();
    expect(meshEdit.setTool).toHaveBeenCalledWith('extrude');
    expect(meshEdit.runExtrude).toHaveBeenCalledTimes(1);
    c.runRadial('delete');
    expect(meshEdit.runVerb).toHaveBeenCalledOnceWith('delete');
    c.runRadial('loopcut');
    expect(meshEdit.loopCutSelectedEdge).toHaveBeenCalledTimes(1);
  });

  it('Extrude tool: the distance edits the next run; Apply runs it', () => {
    const { c, meshEdit, sel } = setup();
    meshEdit.tool = 'extrude';
    sel.faces.push(0);
    expect(c.op!.kind).toBe('extrude');
    c.setOpParam({ id: 'distance', value: 0.75 });
    expect(meshEdit.params.extrudeDistance).toBe(0.75);
    expect(c.op!.params[0].value).toBe(0.75);
    c.applyOp();
    expect(meshEdit.runExtrude).toHaveBeenCalledTimes(1);
    c.cancelOp();
    expect(meshEdit.setTool).toHaveBeenCalledWith('select');
  });

  it('adjust last: a scrub re-runs the op once per frame (and sets the tool amount); Apply hides it; Esc (cancel) reverts', async () => {
    const { c, sm, meshEdit, ed } = setup({ lastOp: true });
    expect(c.op!.kind).toBe('adjust');
    c.setOpParam({ id: 'distance', value: 0.5 });
    c.setOpParam({ id: 'distance', value: 0.6 });
    expect(meshEdit.params.extrudeDistance).toBe(0.6);
    await new Promise(r => requestAnimationFrame(() => r(null)));
    expect(sm.redoMeshEditLastOp3D).toHaveBeenCalledOnceWith({ distance: 0.6 });
    expect(c.op!.params[0].value).toBe(0.6);
    c.applyOp();   // Apply
    expect(c.op!.kind).toBe('select');
    expect(c.op!.title).toBe('');   // just Frame
    const u = setup({ lastOp: true });
    expect(u.c.op!.kind).toBe('adjust');
    u.c.cancelOp();
    expect(u.ed.scene3dUndo).toHaveBeenCalledTimes(1);
    expect(ed.scene3dUndo).not.toHaveBeenCalled();
  });

  it('another tool (the panel, the rail, a key) hides adjust last: the new tool\'s own pill', () => {
    const { c, meshEdit } = setup({ lastOp: true });
    expect(c.op!.kind).toBe('adjust');
    meshEdit.tool = 'inset';
    expect(c.op!.kind).toBe('inset');
  });

  it('the pill always shows (Frame): frames the mesh with nothing selected', () => {
    const { c, sm } = setup();
    expect(c.op).not.toBeNull();
    c.frame();
    expect(sm.frameMesh3D).toHaveBeenCalledOnceWith('m1', 1.4);
  });

  it('a live preview: its pill (Apply + Cancel) wins over adjust last; params / Apply / Cancel go to the service', () => {
    const { c, meshEdit } = setup({ lastOp: true });
    meshEdit.tool = 'extrude';
    meshEdit.previewKind = 'extrude';
    const op = c.op!;
    expect([op.kind, op.title, op.showApplyCancel, op.showCancel]).toEqual(['preview', 'Extrude', true, true]);
    c.setOpParam({ id: 'distance', value: 0.6 });
    expect(meshEdit.setPreviewParam).toHaveBeenCalledOnceWith('distance', 0.6);
    c.applyOp();
    expect(meshEdit.applyPreview).toHaveBeenCalledTimes(1);
    c.cancelOp();
    expect(meshEdit.cancelPreview).toHaveBeenCalledTimes(1);
    // after an Apply the kept op gets no "adjust last" pill
    meshEdit.previewKind = null;
    meshEdit.appliedOpSig = JSON.stringify({ op: 'extrudeRegion', params: { distance: 0.3 } });
    expect(c.op!.kind).toBe('extrude');
  });

  it('the radial Extrude / Inset start the preview on a newer Salsa; another radial op cancels a preview first', () => {
    const { c, meshEdit } = setup({ pick: { kind: 'face', index: 1, selected: true } });
    meshEdit.previewSupported = true;
    c.openRadialAt(press);
    c.runRadial('inset');
    expect(meshEdit.toolKey).toHaveBeenCalledOnceWith('inset');
    expect(meshEdit.runInset).not.toHaveBeenCalled();
    c.runRadial('delete');
    expect(meshEdit.cancelPreview).toHaveBeenCalled();
    expect(meshEdit.runVerb).toHaveBeenCalledOnceWith('delete');
  });

  it('Frame with a selection: the face-on frame (frameEditSelection3D) when the engine has it, else frameSelected3D', () => {
    const t = setup();
    t.sel.faces.push(2);
    t.sm.frameSelected3D = jasmine.createSpy('frameSelected3D').and.returnValue(true);
    t.c.frame();
    expect(t.sm.frameSelected3D).toHaveBeenCalledTimes(1);
    t.sm.frameEditSelection3D = jasmine.createSpy('frameEditSelection3D').and.returnValue(true);
    t.c.frame();
    expect(t.sm.frameEditSelection3D).toHaveBeenCalledTimes(1);
    expect(t.sm.frameSelected3D).toHaveBeenCalledTimes(1);
  });

  it('touch / pen: taps add to the selection while mounted (the latch), restored on destroy; desktop: untouched', () => {
    const t = setup();
    let latch = false;
    t.sm.setAdditiveSelect3D = jasmine.createSpy('setAdditiveSelect3D').and.callFake((on: boolean) => { latch = on; });
    t.sm.getAdditiveSelect3D = () => latch;
    t.c.ngOnInit();
    expect(latch).toBeTrue();
    t.c.ngOnDestroy();
    expect(latch).toBeFalse();
    const d = setup({ coarse: false });
    d.sm.setAdditiveSelect3D = jasmine.createSpy('setAdditiveSelect3D');
    d.c.ngOnInit();
    d.c.ngOnDestroy();
    expect(d.sm.setAdditiveSelect3D).not.toHaveBeenCalled();
  });

});
