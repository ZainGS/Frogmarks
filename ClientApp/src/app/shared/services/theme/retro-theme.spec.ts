import { RETRO_THEME_BODY_CLASS, RETRO_THEME_OFF_VALUE, RETRO_THEME_STORAGE_KEY, isRetroThemeOn, setRetroTheme, storedRetroThemeOn } from './retro-theme';

/** In-memory storage stand-in. */
function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

describe('retro-theme (View › Retro Chrome: one source of truth with index.html)', () => {
  let doc: Document;
  beforeEach(() => { doc = document.implementation.createHTMLDocument('t'); });

  it('is on by default (nothing stored, or the old "retro-chrome" value); off only when "plain" is stored', () => {
    expect(storedRetroThemeOn(memStorage())).toBeTrue();
    expect(storedRetroThemeOn(memStorage({ [RETRO_THEME_STORAGE_KEY]: 'retro-chrome' }))).toBeTrue();
    expect(storedRetroThemeOn(memStorage({ [RETRO_THEME_STORAGE_KEY]: RETRO_THEME_OFF_VALUE }))).toBeFalse();
  });

  it('turning it off sticks (stores "plain") and the ✓ reads the body class', () => {
    const s = memStorage();
    doc.body.classList.add(RETRO_THEME_BODY_CLASS);
    expect(isRetroThemeOn(doc)).toBeTrue();
    setRetroTheme(false, doc, s);
    expect(isRetroThemeOn(doc)).toBeFalse();
    expect(storedRetroThemeOn(s)).toBeFalse();
    setRetroTheme(true, doc, s);
    expect(isRetroThemeOn(doc)).toBeTrue();
    expect(storedRetroThemeOn(s)).toBeTrue();
  });

  it('blocked storage: never throws, defaults to on', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(storedRetroThemeOn(throwing)).toBeTrue();
    expect(() => setRetroTheme(false, doc, throwing)).not.toThrow();
    expect(isRetroThemeOn(doc)).toBeFalse();
  });
});
