import { parseAnyColor, withHash } from './color-utils';

describe('color-utils bare hex (UI review 2026-10-07: new document background flipped dark → white on reload)', () => {
  it('prefixes a bare 3 / 6 / 8-digit hex and leaves everything else alone', () => {
    expect(withHash('191919')).toBe('#191919');
    expect(withHash('fff')).toBe('#fff');
    expect(withHash('11223344')).toBe('#11223344');
    expect(withHash('#191919')).toBe('#191919');
    expect(withHash('red')).toBe('red');
    expect(withHash('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(withHash(undefined)).toBe('');
  });

  it("parses the engine's bare 'rrggbb' as that colour, not white", () => {
    expect(parseAnyColor('191919')).toEqual({ r: 25, g: 25, b: 25, a: 1 });
    expect(parseAnyColor('#191919')).toEqual({ r: 25, g: 25, b: 25, a: 1 });
  });
});
