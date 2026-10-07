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

/** UI review 2026-10-07 #2 / #6: the panel with vector layers, an engine stand-in and the editor's inputs bound. */
async function setupVector(opts: { undoable?: boolean; activeVector?: string | null; scene3dActive?: boolean; engineVectorIds?: string[] } = {}) {
  const vectorRows = [layer('v1', 1, { type: 'vector' }), layer('v2', 1, { type: 'vector' })];
  const layers$ = new BehaviorSubject<RasterLayer[]>([layer('bg'), layer('ink'), layer('s3', 1, { type: '3d-scene' }), ...vectorRows]);
  const activeLayerId$ = new BehaviorSubject<string | null>('bg');   // the engine's selected RASTER layer
  const service = {
    layers$, activeLayerId$,
    refreshLayers: jasmine.createSpy('refreshLayers'),
    selectLayer: jasmine.createSpy('selectLayer'),
    setLayerOpacity: jasmine.createSpy('setLayerOpacity'),
  };
  let engineVectorIds = opts.engineVectorIds ?? ['v1', 'v2'];
  const sm = {
    setActiveVectorLayer: jasmine.createSpy('setActiveVectorLayer'),
    removeVectorLayer: jasmine.createSpy('removeVectorLayer').and.callFake((id: string) => {
      engineVectorIds = engineVectorIds.filter(v => v !== id);
      return true;
    }),
    getVectorLayers: () => engineVectorIds.map(id => ({ id })),
    rasterLayerManager: opts.undoable === false ? {} : { takeVectorLayer: () => null },
    canUndo2DShapes: true,
    undoDescription2DShapes: 'Remove vector layer' as string | null,
    undo2DShapes: jasmine.createSpy('undo2DShapes').and.callFake(() => { engineVectorIds = ['v1', 'v2']; return true; }),
  };
  await TestBed.configureTestingModule({
    declarations: [RasterLayersComponent],
    imports: [CommonModule, FormsModule],
    providers: [
      { provide: RasterBrushService, useValue: service },
      { provide: TouchUiService, useValue: { coarse: false } },
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
  }).compileComponents();
  const fixture = TestBed.createComponent(RasterLayersComponent);
  fixture.componentRef.setInput('shapeManager', sm);
  fixture.componentRef.setInput('activeVectorLayerId', opts.activeVector ?? null);
  fixture.componentRef.setInput('scene3dActive', !!opts.scene3dActive);
  const comp = fixture.componentInstance;
  const vectorEmits: Array<string | null> = [];
  const sceneEmits: boolean[] = [];
  comp.vectorLayerSelected.subscribe(v => vectorEmits.push(v));
  comp.scene3dSelected.subscribe(v => sceneEmits.push(v));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const nameOf = (x: Element) => (x.querySelector('.rl-name, .rl-scene-label')?.textContent ?? '').trim();
  const row = (name: string): HTMLElement => {
    const r = Array.from(el.querySelectorAll<HTMLElement>('.rl-item, .rl-vector-row')).find(x => nameOf(x) === name);
    if (!r) throw new Error('no row ' + name);
    return r;
  };
  const activeRows = () => Array.from(el.querySelectorAll<HTMLElement>('.rl-item.active, .rl-vector-row.active')).map(nameOf);
  const tap = (target: HTMLElement) => { target.click(); fixture.detectChanges(); };
  const settle = async () => { await new Promise(r => setTimeout(r, 0)); fixture.detectChanges(); };
  return { fixture, comp, el, service, sm, row, activeRows, tap, settle, vectorEmits, sceneEmits };
}

describe('RasterLayersComponent selection follows the editor (UI review #6)', () => {
  it('a re-created panel highlights the editor\'s active vector layer, not Background', async () => {
    const t = await setupVector({ activeVector: 'v2' });
    await t.settle();
    expect(t.activeRows()).toEqual(['V2']);
    expect(t.service.selectLayer).not.toHaveBeenCalled();   // no auto-select over the vector layer
    expect(t.vectorEmits).toEqual([]);
  });

  it('a raster pick from that state leaves vector mode (emit null + engine) and selects the layer', async () => {
    const t = await setupVector({ activeVector: 'v2' });
    t.tap(t.row('BG'));
    expect(t.vectorEmits).toEqual([null]);
    expect(t.sm.setActiveVectorLayer).toHaveBeenCalledWith(null);
    expect(t.service.selectLayer).toHaveBeenCalledWith('bg');
    t.fixture.componentRef.setInput('activeVectorLayerId', null);   // the editor confirms
    t.fixture.detectChanges();
    expect(t.activeRows()).toEqual(['BG']);
  });

  it('a raster pick ALWAYS emits "no vector layer" (the editor may be in vector mode whatever the panel thinks)', async () => {
    const t = await setupVector();
    t.tap(t.row('INK'));
    expect(t.vectorEmits).toEqual([null]);
    expect(t.service.selectLayer).toHaveBeenCalledWith('ink');
  });

  it('the editor\'s 3D-scene selection survives a re-create, and a raster pick leaves it', async () => {
    const t = await setupVector({ scene3dActive: true });
    await t.settle();
    expect(t.activeRows()).toEqual(['S3']);
    t.tap(t.row('INK'));
    expect(t.sceneEmits).toEqual([false]);
    expect(t.service.selectLayer).toHaveBeenCalledWith('ink');
  });

  it('an active vector layer that left the engine (a redo of its removal) drops vector mode', async () => {
    const t = await setupVector({ activeVector: 'v2', engineVectorIds: ['v1'] });
    await t.settle();
    expect(t.vectorEmits).toEqual([null]);
    expect(t.sm.setActiveVectorLayer).toHaveBeenCalledWith(null);
  });
});

describe('RasterLayersComponent vector-layer ✕ (UI review #2)', () => {
  it('removes in one go, drops the row at once, leaves vector mode, and offers Undo (the same 2D undo step)', async () => {
    const t = await setupVector({ activeVector: 'v1' });
    t.tap(t.row('V1').querySelector<HTMLElement>('.rl-vector-remove')!);
    expect(t.sm.removeVectorLayer).toHaveBeenCalledOnceWith('v1');
    expect(t.vectorEmits).toEqual([null]);
    expect(() => t.row('V1')).toThrow();   // no ghost row
    expect(t.service.refreshLayers).toHaveBeenCalled();
    const toast = t.el.querySelector<HTMLElement>('.rl-undo-toast')!;
    expect(toast.textContent).toContain('Removed “V1”');

    t.tap(toast.querySelector<HTMLElement>('.rl-undo-btn')!);
    expect(t.sm.undo2DShapes).toHaveBeenCalledTimes(1);
    expect(t.vectorEmits).toEqual([null, 'v1']);   // it was active: active again
    expect(t.el.querySelector('.rl-undo-toast')).toBeNull();
  });

  it('the toast\'s Undo does nothing when the next undo step is something else', async () => {
    const t = await setupVector();
    t.tap(t.row('V2').querySelector<HTMLElement>('.rl-vector-remove')!);
    t.sm.undoDescription2DShapes = 'Move shapes';
    t.tap(t.el.querySelector<HTMLElement>('.rl-undo-btn')!);
    expect(t.sm.undo2DShapes).not.toHaveBeenCalled();
  });

  it('older engine (removal not undoable): the first ✕ asks, a second removes, a click elsewhere cancels; no toast', async () => {
    const t = await setupVector({ undoable: false });
    const x = () => t.row('V2').querySelector<HTMLElement>('.rl-vector-remove')!;
    t.tap(x());
    expect(t.sm.removeVectorLayer).not.toHaveBeenCalled();
    expect(x().textContent!.trim()).toBe('Remove?');
    document.body.click();
    t.fixture.detectChanges();
    expect(x().textContent!.trim()).toBe('✕');
    t.tap(x());
    t.tap(x());
    expect(t.sm.removeVectorLayer).toHaveBeenCalledOnceWith('v2');
    expect(t.el.querySelector('.rl-undo-toast')).toBeNull();
  });
});
