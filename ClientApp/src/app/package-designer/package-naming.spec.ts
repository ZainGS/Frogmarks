import { LEGACY_DEFAULT_PACKAGE_NAME, cleanPackageName, defaultNameForNewPackage, nextPackageName } from './package-naming';

/** UI review 2026-10-07 §2d: every package was named "Product Packaging" and couldn't be renamed. */
describe('package naming', () => {
  it('numbers new packages one past the highest "Package N"', () => {
    expect(nextPackageName([])).toBe('Package 1');
    expect(nextPackageName(['Package 1', 'Package 3', 'My box', null, undefined])).toBe('Package 4');
    expect(nextPackageName(['Package 2 copy', 'package 9'])).toBe('Package 1');   // only the exact pattern counts
  });

  it('replaces only the old shared default (or an empty name) on first open', () => {
    expect(defaultNameForNewPackage(LEGACY_DEFAULT_PACKAGE_NAME, ['Package 1'])).toBe('Package 2');
    expect(defaultNameForNewPackage('', [])).toBe('Package 1');
    expect(defaultNameForNewPackage(undefined, [])).toBe('Package 1');
    expect(defaultNameForNewPackage('Cereal box', ['Package 1'])).toBe('Cereal box');
  });

  it('cleans a typed name, and rejects an empty one', () => {
    expect(cleanPackageName('  Tea   tin  ')).toBe('Tea tin');
    expect(cleanPackageName('   ')).toBeNull();
    expect(cleanPackageName(null)).toBeNull();
    expect(cleanPackageName('x'.repeat(200))!.length).toBe(80);
  });
});
