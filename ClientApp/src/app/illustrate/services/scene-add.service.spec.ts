import { SceneAddService } from './scene-add.service';

/** Add Mesh: every "…" entry adds at once with defaults (no quick form), selected + dirty; Polygon… draws its outline. */
describe('SceneAddService (instant add)', () => {
  function setup() {
    let n = 0;
    const made = (): { id: string } => ({ id: `mesh${++n}` });
    // A top-down view: screen px / 100 = world x / z on the plane y = 0 (unproject: depth slides along y)
    const sm: any = {
      scene3d: { setRotation: jasmine.createSpy('setRotation'), createClothMesh: jasmine.createSpy('createClothMesh').and.callFake(made), createBox: jasmine.createSpy('createBox').and.callFake(made) },
      getIllustrationCenter3D: () => [0, 0, 0],
      createCylinder3D: jasmine.createSpy('createCylinder3D').and.callFake(made),
      addCircleMesh3D: jasmine.createSpy('addCircleMesh3D').and.callFake(made),
      createRevolve3D: jasmine.createSpy('createRevolve3D').and.callFake(made),
      createTube3D: jasmine.createSpy('createTube3D').and.callFake(made),
      createMetaballMesh3D: jasmine.createSpy('createMetaballMesh3D').and.callFake(made),
      createCreature3D: jasmine.createSpy('createCreature3D').and.callFake(made),
      addPolygonMesh3D: jasmine.createSpy('addPolygonMesh3D').and.callFake(made),
      unprojectScreenToWorld3D: (sx: number, sy: number, d: number) => ({ x: sx / 100, y: 10 - d * 10, z: sy / 100 }),
      projectWorldToScreen3D: (x: number, _y: number, z: number) => ({ x: x * 100, y: z * 100, depth: 0.5 }),
    };
    const host: any = {
      shapeManager: sm, scene3dShowAddMeshMenu: true, _suppressLayerTreeRebuild: false,
      _exitAllScene3dModes: jasmine.createSpy('exitAll'),
      scene3dRefreshMeshes: jasmine.createSpy('refresh'), scene3dSelectMesh: jasmine.createSpy('select'),
      scene3dMarkDirty: jasmine.createSpy('dirty'), scene3dRefreshKeyframeTracks: () => undefined,
    };
    const anim: any = { scene3dEnsureAnimationPlayer: () => undefined };
    const svc = new SceneAddService({} as any, {} as any, anim, {} as any, {} as any);
    svc.bind(host);
    const canvas: any = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    return { svc, sm, host, canvas };
  }

  const ev = (x: number, y: number, id = 1): PointerEvent => ({ clientX: x, clientY: y, pointerId: id } as PointerEvent);
  const tap = (s: ReturnType<typeof setup>, x: number, y: number): void => {
    expect(s.svc.polygonPointerDown(ev(x, y))).toBeTrue();
    s.svc.polygonPointerUp(ev(x, y), s.canvas);
  };

  it('each parametric entry adds at once with the defaults, selected, the document dirty', () => {
    const s = setup();
    s.svc.scene3dAddCylinder();
    expect(s.sm.createCylinder3D).toHaveBeenCalledWith(0, 0, 0, 0.3, 0.8, 12, undefined, 0.3);
    s.svc.scene3dAddCircle();
    expect(s.sm.addCircleMesh3D).toHaveBeenCalledWith(0, 0, 0, 0.5, 16, 0.2);
    s.svc.scene3dAddRevolve();
    s.svc.scene3dAddTube();
    s.svc.scene3dAddMetaball();
    s.svc.scene3dAddCreature();
    expect(s.sm.createCreature3D.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ species: 'dog', seed: 42 }));
    expect(s.sm.createCreature3D.calls.mostRecent().args[4]).toBe(32);   // resolution
    s.svc.scene3dAddCloth();
    expect(s.sm.scene3d.createClothMesh.calls.mostRecent().args[3]).toEqual(jasmine.objectContaining({ cols: 8, rows: 10 }));
    expect(s.host.scene3dSelectMesh.calls.allArgs().map((a: string[]) => a[0])).toEqual(['mesh1', 'mesh2', 'mesh3', 'mesh4', 'mesh5', 'mesh6', 'mesh7']);
    expect(s.host.scene3dMarkDirty).toHaveBeenCalledTimes(7);
    expect(s.host.scene3dShowAddMeshMenu).toBeFalse();
  });

  it('Polygon…: straight into drawing (other modes left); taps add points; tapping the first point makes the shape', () => {
    const s = setup();
    s.svc.scene3dStartPolygonDraw();
    expect(s.host._exitAllScene3dModes).toHaveBeenCalled();
    expect(s.svc.polyDraw).toEqual(jasmine.objectContaining({ pts: [] }));
    tap(s, 100, 100);
    expect(s.svc.polyDraw!.plane).toEqual({ axis: 1, sign: 1, value: 0 });   // looking down: the ground plane
    tap(s, 300, 100);
    // A drag (orbit) is no point
    s.svc.polygonPointerDown(ev(300, 300));
    s.svc.polygonPointerMove(ev(360, 340), s.canvas);
    s.svc.polygonPointerUp(ev(360, 340), s.canvas);
    expect(s.svc.polyDraw!.pts.length).toBe(2);
    tap(s, 300, 300);
    tap(s, 102, 101);   // on the first point: Done
    expect(s.svc.polyDraw).toBeNull();
    const [x, y, z, pts, h] = s.sm.addPolygonMesh3D.calls.mostRecent().args;
    expect([x, y, z]).toEqual([2, 0, 2]);
    expect(pts).toEqual([[-1, -1], [1, -1], [1, 1]]);
    expect(h).toBe(0.2);
    expect(s.sm.scene3d.setRotation).not.toHaveBeenCalled();   // the ground frame needs no turn
    expect(s.host.scene3dSelectMesh).toHaveBeenCalledWith('mesh1');
    expect(s.host.scene3dMarkDirty).toHaveBeenCalled();
  });

  it('Polygon… in a front view: drawn on the upright plane, the shape turned to face the camera', () => {
    const s = setup();
    // Camera on +Z looking down -Z: screen px / 100 = world x, -y on z = 0
    s.sm.unprojectScreenToWorld3D = (sx: number, sy: number, d: number) => ({ x: sx / 100, y: -sy / 100, z: 10 - d * 10 });
    s.sm.projectWorldToScreen3D = (x: number, y: number) => ({ x: x * 100, y: -y * 100, depth: 0.5 });
    s.svc.scene3dStartPolygonDraw();
    tap(s, 100, 100); tap(s, 300, 100); tap(s, 300, 300);
    s.svc.scene3dFinishPolygonDraw();
    const [x, y, z, pts] = s.sm.addPolygonMesh3D.calls.mostRecent().args;
    expect([x, y, z]).toEqual([2, -2, 0]);
    expect(pts).toEqual([[-1, -1], [1, -1], [1, 1]]);
    expect(s.sm.scene3d.setRotation).toHaveBeenCalledWith('mesh1', Math.PI / 2, 0, 0);
  });

  it('Polygon…: Undo drops the last point; Done needs 3 points; Cancel ends without a shape', () => {
    const s = setup();
    s.svc.scene3dStartPolygonDraw();
    tap(s, 100, 100);
    tap(s, 300, 100);
    s.svc.scene3dFinishPolygonDraw();
    expect(s.sm.addPolygonMesh3D).not.toHaveBeenCalled();
    expect(s.svc.polyDraw).not.toBeNull();
    s.svc.scene3dPolygonUndoPoint();
    expect(s.svc.polyDraw!.pts.length).toBe(1);
    s.svc.scene3dCancelPolygonDraw();
    expect(s.svc.polyDraw).toBeNull();
    expect(s.svc.polygonPointerDown(ev(1, 1))).toBeFalse();   // not drawing: the canvas picks as usual
  });
});
