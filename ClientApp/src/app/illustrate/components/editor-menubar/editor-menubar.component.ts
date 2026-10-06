import { Component, DoCheck, HostListener, Input } from '@angular/core';
import type { IllustrationComponent } from '../illustration/illustration.component';
import { ProjectFileService } from '../../services/project-file.service';
import { ViewportHudService } from '../../services/viewport-hud.service';
import { IllustrationPersistenceService } from '../../services/illustration-persistence.service';
import { StorageSettingsService } from '../../services/storage-settings.service';
import { ExperimentalSettingsService } from '../../services/experimental-settings.service';
import { APP_BUILD_LABEL, APP_VERSION_LABEL } from '../../../app-version';

/** Exactly the editor members the menubar uses (compile-time checked against the editor). */
export type EditorMenubarHost = Pick<IllustrationComponent, 'doc' | 'imports' | 'artboard' |
  'animationEnabled' | 'closeAllMenus' | 'editRedo' | 'editUndo' | 'editDuplicate' | 'canEditDuplicate' | 'editDelete' |
  'sidePanel' | 'toggleSidePanel' | 'menuAddCel' | 'menuAddFrames' |
  'menuDeleteFrame' | 'menuInsertFrame' | 'openFrogmarksPicker' | 'rasterFlipHorizontal' | 'rasterFlipVertical' | 'rasterRedo' |
  'rasterRotate' | 'rasterSelectionService' | 'rasterUndo' | 'retroThemeActive' | 'saveNow' | 'shapeManager' | 'showAnimationMenu' | 'showEditMenu' | 'showFileMenu' | 'showShortcutCheatsheet' |
  'showViewMenu' | 'toggleAnimationMenu' | 'toggleAnimationMode' | 'toggleEditMenu' | 'toggleFileMenu' |
  'toggleFullscreen' | 'toggleRetroTheme' | 'toggleUI' | 'toggleViewMenu'
>;

/** Top menubar: File / Edit / View / Animation / Help menus (the dropdowns). The open flags, closeAllMenus and every action stay the editor's (its document click closes the menus); this view reaches them through `editor` (refactor-plan 2.9F). The Experimental menu is the exception: its open flag lives here and its logic in ExperimentalSettingsService. */
@Component({
  selector: 'app-editor-menubar',
  templateUrl: './editor-menubar.component.html',
  styleUrls: ['./editor-menubar.component.scss'],
})
export class EditorMenubarComponent implements DoCheck {
  @Input() editor!: EditorMenubarHost;
  /** Bottom of the File menu: "Frogmarks v0.01" + build time / Salsa dist (app-version.ts: bump APP_VERSION per deploy). */
  readonly appVersionLabel = APP_VERSION_LABEL;
  readonly appBuildLabel = APP_BUILD_LABEL;
  /** The Experimental dropdown is open. Kept here (not on the editor) so the editor needs no new member. */
  showExperimentalMenu = false;
  constructor(public files: ProjectFileService, public hud: ViewportHudService, public persist: IllustrationPersistenceService, public storage: StorageSettingsService,
              public exp: ExperimentalSettingsService) {}

  /** The engine handle for the Experimental items (undefined until the renderer has booted). */
  get engine(): EditorMenubarHost['shapeManager'] | undefined { return this.editor?.shapeManager; }

  toggleExperimentalMenu(): void {
    const wasOpen = this.showExperimentalMenu;
    this.editor.closeAllMenus();
    this.showExperimentalMenu = !wasOpen;
    if (this.showExperimentalMenu) this.exp.refresh(this.engine);
  }
  closeExperimentalMenu(): void { this.showExperimentalMenu = false; }

  /** A click anywhere else closes it, like the editor's own document click does for its menus. */
  @HostListener('document:click') onDocumentClick(): void { this.showExperimentalMenu = false; }

  /** One menu at a time: the other menubar buttons stop their click from reaching the document, so close this one
   *  when the editor opens one of its own. */
  ngDoCheck(): void {
    if (!this.showExperimentalMenu) return;
    const e = this.editor;
    if (e?.showFileMenu || e?.showEditMenu || e?.showAnimationMenu || e?.showViewMenu) this.showExperimentalMenu = false;
  }
}
