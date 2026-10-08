import { NgZone, SimpleChange } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { GreasePencilPanelComponent } from './grease-pencil-panel.component';

/** Grease Pencil panel wiring (salsa docs/reviews/grease-pencil-2026-10-09.md): tap a face → the pencil is out (a GP
 *  object is made on the first draw), the plane ✕ picks another face, the panel binds once (no leaked poll), only a
 *  filled stroke sends a fill colour, layer / object switches keep the pencil out, and it tears down on close. */
describe('GreasePencilPanelComponent', () => {
  /** `placement`: the panel's Placement before it binds — 'sheet' (the face-tap flow) unless a test asks for the
   *  component default ('default' = Surface) or Surface. */
  function setup(opts: { objects?: { id: string; name: string }[]; placement?: 'surface' | 'sheet' | 'default' } = {}) {
    const objects = [...(opts.objects ?? [])];
    const layers: Record<string, { id: string; name: string; visible: boolean; opacity: number }[]> = {};
    for (const o of objects) layers[o.id] = [{ id: o.id + '-L1', name: 'Layer 1', visible: true, opacity: 1 }];
    let plane: { meshId: string; triangleIndex: number; offset: number } | null = null;
    let nextId = 1;
    const changed = new Subject<void>();
    const sm: Record<string, unknown> = {
      interactionService: { onSceneGraphChanged: changed },
      getAllSkeletons3D: jasmine.createSpy('getAllSkeletons3D').and.returnValue([]),
      getAllGpObjects3D: jasmine.createSpy('getAllGpObjects3D').and.callFake(() => objects.slice()),
      getGpLayers3D: jasmine.createSpy('getGpLayers3D').and.callFake((id: string) => (layers[id] ?? []).slice()),
      getSkeletonJoints3D: jasmine.createSpy('getSkeletonJoints3D').and.returnValue([]),
      createGpObject3D: jasmine.createSpy('createGpObject3D').and.callFake((name: string) => {
        const id = 'gp' + nextId++;
        objects.push({ id, name });
        layers[id] = [{ id: id + '-L1', name: 'Layer 1', visible: true, opacity: 1 }];
        return id;
      }),
      addGpLayer3D: jasmine.createSpy('addGpLayer3D').and.callFake((gpId: string, name: string) => {
        const id = gpId + '-L' + (layers[gpId].length + 1);
        layers[gpId].push({ id, name, visible: true, opacity: 1 });
        return id;
      }),
      removeGpLayer3D: jasmine.createSpy('removeGpLayer3D'),
      removeGpObject3D: jasmine.createSpy('removeGpObject3D'),
      getGpDrawPlane3D: jasmine.createSpy('getGpDrawPlane3D').and.callFake(() => plane),
      clearGpDrawPlane3D: jasmine.createSpy('clearGpDrawPlane3D').and.callFake(() => { plane = null; }),
      setGpDrawPlaneOffset3D: jasmine.createSpy('setGpDrawPlaneOffset3D'),
      enterGpFaceSelectMode3D: jasmine.createSpy('enterGpFaceSelectMode3D'),
      exitGpFaceSelectMode3D: jasmine.createSpy('exitGpFaceSelectMode3D'),
      enterGpDrawMode3D: jasmine.createSpy('enterGpDrawMode3D'),
      exitGpDrawMode3D: jasmine.createSpy('exitGpDrawMode3D'),
      setGpDrawSettings3D: jasmine.createSpy('setGpDrawSettings3D'),
      setGpKeyframe3D: jasmine.createSpy('setGpKeyframe3D'),
      clearGpKeyframe3D: jasmine.createSpy('clearGpKeyframe3D'),
      getCurrentFrame: jasmine.createSpy('getCurrentFrame').and.returnValue(4),
    };
    const panel = TestBed.runInInjectionContext(() => new GreasePencilPanelComponent());
    panel.shapeManager = sm as never;
    const placement = opts.placement ?? 'sheet';
    if (placement !== 'default') panel.placement = placement;
    panel.ngOnChanges({ shapeManager: new SimpleChange(null, sm, true) });
    const spy = (name: string) => sm[name] as jasmine.Spy;
    const tapFace = () => { plane = { meshId: 'm1', triangleIndex: 7, offset: 0.012 }; panel.pollDrawPlane(); };
    return { panel, sm, spy, tapFace, changed, objects };
  }

  it('opens in face-select, with the keyframe field on the timeline frame', () => {
    const { panel, spy } = setup();
    expect(spy('enterGpFaceSelectMode3D')).toHaveBeenCalledTimes(1);
    expect(panel.gpFrame).toBe(4);
    expect(panel.isDrawActive).toBeFalse();
    panel.ngOnDestroy();
  });

  it('tapping a face puts the pencil out at once — creating "GP Object" when there is none', () => {
    const { panel, spy, tapFace } = setup();
    tapFace();
    expect(spy('createGpObject3D')).toHaveBeenCalledOnceWith('GP Object');
    expect(panel.activeGpId).toBe('gp1');
    expect(panel.activeLayerId).toBe('gp1-L1');
    expect(spy('exitGpFaceSelectMode3D')).toHaveBeenCalled();
    expect(spy('enterGpDrawMode3D')).toHaveBeenCalledOnceWith('gp1', 'gp1-L1', jasmine.objectContaining({ mode: 'draw', baseWidth: 0.02 }));
    expect(panel.isDrawActive).toBeTrue();
    panel.ngOnDestroy();
  });

  it('an existing GP object is drawn on (no new one)', () => {
    const { panel, spy, tapFace } = setup({ objects: [{ id: 'gpA', name: 'Sketch' }] });
    tapFace();
    expect(spy('createGpObject3D')).not.toHaveBeenCalled();
    expect(spy('enterGpDrawMode3D')).toHaveBeenCalledOnceWith('gpA', 'gpA-L1', jasmine.any(Object));
    panel.ngOnDestroy();
  });

  it('the plane ✕ puts the pencil away and goes back to picking a face', () => {
    const { panel, spy, tapFace } = setup();
    tapFace();
    spy('enterGpFaceSelectMode3D').calls.reset();
    panel.clearDrawPlane();
    expect(spy('exitGpDrawMode3D')).toHaveBeenCalled();
    expect(spy('clearGpDrawPlane3D')).toHaveBeenCalled();
    expect(spy('enterGpFaceSelectMode3D')).toHaveBeenCalled();
    expect(panel.isDrawActive).toBeFalse();
    expect(panel.gpDrawPlane).toBeNull();
    panel.ngOnDestroy();
  });

  it('only a FILLED stroke sends a fill colour (Closed alone no longer fills)', () => {
    const { panel, spy, tapFace } = setup();
    tapFace();
    panel.closed = true;
    panel.onStrokeSettingChange();
    expect(spy('setGpDrawSettings3D').calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ closed: true, fillColor: null }));
    panel.filled = true;
    panel.onStrokeSettingChange();
    expect(spy('setGpDrawSettings3D').calls.mostRecent().args[0].fillColor).toEqual(jasmine.objectContaining({ r: 1, g: 1, b: 1 }));
    panel.ngOnDestroy();
  });

  it('switching layer (or adding one) keeps the pencil out, now on that layer', () => {
    const { panel, spy, tapFace } = setup();
    tapFace();
    panel.newLayerName = 'Ink';
    panel.addLayer();
    expect(panel.activeLayerId).toBe('gp1-L2');
    expect(panel.isDrawActive).toBeTrue();
    expect(spy('enterGpDrawMode3D').calls.mostRecent().args.slice(0, 2)).toEqual(['gp1', 'gp1-L2']);
    panel.selectLayer('gp1-L1');
    expect(spy('enterGpDrawMode3D').calls.mostRecent().args.slice(0, 2)).toEqual(['gp1', 'gp1-L1']);
    panel.ngOnDestroy();
  });

  it('Draw / Erase toggle: pressing the active tool again puts the pencil away; Erase passes the eraser mode', () => {
    const { panel, spy, tapFace } = setup();
    tapFace();
    panel.setTool('erase');
    expect(spy('enterGpDrawMode3D').calls.mostRecent().args[2]).toEqual(jasmine.objectContaining({ mode: 'erase' }));
    panel.setTool('erase');
    expect(panel.isDrawActive).toBeFalse();
    panel.ngOnDestroy();
  });

  it('binds once (ngOnChanges with the same engine does nothing) and closing stops everything', () => {
    jasmine.clock().install();
    try {
      const { panel, spy, sm } = setup();
      panel.ngOnChanges({ shapeManager: new SimpleChange(sm, sm, false) });
      expect(spy('enterGpFaceSelectMode3D')).toHaveBeenCalledTimes(1);
      panel.ngOnDestroy();
      expect(spy('exitGpDrawMode3D')).toHaveBeenCalled();
      expect(spy('exitGpFaceSelectMode3D')).toHaveBeenCalled();
      expect(spy('clearGpDrawPlane3D')).toHaveBeenCalled();
      const polls = spy('getGpDrawPlane3D').calls.count();
      jasmine.clock().tick(2000);
      expect(spy('getGpDrawPlane3D').calls.count()).toBe(polls);   // no poll outlives the panel
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('a scene change (a stroke ended, an undo) refreshes the object / layer lists', () => {
    const { panel, changed, objects } = setup();
    objects.push({ id: 'gpX', name: 'Restored' });
    TestBed.inject(NgZone).run(() => changed.next());      // in the zone: refreshed at once (outside: next frame)
    expect(panel.gpObjects.map(g => g.id)).toEqual(['gpX']);
    panel.ngOnDestroy();
  });

  // ── Placement: Surface | Flat sheet ──

  it('defaults to Surface: the pencil is out at once on the selected mesh — no face tap, no face-select', () => {
    const { panel, spy } = setup({ placement: 'default' });
    expect(panel.placement).toBe('surface');
    expect(panel.canDraw).toBeTrue();
    expect(spy('enterGpFaceSelectMode3D')).not.toHaveBeenCalled();
    expect(spy('createGpObject3D')).toHaveBeenCalledOnceWith('GP Object');
    expect(spy('enterGpDrawMode3D')).toHaveBeenCalledOnceWith('gp1', 'gp1-L1',
      jasmine.objectContaining({ mode: 'draw', placement: 'surface', surfaceOffset: 0.01, eraseMode: 'partial' }));
    expect(panel.isDrawActive).toBeTrue();
    // putting the pencil away in Surface does not start face-select either
    panel.setTool('draw');
    expect(panel.isDrawActive).toBeFalse();
    expect(spy('enterGpFaceSelectMode3D')).not.toHaveBeenCalled();
    panel.ngOnDestroy();
  });

  it('Surface → Flat sheet with no face picked goes back to face-select; tapping a face puts the pencil out on the sheet', () => {
    const { panel, spy, tapFace } = setup({ placement: 'surface' });
    panel.setPlacement('sheet');
    expect(spy('setGpDrawSettings3D')).toHaveBeenCalledWith({ placement: 'sheet' });
    expect(spy('exitGpDrawMode3D')).toHaveBeenCalled();
    expect(spy('enterGpFaceSelectMode3D')).toHaveBeenCalled();
    expect(panel.isDrawActive).toBeFalse();
    expect(panel.canDraw).toBeFalse();
    tapFace();
    expect(panel.isDrawActive).toBeTrue();
    expect(spy('enterGpDrawMode3D').calls.mostRecent().args[2]).toEqual(jasmine.objectContaining({ placement: 'sheet' }));
    panel.ngOnDestroy();
  });

  it('Flat sheet → Surface (waiting for a face) leaves face-select and puts the pencil out', () => {
    const { panel, spy } = setup({ placement: 'sheet' });
    expect(panel.isDrawActive).toBeFalse();
    panel.setPlacement('surface');
    expect(spy('exitGpFaceSelectMode3D')).toHaveBeenCalled();
    expect(spy('setGpDrawSettings3D')).toHaveBeenCalledWith({ placement: 'surface' });
    expect(panel.isDrawActive).toBeTrue();
    expect(spy('enterGpDrawMode3D').calls.mostRecent().args[2]).toEqual(jasmine.objectContaining({ placement: 'surface' }));
    panel.setPlacement('surface');                          // the chosen one again: nothing
    expect(spy('setGpDrawSettings3D').calls.count()).toBe(1);
    panel.ngOnDestroy();
  });

  it('the Surface Offset slider sends surfaceOffset', () => {
    const { panel, spy } = setup({ placement: 'surface' });
    panel.surfaceOffset = 0.02;
    panel.onSurfaceOffsetChange();
    expect(spy('setGpDrawSettings3D')).toHaveBeenCalledWith({ surfaceOffset: 0.02 });
    panel.ngOnDestroy();
  });

  // ── Eraser: Partial | Whole stroke ──

  it('the eraser defaults to Partial; Whole stroke is sent to the engine and with the next draw-mode entry', () => {
    const { panel, spy } = setup({ placement: 'surface' });
    expect(panel.eraseMode).toBe('partial');
    panel.setEraseMode('stroke');
    expect(spy('setGpDrawSettings3D')).toHaveBeenCalledWith({ eraseMode: 'stroke' });
    panel.setTool('erase');
    expect(spy('enterGpDrawMode3D').calls.mostRecent().args[2]).toEqual(jasmine.objectContaining({ mode: 'erase', eraseMode: 'stroke' }));
    panel.setEraseMode('partial');
    expect(spy('setGpDrawSettings3D').calls.mostRecent().args[0]).toEqual({ eraseMode: 'partial' });
    panel.ngOnDestroy();
  });

  it('renders the Placement and Eraser segmented controls; clicking switches the active segment', () => {
    TestBed.configureTestingModule({ declarations: [GreasePencilPanelComponent], imports: [CommonModule, FormsModule] });
    const { panel: bound, sm } = setup({ placement: 'surface' });
    bound.ngOnDestroy();
    const fixture = TestBed.createComponent(GreasePencilPanelComponent);
    const panel = fixture.componentInstance;
    panel.shapeManager = sm as never;
    panel.ngOnChanges({ shapeManager: new SimpleChange(null, sm, true) });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const seg = (label: string) => [...el.querySelectorAll<HTMLElement>('.gp-form-row')]
      .find(r => r.querySelector('.gp-label')?.textContent?.trim() === label);
    const buttons = (label: string) => [...(seg(label)?.querySelectorAll<HTMLButtonElement>('.gp-seg button') ?? [])];
    const active = (label: string) => buttons(label).filter(b => b.classList.contains('gp-active')).map(b => b.textContent!.trim());

    expect(buttons('Placement').map(b => b.textContent!.trim())).toEqual(['Surface', 'Flat sheet']);
    expect(active('Placement')).toEqual(['Surface']);
    expect(el.querySelector('.gp-plane-prompt')).toBeNull();          // no "tap a face" step in Surface
    buttons('Placement')[1].click();
    fixture.detectChanges();
    expect(panel.placement).toBe('sheet');
    expect(active('Placement')).toEqual(['Flat sheet']);
    expect(el.querySelector('.gp-plane-prompt')).not.toBeNull();      // Flat sheet: tap a face first

    buttons('Placement')[0].click();
    panel.setTool('erase');
    fixture.detectChanges();
    expect(buttons('Eraser').map(b => b.textContent!.trim())).toEqual(['Partial', 'Whole stroke']);
    expect(active('Eraser')).toEqual(['Partial']);
    buttons('Eraser')[1].click();
    fixture.detectChanges();
    expect(panel.eraseMode).toBe('stroke');
    expect(active('Eraser')).toEqual(['Whole stroke']);
    fixture.destroy();
  });
});
