import { MeshEditService } from './mesh-edit.service';

/** Mirror "Use Face" = tap it, then tap a face (notes 2026-10-08 #2): one selected face mirrors at once; otherwise a
 *  one-shot engine face pick is armed (Select tool, Face mode); the picked face becomes the plane; any other action
 *  cancels it. */
describe('MeshEditService Mirror "Use Face" pick', () => {
  function setup(o: { faces?: number[]; pickApi?: boolean; mode?: 'vertex' | 'edge' | 'face' } = {}) {
    const sel = { meshId: 'm1', vertices: new Set<number>(), edges: new Set<number>(), faces: new Set<number>(o.faces ?? []) };
    let armed: ((face: number | null) => void) | null = null;
    const sm: any = {
      getEditMesh3D: () => ({ vertices: [], faces: [{}, {}, {}, {}, {}, {}], halfEdges: [] }),
      getEditSelection3D: () => sel,
      clearEditSelection3D: jasmine.createSpy('clearEditSelection3D').and.callFake(() => { sel.faces.clear(); }),
      setMeshEditSelectionMode: jasmine.createSpy('setMeshEditSelectionMode'),
      setMeshEditActiveTool3D: jasmine.createSpy('setMeshEditActiveTool3D').and.returnValue(true),
      getMeshEditActiveTool3D: () => 'select',
      addMirrorFromFace3D: jasmine.createSpy('addMirrorFromFace3D').and.returnValue(0),
      isShortcutActive3D: false,
      requestRender3D: () => undefined,
      enterMeshEditMode3D: () => true,
      attachMeshEditPointerHandlers: () => undefined,
      detachMeshEditPointerHandlers: () => undefined,
      exitMeshEditMode3D: () => undefined,
      setGizmoMode3D: () => undefined,
    };
    if (o.pickApi !== false) {
      sm.armMeshEditFacePick3D = jasmine.createSpy('armMeshEditFacePick3D').and.callFake((cb: (f: number | null) => void) => { armed = cb; return true; });
      sm.cancelMeshEditFacePick3D = jasmine.createSpy('cancelMeshEditFacePick3D').and.callFake(() => {
        const cb = armed; armed = null; cb?.(null); return !!cb;
      });
    }
    const host: any = { shapeManager: sm, activeModeChrome: 'meshEdit', hud: { syncShortcutHud: () => undefined }, scene3dGizmoMode: 'move' };
    const svc = new MeshEditService({ scene3dSelectedMeshId: 'm1' } as any, { run: (f: () => void) => f() } as any);
    svc.bind(host);
    svc.editMesh('m1');
    if (o.mode) svc.selectionMode = o.mode;
    sel.faces = new Set(o.faces ?? []);
    sm.setMeshEditSelectionMode.calls.reset();
    sm.setMeshEditActiveTool3D.calls.reset();
    /** The engine's pick resolving (a face tap), or its own cancel (null). */
    const engineTap = (face: number | null): void => { const cb = armed; armed = null; cb?.(face); };
    return { svc, sm, sel, engineTap, isArmed: () => armed !== null };
  }

  it('exactly one face selected: the mirror across it at once (no pick)', () => {
    const { svc, sm } = setup({ faces: [4] });
    expect(svc.useMirrorFace()).toBe('mirrored');
    expect(sm.addMirrorFromFace3D).toHaveBeenCalledOnceWith('m1', 4);
    expect(sm.armMeshEditFacePick3D).not.toHaveBeenCalled();
    expect(svc.mirrorFacePicking).toBeFalse();
  });

  it('otherwise: armed (Select tool, Face mode forced, pressed); the tapped face is the plane, the selection untouched', () => {
    const { svc, sm, sel, engineTap } = setup({ faces: [1, 2], mode: 'vertex' });
    svc.tool = 'extrude';
    const done = jasmine.createSpy('done');
    expect(svc.useMirrorFace(done)).toBe('armed');
    expect(svc.mirrorFacePicking).toBeTrue();
    expect(svc.tool).toBe('select');
    expect(sm.setMeshEditActiveTool3D).toHaveBeenCalledWith('select');
    expect(svc.selectionMode).toBe('face');
    expect(sm.setMeshEditSelectionMode).toHaveBeenCalledWith('face');
    // (the mode switch to Face cleared the selection, as any Vertex / Edge / Face switch does)
    sel.faces = new Set([1, 2]);
    engineTap(5);
    expect(sm.addMirrorFromFace3D).toHaveBeenCalledOnceWith('m1', 5);
    expect([...sel.faces]).toEqual([1, 2]);
    expect(svc.mirrorFacePicking).toBeFalse();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('already in Face mode: the selection is not cleared on arming', () => {
    const { svc, sm } = setup({ faces: [], mode: 'face' });
    expect(svc.useMirrorFace()).toBe('armed');
    expect(sm.clearEditSelection3D).not.toHaveBeenCalled();
    expect(sm.setMeshEditSelectionMode).not.toHaveBeenCalled();
  });

  it('cancelled by the button again, Esc, a tool, Vertex / Edge / Face, a panel verb, leaving Edit Mesh', () => {
    const t = setup();
    const cancels: Array<[string, () => void]> = [
      ['button again', () => expect(t.svc.useMirrorFace()).toBe('cancelled')],
      ['Esc', () => expect(t.svc.cancelPreviewKey()).toBeTrue()],
      ['a tool', () => t.svc.setTool('knife')],
      ['a mode', () => t.svc.setSelectionMode('edge')],
      ['a verb', () => t.svc.runVerb('flip')],
      ['leaving', () => t.svc.exitMeshEditMode()],
    ];
    for (const [what, act] of cancels) {
      t.svc.selectionMode = 'face';
      t.svc.scene3dIsEditingMesh = true;
      expect(t.svc.useMirrorFace()).withContext(what).toBe('armed');
      expect(t.isArmed()).withContext(what).toBeTrue();
      act();
      expect(t.svc.mirrorFacePicking).withContext(what).toBeFalse();
      expect(t.isArmed()).withContext(what).toBeFalse();
    }
    expect(t.sm.addMirrorFromFace3D).not.toHaveBeenCalled();
    expect(t.svc.cancelPreviewKey()).toBeFalse();   // nothing armed: Esc goes on (leaves the mode)
  });

  it('the engine cancelling (null) un-presses the button; an older Salsa without the pick: nothing happens', () => {
    const t = setup();
    t.svc.useMirrorFace();
    t.engineTap(null);
    expect(t.svc.mirrorFacePicking).toBeFalse();
    expect(t.sm.addMirrorFromFace3D).not.toHaveBeenCalled();
    const old = setup({ pickApi: false });
    expect(old.svc.mirrorFacePickSupported).toBeFalse();
    expect(old.svc.useMirrorFace()).toBeNull();
    expect(old.svc.mirrorFacePicking).toBeFalse();
  });
});
