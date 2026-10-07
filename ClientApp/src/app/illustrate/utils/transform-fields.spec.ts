import { transformFieldValue, transformVec3 } from './transform-fields';

describe('transform fields (mesh inspector)', () => {
  it('reads numbers and numeric text', () => {
    expect(transformFieldValue(1.5)).toBe(1.5);
    expect(transformFieldValue(-2)).toBe(-2);
    expect(transformFieldValue(0)).toBe(0);
    expect(transformFieldValue('3.25')).toBe(3.25);
  });

  it('is null while the text is not a number yet (typing "-", a cleared field)', () => {
    for (const v of [null, undefined, '', '-', 'abc', NaN, Infinity]) expect(transformFieldValue(v)).withContext(String(v)).toBeNull();
  });

  it('commits a vector only when every field is a number', () => {
    expect(transformVec3(1, -2, 0)).toEqual([1, -2, 0]);
    expect(transformVec3(1, null, 0)).toBeNull();
    expect(transformVec3('', 2, 3)).toBeNull();
  });

  it('scale waits on a 0 (typing "0.5" passes through it)', () => {
    expect(transformVec3(1, 0, 1, { nonZero: true })).toBeNull();
    expect(transformVec3(1, 0.5, 1, { nonZero: true })).toEqual([1, 0.5, 1]);
    expect(transformVec3(-1, 2, 3, { nonZero: true })).toEqual([-1, 2, 3]);
  });
});
