/**
 * Shell › Settings is the one home for the Shell's settings (UI review 2026-10-07 §3 #23): the colour theme and the
 * local AI model address used to live in Salsa's top-right cluster panels (and the theme was forgotten on reload).
 * Pure helpers + the localStorage keys; StudioComponent wires them to the dialog.
 */

/** The Shell's colour themes (Salsa ShellThemeName), in the order Settings lists them. */
export type ShellThemeId = 'pinwheel' | 'frog' | 'moon' | 'polygon' | 'prism' | 'lattice';

export interface ShellThemeOption {
  id: ShellThemeId;
  label: string;
  /** Swatch colours (background, accent) — the theme's own, so the picker previews it. */
  bg: string;
  ink: string;
}

export const SHELL_THEME_OPTIONS: readonly ShellThemeOption[] = [
  { id: 'pinwheel', label: 'Pinwheel', bg: '#e7dbc2', ink: '#1a4c7c' },
  { id: 'frog',     label: 'Frog',     bg: '#cad7bc', ink: '#172113' },
  { id: 'moon',     label: 'Moon',     bg: '#0e0f11', ink: '#d1d4d7' },
  { id: 'polygon',  label: 'Polygon',  bg: '#000000', ink: '#75a870' },
  { id: 'prism',    label: 'Prism',    bg: '#000206', ink: '#66adf7' },
  { id: 'lattice',  label: 'Lattice',  bg: '#060400', ink: '#f7bd57' },
];

/** The Shell's own default (Salsa ShellUIManager.activeThemeName). */
export const DEFAULT_SHELL_THEME: ShellThemeId = 'polygon';

export const SHELL_THEME_KEY = 'frogmarks.shellTheme';
/** Same key Salsa's old cluster panel used (ShellUIManager.getLocalModelUrl reads it too). */
export const LOCAL_MODEL_URL_KEY = 'frogmarks.localModelUrl';

export function isShellThemeId(v: unknown): v is ShellThemeId {
  return typeof v === 'string' && SHELL_THEME_OPTIONS.some(o => o.id === v);
}

/** The saved theme, or null (none saved / unknown value / storage blocked). */
export function readSavedShellTheme(storage: Pick<Storage, 'getItem'> | null | undefined): ShellThemeId | null {
  try {
    const v = storage?.getItem(SHELL_THEME_KEY);
    return isShellThemeId(v) ? v : null;
  } catch { return null; }
}

export function saveShellTheme(storage: Pick<Storage, 'setItem'> | null | undefined, id: ShellThemeId): void {
  try { storage?.setItem(SHELL_THEME_KEY, id); } catch { /* storage blocked: this session only */ }
}

export function readLocalModelUrl(storage: Pick<Storage, 'getItem'> | null | undefined): string {
  try { return storage?.getItem(LOCAL_MODEL_URL_KEY) ?? ''; } catch { return ''; }
}

/** The address to store: trimmed; '' turns it off. Returns null when it is not a usable http(s) URL. */
export function normalizeLocalModelUrl(raw: string): string | null {
  const v = (raw ?? '').trim();
  if (!v) return '';
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return v.replace(/\/+$/, '');
  } catch { return null; }
}

export function saveLocalModelUrl(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, url: string): void {
  try {
    if (url) storage?.setItem(LOCAL_MODEL_URL_KEY, url);
    else storage?.removeItem(LOCAL_MODEL_URL_KEY);
  } catch { /* storage blocked */ }
}
