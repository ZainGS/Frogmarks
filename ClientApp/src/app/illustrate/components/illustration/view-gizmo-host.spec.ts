import { releaseViewGizmo, syncViewGizmoHidden, ViewGizmoEngine } from './view-gizmo-host';

describe('view-gizmo-host (the 3D nav gizmo on editor leave / Toggle UI)', () => {
  it('releaseViewGizmo clears the host hide, then disposes the gizmo', () => {
    const calls: string[] = [];
    const sm: ViewGizmoEngine = {
      setViewGizmoHidden3D: (h) => calls.push('hidden:' + h),
      disableViewGizmo3D: () => calls.push('disable'),
    };
    releaseViewGizmo(sm);
    expect(calls).toEqual(['hidden:false', 'disable']);
  });

  it('works with an older Salsa dist (no setViewGizmoHidden3D) and with no engine at all', () => {
    const disable = jasmine.createSpy('disableViewGizmo3D');
    expect(() => releaseViewGizmo({ disableViewGizmo3D: disable })).not.toThrow();
    expect(disable).toHaveBeenCalledTimes(1);
    expect(() => releaseViewGizmo({})).not.toThrow();
    expect(() => releaseViewGizmo(null)).not.toThrow();
    expect(() => syncViewGizmoHidden(undefined, true)).not.toThrow();
    expect(() => syncViewGizmoHidden({}, true)).not.toThrow();
  });

  it('an engine error on leave is contained (ngOnDestroy must finish)', () => {
    spyOn(console, 'warn');
    const sm: ViewGizmoEngine = { disableViewGizmo3D: () => { throw new Error('boom'); } };
    expect(() => releaseViewGizmo(sm)).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });

  it('syncViewGizmoHidden forwards the flag', () => {
    const set = jasmine.createSpy('setViewGizmoHidden3D');
    syncViewGizmoHidden({ setViewGizmoHidden3D: set }, true);
    syncViewGizmoHidden({ setViewGizmoHidden3D: set }, false);
    expect(set.calls.allArgs()).toEqual([[true], [false]]);
  });
});
