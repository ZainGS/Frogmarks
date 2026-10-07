import { nextShellDeviceBanner } from './shell-device-banner';

describe('nextShellDeviceBanner (Shell GPU device-lost banner)', () => {
  it('lost / recovering → the recovering banner, no remount yet', () => {
    expect(nextShellDeviceBanner(null, { status: 'lost' })).toEqual({ banner: 'recovering', detail: [], remount: false, autoHideMs: 0 });
    expect(nextShellDeviceBanner('recovering', { status: 'recovering' })?.banner).toBe('recovering');
  });

  it('ok after a loss → recovered, rebuild the Shell scene, hide soon', () => {
    const s = nextShellDeviceBanner('recovering', { status: 'ok', unrecovered: [] });
    expect(s).toEqual({ banner: 'recovered', detail: [], remount: true, autoHideMs: 2500 });
    const t = nextShellDeviceBanner('recovering', { status: 'ok', unrecovered: ['raster layer 2'] });
    expect(t?.detail).toEqual(['raster layer 2']);
    expect(t?.autoHideMs).toBe(8000);
  });

  it('a Retry that succeeds after a failure also rebuilds', () => {
    expect(nextShellDeviceBanner('failed', { status: 'ok' })?.remount).toBeTrue();
  });

  it('failed / unavailable → the failed banner with the reason', () => {
    expect(nextShellDeviceBanner('recovering', { status: 'failed', message: 'no adapter' }))
      .toEqual({ banner: 'failed', detail: ['no adapter'], remount: false, autoHideMs: 0 });
  });

  it('ok without a loss (or a repeated ok) changes nothing and never remounts twice', () => {
    expect(nextShellDeviceBanner(null, { status: 'ok' })).toBeNull();
    expect(nextShellDeviceBanner('recovered', { status: 'ok' })).toBeNull();
    expect(nextShellDeviceBanner(null, { status: 'initializing' })).toBeNull();
  });
});
