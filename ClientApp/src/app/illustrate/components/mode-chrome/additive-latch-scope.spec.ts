import { acquireAdditiveLatch, additiveLatchOwners, releaseAdditiveLatch } from './additive-latch-scope';

/** A fake engine with the TOUCH-10 additive latch. */
function engine(initial = false) {
  let latch = initial;
  const sm = {
    setAdditiveSelect3D: jasmine.createSpy('setAdditiveSelect3D').and.callFake((on: boolean) => { latch = on; }),
    getAdditiveSelect3D: () => latch,
  };
  return { sm, latch: () => latch };
}

describe('additive latch scope (Edit Mesh / Armature share the engine latch)', () => {
  const mesh = { mode: 'meshEdit' }, arm = { mode: 'armature' };

  it('one mode: the latch it set is put back as it was when it leaves', () => {
    const e = engine(false);
    expect(acquireAdditiveLatch(e.sm, mesh)).toBeTrue();
    e.sm.setAdditiveSelect3D(true);
    releaseAdditiveLatch(e.sm, mesh);
    expect(e.latch()).toBeFalse();
    expect(additiveLatchOwners(e.sm)).toBe(0);
  });

  it('a direct switch in either mount order never leaves the latch on after both left (the old per-mode restore did)', () => {
    for (const order of ['next mounts first', 'previous leaves first']) {
      const e = engine(false);
      acquireAdditiveLatch(e.sm, mesh);
      e.sm.setAdditiveSelect3D(true);                       // Edit Mesh on a tablet: taps add
      if (order === 'next mounts first') {
        acquireAdditiveLatch(e.sm, arm);                    // the Armature mounts while Edit Mesh is still up…
        releaseAdditiveLatch(e.sm, mesh);                   // …then Edit Mesh goes
        expect(e.latch()).toBeTrue();                       // (not reset under the Armature)
      } else {
        releaseAdditiveLatch(e.sm, mesh);
        acquireAdditiveLatch(e.sm, arm);
      }
      e.sm.setAdditiveSelect3D(true);                       // the Armature's per-press latch (a pen press)
      releaseAdditiveLatch(e.sm, arm);
      expect(e.latch()).withContext(order).toBeFalse();     // the user's latch from before Edit Mesh
      expect(additiveLatchOwners(e.sm)).toBe(0);
    }
  });

  it('the user’s own latch (on before any mode) survives A → B → A repeated 20×', () => {
    const e = engine(true);
    for (let i = 0; i < 20; i++) {
      for (const [from, to] of [[mesh, arm], [arm, mesh]] as const) {
        acquireAdditiveLatch(e.sm, from);
        e.sm.setAdditiveSelect3D(i % 2 === 0);
        acquireAdditiveLatch(e.sm, to);
        releaseAdditiveLatch(e.sm, from);
        e.sm.setAdditiveSelect3D(false);
        releaseAdditiveLatch(e.sm, to);
        expect(e.latch()).toBeTrue();
        expect(additiveLatchOwners(e.sm)).toBe(0);
      }
    }
  });

  it('release is idempotent per owner; an engine without the latch is ignored', () => {
    const e = engine(false);
    acquireAdditiveLatch(e.sm, mesh);
    acquireAdditiveLatch(e.sm, mesh);
    e.sm.setAdditiveSelect3D(true);
    releaseAdditiveLatch(e.sm, mesh);
    releaseAdditiveLatch(e.sm, mesh);
    expect(e.latch()).toBeFalse();
    expect(e.sm.setAdditiveSelect3D).toHaveBeenCalledTimes(2);
    expect(acquireAdditiveLatch({}, mesh)).toBeFalse();
    expect(acquireAdditiveLatch(null, mesh)).toBeFalse();
    releaseAdditiveLatch(null, mesh);
  });
});
