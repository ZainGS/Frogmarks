import { fakeAsync, tick } from '@angular/core/testing';
import { ClothBuilderComponent } from './cloth-builder.component';

/** Cloth builder on an EXISTING cloth (audit 2026-10-09): the first Hang / Drape press and the Collision select run
 *  the picked mode with the proxy (they used to continue the saved mode with no proxy until a second press). */
describe('ClothBuilderComponent — editing an existing cloth', () => {
  function setup() {
    const handle = { reset: jasmine.createSpy('reset'), destroy: jasmine.createSpy('destroy') };
    const s3d: any = {
      enableLiveCloth: jasmine.createSpy('enableLiveCloth').and.returnValue(true),
      disableLiveCloth: jasmine.createSpy('disableLiveCloth'),
      getLiveClothHandle: jasmine.createSpy('getLiveClothHandle').and.returnValue(handle),
    };
    const zone: any = { runOutsideAngular: (f: () => unknown) => f(), run: (f: () => unknown) => f() };
    const c = new ClothBuilderComponent(zone);
    c.existingMeshId = 'cloth1';
    c.previewMeshId = 'cloth1';
    c.scene3dManager = s3d;
    return { c, s3d, handle };
  }

  it('first Drape press: enables with mode drape + the collision proxy, then restarts from flat in that mode', fakeAsync(() => {
    const { c, s3d, handle } = setup();
    c.drapeProxyType = 'ground';
    c.drapeGroundY = -0.4;
    c.onSimModeChange('drape');
    expect(s3d.enableLiveCloth).toHaveBeenCalledOnceWith('cloth1', undefined, { mode: 'drape', proxy: { type: 'ground', y: -0.4 } });
    tick(1);
    expect(handle.reset).toHaveBeenCalledTimes(1);
    expect(handle.reset.calls.mostRecent().args[2]).toBe('drape');
    expect(handle.reset.calls.mostRecent().args[3]).toEqual({ type: 'ground', y: -0.4 });
  }));

  it('first Hang press: mode hang (not the saved mode), restarted', fakeAsync(() => {
    const { c, s3d, handle } = setup();
    c.onSimModeChange('hang');
    expect(s3d.enableLiveCloth.calls.mostRecent().args[2]).toEqual({ mode: 'hang', proxy: undefined });
    tick(1);
    expect(handle.reset.calls.mostRecent().args[2]).toBe('hang');
  }));

  it('the Collision select while hanging switches to drape with the new proxy', fakeAsync(() => {
    const { c, s3d, handle } = setup();
    c.onSimModeChange('hang');
    tick(1);
    c.drapeProxyType = 'sphere';
    c.onSimModeChange('drape');
    expect(s3d.enableLiveCloth.calls.mostRecent().args[2].mode).toBe('drape');
    expect(s3d.enableLiveCloth.calls.mostRecent().args[2].proxy.type).toBe('sphere');
    tick(1);
    expect(handle.reset.calls.mostRecent().args[3].type).toBe('sphere');
  }));
});
