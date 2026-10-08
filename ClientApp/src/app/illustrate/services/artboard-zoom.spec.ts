import { NgZone } from '@angular/core';
import { ArtboardService } from './artboard.service';
import type { EditorStateService } from './editor-state.service';

/** The zoom box (−/+, the % readout, Fit) in Edit Mesh / UV / Armature: the 3D edit camera, not the 2D canvas zoom. */
describe('ArtboardService — zoom box in the 3D edit modes', () => {
  function setup(o: { editApi?: boolean; editing?: boolean } = {}) {
    let editing = o.editing ?? true;
    let zoom = 1;
    const sm: Record<string, unknown> = {
      getDocumentSize: () => ({ w: 800, h: 600 }),
      fitArtboard: jasmine.createSpy('fitArtboard'),
    };
    if (o.editApi !== false) {
      sm['isEditViewActive3D'] = () => editing;
      sm['zoomEditView3D'] = jasmine.createSpy('zoomEditView3D').and.callFake((f: number) => { if (!editing) return false; zoom *= f; return true; });
      sm['getEditViewZoom3D'] = () => (editing ? zoom : null);
      sm['frameEditView3D'] = jasmine.createSpy('frameEditView3D').and.callFake(() => { if (!editing) return false; zoom = 1; return true; });
    }
    const world = { zoomIn: jasmine.createSpy('zoomIn'), zoomOut: jasmine.createSpy('zoomOut'), getZoomFactor: () => 0.5 };
    const editorState = { scene3dViewCameraMode: 'ortho2D' } as unknown as EditorStateService;
    const svc = new ArtboardService(editorState, { run: (f: () => unknown) => f() } as unknown as NgZone);
    svc.bind({ shapeManager: sm, canvas: null, scene3dFrameScene: jasmine.createSpy('frameScene'), worldManager: world } as never);
    return { svc, sm, world, setEditing: (on: boolean) => { editing = on; } };
  }

  it('− / + step the edit camera (single steps of ×1.25), never the 2D zoom; % is relative to the framing', () => {
    const t = setup();
    t.svc.zoomIn();
    t.svc.zoomIn();
    expect(t.sm['zoomEditView3D']).toHaveBeenCalledWith(1.25);
    expect(t.svc.currentZoomPercent).toBe('156%');
    t.svc.zoomOut();
    expect(t.svc.currentZoomPercent).toBe('125%');
    expect(t.world.zoomIn).not.toHaveBeenCalled();
    expect(t.world.zoomOut).not.toHaveBeenCalled();
  });

  it('Fit and the % readout frame the mode’s mesh (back to 100 %), not the artboard', () => {
    const t = setup();
    t.svc.zoomIn();
    t.svc.fitView();
    expect(t.sm['frameEditView3D']).toHaveBeenCalledTimes(1);
    expect(t.svc.currentZoomPercent).toBe('100%');
    t.svc.zoomIn();
    t.svc.zoomFitClick();
    expect(t.sm['frameEditView3D']).toHaveBeenCalledTimes(2);
    expect(t.sm['fitArtboard']).not.toHaveBeenCalled();
  });

  it('leaving the mode gives the box back to the 2D canvas zoom', () => {
    const t = setup();
    t.setEditing(false);
    t.svc.zoomIn();
    t.svc.zoomOut();
    expect(t.world.zoomIn).toHaveBeenCalledTimes(1);
    expect(t.world.zoomOut).toHaveBeenCalledTimes(1);
    expect(t.sm['zoomEditView3D']).not.toHaveBeenCalled();
    expect(t.svc.currentZoomPercent).toBe('50%');
    t.svc.fitView();
    expect(t.sm['fitArtboard']).toHaveBeenCalled();
  });

  it('an older Salsa dist without the edit-camera API: the 2D zoom, as before', () => {
    const t = setup({ editApi: false });
    t.svc.zoomIn();
    expect(t.world.zoomIn).toHaveBeenCalledTimes(1);
    expect(t.svc.currentZoomPercent).toBe('50%');
  });
});
