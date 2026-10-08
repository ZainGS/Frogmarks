import { MeshEditService } from './mesh-edit.service';

/** Next Edit Mesh batch (2026-10-08) §4: Extrude / Inset / Subdivide / the Bevel tool as a LIVE PREVIEW. */
describe('MeshEditService live preview', () => {
  /** Animation frames (the preview's per-frame re-run): run by flush(). */
  let frames: Array<() => void> = [];
  beforeEach(() => {
    frames = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => { frames.push(() => cb(0)); return frames.length; });
    spyOn(window, 'cancelAnimationFrame').and.callFake((id: number) => { frames[id - 1] = () => undefined; });
  });
  /** A fake engine: the mesh as a state string, an undo stack (the step on top when Edit Mesh was entered first), the
   *  last op record (valid while its step is on top), the preview calls as spies. */
  function setup(o: { cancelApi?: boolean; faces?: number[] } = {}) {
    const sel = { meshId: 'm1', vertices: new Set<number>(), edges: new Set<number>(), faces: new Set<number>(o.faces ?? [3]) };
    let state = 'cube';
    const stack: Array<{ description: string; before: string }> = [{ description: 'Add mesh', before: '' }];
    let redo: object[] = [];
    let last: { op: string; params: Record<string, number> } | null = null;
    let lastCmd: object | null = null;
    const run = (op: string, params: Record<string, number>): boolean => {
      const cmd = { description: op, before: state };
      state = `${op}${JSON.stringify(params)}[${[...sel.faces].join()}]`;
      stack.push(cmd); redo = []; last = { op, params }; lastCmd = cmd;
      return true;
    };
    const valid = (): boolean => !!last && stack[stack.length - 1] === lastCmd;
    let bevel: { phase: 'pick' | 'adjust'; amount: number } | null = null;
    const sm: any = {
      getEditMesh3D: () => ({ vertices: [], faces: [{}, {}, {}, {}], halfEdges: [] }),
      getEditSelection3D: () => sel,
      clearEditSelection3D: () => { sel.faces.clear(); },
      selectFace3D: (_: string, i: number) => sel.faces.add(i),
      setMeshEditSelectionMode: () => undefined,
      setMeshEditActiveTool3D: jasmine.createSpy('setMeshEditActiveTool3D').and.returnValue(true),
      getMeshEditActiveTool3D: () => 'move',
      extrudeRegion3D: jasmine.createSpy('extrudeRegion3D').and.callFake((_: string, _f: Set<number>, d: number) => run('extrudeRegion', { distance: d })),
      insetRegion3D: jasmine.createSpy('insetRegion3D').and.callFake((_: string, _f: Set<number>, a: number, dep = 0) => run('insetRegion', { amount: a, depth: dep })),
      subdivideFaces3D: jasmine.createSpy('subdivideFaces3D').and.callFake((_: string, _f: Set<number>, levels = 1) => run('subdivide', { levels })),
      flipFaces3D: jasmine.createSpy('flipFaces3D'),
      getMeshEditLastOp3D: () => (valid() ? { op: last!.op, params: { ...last!.params } } : null),
      redoMeshEditLastOp3D: jasmine.createSpy('redoMeshEditLastOp3D').and.callFake((p: Record<string, number>) => {
        if (!valid()) return false;
        state = stack.pop()!.before;
        return run(last!.op, { ...last!.params, ...p });
      }),
      setMeshEditOpPreview3D: jasmine.createSpy('setMeshEditOpPreview3D'),
      beginBevel3D: jasmine.createSpy('beginBevel3D').and.callFake(() => { bevel = { phase: sel.faces.size ? 'adjust' : 'pick', amount: 0 }; return true; }),
      getBevelState3D: () => bevel,
      setBevelAmount3D: jasmine.createSpy('setBevelAmount3D').and.callFake((a: number) => { if (bevel) bevel.amount = a; }),
      commitBevel3D: jasmine.createSpy('commitBevel3D').and.callFake(() => { bevel = null; return true; }),
      cancelBevel3D: jasmine.createSpy('cancelBevel3D').and.callFake(() => { bevel = null; }),
      isShortcutActive3D: false,
      requestRender3D: () => undefined,
      enterMeshEditMode3D: () => true,
      attachMeshEditPointerHandlers: () => undefined,
      detachMeshEditPointerHandlers: () => undefined,
      exitMeshEditMode3D: () => { last = null; },
      setGizmoMode3D: () => undefined,
      scene3d: { peekUndoCommand3D: () => stack[stack.length - 1] ?? null },
    };
    Object.defineProperty(sm, 'canUndo3D', { get: () => stack.length > 0 });
    Object.defineProperty(sm, 'canRedo3D', { get: () => redo.length > 0 });
    if (o.cancelApi !== false) {
      sm.cancelMeshEditLastOp3D = jasmine.createSpy('cancelMeshEditLastOp3D').and.callFake(() => {
        if (!valid()) return false;
        state = stack.pop()!.before; last = null;   // no step and no redo entry left
        return true;
      });
    }
    const host: any = { shapeManager: sm, activeModeChrome: 'meshEdit', hud: { syncShortcutHud: () => undefined }, scene3dGizmoMode: 'move' };
    const svc = new MeshEditService({ scene3dSelectedMeshId: 'm1' } as any, { run: (f: () => void) => f() } as any);
    svc.bind(host);
    svc.editMesh('m1');
    sel.faces = new Set(o.faces ?? [3]);
    const flush = (): void => { frames.splice(0).forEach(f => f()); };
    /** The engine re-targets the preview on a face tap (MeshEditPointerController): the same op + params on the faces
     *  the tap selects — resolved against the mesh before the op. */
    const retarget = (faces: number[]): void => { state = stack.pop()!.before; sel.faces = new Set(faces); run(last!.op, { ...last!.params }); };
    const engineUndo = (): void => { const c = stack.pop()!; redo.push(c); state = c.before; };
    return { svc, sm, sel, host, flush, retarget, engineUndo, state: () => state, steps: () => stack.length - 1, redo: () => redo.length };
  }

  it('picking Extrude with faces selected runs it as a preview with the last-used params; Apply keeps ONE step, the tool stays', () => {
    const t = setup();
    t.svc.params.extrudeDistance = 0.4;
    t.svc.setTool('extrude');
    expect(t.sm.extrudeRegion3D).toHaveBeenCalledOnceWith('m1', new Set([3]), 0.4);
    expect(t.svc.previewKind).toBe('extrude');
    expect(t.sm.setMeshEditOpPreview3D).toHaveBeenCalledWith(true);
    expect(t.steps()).toBe(1);
    expect(t.svc.applyPreview()).toBeTrue();
    expect(t.svc.previewKind).toBeNull();
    expect(t.sm.setMeshEditOpPreview3D).toHaveBeenCalledWith(false);
    expect(t.svc.tool).toBe('extrude');
    expect(t.steps()).toBe(1);
    expect(t.svc.appliedOpSig).toBe(JSON.stringify({ op: 'extrudeRegion', params: { distance: 0.4 } }));   // no "adjust last" for it
    // the preview's step is inside Edit Mesh's undo scope (above the step it was entered on)
    expect(t.svc.takeUndoStep(false)).toBeTrue();
  });

  it('param changes re-run the preview at most once per frame; Apply first applies a pending change', () => {
    const t = setup();
    t.svc.setTool('inset');
    t.svc.setPreviewParam('amount', 0.2);
    t.svc.setPreviewParam('depth', -0.1);
    t.svc.setPreviewParam('amount', 0.25);
    expect(t.sm.redoMeshEditLastOp3D).not.toHaveBeenCalled();
    t.flush();
    expect(t.sm.redoMeshEditLastOp3D).toHaveBeenCalledOnceWith({ amount: 0.25, depth: -0.1 });
    expect([t.svc.params.insetAmount, t.svc.params.insetDepth]).toEqual([0.25, -0.1]);   // kept for the next run
    expect(t.steps()).toBe(1);
    t.svc.setPreviewParam('amount', 0.3);
    t.svc.setPreviewParam('bogus', 1);
    expect(t.svc.applyPreview()).toBeTrue();
    expect(t.sm.redoMeshEditLastOp3D).toHaveBeenCalledTimes(2);
    expect(t.state()).toContain('"amount":0.3');
    expect(t.steps()).toBe(1);
    t.flush();
    expect(t.sm.redoMeshEditLastOp3D).toHaveBeenCalledTimes(2);
  });

  it('Cancel / Esc / re-tap / another tool / leaving Edit Mesh: no change, NO undo step, no redo entry', () => {
    const paths: Array<[string, (t: ReturnType<typeof setup>) => void, string]> = [
      ['Cancel', t => { t.svc.cancelPreview(); }, 'select'],
      ['Esc', t => { expect(t.svc.cancelPreviewKey()).toBeTrue(); }, 'select'],
      ['re-tap the tool', t => { t.svc.setTool('select'); }, 'select'],      // (the panel: the active tool again = Select)
      ['another tool', t => { t.svc.setTool('loopcut'); }, 'loopcut'],
      ['leave', t => { t.svc.exitMeshEditMode(); }, 'select'],
    ];
    for (const [name, act, tool] of paths) {
      const t = setup();
      t.svc.setTool('extrude');
      t.svc.setPreviewParam('distance', 0.9);                            // (a pending change is dropped too)
      act(t);
      t.flush();
      expect(t.state()).withContext(name).toBe('cube');
      expect(t.steps()).withContext(name).toBe(0);
      expect(t.redo()).withContext(name).toBe(0);
      expect(t.svc.previewKind).withContext(name).toBeNull();
      expect(t.svc.tool).withContext(name).toBe(tool);
      expect(t.sm.redoMeshEditLastOp3D).withContext(name).not.toHaveBeenCalled();
      expect(t.sm.setMeshEditOpPreview3D).withContext(name).toHaveBeenCalledWith(false);
      if (name !== 'leave') expect(t.svc.takeUndoStep(false)).withContext(name).toBeFalse();   // back at the floor
    }
    // leaving also puts the engine's tool back to Select, so the next entry starts with no tool
    const t = setup();
    t.svc.setTool('extrude');
    t.sm.setMeshEditActiveTool3D.calls.reset();
    t.svc.exitMeshEditMode();
    expect(t.sm.setMeshEditActiveTool3D).toHaveBeenCalledOnceWith('select');
  });

  it('another preview tool replaces the preview: the extrude is reverted, the inset previews instead (one step)', () => {
    const t = setup();
    t.svc.setTool('extrude');
    t.svc.setTool('inset');
    expect(t.svc.previewKind).toBe('inset');
    expect(t.state()).toMatch(/^insetRegion/);
    expect(t.steps()).toBe(1);
  });

  it('taps on other faces move the preview (the engine re-targets it): still one step; Apply keeps the new one', () => {
    const t = setup();
    t.svc.setTool('extrude');
    t.retarget([1]);
    expect(t.svc.previewKind).toBe('extrude');
    t.retarget([1, 2]);
    expect(t.steps()).toBe(1);
    t.svc.applyPreview();
    expect(t.state()).toBe('extrudeRegion{"distance":0.3}[1,2]');
    expect(t.steps()).toBe(1);
  });

  it('no face selected: no preview (the tool waits); an undo during the preview ends it (the op is a plain step then)', () => {
    const none = setup({ faces: [] });
    none.svc.setTool('extrude');
    expect(none.sm.extrudeRegion3D).not.toHaveBeenCalled();
    expect(none.svc.previewKind).toBeNull();
    const t = setup();
    t.svc.setTool('extrude');
    t.engineUndo();
    expect(t.svc.previewKind).toBeNull();
    expect(t.sm.setMeshEditOpPreview3D).toHaveBeenCalledWith(false);
    expect(t.svc.cancelPreview()).toBeFalse();
    expect(t.redo()).toBe(1);                                            // (a real undo: redo-able, unlike a Cancel)
  });

  it('Subdivide previews with its levels; tapping it again = Cancel (no step); another verb cancels the preview first', () => {
    const t = setup();
    t.svc.params.subdivideLevels = 2;
    expect(t.svc.runVerb('subdivide')).toBeTrue();
    expect(t.sm.subdivideFaces3D).toHaveBeenCalledOnceWith('m1', new Set([3]), 2);
    expect(t.svc.previewKind).toBe('subdivide');
    t.svc.setPreviewParam('levels', 3);
    t.flush();
    expect(t.sm.redoMeshEditLastOp3D).toHaveBeenCalledOnceWith({ levels: 3 });
    expect(t.svc.runVerb('subdivide')).toBeTrue();
    expect(t.svc.previewKind).toBeNull();
    expect(t.steps()).toBe(0);
    expect(t.svc.tool).toBe('select');                                   // (not a tool: nothing to turn off)
    t.svc.runVerb('subdivide');
    t.svc.runVerb('flip');
    expect(t.svc.previewKind).toBeNull();
    expect(t.state()).toBe('cube');
    expect(t.sm.flipFaces3D).toHaveBeenCalledOnceWith('m1', new Set([3]));   // on the faces before the preview
  });

  it('E / I on a newer Salsa: the tool + its preview (no second run while one shows)', () => {
    const t = setup();
    t.svc.toolKey('extrude');
    t.svc.toolKey('extrude');
    expect(t.sm.extrudeRegion3D).toHaveBeenCalledTimes(1);
    expect(t.svc.previewKind).toBe('extrude');
    t.svc.applyPreview();
    t.svc.toolKey('extrude');                                           // the tool on, no preview: a new one
    expect(t.sm.extrudeRegion3D).toHaveBeenCalledTimes(2);
    expect(t.steps()).toBe(2);
  });

  it('an older Salsa (no cancelMeshEditLastOp3D): picking Extrude runs nothing, E extrudes at once as before', () => {
    const t = setup({ cancelApi: false });
    t.svc.setTool('extrude');
    expect(t.sm.extrudeRegion3D).not.toHaveBeenCalled();
    t.svc.toolKey('extrude');
    expect(t.sm.extrudeRegion3D).toHaveBeenCalledTimes(1);
    expect(t.svc.previewKind).toBeNull();
  });

  it('the Bevel tool: the Chamfer starts at the last applied amount; Apply remembers it; Cancel reverts and turns the tool off', () => {
    const t = setup();
    t.svc.setTool('bevel');
    expect(t.sm.setBevelAmount3D).toHaveBeenCalledOnceWith(0.1);
    t.sm.getBevelState3D().amount = 0.25;
    expect(t.svc.applyPreviewKey()).toBeTrue();                          // Enter
    expect(t.sm.commitBevel3D).toHaveBeenCalledTimes(1);
    expect(t.svc.params.bevelAmount).toBe(0.25);
    t.svc.beginBevelPreview();                                           // (the pill's Start)
    expect(t.sm.setBevelAmount3D).toHaveBeenCalledWith(0.25);
    expect(t.svc.cancelPreviewKey()).toBeTrue();                         // Esc
    expect(t.sm.cancelBevel3D).toHaveBeenCalled();
    expect(t.svc.tool).toBe('select');
    expect(t.svc.cancelPreviewKey()).toBeFalse();                        // nothing left: Esc goes on (leaves the mode)
  });

  it('entering Edit Mesh starts with no tool (Select), the engine too: the rail shows no Move / Rotate / Scale', () => {
    const t = setup();
    expect(t.svc.tool).toBe('select');
    expect(t.sm.setMeshEditActiveTool3D).toHaveBeenCalledWith('select');
  });
});
