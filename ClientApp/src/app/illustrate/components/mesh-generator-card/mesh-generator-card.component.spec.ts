import { NgZone } from '@angular/core';
import { MeshGeneratorCardComponent } from './mesh-generator-card.component';

/** Edit Mesh › Modifiers, the generator card: shows while the settings apply, live steps once per frame, ONE commit per
 *  change, Bake, follows the engine (a hand edit hides it, an undo brings it / its values back). */
describe('MeshGeneratorCardComponent', () => {
  function setup(o: { api?: boolean } = {}) {
    const state = { applies: true, params: { radius: 0.3, radiusTop: 0.3, height: 0.8, segments: 12 } as Record<string, any> };
    const sm: any = { getMesh3D: () => ({ generatorApplies: state.applies }) };
    if (o.api !== false) {
      Object.assign(sm, {
        getMeshGenerator3D: () => (state.applies ? { type: 'cylinder', params: JSON.parse(JSON.stringify(state.params)) } : null),
        setMeshGenerator3D: jasmine.createSpy('set').and.callFake((_id: string, p: any) => { if (!state.applies) return false; state.params = { ...p }; return true; }),
        bakeMeshGenerator3D: jasmine.createSpy('bake').and.callFake(() => { state.applies = false; return true; }),
      });
    }
    const meshEdit: any = { cancelPreview: jasmine.createSpy('cancelPreview'), cancelMirrorFacePick: jasmine.createSpy('cancelPick') };
    const ed: any = { shapeManager: sm, meshEdit, editorState: { scene3dSelectedMeshId: 'm1' }, scene3dMarkDirty: jasmine.createSpy('dirty') };
    const c = new MeshGeneratorCardComponent(new NgZone({ enableLongStackTrace: false }));
    c.ed = ed;
    c.ngDoCheck();
    return { c, sm, ed, state, meshEdit };
  }

  it('shows the settings while they apply; none on an engine without them', () => {
    expect(setup().c.gen?.type).toBe('cylinder');
    expect(setup({ api: false }).c.gen).toBeNull();
  });

  it('a slider drag: live steps (no undo step) once per frame, then ONE commit on release', () => {
    const frames: FrameRequestCallback[] = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => frames.push(cb));
    const { c, sm, ed, meshEdit } = setup();
    c.num('radius', 0.5);
    c.num('radius', 0.6);
    expect(sm.setMeshGenerator3D).not.toHaveBeenCalled();
    expect(meshEdit.cancelPreview).toHaveBeenCalledTimes(1);   // a running tool preview ends first
    expect(frames.length).toBe(1);   // one frame for both steps
    frames[0](0);
    expect(sm.setMeshGenerator3D).toHaveBeenCalledTimes(1);
    expect(sm.setMeshGenerator3D.calls.mostRecent().args[1].radius).toBe(0.6);
    expect(sm.setMeshGenerator3D.calls.mostRecent().args[2]).toEqual({ commit: false });
    c.commit();
    expect(sm.setMeshGenerator3D.calls.mostRecent().args[2]).toEqual({ commit: true });
    expect(ed.scene3dMarkDirty).toHaveBeenCalled();
  });

  it('buttons commit at once (Cone sets the top radius to 0)', () => {
    const { c, sm, state } = setup();
    c.cone();
    expect(sm.setMeshGenerator3D).toHaveBeenCalledTimes(1);
    expect(state.params['radiusTop']).toBe(0);
    expect(c.p['radiusTop']).toBe(0);
  });

  it('follows the engine: a hand edit hides the card, its undo brings it back; an undo of a change re-reads the values', () => {
    const { c, state } = setup();
    state.applies = false;
    c.ngDoCheck();
    expect(c.gen).toBeNull();
    state.applies = true;
    c.ngDoCheck();
    expect(c.gen?.params['radius']).toBe(0.3);
    state.params = { ...state.params, radius: 1.5 };   // an undo / redo of a settings change
    c.ngDoCheck();
    expect(c.p['radius']).toBe(1.5);
  });

  it('Bake drops the settings (one engine call) and the card goes', () => {
    const { c, sm, ed } = setup();
    c.bake();
    expect(sm.bakeMeshGenerator3D).toHaveBeenCalledOnceWith('m1');
    expect(ed.scene3dMarkDirty).toHaveBeenCalled();
    expect(c.gen).toBeNull();
  });

  it('another mesh selected mid-drag: the pending change lands on ITS mesh as its undo step', () => {
    const { c, sm, ed } = setup();
    c.num('height', 2);
    ed.editorState.scene3dSelectedMeshId = 'm2';
    c.ngDoCheck();
    const call = sm.setMeshGenerator3D.calls.mostRecent();
    expect(call.args[0]).toBe('m1');
    expect(call.args[2]).toEqual({ commit: true });
  });

  it('Circle: flat (no Height) for a new circle; an older circle saved with a height keeps the slider, even at 0', () => {
    const { c, state } = setup();
    const sm = c.ed.shapeManager as any;
    let type = 'circle';
    sm.getMeshGenerator3D = () => (state.applies ? { type, params: JSON.parse(JSON.stringify(state.params)) } : null);
    state.params = { radius: 0.5, segments: 16, height: 0 };
    (c.ed.editorState as any).scene3dSelectedMeshId = 'flat';
    c.ngDoCheck();
    expect(c.gen?.type).toBe('circle');
    expect(c.showCircleHeight).toBeFalse();
    state.params = { radius: 0.5, segments: 16, height: 0.2 };
    (c.ed.editorState as any).scene3dSelectedMeshId = 'old';
    c.ngDoCheck();
    expect(c.showCircleHeight).toBeTrue();
    state.params = { ...state.params, height: 0 };   // dragged to 0: the slider stays for this mesh
    c.load();
    expect(c.showCircleHeight).toBeTrue();
    type = 'cylinder';
    (c.ed.editorState as any).scene3dSelectedMeshId = 'other';
    c.ngDoCheck();
    expect(c.showCircleHeight).toBeFalse();
  });
});
