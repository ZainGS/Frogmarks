import { discArtHint, fallbackDiscSeed, pinchZoom, cartDiscEngine, discZoomFromSlider, discSliderFromZoom, discDrawRects, DISC_ZOOM_STEPS } from './cart-disc-art';

describe('cart-disc-art helpers', () => {
  it('pinch zoom scales with the finger spread, clamped to 1..max', () => {
    expect(pinchZoom(1, 100, 200)).toBe(2);
    expect(pinchZoom(2, 200, 50)).toBe(1);
    expect(pinchZoom(3, 100, 1000, 4)).toBe(4);
    expect(pinchZoom(1.5, 0, 100)).toBe(1.5);
  });

  it('a stable seed per id (uint32), a random one without', () => {
    expect(fallbackDiscSeed('42')).toBe(fallbackDiscSeed('42'));
    expect(fallbackDiscSeed('42')).not.toBe(fallbackDiscSeed('43'));
    const r = fallbackDiscSeed();
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(4294967296);
  });

  it('hints per mode', () => {
    expect(discArtHint('pattern', false)).toBe('');   // no helper line under Pattern
    expect(discArtHint('image', false)).toContain('Choose an image');
    expect(discArtHint('image', true)).toContain('Drag');
    expect(discArtHint('snapshot', false)).toContain('Capturing');
  });

  it('feature-detects the engine', () => {
    expect(cartDiscEngine(null).cartDisc).toBeUndefined();
    expect(cartDiscEngine({ cartDisc: { MAX_ZOOM: 8 } }).cartDisc).toBeDefined();
  });

  it('zoom slider: the middle is 1 (cover), up to max above, down to min below; the inverse round-trips', () => {
    expect(discZoomFromSlider(DISC_ZOOM_STEPS / 2, 0.5, 4)).toBe(1);
    expect(discZoomFromSlider(DISC_ZOOM_STEPS, 0.5, 4)).toBeCloseTo(4, 6);
    expect(discZoomFromSlider(0, 0.5, 4)).toBeCloseTo(0.5, 6);
    expect(discSliderFromZoom(1, 0.5, 4)).toBe(500);
    for (const z of [0.5, 0.7, 1, 1.5, 3, 4]) expect(discZoomFromSlider(discSliderFromZoom(z, 0.5, 4), 0.5, 4)).toBeCloseTo(z, 2);
    // an older engine (no zoom below 1): the lower half stays at 1
    expect(discZoomFromSlider(100, 1, 4)).toBe(1);
  });

  it('zoomed-out crops draw the image smaller, clipped to the image', () => {
    expect(discDrawRects(400, 400, { sx: -200, sy: -200, sw: 800, sh: 800 }, 512, 512))
      .toEqual({ sx: 0, sy: 0, sw: 400, sh: 400, dx: 128, dy: 128, dw: 256, dh: 256 });
    expect(discDrawRects(400, 400, { sx: 0, sy: 0, sw: 400, sh: 400 }, 100, 100)).toEqual({ sx: 0, sy: 0, sw: 400, sh: 400, dx: 0, dy: 0, dw: 100, dh: 100 });
  });
});
