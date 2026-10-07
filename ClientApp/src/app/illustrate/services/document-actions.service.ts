import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { IllustrationPersistenceService } from './illustration-persistence.service';
import { IllustrationService } from 'app/shared/services/illustrate/illustration.service';
import { LocalIllustrationService } from 'app/shared/services/illustrate/local-illustration.service';
import { NotifyService } from 'app/shared/services/notify/notify.service';
import { ProjectFileService } from './project-file.service';
import { RasterAutoSaveService } from 'app/shared/services/raster/raster-autosave.service';
import { Router } from '@angular/router';
import { StorageSettingsService } from './storage-settings.service';
import { ResultType } from '../../shared/models/error-result.model';
import { Illustration } from 'app/illustrate/models/illustration.model';
import { firstValueFrom } from 'rxjs';
import { OpfsMetadataService } from 'app/shared/services/illustrate/opfs-metadata.service';
import { copySavedDocument } from 'app/shared/services/illustrate/salsa-document-copy';

/** Exactly the editor state the document actions use. */
export type DocumentActionsHost = Pick<IllustrationComponent, 'shapeManager' |
  'canvas' | 'closeContextMenu'
>;

/**
 * Document-level actions: title (rename keeps the model + engine doc in step), new / duplicate illustration, back to
 * the dashboard, set the current view as the thumbnail, PNG exports (view / transparent), the Export dialog flag and
 * the periodic export reminder. Component-scoped (provided by IllustrationComponent). Bodies moved verbatim from
 * illustration.component (refactor-plan 2.9H).
 */
@Injectable()
export class DocumentActionsService implements OnDestroy {
  private host!: DocumentActionsHost;
  constructor(private autoSaveService: RasterAutoSaveService, private files: ProjectFileService, private illustrationService: IllustrationService, private localIllustrationService: LocalIllustrationService, private notifyService: NotifyService, private persist: IllustrationPersistenceService, private router: Router, private storage: StorageSettingsService, private opfsMeta: OpfsMetadataService) {}
  bind(host: DocumentActionsHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    clearInterval(this._exportReminderTimer);
  }

  showExportModal = false;
  showExportReminder = false;

