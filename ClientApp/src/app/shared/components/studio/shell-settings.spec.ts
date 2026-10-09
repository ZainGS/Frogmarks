import {
  DEFAULT_SHELL_THEME, isShellThemeId, normalizeLocalModelUrl, readSavedShellTheme,
  saveShellTheme, SHELL_THEME_KEY, SHELL_THEME_OPTIONS,
} from './shell-settings';
import { StudioComponent } from './studio.component';

/** A Map-backed Storage stand-in. */
function memStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}
const throwing = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};

describe('Shell settings (one home for the Shell settings)', () => {
  it('lists all six Salsa themes once, the default among them', () => {
    const ids = SHELL_THEME_OPTIONS.map(o => o.id);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toContain(DEFAULT_SHELL_THEME);
    expect(isShellThemeId('moon')).toBeTrue();
    expect(isShellThemeId('neon')).toBeFalse();
  });

  it('remembers the theme; ignores unknown values and blocked storage', () => {
    const s = memStorage();
    expect(readSavedShellTheme(s)).toBeNull();
    saveShellTheme(s, 'frog');
    expect(s.map.get(SHELL_THEME_KEY)).toBe('frog');
    expect(readSavedShellTheme(s)).toBe('frog');
    s.map.set(SHELL_THEME_KEY, 'neon');
    expect(readSavedShellTheme(s)).toBeNull();
    expect(readSavedShellTheme(throwing)).toBeNull();
    expect(() => saveShellTheme(throwing, 'moon')).not.toThrow();
    expect(readSavedShellTheme(null)).toBeNull();
  });

  it('local model address: http(s) only, trimmed, no trailing slash, empty turns it off', () => {
    expect(normalizeLocalModelUrl('  http://localhost:11434/ ')).toBe('http://localhost:11434');
    expect(normalizeLocalModelUrl('https://gpu.box:8080/v1')).toBe('https://gpu.box:8080/v1');
    expect(normalizeLocalModelUrl('')).toBe('');
    expect(normalizeLocalModelUrl('   ')).toBe('');
    expect(normalizeLocalModelUrl('localhost:11434')).toBeNull();
    expect(normalizeLocalModelUrl('ftp://x')).toBeNull();
    expect(normalizeLocalModelUrl('not a url')).toBeNull();
  });
});

describe('Shell › Settings › Local GPU model address (audit 2026-10-09)', () => {
  it('opens with and saves to LocalInferenceService (what the AI features read)', () => {
    const inference = { baseUrl: 'http://localhost:11434', setBaseUrl: jasmine.createSpy('setBaseUrl').and.callFake((u: string) => { inference.baseUrl = u || 'http://localhost:11434'; }) };
    const none = null as never;
    const c = new StudioComponent(none, none, none, none, none, { refreshEstimate: () => Promise.resolve() } as never, none, none, none, inference as never, none);
    (c as unknown as { _syncModalChrome(): void })._syncModalChrome = () => undefined;
    c.openStorageSettings();
    expect(c.localModelUrl).toBe('http://localhost:11434');
    c.localModelUrl = ' http://gpu.box:11434/ ';
    c.saveLocalModel();
    expect(inference.setBaseUrl).toHaveBeenCalledOnceWith('http://gpu.box:11434');
    expect(c.localModelStatus).toBe('saved');
    c.localModelUrl = 'not a url';
    c.saveLocalModel();
    expect(c.localModelStatus).toBe('invalid');
    expect(inference.setBaseUrl).toHaveBeenCalledTimes(1);
  });
});
