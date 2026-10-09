import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flush, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import {
  AnimationTimelineComponent,
  CEL_TOUCH_DRAG_DELAY_MS,
  LONG_PRESS_MS,
  TIMELINE_HEIGHT_KEY,
  clampMenuToViewport,
  pinchFrameWidth,
} from './animation-timeline.component';
import { CelInfo, RasterAnimationService, TimelineLayerInfo } from 'app/shared/services/raster/raster-animation.service';
import { EditorStateService } from '../../services/editor-state.service';

/** Timeline touch audit 2026-10-09: pointer drags (touch / pen / mouse, pointercancel), the 200 ms touch press before a
 *  cel drag, long-press = right-click, pinch = frame width, the Move / Swap prompts, menu clamping, label ↔ grid
 *  scroll sync, the resizable height. */

function cel(id: string, frame: number, duration: number, isKey = true): CelInfo {
  return { id, frame, duration, isKey, celType: isKey ? 'key' : 'inbetween' };
}

/** A RasterAnimationService stand-in: the observables the timeline subscribes to + spies that update them. */
function fakeAnim(layers: TimelineLayerInfo[]) {
  const layers$ = new BehaviorSubject<TimelineLayerInfo[]>(layers);
  const frame$ = new BehaviorSubject<number>(1);
  const start$ = new BehaviorSubject<number>(1);
  const end$ = new BehaviorSubject<number>(24);
  const replaceCel = (layerId: string, celId: string, patch: Partial<CelInfo>) => {
    layers$.next(layers$.value.map(l => l.id !== layerId ? l
      : { ...l, cels: l.cels.map(c => c.id === celId ? { ...c, ...patch } : c) }));
  };
  const anim = {
    currentFrame$: frame$,
    frameCount$: new BehaviorSubject<number>(24),
    fps$: new BehaviorSubject<number>(12),
    isPlaying$: new BehaviorSubject<boolean>(false),
    loopMode$: new BehaviorSubject<string>('loop'),
    onionSkin$: new BehaviorSubject({ enabled: false, framesBefore: 2, framesAfter: 1, opacity: 0.3, tintBefore: [1, 0.2, 0.2], tintAfter: [0.2, 0.5, 1] }),
    timelineLayers$: layers$,
    playRangeStart$: start$,
    playRangeEnd$: end$,
    setCurrentFrame: jasmine.createSpy('setCurrentFrame').and.callFake((f: number) => frame$.next(f)),
    getCurrentFrame: () => frame$.value,
    nextFrame: jasmine.createSpy('nextFrame').and.callFake(() => frame$.next(frame$.value + 1)),
    prevFrame: jasmine.createSpy('prevFrame'),
    pausePlayback: jasmine.createSpy('pausePlayback'),
    setPlayRange: jasmine.createSpy('setPlayRange').and.callFake((a: number, b: number) => { start$.next(a); end$.next(b); }),
    moveCel: jasmine.createSpy('moveCel'),
    swapCels: jasmine.createSpy('swapCels'),
    duplicateCel: jasmine.createSpy('duplicateCel'),
    deleteCel: jasmine.createSpy('deleteCel'),
    addCelAtFrame: jasmine.createSpy('addCelAtFrame'),
    addCelAtCurrentFrame: jasmine.createSpy('addCelAtCurrentFrame'),
    setCelDuration: jasmine.createSpy('setCelDuration').and.callFake((l: string, c: string, d: number) => replaceCel(l, c, { duration: d })),
    setFps: jasmine.createSpy('setFps'),
  };
  return anim;
}

const LAYERS = (): TimelineLayerInfo[] => [
  { id: 'L1', name: 'Ink', animated: true, cels: [cel('a', 1, 3), cel('b', 5, 2, false), cel('c', 9, 4)] },
  { id: 'L2', name: 'Paper', animated: false, cels: [] },
];

function setup(layers = LAYERS()) {
  const anim = fakeAnim(layers);
  TestBed.configureTestingModule({
    declarations: [AnimationTimelineComponent],
    imports: [FormsModule],
    providers: [
      { provide: RasterAnimationService, useValue: anim },
      { provide: EditorStateService, useValue: { playing: false, scene3dPanelVisible: false, scene3dSelectedMeshId: null } },
    ],
    schemas: [NO_ERRORS_SCHEMA],
  });
  const fixture: ComponentFixture<AnimationTimelineComponent> = TestBed.createComponent(AnimationTimelineComponent);
  fixture.detectChanges();
  const cmp = fixture.componentInstance;
  const el = fixture.nativeElement as HTMLElement;
  /** Re-render the OnPush view after a state change made outside a template event. */
  const render = () => { (cmp as unknown as { cdr: { markForCheck(): void } }).cdr.markForCheck(); fixture.detectChanges(); };
  return { fixture, cmp, el, anim, render };
}

