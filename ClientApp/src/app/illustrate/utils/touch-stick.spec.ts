import { radialDeadzone, stickFromOffset } from './touch-stick';

describe('touch stick', () => {
  it('zeroes inside the dead zone and rescales outside it', () => {
    expect(radialDeadzone(0.05, 0.05, 0.12)).toEqual([0, 0]);
    const [x, y] = radialDeadzone(1, 0, 0.12);
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBe(0);
    const [hx] = radialDeadzone(0.56, 0, 0.12);
    expect(hx).toBeCloseTo(0.5, 6);
  });

  it('maps finger up to forward and right to right', () => {
    const up = stickFromOffset(0, -60, 60);
    expect(up.forward).toBeCloseTo(1, 6);
    expect(up.right).toBe(0);
    const right = stickFromOffset(60, 0, 60);
    expect(right.right).toBeCloseTo(1, 6);
    expect(right.forward).toBe(0);
    const back = stickFromOffset(0, 60, 60);
    expect(back.forward).toBeCloseTo(-1, 6);
  });

  it('clamps the knob to the base radius and the intent to the unit circle', () => {
    const s = stickFromOffset(300, -400, 50);
    expect(Math.hypot(s.knobX, s.knobY)).toBeCloseTo(50, 6);
    expect(Math.hypot(s.forward, s.right)).toBeCloseTo(1, 6);
    expect(s.right).toBeCloseTo(0.6, 6);
    expect(s.forward).toBeCloseTo(0.8, 6);
  });

  it('is still inside the dead zone', () => {
    const s = stickFromOffset(3, 2, 60);
    expect(s.forward).toBe(0);
    expect(s.right).toBe(0);
  });
});
