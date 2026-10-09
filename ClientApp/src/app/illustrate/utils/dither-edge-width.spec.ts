import {
  EDGE_SLIDER_STEPS, EDGE_WIDTH_MAX_PX, clampEdgeWidthPx, edgePctToPx, edgePxToPct, edgePxToSlider, edgeSliderToPx,
} from './dither-edge-width';

describe('dither edge width control', () => {
  it('the slider is non-linear: fine at small widths, reaching the max', () => {
    expect(edgeSliderToPx(0)).toBe(0);
    expect(edgeSliderToPx(EDGE_SLIDER_STEPS)).toBe(EDGE_WIDTH_MAX_PX);
    expect(edgeSliderToPx(100)).toBe(20);                    // the first tenth of the track covers 0–20 px
    expect(edgeSliderToPx(500)).toBe(512);
    expect(edgeSliderToPx(-5)).toBe(0);
    expect(edgeSliderToPx(5000)).toBe(EDGE_WIDTH_MAX_PX);
  });

  it('px → slider → px lands on (or within a px of) the same width', () => {
    for (const px of [0, 1, 3, 8, 20, 64, 100, 333, 1000, 2048]) {
      expect(Math.abs(edgeSliderToPx(edgePxToSlider(px)) - px)).toBeLessThanOrEqual(Math.max(1, px * 0.01));
    }
  });

  it('typed values are clamped to whole px in range', () => {
    expect(clampEdgeWidthPx(NaN)).toBe(0);
    expect(clampEdgeWidthPx(-3)).toBe(0);
    expect(clampEdgeWidthPx(12.6)).toBe(13);
    expect(clampEdgeWidthPx(99999)).toBe(EDGE_WIDTH_MAX_PX);
  });

  it('Canvas mode: % of the shorter page side', () => {
    expect(edgePctToPx(10, 1080)).toBe(108);
    expect(edgePxToPct(108, 1080)).toBe(10);
    expect(edgePctToPx(80, 1080)).toBe(540);                 // capped at 50 %
    expect(edgePctToPx(5, 0)).toBe(0);                       // no page size (infinite canvas)
    expect(edgePxToPct(50, 0)).toBe(0);
  });
});
