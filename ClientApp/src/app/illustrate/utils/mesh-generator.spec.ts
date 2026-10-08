import {
  applyMeshGenerator, bakeMeshGenerator, engineHasMeshGenerators, meshGenDefaults, meshGeneratorApplies,
  outlineToPolygon, rayToPlane, readMeshGenerator, viewDrawPlane,
} from './mesh-generator';

/** Add Mesh instant add + Edit Mesh's generator card: defaults, the guarded engine calls, the Polygon outline math. */
describe('mesh-generator utils', () => {
  it('defaults are the old quick forms\' starting values, fresh copies each call', () => {
    expect(meshGenDefaults('cylinder')).toEqual({ radius: 0.3, radiusTop: 0.3, height: 0.8, segments: 12 });
    expect(meshGenDefaults('circle')).toEqual({ radius: 0.5, segments: 16, height: 0.2 });
    expect(meshGenDefaults('revolve')['profile'].length).toBe(3);
    expect(meshGenDefaults('tube')['radii']).toEqual([0.1, 0.15, 0.1]);
    expect(meshGenDefaults('metaball')['blobs'].length).toBe(2);
    expect(meshGenDefaults('creature')).toEqual(jasmine.objectContaining({ species: 'dog', seed: 42, resolution: 32, legCount: 4 }));
    const a = meshGenDefaults('revolve'), b = meshGenDefaults('revolve');
    a['profile'][0][0] = 9;
    expect(b['profile'][0][0]).toBe(0.3);
  });

  it('an engine without generator settings: none to read, nothing applies, no bake (no throw)', () => {
    const sm: any = { getMesh3D: () => ({}) };
    expect(engineHasMeshGenerators(sm)).toBeFalse();
    expect(readMeshGenerator(sm, 'm')).toBeNull();
    expect(meshGeneratorApplies(sm, 'm')).toBeFalse();
    expect(applyMeshGenerator(sm, 'm', {}, true)).toBeFalse();
    expect(bakeMeshGenerator(sm, 'm')).toBeFalse();
    expect(readMeshGenerator(null, 'm')).toBeNull();
  });

  it('with the engine API: copies out, passes commit through, cheap applies flag', () => {
    const params = { radius: 0.3, segments: 12 };
    const sm: any = {
      getMeshGenerator3D: jasmine.createSpy().and.returnValue({ type: 'cylinder', params }),
      setMeshGenerator3D: jasmine.createSpy().and.returnValue(true),
      bakeMeshGenerator3D: jasmine.createSpy().and.returnValue(true),
      getMesh3D: () => ({ generatorApplies: true }),
    };
    const g = readMeshGenerator(sm, 'm')!;
    expect(g.type).toBe('cylinder');
    g.params['radius'] = 2;
    expect(params.radius).toBe(0.3);   // a copy
    expect(meshGeneratorApplies(sm, 'm')).toBeTrue();
    expect(applyMeshGenerator(sm, 'm', { radius: 1 }, false)).toBeTrue();
    expect(sm.setMeshGenerator3D).toHaveBeenCalledWith('m', { radius: 1 }, { commit: false });
    expect(bakeMeshGenerator(sm, 'm')).toBeTrue();
    // An unknown type from a newer engine: no card
    sm.getMeshGenerator3D.and.returnValue({ type: 'teapot', params: {} });
    expect(readMeshGenerator(sm, 'm')).toBeNull();
  });

  it('the draw plane faces the view (from above: the ground; a front view: upright); rays cross it', () => {
    expect(viewDrawPlane([0.1, -0.9, -0.3], [1, 2, 3])).toEqual({ axis: 1, sign: 1, value: 2 });
    expect(viewDrawPlane([0.1, -0.2, -0.9], [1, 2, 3])).toEqual({ axis: 2, sign: 1, value: 3 });
    expect(viewDrawPlane([0.9, 0, 0.1], [1, 2, 3])).toEqual({ axis: 0, sign: -1, value: 1 });
    expect(rayToPlane([0, 2, 0], [1, 1, 1], { axis: 1, sign: 1, value: 0 })).toEqual([2, 0, 2]);
    expect(rayToPlane([0, 1, 0], [1, 1, 0], { axis: 1, sign: 1, value: 0 })).toBeNull();
  });

  it('outlineToPolygon: centred [x, z] points; double taps / a closing repeat dropped; degenerate → null', () => {
    const r = outlineToPolygon([[1, 0.5, 1], [3, 0.5, 1], [3, 0.5, 1], [3, 0.5, 3], [1, 0.5, 3], [1, 0.5, 1]], { axis: 1, sign: 1, value: 0.5 })!;
    expect(r.center).toEqual([2, 0.5, 2]);
    expect(r.points).toEqual([[-1, -1], [1, -1], [1, 1], [-1, 1]]);
    expect(r.rotation).toEqual([0, 0, 0]);
    // A front view (camera on +Z): upright on z = 5, the frame turned so its +Y (the extrusion) points at the camera;
    // local z runs down world -Y
    const f = outlineToPolygon([[0, 0, 5], [2, 0, 5], [2, 2, 5]], { axis: 2, sign: 1, value: 5 })!;
    expect(f.center).toEqual([1, 1, 5]);
    expect(f.points).toEqual([[-1, 1], [1, 1], [1, -1]]);
    expect(f.rotation).toEqual([Math.PI / 2, 0, 0]);
    expect(outlineToPolygon([[0, 0, 0], [1, 0, 0]])).toBeNull();
    expect(outlineToPolygon([[0, 0, 0], [1, 0, 0], [2, 0, 0]])).toBeNull();   // collinear: no area
  });
});
