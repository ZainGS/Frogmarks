import { Component, Input } from '@angular/core';
import type { IllustrationComponent } from '../illustration/illustration.component';
import { ProjectFileService } from '../../services/project-file.service';
import { ViewportHudService } from '../../services/viewport-hud.service';
import { IllustrationPersistenceService } from '../../services/illustration-persistence.service';
import { StorageSettingsService } from '../../services/storage-settings.service';
import { APP_BUILD_LABEL, APP_VERSION_LABEL } from '../../../app-version';

/** Exactly the editor members the menubar uses (compile-time checked against the editor). */
export type EditorMenubarHost = Pick<IllustrationComponent, 'doc' | 'imports' | 'artboard' |
  'animationEnabled' | 'closeAllMenus' | 'editRedo' | 'editUndo' | 'menuAddCel' | 'menuAddFrames' |
  'menuDeleteFrame' | 'menuInsertFrame' | 'openFrogmarksPicker' | 'rasterFlipHorizontal' | 'rasterFlipVertical' | 'rasterRedo' |
  'rasterRotate' | 'rasterSelectionService' | 'rasterUndo' | 'retroThemeActive' | 'saveNow' | 'showAnimationMenu' | 'showEditMenu' | 'showFileMenu' | 'showShortcutCheatsheet' |
  'showViewMenu' | 'toggleAnimationMenu' | 'toggleAnimationMode' | 'toggleEditMenu' | 'toggleFileMenu' |
  'toggleFullscreen' | 'toggleLayerTree' | 'toggleRetroTheme' | 'toggleUI' | 'toggleViewMenu'
>;

/** Top menubar: File / Edit / View / Animation / Help menus (the dropdowns). The open flags, closeAllMenus and every action stay the editor's (its document click closes the menus); this view reaches them through `editor` (refactor-plan 2.9F). */
@Component({
  selector: 'app-editor-menubar',
  templateUrl: './editor-menubar.component.html',
  styleUrls: ['./editor-menubar.component.scss'],
})
export class EditorMenubarComponent {
  @Input() editor!: EditorMenubarHost;
  /** Bottom of the File menu: "Frogmarks v0.01" + build time / Salsa dist (app-version.ts: bump APP_VERSION per deploy). */
  readonly appVersionLabel = APP_VERSION_LABEL;
  readonly appBuildLabel = APP_BUILD_LABEL;
  constructor(public files: ProjectFileService, public hud: ViewportHudService, public persist: IllustrationPersistenceService, public storage: StorageSettingsService) {}
}
