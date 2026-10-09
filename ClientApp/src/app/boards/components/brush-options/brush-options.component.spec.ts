import { ElementRef, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { RasterBrushService } from '../../../shared/services/raster/raster-brush.service';
import { BrushOptionsComponent, HIDDEN_BRUSH_PRESET_IDS, imagePreviewSrc } from './brush-options.component';

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

describe('BrushOptionsComponent editor on touch (ui-review 2026-10-07 #9)', () => {
  const press = (x = 10, y = 10) => new PointerEvent('pointerdown', { button: 0, clientX: x, clientY: y });

  it('a long-press on a brush row opens its editor and swallows the click that follows the release', () => {
    jasmine.clock().install();
    try {
      const t = setup();
      const picked: string[] = [];
      t.panel.brushPicked.subscribe(id => picked.push(id));
      t.panel.onRowPointerDown('default_hard_pen', press());
      jasmine.clock().tick(BrushOptionsComponent.LONG_PRESS_MS + 1);
      expect(t.panel.view).toBe('editor');
      expect(t.panel.editingPresetId).toBe('default_hard_pen');
      t.panel.cancelRowLongPress();             // pointerup
      t.panel.onRowClick('default_hard_pen');   // the click after the release: not a pick (would fold the panel)
      expect(picked).toEqual([]);
      t.panel.ngOnDestroy();
    } finally { jasmine.clock().uninstall(); }
  });

  it('a short tap picks the brush; a press that moves (a scroll) never opens the editor', () => {
    jasmine.clock().install();
    try {
      const t = setup();
      t.panel.onRowPointerDown('default_hard_pen', press());
      jasmine.clock().tick(100);
      t.panel.cancelRowLongPress();
      t.panel.onRowClick('default_hard_pen');
      expect(t.state.active).toBe('default_hard_pen');
      t.panel.onRowPointerDown('default_round_soft', press(10, 10));
      t.panel.onRowPointerMove(new PointerEvent('pointermove', { clientX: 10, clientY: 40 }));
      jasmine.clock().tick(BrushOptionsComponent.LONG_PRESS_MS + 1);
      expect(t.panel.view).toBe('grid');
      t.panel.ngOnDestroy();
    } finally { jasmine.clock().uninstall(); }
  });

  it('Delete Brush asks first; Cancel keeps the brush, the confirm deletes it', () => {
    const t = setup();
    const deleted: string[] = [];
    t.sm['deleteBrushPreset'] = (id: string) => { deleted.push(id); };
    t.panel.openEditor('default_hard_pen');
    t.panel.askDeleteBrush();
    expect(t.panel.confirmingDelete).toBeTrue();
    expect(deleted).toEqual([]);
    t.panel.confirmingDelete = false;           // Cancel
    expect(t.panel.view).toBe('editor');
    t.panel.askDeleteBrush();
    t.panel.deleteBrush();                      // Delete (confirmed)
    expect(deleted).toEqual(['default_hard_pen']);
    expect(t.panel.view).toBe('grid');
    expect(t.panel.confirmingDelete).toBeFalse();
    t.panel.ngOnDestroy();
  });
});

// ── Brush Options audit 2026-10-09 (docs/reviews/ui-dead-controls-2026-10-09.md §1 Brush Options) ──

/** An engine with real preset objects (getBrushPreset / getRasterPaintEngine / importBrushPreset) and a call log. */
function presetEngine() {
  const watercolor: any = {
    id: 'default_watercolor_wash', name: 'Watercolor Wash', category: 'Watercolor',
    tip: { type: 'parametric', hardness: 0.05, roundness: 0.9, angle: 0 }, spacing: 0.06,
    dynamics: { sizePressureCurve: [{ x: 0, y: 0.4 }, { x: 1, y: 1 }], opacityPressureCurve: [{ x: 0, y: 0 }, { x: 1, y: 1 }], flowPressureCurve: [{ x: 0, y: 1 }, { x: 1, y: 1 }] },
    blending: { mode: 'normal', opacity: 0.5, flow: 0.15 }, stabilization: { method: 'moving-average', level: 2 },
    antiAliasing: true, minSize: 20, maxSize: 150, version: 1,
    colorJitter: { hueJitter: 3, saturationJitter: 0.08, brightnessJitter: 0.06, opacityJitter: 0.05 },
    wetEdges: { enabled: true, edgeDarkness: 0.5, edgeWidth: 3, strength: 0.65 },
    dualBrush: { enabled: true, textureData: 'QUJD', textureSize: 128, tileMode: 'canvas-tiling', scale: 1.2, blendOp: 'subtract', strength: 0.6, randomRotation: false },
    strokeTexture: { enabled: false, textureData: '', textureSize: 64, texelsPerUnit: 0.8, edgeSoftness: 0.3 },
  };
  const plain: any = JSON.parse(JSON.stringify({ ...watercolor, id: 'default_hard_pen', name: 'Hard Pen' }));
  delete plain.colorJitter; delete plain.wetEdges; delete plain.dualBrush; delete plain.strokeTexture;
  plain.tip = { type: 'image', imageData: 'AAAA', imageSize: 64 };
  const lib = new Map<string, any>([[watercolor.id, watercolor], [plain.id, plain]]);
  const state = { active: watercolor.id, toolMode: 'paint' as 'paint' | 'erase' | 'clear', hard: false };
  const calls: Array<[string, unknown]> = [];
  const log = (name: string) => (...args: unknown[]) => { calls.push([name, args.length > 1 ? args[1] : args[0]]); return true; };
  const rds = {
    setEraserMode: (m: 'paint' | 'erase' | 'clear') => { state.toolMode = m; },
    setEraserHard: (h: boolean) => { state.hard = h; },
    getEraseMode: (): number | null => state.toolMode === 'paint' ? null : state.toolMode === 'erase' ? (state.hard ? 3 : 1) : 2,
  };
  const engine = {
    getPreset: (id: string) => lib.get(id),
    registerPreset: (p: any) => { calls.push(['registerPreset', JSON.parse(JSON.stringify(p))]); lib.set(p.id, p); },
    setActivePreset: (id: string) => { state.active = id; return true; },
  };
  const sm: Record<string, unknown> = {
    rasterDrawingService: rds,
    getBrushPresets: () => [...lib.values()],
    getActiveBrushPresetId: () => state.active,
    getBrushPreset: (id: string) => lib.get(id),
    getRasterPaintEngine: () => engine,
    setActiveBrushPreset: (id: string) => { state.active = id; return true; },
    exportBrushPreset: (id: string) => JSON.stringify(lib.get(id)),
    importBrushPreset: (json: string) => {
      const p = JSON.parse(json); p.id = p.id ?? 'brush_new'; lib.set(p.id, p); calls.push(['importBrushPreset', p]); return p.id;
    },
    getBrushGrain: () => ({ type: 'none', scale: 1, strength: 0.6 }),
    setBrushGrain: log('setBrushGrain'),
    setBrushDualBrush: log('setBrushDualBrush'),
    setBrushColorJitter: log('setBrushColorJitter'),
    setBrushWetEdges: log('setBrushWetEdges'),
    setBrushStrokeTexture: log('setBrushStrokeTexture'),
    setBrushBleed: log('setBrushBleed'),
    setBrushSmudge: log('setBrushSmudge'),
    setActiveStabilization: log('setActiveStabilization'),
    setRasterBrushSize: log('setRasterBrushSize'),
    enableRasterEraserTool: () => rds.setEraserMode('erase'),
    enableRasterClearEraserTool: () => rds.setEraserMode('clear'),
  };
  spyOn(ShapeManager, 'getInstance').and.returnValue(sm as unknown as ShapeManager);
  const service = new RasterBrushService();
  const panel = new BrushOptionsComponent(service, new ElementRef(document.createElement('div')), new NgZone({ enableLongStackTrace: false }));
  panel.ngOnInit();
  return { sm, lib, state, calls, service, panel, watercolor, plain };
}

describe('BrushOptionsComponent New Brush (create mode)', () => {
  it('saves Dual Brush / Color Variation / Wet Edges / Stroke Texture / Bleed / Smudge / Texture into the new brush', () => {
    const t = presetEngine();
    t.panel.startCreateBrush();
    t.panel.newPresetName = 'Mine';
    t.panel.dualBrushTextureData = 'data:image/png;base64,QUJD';
    t.panel.onDualBrushToggle(true);
    t.panel.onDualBrushStrengthChange(0.4);
    t.panel.onHueJitterChange(12);
    t.panel.onWetEdgesToggle(true);
    t.panel.onWetEdgeWidthChange(4);
    t.panel.onStrokeTextureToggle(true);
    t.panel.onStrokeTextureEdgeSoftnessChange(0.7);
    t.panel.bleedEnabled = true; t.panel.bleedRadius = 9; t.panel.onBleedChange();
    t.panel.smudgeEnabled = true; t.panel.smudgeStrength = 0.8; t.panel.onSmudgeChange();
    t.panel.onTextureToggle(true);
    t.panel.onTextureSourceChange('rough');
    t.panel.onTextureStrengthChange(0.9);
    t.panel.saveNewBrush();
    const saved = t.calls.find(c => c[0] === 'importBrushPreset')![1] as any;
    expect(saved.name).toBe('Mine');
    expect(saved.dualBrush).toEqual(jasmine.objectContaining({ enabled: true, strength: 0.4, textureData: 'data:image/png;base64,QUJD' }));
    expect(saved.colorJitter.hueJitter).toBe(12);
    expect(saved.wetEdges).toEqual(jasmine.objectContaining({ enabled: true, edgeWidth: 4 }));
    expect(saved.strokeTexture).toEqual(jasmine.objectContaining({ enabled: true, edgeSoftness: 0.7 }));
    expect(saved.bleed).toEqual(jasmine.objectContaining({ enabled: true, radius: 9 }));
    expect(saved.smudge).toEqual(jasmine.objectContaining({ enabled: true, strength: 0.8 }));
    expect(saved.texture).toEqual(jasmine.objectContaining({ imageData: '', grain: 'rough', strength: 0.9 }));
    t.panel.ngOnDestroy();
  });

  it('editing the form never live-edits the brush that was active', () => {
    const t = presetEngine();
    const before = JSON.stringify(t.watercolor);
    t.panel.startCreateBrush();
    t.panel.onMaxSizeChange(300); t.panel.onFlowChange(10); t.panel.onOpacityChange(20);
    t.panel.onHardnessChange(0.1); t.panel.onSpacingChange(1.5); t.panel.onSizeCurveChange([{ x: 0, y: 1 }, { x: 1, y: 1 }]);
    t.panel.onStabilizationMethodChange('catmull-rom'); t.panel.onBrushBlendModeChange('multiply');
    t.panel.onDualBrushToggle(true); t.panel.onHueJitterChange(40); t.panel.onWetEdgesToggle(false);
    t.panel.onStrokeTextureToggle(true); t.panel.onBleedChange(); t.panel.onSmudgeChange(); t.panel.onTextureToggle(true);
    expect(t.calls).toEqual([]);
    expect(JSON.stringify(t.watercolor)).toBe(before);
    t.panel.cancelCreate();
    expect(t.panel.view).toBe('grid');
    expect(t.panel.flow).toBe(15);              // the grid shows the active brush again, not the form
    expect(t.panel.wetEdgesEnabled).toBeTrue();
    t.panel.ngOnDestroy();
  });
});

describe('BrushOptionsComponent shows a preset as it is', () => {
  it('reads Dual Brush / Color Variation / Wet Edges / Stroke Texture from the preset', () => {
    const t = presetEngine();
    t.panel.openEditor('default_watercolor_wash');
    expect(t.panel.wetEdgesEnabled).toBeTrue();
    expect(t.panel.wetEdgeWidth).toBe(3);
    expect(t.panel.wetEdgeStrength).toBe(0.65);
    expect(t.panel.hueJitter).toBe(3);
    expect(t.panel.opacityJitter).toBe(0.05);
    expect(t.panel.dualBrushEnabled).toBeTrue();
    expect(t.panel.dualBrushTileMode).toBe('canvas-tiling');
    expect(t.panel.dualBrushBlendOp).toBe('subtract');
    expect(t.panel.dualBrushTexturePreview).toBe('data:image/png;base64,QUJD');
    expect(t.panel.strokeTextureTilingDensity).toBe(0.8);
    t.panel.ngOnDestroy();
  });

  it('touching one control keeps the other settings of the preset', () => {
    const t = presetEngine();
    t.panel.openEditor('default_watercolor_wash');
    t.panel.onWetEdgeDarknessChange(0.2);
    expect(t.calls.find(c => c[0] === 'setBrushWetEdges')![1]).toEqual({ enabled: true, edgeDarkness: 0.2, edgeWidth: 3, strength: 0.65 });
    t.panel.onHueJitterChange(5);
    expect(t.calls.find(c => c[0] === 'setBrushColorJitter')![1]).toEqual({ hueJitter: 5, saturationJitter: 0.08, brightnessJitter: 0.06, opacityJitter: 0.05 });
    t.panel.onDualBrushScaleChange(2);
    expect(t.calls.find(c => c[0] === 'setBrushDualBrush')![1])
      .toEqual(jasmine.objectContaining({ textureData: 'QUJD', tileMode: 'canvas-tiling', blendOp: 'subtract', scale: 2 }));
    t.panel.ngOnDestroy();
  });

  it('a preset without the blocks resets them (nothing leaks from the previous brush); an image tip is flagged', () => {
    const t = presetEngine();
    t.panel.openEditor('default_watercolor_wash');
    t.panel.closeEditor();
    t.panel.openEditor('default_hard_pen');
    expect(t.panel.wetEdgesEnabled).toBeFalse();
    expect(t.panel.dualBrushEnabled).toBeFalse();
    expect(t.panel.dualBrushTextureData).toBe('');
    expect(t.panel.hueJitter).toBe(0);
    expect(t.panel.tipIsImage).toBeTrue();
    t.panel.ngOnDestroy();
  });
});

describe('BrushOptionsComponent Texture / Grain (per brush)', () => {
  it('enables a built-in pattern, switches source, and an image takes over', () => {
    const t = presetEngine();
    t.panel.openEditor('default_watercolor_wash');
    t.panel.onTextureToggle(true);
    expect(t.watercolor.texture).toEqual(jasmine.objectContaining({ imageData: '', grain: 'cold-press', strength: 0.5 }));
    t.panel.onTextureSourceChange('newsprint');
    t.panel.onTextureFixedChange(true);
    expect(t.watercolor.texture).toEqual(jasmine.objectContaining({ grain: 'newsprint', fixedToCanvas: true }));
    t.panel.onTextureSourceChange('image');
    expect(t.watercolor.texture.imageData).toBe('');   // Image with no file yet: the pattern stands in ...
    expect(t.panel.textureSource).toBe('image');       // ... and the picker stays on Image (the re-sync kept it)
    t.panel.textureImageData = 'data:image/png;base64,QUJD';   // (what onTextureFileSelected stores)
    t.panel.onTextureScaleChange(2);
    expect(t.watercolor.texture).toEqual(jasmine.objectContaining({ imageData: 'data:image/png;base64,QUJD', scale: 2 }));
    expect(t.panel.texturePreview).toBe('data:image/png;base64,QUJD');
    t.panel.onTextureSourceChange('rough');               // a built-in pattern drops the image
    expect(t.watercolor.texture).toEqual(jasmine.objectContaining({ imageData: '', grain: 'rough' }));
    t.panel.onTextureToggle(false);
    expect(t.watercolor.texture).toBeUndefined();
    t.panel.ngOnDestroy();
  });

  it('reads the source back from the preset', () => {
    const t = presetEngine();
    t.watercolor.texture = { imageData: 'QUJD', scale: 1.5, strength: 0.3, mode: 'subtract', fixedToCanvas: true };
    t.panel.openEditor('default_watercolor_wash');
    expect(t.panel.textureEnabled).toBeTrue();
    expect(t.panel.textureSource).toBe('image');
    expect(t.panel.texturePreview).toBe('data:image/png;base64,QUJD');
    t.watercolor.texture = { imageData: '', grain: 'canvas-linen', scale: 1, strength: 1, mode: 'multiply', fixedToCanvas: false };
    t.panel.closeEditor();
    t.panel.openEditor('default_watercolor_wash');
    expect(t.panel.textureSource).toBe('canvas-linen');
    t.panel.ngOnDestroy();
  });
});

describe('BrushOptionsComponent hides controls that do nothing', () => {
  it('Stroke Texture (Normal blend) hides the dab settings; another blend mode turns it off', () => {
    const t = presetEngine();
    t.panel.openEditor('default_watercolor_wash');
    expect(t.panel.strokeTextureActive).toBeFalse();
    t.panel.onStrokeTextureToggle(true);
    expect(t.panel.strokeTextureActive).toBeTrue();
    expect(t.panel.quickShowFlow).toBeFalse();
    t.panel.onBrushBlendModeChange('multiply');
    expect(t.panel.normalBlend).toBeFalse();
    expect(t.panel.strokeTextureActive).toBeFalse();   // Multiply paints dabs: the strip never draws
    expect(t.panel.quickShowFlow).toBeTrue();
    t.panel.ngOnDestroy();
  });

  it('the Clear eraser hides Opacity and Flow; Fade keeps them', () => {
    const t = presetEngine();
    expect(t.panel.quickShowOpacity).toBeTrue();
    t.panel.selectEraserTool();
    expect(t.panel.quickShowOpacity).toBeTrue();
    expect(t.panel.quickShowFlow).toBeTrue();
    t.panel.onEraserStyleChange('clear');
    expect(t.panel.quickShowOpacity).toBeFalse();
    expect(t.panel.quickShowFlow).toBeFalse();
    t.panel.ngOnDestroy();
  });

  it('imagePreviewSrc turns raw base64 into a data URL and leaves data URLs alone', () => {
    expect(imagePreviewSrc('QUJD')).toBe('data:image/png;base64,QUJD');
    expect(imagePreviewSrc('data:image/jpeg;base64,QUJD')).toBe('data:image/jpeg;base64,QUJD');
    expect(imagePreviewSrc('')).toBe('');
  });
});
