import { Component, Input } from '@angular/core';
import type { IllustrationComponent } from '../illustration/illustration.component';
import { ProjectFileService } from '../../services/project-file.service';
import { ViewportHudService } from '../../services/viewport-hud.service';
import { IllustrationPersistenceService } from '../../services/illustration-persistence.service';
import { StorageSettingsService } from '../../services/storage-settings.service';

/** Exactly the editor members the menubar uses (compile-time checked against the editor). */
export type EditorMenubarHost = Pick<IllustrationComponent, 'doc' | 'imports' | 'artboard' |
  'animationEnabled' | 'closeAllMenus' | 'menuAddCel' | 'menuAddFrames' |
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
  constructor(public files: ProjectFileService, public hud: ViewportHudService, public persist: IllustrationPersistenceService, public storage: StorageSettingsService) {}
}
