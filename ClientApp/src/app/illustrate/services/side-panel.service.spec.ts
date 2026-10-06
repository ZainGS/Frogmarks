import { SIDE_PANEL_STORAGE_KEY, SidePanelService } from './side-panel.service';

describe('SidePanelService (View › Side Panel)', () => {
  let saved: string | null;
  beforeEach(() => { saved = localStorage.getItem(SIDE_PANEL_STORAGE_KEY); localStorage.removeItem(SIDE_PANEL_STORAGE_KEY); });
  afterEach(() => {
    if (saved === null) localStorage.removeItem(SIDE_PANEL_STORAGE_KEY);
    else localStorage.setItem(SIDE_PANEL_STORAGE_KEY, saved);
  });

  it('is shown by default', () => {
    expect(new SidePanelService().visible).toBeTrue();
  });

  it('persists a hide per machine and reads it back in a new editor session', () => {
    const a = new SidePanelService();
    a.toggle();
    expect(a.visible).toBeFalse();
    expect(localStorage.getItem(SIDE_PANEL_STORAGE_KEY)).toBe('0');
    expect(new SidePanelService().visible).toBeFalse();
  });

  it('showing it again (toggle or show) clears the stored hide', () => {
    const a = new SidePanelService();
    a.set(false);
    a.show();
    expect(a.visible).toBeTrue();
    expect(localStorage.getItem(SIDE_PANEL_STORAGE_KEY)).toBeNull();
    a.set(false);
    a.toggle();
    expect(new SidePanelService().visible).toBeTrue();
  });

  it('keeps working when storage throws', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    const a = new SidePanelService();
    expect(a.visible).toBeTrue();
    expect(() => a.toggle()).not.toThrow();
    expect(a.visible).toBeFalse();
  });
});
