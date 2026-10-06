import { APP_VERSION, APP_VERSION_LABEL, buildLabel, formatBuildTime } from './app-version';

describe('app version label', () => {
  it('is "Frogmarks v<APP_VERSION>" with a 0.NN version', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d{2}$/);
    expect(APP_VERSION_LABEL).toBe(`Frogmarks v${APP_VERSION}`);
  });

  it('formats a build stamp, and says "dev build" without one', () => {
    expect(formatBuildTime(null)).toBeNull();
    expect(formatBuildTime('not a date')).toBeNull();
    expect(formatBuildTime(new Date(2026, 9, 6, 9, 5).toISOString())).toBe('2026-10-06 09:05');
    expect(buildLabel(null, null, null)).toBe('dev build');
    expect(buildLabel(new Date(2026, 9, 6, 14, 3).toISOString(), '0.0.1', new Date(2026, 9, 5, 0, 53).toISOString()))
      .toBe('built 2026-10-06 14:03 · Salsa 0.0.1 (dist 2026-10-05 00:53)');
  });
});
