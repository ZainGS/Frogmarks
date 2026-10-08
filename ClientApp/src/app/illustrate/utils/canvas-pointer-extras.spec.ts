import { CanvasPointerExtras, isCanvasDrawingTool, type CanvasPointerExtrasHost } from './canvas-pointer-extras';

/** The extras listen on a "window" (here a container div: capture phase, like the real window) and act on presses on
 *  the canvas inside it. */
function setup(o: { menuAllowed?: boolean; altAllowed?: boolean; drawingTool?: boolean } = {}) {
  const root = document.createElement('div');
  const canvas = document.createElement('canvas');
  const other = document.createElement('div');
  root.append(canvas, other);
  document.body.appendChild(root);
  let t = 1000;
  const host: jasmine.SpyObj<CanvasPointerExtrasHost> = jasmine.createSpyObj('host',
    ['canvas', 'menuAllowed', 'openMenu', 'altSampleAllowed', 'sample', 'armedChanged', 'cancelPress', 'drawingToolActive']);
  host.canvas.and.returnValue(canvas);
  host.menuAllowed.and.returnValue(o.menuAllowed ?? true);
  host.altSampleAllowed.and.returnValue(o.altAllowed ?? true);
  host.drawingToolActive.and.returnValue(o.drawingTool ?? false);
  const extras = new CanvasPointerExtras(host, () => t);
  extras.attach(root as unknown as Window);
  // What the engine's own canvas listener sees
  const engineDown = jasmine.createSpy('engineDown');
  canvas.addEventListener('pointerdown', engineDown);
  const engineClick = jasmine.createSpy('engineClick');
  canvas.addEventListener('click', engineClick);
  const fire = (el: Element, type: string, init: PointerEventInit & { pointerType?: string } = {}) => {
    const e = (type === 'click' || type === 'contextmenu') && !init.pointerType
      ? new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
      : new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...init });
    el.dispatchEvent(e);
    return e;
  };
  const advance = (ms: number) => { t += ms; jasmine.clock().tick(ms); };
  const done = () => { extras.detach(); root.remove(); };
  return { extras, host, canvas, other, engineDown, engineClick, fire, advance, done };
}