let nextId = 20;
function ptr(type: string, o: { x: number; y: number; id: number; kind?: string; button?: number; alt?: boolean; shift?: boolean }): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, pointerId: o.id, pointerType: o.kind ?? 'touch', isPrimary: true,
    clientX: o.x, clientY: o.y, button: type === 'pointermove' ? -1 : (o.button ?? 0), buttons: type === 'pointerup' ? 0 : 1,
    altKey: !!o.alt, shiftKey: !!o.shift,
  });
}

/** A press on `target` at its centre, moves to (dxFrames × frameWidth, dy), then up / cancel. */
function center(target: Element): { x: number; y: number } {
  const r = target.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

describe('AnimationTimelineComponent touch / tablet', () => {
  afterEach(() => { try { localStorage.removeItem(TIMELINE_HEIGHT_KEY); } catch { /* */ } });

  it('clampMenuToViewport keeps a menu inside the viewport on both axes', () => {
    expect(clampMenuToViewport(990, 100, 160, 200, 1000, 800)).toEqual({ left: 1000 - 160 - 4, top: 100 });
    expect(clampMenuToViewport(-20, 700, 160, 200, 1000, 800)).toEqual({ left: 4, top: 800 - 200 - 4 });
    // flipped up from near the top: pushed back down to the margin
    expect(clampMenuToViewport(10, 50, 160, 200, 1000, 800, true)).toEqual({ left: 10, top: 4 });
  });

  it('pinchFrameWidth scales with the finger distance inside the zoom limits', () => {
    expect(pinchFrameWidth(28, 40, 60, 16, 60)).toBe(42);
    expect(pinchFrameWidth(28, 40, 400, 16, 60)).toBe(60);
    expect(pinchFrameWidth(28, 40, 10, 16, 60)).toBe(16);
    expect(pinchFrameWidth(28, 0, 10, 16, 60)).toBe(28);
  });

  it('touch scrub on the frame numbers follows the finger (pointer events, not mouse events)', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const header = el.querySelector('.tl-frame-header')!;
    const nums = el.querySelectorAll('.tl-frame-number');
    const id = nextId++;
    const p2 = center(nums[1]);
    header.dispatchEvent(ptr('pointerdown', { ...p2, id }));
    document.dispatchEvent(ptr('pointermove', { ...center(nums[5]), id }));
    document.dispatchEvent(ptr('pointermove', { ...center(nums[8]), id }));
    expect(cmp.currentFrame).toBe(9);
    document.dispatchEvent(ptr('pointerup', { ...center(nums[8]), id }));
    // after the up, moves no longer scrub
    document.dispatchEvent(ptr('pointermove', { ...center(nums[2]), id }));
    expect(cmp.currentFrame).toBe(9);
    expect(anim.setCurrentFrame).toHaveBeenCalledWith(9);
    flush(); fixture.destroy();
  }));

  it('mouse scrub stays relative to the press (as before)', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    anim.setCurrentFrame(5);
    const header = el.querySelector('.tl-frame-header')!;
    const nums = el.querySelectorAll('.tl-frame-number');
    const id = nextId++;
    const p = center(nums[0]);
    header.dispatchEvent(ptr('pointerdown', { ...p, id, kind: 'mouse' }));
    document.dispatchEvent(ptr('pointermove', { x: p.x + 3 * cmp.frameWidth, y: p.y, id, kind: 'mouse' }));
    expect(cmp.currentFrame).toBe(8);
    document.dispatchEvent(ptr('pointerup', { x: p.x, y: p.y, id, kind: 'mouse' }));
    flush(); fixture.destroy();
  }));

  it('a quick one-finger swipe on a cel does not drag it (the grid scrolls; pointercancel)', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const cell = el.querySelectorAll('.tl-layer-row')[0].querySelectorAll('.tl-cell')[0];
    const id = nextId++;
    const p = center(cell);
    cell.dispatchEvent(ptr('pointerdown', { ...p, id }));
    tick(60);
    document.dispatchEvent(ptr('pointermove', { x: p.x + 40, y: p.y, id }));
    document.dispatchEvent(ptr('pointercancel', { x: p.x + 40, y: p.y, id }));
    tick(600);
    expect(cmp.isDragging).toBeFalse();
    expect(cmp.contextMenuVisible).toBeFalse();
    expect(anim.moveCel).not.toHaveBeenCalled();
    flush(); fixture.destroy();
  }));

  it('touch: a 200 ms press picks the cel up, a drag moves it; the touchmove lock stops the native scroll', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const cell = el.querySelectorAll('.tl-layer-row')[0].querySelectorAll('.tl-cell')[0];
    const id = nextId++;
    const p = center(cell);
    cell.dispatchEvent(ptr('pointerdown', { ...p, id }));
    tick(CEL_TOUCH_DRAG_DELAY_MS + 10);
    expect(cmp.isDragging).toBeTrue();               // lit up (ghost on the source frame)
    const prevent = jasmine.createSpy('preventDefault');
    cmp.onGridTouchMove({ touches: [{ clientX: p.x + 5, clientY: p.y }], cancelable: true, preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
    document.dispatchEvent(ptr('pointermove', { x: p.x + 3 * cmp.frameWidth, y: p.y, id }));
    expect(cmp.dragGhostFrame).toBe(4);
    document.dispatchEvent(ptr('pointerup', { x: p.x + 3 * cmp.frameWidth, y: p.y, id }));
    expect(anim.moveCel).toHaveBeenCalledWith('L1', 'a', 4);
    expect(cmp.isDragging).toBeFalse();
    // no lock after the drop: a later swipe scrolls natively
    const prevent2 = jasmine.createSpy('preventDefault');
    cmp.onGridTouchMove({ touches: [{ clientX: 0, clientY: 0 }], cancelable: true, preventDefault: prevent2 });
    expect(prevent2).not.toHaveBeenCalled();
    flush(); fixture.destroy();
  }));

  it('pointercancel in the middle of a cel drag drops nothing and clears the ghost', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const cell = el.querySelectorAll('.tl-layer-row')[0].querySelectorAll('.tl-cell')[0];
    const id = nextId++;
    const p = center(cell);
    cell.dispatchEvent(ptr('pointerdown', { ...p, id }));
    tick(CEL_TOUCH_DRAG_DELAY_MS + 10);
    document.dispatchEvent(ptr('pointermove', { x: p.x + 2 * cmp.frameWidth, y: p.y, id }));
    document.dispatchEvent(ptr('pointercancel', { x: p.x + 2 * cmp.frameWidth, y: p.y, id }));
    expect(anim.moveCel).not.toHaveBeenCalled();
    expect(cmp.isDragging).toBeFalse();
    expect(cmp.draggingCelId).toBe('');
    flush(); fixture.destroy();
  }));

  it('mouse: a drag starts at once (4 px) and Alt swaps, as before', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const cell = el.querySelectorAll('.tl-layer-row')[0].querySelectorAll('.tl-cell')[0];
    const id = nextId++;
    const p = center(cell);
    cell.dispatchEvent(ptr('pointerdown', { ...p, id, kind: 'mouse', alt: true }));
    document.dispatchEvent(ptr('pointermove', { x: p.x + 4 * cmp.frameWidth, y: p.y, id, kind: 'mouse', alt: true }));
    expect(cmp.isDragging).toBeTrue();
    expect(cmp.isDragSwap).toBeTrue();
    document.dispatchEvent(ptr('pointerup', { x: p.x + 4 * cmp.frameWidth, y: p.y, id, kind: 'mouse', alt: true }));
    expect(anim.swapCels).toHaveBeenCalledWith('L1', 'a', 'b');
    flush(); fixture.destroy();
  }));

  it('pen drags a cel immediately (like the mouse)', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const cell = el.querySelectorAll('.tl-layer-row')[0].querySelectorAll('.tl-cell')[0];
    const id = nextId++;
    const p = center(cell);
    cell.dispatchEvent(ptr('pointerdown', { ...p, id, kind: 'pen' }));
    document.dispatchEvent(ptr('pointermove', { x: p.x + 2 * cmp.frameWidth, y: p.y, id, kind: 'pen' }));
    document.dispatchEvent(ptr('pointerup', { x: p.x + 2 * cmp.frameWidth, y: p.y, id, kind: 'pen' }));
    expect(anim.moveCel).toHaveBeenCalledWith('L1', 'a', 3);
    flush(); fixture.destroy();
  }));

  it('touch long-press (500 ms, still) opens the cel menu = right-click; moving > 8 px cancels it; a mouse never does', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const cells = el.querySelectorAll('.tl-layer-row')[0].querySelectorAll('.tl-cell');
    let id = nextId++;
    const p = center(cells[8]);   // cel c (frame 9)
    cells[8].dispatchEvent(ptr('pointerdown', { ...p, id }));
    tick(LONG_PRESS_MS - 50);
    expect(cmp.contextMenuVisible).toBeFalse();
    tick(60);
    expect(cmp.contextMenuVisible).toBeTrue();
    expect(cmp.contextMenuCelId).toBe('c');
    expect(cmp.contextMenuFrame).toBe(9);
    expect(cmp.isDragging).toBeFalse();               // the picked-up drag was dropped for the menu
    document.dispatchEvent(ptr('pointerup', { ...p, id }));
    expect(anim.moveCel).not.toHaveBeenCalled();
    cmp.closeContextMenu();

    id = nextId++;
    cells[8].dispatchEvent(ptr('pointerdown', { ...p, id }));
    tick(100);
    document.dispatchEvent(ptr('pointermove', { x: p.x, y: p.y + 12, id }));
    tick(600);
    expect(cmp.contextMenuVisible).toBeFalse();
    document.dispatchEvent(ptr('pointerup', { x: p.x, y: p.y + 12, id }));

    id = nextId++;
    cells[8].dispatchEvent(ptr('pointerdown', { ...p, id, kind: 'mouse' }));
    tick(900);
    expect(cmp.contextMenuVisible).toBeFalse();
    document.dispatchEvent(ptr('pointerup', { ...p, id, kind: 'mouse' }));
    flush(); fixture.destroy();
  }));

  it('long-press on a static layer label / bar opens its "Make Animated" menu', fakeAsync(() => {
    const { cmp, el, fixture } = setup();
    const label = el.querySelectorAll('.tl-layer-label')[1];
    const id = nextId++;
    label.dispatchEvent(ptr('pointerdown', { ...center(label), id }));
    tick(LONG_PRESS_MS + 10);
    expect(cmp.contextMenuVisible).toBeTrue();
    expect(cmp.contextMenuLayerId).toBe('L2');
    expect(cmp.contextMenuLayerAnimated).toBeFalse();
    document.dispatchEvent(ptr('pointerup', { ...center(label), id }));
    tick(1500);
    // the click the lift may leave behind (however long the hold) does not close the menu it opened
    label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cmp.contextMenuVisible).toBeTrue();
    fixture.detectChanges();
    expect(el.querySelector('.ctx-menu')!.textContent).toContain('Make Animated');
    // the next tap closes it as usual
    label.dispatchEvent(ptr('pointerdown', { ...center(label), id: nextId++ }));
    label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cmp.contextMenuVisible).toBeFalse();
    flush(); fixture.destroy();
  }));

  it('hold handle: a touch drag lengthens the hold; pointercancel puts it back', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const handle = el.querySelector('.duration-handle')!;   // cel a's end (frame 3)
    let id = nextId++;
    const p = center(handle);
    handle.dispatchEvent(ptr('pointerdown', { ...p, id }));
    document.dispatchEvent(ptr('pointermove', { x: p.x + cmp.frameWidth, y: p.y, id }));
    expect(anim.setCelDuration).toHaveBeenCalledWith('L1', 'a', 4);
    document.dispatchEvent(ptr('pointerup', { x: p.x + cmp.frameWidth, y: p.y, id }));
    expect(cmp.durationDragging).toBeFalse();
    fixture.detectChanges();

    anim.setCelDuration.calls.reset();
    const h2 = el.querySelector('.duration-handle')!;
    id = nextId++;
    const q = center(h2);
    h2.dispatchEvent(ptr('pointerdown', { ...q, id }));
    document.dispatchEvent(ptr('pointermove', { x: q.x - 2 * cmp.frameWidth, y: q.y, id }));
    expect(anim.setCelDuration).toHaveBeenCalledWith('L1', 'a', 2);
    document.dispatchEvent(ptr('pointercancel', { x: q.x, y: q.y, id }));
    expect(anim.setCelDuration.calls.mostRecent().args).toEqual(['L1', 'a', 4]);
    // the press on the handle never started a cel drag
    expect(cmp.isDragging).toBeFalse();
    flush(); fixture.destroy();
  }));

  it('play-range handle: a touch drag moves the end; pointercancel restores the range', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const h = el.querySelector('.range-handle-end')!;
    let id = nextId++;
    const p = center(h);
    h.dispatchEvent(ptr('pointerdown', { ...p, id }));
    document.dispatchEvent(ptr('pointermove', { x: p.x - 3 * cmp.frameWidth, y: p.y, id }));
    document.dispatchEvent(ptr('pointerup', { x: p.x - 3 * cmp.frameWidth, y: p.y, id }));
    expect(cmp.playRangeEnd).toBe(21);
    expect(cmp.currentFrame).toBe(1);   // the header did not scrub too
    fixture.detectChanges();
    id = nextId++;
    const h2 = el.querySelector('.range-handle-end')!;
    const q = center(h2);
    h2.dispatchEvent(ptr('pointerdown', { ...q, id }));
    document.dispatchEvent(ptr('pointermove', { x: q.x - 5 * cmp.frameWidth, y: q.y, id }));
    expect(cmp.playRangeEnd).toBe(16);
    document.dispatchEvent(ptr('pointercancel', { ...q, id }));
    expect(anim.setPlayRange).toHaveBeenCalledWith(1, 21);
    expect(cmp.playRangeEnd).toBe(21);
    flush(); fixture.destroy();
  }));

  it('keyframes: a touch drag moves one; the Select toggle makes taps multi-select; long-press opens easing', fakeAsync(() => {
    const { cmp, el, fixture, render } = setup();
    const sm = {
      setMeshKeyframe3D: jasmine.createSpy('setMeshKeyframe3D'), removeMeshKeyframe3D: jasmine.createSpy('removeMeshKeyframe3D'),
      setCameraKeyframe3D: jasmine.createSpy('setCameraKeyframe3D'), removeCameraKeyframe3D: jasmine.createSpy('removeCameraKeyframe3D'),
    };
    cmp.shapeManager = sm as never;
    cmp.mesh3dAllTracks = [{ meshId: 'm1', name: 'Box', tracks: { position: [{ frame: 1, value: [0, 0, 0], easing: 'linear' }, { frame: 7, value: [1, 0, 0] }] } }];
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const kfs = () => el.querySelectorAll('.kf-diamond');
    let id = nextId++;
    const p = center(kfs()[0]);
    kfs()[0].dispatchEvent(ptr('pointerdown', { ...p, id }));
    document.dispatchEvent(ptr('pointermove', { x: p.x + 3 * cmp.frameWidth, y: p.y, id }));
    expect(cmp.kfDragging).toBeTrue();
    document.dispatchEvent(ptr('pointerup', { x: p.x + 3 * cmp.frameWidth, y: p.y, id }));
    expect(sm.setMeshKeyframe3D).toHaveBeenCalledWith('m1', 'position', 4, [0, 0, 0], 'linear');
    expect(sm.removeMeshKeyframe3D).toHaveBeenCalledWith('m1', 'position', 1);
    render();   // the drop's ghost diamond goes
    expect(kfs().length).toBe(2);

    cmp.kfSelectMode = true;
    id = nextId++;
    kfs()[1].dispatchEvent(ptr('pointerdown', { ...center(kfs()[1]), id }));
    document.dispatchEvent(ptr('pointerup', { ...center(kfs()[1]), id }));
    expect(cmp.selectedKfKeys.has('m1:position:7')).toBeTrue();
    cmp.kfSelectMode = false;

    id = nextId++;
    kfs()[1].dispatchEvent(ptr('pointerdown', { ...center(kfs()[1]), id }));
    tick(LONG_PRESS_MS + 10);
    expect(cmp.showEasingMenu).toBeTrue();
    expect(cmp.kfContextFrame).toBe(7);
    document.dispatchEvent(ptr('pointerup', { ...center(kfs()[1]), id }));
    flush(); fixture.destroy();
  }));

  it('a two-finger pinch on the grid sets the frame width (and drops a pending cel press)', fakeAsync(() => {
    const { cmp, el, fixture } = setup();
    const cell = el.querySelectorAll('.tl-layer-row')[0].querySelectorAll('.tl-cell')[0];
    const id = nextId++;
    cell.dispatchEvent(ptr('pointerdown', { ...center(cell), id }));
    cmp.onGridTouchStart({ touches: [{ clientX: 300, clientY: 60 }, { clientX: 340, clientY: 60 }] });
    const prevent = jasmine.createSpy('preventDefault');
    cmp.onGridTouchMove({ touches: [{ clientX: 290, clientY: 60 }, { clientX: 350, clientY: 60 }], cancelable: true, preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
    expect(cmp.frameWidth).toBe(42);
    cmp.onGridTouchEnd({ touches: [{ clientX: 290, clientY: 60 }] });
    tick(CEL_TOUCH_DRAG_DELAY_MS + LONG_PRESS_MS);
    expect(cmp.isDragging).toBeFalse();
    expect(cmp.contextMenuVisible).toBeFalse();
    // after the pinch, a one-finger move is not a pinch
    cmp.onGridTouchMove({ touches: [{ clientX: 100, clientY: 60 }], cancelable: true, preventDefault: prevent });
    expect(cmp.frameWidth).toBe(42);
    flush(); fixture.destroy();
  }));

  it('"Move to Frame…" opens a frame prompt and moves the cel; no stuck drag ghost', fakeAsync(() => {
    const { cmp, el, anim, fixture, render } = setup();
    cmp.onCellContextMenu(new MouseEvent('contextmenu', { clientX: 200, clientY: 100 }), cmp.layers[0], 5);
    cmp.ctxMoveCel();
    render();
    expect(el.querySelector('.tl-cell.drag-ghost')).toBeNull();
    expect(cmp.isDragging).toBeFalse();
    expect(cmp.showCelFramePrompt).toBeTrue();
    expect(cmp.celFramePromptTarget).toBe(6);
    expect(el.querySelector('.cel-frame-panel')).toBeTruthy();
    cmp.celFramePromptTarget = 14;
    cmp.confirmCelFrameAction();
    expect(anim.moveCel).toHaveBeenCalledWith('L1', 'b', 14);
    expect(cmp.showCelFramePrompt).toBeFalse();
    flush(); fixture.destroy();
  }));

  it('"Swap with…" defaults to the next drawing, swaps with the cel at the chosen frame, refuses an empty frame', fakeAsync(() => {
    const { cmp, el, anim, fixture, render } = setup();
    cmp.onCellContextMenu(new MouseEvent('contextmenu', { clientX: 200, clientY: 100 }), cmp.layers[0], 1);
    cmp.ctxSwapCel();
    render();
    expect(cmp.celFramePromptMode).toBe('swap');
    expect(cmp.celFramePromptTarget).toBe(5);
    cmp.celFramePromptTarget = 15;   // blank
    render();
    const swapBtn = el.querySelector<HTMLButtonElement>('.cel-frame-panel .transport-btn')!;
    expect(swapBtn.disabled).toBeTrue();
    cmp.confirmCelFrameAction();
    expect(anim.swapCels).not.toHaveBeenCalled();
    cmp.onCellContextMenu(new MouseEvent('contextmenu', { clientX: 200, clientY: 100 }), cmp.layers[0], 1);
    cmp.ctxSwapCel();
    cmp.celFramePromptTarget = 10;   // inside cel c (9–12)
    cmp.confirmCelFrameAction();
    expect(anim.swapCels).toHaveBeenCalledWith('L1', 'a', 'c');
    flush(); fixture.destroy();
  }));

  it('the cel menu Hold − / + changes the hold length, capped by the next drawing', fakeAsync(() => {
    const { cmp, anim, fixture } = setup();
    cmp.onCellContextMenu(new MouseEvent('contextmenu', { clientX: 200, clientY: 100 }), cmp.layers[0], 1);
    const ev = new MouseEvent('click');
    cmp.ctxHoldDelta(ev, 1);
    expect(anim.setCelDuration).toHaveBeenCalledWith('L1', 'a', 4);
    cmp.ctxHoldDelta(ev, 1);   // frame 5 is cel b: already the most
    expect(anim.setCelDuration).toHaveBeenCalledTimes(1);
    cmp.ctxHoldDelta(ev, -1);
    expect(anim.setCelDuration).toHaveBeenCalledWith('L1', 'a', 3);
    expect(cmp.contextMenuVisible).toBeTrue();
    flush(); fixture.destroy();
  }));

  it('menus are clamped inside the viewport (x and y) once rendered', fakeAsync(() => {
    const { cmp, el, fixture, render } = setup();
    cmp.onCellContextMenu(new MouseEvent('contextmenu', { clientX: window.innerWidth - 5, clientY: 10 }), cmp.layers[0], 1);
    render();
    expect(el.querySelector('.ctx-menu')!.getBoundingClientRect().right).toBeGreaterThan(window.innerWidth);   // before
    cmp.clampOpenMenus();
    let r = el.querySelector('.ctx-menu')!.getBoundingClientRect();
    expect(r.right).toBeLessThanOrEqual(window.innerWidth);
    expect(r.top).toBeGreaterThanOrEqual(0);
    cmp.closeContextMenu();
    cmp.onKfTrackLabelContextMenu(new MouseEvent('contextmenu', { clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 }), 'm1', 'position', false);
    render();
    cmp.clampOpenMenus();
    r = el.querySelector('.ctx-menu')!.getBoundingClientRect();
    expect(r.right).toBeLessThanOrEqual(window.innerWidth);
    expect(r.bottom).toBeLessThanOrEqual(window.innerHeight);
    flush(); fixture.destroy();
  }));

  it('the ⋯ button opens the menu for the last tapped cel', fakeAsync(() => {
    const { cmp, el, fixture } = setup();
    const cells = el.querySelectorAll('.tl-layer-row')[0].querySelectorAll('.tl-cell');
    (cells[9] as HTMLElement).click();   // frame 10 (cel c)
    fixture.detectChanges();
    expect(cells[9].classList).toContain('tl-selected');
    (el.querySelector('.tl-more-btn') as HTMLElement).click();
    expect(cmp.contextMenuVisible).toBeTrue();
    expect(cmp.contextMenuCelId).toBe('c');
    expect(cmp.contextMenuFrame).toBe(10);
    flush(); fixture.destroy();
  }));

  it('label column and grid scroll together both ways', fakeAsync(() => {
    const many: TimelineLayerInfo[] = Array.from({ length: 14 }, (_, i) => ({ id: 'L' + i, name: 'Layer ' + i, animated: i % 2 === 0, cels: [] }));
    const { cmp, el, fixture } = setup(many);
    const grid = el.querySelector<HTMLElement>('.timeline-grid-wrapper')!;
    const labels = el.querySelector<HTMLElement>('.timeline-layers')!;
    expect(grid.scrollHeight).toBeGreaterThan(grid.clientHeight);
    labels.scrollTop = 40;
    cmp.onLayersScroll();
    expect(Math.round(grid.scrollTop)).toBe(Math.round(labels.scrollTop));
    grid.scrollTop = 90;
    cmp.onGridVerticalScroll();
    expect(Math.round(labels.scrollTop)).toBe(Math.round(grid.scrollTop));
    flush(); fixture.destroy();
  }));

  it('dragging the top edge resizes the panel, updates --fm-timeline-h and remembers the height', fakeAsync(() => {
    const host = document.createElement('app-illustration');
    document.body.appendChild(host);
    const { cmp, el, fixture } = setup();
    host.appendChild(el);
    const handle = el.querySelector('.tl-resize-handle')!;
    const h0 = el.querySelector('.timeline-panel')!.getBoundingClientRect().height;
    const id = nextId++;
    const p = center(handle);
    handle.dispatchEvent(ptr('pointerdown', { ...p, id }));
    document.dispatchEvent(ptr('pointermove', { x: p.x, y: p.y - 30, id }));
    document.dispatchEvent(ptr('pointerup', { x: p.x, y: p.y - 30, id }));
    const want = Math.round(Math.min(h0 + 30, Math.max(120, Math.round(window.innerHeight * 0.6))));   // capped at 60 % of the window
    expect(cmp.panelHeight).toBe(want);
    expect(host.style.getPropertyValue('--fm-timeline-h')).toBe((want + 4) + 'px');
    expect(localStorage.getItem(TIMELINE_HEIGHT_KEY)).toBe(String(want));
    // a huge drag stops at the cap
    const id2 = nextId++;
    handle.dispatchEvent(ptr('pointerdown', { ...center(handle), id: id2 }));
    document.dispatchEvent(ptr('pointermove', { x: p.x, y: p.y - 5000, id: id2 }));
    document.dispatchEvent(ptr('pointerup', { x: p.x, y: p.y - 5000, id: id2 }));
    expect(cmp.panelHeight).toBe(Math.max(120, Math.round(window.innerHeight * 0.6)));
    flush();
    fixture.destroy();
    expect(host.style.getPropertyValue('--fm-timeline-h')).toBe('');
    host.remove();
    discardPeriodicTasks();
  }));
});

