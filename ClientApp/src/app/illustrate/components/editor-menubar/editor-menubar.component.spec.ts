import { EditorMenubarComponent, EditorMenubarHost } from './editor-menubar.component';
import { ExperimentalSettingsService } from '../../services/experimental-settings.service';

/** The menubar with a stand-in editor (only the members the Experimental menu touches). */
function makeMenubar() {
  const sm = { getStrokePrediction: () => true, setStrokePrediction: jasmine.createSpy('setStrokePrediction') };
  const editor = {
    shapeManager: sm as unknown, showFileMenu: false, showEditMenu: false, showAnimationMenu: false, showViewMenu: false,
    closeAllMenus: jasmine.createSpy('closeAllMenus').and.callFake(() => { editor.showFileMenu = false; }),
  };
  const exp = new ExperimentalSettingsService();
  const none = null as never;   // the File / Edit / View services are not used by the Experimental menu
  const menubar = new EditorMenubarComponent(none, none, none, none, exp, none);
  menubar.editor = editor as unknown as EditorMenubarHost;
  return { menubar, editor, exp, sm };
}

describe('EditorMenubarComponent › Experimental menu', () => {
  it('opening closes the other menus and reads the engine state; a second click closes it', () => {
    const { menubar, editor, exp } = makeMenubar();
    editor.showFileMenu = true;
    menubar.toggleExperimentalMenu();
    expect(editor.closeAllMenus).toHaveBeenCalled();
    expect(editor.showFileMenu).toBeFalse();
    expect(menubar.showExperimentalMenu).toBeTrue();
    expect(exp.hasStrokePrediction).toBeTrue();
    expect(exp.strokePrediction).toBeTrue();
    menubar.toggleExperimentalMenu();
    expect(menubar.showExperimentalMenu).toBeFalse();
  });

  it('hands the engine of the editor to the items', () => {
    const { menubar, exp, sm } = makeMenubar();
    menubar.toggleExperimentalMenu();
    exp.toggleStrokePrediction(menubar.engine);
    expect(sm.setStrokePrediction).toHaveBeenCalledOnceWith(false);
  });

  it('closes on a click elsewhere, and when the editor opens one of its own menus', () => {
    const { menubar, editor } = makeMenubar();
    menubar.toggleExperimentalMenu();
    menubar.onDocumentClick();
    expect(menubar.showExperimentalMenu).toBeFalse();
    menubar.toggleExperimentalMenu();
    menubar.ngDoCheck();
    expect(menubar.showExperimentalMenu).toBeTrue();
    editor.showViewMenu = true;
    menubar.ngDoCheck();
    expect(menubar.showExperimentalMenu).toBeFalse();
  });

  it('opens with every engine item hidden before the renderer has booted', () => {
    const { menubar, editor, exp } = makeMenubar();
    editor.shapeManager = undefined;
    expect(() => menubar.toggleExperimentalMenu()).not.toThrow();
    expect(menubar.showExperimentalMenu).toBeTrue();
    expect(exp.hasStrokePrediction).toBeFalse();
  });
});
