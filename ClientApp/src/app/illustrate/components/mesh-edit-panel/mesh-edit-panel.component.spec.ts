import { TestBed } from '@angular/core/testing';
import { MeshEditPanelComponent } from './mesh-edit-panel.component';

/** Mesh Edit panel ops (UI review 2026-10-07): REGION extrude / inset, subdivide a face set at once, fill EVERY hole,
 *  Bridge Loops in any pick order — on a Salsa with the region ops, and the per-face fallbacks on an older dist. */
describe('MeshEditPanelComponent operations', () => {
  function setup(withRegionOps: boolean) {
    const sel = { vertices: new Set<number>(), edges: new Set<number>(), faces: new Set<number>([2, 5]) };
    let boundaryHoles = 2;
    const sm: Record<string, jasmine.Spy> = {
      getEditSelection3D: jasmine.createSpy('getEditSelection3D').and.callFake(() => sel),
      clearEditSelection3D: jasmine.createSpy('clearEditSelection3D'),
      extrudeEditFace3D: jasmine.createSpy('extrudeEditFace3D'),
      insetEditFace3D: jasmine.createSpy('insetEditFace3D'),
      subdivideFace3D: jasmine.createSpy('subdivideFace3D'),
      fillHole3D: jasmine.createSpy('fillHole3D').and.callFake(() => { boundaryHoles--; return true; }),
      getMesh3D: jasmine.createSpy('getMesh3D').and.callFake(() => ({
        editMesh: { halfEdges: boundaryHoles > 0 ? [{ twin: 0 }, { twin: -1 }] : [{ twin: 0 }] },
      })),
      bridgeEdgeLoops3D: jasmine.createSpy('bridgeEdgeLoops3D'),
      setMeshEditBgMode3D: jasmine.createSpy('setMeshEditBgMode3D'),
    };
    if (withRegionOps) {
      sm['extrudeRegion3D'] = jasmine.createSpy('extrudeRegion3D').and.returnValue(true);
      sm['insetRegion3D'] = jasmine.createSpy('insetRegion3D').and.returnValue(true);
      sm['subdivideFaces3D'] = jasmine.createSpy('subdivideFaces3D').and.returnValue(true);
      sm['fillHoles3D'] = jasmine.createSpy('fillHoles3D').and.returnValue(3);
      sm['bridgeLoops3D'] = jasmine.createSpy('bridgeLoops3D').and.returnValue(true);
    }
    const panel = TestBed.runInInjectionContext(() => new MeshEditPanelComponent());
    panel.shapeManager = sm as never;
    panel.meshId = 'm1';
    return { panel, sm, sel };
  }

  it('defaults to the Wavy Sage background (wavy + the sage colours on the engine)', () => {
    const { panel, sm } = setup(true);
    expect(panel.bgMode).toBe('wavy-sage');
    panel.updateBgMode();
    expect(sm['setMeshEditBgMode3D']).toHaveBeenCalledOnceWith(
      { mode: 'wavy', color1: [0.73, 0.80, 0.71, 1.0], color2: [0.93, 0.91, 0.84, 1.0] });
  });

  it('Extrude / Inset: ONE region op on the whole face selection, which stays selected', () => {
    const { panel, sm } = setup(true);
    panel.extrudeSelected();
    expect(sm['extrudeRegion3D']).toHaveBeenCalledOnceWith('m1', new Set([2, 5]), panel.extrudeDistance);
    panel.insetSelected();
    expect(sm['insetRegion3D']).toHaveBeenCalledOnceWith('m1', new Set([2, 5]), panel.insetAmount);
    expect(sm['extrudeEditFace3D']).not.toHaveBeenCalled();
    expect(sm['clearEditSelection3D']).not.toHaveBeenCalled();
  });

  it('older Salsa: Extrude falls back to face by face', () => {
    const { panel, sm } = setup(false);
    panel.extrudeSelected();
    expect(sm['extrudeEditFace3D']).toHaveBeenCalledTimes(2);
    expect(sm['clearEditSelection3D']).toHaveBeenCalled();
  });

  it('Subdivide: all faces at once; the fallback goes highest index first (lower indices stay valid)', () => {
    const a = setup(true);
    a.panel.subdivideFaceSelected();
    expect(a.sm['subdivideFaces3D']).toHaveBeenCalledOnceWith('m1', new Set([2, 5]));
    const b = setup(false);
    b.panel.subdivideFaceSelected();
    expect(b.sm['subdivideFace3D'].calls.allArgs()).toEqual([['m1', 5], ['m1', 2]]);
  });

  it('Fill Holes fills every hole (engine: one call; fallback: until no boundary is left)', () => {
    const a = setup(true);
    a.panel.fillHole();
    expect(a.sm['fillHoles3D']).toHaveBeenCalledOnceWith('m1');
    expect(a.panel.holesFilled).toBe(3);
    const b = setup(false);
    b.panel.fillHole();
    expect(b.sm['fillHole3D']).toHaveBeenCalledTimes(2);
    expect(b.panel.holesFilled).toBe(2);
  });

  it('Bridge Loops hands the selection to the engine (order independent); 4 selected edges are enough', () => {
    const { panel, sm, sel } = setup(true);
    sel.faces.clear();
    expect(panel.canBridge).toBeFalse();
    [0, 3, 7, 9].forEach(e => sel.edges.add(e));
    expect(panel.canBridge).toBeTrue();
    panel.bridgeLoops();
    expect(sm['bridgeLoops3D']).toHaveBeenCalledOnceWith('m1', null);
    expect(sm['bridgeEdgeLoops3D']).not.toHaveBeenCalled();
  });
});
