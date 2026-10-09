import {
  createDefaultParams, engineTextEffectParams, setTextEffectParam, textEffectGlowColor, TEXT_EFFECT_PRESETS, TextEffectEntry,
} from './text-effect.model';

/** Glow Color reaches the engine (UI dead-controls audit 2026-10-09): Salsa's glow reads `color`; the panels wrote
 *  `glowColor`, which nothing read. */
describe('text-effect model — glow colour', () => {
  it('a new glow carries its colour under the key the engine reads', () => {
    const p = createDefaultParams('glow');
    expect(p['color']).toEqual([1, 1, 1, 1]);
    expect('glowColor' in p).toBeFalse();
  });

  it('presets already use color (the swatch shows it)', () => {
    const neon = TEXT_EFFECT_PRESETS.find(p => p.label === 'Neon')!.effects.find(e => e.type === 'glow')!;
    expect(textEffectGlowColor(neon.params)).toEqual([1, 0, 0.5]);
  });

  it('a chain saved with the legacy glowColor still shows and sends its colour', () => {
    const legacy = { radius: 4, intensity: 1.5, glowColor: [0, 1, 0, 1] };
    expect(textEffectGlowColor(legacy)).toEqual([0, 1, 0, 1]);
    const sent = engineTextEffectParams('glow', legacy);
    expect(sent['color']).toEqual([0, 1, 0, 1]);
    expect('glowColor' in sent).toBeFalse();
    expect(legacy.glowColor).toEqual([0, 1, 0, 1]);   // a copy — the UI entry is untouched
  });

  it('color wins over a stale glowColor; other effects pass through unchanged', () => {
    expect(engineTextEffectParams('glow', { color: [1, 0, 0], glowColor: [0, 0, 1] })['color']).toEqual([1, 0, 0]);
    expect(engineTextEffectParams('outline', { thickness: 2, glowColor: 'x' })).toEqual({ thickness: 2, glowColor: 'x' });
  });

  it('editing the swatch writes color and drops the legacy key', () => {
    const entry: TextEffectEntry = { id: 1, type: 'glow', params: { radius: 4, intensity: 1, glowColor: [0, 1, 0, 1] } };
    setTextEffectParam(entry, 'color', [0.2, 0.4, 0.6, 1]);
    expect(entry.params['color']).toEqual([0.2, 0.4, 0.6, 1]);
    expect('glowColor' in entry.params).toBeFalse();
    expect(textEffectGlowColor(entry.params)).toEqual([0.2, 0.4, 0.6, 1]);
  });
});
