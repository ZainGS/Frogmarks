import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ArmatureModeComponent } from './armature-mode.component';
import { ARM_WORKSPACE_KEY } from './armature-mode.logic';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';
import { NotifyService } from 'app/shared/services/notify/notify.service';
import { TouchUiService } from '../../services/touch-ui.service';
import { EXP_CLASSIC_ARMATURE_KEY, ExperimentalSettingsService } from '../../services/experimental-settings.service';
import { ARMATURE_KEYS, ArmatureKeyTarget, dispatchModeKey } from '../illustration/mode-keymap';

/** A fake engine with what an Armature session calls on the OLD dist; `newApi` adds the UI review §4 calls. */
function fakeEngine(o: { newApi?: boolean } = {}) {
  const joints = [
    { index: 0, name: 'hips', parentIndex: -1, localPosition: [0, 1, 0], tailOffset: [0, 0.3, 0], isLeaf: false },
    { index: 1, name: 'spine', parentIndex: 0, localPosition: [0, 0.3, 0], tailOffset: [0, 0.3, 0], isLeaf: false },
    { index: 2, name: 'hand_L', parentIndex: 1, localPosition: [0, 0.3, 0], tailOffset: [0, 0.2, 0], isLeaf: true },
  ];
  let anim = false;
  let selected: number | null = null;
  let painting = false;
  const sm: any = {
    interactionService: { onSceneGraphChanged: { subscribe: () => ({ unsubscribe() {} }) } },
    getAllMeshes3D: () => [{ id: 'm1', name: 'Body' }],
    enterArmatureMode3D: jasmine.createSpy('enterArmatureMode3D'),
    setArmatureBgMode3D: jasmine.createSpy('setArmatureBgMode3D'),
    setArmatureToolMode3D: jasmine.createSpy('setArmatureToolMode3D'),
    getAllSkeletons3D: () => [{ id: 's1', name: 'Rig' }],
    getSkeletonIdForMesh3D: () => 's1',
    showBoneOverlay3D: jasmine.createSpy('showBoneOverlay3D'),
    getSkeletonJoints3D: () => joints,
    getIKChains3D: () => [],
    getJointConstraints3D: () => [],
    getSpringChains3D: () => [],
    getSkeletonClips3D: () => [{ id: 'c1', name: 'Walk' }],
    getNLATracks3D: () => [],
    getPoses3D: () => [],
    getBodyPoseNames3D: () => Promise.resolve([]),
    getAnimationLibrary3D: () => [],
    isBonePlacementModeActive3D: () => false,
    isWeightPainting3D: () => painting,
    setWeightPaintBrush: jasmine.createSpy('setWeightPaintBrush'),
    enterWeightPaintMode3D: jasmine.createSpy('enterWeightPaintMode3D').and.callFake(() => { painting = true; return true; }),
    getSelectedJointIndex3D: () => selected,
    getSelectedJointIsTail3D: () => false,
    selectJoint3D: jasmine.createSpy('selectJoint3D').and.callFake((i: number | null) => { selected = i; }),
    getJointRotation3D: () => [0, 0, 0, 1],
    setJointRotation3D: jasmine.createSpy('setJointRotation3D'),
    exitWeightPaintMode3D: jasmine.createSpy('exitWeightPaintMode3D').and.callFake(() => { painting = false; }),
    exitBonePlacementMode3D: jasmine.createSpy('exitBonePlacementMode3D'),
    enterBonePlacementMode3D: jasmine.createSpy('enterBonePlacementMode3D'),
    isProceduralBodySkeleton3D: () => true,
    isAnimationEnabled: () => anim,
    removeBone3D: jasmine.createSpy('removeBone3D'),
    addIKChain3D: jasmine.createSpy('addIKChain3D'),
    addBone3D: jasmine.createSpy('addBone3D').and.returnValue(3),
    setJointTailOffset3D: jasmine.createSpy('setJointTailOffset3D'),
    recordSkeletonPose3D: jasmine.createSpy('recordSkeletonPose3D'),
    getJointScreenPositions3D: () => [{ index: 0, name: 'hips', x: 50, y: 50 }, { index: 1, name: 'spine', x: 100, y: 100 }, { index: 2, name: 'hand_L', x: 200, y: 40 }],
    fitArtboard: jasmine.createSpy('fitArtboard'),
  };
  if (o.newApi) {
    sm.pickArmatureJointAt3D = jasmine.createSpy('pickArmatureJointAt3D').and.returnValue({ skeletonId: 's1', jointIndex: 1, jointName: 'spine' });
    sm.selectArmatureJoint3D = jasmine.createSpy('selectArmatureJoint3D').and.callFake((_s: string, i: number) => { selected = i; return true; });
    sm.getSelectedArmatureJoints3D = () => (selected === null ? [] : [{ skeletonId: 's1', jointIndex: selected }]);
    sm.onArmatureJointSelectionChanged = () => () => {};
    sm.setArmatureActiveTool3D = jasmine.createSpy('setArmatureActiveTool3D').and.callFake((t: string) => { painting = t === 'weight'; return true; });
    sm.addArmatureChildJoint3D = jasmine.createSpy('addArmatureChildJoint3D').and.returnValue(3);
    sm.setArmatureIK3D = jasmine.createSpy('setArmatureIK3D').and.returnValue('ik1');
    sm.getArmatureIK3D = () => null;
  }
  const animation = { setAnimationEnabled: jasmine.createSpy('setAnimationEnabled').and.callFake((on: boolean) => { anim = on; }) };
  return { sm, animation, isAnim: () => anim };
}