  downloadCanvasViewAsPng() {
    const canvas = this.host.canvas;
    if (!canvas) return console.error('Canvas element not found!');
    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = image;
    link.download = 'frogmarks_snapshot.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /** The modal resets its own fields when it opens (it is created by *ngIf). */
  openExportModal(): void {
    this.showExportModal = true;
  }

  closeExportModal(): void {
    this.showExportModal = false;
  }

  async exportTransparentPng(): Promise<void> {
    const sm = this.shapeManager;
    const blob: Blob | null = await sm.exportIllustrationTransparentPNG();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'frogmarks_transparent.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async returnToDashboard(): Promise<void> {
    // Save and refresh the shell project index before going home.
    // Falls back to the HTML dashboard if the shell isn't available.
    try {
      await this.persist.saveThumbnail();
      if (this.persist.illustrationUid) await this.shapeManager.shell?.recordProjectSave(this.persist.illustrationUid);
    } catch { /* non-fatal */ }
    void this.router.navigate(['/']);
  }

  illustrationTitle = '';

  updateIllustrationTitle() {
    // Keep the loaded model + the engine document name in step (exports such as .frogmarks read illustration.name,
    // and the OPFS document kept the old name).
    if (this.persist.illustration) this.persist.illustration.name = this.illustrationTitle;
    this.autoSaveService.setDocumentName(this.illustrationTitle);
    if (this.persist.syncMode === 2) {
      if (this.persist.illustration?.uuid) {
        this.localIllustrationService.rename(this.persist.illustration.uuid, this.illustrationTitle)
          .catch(e => console.warn('[rename] local rename failed (the next save writes the name again)', e));
      }
    } else {
      this.illustrationService.renameIllustration(this.persist.illustration!.id, this.illustrationTitle).subscribe({
        error: () => this.notifyService.error('Rename failed — the new title was not saved to the cloud.'),
      });
    }
  }

  // ---- context menu actions (renamed) ----

  /** A New / Duplicate is already running (a double click must not create two). */
  private _docActionRunning = false;

  /** The open document's id in Salsa's document store (and the OPFS metadata key). */
  private _salsaKey(syncMode: number, ill: Illustration): string {
    return syncMode === 2 ? 'local-' + (ill.uuid ?? '') : String(ill.id ?? '');
  }

  /** Leaving the open document for another: save its pending change (bounded: a slow network must not trap the user;
   *  the route guard saves again on the way out) and refresh its thumbnail while it is still on screen. */
  private async _saveBeforeLeaving(): Promise<void> {
    await Promise.race([this.persist.flushPendingSave(), new Promise(r => setTimeout(r, 10_000))]);
    if (!this.persist.illustration?.isCustomThumbnail) {
      try { await this.persist.saveThumbnailIfChangedNow(); } catch { /* non-fatal */ }
    }
  }

  /**
   * File > New Illustration: save the open document, create a new, EMPTY illustration in the same storage mode
   * (local-only: this browser; cloud / no-cloud: a new server record) and open it. Nothing of the open document is
   * carried over: the editor is recreated for the new route (DocumentRouteReuseStrategy) and starts from a blank
   * engine document (IllustrationPersistenceService.startBlankDocument).
   */
  async newIllustrationButtonClicked(): Promise<void> {
    this.host.closeContextMenu();
    const current = this.persist.illustration;
    if (!current || this._docActionRunning) return;
    this._docActionRunning = true;
    try {
      await this._saveBeforeLeaving();
      const name = 'Untitled Illustration';
      if (this.persist.syncMode === 2) {
        const local = await this.localIllustrationService.create(name);
        await this.router.navigate(['/illustration/local', local.uuid], { state: { illustration: local, isNew: true } });
        return;
      }
      const res: any = await firstValueFrom(this.illustrationService.createIllustration({
        id: 0, name, description: '', teamId: current.teamId, syncMode: this.persist.syncMode,
      } as Illustration));
      if (res?.resultType !== ResultType.Success || !res.resultObject?.uuid) throw new Error('create failed');
      await this.router.navigate(['/illustration', res.resultObject.uuid], { state: { illustration: res.resultObject, isNew: true } });
    } catch (e) {
      console.error('[New Illustration]', e);
      this.notifyService.error('There was an error creating a new illustration :(');
    } finally {
      this._docActionRunning = false;
    }
  }

  /**
   * File > Duplicate Illustration: save the open document, then copy it AS SAVED into a new illustration and open the
   * copy. The copy is made from this device's saved document (Salsa's OPFS document + the editor's OPFS metadata), so
   * it is complete: layers and cels, vector shapes, the 3D scene, characters, city, cameras, textures, settings. For a
   * cloud illustration the copy's first save uploads all of it. The original is not touched: its files are only read,
   * and the editor reopens on the copy's own document id, so later edits (and autosaves) go to the copy alone.
   */
  async duplicateIllustrationButtonClicked(): Promise<void> {
    this.host.closeContextMenu();
    const src = this.persist.illustration;
    if (!src) {
      this.notifyService.error('No illustration loaded to duplicate.');
      return;
    }
    if (this._docActionRunning) return;
    this._docActionRunning = true;
    try {
      await this._saveBeforeLeaving();   // the copy is the document as it is now, not its last autosave
      const mode = this.persist.syncMode;
      const name = `Copy of ${this.illustrationTitle || src.name || 'Untitled'}`;
      const srcKey = this._salsaKey(mode, src);

      if (mode === 2) {
        const srcRecord = src.uuid ? await this.localIllustrationService.getByUuid(src.uuid) : null;
        const created = await this.localIllustrationService.create(name, srcRecord?.documentAspect ?? src.documentAspect, srcRecord?.kind);
        if (!await this._copySavedDocument(srcKey, 'local-' + created.uuid, name)) {
          await this.localIllustrationService.delete(created.uuid).catch(() => {});
          throw new Error('the saved document could not be copied');
        }
        const copy = srcRecord?.thumbnailDataUrl
          ? await this.localIllustrationService.update({ uuid: created.uuid, thumbnailDataUrl: srcRecord.thumbnailDataUrl })
          : created;
        await this.router.navigate(['/illustration/local', copy.uuid], { state: { illustration: copy, duplicateOf: src.uuid } });
        return;
      }

      const res: any = await firstValueFrom(this.illustrationService.createIllustration({
        id: 0, name, description: src.description ?? '', teamId: src.teamId, syncMode: mode, documentAspect: src.documentAspect,
      } as Illustration));
      if (res?.resultType !== ResultType.Success || !res.resultObject?.uuid) throw new Error('create failed');
      const ill: Illustration = res.resultObject;
      if (!await this._copySavedDocument(srcKey, String(ill.id ?? ''), name)) {
        // No saved copy on this device to copy from (browser storage unavailable): fall back to the server's own
        // duplicate (everything the server stores: layers, settings, the 3D scene — not the vector-shape scene graph).
        if (ill.id) this.illustrationService.deleteIllustration(ill.id).subscribe({ error: () => {} });
        await this._serverDuplicate(src, name);
        return;
      }
      await this.router.navigate(['/illustration', ill.uuid], { state: { illustration: ill, duplicateOf: src.uuid } });
    } catch (e) {
      console.error('[Duplicate Illustration]', e);
      this.notifyService.error('There was an error duplicating the illustration :(');
    } finally {
      this._docActionRunning = false;
    }
  }

  /** Copy the saved document `srcKey` to `dstKey`: Salsa's document (every layer, the 3D scene, textures ...) and the
   *  editor's OPFS metadata (settings, dither, 3D host state). The copy's metadata drops the original's server
   *  revision (the copy is a different server record) and is marked not yet synced. */
  private _copySavedDocument(srcKey: string, dstKey: string, name: string): Promise<boolean> {
    return copySavedDocument(this.opfsMeta, srcKey, dstKey, name);
  }

  /** The server-side duplicate (the cloud copy: layers + pixels, settings, the 3D scene), used when this device has no
   *  saved copy to copy. The server doesn't store the vector-shape scene graph, so that part can't come along. */
  private async _serverDuplicate(src: Illustration, name: string): Promise<void> {
    const res: any = await firstValueFrom(this.illustrationService.duplicateIllustration(src.id!, { name, teamId: src.teamId, copyThumbnail: true }));
    if (res?.resultType !== ResultType.Success || !res.resultObject?.uuid) throw new Error('server duplicate failed');
    this.notifyService.error('Duplicated from the cloud copy: this browser has no saved copy of the original, so its vector shapes were not copied.');
    await this.router.navigate(['/illustration', res.resultObject.uuid], { state: { illustration: res.resultObject } });
  }

  async setCurrentViewAsThumbnail() {
    if (!this.persist.illustrationUid || !this.persist.illustration || !this.shapeManager) return;
    try {
      const blob = await this.shapeManager.captureThumbnailBlob(300);
      if (this.persist.syncMode === 2) {
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            this.localIllustrationService.updateThumbnail(this.persist.illustration!.uuid!, reader.result as string)
              .then(() => resolve()).catch(reject);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } else {
        await firstValueFrom(this.illustrationService.uploadThumbnail(this.persist.illustrationUid, blob, true));
      }
      this.persist.lastSavedThumbnailJSON = this.shapeManager.getSceneGraphJSON();
      this.notifyService.success('Thumbnail updated to the current view.');
    } catch (e) {
      console.error(e);
      this.notifyService.error('Could not set the thumbnail. Try again.');
    } finally {
      this.host.closeContextMenu();
    }
  }

  private _exportReminderTimer: ReturnType<typeof setTimeout> | null = null;

  readonly _exportReminderIntervalMs = 20 * 60 * 1000; // 20 min

  startExportReminder(): void {
    if (this.persist.syncMode === 0) return;
    this.clearExportReminder();
    void this.storage._refreshOpfsSize();
    this._exportReminderTimer = setTimeout(() => {
      this.showExportReminder = true;
    }, this._exportReminderIntervalMs);
  }

  clearExportReminder(): void {
    if (this._exportReminderTimer !== null) {
      clearTimeout(this._exportReminderTimer);
      this._exportReminderTimer = null;
    }
  }

  dismissExportReminder(): void {
    this.showExportReminder = false;
    this.startExportReminder();
  }

  exportNowFromReminder(): void {
    this.showExportReminder = false;
    this.clearExportReminder();
    void this.files.frogmarksSave().then(() => this.startExportReminder());
  }
}
