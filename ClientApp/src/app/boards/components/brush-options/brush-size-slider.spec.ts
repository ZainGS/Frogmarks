import { SIZE_SLIDER_STEPS, sizeFromSlider, sliderFromSize } from './brush-size-slider';

describe('non-linear brush size slider', () => {
  it('spans 1–500 px end to end', () => {
    expect(sizeFromSlider(0)).toBe(1);
    expect(sizeFromSlider(SIZE_SLIDER_STEPS)).toBe(500);
    expect(sizeFromSlider(-5)).toBe(1);
    expect(sizeFromSlider(SIZE_SLIDER_STEPS * 2)).toBe(500);
  });

  it('gives small sizes most of the travel', () => {
    // Half the slider stays under 100 px; a linear 1–500 slider would be at ~250 px there
    expect(sizeFromSlider(SIZE_SLIDER_STEPS / 2)).toBeLessThan(100);
    // 1–40 px gets over a quarter of the travel (it was 8 % linear)
    expect(sliderFromSize(40)).toBeGreaterThan(SIZE_SLIDER_STEPS / 4);
  });

  it('round-trips a size through the slider position', () => {
    for (const s of [1, 2, 5, 12, 24, 64, 128, 300, 500]) {
      expect(Math.abs(sizeFromSlider(sliderFromSize(s)) - s)).toBeLessThanOrEqual(Math.max(1, s * 0.01));
    }
  });
});
