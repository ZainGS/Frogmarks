import { LayerEffectsService } from './layer-effects.service';

/** Per-Channel / Invert Colors show only where they do something: ordered (GPU) algorithms in Quantize mode. */
describe('LayerEffectsService.ditherChannelOptionsApply', () => {
  const fx = Object.create(LayerEffectsService.prototype) as LayerEffectsService;

  it('ordered algorithms in Quantize mode: shown', () => {
    for (const algorithm of ['bayer', 'blue_noise', 'noise', 'halftone_dot', 'halftone_line'] as const) {
      expect(fx.ditherChannelOptionsApply({ algorithm, colorMode: 'quantize' } as never)).withContext(algorithm).toBeTrue();
    }
  });

  it('Duotone mode or error diffusion: hidden', () => {
    expect(fx.ditherChannelOptionsApply({ algorithm: 'bayer', colorMode: 'duotone' } as never)).toBeFalse();
    for (const algorithm of ['floyd_steinberg', 'atkinson', 'jarvis_judice_ninke', 'stucki', 'sierra', 'sierra_lite']) {
      expect(fx.ditherChannelOptionsApply({ algorithm, colorMode: 'quantize' } as never)).withContext(algorithm).toBeFalse();
    }
  });
});
