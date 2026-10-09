import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { FrameLinkPanelComponent } from './frame-link-panel.component';
import { LayerEffectsService } from '../../services/layer-effects.service';
import {
  DEFAULT_FRAME_LINK_ANIMATION, FRAME_LINK_LOOP_MODE_OPTIONS, FRAME_LINK_TYPE_OPTIONS, FrameLinkAnimation, FrameLinkAnimationType,
} from '../../../boards/models/brush-preset.model';

describe('FrameLinkPanelComponent per-type fields (UI audit 2026-10-09)', () => {
  async function render(type: FrameLinkAnimationType, loopMode: FrameLinkAnimation['loopMode'] = 'free') {
    const cfg: FrameLinkAnimation = { ...DEFAULT_FRAME_LINK_ANIMATION, enabled: true, type, loopMode };
    const fx = {
      getLayerFrameLinkConfig: () => cfg,
      frameLinkTypeOptions: FRAME_LINK_TYPE_OPTIONS,
      frameLinkLoopModeOptions: FRAME_LINK_LOOP_MODE_OPTIONS,
    };
    await TestBed.configureTestingModule({
      declarations: [FrameLinkPanelComponent],
      imports: [CommonModule, FormsModule],
      providers: [{ provide: LayerEffectsService, useValue: fx }],
    }).compileComponents();
    const fixture = TestBed.createComponent(FrameLinkPanelComponent);
    fixture.componentInstance.selectedRasterLayerId = 'L1';
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const labels = Array.from(el.querySelectorAll('label')).map(l => (l.textContent ?? '').trim());
    return { el, labels, comp: fixture.componentInstance };
  }

  it('Shake: no Speed, Phase or Direction (it reads only the frame and the seed)', async () => {
    const t = await render('shake');
    expect(t.labels).not.toContain('Speed');
    expect(t.labels).not.toContain('Phase');
    expect(t.labels).not.toContain('Direction');
    expect(t.labels).toContain('Amplitude');
    expect(t.labels).toContain('Loop');
    expect(t.labels).toContain('Seed');
  });

  it('Direction only for Wave; Speed + Phase for every other type', async () => {
    for (const type of ['wave', 'ripple', 'noise', 'turbulence'] as const) {
      TestBed.resetTestingModule();
      const t = await render(type);
      expect(t.labels.includes('Direction')).withContext(type).toBe(type === 'wave');
      expect(t.labels).withContext(type).toContain('Speed');
      expect(t.labels).withContext(type).toContain('Phase');
    }
  });

  it('the Loop tooltip says what each mode does for the type', async () => {
    const t = await render('wave', 'loop-to-fit');
    const sel = t.el.querySelectorAll('select')[1] as HTMLSelectElement;
    expect(sel.title).toContain('whole number of cycles');
    expect(t.comp.loopModeHint({ type: 'noise', loopMode: 'loop-to-fit' })).toContain('blends back');
    expect(t.comp.loopModeHint({ type: 'shake', loopMode: 'loop-to-fit' })).toContain('repeats');
    expect(t.comp.loopModeHint({ type: 'wave', loopMode: 'free' })).toContain('Free');
  });
});
