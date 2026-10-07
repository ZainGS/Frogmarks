/**
 * Package names (UI review 2026-10-07 §2d: every package was called "Product Packaging" and couldn't be renamed).
 *
 * A new package gets the next free "Package N"; the user renames it from the editor's header.
 */

/** The name the Shell's "+ New Product Packaging" gives every new package. The editor replaces it on a package's
 *  first open (see defaultNameForNewPackage). */
export const LEGACY_DEFAULT_PACKAGE_NAME = 'Product Packaging';

const NUMBERED = /^Package (\d+)$/;

/** The next free "Package N" given the names already in use (N = one past the highest, starting at 1). */
export function nextPackageName(existingNames: Iterable<string | null | undefined>): string {
  let max = 0;
  for (const name of existingNames) {
    const m = NUMBERED.exec((name ?? '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Package ${max + 1}`;
}

/** The name a package opened for the first time should get: its own name, unless that is empty or the old shared
 *  default, then the next free "Package N". */
export function defaultNameForNewPackage(currentName: string | null | undefined,
                                         otherPackageNames: Iterable<string | null | undefined>): string {
  const name = (currentName ?? '').trim();
  if (name && name !== LEGACY_DEFAULT_PACKAGE_NAME) return name;
  return nextPackageName(otherPackageNames);
}

/** A name typed into the header: trimmed, at most 80 characters; null when nothing usable is left (keep the old one). */
export function cleanPackageName(typed: string | null | undefined): string | null {
  const name = (typed ?? '').replace(/\s+/g, ' ').trim().slice(0, 80).trim();
  return name ? name : null;
}
