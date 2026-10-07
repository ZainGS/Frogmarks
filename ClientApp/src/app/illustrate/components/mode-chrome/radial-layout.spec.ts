import { RADIAL_ITEM_H, RADIAL_ITEM_W, computeRadialLayout, radialPickIndex, radialRadius } from './radial-layout';

describe('radial layout', () => {
  it('rings the press point, first item at the top, clockwise', () => {
    const l = computeRadialLayout({ count: 4, x: 500, y: 400, viewportW: 1000, viewportH: 800 });
    expect(l.cx).toBe(500);
    expect(l.cy).toBe(400);
    const [top, right, bottom, left] = l.items;
    expect(top.x).toBeCloseTo(500, 6);
    expect(top.y).toBeCloseTo(400 - l.radius, 6);
    expect(right.x).toBeCloseTo(500 + l.radius, 6);
    expect(bottom.y).toBeCloseTo(400 + l.radius, 6);
    expect(left.x).toBeCloseTo(500 - l.radius, 6);
  });

  it('grows the ring so neighbouring items do not overlap', () => {
    expect(radialRadius(4)).toBe(78);
    const r8 = radialRadius(8);
    const gap = 2 * r8 * Math.sin(Math.PI / 8);
    expect(gap).toBeGreaterThanOrEqual(RADIAL_ITEM_W);
  });

  it('is moved inside the viewport near an edge / corner', () => {
    const vw = 400, vh = 300;
    const l = computeRadialLayout({ count: 6, x: 2, y: 298, viewportW: vw, viewportH: vh, margin: 8 });
    for (const it of l.items) {
      expect(it.x - RADIAL_ITEM_W / 2).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(it.x + RADIAL_ITEM_W / 2).toBeLessThanOrEqual(vw - 8 + 1e-6);
      expect(it.y - RADIAL_ITEM_H / 2).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(it.y + RADIAL_ITEM_H / 2).toBeLessThanOrEqual(vh - 8 + 1e-6);
    }
  });

  it('leaves room for a title above the ring', () => {
    const l = computeRadialLayout({ count: 4, x: 300, y: 0, viewportW: 800, viewportH: 800, titleH: 30 });
    expect(l.items[0].y - RADIAL_ITEM_H / 2).toBeGreaterThanOrEqual(8 + 30 - 1e-6);
  });

  it('centres the ring when the viewport is smaller than it', () => {
    const l = computeRadialLayout({ count: 8, x: 10, y: 10, viewportW: 200, viewportH: 150 });
    expect(l.cx).toBe(100);
    expect(l.cy).toBe(75);
  });

  it('picks by direction, nothing in the centre dead zone, skipping disabled items', () => {
    const l = computeRadialLayout({ count: 4, x: 500, y: 400, viewportW: 1000, viewportH: 800 });
    expect(radialPickIndex(l, 500, 300)).toBe(0);          // up
    expect(radialPickIndex(l, 560, 410)).toBe(1);          // right-ish
    expect(radialPickIndex(l, 505, 900)).toBe(2);          // far below (past the ring still counts)
    expect(radialPickIndex(l, 380, 400)).toBe(3);          // left
    expect(radialPickIndex(l, 510, 405)).toBe(-1);         // centre
    expect(radialPickIndex(l, 500, 300, 26, i => i === 0)).not.toBe(0);
    expect(radialPickIndex({ cx: 0, cy: 0, radius: 78, items: [] }, 100, 0)).toBe(-1);
  });
});