describe('ArmatureModeComponent (mode chrome)', () => {
  beforeEach(() => {
    try { localStorage.removeItem(ARM_WORKSPACE_KEY); } catch { /* none */ }
  });

  function create(o: { newApi?: boolean } = {}) {
    const f = fakeEngine(o);
    TestBed.configureTestingModule({
      declarations: [ArmatureModeComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: RasterAnimationService, useValue: f.animation },
        { provide: NotifyService, useValue: { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') } },
        { provide: TouchUiService, useValue: { coarse: true } },
      ],
    });
    const fixture = TestBed.createComponent(ArmatureModeComponent);
    const canvas = document.createElement('div');
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 300, right: 410, bottom: 320, x: 10, y: 20, toJSON() {} }) as DOMRect;
    fixture.componentRef.setInput('shapeManager', f.sm);
    fixture.componentRef.setInput('initialMeshId', 'm1');
    fixture.componentRef.setInput('canvasEl', canvas);
    fixture.detectChanges();
    return { ...f, fixture, cmp: fixture.componentInstance };
  }

  it('enters the armature on the initial mesh and starts in Rig with the Rotate tool', () => {
    const { sm, cmp } = create();
    expect(sm.enterArmatureMode3D).toHaveBeenCalledWith('m1');
    expect(cmp.workspace).toBe('rig');
    expect(cmp.tool).toBe('rotate');
    expect(cmp.subtitle).toBe('Rig · Body');
    expect(cmp.multiLatch).toBeNull();   // the old dist has no additive latch
  });

  it('Animate shows the timeline, Rig / close put it back, and the workspace is remembered', () => {
    const { cmp, animation, isAnim } = create();
    cmp.setWorkspace('animate');
    expect(animation.setAnimationEnabled).toHaveBeenCalledOnceWith(true);
    expect(localStorage.getItem(ARM_WORKSPACE_KEY)).toBe('animate');
    expect(cmp.tools.map(t => t.id)).toContain('key');
    expect(cmp.segments).toEqual([]);
    cmp.setWorkspace('rig');
    expect(isAnim()).toBeFalse();
    cmp.setWorkspace('animate');
    cmp.restoreTimeline();   // the editor's closeArmaturePanel
    expect(isAnim()).toBeFalse();
    expect(animation.setAnimationEnabled.calls.allArgs()).toEqual([[true], [false], [true], [false]]);
  });

  it('a workspace switch drops a tool the new strip lacks (Weight → Rotate)', () => {
    const { cmp } = create({ newApi: true });
    cmp.binding.bindMeshId = 'm1';
    cmp.setTool('weight');
    expect(cmp.tool).toBe('weight');
    expect(cmp.binding.wpActive).toBeTrue();
    cmp.setWorkspace('animate');
    expect(cmp.tool).toBe('rotate');
    expect(cmp.binding.wpActive).toBeFalse();
  });

  it('long-press on a joint (newer Salsa) selects it and opens the radial; Delete asks first', () => {
    const { sm, cmp } = create({ newApi: true });
    expect(cmp.openRadialAt({ clientX: 110, clientY: 120 })).toBeTrue();
    expect(sm.selectArmatureJoint3D).toHaveBeenCalledWith('s1', 1, false);
    expect(cmp.radial.open).toBeTrue();
    expect(cmp.radial.title).toBe('spine');
    expect(cmp.radial.items.map(i => i.id)).toEqual(['child', 'ik', 'rename', 'frame', 'delete']);
    spyOn(cmp, 'confirm').and.returnValue(false);
    cmp.runRadial('delete');
    expect(sm.removeBone3D).not.toHaveBeenCalled();
    cmp.openRadialAt({ clientX: 110, clientY: 120 });
    (cmp.confirm as jasmine.Spy).and.returnValue(true);
    cmp.runRadial('delete');
    expect(sm.removeBone3D).toHaveBeenCalledOnceWith('s1', 1);
  });

  it('long-press on the old dist picks through the projected joint positions; off a joint nothing opens', () => {
    const { sm, cmp } = create();
    expect(cmp.openRadialAt({ clientX: 211, clientY: 61 })).toBeTrue();   // canvas (10, 20) + hand_L (200, 40)
    expect(sm.selectJoint3D).toHaveBeenCalledWith(2);
    expect(cmp.radial.title).toBe('hand_L');
    cmp.closeRadial();
    expect(cmp.openRadialAt({ clientX: 400, clientY: 300 })).toBeFalse();
    expect(cmp.radial.open).toBeFalse();
  });

  it('radial Rename runs through the op pill', () => {
    const { sm, cmp } = create({ newApi: true });
    sm.renameBone3D = jasmine.createSpy('renameBone3D');
    cmp.openRadialAt({ clientX: 110, clientY: 120 });
    cmp.runRadial('rename');
    expect(cmp.opPill!.title).toBe('Rename joint');
    cmp.onParamChange({ id: 'renameDraft', value: 'chest' });
    cmp.onOpApply();
    expect(sm.renameBone3D).toHaveBeenCalledOnceWith('s1', 1, 'chest');
    expect(cmp.opPill!.title).toBe('Rotate');
  });

  it('tool → engine: a newer Salsa gets setArmatureActiveTool3D; the old dist keeps the tool mode', () => {
    const a = create({ newApi: true });
    a.cmp.setTool('select');
    a.cmp.setTool('ik');
    expect(a.sm.setArmatureActiveTool3D.calls.allArgs()).toEqual([['rotate'], ['select'], ['ik']]);
    expect(a.cmp.segment).toBe('pose');
    a.cmp.setSegment('edit');
    expect(a.cmp.tool).toBe('move');
    expect(a.sm.setArmatureToolMode3D).toHaveBeenCalledWith('move');
    TestBed.resetTestingModule();

    const b = create();
    b.cmp.setTool('addbone');
    expect(b.sm.enterBonePlacementMode3D).toHaveBeenCalledWith('s1');
    b.cmp.setTool('move');
    expect(b.sm.exitBonePlacementMode3D).toHaveBeenCalled();
    expect(b.sm.setArmatureToolMode3D).toHaveBeenCalledWith('move');
  });

  it('IK pill: on the old dist "IK on" creates the chain; a newer Salsa uses setArmatureIK3D', () => {
    const a = create();
    a.cmp.rig.selectJoint(2);
    a.cmp.setTool('ik');
    a.cmp.onParamChange({ id: 'ikEnabled', value: true });
    expect(a.sm.addIKChain3D).toHaveBeenCalledOnceWith('s1', 2, 3);
    TestBed.resetTestingModule();

    const b = create({ newApi: true });
    b.cmp.rig.selectJoint(2);
    b.cmp.setTool('ik');
    b.cmp.onParamChange({ id: 'ikEnabled', value: true });
    expect(b.sm.setArmatureIK3D).toHaveBeenCalledOnceWith('s1', 2, { chainLength: 3, enabled: true });
  });

  it('Add Bone pill: "Add child" uses addArmatureChildJoint3D (one undo step), else addBone3D + the tail', () => {
    const a = create({ newApi: true });
    a.cmp.rig.selectJoint(2);
    a.cmp.setTool('addbone');
    a.cmp.onParamChange({ id: 'newBoneName', value: 'finger' });
    a.cmp.onOpAction('addChild');
    expect(a.sm.addArmatureChildJoint3D).toHaveBeenCalledOnceWith('s1', 2, 'finger');
    expect(a.cmp.newBoneName).toBe('');
    TestBed.resetTestingModule();

    const b = create();
    b.cmp.rig.selectJoint(2);
    b.cmp.onOpAction('addChild');
    expect(b.sm.addBone3D).toHaveBeenCalledOnceWith('s1', 2, [0, 0.2, 0], 'joint_3');
    expect(b.sm.setJointTailOffset3D).toHaveBeenCalledOnceWith('s1', 3, [0, 0.2, 0]);
  });

  it('Rotate pill: Apply rotates the selected joint by the typed angle about the axis; Cancel resets', () => {
    const { sm, cmp } = create();
    cmp.rig.selectJoint(1);
    cmp.onParamChange({ id: 'axis', value: 'z' });
    cmp.onParamChange({ id: 'rotateDeg', value: 90 });
    cmp.onOpApply();
    const [sk, idx, q] = sm.setJointRotation3D.calls.mostRecent().args;
    expect([sk, idx]).toEqual(['s1', 1]);
    expect(q[2]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 5);
    cmp.onOpCancel();
    expect(cmp.rotateDeg).toBe(0);
    expect(cmp.axis).toBeNull();
  });

  it('Key tool: keys the pose into the picked clip at the frame', () => {
    const { sm, cmp } = create();
    cmp.setWorkspace('animate');
    cmp.setTool('key');
    expect(cmp.anim.activeClipIdx).toBe(0);   // the first clip is picked
    cmp.onParamChange({ id: 'keyFrame', value: 12 });
    cmp.onOpAction('keyPose');
    expect(sm.recordSkeletonPose3D).toHaveBeenCalledOnceWith('s1', 'c1', 12);
  });

  it('the Armature keys drive the chrome (per workspace) and decline without it', () => {
    const { cmp } = create();
    const key = (k: string) => new KeyboardEvent('keydown', { key: k, cancelable: true });
    const ed: any = { armatureMode: cmp, shapeManager: { canUndo2DShapes: false, canRedo2DShapes: false } };
    dispatchModeKey('armature', ed, key('e'), false);
    expect(cmp.tool).toBe('rotate');
    dispatchModeKey('armature', ed, key('w'), false);
    expect(cmp.tool).toBe('move');
    dispatchModeKey('armature', ed, key('2'), false);
    expect(cmp.segment).toBe('edit');
    cmp.setWorkspace('animate');
    dispatchModeKey('armature', ed, key('b'), false);   // Add Bone is a Rig tool
    expect(cmp.tool).toBe('move');
    dispatchModeKey('armature', ed, key('i'), false);   // I = Key in Animate
    expect(cmp.tool).toBe('key');

    const target: ArmatureKeyTarget = { workspace: 'rig', setTool: jasmine.createSpy('setTool'), setSegment: jasmine.createSpy('seg'), keyPose: jasmine.createSpy('key') };
    const classic: any = { shapeManager: ed.shapeManager };
    expect(() => dispatchModeKey('armature', classic, key('e'), false)).not.toThrow();
    expect(ARMATURE_KEYS.rotate.run({ armatureMode: target } as never)).toBeUndefined();
    expect(target.setTool).toHaveBeenCalledOnceWith('rotate');
    expect(ARMATURE_KEYS.rotate.run(classic)).toBeFalse();
  });
});

describe('Experimental › Classic Armature panel', () => {
  afterEach(() => { try { localStorage.removeItem(EXP_CLASSIC_ARMATURE_KEY); } catch { /* none */ } });

  it('is off by default, and toggling it is stored per machine', () => {
    try { localStorage.removeItem(EXP_CLASSIC_ARMATURE_KEY); } catch { /* none */ }
    const exp = new ExperimentalSettingsService();
    expect(exp.classicArmature).toBeFalse();
    exp.toggleClassicArmature();
    expect(exp.classicArmature).toBeTrue();
    expect(localStorage.getItem(EXP_CLASSIC_ARMATURE_KEY)).toBe('1');
    expect(new ExperimentalSettingsService().classicArmature).toBeTrue();
    exp.toggleClassicArmature();
    expect(localStorage.getItem(EXP_CLASSIC_ARMATURE_KEY)).toBeNull();
  });
});
