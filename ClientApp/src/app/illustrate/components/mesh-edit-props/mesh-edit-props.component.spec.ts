import { TestBed } from '@angular/core/testing';
import { MeshEditPropsComponent } from './mesh-edit-props.component';

/** The Edit Mesh right panel (round-2 feedback 2026-10-08): the tools, the Mirror rework. */
describe('MeshEditPropsComponent', () => {
  function setup(o: { mirrorApi?: boolean; faces?: number[] } = {}) {
    const sel = { vertices: [] as number[], edges: [] as number[], faces: o.faces ?? [] };
    const mods: Array<{ type: string; enabled: boolean; axis?: string }> = [];
    const modes: string[] = [];
    const sm: any = {
      getModifiers3D: () => mods,
      setModifierEnabled3D: jasmine.createSpy('setModifierEnabled3D'),
      applyModifier3D: jasmine.createSpy('applyModifier3D'),
      removeModifier3D: jasmine.createSpy('removeModifier3D').and.callFake((_: string, i: number) => { mods.splice(i, 1); modes.splice(i, 1); }),
      addSubdivisionModifier3D: jasmine.createSpy('addSubdivisionModifier3D'),
    };
    if (o.mirrorApi) {
      Object.assign(sm, {
        addMirrorFromFace3D: jasmine.createSpy('addMirrorFromFace3D').and.callFake(() => { mods.push({ type: 'mirror', enabled: true }); modes.push('face'); return mods.length - 1; }),
        addMirrorBisect3D: jasmine.createSpy('addMirrorBisect3D').and.callFake(() => { mods.push({ type: 'mirror', enabled: true }); modes.push('bisect'); return mods.length - 1; }),
        getMirrorPlane3D: (_: string, i: number) => (modes[i] ? { mode: modes[i], point: [0, 0, 0], normal: [-1, 0, 0] } : null),
        flipMirrorSide3D: jasmine.createSpy('flipMirrorSide3D').and.returnValue(true),
        setMirrorPlaneHandle3D: jasmine.createSpy('setMirrorPlaneHandle3D'),
      });
    }
    const meshEdit: any = {
      selectionMode: 'face', tool: 'select', bgMode: 'gradient', params: { loopCutCount: 1, loopCutPosition: 0.5 },
      get selection() { return sel; },
      setTool: jasmine.createSpy('setTool').and.callFake((t: string) => { meshEdit.tool = t; }),
      runVerb: jasmine.createSpy('runVerb').and.returnValue(true),
      setSelectionMode: jasmine.createSpy('setSelectionMode'),
      deselectAll: jasmine.createSpy('deselectAll'),
      setBgMode: jasmine.createSpy('setBgMode'),
    };
    const ed: any = { shapeManager: sm, meshEdit, editorState: { scene3dSelectedMeshId: 'm1' }, scene3dUndo: () => undefined, scene3dMarkDirty: () => undefined };
    const c = TestBed.runInInjectionContext(() => new MeshEditPropsComponent());
    c.ed = ed;
    c.ngDoCheck();
    return { c, sm, meshEdit, sel, mods };
  }

  it('Proportional: shows the settings saved on the mesh when the panel opens / the mesh changes', () => {
    const { c, sm } = setup();
    expect(c.proportionalEnabled).toBeFalse();                    // no editable mesh API: the defaults
    const meshes: Record<string, any> = {
      m1: { proportionalEditEnabled: true, proportionalEditRadius: 2.5, proportionalEditFalloff: 'sharp' },
      m2: { proportionalEditEnabled: false, proportionalEditRadius: 0.5, proportionalEditFalloff: 'linear' },
    };
    sm.getEditMesh3D = (id: string) => meshes[id] ?? null;
    sm.setProportionalEdit3D = jasmine.createSpy('setProportionalEdit3D');
    c.ngDoCheck();
    expect(c.proportionalEnabled).toBeTrue();
    expect(c.proportionalRadius).toBe(2.5);
    expect(c.proportionalFalloff).toBe('sharp');
    c.setProportional(false);                                      // the user's change sticks (same mesh: no re-read)
    c.ngDoCheck();
    expect(c.proportionalEnabled).toBeFalse();
    expect(sm.setProportionalEdit3D).toHaveBeenCalledWith('m1', false, 2.5, 'sharp');
    c.ed.editorState.scene3dSelectedMeshId = 'm2';
    c.ngDoCheck();
    expect(c.proportionalEnabled).toBeFalse();
    expect(c.proportionalRadius).toBe(0.5);
    expect(c.proportionalFalloff).toBe('linear');
  });

  it('tools: a tool goes on, tapping it again turns it off; a verb runs once; a greyed one does nothing', () => {
    const { c, meshEdit, sel } = setup();
    const extrude = c.tools.find(t => t.id === 'extrude')!;
    c.tapTool(extrude);
    expect(meshEdit.tool).toBe('extrude');
    c.tapTool(extrude);
    expect(meshEdit.tool).toBe('select');
    c.tapTool(c.tools.find(t => t.id === 'delete')!);   // nothing selected: greyed
    expect(meshEdit.runVerb).not.toHaveBeenCalled();
    sel.faces.push(2);
    c.tapTool(c.tools.find(t => t.id === 'delete')!);
    expect(meshEdit.runVerb).toHaveBeenCalledOnceWith('delete');
  });

  it('+ Mirror: Use Face only with exactly one face selected; Bisect Mesh always (needs the engine API)', () => {
    const old = setup();
    expect(old.c.canMirrorFace).toBeFalse();
    expect(old.c.hasMirrorBisect).toBeFalse();
    expect(old.c.mirrorFaceTitle).toContain('engine');
    const two = setup({ mirrorApi: true, faces: [1, 2] });
    expect(two.c.canMirrorFace).toBeFalse();
    expect(two.c.mirrorFaceTitle).toBe('Select exactly one face first');
    const one = setup({ mirrorApi: true, faces: [4] });
    expect(one.c.canMirrorFace).toBeTrue();
    one.c.mirrorChoice = true;
    one.c.addMirrorFace();
    expect(one.sm.addMirrorFromFace3D).toHaveBeenCalledOnceWith('m1', 4);
    expect(one.c.mirrorChoice).toBeFalse();
    expect(one.c.modifiers.length).toBe(1);
    expect(one.c.isPlaneMirror(one.c.modifiers[0])).toBeTrue();
    expect(one.c.label(one.c.modifiers[0])).toBe('Mirror');
  });

  it('a plane mirror card: Rotate plane shows / hides the handle, picking a tool hides it, Flip side, Bake', () => {
    const { c, sm, meshEdit } = setup({ mirrorApi: true });
    c.addMirrorBisect();
    const m = c.modifiers[0];
    c.toggleRotatePlane(m);
    expect(sm.setMirrorPlaneHandle3D).toHaveBeenCalledWith('m1', 0);
    expect(c.rotatingMirror).toBe(0);
    meshEdit.tool = 'move';
    c.ngDoCheck();
    expect(sm.setMirrorPlaneHandle3D).toHaveBeenCalledWith('m1', null);
    expect(c.rotatingMirror).toBeNull();
    c.flipSide(m);
    expect(sm.flipMirrorSide3D).toHaveBeenCalledOnceWith('m1', 0);
    c.bakeModifier(m);
    expect(sm.applyModifier3D).toHaveBeenCalledOnceWith('m1', 0);
  });

  it('Use Face with the engine pick: enabled with no face selected; tapping it arms "tap a face" (pressed)', () => {
    const { c, meshEdit } = setup({ mirrorApi: true, faces: [] });
    Object.assign(meshEdit, {
      mirrorFacePicking: false, mirrorFacePickSupported: true,
      useMirrorFace: jasmine.createSpy('useMirrorFace').and.callFake(() => {
        meshEdit.mirrorFacePicking = !meshEdit.mirrorFacePicking;
        return meshEdit.mirrorFacePicking ? 'armed' : 'cancelled';
      }),
      cancelMirrorFacePick: jasmine.createSpy('cancelMirrorFacePick').and.callFake(() => {
        const was = meshEdit.mirrorFacePicking; meshEdit.mirrorFacePicking = false; return was;
      }),
    });
    expect(c.canMirrorFace).toBeTrue();
    expect(c.mirrorFaceTitle).toBe('Mirror the mesh across a face');
    c.mirrorChoice = true;
    c.addMirrorFace();
    expect(c.mirrorFacePicking).toBeTrue();
    expect(c.mirrorChoice).toBeTrue();                   // still open while it waits for the tap
    c.addMirrorFace();                                   // the button again: cancelled
    expect(c.mirrorFacePicking).toBeFalse();
    c.addMirrorFace();
    c.addSubdivision(1);                                 // another modifier button cancels it
    expect(c.mirrorFacePicking).toBeFalse();
    c.addMirrorFace();
    c.toggleMirrorChoice();                              // closing + Mirror too
    expect(c.mirrorFacePicking).toBeFalse();
  });

  it('an old X / Y / Z mirror shows On / Bake / ✕ only (no plane controls)', () => {
    const { c, mods } = setup({ mirrorApi: true });
    mods.push({ type: 'mirror', enabled: true, axis: 'y' });
    c.ngDoCheck();
    expect(c.isPlaneMirror(c.modifiers[0])).toBeFalse();
    expect(c.label(c.modifiers[0])).toBe('Mirror Y');
  });
});
