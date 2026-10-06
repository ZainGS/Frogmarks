import { toggleAppFullscreen } from './app-fullscreen';

describe('toggleAppFullscreen', () => {
  function fakeDoc(fullscreenElement: Element | null) {
    const root = { requestFullscreen: jasmine.createSpy('requestFullscreen').and.resolveTo() };
    return {
      documentElement: root,
      fullscreenElement,
      exitFullscreen: jasmine.createSpy('exitFullscreen').and.resolveTo(),
    };
  }

  it('fullscreens the document root (not the canvas shell), so the rail, panels, timeline and overlays stay visible', async () => {
    const doc = fakeDoc(null);
    await toggleAppFullscreen(doc as unknown as Document);
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  it('leaves fullscreen when something is already fullscreen', async () => {
    const doc = fakeDoc(document.body);
    await toggleAppFullscreen(doc as unknown as Document);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });

  it('swallows a rejected request (no user gesture / not allowed)', async () => {
    const doc = fakeDoc(null);
    doc.documentElement.requestFullscreen.and.rejectWith(new TypeError('not allowed'));
    spyOn(console, 'error');
    await expectAsync(toggleAppFullscreen(doc as unknown as Document)).toBeResolved();
  });
});
