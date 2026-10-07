import { ElementRef, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { RasterBrushService } from '../../../shared/services/raster/raster-brush.service';
import { BrushOptionsComponent, HIDDEN_BRUSH_PRESET_IDS } from './brush-options.component';

/** A stand-in for the engine bits the brush panel touches: the preset library + RasterDrawingService's tool mode. */
function fakeEngine(opts: { withPicker?: boolean } = {}) {
  const presets = [
    { id: 'default_round_soft', name: 'Round Soft', category: 'Pen' },
    { id: 'default_hard_pen', name: 'Hard Pen', category: 'Pen' },
    { id: 'default_eraser', name: 'Eraser', category: 'Eraser' },
  ];
  const state = { active: 'default_round_soft', toolMode: 'paint' as 'paint' | 'erase' | 'clear', hard: false, picks: 0 };
  const rds = {
    setEraserMode: (m: 'paint' | 'erase' | 'clear') => { state.toolMode = m; },
    setEraserHard: (h: boolean) => { state.hard = h; },
    getEraseMode: (): number | null =>
      state.toolMode === 'paint' ? null : state.toolMode === 'erase' ? (state.hard ? 3 : 1) : 2,
  };
  const sm: Record<string, unknown> = {
    rasterDrawingService: rds,
    getBrushPresets: () => presets,
    getActiveBrushPresetId: () => state.active,
    getBrushPreset: () => undefined,   // keeps _syncFromPreset a no-op
    exportBrushPreset: (id: string) => JSON.stringify({ id }),
    setActiveBrushPreset: (id: string) => { if (!presets.some(p => p.id === id)) return false; state.active = id; return true; },
    enableRasterEraserTool: () => rds.setEraserMode('erase'),
    enableRasterClearEraserTool: () => rds.setEraserMode('clear'),
    enableRasterTool: () => rds.setEraserMode('paint'),
  };
  if (opts.withPicker) {
    sm['selectRasterBrushPreset'] = (id: string) => {
      state.picks++;
      const ok = (sm['setActiveBrushPreset'] as (i: string) => boolean)(id);
      if (ok) rds.setEraserMode('paint');
      return ok;
    };
  }
  return { sm, state };
}

function setup(opts: { withPicker?: boolean } = {}) {
  const eng = fakeEngine(opts);
  spyOn(ShapeManager, 'getInstance').and.returnValue(eng.sm as unknown as ShapeManager);
  const service = new RasterBrushService();
  const panel = new BrushOptionsComponent(service, new ElementRef(document.createElement('div')), new NgZone({ enableLongStackTrace: false }));
  panel.ngOnInit();
  return { ...eng, service, panel };
}

describe('BrushOptionsComponent eraser / brush selection', () => {
  it('lists ONE eraser: the built-in Eraser preset is hidden behind the Eraser row', () => {
    const t = setup();
    expect(HIDDEN_BRUSH_PRESET_IDS.has('default_eraser')).toBeTrue();
    expect(t.panel.presets.map(p => p.id)).toEqual(['default_round_soft', 'default_hard_pen']);
    t.panel.ngOnDestroy();
  });

  it('Eraser row then a brush: erase mode is left and only the brush row is highlighted', () => {
    const t = setup();
    expect(t.panel.eraserActive).toBeFalse();
    expect(t.panel.isPresetActive('default_round_soft')).toBeTrue();

    t.panel.selectEraserTool();
    expect(t.state.toolMode).toBe('erase');
    expect(t.panel.eraserActive).toBeTrue();
    expect(t.panel.isPresetActive('default_round_soft')).toBeFalse();   // no double highlight

    t.panel.quickSelectBrush('default_hard_pen');
    expect(t.state.toolMode).toBe('paint');                             // the bug: this stayed 'erase'
    expect(t.state.active).toBe('default_hard_pen');
    expect(t.panel.eraserActive).toBeFalse();
    expect(t.panel.isPresetActive('default_hard_pen')).toBeTrue();
    expect(t.panel.isPresetActive('default_round_soft')).toBeFalse();
    t.panel.ngOnDestroy();
  });

  it('clicking the Eraser row again goes back to the brush (and stops erasing)', () => {
    const t = setup();
    t.panel.selectEraserTool();
    t.panel.selectEraserTool();
    expect(t.state.toolMode).toBe('paint');
    expect(t.panel.isPresetActive('default_round_soft')).toBeTrue();
    t.panel.ngOnDestroy();
  });

  it('Clear style and Hard edge reach the engine, and a brush pick leaves them too', () => {
    const t = setup();
    t.panel.selectEraserTool();
    t.panel.onEraserHardnessChange('hard');
    expect(t.service.getEraseMode()).toBe(3);
    t.panel.onEraserStyleChange('clear');
    expect(t.service.getEraseMode()).toBe(2);
    t.panel.quickSelectBrush('default_round_soft');
    expect(t.service.getEraseMode()).toBeNull();
    t.panel.ngOnDestroy();
  });

  it('opening a brush editor (gear) selects that brush and leaves the eraser', () => {
    const t = setup();
    t.panel.selectEraserTool();
    t.panel.openEditor('default_hard_pen', new MouseEvent('click'));
    expect(t.state.toolMode).toBe('paint');
    expect(t.panel.isPresetActive('default_hard_pen')).toBeTrue();
    t.panel.ngOnDestroy();
  });

  it('the highlight follows the ENGINE: an eraser switched on elsewhere (rail / keymap) shows on the row', () => {
    const t = setup();
    (t.sm['enableRasterClearEraserTool'] as () => void)();   // e.g. the rail Eraser / Shift+E
    expect(t.panel.eraserActive).toBeTrue();
    expect(t.panel.isPresetActive('default_round_soft')).toBeFalse();
    (t.sm['enableRasterTool'] as () => void)();               // back to the pen
    expect(t.panel.eraserActive).toBeFalse();
    t.panel.ngOnDestroy();
  });

  it('a document whose active preset is the hidden Eraser preset shows the Eraser row; the row returns to a brush', () => {
    const t = setup();
    t.service.setActivePreset('default_eraser');
    expect(t.panel.eraserActive).toBeTrue();
    t.panel.selectEraserTool();
    expect(t.state.active).toBe('default_round_soft');
    expect(t.panel.eraserActive).toBeFalse();
    t.panel.ngOnDestroy();
  });

  it("uses Salsa's selectRasterBrushPreset when the engine has it", () => {
    const t = setup({ withPicker: true });
    t.panel.selectEraserTool();
    t.panel.quickSelectBrush('default_hard_pen');
    expect(t.state.picks).toBe(1);
    expect(t.state.toolMode).toBe('paint');
    t.panel.ngOnDestroy();
  });
});

describe('BrushOptionsComponent brushPicked (touch auto-close hook)', () => {
  it('a brush row tap selects the brush and emits brushPicked; the Eraser row does not (its options open below)', () => {
    const t = setup();
    const picked: string[] = [];
    t.panel.brushPicked.subscribe(id => picked.push(id));
    t.panel.pickBrush('default_hard_pen');
    expect(t.state.active).toBe('default_hard_pen');
    expect(picked).toEqual(['default_hard_pen']);
    t.panel.selectEraserTool();   // on
    t.panel.selectEraserTool();   // back to the brush (quickSelectBrush, not a list pick)
    expect(picked).toEqual(['default_hard_pen']);
    t.panel.ngOnDestroy();
  });
});

describe('BrushOptionsComponent grid fit (only the brush list scrolls)', () => {
  /** A 300 px scrolling host panel holding a label, the brush list (20 x 48 px rows) and a 60 px footer. */
  function build(hostPx: number) {
    const scroller = document.createElement('div');
    scroller.className = 'tool-subpanel';
    scroller.style.cssText = `position:fixed;left:0;top:0;width:200px;height:${hostPx}px;overflow-y:auto;`;
    const label = document.createElement('div'); label.style.height = '20px';
    const host = document.createElement('div');
    const list = document.createElement('div'); list.className = 'brush-list';
    list.style.cssText = 'overflow-y:auto;max-height:50vh;';
    for (let i = 0; i < 20; i++) { const r = document.createElement('div'); r.style.height = '48px'; list.appendChild(r); }
    const footer = document.createElement('div'); footer.style.height = '60px';
    host.append(list, footer); scroller.append(label, host); document.body.appendChild(scroller);
    const panel = new BrushOptionsComponent({} as RasterBrushService, new ElementRef(host), new NgZone({ enableLongStackTrace: false }));
    return { scroller, list, panel, fit: () => (panel as unknown as { _fitList(): void })._fitList() };
  }

  it('shrinks the list so the host panel no longer scrolls (footer stays in view)', () => {
    const t = build(300);
    t.fit();
    expect(t.scroller.scrollHeight).toBeLessThanOrEqual(t.scroller.clientHeight);
    expect(t.list.clientHeight).toBe(300 - 20 - 60);
    t.fit();   // converged: a second pass changes nothing
    expect(t.list.clientHeight).toBe(220);
    t.scroller.remove();
  });

  it('grows the list back into free space, up to its content', () => {
    const t = build(2000);
    t.list.style.maxHeight = '100px';
    t.fit();
    expect(t.list.clientHeight).toBe(20 * 48);
    t.scroller.remove();
  });

  it('never shrinks the list below about two rows', () => {
    const t = build(120);
    t.fit();
    expect(t.list.clientHeight).toBe(96);
    t.scroller.remove();
  });
});
