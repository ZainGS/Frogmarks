import { dimWorldStrength, PERSONA_KIT_DEV_KEY, personaKitEnabled, SHOW_PERSONA_KIT } from './ui-system-panel.component';

describe('Persona kit flag (UI panel, WIP)', () => {
  afterEach(() => localStorage.removeItem(PERSONA_KIT_DEV_KEY));

  it('is hidden from users by default', () => {
    expect(SHOW_PERSONA_KIT).toBeFalse();
    localStorage.removeItem(PERSONA_KIT_DEV_KEY);
    expect(personaKitEnabled()).toBeFalse();
  });

  it('comes back per machine with the dev override', () => {
    localStorage.setItem(PERSONA_KIT_DEV_KEY, '1');
    expect(personaKitEnabled()).toBeTrue();
  });
});

describe('UI System Dim world slider (audit 2026-10-09)', () => {
  it('shows the engine strength 0..1; an older save above 1 reads as full', () => {
    expect(dimWorldStrength(undefined)).toBe(0);
    expect(dimWorldStrength(0.35)).toBe(0.35);
    expect(dimWorldStrength(8)).toBe(1);
    expect(dimWorldStrength(-1)).toBe(0);
  });
});
