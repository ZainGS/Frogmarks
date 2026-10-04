import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { IllustrationPersistenceService } from './illustration-persistence.service';
import { IllustrationService } from 'app/shared/services/illustrate/illustration.service';
import { OpfsMetadataService } from 'app/shared/services/illustrate/opfs-metadata.service';
import { firstValueFrom } from 'rxjs';

/** Exactly the editor state the storage settings use. */
export type StorageSettingsHost = Pick<IllustrationComponent, 'shapeManager' |
  'saveNow'
>;

/**
 * Storage settings: the sync-mode dialog (cloud / browser-only / local-only, with its confirm step), the OPFS size label,
 * and the layer pixel codec (PNG / WebP). Component-scoped (provided by IllustrationComponent). Bodies moved verbatim
 * from illustration.component (refactor-plan B4).
 */
@Injectable()
export class StorageSettingsService implements OnDestroy {
  private host!: StorageSettingsHost;
  constructor(private illustrationService: IllustrationService, private opfsMetadataService: OpfsMetadataService, private persist: IllustrationPersistenceService) {}
  bind(host: StorageSettingsHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
  }

  // Pixel codec / layer compression
  pixelFormat: string = 'png';

  webpSupported = false;

  readonly storageFormatOptions = [
    { id: 'raw',  label: 'Raw',  desc: 'Fastest saves, largest files' },
    { id: 'png',  label: 'PNG',  desc: 'Recommended — lossless, ~10–50× smaller' },
    { id: 'webp', label: 'WebP', desc: 'Smaller than PNG — browser-dependent' },
  ];

  async _initPixelFormat(): Promise<void> {
    const sm = this.shapeManager;
    if (!sm?.getPixelFormat) return;
    this.pixelFormat = sm.getPixelFormat() ?? 'png';
    this.webpSupported = await sm.isPixelFormatSupported('webp') ?? false;
  }

  onPixelFormatChange(fmt: string): void {
    this.pixelFormat = fmt;
    this.shapeManager.setPixelFormat(fmt as any);
  }

  showSyncModePanel = false;

  syncModePanelSelection = 0;

  syncModePanelStep: 'select' | 'confirm' = 'select';

  opfsSizeLabel = '';

  async _refreshOpfsSize(): Promise<void> {
    const salsaKey = this.persist.syncMode === 2
      ? 'local-' + (this.persist.illustrationUid ?? '')
      : (this.persist.illustration?.id?.toString() ?? '');
    if (!salsaKey) return;
    const bytes = await this.opfsMetadataService.getSceneSizeBytes(salsaKey);
    if (bytes <= 0) { this.opfsSizeLabel = ''; return; }
    if (bytes >= 1024 * 1024) {
      this.opfsSizeLabel = (bytes / 1024 / 1024).toFixed(1) + ' MB';
    } else if (bytes >= 1024) {
      this.opfsSizeLabel = Math.round(bytes / 1024) + ' KB';
    } else {
      this.opfsSizeLabel = bytes + ' B';
    }
  }

  openSyncModeDialog(): void {
    this.syncModePanelSelection = this.persist.syncMode;
    this.syncModePanelStep = 'select';
    this.showSyncModePanel = true;
  }

  closeSyncModeDialog(): void {
    this.showSyncModePanel = false;
    this.syncModePanelStep = 'select';
  }

  requestSyncModeChange(): void {
    const newMode = this.syncModePanelSelection;
    if (newMode === this.persist.syncMode) { this.closeSyncModeDialog(); return; }
    if (newMode > this.persist.syncMode) {
      this.syncModePanelStep = 'confirm';
    } else {
      void this._applySyncModeChange();
    }
  }

  async _applySyncModeChange(): Promise<void> {
    const newMode = this.syncModePanelSelection;
    const oldMode = this.persist.syncMode;
    this.persist.syncMode = newMode;
    // Going to cloud: everything must go up once, not just what changed since load
    if (newMode === 0 && oldMode !== 0) this.persist.forceFullUpload();
    this.closeSyncModeDialog();

    if (this.persist.illustration?.id && newMode < 2) {
      firstValueFrom(
        this.illustrationService.updateIllustration({ ...this.persist.illustration, syncMode: newMode })
      ).catch(e => console.warn('[SyncMode] update failed', e));
    }

    void this.host.saveNow();
  }
}
