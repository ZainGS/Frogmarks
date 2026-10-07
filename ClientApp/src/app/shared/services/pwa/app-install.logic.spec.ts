import { installInstructions, installPlatform, installState } from './app-install.logic';

describe('app install (Settings › Install app)', () => {
  const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
    chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
    firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  };

  it('tells the platforms apart (an iPad in desktop mode by its touch points)', () => {
    expect(installPlatform(UA.iphone)).toBe('ios');
    expect(installPlatform(UA.ipadDesktopMode, 5)).toBe('ios');
    expect(installPlatform(UA.safariMac, 0)).toBe('safari-mac');
    expect(installPlatform(UA.android)).toBe('android');
    expect(installPlatform(UA.androidFirefox)).toBe('firefox-android');
    expect(installPlatform(UA.chromeWin)).toBe('desktop-chromium');
    expect(installPlatform(UA.edge)).toBe('desktop-chromium');
    expect(installPlatform(UA.firefoxWin)).toBe('firefox');
    expect(installPlatform('')).toBe('other');
  });

  it('every platform has plain steps', () => {
    expect(installInstructions('ios')).toContain('Add to Home Screen');
    expect(installInstructions('safari-mac')).toContain('Add to Dock');
    expect(installInstructions('desktop-chromium')).toContain('Install');
    expect(installInstructions('firefox')).toContain('Chrome');
    for (const p of ['android', 'firefox-android', 'other'] as const) expect(installInstructions(p).length).toBeGreaterThan(20);
  });

  it('installed wins; else the prompt when the browser offered one; else the steps', () => {
    expect(installState({ installed: true, canPrompt: true })).toBe('installed');
    expect(installState({ installed: false, canPrompt: true })).toBe('prompt');
    expect(installState({ installed: false, canPrompt: false })).toBe('instructions');
  });
});
