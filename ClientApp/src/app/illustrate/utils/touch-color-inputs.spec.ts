import { installTouchColorInputs, toColorInputHex } from './touch-color-inputs';

describe('installTouchColorInputs', () => {
  let input: HTMLInputElement;
  let uninstall: () => void;
  let current: string;
  let inputs: string[];
  let changes: number;

  function tap(pointerType: string, target: Element = input): MouseEvent {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType }));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(click);
    return click;
  }

  beforeEach(() => {
    current = '#9B59B6';
    inputs = []; changes = 0;
    input = document.createElement('input');
    input.type = 'color';
    input.value = '#000000';
    input.addEventListener('input', () => inputs.push(input.value));
    input.addEventListener('change', () => changes++);
    document.body.appendChild(input);
    uninstall = installTouchColorInputs(() => current);
  });
  afterEach(() => { uninstall(); input.remove(); });

  it('a touch or pen tap applies the current picker colour and blocks the platform dialog', () => {
    const click = tap('touch');
    expect(click.defaultPrevented).toBeTrue();
    expect(input.value).toBe('#9b59b6');
    expect(inputs).toEqual(['#9b59b6']);
    expect(changes).toBe(1);
    current = '#0f0';
    expect(tap('pen').defaultPrevented).toBeTrue();
    expect(input.value).toBe('#00ff00');
  });

  it('a mouse click keeps the normal picker', () => {
    const click = tap('mouse');
    expect(click.defaultPrevented).toBeFalse();
    expect(input.value).toBe('#000000');
    expect(inputs.length).toBe(0);
  });

  it('the same colour fires no events; disabled inputs and other elements are left alone', () => {
    input.value = '#9b59b6';
    expect(tap('touch').defaultPrevented).toBeTrue();
    expect(inputs.length).toBe(0);
    input.disabled = true;
    current = '#ff0000';
    expect(tap('touch').defaultPrevented).toBeFalse();
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    expect(tap('touch', btn).defaultPrevented).toBeFalse();
    btn.remove();
  });

  it('after uninstall a tap does nothing', () => {
    uninstall();
    expect(tap('touch').defaultPrevented).toBeFalse();
    expect(input.value).toBe('#000000');
    uninstall = () => {};
  });
});

describe('toColorInputHex', () => {
  it('normalises hex forms', () => {
    expect(toColorInputHex('#ABC')).toBe('#aabbcc');
    expect(toColorInputHex('9B59B6')).toBe('#9b59b6');
    expect(toColorInputHex('#11223344')).toBe('#112233');
    expect(toColorInputHex('rgb(1,2,3)')).toBeNull();
    expect(toColorInputHex(null)).toBeNull();
  });
});
