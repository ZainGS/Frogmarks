import {
  ANIM_TOOLS, ARM_SEGMENTS, ARM_WORKSPACE_KEY, ArmOpState, ArmTimelineGuard, ArmToolCtx, RIG_TOOLS, WEIGHT_NEEDS_BIND,
  armMenuItems, armRadialItems, buildArmOpPill, followClassicArmature, loadArmWorkspace, saveArmWorkspace, segmentForTool,
  switchArmTool, toolForSegment, toolForWorkspace,
} from './armature-mode.logic';
import { ARMATURE_KEYS, armatureKeyLabels } from '../illustration/mode-keymap';
import { NEEDS_ENGINE } from '../armature-panel/arm-engine';

/** UI review 2026-10-07 §4: the Armature mode chrome's decisions (tools → engine, pills, radial, menu, workspace). */
describe('Armature mode chrome logic', () => {
  function ctx(o: { newApi?: boolean; toolOk?: boolean; skeleton?: boolean; bound?: boolean; painting?: () => boolean } = {}) {
    let painting = false;
    const sm: any = {
      isWeightPainting3D: o.painting ?? (() => painting),
    };
    if (o.newApi) {
      sm.setArmatureActiveTool3D = jasmine.createSpy('setArmatureActiveTool3D').and.callFake((t: string) => {
        const ok = o.toolOk ?? true;
        if (ok && t === 'weight') painting = true;
        return ok;
      });
    }
    const rig = {
      activeSkeleton: o.skeleton === false ? null : { id: 's1', name: 'Rig' },
      placementModeActive: false,
      setToolMode: jasmine.createSpy('setToolMode'),
      enterPlacement: jasmine.createSpy('enterPlacement').and.callFake(() => { rig.placementModeActive = true; }),
      cancelPlacement: jasmine.createSpy('cancelPlacement').and.callFake(() => { rig.placementModeActive = false; }),
    };
    const binding = {
      wpActive: false,
      bindMeshId: o.bound === false ? '' : 'm1',
      enterWeightPaint: jasmine.createSpy('enterWeightPaint').and.callFake(() => { binding.wpActive = true; painting = true; }),
      exitWeightPaint: jasmine.createSpy('exitWeightPaint').and.callFake(() => { binding.wpActive = false; painting = false; }),
      onWpBrushChange: jasmine.createSpy('onWpBrushChange'),
    };
    return { sm, rig, binding, c: { sm, rig, binding } as unknown as ArmToolCtx };
  }

  describe('tool → engine', () => {
    it('a newer Salsa takes every tool (Key = select); Rotate / Move also keep the legacy tool mode', () => {
      const { sm, rig, c } = ctx({ newApi: true });
      for (const [from, to] of [['rotate', 'select'], ['select', 'move'], ['move', 'addbone'], ['addbone', 'ik'], ['ik', 'key']] as const) {
        expect(switchArmTool(c, from, to).ok).toBeTrue();
      }
      expect(sm.setArmatureActiveTool3D.calls.allArgs()).toEqual([['select'], ['move'], ['addbone'], ['ik'], ['select']]);
      expect(rig.setToolMode.calls.allArgs()).toEqual([['move']]);
      expect(rig.enterPlacement).not.toHaveBeenCalled();   // the engine keeps placing for Add Bone
    });

    it('the old dist: Rotate / Move = the tool mode, Add Bone = one placement, others the Rotate gizmo', () => {
      const { rig, c } = ctx();
      switchArmTool(c, 'rotate', 'move');
      switchArmTool(c, 'move', 'select');
      switchArmTool(c, 'select', 'addbone');
      expect(rig.setToolMode.calls.allArgs()).toEqual([['move'], ['rotate'], ['rotate']]);
      expect(rig.enterPlacement).toHaveBeenCalledTimes(1);
      switchArmTool(c, 'addbone', 'ik');
      expect(rig.cancelPlacement).toHaveBeenCalledTimes(1);   // leaving Add Bone stops placing
    });

    it('Weight Brush: the engine enters weight paint (brush applied); leaving it exits', () => {
      const { sm, binding, c } = ctx({ newApi: true });
      expect(switchArmTool(c, 'rotate', 'weight')).toEqual({ ok: true });
      expect(sm.setArmatureActiveTool3D).toHaveBeenCalledWith('weight');
      expect(binding.wpActive).toBeTrue();
      expect(binding.onWpBrushChange).toHaveBeenCalled();
      expect(binding.enterWeightPaint).not.toHaveBeenCalled();
      switchArmTool(c, 'weight', 'rotate');
      expect(binding.exitWeightPaint).toHaveBeenCalledTimes(1);
    });

    it('Weight Brush: the engine refusing it falls back to the panel weight paint; with nothing bound it fails with why', () => {
      const a = ctx({ newApi: true, toolOk: false });
      expect(switchArmTool(a.c, 'rotate', 'weight').ok).toBeTrue();
      expect(a.binding.enterWeightPaint).toHaveBeenCalledTimes(1);

      const b = ctx({ bound: false });
      expect(switchArmTool(b.c, 'rotate', 'weight')).toEqual({ ok: false, reason: WEIGHT_NEEDS_BIND });
    });

    it('Add Bone / Weight need a skeleton', () => {
      const { c } = ctx({ skeleton: false });
      expect(switchArmTool(c, 'rotate', 'addbone').ok).toBeFalse();
      expect(switchArmTool(c, 'rotate', 'weight').ok).toBeFalse();
    });
  });

  describe('segments / workspaces', () => {
    it('Pose / Edit Bones / Weight pick Rotate / Move / Weight Brush and follow the strip', () => {
      expect(ARM_SEGMENTS.map(s => s.id)).toEqual(['pose', 'edit', 'weight']);
      expect(['pose', 'edit', 'weight'].map(s => toolForSegment(s as never))).toEqual(['rotate', 'move', 'weight']);
      expect(segmentForTool('ik', 'edit')).toBe('pose');
      expect(segmentForTool('addbone', 'pose')).toBe('edit');
      expect(segmentForTool('select', 'weight')).toBe('weight');   // Select keeps the last one
    });

    it('Rig has rigging tools, Animate posing + Key; a switch keeps the tool when it exists there', () => {
      expect(RIG_TOOLS.map(t => t.id)).toEqual(['select', 'rotate', 'move', 'addbone', 'ik', 'weight']);
      expect(ANIM_TOOLS.map(t => t.id)).toEqual(['select', 'rotate', 'move', 'key']);
      expect(toolForWorkspace('animate', 'weight')).toBe('rotate');
      expect(toolForWorkspace('animate', 'move')).toBe('move');
      expect(toolForWorkspace('rig', 'key')).toBe('rotate');
    });

    it('the tool strip key chips + hints come from the Armature keymap', () => {
      const k = armatureKeyLabels();
      const byId = (id: string) => RIG_TOOLS.find(t => t.id === id)!;
      expect(byId('select').key).toBe(k.select);
      expect(byId('rotate').key).toBe(k.rotate);
      expect(byId('move').key).toBe(k.move);
      expect(byId('addbone').key).toBe(k.addBone);
      expect(byId('ik').key).toBe(k.ik);
      expect(byId('weight').key).toBe(k.weight);
      expect(ANIM_TOOLS.find(t => t.id === 'key')!.key).toBe(k.key);
      expect(ARM_SEGMENTS.map(s => s.key)).toEqual([k.pose, k.editBones, k.weightMode]);
      expect(k.rotate).toBe(ARMATURE_KEYS.rotate.keys[0].toUpperCase());
      for (const t of [...RIG_TOOLS, ...ANIM_TOOLS]) expect(t.hint.length).toBeGreaterThan(5);
    });

    it('remembers the workspace (and survives blocked storage)', () => {
      const store = new Map<string, string>();
      const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
      expect(loadArmWorkspace(storage)).toBe('rig');
      saveArmWorkspace('animate', storage);
      expect(store.get(ARM_WORKSPACE_KEY)).toBe('animate');
      expect(loadArmWorkspace(storage)).toBe('animate');
      const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
      expect(loadArmWorkspace(blocked)).toBe('rig');
      expect(() => saveArmWorkspace('rig', blocked)).not.toThrow();
    });
  });

  describe('timeline guard', () => {
    function timeline(on: boolean) {
      const t = { on, set: jasmine.createSpy('set').and.callFake((v: boolean) => { t.on = v; }) };
      return t;
    }

    it('Animate shows the timeline and leaving puts it back off', () => {
      const t = timeline(false), g = new ArmTimelineGuard();
      g.enter(() => t.on, t.set);
      expect(t.on).toBeTrue();
      expect(g.active).toBeTrue();
      g.leave(() => t.on, t.set);
      expect(t.on).toBeFalse();
      expect(g.active).toBeFalse();
    });

    it('a timeline the user already had open stays open; re-entering keeps the first remembered state', () => {
      const t = timeline(true), g = new ArmTimelineGuard();
      g.enter(() => t.on, t.set);
      expect(t.set).not.toHaveBeenCalled();
      g.leave(() => t.on, t.set);
      expect(t.on).toBeTrue();

      const t2 = timeline(false), g2 = new ArmTimelineGuard();
      g2.enter(() => t2.on, t2.set);
      g2.enter(() => t2.on, t2.set);   // second enter: still remembers "off"
      g2.leave(() => t2.on, t2.set);
      expect(t2.on).toBeFalse();
      g2.leave(() => t2.on, t2.set);    // nothing remembered: no-op
      expect(t2.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('operation pill', () => {
    function state(o: Partial<ArmOpState> = {}): ArmOpState {
      return {
        workspace: 'rig', hasSkeleton: true,
        joints: [{ name: 'hips' }, { name: 'spine' }, { name: 'hand_L' }],
        selectedIdx: 2, selectionCount: 1, axis: null, rotateDeg: 0, moveAmount: 0,
        newBoneName: '', placing: false,
        ik: { exists: false, enabled: false, chainLength: 3, poleJointIdx: null, intermediate: false },
        hasPoleApi: true, pickArmed: null,
        weight: { active: true, mode: 'add', radius: 0.15, strength: 0.5, weight: 1 },
        clips: [], clipIdx: null, keyFrame: 0, renameIdx: null, renameDraft: '',
        ...o,
      };
    }
    const ids = (p: ReturnType<typeof buildArmOpPill>) => p!.params.map(x => x.id);

    it('Select has no pill', () => {
      expect(buildArmOpPill('select', state())).toBeNull();
    });

    it('Rotate / Move: axis chips + a typed amount (disabled until an axis is picked), Apply / Cancel', () => {
      const rot = buildArmOpPill('rotate', state())!;
      expect(rot.showApplyCancel).toBeTrue();
      expect(ids(rot)).toEqual(['axis', 'rotateDeg']);
      expect(rot.params[0].kind).toBe('axis');
      expect(rot.params[1].disabled).toBeTrue();
      expect(rot.note).toContain('hand_L');
      const move = buildArmOpPill('move', state({ axis: 'y', selectionCount: 3 }))!;
      expect(ids(move)).toEqual(['axis', 'moveAmount']);
      expect(move.params[1].disabled).toBeFalse();
      expect(move.note).toContain('3 joints');
      expect(buildArmOpPill('rotate', state({ selectedIdx: null }))!.params.every(p => p.disabled)).toBeTrue();
    });

    it('Add Bone: name + "Add child to <joint>" + tap to place', () => {
      const p = buildArmOpPill('addbone', state())!;
      expect(ids(p)).toEqual(['newBoneName', 'addChild', 'placing']);
      expect(p.params[0].kind).toBe('text');
      expect(p.params[1].label).toBe('Add child to hand_L');
      expect(buildArmOpPill('addbone', state({ selectedIdx: null }))!.params[1].label).toBe('Add root bone');
    });

    it('IK: on, chain length, pole joint by dropdown or a tap; pole needs the engine update on an old dist', () => {
      const off = buildArmOpPill('ik', state())!;
      expect(ids(off)).toEqual(['ikEnabled', 'ikChainLength', 'ikPole', 'pickPole']);
      expect(off.params[2].disabled).toBeTrue();   // no chain yet
      const on = buildArmOpPill('ik', state({ ik: { exists: true, enabled: true, chainLength: 2, poleJointIdx: 0, intermediate: false } }))!;
      expect(on.params[0].value).toBeTrue();
      expect(on.params[1]).toEqual(jasmine.objectContaining({ kind: 'int', value: 2, min: 2 }));
      expect(on.params[2].value).toBe('0');
      expect(on.params[2].options!.map(o => o.label)).toEqual(['None', 'hips', 'spine']);   // never the joint itself
      const old = buildArmOpPill('ik', state({ hasPoleApi: false, ik: { exists: true, enabled: true, chainLength: 3, poleJointIdx: null, intermediate: false } }))!;
      expect(old.params[2].disabled).toBeTrue();
      expect(old.params[3].title).toBe(NEEDS_ENGINE);
      expect(old.params[0].disabled).toBeFalse();   // on / off + length still work on the old dist
      expect(buildArmOpPill('ik', state({ pickArmed: 'ik-pole', ik: { exists: true, enabled: true, chainLength: 3, poleJointIdx: null, intermediate: false } }))!
        .params[3].label).toBe('Tap a joint…');
    });

    it('Weight Brush: joint, Pick, Add / Remove / Set, radius, strength (+ weight for Set)', () => {
      const p = buildArmOpPill('weight', state())!;
      expect(ids(p)).toEqual(['wpJoint', 'pickJoint', 'wpMode', 'wpRadius', 'wpStrength']);
      expect(p.params[0].value).toBe('2');
      expect(p.params[2].options!.map(o => o.id)).toEqual(['add', 'remove', 'set']);
      expect(ids(buildArmOpPill('weight', state({ weight: { active: true, mode: 'set', radius: 0.1, strength: 1, weight: 0.4 } })))).toContain('wpWeight');
      expect(buildArmOpPill('weight', state({ weight: { active: false, mode: 'add', radius: 0.1, strength: 1, weight: 1 } }))!.note).toBe(WEIGHT_NEEDS_BIND);
    });

    it('Key: the clip by name, the frame, Key pose', () => {
      const none = buildArmOpPill('key', state())!;
      expect(none.params.find(p => p.id === 'keyPose')!.disabled).toBeTrue();
      const p = buildArmOpPill('key', state({ clips: [{ id: 'c1', name: 'Walk' }, { id: 'c2', name: 'Run' }], clipIdx: 1, keyFrame: 12 }))!;
      expect(ids(p)).toEqual(['keyClip', 'keyFrame', 'keyPose']);
      expect(p.params[0].options!.map(o => o.label)).toEqual(['Walk', 'Run']);
      expect(p.params[0].value).toBe('1');
      expect(p.params[1].value).toBe(12);
      expect(p.params[2].disabled).toBeFalse();
    });

    it('a pending Rename takes the pill over', () => {
      const p = buildArmOpPill('rotate', state({ renameIdx: 1, renameDraft: 'chest' }))!;
      expect(p.title).toBe('Rename joint');
      expect(p.params).toEqual([jasmine.objectContaining({ id: 'renameDraft', kind: 'text', value: 'chest' })]);
    });
  });

  describe('radial + menu', () => {
    it('Rig: Add Child / IK / Rename / Frame / Delete (danger); IK off inside a chain', () => {
      const items = armRadialItems({ hasIK: false, intermediate: false, workspace: 'rig' });
      expect(items.map(i => i.id)).toEqual(['child', 'ik', 'rename', 'frame', 'delete']);
      expect(items.find(i => i.id === 'delete')!.danger).toBeTrue();
      expect(armRadialItems({ hasIK: true, intermediate: true, workspace: 'rig' }).find(i => i.id === 'ik'))
        .toEqual(jasmine.objectContaining({ label: 'IK settings', disabled: true }));
    });

    it('Animate: no rigging items', () => {
      expect(armRadialItems({ hasIK: false, intermediate: false, workspace: 'animate' }).map(i => i.id)).toEqual(['key', 'frame', 'rotate']);
    });

    it('⋯ menu: the background (checked), refresh, shortcuts; Copy for Claude only with the developer buttons', () => {
      const m = armMenuItems({ bgMode: 'dim', devTools: false });
      expect(m.filter(i => i.checked).map(i => i.id)).toEqual(['bg:dim']);
      expect(m.map(i => i.id)).toContain('shortcuts');
      expect(m.map(i => i.id)).not.toContain('copyForClaude');
      expect(armMenuItems({ bgMode: 'dim', devTools: true }).map(i => i.id)).toContain('copyForClaude');
    });
  });

  describe('classic fallback switch', () => {
    it('useModeChrome.armature reads ON unless Classic Armature panel is on; writing it flips the setting', () => {
      const exp = { classicArmature: false, toggleClassicArmature() { this.classicArmature = !this.classicArmature; } };
      const switches: { meshEdit: boolean; armature: boolean } = { meshEdit: true, armature: false };
      const sw = followClassicArmature(switches, exp);
      expect(sw.armature).toBeTrue();
      exp.toggleClassicArmature();
      expect(sw.armature).toBeFalse();
      sw.armature = true;
      expect(exp.classicArmature).toBeFalse();
      sw.armature = false;
      expect(exp.classicArmature).toBeTrue();
      expect(sw.meshEdit).toBeTrue();   // the other switch untouched
    });
  });
});
