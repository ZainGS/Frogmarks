import { Component } from '@angular/core';
import { StorageSettingsService } from '../../services/storage-settings.service';
import { IllustrationPersistenceService } from '../../services/illustration-persistence.service';

/** Storage-mode dialog (cloud / browser-only / local-only) and layer pixel codec. A view over StorageSettingsService (refactor-plan B4). */
@Component({
  selector: 'app-sync-mode-dialog',
  templateUrl: './sync-mode-dialog.component.html',
  styleUrls: ['./sync-mode-dialog.component.scss'],
})
export class SyncModeDialogComponent {
  constructor(public storage: StorageSettingsService, public persist: IllustrationPersistenceService) {}
}
