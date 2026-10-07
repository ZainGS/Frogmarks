import {
  DEFAULT_MESH_TOOL_PARAMS, MESH_TOOL_IDS, NEEDS_ENGINE_UPDATE, buildMeshOp, followClassicSetting, lastOpParams, meshChromeCaps,
  meshMenuItems, meshRadialItems, meshTools, planMeshTool, selectActions, type MeshChromeCaps, type MeshOpInput,
} from './mesh-edit-chrome.logic';
import { MESH_EDIT_KEYS } from '../illustration/mode-keymap';

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

  describe('tool strip', () => {
    it('nine tools in two groups, keys + hints from the keymap', () => {
      const tools = meshTools(NEW);
      expect(tools.map(t => t.id)).toEqual(['select', 'move', 'rotate', 'scale', 'extrude', 'inset', 'loopcut', 'knife', 'bevel']);
      expect(tools.map(t => t.group)).toEqual(['xf', 'xf', 'xf', 'xf', 'op', 'op', 'op', 'op', 'op']);
      const by = (id: string) => tools.find(t => t.id === id)!;
      expect(by('move').key).toBe('G');
      expect(by('extrude').key).toBe('E');
      expect(by('inset').key).toBe('I');
      expect(by('loopcut').key).toBe('Ctrl+R');
      expect(by('knife').key).toBe('K');
      expect(by('bevel').key).toBe('Ctrl+B');
      expect(by('select').key).toBeUndefined();
      expect(by('extrude').hint).toContain(MESH_EDIT_KEYS.extrude.help);
      expect(by('move').hint).toContain(MESH_EDIT_KEYS.move.help);
      expect(by('select').hint).toContain('A all');
      for (const t of tools) expect(t.icon).toBe(`svg:${t.id}`);
    });

    it('the old dist: Bevel is disabled with "Needs the engine update"; Knife / Loop Cut hints describe the fallbacks', () => {
      const tools = meshTools(OLD);
      const bevel = tools.find(t => t.id === 'bevel')!;
      expect(bevel.disabled).toBeTrue();
      expect(bevel.hint).toBe(NEEDS_ENGINE_UPDATE);
      expect(tools.find(t => t.id === 'knife')!.hint).toContain('Drag');
      expect(tools.find(t => t.id === 'loopcut')!.hint).toContain('select an edge');
      expect(tools.filter(t => t.disabled).length).toBe(1);
      expect(meshTools(NEW).find(t => t.id === 'knife')!.hint).toContain('Tap points');
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
      expect(some.note).toBe('2 faces');
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
      expect(v.note).toBe('Tap an edge to cut');
      expect(buildMeshOp(input({ tool: 'loopcut', caps: OLD })).params[0].disabled).toBeTrue();
      expect(buildMeshOp(input({ tool: 'loopcut', sel: { vertices: 0, edges: 1, faces: 0 } })).applyDisabled).toBeFalse();
    });

    it('Knife: the point count, Cut from two points, Clear drops them; the old dist explains the drag knife', () => {
      expect(buildMeshOp(input({ tool: 'knife', knifePoints: 1 })).applyDisabled).toBeTrue();
      const two = buildMeshOp(input({ tool: 'knife', knifePoints: 2 }));
      expect(two.applyDisabled).toBeFalse();
      expect(two.cancelLabel).toBe('Clear');
      expect(two.note).toContain('2 points');
      const old = buildMeshOp(input({ tool: 'knife', caps: OLD }));
      expect(old.note).toContain('Drag');
      expect(old.applyDisabled).toBeTrue();
    });

    it('Bevel: Start when idle; amount + segments + snap while it runs', () => {
      const idle = buildMeshOp(input({ tool: 'bevel' }));
      expect(idle.params.map(p => p.id)).toEqual(['start']);
      expect(buildMeshOp(input({ tool: 'bevel', caps: OLD })).note).toBe(NEEDS_ENGINE_UPDATE);
      const running = buildMeshOp(input({
        tool: 'select',
        bevel: { phase: 'adjust', kind: 'edge', amount: 0.2, maxAmount: 0.5, segments: 3, snap: false, snapStep: 0.1, targets: 2, hint: '', dragging: false },
      }));
      expect(running.kind).toBe('bevel');
      expect(running.params.map(p => [p.id, p.value])).toEqual([['amount', 0.2], ['segments', 3], ['snap', false]]);
      expect(running.params[0].max).toBe(0.5);
      expect(running.showApplyCancel).toBeTrue();
    });

    it('Move / Rotate / Scale: Start (G / R / S); while it runs: axis chips + the typed amount + Apply / Cancel', () => {
      const idle = buildMeshOp(input({ tool: 'rotate', sel: { vertices: 0, edges: 0, faces: 1 } }));
      expect(idle.params[0].id).toBe('start');
      expect(idle.params[0].label).toBe('Start (R)');
      expect(buildMeshOp(input({ tool: 'rotate' })).params[0].disabled).toBeTrue();
      const xf = buildMeshOp(input({ tool: 'move', transform: { mode: 'rotate', axis: 'z', display: '45' } }));
      expect(xf.kind).toBe('transform');
      expect(xf.title).toBe('Rotate');
      expect(xf.params.map(p => [p.id, p.kind, p.value])).toEqual([['axis', 'axis', 'z'], ['amount', 'number', 45]]);
      expect(xf.params[1].unit).toBe('°');
      expect(xf.showApplyCancel).toBeTrue();
      const noAxis = buildMeshOp(input({ transform: { mode: 'grab', axis: null, display: '' } }));
      expect(noAxis.params[1].disabled).toBeTrue();
    });

    it('Select: All / None / Invert, then the ops that fit the selection (no Apply / Cancel)', () => {
      const ids = (mode: 'vertex' | 'edge' | 'face', v: number, e: number, f: number, bridge = false) =>
        selectActions(mode, { vertices: v, edges: e, faces: f }, bridge).map(p => p.id);
      expect(ids('face', 0, 0, 0)).toEqual(['sel-all', 'sel-none', 'sel-invert']);
      expect(ids('face', 0, 0, 2)).toEqual(['sel-all', 'sel-none', 'sel-invert', 'delete', 'subdivide', 'flip', 'separate']);
      expect(ids('edge', 0, 1, 0)).toEqual(['sel-all', 'sel-none', 'sel-invert', 'delete']);
      expect(ids('vertex', 4, 0, 0, true)).toEqual(['sel-all', 'sel-none', 'sel-invert', 'merge', 'bridge']);
      const v = buildMeshOp(input({ sel: { vertices: 0, edges: 0, faces: 1 } }));
      expect(v.showApplyCancel).toBeFalse();
      expect(v.note).toBe('1 face selected');
    });

    it('adjust last: the last op wins over the tool, with its params; Done / Undo', () => {
      const v = buildMeshOp(input({ tool: 'extrude', lastOp: { op: 'insetRegion', params: { amount: 0.1, depth: 0 } } }));
      expect(v.kind).toBe('adjust');
      expect(v.title).toBe('Adjust last: Inset');
      expect(v.params.map(p => [p.id, p.label, p.value])).toEqual([['amount', 'Amount', 0.1], ['depth', 'Depth', 0]]);
      expect(v.applyLabel).toBe('Done');
      expect(v.cancelLabel).toBe('Undo');
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

  describe('⋯ menu', () => {
    it('the background (checked), Drag moves selection on a newer dist, Open UV editor, Keyboard shortcuts', () => {
      const items = meshMenuItems('wavy', true);
      expect(items.filter(i => i.id.startsWith('bg:')).map(i => [i.id, i.checked])).toEqual([
        ['bg:gradient', false], ['bg:wavy', true], ['bg:checkers', false], ['bg:dim', false], ['bg:solid', false], ['bg:none', false],
      ]);
      expect(items.find(i => i.id === 'drag-moves')!.checked).toBeTrue();
      expect(items.map(i => i.id).slice(-2)).toEqual(['uv', 'shortcuts']);
      expect(meshMenuItems('gradient', null).some(i => i.id === 'drag-moves')).toBeFalse();
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
