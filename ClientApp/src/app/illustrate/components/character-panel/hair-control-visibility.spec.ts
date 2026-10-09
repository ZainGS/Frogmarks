import { HAIR_GATHERED_INERT, hairControlVisibleFor as show } from './character-panel.component';

// Hair controls shown only where the Salsa hair build reads them (UI dead-controls audit 2026-10-09 §3 Hair). The rules
// are a copy of Salsa hair-control-modes.ts hairControlVisibleFor; Salsa's test verifies them against generateHair by
// perturbing every key per scenario and compares this copy with its own.
describe('hair control visibility in a mode (hairControlVisibleFor)', () => {
  const chunky = { hairMode: 'chunky', tailStyle: 'twin', bangCount: 6, partingStyle: 'parted', frontDrape: 0 };
  const cards = { ...chunky, hairMode: 'cards', cardifyCap: false };
  const locks = { hairMode: 'locks', fringeStyle: 'swept', tailStyle: 'twin', gather: false, lockSpike: 0 };

  it('Gathered hides Back but keeps Messiness for a Choppy fringe', () => {
    const g = { ...locks, gather: true };
    expect(HAIR_GATHERED_INERT).toContain('hairLength');
    expect(show('hairLength', g)).toBeFalse();
    expect(show('hairLength', locks)).toBeTrue();
    expect(show('lockJitter', g)).toBeFalse();
    expect(show('lockJitter', { ...g, fringeStyle: 'choppy' })).toBeTrue();
  });

  it('bangs: Part pos / width dead for Fringe, everything but Count (and the cap V offset) dead at Count 0', () => {
    expect(show('partingPosition', { ...chunky, partingStyle: 'fringe' })).toBeFalse();
    expect(show('partingWidth', { ...chunky, partingStyle: 'fringe' })).toBeFalse();
    expect(show('partingPosition', chunky)).toBeTrue();
    for (const k of ['partingStyle', 'partingPosition', 'bangLength', 'bangCurve', 'bangPointiness', 'bangOffset', 'verticalOffset']) {
      expect(show(k, { ...chunky, bangCount: 0 })).withContext(k).toBeFalse();
    }
    expect(show('bangCount', { ...chunky, bangCount: 0 })).toBeTrue();
  });

  it('Styled fringe: Height dead for None, Side only for Side-swept / Parted', () => {
    expect(show('fringeHeight', { ...locks, fringeStyle: 'none' })).toBeFalse();
    expect(show('fringeSide', { ...locks, fringeStyle: 'none' })).toBeFalse();
    expect(show('fringeSide', { ...locks, fringeStyle: 'straight' })).toBeFalse();
    expect(show('fringeSide', { ...locks, fringeStyle: 'choppy' })).toBeFalse();
    expect(show('fringeSide', { ...locks, fringeStyle: 'parted' })).toBeTrue();
    expect(show('fringeHeight', { ...locks, fringeStyle: 'straight' })).toBeTrue();
  });

  it('Flick is dead once Spikes are on', () => {
    expect(show('lockFlick', { ...locks, lockSpike: 0.5 })).toBeFalse();
    expect(show('lockFlick', locks)).toBeTrue();
  });

  it('buzz cut skips every cards geometry control', () => {
    for (const k of ['cardWidth', 'cardsPerClump', 'cardSegments', 'cardifyCap', 'capLayers', 'cardDetail']) {
      expect(show(k, { ...cards, buzzCut: true })).withContext(k).toBeFalse();
    }
    expect(show('capThickness', { ...cards, buzzCut: true })).toBeTrue();
  });

  it('card ribbons need tails or a front drape; the cardified cap needs no spikes', () => {
    const bare = { ...cards, tailStyle: 'none' };
    for (const k of ['cardWidth', 'cardsPerClump', 'cardSegments', 'cardDetail']) expect(show(k, bare)).withContext(k).toBeFalse();
    expect(show('cardDetail', { ...bare, cardifyCap: true })).toBeTrue();
    expect(show('cardWidth', { ...bare, frontDrape: 0.5 })).toBeTrue();
    expect(show('cardifyCap', { ...cards, spikeCap: true })).toBeFalse();
    expect(show('capLayers', { ...cards, spikeCap: true, cardifyCap: true })).toBeFalse();
    expect(show('capLayers', { ...cards, cardifyCap: true })).toBeTrue();
  });

  it('tail Thickness / End taper / Tip show where the spikes / front drape use them', () => {
    const bare = { ...chunky, tailStyle: 'none' };
    expect(show('tailThickness', bare)).toBeFalse();
    expect(show('tailThickness', { ...bare, spikeCap: true })).toBeTrue();
    expect(show('tailTaper', { ...bare, spikeCap: true })).toBeFalse();
    for (const k of ['tailThickness', 'tailTaper', 'tailTip']) expect(show(k, { ...bare, frontDrape: 1 })).withContext(k).toBeTrue();
    expect(show('tailLength', { ...bare, frontDrape: 1 })).toBeFalse();
    expect(show('tailStyle', bare)).toBeTrue();
    expect(show('tailTaper', { ...locks, tailForm: 'drill' })).toBeFalse();
  });

  it('facial hair Length works for Stubble too', () => {
    expect(show('beardLength', { ...chunky, facialHair: 'stubble' })).toBeTrue();
    expect(show('beardLength', { ...chunky, facialHair: 'none' })).toBeFalse();
  });
});
