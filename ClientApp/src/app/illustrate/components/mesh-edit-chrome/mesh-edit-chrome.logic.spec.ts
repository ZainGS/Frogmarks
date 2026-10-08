import {
  DEFAULT_MESH_TOOL_PARAMS, MESH_TOOL_IDS, NEEDS_ENGINE_UPDATE, buildMeshOp, followClassicSetting, lastOpParams, meshChromeCaps,
  meshPanelTools, meshRadialItems, meshToolAppliesTo, planMeshTool, type MeshChromeCaps, type MeshOpInput,
} from './mesh-edit-chrome.logic';

const OLD: MeshChromeCaps = {
  activeTool: false, gizmo: false, bevel: false, knifePoints: false, pick: false, lastOp: false, dragMoves: false,
  multiLoopCut: false, insetDepth: false, additive: false,
};
const NEW: MeshChromeCaps = {
  activeTool: true, gizmo: true, bevel: true, knifePoints: true, pick: true, lastOp: true, dragMoves: true,
  multiLoopCut: true, insetDepth: true, additive: true,
};

function input(o: Partial<MeshOpInput> = {}): MeshOpInput {
  return {
    tool: 'select', caps: NEW, mode: 'face', sel: { vertices: 0, edges: 0, faces: 0 }, params: { ...DEFAULT_MESH_TOOL_PARAMS },
    transform: null, bevel: null, knifePoints: 0, lastOp: null, canBridge: false, ...o,
  };
}

