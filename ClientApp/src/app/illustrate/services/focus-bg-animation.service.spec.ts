import { FOCUS_BG_ANIMATE_STORAGE_KEY, FocusBgAnimationService } from './focus-bg-animation.service';
import { EditorMenubarComponent, EditorMenubarHost } from '../components/editor-menubar/editor-menubar.component';
import { ExperimentalSettingsService } from './experimental-settings.service';

describe('FocusBgAnimationService (View › Toggle Animations)', () => {
  let saved: string | null;
  beforeEach(() => { saved = localStorage.getItem(FOCUS_BG_ANIMATE_STORAGE_KEY); localStorage.removeItem(FOCUS_BG_ANIMATE_STORAGE_KEY); });
  afterEach(() => {
    if (saved === null) localStorage.removeItem(FOCUS_BG_ANIMATE_STORAGE_KEY);
    else localStorage.setItem(FOCUS_BG_ANIMATE_STORAGE_KEY, saved);
  });

  it('is off (frozen) by default, and the choice is remembered on this device', () => {
    const a = new FocusBgAnimationService();
    expect(a.on).toBeFalse();
    a.toggle();
    expect(a.on).toBeTrue();
    expect(localStorage.getItem(FOCUS_BG_ANIMATE_STORAGE_KEY)).toBe('1');
    expect(new FocusBgAnimationService().on).toBeTrue();
    a.toggle();
    expect(localStorage.getItem(FOCUS_BG_ANIMATE_STORAGE_KEY)).toBe('0');
    expect(new FocusBgAnimationService().on).toBeFalse();
  });

  it('pushes the one engine switch (every mode); an older Salsa without it is left alone', () => {
    const a = new FocusBgAnimationService();
    const sm = { setFocusBgAnimate3D: jasmine.createSpy('setFocusBgAnimate3D') };
    expect(a.supported(sm)).toBeTrue();
    expect(a.apply(sm)).toBeTrue();
    expect(sm.setFocusBgAnimate3D).toHaveBeenCalledWith(false);
    a.set(true, sm);
    expect(sm.setFocusBgAnimate3D).toHaveBeenCalledWith(true);
    const old = { setMeshEditBgMode3D: () => undefined };
    expect(a.supported(old)).toBeFalse();
    expect(a.apply(old)).toBeFalse();
    expect(() => a.toggle(old)).not.toThrow();
    expect(a.apply(undefined)).toBeFalse();
  });

  it('the menubar applies it to each engine once, and its item toggles it', () => {
    const sm = { setFocusBgAnimate3D: jasmine.createSpy('setFocusBgAnimate3D') };
    const editor = { shapeManager: undefined as unknown, showFileMenu: false, showEditMenu: false, showAnimationMenu: false, showViewMenu: false, closeAllMenus: () => undefined };
    const none = null as never;
    const focusBg = new FocusBgAnimationService();
    const menubar = new EditorMenubarComponent(none, none, none, none, new ExperimentalSettingsService(), none, none, undefined, undefined, focusBg);
    menubar.editor = editor as unknown as EditorMenubarHost;
    menubar.ngDoCheck();                                   // no engine yet: nothing to do
    expect(menubar.focusBgAnimateSupported).toBeFalse();
    editor.shapeManager = sm;
    menubar.ngDoCheck();
    menubar.ngDoCheck();
    expect(sm.setFocusBgAnimate3D).toHaveBeenCalledOnceWith(false);
    expect(menubar.focusBgAnimateSupported).toBeTrue();
    menubar.toggleFocusBgAnimate();
    expect(focusBg.on).toBeTrue();
    expect(sm.setFocusBgAnimate3D).toHaveBeenCalledWith(true);
  });
});
