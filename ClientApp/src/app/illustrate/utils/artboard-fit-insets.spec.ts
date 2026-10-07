import { ARTBOARD_FIT_FILL, computeArtboardFitFallback, fitInsetsWithFloating, fittedArtboardRect, visibleCanvasInsets } from './artboard-fit-insets';

const R = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });

/** Screen rect (CSS px) of the artboard for a fit, with the InteractionService mapping (pan / 2 device px). */
function artboardRect(fit: { zoom: number; panX: number; panY: number }, cw: number, ch: number, dpr: number, aspect: number) {
  const h = fit.zoom * ch, w = h * aspect;
  const cx = cw / 2 + fit.panX / 2 / dpr, cy = ch / 2 + fit.panY / 2 / dpr;
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2, w, h };
}

describe('artboard fit into the visible canvas (ui-review 2026-10-07 #10)', () => {
  // Tablet portrait 820 × 1180: rail, top bar, brush sub-panel open, timeline + colour picker along the bottom.
  const canvas = R(0, 0, 820, 1180);
  const rail = R(0, 0, 70, 1180);
  const topBar = R(70, 0, 750, 40);
  const subPanel = R(70, 40, 250, 936);
  const picker = R(70, 976, 250, 204);
  const timeline = R(320, 976, 500, 204);

  it('turns the rail, top bar, sub-panel and bottom band into one inset per side', () => {
    const ins = visibleCanvasInsets(canvas, [rail, topBar, subPanel, picker, timeline], 1080 / 1440);
    expect(ins).toEqual({ left: 320, top: 40, right: 0, bottom: 204 });
  });

  it('a bottom-left block becomes a LEFT inset for a tall page and a BOTTOM inset for a wide one', () => {
    const desk = R(0, 0, 1400, 900);
    const deskRail = R(0, 0, 70, 900), deskTop = R(70, 0, 1330, 40), deskRight = R(1116, 40, 284, 860);
    const deskPicker = R(70, 696, 250, 204);
    const tall = visibleCanvasInsets(desk, [deskRail, deskTop, deskRight, deskPicker], 1080 / 1440);
    expect(tall.left).toBe(320);
    expect(tall.bottom).toBe(0);
    const wide = visibleCanvasInsets(desk, [deskRail, deskTop, deskRight, deskPicker], 1920 / 1080);
    expect(wide.left).toBe(70);
    expect(wide.bottom).toBe(204);
    expect(wide.right).toBe(284);
  });

  it('ignores hidden (0 × 0) and off-canvas obstacles', () => {
    expect(visibleCanvasInsets(canvas, [R(0, 0, 0, 0), R(900, 0, 100, 100)], 1)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('the fit puts the whole artboard inside the visible area, centred, at any device pixel ratio', () => {
    const insets = visibleCanvasInsets(canvas, [rail, topBar, subPanel, picker, timeline], 1080 / 1440);
    for (const dpr of [1, 2]) {
      const fit = computeArtboardFitFallback({ cssWidth: 820, cssHeight: 1180, pxWidth: 820 * dpr, pxHeight: 1180 * dpr, docWidth: 1080, docHeight: 1440, insets });
      const r = artboardRect(fit, 820, 1180, dpr, 1080 / 1440);
      expect(r.left).toBeGreaterThanOrEqual(320);
      expect(r.right).toBeLessThanOrEqual(820);
      expect(r.top).toBeGreaterThanOrEqual(40);
      expect(r.bottom).toBeLessThanOrEqual(976);
      expect((r.left + r.right) / 2).toBeCloseTo(570, 6);
      expect(r.w).toBeCloseTo(500 * ARTBOARD_FIT_FILL, 6);
    }
  });

  it('without insets it is the old fit (zoom 0.85, no pan) when the page height is the limit', () => {
    expect(computeArtboardFitFallback({ cssWidth: 1400, cssHeight: 900, pxWidth: 1400, pxHeight: 900, docWidth: 1080, docHeight: 1440 }))
      .toEqual({ zoom: ARTBOARD_FIT_FILL, panX: 0, panY: 0 });
  });
});

describe('floating UI (zoom box, drawer handle) and the fit', () => {
  const canvas = R(0, 0, 1400, 900);
  const docked = [R(0, 0, 70, 900), R(70, 0, 1330, 40), R(1116, 40, 284, 656), R(70, 696, 250, 204), R(320, 696, 1080, 204)];

  it('a zoom box in the margin beside the page does not shift it', () => {
    const zoomBox = R(1040, 616, 70, 70);
    const withFloat = fitInsetsWithFloating(canvas, docked, [zoomBox], 1080 / 1440);
    expect(withFloat).toEqual(visibleCanvasInsets(canvas, docked, 1080 / 1440));
  });

  it('a zoom box the page would sit under is avoided', () => {
    const zoomBox = R(1000, 600, 70, 70);
    expect(fitInsetsWithFloating(canvas, docked, [], 1920 / 1080)).not.toEqual(fitInsetsWithFloating(canvas, docked, [zoomBox], 1920 / 1080));
    const ins = fitInsetsWithFloating(canvas, docked, [zoomBox], 1920 / 1080);   // a wide page reaches the corner
    const art = fittedArtboardRect(1400, 900, ins, 1920 / 1080);
    const overlaps = zoomBox.left < art.right && zoomBox.right > art.left && zoomBox.top < art.bottom && zoomBox.bottom > art.top;
    expect(overlaps).toBeFalse();
  });
});