/** UI review 2026-10-07 §4: Edit Mesh on the mode chrome. */
describe('Edit Mesh chrome logic', () => {
  describe('caps', () => {
    it('feature-detects each engine call (the old dist has none of them)', () => {
      expect(meshChromeCaps({})).toEqual(OLD);
      const fn = () => true;
      const sm = {
        setMeshEditActiveTool3D: fn, setMeshEditGizmoMode3D: fn, beginBevel3D: fn, applyMeshEditKnife3D: fn, pickMeshEditElementAt3D: fn,
        getMeshEditLastOp3D: fn, redoMeshEditLastOp3D: fn, setMeshEditDragMovesSelection3D: fn, getMeshEditDragMovesSelection3D: fn,
        loopCuts3D: fn, extrudeRegion3D: fn, setAdditiveSelect3D: fn,
      };
      expect(meshChromeCaps(sm)).toEqual(NEW);
      expect(meshChromeCaps({ ...sm, applyMeshEditKnife3D: undefined }).knifePoints).toBeFalse();
    });
  });

  describe('tool → engine', () => {
    it('a newer Salsa: every tool goes to setMeshEditActiveTool3D; Bevel also starts the Chamfer', () => {
      for (const t of MESH_TOOL_IDS) {
        const plan = planMeshTool(t, NEW, true);
        expect(plan.engineTool).withContext(t).toBe(t);
        expect(plan.legacyKnife).withContext(t).toBeFalse();
        expect(plan.beginTransform).withContext(t).toBeUndefined();
        expect(plan.beginBevel).withContext(t).toBe(t === 'bevel');
      }
    });

    it('the old dist: Move / Rotate / Scale start G / R / S on the selection; the Knife is the drag knife', () => {
      expect(planMeshTool('move', OLD, true)).toEqual({ engineTool: null, legacyKnife: false, beginBevel: false, beginTransform: 'grab' });
      expect(planMeshTool('rotate', OLD, true).beginTransform).toBe('rotate');
      expect(planMeshTool('scale', OLD, true).beginTransform).toBe('scale');
      expect(planMeshTool('move', OLD, false).beginTransform).toBeUndefined();   // nothing selected: nothing to move
      expect(planMeshTool('knife', OLD, true).legacyKnife).toBeTrue();
      expect(planMeshTool('bevel', OLD, true).beginBevel).toBeFalse();            // no Chamfer in that dist
      expect(planMeshTool('extrude', OLD, true)).toEqual({ engineTool: null, legacyKnife: false, beginBevel: false });
    });

    it('an intermediate dist (selection gizmo, no tool API): the gizmo follows Move / Rotate / Scale, hidden otherwise', () => {
      const mid = { ...OLD, gizmo: true, bevel: true };
      expect(planMeshTool('rotate', mid, true).gizmo).toBe('rotate');
      expect(planMeshTool('rotate', mid, true).beginTransform).toBeUndefined();
      expect(planMeshTool('select', mid, true).gizmo).toBeNull();
      expect(planMeshTool('bevel', mid, true).beginBevel).toBeTrue();
    });
  });

  describe('right panel tools (round-2 feedback: only what applies to the selection type)', () => {
    const none = { vertices: 0, edges: 0, faces: 0 };
    const ids = (mode: 'vertex' | 'edge' | 'face', caps = NEW, sel = none, bridge = false) => meshPanelTools(mode, caps, sel, bridge).map(t => t.id);
    it('face: Extrude / Inset / Loop Cut / Knife, then Delete / Subdivide / Flip / Separate', () => {
      expect(ids('face')).toEqual(['extrude', 'inset', 'loopcut', 'knife', 'delete', 'subdivide', 'flip', 'separate']);
      const tools = meshPanelTools('face', NEW, none, false);
      expect(tools.filter(t => t.kind === 'tool').map(t => t.id)).toEqual(['extrude', 'inset', 'loopcut', 'knife']);
      expect(tools.filter(t => t.kind === 'verb').every(t => t.disabled)).toBeTrue();       // nothing selected yet
      expect(meshPanelTools('face', NEW, { ...none, faces: 2 }, false).some(t => t.disabled)).toBeFalse();
    });
    it('edge: Loop Cut / Bevel / Knife, then Dissolve / Bridge', () => {
      expect(ids('edge')).toEqual(['loopcut', 'bevel', 'knife', 'dissolve', 'bridge']);
      expect(meshPanelTools('edge', OLD, none, false).find(t => t.id === 'bevel')!.title).toBe(NEEDS_ENGINE_UPDATE);
      expect(meshPanelTools('edge', NEW, none, true).find(t => t.id === 'bridge')!.disabled).toBeFalse();
    });
    it('vertex: Chamfer / Knife, then Merge (two or more) / Bridge', () => {
      expect(ids('vertex')).toEqual(['bevel', 'knife', 'merge', 'bridge']);
      const v = meshPanelTools('vertex', NEW, { ...none, vertices: 1 }, false);
      expect(v[0].label).toBe('Chamfer');
      expect(v.find(t => t.id === 'merge')!.disabled).toBeTrue();
      expect(meshPanelTools('vertex', NEW, { ...none, vertices: 2 }, false).find(t => t.id === 'merge')!.disabled).toBeFalse();
    });
    it('icon-only: every button has a tooltip (with the key) and an icon', () => {
      for (const mode of ['vertex', 'edge', 'face'] as const) {
        for (const t of meshPanelTools(mode, NEW, none, false)) {
          expect(t.title).withContext(t.id).toBeTruthy();
          expect(t.icon).withContext(t.id).toBeTruthy();
        }
      }
      expect(meshPanelTools('face', NEW, none, false).find(t => t.id === 'extrude')!.title).toBe('Extrude (E)');
    });
    it('a selection-type switch keeps only the tools the new type offers', () => {
      expect(meshToolAppliesTo('extrude', 'edge')).toBeFalse();
      expect(meshToolAppliesTo('loopcut', 'edge')).toBeTrue();
      expect(meshToolAppliesTo('bevel', 'face')).toBeFalse();
      for (const t of ['select', 'move', 'rotate', 'scale'] as const) expect(meshToolAppliesTo(t, 'vertex')).toBeTrue();
    });
  });

  describe('op pill', () => {
    it('Extrude: distance; Apply only with faces selected', () => {
      const none = buildMeshOp(input({ tool: 'extrude' }));
      expect(none.params.map(p => [p.id, p.kind, p.value])).toEqual([['distance', 'number', 0.3]]);
      expect(none.applyDisabled).toBeTrue();
      expect(none.applyLabel).toBe('Extrude');
      const some = buildMeshOp(input({ tool: 'extrude', sel: { vertices: 0, edges: 0, faces: 2 } }));
      expect(some.applyDisabled).toBeFalse();
    });

    it('Inset: thickness + depth (depth needs the engine update on the old dist)', () => {
      const v = buildMeshOp(input({ tool: 'inset' }));
      expect(v.params.map(p => p.id)).toEqual(['amount', 'depth']);
      expect(v.params[0].label).toBe('Thickness');
      expect(v.params[1].disabled).toBeFalse();
      const old = buildMeshOp(input({ tool: 'inset', caps: OLD }));
      expect(old.params[1].disabled).toBeTrue();
      expect(old.params[1].title).toBe(NEEDS_ENGINE_UPDATE);
    });

    it('Loop Cut: count + position; count needs loopCuts3D', () => {
      const v = buildMeshOp(input({ tool: 'loopcut', params: { ...DEFAULT_MESH_TOOL_PARAMS, loopCutCount: 3, loopCutPosition: 0.25 } }));
      expect(v.params.map(p => [p.id, p.kind, p.value])).toEqual([['count', 'int', 3], ['position', 'number', 0.25]]);
      expect(buildMeshOp(input({ tool: 'loopcut', caps: OLD })).params[0].disabled).toBeTrue();
      expect(buildMeshOp(input({ tool: 'loopcut', sel: { vertices: 0, edges: 1, faces: 0 } })).applyDisabled).toBeFalse();
    });

    it('Knife: Cut from two points (the old dist: the drag knife cuts on release, no Cut)', () => {
      expect(buildMeshOp(input({ tool: 'knife', knifePoints: 1 })).applyDisabled).toBeTrue();
      expect(buildMeshOp(input({ tool: 'knife', knifePoints: 2 })).applyDisabled).toBeFalse();
      expect(buildMeshOp(input({ tool: 'knife', caps: OLD })).applyDisabled).toBeTrue();
    });

    it('no hint text in the pill (round-2 feedback: the name is enough)', () => {
      const states: Partial<MeshOpInput>[] = [
        { tool: 'extrude' }, { tool: 'inset' }, { tool: 'loopcut' }, { tool: 'knife' }, { tool: 'knife', caps: OLD }, { tool: 'bevel' },
        { tool: 'bevel', caps: OLD }, { transform: { mode: 'grab', axis: null, display: '' } },
        { bevel: { phase: 'pick', kind: 'edge', amount: 0, maxAmount: 0, segments: 1, snap: false, snapStep: 0.1, targets: 0, hint: 'Tap an edge', dragging: false } },
      ];
      for (const st of states) expect((buildMeshOp(input(st)) as { note?: string }).note).withContext(JSON.stringify(st)).toBeUndefined();
    });

    it('Bevel: Start when idle; amount + segments + snap while it runs', () => {
      const idle = buildMeshOp(input({ tool: 'bevel' }));
      expect(idle.params.map(p => p.id)).toEqual(['start']);
      expect(buildMeshOp(input({ tool: 'bevel', caps: OLD })).params).toEqual([]);
      const running = buildMeshOp(input({
        tool: 'select',
        bevel: { phase: 'adjust', kind: 'edge', amount: 0.2, maxAmount: 0.5, segments: 3, snap: false, snapStep: 0.1, targets: 2, hint: '', dragging: false },
      }));
      expect(running.kind).toBe('bevel');
      expect(running.params.map(p => [p.id, p.value])).toEqual([['amount', 0.2], ['segments', 3], ['snap', false]]);
      expect(running.params[0].max).toBe(0.5);
      expect(running.showApplyCancel).toBeTrue();
    });

    it('Select / Move / Rotate / Scale (the main toolbar): an empty pill (just Frame); a running transform: axis + amount + Apply', () => {
      for (const tool of ['select', 'move', 'rotate', 'scale'] as const) {
        const idle = buildMeshOp(input({ tool, sel: { vertices: 0, edges: 0, faces: 1 } }));
        expect(idle.title).withContext(tool).toBe('');
        expect(idle.params).withContext(tool).toEqual([]);
        expect(idle.showApplyCancel).withContext(tool).toBeFalse();
      }
      const xf = buildMeshOp(input({ tool: 'move', transform: { mode: 'rotate', axis: 'z', display: '45' } }));
      expect(xf.kind).toBe('transform');
      expect(xf.title).toBe('Rotate');
      expect(xf.params.map(p => [p.id, p.kind, p.value])).toEqual([['axis', 'axis', 'z'], ['amount', 'number', 45]]);
      expect(xf.params[1].unit).toBe('°');
      expect(xf.showApplyCancel).toBeTrue();
      const noAxis = buildMeshOp(input({ transform: { mode: 'grab', axis: null, display: '' } }));
      expect(noAxis.params[1].disabled).toBeTrue();
    });

    it('adjust last: the last op wins over the tool, with its params; Apply (no Done)', () => {
      const v = buildMeshOp(input({ tool: 'extrude', lastOp: { op: 'insetRegion', params: { amount: 0.1, depth: 0 } } }));
      expect(v.kind).toBe('adjust');
      expect(v.title).toBe('Adjust last: Inset');
      expect(v.params.map(p => [p.id, p.label, p.value])).toEqual([['amount', 'Amount', 0.1], ['depth', 'Depth', 0]]);
      expect(v.applyLabel).toBe('Apply');
      // a running transform / Chamfer still comes first
      expect(buildMeshOp(input({ lastOp: { op: 'bevel', params: {} }, transform: { mode: 'grab', axis: 'x', display: '1' } })).kind).toBe('transform');
    });

    it('last-op params: ints for counts / segments / levels, numbers otherwise, strings skipped', () => {
      const p = lastOpParams({ op: 'x', params: { count: 2, position: 0.5, segments: 3, levels: 1, distance: 0.3, mode: 'a', flag: true } });
      expect(p.map(q => [q.id, q.kind])).toEqual([['count', 'int'], ['position', 'number'], ['segments', 'int'], ['levels', 'int'],
        ['distance', 'number'], ['flag', 'toggle']]);
      expect(p.find(q => q.id === 'levels')!.max).toBe(4);
    });
  });

  describe('radial menu', () => {
    const sel = { vertices: 0, edges: 0, faces: 0 };
    it('face: Extrude / Inset / Subdivide / Delete', () => {
      expect(meshRadialItems('face', NEW, sel).map(i => i.id)).toEqual(['extrude', 'inset', 'subdivide', 'delete']);
      expect(meshRadialItems('face', NEW, sel).find(i => i.id === 'delete')!.danger).toBeTrue();
    });
    it('edge: Loop Cut / Bevel / Fill / Delete (Bevel disabled without the Chamfer)', () => {
      expect(meshRadialItems('edge', NEW, sel).map(i => i.id)).toEqual(['loopcut', 'bevel', 'fill', 'delete']);
      expect(meshRadialItems('edge', OLD, sel).find(i => i.id === 'bevel')!.disabled).toBeTrue();
    });
    it('vertex: Merge (two or more selected) / Chamfer / Fill', () => {
      expect(meshRadialItems('vertex', NEW, sel).map(i => i.id)).toEqual(['merge', 'bevel', 'fill']);
      expect(meshRadialItems('vertex', NEW, { ...sel, vertices: 1 })[0].disabled).toBeTrue();
      expect(meshRadialItems('vertex', NEW, { ...sel, vertices: 2 })[0].disabled).toBeFalse();
    });
  });

  describe('Classic Edit Mesh panel (the fallback setting)', () => {
    it('useModeChrome.meshEdit follows the setting, and writing it flips the setting', () => {
      const exp = { classicMeshEdit: false, toggleClassicMeshEdit() { this.classicMeshEdit = !this.classicMeshEdit; } };
      const switches = followClassicSetting({ meshEdit: false, armature: false }, 'meshEdit', exp);
      expect(switches.meshEdit).toBeTrue();      // default: the chrome
      exp.classicMeshEdit = true;
      expect(switches.meshEdit).toBeFalse();     // Classic on: the old overlay
      switches.meshEdit = true;
      expect(exp.classicMeshEdit).toBeFalse();
      switches.meshEdit = true;                  // no change: no toggle
      expect(exp.classicMeshEdit).toBeFalse();
      expect(switches.armature).toBeFalse();     // the other mode's switch is untouched
      expect(Object.keys(switches)).toEqual(['meshEdit', 'armature']);
    });
  });
});
