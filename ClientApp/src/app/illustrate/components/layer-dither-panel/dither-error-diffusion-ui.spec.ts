import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { LayerDitherPanelComponent } from './layer-dither-panel.component';
import { DitherOptionsComponent } from '../dither-options/dither-options.component';
import { LayerEffectsService } from '../../services/layer-effects.service';
import { DEFAULT_DITHER_CONFIG, DITHER_ALGORITHM_OPTIONS, DitherConfig } from 'app/boards/models/brush-preset.model';

const ED = ['floyd_steinberg', 'atkinson', 'jarvis_judice_ninke', 'stucki', 'sierra', 'sierra_lite'] as const;

/** A LayerEffectsService with the real dither helpers and no editor host (no engine). */
function fxWith(cfg: DitherConfig): LayerEffectsService {
  const fx = Object.create(LayerEffectsService.prototype) as LayerEffectsService;
  Object.defineProperty(fx, 'shapeManager', { value: null });
  Object.assign(fx, {
    layerDitherConfigs: new Map([['L1', cfg]]),
    ditherConfig: cfg,
    ditherAlgorithmOptions: DITHER_ALGORITHM_OPTIONS,
    bakingLayerDither: false,
    pageMinSide: () => 0,
    halftoneShapeGroups: () => [],
  });
  return fx;
}

describe('Dither panels: error diffusion hides Mode / Duotone / Scale (UI audit 2026-10-09)', () => {
  const cfgOf = (patch: Partial<DitherConfig>): DitherConfig => ({ ...DEFAULT_DITHER_CONFIG, enabled: true, ...patch } as DitherConfig);

  it('helpers: Mode + Scale apply to the ordered algorithms only; a stored Duotone is suspended under error diffusion', () => {
    const fx = fxWith(cfgOf({}));
    for (const algorithm of ['bayer', 'blue_noise', 'noise', 'halftone_dot'] as const) {
      expect(fx.ditherModeApplies({ algorithm })).withContext(algorithm).toBeTrue();
      expect(fx.ditherScaleApplies({ algorithm })).withContext(algorithm).toBeTrue();
      expect(fx.ditherDuotoneActive({ algorithm, colorMode: 'duotone' })).withContext(algorithm).toBeTrue();
      expect(fx.ditherDuotoneSuspended({ algorithm, colorMode: 'duotone' })).withContext(algorithm).toBeFalse();
    }
    for (const algorithm of ED) {
      expect(fx.ditherModeApplies({ algorithm })).withContext(algorithm).toBeFalse();
      expect(fx.ditherScaleApplies({ algorithm })).withContext(algorithm).toBeFalse();
      expect(fx.ditherDuotoneActive({ algorithm, colorMode: 'duotone' })).withContext(algorithm).toBeFalse();
      expect(fx.ditherDuotoneSuspended({ algorithm, colorMode: 'duotone' })).withContext(algorithm).toBeTrue();
      expect(fx.ditherDuotoneSuspended({ algorithm, colorMode: 'quantize' })).withContext(algorithm).toBeFalse();
    }
  });

  async function render(component: typeof LayerDitherPanelComponent | typeof DitherOptionsComponent, cfg: DitherConfig) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [component],
      imports: [CommonModule, FormsModule],
      providers: [{ provide: LayerEffectsService, useValue: fxWith(cfg) }],
    }).compileComponents();
    const fixture = TestBed.createComponent(component as any);
    if (component === LayerDitherPanelComponent) (fixture.componentInstance as LayerDitherPanelComponent).selectedRasterLayerId = 'L1';
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const labels = Array.from(el.querySelectorAll('label')).map(l => (l.textContent ?? '').trim());
    return { el, labels };
  }

  for (const [name, component] of [['layer panel', LayerDitherPanelComponent], ['global options', DitherOptionsComponent]] as const) {
    it(`${name}: error diffusion with a stored Duotone shows no Mode / Duotone / Scale, and says why`, async () => {
      const t = await render(component, cfgOf({ algorithm: 'floyd_steinberg', colorMode: 'duotone' }));
      expect(t.labels).not.toContain('Mode');
      expect(t.labels).not.toContain('Scale');
      expect(t.labels).not.toContain('Tint');
      expect(t.labels).not.toContain('Bias');
      expect(t.labels).toContain('Strength');
      expect(t.el.querySelector('.dither-note')?.textContent).toContain('Duotone needs an ordered algorithm');
    });

    it(`${name}: an ordered Duotone shows Mode, Scale and the duotone controls, with distinct Strength / Tint tooltips`, async () => {
      const t = await render(component, cfgOf({ algorithm: 'bayer', colorMode: 'duotone' }));
      expect(t.labels).toContain('Mode');
      expect(t.labels).toContain('Scale');
      expect(t.labels).toContain('Tint');
      expect(t.el.querySelector('.dither-note')).toBeNull();
      const label = (text: string) => Array.from(t.el.querySelectorAll('label')).find(l => (l.textContent ?? '').trim() === text)!;
      expect(label('Strength').title).toContain('dot pattern');
      expect(label('Tint').title).toContain('replace the original');
    });

    it(`${name}: error diffusion in Quantize mode: no note`, async () => {
      const t = await render(component, cfgOf({ algorithm: 'atkinson', colorMode: 'quantize' }));
      expect(t.el.querySelector('.dither-note')).toBeNull();
      expect(t.labels).not.toContain('Scale');
    });
  }
});
