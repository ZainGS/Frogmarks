import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { RasterBrushService } from '../../../shared/services/raster/raster-brush.service';
import { TouchUiService } from '../../../illustrate/services/touch-ui.service';
import { LayerBlendMode, RasterLayer } from '../../models/brush-preset.model';
import { RasterLayersComponent } from './raster-layers.component';

function layer(id: string, opacity = 1, extra: Partial<RasterLayer> = {}): RasterLayer {
  return {
    id, name: id.toUpperCase(), type: 'layer', parentId: null, visible: true, locked: false,
    blendMode: LayerBlendMode.Normal, opacity, clipped: false, lockTransparency: false, ...extra,
  };
}

/** The panel rendered against a stand-in RasterBrushService; `coarse` = TouchUiService.coarse (tablet vs desktop). */
async function setup(coarse: boolean, layers: RasterLayer[] = [layer('a', 0.8), layer('b', 0.3), layer('c')]) {
  const layers$ = new BehaviorSubject<RasterLayer[]>(layers);
  const activeLayerId$ = new BehaviorSubject<string | null>('a');   // an active layer: no auto-select on init
  const service = {
    layers$, activeLayerId$,
    refreshLayers: jasmine.createSpy('refreshLayers'),
    selectLayer: jasmine.createSpy('selectLayer'),
    setLayerOpacity: jasmine.createSpy('setLayerOpacity'),
  };
  await TestBed.configureTestingModule({
    declarations: [RasterLayersComponent],
    imports: [CommonModule, FormsModule],
    providers: [
      { provide: RasterBrushService, useValue: service },
      { provide: TouchUiService, useValue: { coarse } },
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],   // mat-icon
  }).compileComponents();
  const fixture: ComponentFixture<RasterLayersComponent> = TestBed.createComponent(RasterLayersComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  /** Display order is reversed (top layer first): c, b, a. */
  const row = (id: string): HTMLElement => {
    const rows = Array.from(el.querySelectorAll<HTMLElement>('.rl-item'));
    const r = rows.find(x => x.querySelector('.rl-name')?.textContent?.trim() === id.toUpperCase());
    if (!r) throw new Error('no row ' + id);
    return r;
  };
  const btn = (id: string) => row(id).querySelector<HTMLButtonElement>('.rl-opacity-btn');
  const slider = (id: string) => row(id).querySelector<HTMLInputElement>('input[type=range]');
  const tap = (target: HTMLElement) => { target.click(); fixture.detectChanges(); };
  return { fixture, comp: fixture.componentInstance, el, service, layers$, row, btn, slider, tap };
}

describe('RasterLayersComponent touch opacity toggle', () => {
  it('touch: rows show a % button instead of an inline slider, all closed', async () => {
    const t = await setup(true);
    for (const id of ['a', 'b', 'c']) {
      expect(t.slider(id)).withContext(id).toBeNull();
      expect(t.btn(id)).withContext(id).not.toBeNull();
      expect(t.btn(id)!.getAttribute('aria-expanded')).toBe('false');
    }
    expect(t.btn('a')!.textContent!.trim()).toBe('80%');
    expect(t.btn('a')!.getAttribute('aria-label')).toBe('Layer opacity 80%, show slider');
    expect(t.row('a').querySelector('.opacity-label')).toBeNull();
  });

  it('touch: the % button toggles only its own slider, several can be open, and it never selects the layer', async () => {
    const t = await setup(true);
    t.tap(t.btn('b')!);
    expect(t.slider('b')).not.toBeNull();
    expect(t.slider('a')).toBeNull();
    expect(t.slider('c')).toBeNull();
    expect(t.btn('b')!.getAttribute('aria-expanded')).toBe('true');
    expect(t.btn('b')!.classList).toContain('open');
    expect(t.btn('b')!.getAttribute('aria-label')).toBe('Layer opacity 30%, hide slider');

    t.tap(t.btn('c')!);
    expect(t.slider('b')).not.toBeNull();   // b stays open
    expect(t.slider('c')).not.toBeNull();

    t.tap(t.btn('b')!);                     // tapped again: closed
    expect(t.slider('b')).toBeNull();
    expect(t.slider('c')).not.toBeNull();
    expect(t.service.selectLayer).not.toHaveBeenCalled();
  });

  it('touch: with the slider hidden, a tap on the row (incl. the slider slot) selects the layer', async () => {
    const t = await setup(true);
    t.tap(t.row('b').querySelector<HTMLElement>('.rl-opacity-touch')!);
    expect(t.service.selectLayer).toHaveBeenCalledWith('b');
    t.tap(t.row('c'));
    expect(t.service.selectLayer).toHaveBeenCalledWith('c');
  });

  it('touch: the open slider drives the same opacity call and the % label follows the layer list live', async () => {
    const t = await setup(true);
    t.tap(t.btn('a')!);
    const s = t.slider('a')!;
    s.value = '42';
    s.dispatchEvent(new Event('input'));
    expect(t.service.setLayerOpacity).toHaveBeenCalledWith('a', 0.42);
    t.tap(s);                               // a tap on the slider itself doesn't select either
    expect(t.service.selectLayer).not.toHaveBeenCalled();

    t.layers$.next([layer('a', 0.42), layer('b', 0.3), layer('c')]);   // the engine round trip
    t.fixture.detectChanges();
    expect(t.btn('a')!.textContent!.trim()).toBe('42%');
    expect(t.slider('a')).not.toBeNull();   // a refresh keeps it open
  });

  it('touch: ids that leave the layer list are pruned; a recreated panel starts closed', async () => {
    const t = await setup(true);
    t.tap(t.btn('a')!);
    t.tap(t.btn('b')!);
    t.layers$.next([layer('b', 0.3), layer('c')]);                       // a deleted
    t.fixture.detectChanges();
    expect(t.comp.isOpacitySliderOpen('a')).toBeFalse();
    expect(t.comp.isOpacitySliderOpen('b')).toBeTrue();
    t.layers$.next([layer('a', 0.8), layer('b', 0.3), layer('c')]);      // 'a' back (e.g. undo): starts closed
    t.fixture.detectChanges();
    expect(t.slider('a')).toBeNull();
    expect(t.slider('b')).not.toBeNull();

    t.fixture.destroy();
    const again = TestBed.createComponent(RasterLayersComponent);
    again.detectChanges();
    expect((again.nativeElement as HTMLElement).querySelectorAll('.rl-item input[type=range]').length).toBe(0);
  });

  it('touch: reference-image rows get the same toggle', async () => {
    const t = await setup(true, [layer('a'), layer('r', 0.5, { type: 'reference' })]);
    expect(t.slider('r')).toBeNull();
    expect(t.btn('r')!.textContent!.trim()).toBe('50%');
    t.tap(t.btn('r')!);
    expect(t.slider('r')).not.toBeNull();
    expect(t.service.selectLayer).not.toHaveBeenCalled();
  });

  it('desktop (fine pointer): unchanged inline slider + % label, no button', async () => {
    const t = await setup(false);
    for (const id of ['a', 'b', 'c']) {
      expect(t.slider(id)).withContext(id).not.toBeNull();
      expect(t.btn(id)).withContext(id).toBeNull();
    }
    expect(t.row('a').querySelector('.opacity-label')!.textContent!.trim()).toBe('80%');
    const s = t.slider('b')!;
    s.value = '10';
    s.dispatchEvent(new Event('input'));
    expect(t.service.setLayerOpacity).toHaveBeenCalledWith('b', 0.1);
    t.tap(s);
    expect(t.service.selectLayer).not.toHaveBeenCalled();
    t.tap(t.row('b'));
    expect(t.service.selectLayer).toHaveBeenCalledWith('b');
  });
});
