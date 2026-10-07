import { NgZone } from '@angular/core';
import { ArmPickService } from './arm-pick.service';
import { pickJointFromScreenPositions } from './arm-engine';

/** UI review 2026-10-07 §4: joints (constraint target, IK pole, weight joint) are picked by tapping, not typed. */
describe('ArmPickService (one-shot "tap a joint")', () => {
  const zone = { run: (f: () => unknown) => f(), runOutsideAngular: (f: () => unknown) => f() } as unknown as NgZone;

  function setup(newApi: boolean) {
    const pick = new ArmPickService(zone);
    const sm: any = {
      getJointScreenPositions3D: () => [{ index: 0, name: 'hips', x: 100, y: 100 }, { index: 1, name: 'hand_L', x: 300, y: 50 }],
    };
    if (newApi) sm.pickArmatureJointAt3D = (x: number) => (x > 200 ? { skeletonId: 's1', jointIndex: 1, jointName: 'hand_L' } : null);
    pick.bind({ shapeManager: sm, rig: { activeSkeleton: { id: 's1', name: 'Rig' } }, cdr: { markForCheck() {} } } as never);
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;
    pick.canvas = canvas;
    return { pick };
  }

  it('a miss keeps it armed (missed shown); a hit calls back once and disarms', () => {
    for (const newApi of [true, false]) {
      const { pick } = setup(newApi);
      const onPick = jasmine.createSpy('onPick');
      pick.arm({ id: 'ik-pole', label: 'Tap the pole joint', onPick });
      expect(pick.isArmed('ik-pole')).toBeTrue();
      expect(pick.resolve(10, 290)).toBeFalse();
      expect(pick.missed).toBeTrue();
      expect(pick.isArmed('ik-pole')).toBeTrue();
      expect(pick.resolve(302, 52)).toBeTrue();
      expect(onPick).toHaveBeenCalledOnceWith(1, 'hand_L');
      expect(pick.pending).toBeNull();
      pick.ngOnDestroy();
    }
  });

  it('the same button again disarms it', () => {
    const { pick } = setup(true);
    const req = { id: 'weight-joint', label: 'Tap', onPick: jasmine.createSpy('onPick') };
    pick.arm(req);
    pick.arm(req);
    expect(pick.pending).toBeNull();
    pick.ngOnDestroy();
  });

  it('a canvas press while armed is taken before the engine sees it (pointer + compat mouse events)', () => {
    const { pick } = setup(true);
    document.body.appendChild(pick.canvas!);
    const seen: string[] = [];
    const engine = (e: Event) => seen.push(e.type);
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'click']) pick.canvas!.addEventListener(t, engine, true);
    const onPick = jasmine.createSpy('onPick');
    pick.arm({ id: 'constraint-target', label: 'Tap', onPick });
    const opts = { bubbles: true, cancelable: true, clientX: 300, clientY: 50, pointerId: 7, pointerType: 'touch', button: 0 };
    pick.canvas!.dispatchEvent(new PointerEvent('pointerdown', opts));
    pick.canvas!.dispatchEvent(new PointerEvent('pointerup', opts));
    pick.canvas!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    pick.canvas!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(seen).toEqual([]);
    expect(onPick).toHaveBeenCalledOnceWith(1, 'hand_L');
    pick.ngOnDestroy();
    pick.canvas!.remove();
  });

  it('the old dist projection pick: nearest joint within 24 px', () => {
    const pos = [{ index: 0, name: 'a', x: 10, y: 10 }, { index: 1, name: 'b', x: 30, y: 10 }];
    expect(pickJointFromScreenPositions(pos, { left: 100, top: 50 }, 128, 61)).toEqual({ jointIndex: 1, jointName: 'b' });
    expect(pickJointFromScreenPositions(pos, { left: 100, top: 50 }, 300, 300)).toBeNull();
  });
});
