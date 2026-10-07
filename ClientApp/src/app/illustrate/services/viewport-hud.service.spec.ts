import { ViewportHudService } from './viewport-hud.service';

/** The keyboard 3D transform starts on PLAIN G / R / S only (UI review 2026-10-07: Ctrl+R started a modal Rotate). */
describe('ViewportHudService.handleTransformKey', () => {
  function setup() {
    const sm = { beginTransform3D: jasmine.createSpy('beginTransform3D'), isShortcutActive3D: false };
    const hud = new ViewportHudService({} as any, { run: (f: () => void) => f() } as any);
    hud.bind({ shapeManager: sm } as any);
    return { hud, sm };
  }
  const key = (k: string, m: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key: k, cancelable: true, ...m });

  it('G / R / S begin grab / rotate / scale', () => {
    const { hud, sm } = setup();
    for (const k of ['g', 'r', 's']) hud.handleTransformKey(key(k));
    expect(sm.beginTransform3D.calls.allArgs()).toEqual([['grab'], ['rotate'], ['scale']]);
  });

  it('Ctrl / Cmd / Alt chords are not transforms and stay unclaimed', () => {
    const { hud, sm } = setup();
    const chords = [key('r', { ctrlKey: true }), key('r', { metaKey: true }), key('g', { ctrlKey: true }), key('s', { ctrlKey: true }), key('r', { altKey: true })];
    for (const e of chords) hud.handleTransformKey(e);
    expect(sm.beginTransform3D).not.toHaveBeenCalled();
    expect(chords.some(e => e.defaultPrevented)).toBeFalse();
  });
});
