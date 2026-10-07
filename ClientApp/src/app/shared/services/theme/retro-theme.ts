/**
 * View › Retro Chrome: ONE source of truth for the app-wide theme switch (UI review 2026-10-07 §2b d25).
 *
 * The theme is ON by default. It is turned off only when localStorage `fm-theme` is `'plain'`. index.html applies the
 * stored choice in an inline script BEFORE the app boots (no flash of the wrong theme); that script reads the same key
 * and value, so keep them in step with RETRO_THEME_STORAGE_KEY / RETRO_THEME_OFF_VALUE below. The editor's menu reads
 * the body class (what is actually shown), never a separate flag.
 *
 * (The menu used to read `fm-theme === 'retro-chrome'` while index.html hard-coded the class: no ✓ while the theme was
 * on, and turning it off came back on reload.)
 */
export const RETRO_THEME_STORAGE_KEY = 'fm-theme';
/** Stored when the user turns the theme off. Any other value (or none) = on. */
export const RETRO_THEME_OFF_VALUE = 'plain';
export const RETRO_THEME_ON_VALUE = 'retro-chrome';
export const RETRO_THEME_BODY_CLASS = 'theme-retro-chrome';

/** The stored choice: true unless the user turned the theme off. Never throws (blocked storage = the default, on). */
export function storedRetroThemeOn(storage: Pick<Storage, 'getItem'> | null = safeLocalStorage()): boolean {
  try { return storage?.getItem(RETRO_THEME_STORAGE_KEY) !== RETRO_THEME_OFF_VALUE; } catch { return true; }
}

/** The theme is showing now (the body class). */
export function isRetroThemeOn(doc: Document = document): boolean {
  return doc.body.classList.contains(RETRO_THEME_BODY_CLASS);
}

/** Show the theme on / off and remember the choice on this device. */
export function setRetroTheme(on: boolean, doc: Document = document, storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()): void {
  doc.body.classList.toggle(RETRO_THEME_BODY_CLASS, on);
  try { storage?.setItem(RETRO_THEME_STORAGE_KEY, on ? RETRO_THEME_ON_VALUE : RETRO_THEME_OFF_VALUE); } catch { /* not remembered */ }
}

/** Make the body class match the stored choice (index.html already did; this covers a page without that script). */
export function applyStoredRetroTheme(doc: Document = document): void {
  doc.body.classList.toggle(RETRO_THEME_BODY_CLASS, storedRetroThemeOn());
}

function safeLocalStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