/** Playback perf A2 (2026-10-09): one moving current-frame column instead of per-cell .current classes; a frame of
 *  playback writes the playhead / column / cap / counter straight to the DOM and runs no change detection. */
describe('AnimationTimelineComponent playback frame updates', () => {
  const tf = (el: HTMLElement, sel: string) => (el.querySelector(sel) as HTMLElement).style.transform;

  it('while playing, a frame moves the playhead, the column, the cap and the counter without change detection', fakeAsync(() => {
    const { cmp, el, anim, fixture } = setup();
    const cdr = (cmp as unknown as { cdr: { detectChanges(): void } }).cdr;
    const cd = spyOn(cdr, 'detectChanges').and.callThrough();
    anim.isPlaying$.next(true);
    cd.calls.reset();
    anim.currentFrame$.next(5);
    anim.currentFrame$.next(6);
    expect(cd).not.toHaveBeenCalled();
    const fw = cmp.frameWidth;
    expect(tf(el, '.tl-playhead')).toBe(`translateX(${5 * fw + fw / 2 - 1}px)`);
    expect(tf(el, '.tl-cur-frame')).toBe(`translateX(${5 * fw}px)`);
    el.querySelectorAll<HTMLElement>('.tl-cur-col').forEach(c => expect(c.style.transform).toBe(`translateX(${5 * fw}px)`));
    expect(el.querySelector('.tl-cur-frame')!.textContent).toBe('6');
    expect(el.querySelector('.frame-counter')!.textContent!.trim()).toBe('6 / 24');
    // no cell carries the current frame (only the cap is a .current frame number)
    expect(el.querySelectorAll('.current').length).toBe(1);
    expect(el.querySelectorAll('.tl-cell.current, .tl-3d-cell.current, .tl-3d-header-cell.current').length).toBe(0);
    flush(); fixture.destroy();
  }));

  it('pause, a paused step and a zoom refresh the view and keep the moved elements in step', fakeAsync(() => {
    const { cmp, el, anim, fixture, render } = setup();
    const cdr = (cmp as unknown as { cdr: { detectChanges(): void } }).cdr;
    anim.isPlaying$.next(true);
    anim.currentFrame$.next(9);
    const cd = spyOn(cdr, 'detectChanges').and.callThrough();
    anim.isPlaying$.next(false);
    expect(cd).toHaveBeenCalled();
    expect(el.querySelector('.play-btn')!.textContent!.trim()).toBe('▶');
    cd.calls.reset();
    anim.currentFrame$.next(3);   // a paused step / scrub: the usual refresh
    expect(cd).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.tl-cur-frame')!.textContent).toBe('3');
    expect(el.querySelector('.frame-counter')!.textContent!.trim()).toBe('3 / 24');
    // back to a frame the view saw before playback: nothing stale (no template binding to skip the write)
    anim.currentFrame$.next(9);
    expect(tf(el, '.tl-playhead')).toBe(`translateX(${8 * cmp.frameWidth + cmp.frameWidth / 2 - 1}px)`);
    cmp.frameWidth = 40;
    render();
    expect(tf(el, '.tl-cur-col')).toBe('translateX(320px)');
    expect((el.querySelector('.tl-cur-col') as HTMLElement).style.width).toBe('39px');
    expect((el.querySelector('.tl-cur-frame') as HTMLElement).style.width).toBe('40px');
    flush(); fixture.destroy();
  }));

  it('static layer rows are lifted over the column (not highlighted, as before)', fakeAsync(() => {
    const { el, fixture } = setup();
    const rows = el.querySelectorAll('.tl-layer-row');
    expect(rows[0].classList.contains('tl-static-row')).toBeFalse();   // Ink: animated
    expect(rows[1].classList.contains('tl-static-row')).toBeTrue();    // Paper: static
    flush(); fixture.destroy();
  }));
});

