import { UvEditorService } from './uv-editor.service';

/** mobile-parity 7.2: Close on the UV panel left the wavy focus background (and the mesh-edit orbit) up — the engine
 *  session was closed by the CURRENT selection's id, which had moved since the editor opened. */
describe('UvEditorService close (one full exit)', () => {
  function setup(o: { closeAll?: boolean } = {}) {
    const editorState = { scene3dSelectedMeshId: 'mesh-a' as string | null };
    const sm: any = {
      openUVEditor3D: jasmine.createSpy('openUVEditor3D').and.returnValue({ meshId: 'mesh-a' }),
      exitUVPaintMode3D: jasmine.createSpy('exitUVPaintMode3D'),
      closeUVEditor3D: jasmine.createSpy('closeUVEditor3D'),
    };
    if (o.closeAll) sm.closeAllUVEditors3D = jasmine.createSpy('closeAllUVEditors3D');
    const host: any = { shapeManager: sm, _exitAllScene3dModes: jasmine.createSpy('exitAll'), skinsPanel: null, uvCanvasRef: undefined };
    const svc = new UvEditorService(editorState as any, { runOutsideAngular: (f: () => void) => f(), run: (f: () => void) => f() } as any,
      { tick: () => {} } as any);
    svc.bind(host);
    return { svc, sm, editorState };
  }

  it('closes every engine UV session through closeAllUVEditors3D when the engine has it', () => {
    const { svc, sm, editorState } = setup({ closeAll: true });
    svc.openUVEditor();
    editorState.scene3dSelectedMeshId = 'mesh-b';   // the selection moved while the editor was open
    svc.closeUVEditor();
    expect(sm.closeAllUVEditors3D).toHaveBeenCalledTimes(1);
    expect(svc.uvEditorOpen).toBeFalse();
    expect(svc.uvPaintMode).toBeFalse();
  });

  it('older engine: exits paint and closes the session it OPENED, not the current selection', () => {
    const { svc, sm, editorState } = setup();
    svc.openUVEditor();
    editorState.scene3dSelectedMeshId = null;   // e.g. the selection was cleared
    svc.closeUVEditor();
    expect(sm.exitUVPaintMode3D).toHaveBeenCalled();
    expect(sm.closeUVEditor3D).toHaveBeenCalledOnceWith('mesh-a');
    expect(svc.uvEditorOpen).toBeFalse();
  });

  it('older engine, clothing paint stacked on the open editor: the body session it opened still closes', () => {
    const { svc, sm, editorState } = setup();
    svc.openUVEditor();
    svc.scene3dClothingPaintActive = 'top';   // the char panel's Paint on top (it skipped the close before)
    editorState.scene3dSelectedMeshId = 'mesh-b';
    svc.closeUVEditor();
    expect(sm.closeUVEditor3D).toHaveBeenCalledOnceWith('mesh-a');
    expect(svc.scene3dClothingPaintActive).toBeNull();
  });
});
