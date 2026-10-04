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
  constructor(private autoSaveService: RasterAutoSaveService, private files: ProjectFileService, private illustrationService: IllustrationService, private localIllustrationService: LocalIllustrationService, private notifyService: NotifyService, private persist: IllustrationPersistenceService, private router: Router, private storage: StorageSettingsService) {}
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
  newIllustrationButtonClicked(): void {
    this.host.closeContextMenu();
    if (!this.persist.illustration) return;
    const newIllustration: Illustration = {
      id: 0,
      name: 'Untitled Illustration',
      description: '',
      teamId: this.persist.illustration.teamId
    } as Illustration;

    this.illustrationService.createIllustration(newIllustration).subscribe({
      next: (res: any) => {
        if (res.resultType === ResultType.Success) {
          this.persist.saveThumbnailIfChanged();   // the current document's thumbnail, before leaving it
          void this.router.navigate(['/illustrate', res.resultObject.uuid]);
        } else {
          this.notifyService.error('There was an error creating a new illustration :(');
        }
      },
      error: () => this.notifyService.error('There was an error creating a new illustration :(')
    });
  }

  duplicateIllustrationButtonClicked(): void {
    this.host.closeContextMenu();
    if (!this.persist.illustration) {
      this.notifyService.error('No illustration loaded to duplicate.');
      return;
    }

    const payload = {
      name: `Copy of ${this.persist.illustration.name}`,
      teamId: this.persist.illustration.teamId,
      copyThumbnail: false
    };

    this.illustrationService.duplicateIllustration(this.persist.illustration.id, payload).subscribe({
      next: (res: any) => {
        if (res.resultType === ResultType.Success) {
          const newUuid = res.resultObject.uuid;
          void this.router.navigate(['/illustrate', newUuid]);
        } else {
          this.notifyService.error('There was an error duplicating the illustration :(');
        }
      },
      error: (err) => {
        console.error(err);
        this.notifyService.error('There was an error duplicating the illustration :(');
      }
    });
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
