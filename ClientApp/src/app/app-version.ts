/**
 * Frogmarks app version: the ONE place to bump it. Shown at the bottom of the editor's File menu and in the Shell's
 * Settings dialog, so every deploy can be confirmed on the device.
 *
 * Bump by hand before each deploy: '0.01' -> '0.02' -> ... (README.md "Versioning / deploy check").
 */
export const APP_VERSION = '0.01';

/** A build stamp `npm run build` (scripts/build.mjs) writes into index.html as <meta name="fm-..."> tags. */
function buildMeta(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const v = document.querySelector(`meta[name="${name}"]`)?.getAttribute('content');
  return v ? v : null;
}

/** ISO time of the production build, or null under `ng serve`. */
export const BUILD_TIME = buildMeta('fm-build-time');
/** `version` of the Salsa package the build bundled, or null. */
export const SALSA_VERSION = buildMeta('fm-salsa-version');
/** Modified time of the Salsa dist bundle the build used (Salsa's version string rarely changes), or null. */
export const SALSA_DIST_TIME = buildMeta('fm-salsa-dist-time');

/** "2026-10-06 14:03" in the viewer's local time, or null. */
export function formatBuildTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** e.g. "Frogmarks v0.01". */
export const APP_VERSION_LABEL = `Frogmarks v${APP_VERSION}`;

/** "built 2026-10-06 14:03 · Salsa 0.0.1 (dist 2026-10-05 00:53)", or "dev build · ..." without a stamp. */
export function buildLabel(buildTime: string | null, salsaVersion: string | null, salsaDistTime: string | null): string {
  const built = formatBuildTime(buildTime);
  const dist = formatBuildTime(salsaDistTime);
  const salsa = salsaVersion ? `Salsa ${salsaVersion}${dist ? ` (dist ${dist})` : ''}` : null;
  return [built ? `built ${built}` : 'dev build', salsa].filter(Boolean).join(' · ');
}

export const APP_BUILD_LABEL = buildLabel(BUILD_TIME, SALSA_VERSION, SALSA_DIST_TIME);
