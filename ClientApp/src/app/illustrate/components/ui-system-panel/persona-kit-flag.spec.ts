import { PERSONA_KIT_DEV_KEY, personaKitEnabled, SHOW_PERSONA_KIT } from './ui-system-panel.component';

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
