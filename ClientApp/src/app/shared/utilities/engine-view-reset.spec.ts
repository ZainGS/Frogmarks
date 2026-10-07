import { legacyResetTo2DView, resetEngineTo2DView } from './engine-view-reset';

/** mobile-parity 7.3c: the engine outlives every route — a free3D camera / Play / Edit Mesh left on by the illustration
 *  editor carried into a board (orbit controller on the board's canvas, 2D pan / zoom blocked). */
describe('resetEngineTo2DView (the plain 2D view for the next screen)', () => {
  it('uses Salsa\'s one-call reset when the build has it (and nothing else)', () => {
    const sm = { resetTo2DEditingView: jasmine.createSpy('resetTo2DEditingView'), setCameraMode3D: jasmine.createSpy('setCameraMode3D') };
    resetEngineTo2DView(sm);
    expect(sm.resetTo2DEditingView).toHaveBeenCalledTimes(1);
    expect(sm.setCameraMode3D).not.toHaveBeenCalled();
  });

  it('falls back to the per-mode exits when the one-call reset throws', () => {
    spyOn(console, 'warn');
    const sm = { resetTo2DEditingView: () => { throw new Error('boom'); },
                 getViewState3D: () => ({ target: 'illustration', cameraMode: 'free3D' }), setCameraMode3D: jasmine.createSpy('setCameraMode3D') };
    resetEngineTo2DView(sm);
    expect(sm.setCameraMode3D).toHaveBeenCalledOnceWith('ortho2D');
  });

  it('ignores a missing engine', () => {
    expect(() => resetEngineTo2DView(null)).not.toThrow();
    expect(() => resetEngineTo2DView(undefined)).not.toThrow();
  });
});

describe('legacyResetTo2DView (older Salsa build: the same reset from the per-mode APIs)', () => {
  /** The engine as the illustration editor leaves it: free3D on the scene target, Play + Edit Mesh on, camera owned. */
  function engineLeftIn3D() {
    const calls: string[] = [];
    const rec = (name: string) => (...args: unknown[]) => { calls.push(args.length ? `${name}(${args.map(a => JSON.stringify(a)).join(',')})` : name); };
    const view = { target: 'scene', cameraMode: 'free3D' };
    const sm = {
      isPlaying3D: true,
      exitPlayMode3D: rec('exitPlay'),
      exitUIPlayerMode: rec('exitUIPlayer'),
      isMeshEditMode3D: true,
      detachMeshEditPointerHandlers: rec('detachMeshEditPointers'),
      exitMeshEditMode3D: rec('exitMeshEdit'),
      closeAllUVEditors3D: rec('closeUV'),
      exitCreatorStage3D: rec('exitCreatorStage'),
      exitCDDesigner3D: rec('exitCD'),
      getBoneOverlaySkeletonId3D: () => 'skel-1',
      showBoneOverlay3D: rec('boneOverlay'),
      scene3d: { exitMeshOrbit3D: rec('exitMeshOrbit') },
      disableTransformControls3D: rec('transformControlsOff'),
      setHoveredMesh3D: rec('hover'),
      getViewState3D: () => ({ ...view }),
      setTarget3D: (t: string) => { view.target = t; calls.push(`target(${JSON.stringify(t)})`); },
      setCameraMode3D: (m: string) => { view.cameraMode = m; calls.push(`cameraMode(${JSON.stringify(m)})`); },
      interactionService: { cameraOwnsView: true },
    };
    return { sm, calls, view };
  }

  it('exits every 3D mode, then sets illustration × ortho2D and hands pan / zoom back to the 2D view', () => {
    const { sm, calls, view } = engineLeftIn3D();
    legacyResetTo2DView(sm);
    expect(calls).toEqual([
      'exitPlay', 'exitUIPlayer', 'detachMeshEditPointers', 'exitMeshEdit', 'closeUV', 'exitCreatorStage', 'exitCD',
      'boneOverlay(null)', 'exitMeshOrbit', 'transformControlsOff', 'hover(null)', 'target("illustration")', 'cameraMode("ortho2D")',
    ]);
    expect(view).toEqual({ target: 'illustration', cameraMode: 'ortho2D' });
    expect(sm.interactionService.cameraOwnsView).toBeFalse();
  });

  it('leaves alone what is already off (not playing, not editing, already ortho2D)', () => {
    const { sm, calls } = engineLeftIn3D();
    sm.isPlaying3D = false;
    sm.isMeshEditMode3D = false;
    sm.getBoneOverlaySkeletonId3D = () => null;
    sm.getViewState3D = () => ({ target: 'illustration', cameraMode: 'ortho2D' });
    legacyResetTo2DView(sm);
    for (const c of ['exitPlay', 'exitMeshEdit', 'boneOverlay(null)', 'target("illustration")', 'cameraMode("ortho2D")']) {
      expect(calls).not.toContain(c);
    }
    expect(sm.interactionService.cameraOwnsView).toBeFalse();
  });

  it('a failing exit does not stop the rest (the view is still reset)', () => {
    spyOn(console, 'warn');
    const { sm, view } = engineLeftIn3D();
    sm.exitPlayMode3D = () => { throw new Error('boom'); };
    sm.exitMeshEditMode3D = () => { throw new Error('boom'); };
    expect(() => legacyResetTo2DView(sm)).not.toThrow();
    expect(view.cameraMode).toBe('ortho2D');
    expect(sm.interactionService.cameraOwnsView).toBeFalse();
  });

  it('a build without closeAllUVEditors3D still exits an active UV paint', () => {
    const exitUVPaintMode3D = jasmine.createSpy('exitUVPaintMode3D');
    legacyResetTo2DView({ isUVPaintActive3D: () => true, exitUVPaintMode3D });
    expect(exitUVPaintMode3D).toHaveBeenCalled();
  });
});