describe('AnimationTimelineComponent cel buttons + layer selection (touch feedback 2026-10-09)', () => {
  it('a tapped layer label is highlighted; a cel tap highlights its layer', fakeAsync(() => {
    const { fixture, cmp, el, render } = setup();
    const labels = () => Array.from(el.querySelectorAll<HTMLElement>('.tl-layer-label'));
    expect(labels().some(l => l.classList.contains('tl-label-selected'))).toBeFalse();
    labels()[1].click(); render();
    expect(cmp.selectedLayerId).toBe('L2');
    expect(labels()[1].classList.contains('tl-label-selected')).toBeTrue();
    expect(labels()[0].classList.contains('tl-label-selected')).toBeFalse();
    expect(el.querySelector('.tl-static-bar')!.classList.contains('tl-bar-selected')).toBeTrue();
    cmp.onCellClick(cmp.layers[0], 2); render();
    expect(cmp.selectedLayerId).toBe('L1');
    expect(labels()[0].classList.contains('tl-label-selected')).toBeTrue();
    flush(); fixture.destroy();
  }));

  it('◆ / ⧉ buttons: ⧉ is disabled on a frame with no drawing, ◆ without an animated layer; no arrows', fakeAsync(() => {
    const { fixture, cmp, el, anim, render } = setup();
    const [newBtn, dupBtn] = Array.from(el.querySelectorAll<HTMLButtonElement>('.cel-actions .transport-btn'));
    expect(newBtn.textContent!.trim()).toBe('◆');
    expect(dupBtn.textContent!.trim()).toBe('⧉');
    expect(cmp.canDuplicateCel).toBeTrue();          // frame 1: cel a
    expect(dupBtn.disabled).toBeFalse();
    anim.setCurrentFrame(4); render();               // frame 4: between a (1–3) and b (5–6)
    expect(cmp.canDuplicateCel).toBeFalse();
    expect(dupBtn.disabled).toBeTrue();
    expect(newBtn.disabled).toBeFalse();
    flush(); fixture.destroy();

    TestBed.resetTestingModule();
    const s2 = setup([{ id: 'L2', name: 'Paper', animated: false, cels: [] }]);
    const [newBtn2, dupBtn2] = Array.from(s2.el.querySelectorAll<HTMLButtonElement>('.cel-actions .transport-btn'));
    expect(s2.cmp.hasAnimatedLayer).toBeFalse();
    expect(newBtn2.disabled).toBeTrue();
    expect(dupBtn2.disabled).toBeTrue();
    flush(); s2.fixture.destroy();
  }));

  it('step buttons carry no title (a long press would show it as a tooltip)', fakeAsync(() => {
    const { fixture, el } = setup();
    for (const b of Array.from(el.querySelectorAll<HTMLElement>('.tl-step, .ctx-step, [aria-label^="Previous frame"], [aria-label^="Next frame"]'))) {
      expect(b.hasAttribute('title')).withContext(b.getAttribute('aria-label') ?? '').toBeFalse();
    }
    flush(); fixture.destroy();
  }));
});
