import { Component, DoCheck, ElementRef, HostListener, Input, OnDestroy, OnInit, Optional } from '@angular/core';
import { OverlayManagerService, insideElement } from '../../../shared/services/overlay/overlay-manager.service';
import type { IllustrationComponent } from '../illustration/illustration.component';
import { ProjectFileService } from '../../services/project-file.service';
import { ViewportHudService } from '../../services/viewport-hud.service';
import { IllustrationPersistenceService } from '../../services/illustration-persistence.service';
import { StorageSettingsService } from '../../services/storage-settings.service';
import { ExperimentalSettingsService } from '../../services/experimental-settings.service';
import { SCREEN_CORNER_MAX_PX, ScreenCornerService } from '../../services/screen-corner.service';
import { APP_BUILD_LABEL, APP_VERSION_LABEL } from '../../../app-version';
import { AppUpdateService } from '../../../shared/services/pwa/app-update.service';
import { UpdatePromptKind, updateButtonLabel, updatePromptFor, updatePromptText } from '../../../shared/services/pwa/app-update.logic';

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
export class EditorMenubarComponent implements DoCheck, OnInit, OnDestroy {
  @Input() editor!: EditorMenubarHost;
  /** Bottom of the File menu: "Frogmarks v0.01" + build time / Salsa dist (app-version.ts: bump APP_VERSION per deploy). */
  readonly appVersionLabel = APP_VERSION_LABEL;
  readonly appBuildLabel = APP_BUILD_LABEL;
  /** The Experimental dropdown is open. Kept here (not on the editor) so the editor needs no new member. */
  showExperimentalMenu = false;
  constructor(public files: ProjectFileService, public hud: ViewportHudService, public persist: IllustrationPersistenceService, public storage: StorageSettingsService,
              public exp: ExperimentalSettingsService, public corners: ScreenCornerService, public updates: AppUpdateService,
              @Optional() private overlays?: OverlayManagerService, @Optional() private hostEl?: ElementRef<HTMLElement>) {}

  /** The menus and the Experimental result dialog join the overlay manager: Esc / a tap outside closes them, and one
   *  overlay is open at a time (UI review 2026-10-07 §3 item 2). */
  private _unregister: Array<() => void> = [];
  ngOnInit(): void {
    const o = this.overlays;
    if (!o) return;
    this._unregister.push(o.register({
      id: 'menubar',
      isOpen: () => this.anyMenuOpen,
      close: () => { this.showExperimentalMenu = false; if (this.anyMenuOpen) this.editor?.closeAllMenus(); },
      contains: insideElement(() => this.hostEl?.nativeElement),
    }));
    this._unregister.push(o.register({ id: 'experimental-dialog', isOpen: () => !!this.exp.dialog, close: () => this.exp.closeDialog() }));
  }
  ngOnDestroy(): void { this._unregister.forEach(f => f()); this._unregister = []; }

  /** One of the menubar's dropdowns is open (the editor's four + Experimental). */
  get anyMenuOpen(): boolean {
    const e = this.editor;
    return this.showExperimentalMenu || !!(e?.showFileMenu || e?.showEditMenu || e?.showAnimationMenu || e?.showViewMenu);
  }

  /** The "Update ready" button (never a popup in the editor: app-update.logic.ts). */
  get updatePrompt(): UpdatePromptKind { return updatePromptFor('editor', this.updates?.state ?? 'none', false); }
  get updateLabel(): string { return updateButtonLabel(this.updates.state, this.updates.applying, this.updates.blockedByUnsaved); }
  get updateTitle(): string {
    if (this.updates.blockedByUnsaved) return 'Some changes could not be saved yet, so the update waits. Save (Ctrl+S), then tap again.';
    return `${updatePromptText(this.updates.state, this.updates.latestVersion, this.updates.currentVersion)}. Tap to save your work and reload.`;
  }
  /** Saves every open document, then activates the new version and reloads (or stays, if something is unsaved). */
  applyUpdate(): void {
    this.editor?.closeAllMenus();
    void this.updates.applyUpdate();
  }

  /** View › Screen corner radius: the slider's upper end (px). */
  readonly cornerMaxPx = SCREEN_CORNER_MAX_PX;
  /** Live slider drag: a fixed radius from now on (Auto is left by moving the slider). */
  onCornerSlider(e: Event): void { this.corners.setPx(Number((e.target as HTMLInputElement).value)); }

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
