import { MultiFingerTap, TapPointer, attachMultiFingerTap } from './multi-finger-tap';

const touch = (pointerId: number, t: number, x = 100, y = 100): TapPointer =>
  ({ pointerId, pointerType: 'touch', clientX: x, clientY: y, timeStamp: t });

/** Fingers land at `downs` ms, lift at `ups` ms (same positions); returns what the last lift reports. */
function tap(det: MultiFingerTap, downs: number[], ups: number[]): string | null {
  downs.forEach((t, i) => det.down(touch(i + 1, t, 100 + i * 60), true));
  let out: string | null = null;
  ups.forEach((t, i) => { out = det.up(touch(i + 1, t, 100 + i * 60)) ?? out; });
  return out;
}

describe('MultiFingerTap (two-finger tap = undo, three-finger tap = redo)', () => {
  it('a quick, still two-finger tap is undo; three fingers is redo', () => {
    expect(tap(new MultiFingerTap(), [0, 30], [120, 140])).toBe('undo');
    expect(tap(new MultiFingerTap(), [0, 20, 50], [150, 160, 170])).toBe('redo');
  });

  it('one finger, or four, is nothing', () => {
    expect(tap(new MultiFingerTap(), [0], [100])).toBeNull();
    expect(tap(new MultiFingerTap(), [0, 10, 20, 30], [100, 110, 120, 130])).toBeNull();
  });

  it('reports only when the LAST finger lifts', () => {
    const det = new MultiFingerTap();
    det.down(touch(1, 0), true);
    det.down(touch(2, 20, 160), true);
    expect(det.up(touch(1, 100))).toBeNull();
    expect(det.up(touch(2, 110, 160))).toBe('undo');
  });

  it('a pinch / two-finger pan (a finger moves) is not a tap', () => {
    const det = new MultiFingerTap();
    det.down(touch(1, 0), true);
    det.down(touch(2, 20, 160), true);
    det.move(touch(2, 60, 160 + MultiFingerTap.MOVE_PX + 5));
    expect(det.up(touch(1, 100))).toBeNull();
    expect(det.up(touch(2, 120, 200))).toBeNull();
  });

  it('a small wobble is still a tap', () => {
    const det = new MultiFingerTap();
    det.down(touch(1, 0), true);
    det.down(touch(2, 20, 160), true);
    det.move(touch(1, 50, 104, 103));
    det.up(touch(1, 100, 105, 104));
    expect(det.up(touch(2, 120, 160))).toBe('undo');
  });

  it('a finger joining a stroke already under way is not a tap (fingers must land together)', () => {
    expect(tap(new MultiFingerTap(), [0, MultiFingerTap.LAND_MS + 50], [400, 420])).toBeNull();
  });

  it('a long press is not a tap', () => {
    expect(tap(new MultiFingerTap(), [0, 20], [MultiFingerTap.MAX_MS + 10, MultiFingerTap.MAX_MS + 20])).toBeNull();
  });

  it('a pen or mouse pointer down at any point spoils it (palm while drawing)', () => {
    const det = new MultiFingerTap();
    det.down({ pointerId: 9, pointerType: 'pen', clientX: 0, clientY: 0, timeStamp: 0 }, true);
    expect(tap(det, [10, 30], [120, 130])).toBeNull();
    det.up({ pointerId: 9, pointerType: 'pen', clientX: 0, clientY: 0, timeStamp: 140 });
    expect(tap(det, [200, 220], [300, 310])).toBe('undo');   // the pen lifted: taps work again
  });

  it('must start on the canvas; a cancelled pointer spoils it; the next tap is fresh', () => {
    const det = new MultiFingerTap();
    det.down(touch(1, 0), false);
    det.down(touch(2, 10, 160), true);
    det.up(touch(1, 80));
    expect(det.up(touch(2, 90, 160))).toBeNull();

    det.down(touch(3, 200), true);
    det.down(touch(4, 210, 160), true);
    det.cancel(touch(3, 250));
    expect(det.up(touch(4, 260, 160))).toBeNull();

    expect(tap(det, [500, 510], [600, 610])).toBe('undo');
  });

  it('attachMultiFingerTap: window pointer events → onTap, unless blocked; detach stops it', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const taps: string[] = [];
    let blocked = false;
    const detach = attachMultiFingerTap(window, { isCanvas: t => t === canvas, blocked: () => blocked, onTap: a => taps.push(a) });
    const fire = (type: string, id: number, x: number) =>
      canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: 50, bubbles: true }));
    const twoFingerTap = () => { fire('pointerdown', 1, 50); fire('pointerdown', 2, 120); fire('pointerup', 1, 50); fire('pointerup', 2, 120); };
    twoFingerTap();
    expect(taps).toEqual(['undo']);
    blocked = true;
    twoFingerTap();
    expect(taps).toEqual(['undo']);
    blocked = false;
    detach();
    twoFingerTap();
    expect(taps).toEqual(['undo']);
    canvas.remove();
  });
});
