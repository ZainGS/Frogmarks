import {
  DITHER_ALGORITHM_OPTIONS, HALFTONE_SHAPE_GROUPS, HALFTONE_SHAPE_OPTIONS, ditherAlgorithmMenuValue, halftoneShapeGroupsFor,
  isHalftoneAlgorithm, resolveDitherAlgorithmMenuChoice,
} from 'app/boards/models/brush-preset.model';
import { LayerEffectsHost, LayerEffectsService } from './layer-effects.service';

// The dither Algorithm dropdown has ONE "Halftone" entry; the shape lives in the Halftone section's Shape dropdown.
// The stored value stays the engine's 'halftone_<shape>' algorithm, so old documents show the right shape.

describe('Dither menu: Halftone entry + Shape dropdown', () => {
  it('the Algorithm dropdown lists Halftone once and no "Halftone ..." lines', () => {
    const labels = DITHER_ALGORITHM_OPTIONS.map(o => o.label);
    expect(labels.filter(l => l.startsWith('Halftone'))).toEqual(['Halftone']);
    expect(DITHER_ALGORITHM_OPTIONS.find(o => o.label === 'Halftone')!.value).toBe('halftone');
  });

  it('Shape groups: Classic / Sketch / Graphic with all 14 shapes, each once', () => {
    expect(HALFTONE_SHAPE_GROUPS.map(g => g.label)).toEqual(['Classic', 'Sketch', 'Graphic']);
    expect(HALFTONE_SHAPE_GROUPS[0].options.map(o => o.label)).toEqual(['Dot', 'Line', 'Diamond', 'Ellipse', 'Square']);
    expect(HALFTONE_SHAPE_GROUPS[1].options.map(o => o.label)).toEqual(['Crosshatch', 'Wavy lines']);
    expect(HALFTONE_SHAPE_GROUPS[2].options.map(o => o.label)).toEqual(['Rings', 'Spiral', 'Hexagon', 'Star', 'Heart', 'Triangle', 'Cross']);
    const values = HALFTONE_SHAPE_OPTIONS.map(o => o.value);
    expect(values.length).toBe(14);
    expect(new Set(values).size).toBe(14);
    expect(values.every(v => isHalftoneAlgorithm(v))).toBe(true);
  });

  it('stored algorithm -> menu: every halftone shape (old and new) shows as Halftone, others unchanged', () => {
    for (const a of ['halftone_dot', 'halftone_line', 'halftone_diamond', 'halftone_star', 'halftone_spiral'] as const) {
      expect(ditherAlgorithmMenuValue(a)).toBe('halftone');
    }
    expect(ditherAlgorithmMenuValue('bayer')).toBe('bayer');
    expect(ditherAlgorithmMenuValue('floyd_steinberg')).toBe('floyd_steinberg');
  });

  it('menu -> stored algorithm: Halftone resumes the last shape (default Dot), others pass through', () => {
    expect(resolveDitherAlgorithmMenuChoice('halftone')).toBe('halftone_dot');
    expect(resolveDitherAlgorithmMenuChoice('halftone', 'halftone_heart')).toBe('halftone_heart');
    expect(resolveDitherAlgorithmMenuChoice('halftone', 'bayer')).toBe('halftone_dot');
    expect(resolveDitherAlgorithmMenuChoice('blue_noise', 'halftone_heart')).toBe('blue_noise');
  });

  it('feature-detect: an older engine list hides the new shapes but keeps the current one; no list shows all', () => {
    const old = ['bayer', 'halftone_dot', 'halftone_line', 'halftone_diamond', 'blue_noise', 'noise'];
    const flat = (g: ReturnType<typeof halftoneShapeGroupsFor>) => g.flatMap(x => x.options.map(o => o.value));
    expect(flat(halftoneShapeGroupsFor(old, 'halftone_dot'))).toEqual(['halftone_dot', 'halftone_line', 'halftone_diamond']);
    expect(halftoneShapeGroupsFor(old, 'halftone_dot').map(g => g.label)).toEqual(['Classic']);
    expect(flat(halftoneShapeGroupsFor(old, 'halftone_star'))).toContain('halftone_star');
    expect(halftoneShapeGroupsFor(null, 'halftone_dot')).toBe(HALFTONE_SHAPE_GROUPS);
  });
});

describe('LayerEffectsService: Algorithm / Shape round trip', () => {
  function make() {
    const sent: string[] = [];
    const layerSent: (string | undefined)[] = [];
    const sm = {
      setDitherAlgorithm: (a: string) => sent.push(a),
      setLayerDitherConfig: (_id: string, cfg: { algorithm: string } | undefined) => { layerSent.push(cfg?.algorithm); return true; },
    };
    const host: LayerEffectsHost = {
      shapeManager: () => sm as never, markStateDirty: () => {}, penColor: () => '#000000', ensureAnimationMode: () => {},
    };
    const fx = new LayerEffectsService();
    fx.bind(host);
    return { fx, sent, layerSent };
  }

  it('global: shape pick is stored as the halftone algorithm; leaving and re-picking Halftone keeps it', () => {
    const { fx, sent } = make();
    fx.onDitherAlgorithmChange('bayer');
    fx.onDitherAlgorithmChange('halftone');
    expect(fx.ditherConfig.algorithm).toBe('halftone_dot');
    fx.onDitherHalftoneShapeChange('halftone_star');
    expect(fx.ditherMenuValue(fx.ditherConfig.algorithm)).toBe('halftone');
    fx.onDitherAlgorithmChange('noise');
    fx.onDitherAlgorithmChange('halftone');
    expect(fx.ditherConfig.algorithm).toBe('halftone_star');
    expect(sent).toEqual(['bayer', 'halftone_dot', 'halftone_star', 'noise', 'halftone_star']);
  });

  it('a loaded document keeps its shape: switching away and back resumes it', () => {
    const { fx } = make();
    fx.ditherConfig.algorithm = 'halftone_diamond';   // as _applyDitherConfig leaves it for an old document
    expect(fx.ditherMenuValue(fx.ditherConfig.algorithm)).toBe('halftone');
    fx.onDitherAlgorithmChange('bayer');
    fx.onDitherAlgorithmChange('halftone');
    expect(fx.ditherConfig.algorithm).toBe('halftone_diamond');
  });

  it('per layer: the last shape is remembered per layer; every halftone shape counts as GPU (edge effects shown)', () => {
    const { fx, layerSent } = make();
    fx.onLayerDitherEnabledChange('L1', true);
    fx.onLayerDitherHalftoneShapeChange('L1', 'halftone_hexagon');
    fx.onLayerDitherAlgorithmChange('L1', 'atkinson');
    expect(fx.isGpuDitherAlgorithm(fx.getLayerDitherConfig('L1').algorithm)).toBe(false);
    fx.onLayerDitherAlgorithmChange('L1', 'halftone');
    expect(fx.getLayerDitherConfig('L1').algorithm).toBe('halftone_hexagon');
    expect(fx.isGpuDitherAlgorithm('halftone_hexagon')).toBe(true);
    expect(fx.isGpuDitherAlgorithm('halftone_dot')).toBe(true);
    expect(fx.isGpuDitherAlgorithm('bayer')).toBe(true);
    expect(layerSent[layerSent.length - 1]).toBe('halftone_hexagon');
  });
});