describe('CanvasPointerExtras', () => {
  beforeEach(() => jasmine.clock().install());
  afterEach(() => jasmine.clock().uninstall());

  describe('eyedropper', () => {
    it('armed: the next canvas tap samples (the engine never sees it), then disarms', () => {
      const s = setup();
      s.extras.toggleArmed();
      expect(s.extras.armed).toBeTrue();
      expect(s.host.armedChanged).toHaveBeenCalledWith(true);
      expect(s.canvas.style.cursor).toBe('crosshair');
      s.fire(s.canvas, 'pointerdown', { pointerType: 'touch', clientX: 40, clientY: 50 });
      expect(s.host.sample).toHaveBeenCalledOnceWith(40, 50);
      expect(s.engineDown).not.toHaveBeenCalled();
      expect(s.extras.armed).toBeFalse();
      expect(s.host.armedChanged).toHaveBeenCalledWith(false);
      expect(s.canvas.style.cursor).toBe('');
      // its click is swallowed (the editor's click would place a shape / fill)
      s.fire(s.canvas, 'click');
      expect(s.engineClick).not.toHaveBeenCalled();
      // the next tap draws again
      s.advance(1000);
      s.fire(s.canvas, 'pointerdown', { pointerType: 'touch' });
      expect(s.engineDown).toHaveBeenCalledTimes(1);
      expect(s.host.sample).toHaveBeenCalledTimes(1);
      s.done();
    });

    it('a tap off the canvas leaves it armed; the button again (or Esc) disarms', () => {
      const s = setup();
      s.extras.toggleArmed();
      s.fire(s.other, 'pointerdown', { pointerType: 'touch' });
      expect(s.extras.armed).toBeTrue();
      expect(s.host.sample).not.toHaveBeenCalled();
      s.extras.toggleArmed();
      expect(s.extras.armed).toBeFalse();
      s.extras.toggleArmed();
      (s.canvas.parentElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(s.extras.armed).toBeFalse();
      s.done();
    });

    it('Alt+click samples on desktop without arming; not when the host forbids it (3D orbit / path edit)', () => {
      const s = setup();
      s.fire(s.canvas, 'pointerdown', { altKey: true, button: 0, clientX: 5, clientY: 6 });
      expect(s.host.sample).toHaveBeenCalledOnceWith(5, 6);
      expect(s.engineDown).not.toHaveBeenCalled();
      s.done();
      const no = setup({ altAllowed: false });
      no.fire(no.canvas, 'pointerdown', { altKey: true, button: 0 });
      expect(no.host.sample).not.toHaveBeenCalled();
      expect(no.engineDown).toHaveBeenCalledTimes(1);
      no.done();
    });

    it('a plain click is the engine\'s', () => {
      const s = setup();
      s.fire(s.canvas, 'pointerdown', { button: 0 });
      expect(s.host.sample).not.toHaveBeenCalled();
      expect(s.engineDown).toHaveBeenCalledTimes(1);
      s.done();
    });
  });

  describe('context menu', () => {
    it('right-click on the canvas opens it (and the browser menu is suppressed)', () => {
      const s = setup();
      s.fire(s.canvas, 'pointerdown', { button: 2, clientX: 10, clientY: 20 });
      const e = s.fire(s.canvas, 'contextmenu', { clientX: 10, clientY: 20 });
      expect(e.defaultPrevented).toBeTrue();
      expect(s.host.openMenu).toHaveBeenCalledOnceWith(10, 20);
      s.done();
    });

    it('opens even though the page prevents every contextmenu (index.html)', () => {
      const s = setup();
      s.canvas.addEventListener('contextmenu', ev => ev.preventDefault(), { once: true });
      s.fire(s.canvas, 'pointerdown', { button: 2, clientX: 10, clientY: 20 });
      s.fire(s.canvas, 'contextmenu', { clientX: 10, clientY: 20 });
      expect(s.host.openMenu).toHaveBeenCalledOnceWith(10, 20);
      s.done();
    });

    it('not after a right-drag, not when the host forbids it (3D view, the arrow tool mid-line …)', () => {
      const s = setup();
      s.fire(s.canvas, 'pointerdown', { button: 2, clientX: 10, clientY: 20 });
      s.fire(s.canvas, 'pointermove', { clientX: 60, clientY: 20 });
      s.fire(s.canvas, 'contextmenu', { clientX: 60, clientY: 20 });
      expect(s.host.openMenu).not.toHaveBeenCalled();
      s.done();
      const no = setup({ menuAllowed: false });   // e.g. the arrow tool mid-line (its right press cancels the line)
      no.fire(no.canvas, 'pointerdown', { button: 2 });
      no.fire(no.canvas, 'contextmenu');
      expect(no.host.openMenu).not.toHaveBeenCalled();
      no.done();
    });

    it('a touch long-press opens it, takes back the stroke it began, and swallows the release click', () => {
      const s = setup();
      s.fire(s.canvas, 'pointerdown', { pointerType: 'touch', clientX: 30, clientY: 40 });
      s.advance(CanvasPointerExtras.LONG_PRESS_MS - 50);
      expect(s.host.openMenu).not.toHaveBeenCalled();
      s.advance(60);
      expect(s.host.cancelPress).toHaveBeenCalledTimes(1);
      expect(s.host.openMenu).toHaveBeenCalledOnceWith(30, 40);
      s.fire(s.canvas, 'pointerup', { pointerType: 'touch' });
      s.fire(s.canvas, 'click');
      expect(s.engineClick).not.toHaveBeenCalled();
      // the long-press's own contextmenu (Android) doesn't open a second one
      s.fire(s.canvas, 'contextmenu');
      expect(s.host.openMenu).toHaveBeenCalledTimes(1);
      s.done();
    });

    it('no long-press when the finger moves (a stroke), lifts early (a tap) or a second finger lands (a pinch)', () => {
      const s = setup();
      s.fire(s.canvas, 'pointerdown', { pointerType: 'touch', clientX: 0, clientY: 0 });
      s.fire(s.canvas, 'pointermove', { pointerType: 'touch', clientX: 30, clientY: 0 });
      s.advance(1000);
      s.fire(s.canvas, 'pointerup', { pointerType: 'touch' });
      s.fire(s.canvas, 'pointerdown', { pointerType: 'touch' });
      s.advance(100);
      s.fire(s.canvas, 'pointerup', { pointerType: 'touch' });
      s.advance(1000);
      s.fire(s.canvas, 'pointerdown', { pointerType: 'touch' });
      s.fire(s.canvas, 'pointerdown', { pointerType: 'touch', pointerId: 2, isPrimary: false });
      s.advance(1000);
      expect(s.host.openMenu).not.toHaveBeenCalled();
      expect(s.host.cancelPress).not.toHaveBeenCalled();
      s.done();
    });

    it('a finger on a drawing tool: any movement after the press cancels the long-press (inside the slop too)', () => {
      const s = setup({ drawingTool: true });
      s.fire(s.canvas, 'pointerdown', { pointerType: 'touch', clientX: 30, clientY: 40 });
      s.fire(s.canvas, 'pointermove', { pointerType: 'touch', clientX: 31, clientY: 40 });
      s.advance(1000);
      expect(s.host.openMenu).not.toHaveBeenCalled();
      s.fire(s.canvas, 'pointerup', { pointerType: 'touch' });
      // a move event without a position change is not movement
      s.advance(1000);
      s.fire(s.canvas, 'pointerdown', { pointerType: 'touch', clientX: 30, clientY: 40 });
      s.fire(s.canvas, 'pointermove', { pointerType: 'touch', clientX: 30, clientY: 40 });
      s.advance(CanvasPointerExtras.LONG_PRESS_MS + 10);
      expect(s.host.openMenu).toHaveBeenCalledOnceWith(30, 40);
      s.done();
      // no drawing tool (cursor / selection): jitter inside the slop still opens it
      const sel = setup({ drawingTool: false });
      sel.fire(sel.canvas, 'pointerdown', { pointerType: 'touch', clientX: 30, clientY: 40 });
      sel.fire(sel.canvas, 'pointermove', { pointerType: 'touch', clientX: 33, clientY: 40 });
      sel.advance(CanvasPointerExtras.LONG_PRESS_MS + 10);
      expect(sel.host.openMenu).toHaveBeenCalledOnceWith(30, 40);
      sel.done();
    });

    it('a pen hold never opens it — not by the timer, not by the OS press-and-hold contextmenu (during or after)', () => {
      const s = setup({ drawingTool: true });
      s.fire(s.canvas, 'pointerdown', { pointerType: 'pen', button: 0, clientX: 30, clientY: 40 });
      s.advance(2000);
      expect(s.host.openMenu).not.toHaveBeenCalled();
      const during = s.fire(s.canvas, 'contextmenu', { pointerType: 'pen', clientX: 30, clientY: 40 });
      expect(during.defaultPrevented).toBeTrue();   // no browser menu either
      s.fire(s.canvas, 'pointerup', { pointerType: 'pen' });
      s.advance(200);
      s.fire(s.canvas, 'contextmenu', { clientX: 30, clientY: 40 });   // Windows sends it on the lift, as a mouse event
      expect(s.host.openMenu).not.toHaveBeenCalled();
      expect(s.host.cancelPress).not.toHaveBeenCalled();
      // a mouse right-click right after still opens it
      s.fire(s.canvas, 'pointerdown', { pointerType: 'mouse', button: 2, clientX: 5, clientY: 6 });
      s.fire(s.canvas, 'contextmenu', { clientX: 5, clientY: 6 });
      expect(s.host.openMenu).toHaveBeenCalledOnceWith(5, 6);
      s.done();
    });

    it('a pen barrel-button press (an explicit right press) still right-clicks', () => {
      const s = setup();
      s.fire(s.canvas, 'pointerdown', { pointerType: 'pen', button: 2, clientX: 10, clientY: 20 });
      s.fire(s.canvas, 'contextmenu', { pointerType: 'pen', clientX: 10, clientY: 20 });
      expect(s.host.openMenu).toHaveBeenCalledOnceWith(10, 20);
      s.done();
    });
  });

  it('isCanvasDrawingTool: drawing / placing tools yes; cursor, hand, pixel selection and raster move no', () => {
    for (const t of ['raster:brush', 'raster:eraser', 'drawing:pen', 'fill', 'shape:square', 'text', 'live-text', 'stamp', 'arrow']) {
      expect(isCanvasDrawingTool(t)).withContext(t).toBeTrue();
    }
    for (const t of ['', 'select:rect', 'select:lasso', 'raster:move']) expect(isCanvasDrawingTool(t)).withContext(t).toBeFalse();
  });
});
