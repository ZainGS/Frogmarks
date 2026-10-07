import type { ModeOpParam } from './mode-chrome.types';
import {
  axisChipOn, axisChips, clampParamValue, editTextForParam, formatParamValue, paramDecimals, parseTypedParamValue,
  scrubParamValue, stepParamValue, toggleAxisValue,
} from './op-pill-logic';

const num = (extra: Partial<ModeOpParam> = {}): ModeOpParam => ({ id: 'amount', label: 'Amount', kind: 'number', value: 0, ...extra });
const int = (extra: Partial<ModeOpParam> = {}): ModeOpParam => ({ id: 'count', label: 'Cuts', kind: 'int', value: 1, ...extra });

describe('op pill logic', () => {
  describe('clamp', () => {
    it('clamps to min / max and rounds ints', () => {
      expect(clampParamValue(num({ min: 0, max: 1 }), 1.5)).toBe(1);
      expect(clampParamValue(num({ min: 0, max: 1 }), -2)).toBe(0);
      expect(clampParamValue(int({ min: 1, max: 64 }), 3.6)).toBe(4);
      expect(clampParamValue(int({ min: 1 }), 0)).toBe(1);
    });
    it('NaN falls back to min (or 0)', () => {
      expect(clampParamValue(num({ min: 0.5 }), NaN)).toBe(0.5);
      expect(clampParamValue(num(), Infinity)).toBe(0);
    });
    it('drops float noise', () => {
      expect(clampParamValue(num(), 0.1 + 0.2)).toBe(0.3);
    });
  });

  describe('scrub', () => {
    it('a number moves one step per 2 px, either way', () => {
      expect(scrubParamValue(num({ step: 0.01 }), 0.5, 20)).toBeCloseTo(0.6, 10);
      expect(scrubParamValue(num({ step: 0.01 }), 0.5, -20)).toBeCloseTo(0.4, 10);
      expect(scrubParamValue(num({ step: 0.01 }), 0.5, 1)).toBe(0.5);   // under a step: unchanged
    });
    it('an int moves one per 8 px', () => {
      expect(scrubParamValue(int(), 2, 7)).toBe(2);
      expect(scrubParamValue(int(), 2, 8)).toBe(3);
      expect(scrubParamValue(int(), 2, -17)).toBe(0);
    });
    it('Shift scrubs ten times finer (numbers only)', () => {
      expect(scrubParamValue(num({ step: 0.1 }), 0, 20, true)).toBeCloseTo(0.1, 10);
      expect(scrubParamValue(num({ step: 0.1 }), 0, 20, false)).toBeCloseTo(1, 10);
      expect(scrubParamValue(int(), 0, 16, true)).toBe(2);
    });
    it('is clamped', () => {
      expect(scrubParamValue(num({ min: 0, max: 1, step: 0.1 }), 0.9, 400)).toBe(1);
      expect(scrubParamValue(int({ min: 1, max: 4 }), 2, -800)).toBe(1);
    });
  });

  it('− / + step and clamp', () => {
    expect(stepParamValue(num({ step: 0.05 }), 0.1, 1)).toBeCloseTo(0.15, 10);
    expect(stepParamValue(num({ step: 0.05, min: 0 }), 0.02, -1)).toBe(0);
    expect(stepParamValue(int({ max: 3 }), 3, 1)).toBe(3);
    expect(stepParamValue(int({ step: 2 }), 3, -1)).toBe(1);
  });

  describe('typing', () => {
    it('parses plain, comma-decimal and unit-suffixed text', () => {
      expect(parseTypedParamValue(num(), '0.25')).toBe(0.25);
      expect(parseTypedParamValue(num(), ' 0,5 ')).toBe(0.5);
      expect(parseTypedParamValue(num({ unit: '°' }), '45°')).toBe(45);
      expect(parseTypedParamValue(num({ unit: 'm' }), '2 m')).toBe(2);
      expect(parseTypedParamValue(num(), '.5')).toBe(0.5);
      expect(parseTypedParamValue(num(), '-3')).toBe(-3);
    });
    it('rejects non-numbers', () => {
      expect(parseTypedParamValue(num(), '')).toBeNull();
      expect(parseTypedParamValue(num(), 'abc')).toBeNull();
      expect(parseTypedParamValue(num(), '1..2')).toBeNull();
      expect(parseTypedParamValue(num(), '1+2')).toBeNull();
    });
    it('clamps and rounds typed values', () => {
      expect(parseTypedParamValue(num({ max: 1 }), '7')).toBe(1);
      expect(parseTypedParamValue(int({ min: 1 }), '2.6')).toBe(3);
      expect(parseTypedParamValue(int({ min: 1 }), '-4')).toBe(1);
    });
  });

  describe('display', () => {
    it('precision follows the step', () => {
      expect(paramDecimals(num())).toBe(2);
      expect(paramDecimals(num({ step: 0.001 }))).toBe(3);
      expect(paramDecimals(num({ step: 1 }))).toBe(0);
      expect(paramDecimals(num({ step: 1e-6 }))).toBe(4);
      expect(paramDecimals(int())).toBe(0);
    });
    it('formats with the unit', () => {
      expect(formatParamValue(num(), 0.5)).toBe('0.50');
      expect(formatParamValue(num({ step: 1, unit: '°' }), 45)).toBe('45°');
      expect(formatParamValue(num({ step: 1, unit: '%' }), 50)).toBe('50%');
      expect(formatParamValue(num({ step: 1, unit: 'px' }), 10)).toBe('10 px');
      expect(formatParamValue(int(), 3)).toBe('3');
      expect(formatParamValue(num(), 'x')).toBe('—');
    });
    it('edit text has no unit or trailing zeros', () => {
      expect(editTextForParam(num({ unit: '°' }), 0.5)).toBe('0.5');
      expect(editTextForParam(int(), 4)).toBe('4');
      expect(editTextForParam(num(), undefined)).toBe('');
    });
  });

  describe('axis chips', () => {
    const single = (value: string | null): ModeOpParam => ({ id: 'axis', label: 'Axis', kind: 'axis', value });
    const multi = (value: string[]): ModeOpParam => ({ id: 'mirror', label: 'Mirror', kind: 'axis', value });

    it('single pick has a None chip, multi does not', () => {
      expect(axisChips(single('x')).map(c => c.label)).toEqual(['X', 'Y', 'Z', 'None']);
      expect(axisChips(multi([])).map(c => c.label)).toEqual(['X', 'Y', 'Z']);
    });
    it('single: pick, re-tap clears, None clears', () => {
      expect(toggleAxisValue(single(null), 'y')).toBe('y');
      expect(toggleAxisValue(single('y'), 'y')).toBeNull();
      expect(toggleAxisValue(single('y'), 'z')).toBe('z');
      expect(toggleAxisValue(single('y'), null)).toBeNull();
      expect(axisChipOn(null, null)).toBeTrue();
      expect(axisChipOn('x', 'x')).toBeTrue();
      expect(axisChipOn('x', null)).toBeFalse();
    });
    it('multi: toggles, keeps X/Y/Z order', () => {
      expect(toggleAxisValue(multi(['z']), 'x')).toEqual(['x', 'z']);
      expect(toggleAxisValue(multi(['x', 'z']), 'x')).toEqual(['z']);
      expect(toggleAxisValue(multi(['x']), null)).toEqual([]);
      expect(axisChipOn(['x', 'y'], 'y')).toBeTrue();
      expect(axisChipOn([], 'y')).toBeFalse();
    });
    it('custom options replace X / Y / Z', () => {
      const p: ModeOpParam = { id: 'a', label: 'A', kind: 'axis', value: 'n', options: [{ id: 'n', label: 'Normal' }] };
      expect(axisChips(p).map(c => c.id)).toEqual(['n', null]);
    });
  });
});
