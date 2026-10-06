import { HiddenUiWake } from './hidden-ui-wake';

describe('HiddenUiWake (hide-UI wake-up tap)', () => {
  let root: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let button: HTMLButtonElement;
  let seen: string[];
  let wakes: number;
  let showing: boolean;
  let playing: boolean;
  let wake: HiddenUiWake;

  const fire = (el: Element, type: string, pointerType: string, pointerId = 1): PointerEvent => {
    const e = new PointerEvent(type, { pointerType, pointerId, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };

  beforeEach(() => {
    root = document.createElement('div');
    canvas = document.createElement('canvas');
    button = document.createElement('button');
    root.append(canvas, button);
    document.body.appendChild(root);
    seen = [];
    wakes = 0;
    showing = false;
    playing = false;
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click'])
      canvas.addEventListener(t, (e) => seen.push(`${t}:${(e as PointerEvent).pointerId ?? ''}`));
    wake = new HiddenUiWake(root, {
      isButtonShowing: () => showing,
      passThrough: () => playing,
      onWake: () => { wakes++; showing = true; },
    });
    wake.attach();
  });

  afterEach(() => { wake.detach(); root.remove(); });

  it('a touch tap while the button is hidden only wakes it: the canvas never sees the gesture or its click', () => {
    const down = fire(canvas, 'pointerdown', 'touch');
    fire(canvas, 'pointermove', 'touch');
    fire(canvas, 'pointerup', 'touch');
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(wakes).toBe(1);
    expect(down.defaultPrevented).toBeTrue();
    expect(seen).toEqual([]);
  });

  it('once the button shows, touches pass through to the canvas (and keep it awake)', () => {
    fire(canvas, 'pointerdown', 'touch'); fire(canvas, 'pointerup', 'touch');
    seen = [];
    fire(canvas, 'pointerdown', 'touch', 2);
    fire(canvas, 'pointerup', 'touch', 2);
    expect(seen).toEqual(['pointerdown:2', 'pointerup:2']);
    expect(wakes).toBe(2);
  });

  it('a second finger landing during the wake gesture is swallowed too (no stray one-finger paint)', () => {
    fire(canvas, 'pointerdown', 'touch', 1);
    fire(canvas, 'pointerdown', 'touch', 2);
    fire(canvas, 'pointermove', 'touch', 2);
    fire(canvas, 'pointerup', 'touch', 1);
    fire(canvas, 'pointerup', 'touch', 2);
    expect(seen).toEqual([]);
  });

  it('pen and mouse are never swallowed but still wake the button', () => {
    fire(canvas, 'pointerdown', 'pen', 5);
    showing = false;
    fire(canvas, 'pointerdown', 'mouse', 6);
    expect(seen).toEqual(['pointerdown:5', 'pointerdown:6']);
    expect(wakes).toBe(2);
  });

  it('ignores presses on non-canvas elements (the Show UI button itself, overlays)', () => {
    fire(button, 'pointerdown', 'touch');
    expect(wakes).toBe(0);
  });

  it('passThrough (Play) never swallows', () => {
    playing = true;
    fire(canvas, 'pointerdown', 'touch');
    expect(seen).toEqual(['pointerdown:1']);
    expect(wakes).toBe(1);
  });

  it('detach removes every listener', () => {
    wake.detach();
    fire(canvas, 'pointerdown', 'touch');
    expect(wakes).toBe(0);
    expect(seen).toEqual(['pointerdown:1']);
  });
});
