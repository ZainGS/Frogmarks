import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { Scene3dSettingsService } from './scene3d-settings.service';
import { SceneAnimationService } from './scene-animation.service';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { FrogFileService } from 'app/shared/services/illustrate/frog-file.service';
import { IllustrationPersistenceService } from './illustration-persistence.service';
import { IllustrationService } from 'app/shared/services/illustrate/illustration.service';
import { LayerEffectsService } from './layer-effects.service';
import { NotifyService } from 'app/shared/services/notify/notify.service';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';
import { FrogImportResult } from 'app/shared/services/illustrate/frog-file.service';
import { Illustration } from 'app/illustrate/models/illustration.model';
import { firstValueFrom } from 'rxjs';
import { OnionSkinConfig, LoopMode } from 'app/shared/services/raster/raster-animation.service';
import { DitherConfig } from 'app/boards/models/brush-preset.model';

import { ArtboardService } from './artboard.service';
/** Exactly the editor state the project-file actions read and write. Typed against the editor so a rename breaks here at compile time. */
export type ProjectFileHost = Pick<IllustrationComponent, 'shapeManager' | 'doc' | '_disableAllViewerTools' | 'setAnimationEnabled' |
  'canvas' | 'closeContextMenu' |
  'markLoaded' | 'refreshRasterLayers' | 'scene3dRefreshMeshes'
>;

/**
 * Project files and sharing: .frogmarks save / restore (with the compare modal), .frogcart export, .frog export /
 * import (applyFrogImport), publish / unpublish + the share dialog, and viewer-mode boot. Component-scoped (provided
 * by IllustrationComponent). Bodies moved verbatim from illustration.component (refactor-plan 2.8 step B).
 */
@Injectable()
export class ProjectFileService implements OnDestroy {
  private host!: ProjectFileHost;
  constructor(private artboard: ArtboardService, private animationService: RasterAnimationService, private frogFileService: FrogFileService, private fx: LayerEffectsService, private illustrationService: IllustrationService, private notifyService: NotifyService, private persist: IllustrationPersistenceService, private s3: Scene3dSettingsService, private anim: SceneAnimationService) {}
  bind(host: ProjectFileHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
  }

  viewerTitle = '';

  isPublishing = false;

  showPublishShareDialog = false;

  publishShareViewUrl = '';

  publishShareEmbedCode = '';

  exportCartTitle = '';

  exportCartAuthor = '';

  exportCartDescription = '';

  exportCartBusy = false;

  exportCartSounds: string[] = [];

  async exportModalFrogcart(): Promise<void> {
    if (this.exportCartBusy) return;
    this.exportCartBusy = true;
    try {
      const sm = this.shapeManager;
      const blob: Blob | undefined = await sm.exportFrogcart({
        title:       this.exportCartTitle || 'Untitled',
        author:      this.exportCartAuthor || undefined,
        description: this.exportCartDescription || undefined,
      });
      if (!blob) { this.exportCartBusy = false; return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(this.exportCartTitle || 'scene').replace(/[^a-z0-9_\-]/gi, '_')}.frogcart`;
      a.click();
      URL.revokeObjectURL(url);
      this.host.doc.closeExportModal();
    } catch (e) {
      console.error('[Export] frogcart failed', e);
    }
    this.exportCartBusy = false;
  }

  async exportFrogFile(): Promise<void> {
    try {
      await this.frogFileService.exportFrogFile(
        this.host.doc.illustrationTitle ?? this.persist.illustration?.name ?? 'Untitled',
        this.host.canvas
      );
      this.notifyService.success('Illustration exported!');
    } catch (e) {
      console.error('[FrogFile] export failed', e);
      this.notifyService.error('Export failed. See console for details.');
    }
  }

  async importFrogFile(): Promise<void> {
    try {
      const result = await this.frogFileService.importFrogFile();
      if (!result) return;
      await this.applyFrogImport(result);
      this.notifyService.success(`"${result.manifest.name}" imported!`);
    } catch (e: any) {
      if (e?.message === 'No file selected') return; // user cancelled
      console.error('[FrogFile] import failed', e);
      this.notifyService.error('Import failed. See console for details.');
    }
  }

  /** Apply a parsed .frog import result to the engine. Used by both manual import and dashboard pending import. */
  async applyFrogImport(result: FrogImportResult): Promise<void> {
    const { manifest, sceneGraph, layerPixelData } = result;

    // 1. Apply scene graph
    if (sceneGraph) {
      await this.shapeManager.setSceneGraphJSON(sceneGraph);
    }

    // 2. Import pixel data
    if (layerPixelData.length > 0 && this.shapeManager?.importRasterLayersFromDataURLs) {
      const importPayload = layerPixelData.map(lp => ({
        id: lp.layerId,
        celId: lp.celId,
        name: lp.name,
        imageData: lp.imageDataUrl,
        blendMode: lp.blendMode,
        opacity: lp.opacity,
        visible: lp.visible,
        locked: lp.locked,
        clipped: lp.clipped,
        lockTransparency: lp.lockTransparency,
      }));
      try {
        // Clear the auto-created "Background" layer before importing saved layers
        this.shapeManager?.rasterLayerManager?.clearAllLayers();
        await this.shapeManager.importRasterLayersFromDataURLs(importPayload);
      } catch (e) {
        console.warn('[FrogFile] importRasterLayersFromDataURLs failed', e);
      }
    }

    // 3. Apply layer properties
    const sm = this.shapeManager;
    for (const layer of manifest.layers) {
      if (sm?.setRasterLayerBlendMode) sm.setRasterLayerBlendMode(layer.layerId, layer.blendMode as any);
      if (sm?.setRasterLayerOpacity) sm.setRasterLayerOpacity(layer.layerId, layer.opacity);
      if (sm?.setRasterLayerVisibility) sm.setRasterLayerVisibility(layer.layerId, layer.visible);
      if (sm?.setRasterLayerLockTransparency) sm.setRasterLayerLockTransparency(layer.layerId, layer.lockTransparency);
      if (sm?.setRasterLayerClipping) sm.setRasterLayerClipping(layer.layerId, layer.clipped);
      if (layer.ditherConfig && sm?.setLayerDitherConfig) {
        sm.setLayerDitherConfig(layer.layerId, layer.ditherConfig as any);
        this.fx.layerDitherConfigs.set(layer.layerId, { ...layer.ditherConfig } as DitherConfig);
      }
      if (layer.frameLinkAnimation && sm?.setLayerFrameLinkAnimation) {
        sm.setLayerFrameLinkAnimation(layer.layerId, layer.frameLinkAnimation as any);
      }
    }

    // 4. Restore animation state
    if (manifest.animation?.enabled) {
      const anim = manifest.animation;
      this.host.setAnimationEnabled(true);
      this.animationService.setFrameCount(anim.frameCount);
      this.animationService.setFps(anim.fps);
      this.animationService.setLoopMode(anim.loopMode as LoopMode);
      this.animationService.setPlayRange(anim.playRangeStart, anim.playRangeEnd);
      if (anim.onionSkin) {
        this.animationService.setOnionSkin(anim.onionSkin as OnionSkinConfig);
      }
      for (const layer of manifest.layers) {
        if (layer.animated) {
          this.animationService.setLayerAnimated(layer.layerId, true);
          for (const cel of layer.cels) {
            this.animationService.addCelAtFrame(layer.layerId, cel.frame);
          }
        }
      }
      this.animationService.refreshTimeline();
    }

    // 5. Restore document size
    this.artboard.applyDocumentSize(manifest.documentSize ?? null);

    // 6. Update UI
    this.host.doc.illustrationTitle = manifest.name;
    this.host.refreshRasterLayers();

    // 6. Restore dither config from frog import (if present)
    if (result.ditherConfig) {
      this.fx._applyDitherConfig(result.ditherConfig);
    }

    // After a full restore, treat all layers as needing re-upload
    this.persist._invalidateUploadedLayers();
  }

  async _initViewerMode(uid: string): Promise<void> {
    try {
      const viewDto = await firstValueFrom(this.illustrationService.getPublicView(uid));
      this.viewerTitle = viewDto.name;

      const response = await fetch(viewDto.bundleUrl);
      if (!response.ok) throw new Error(`Bundle fetch failed: ${response.status}`);
      const bundle = await response.blob();

      await this.shapeManager.unpackProject(bundle);
      this.host._disableAllViewerTools();
      // Safety fallback: if unpackProject doesn't fire onSceneGraphChanged, unblock the loader
      requestAnimationFrame(() => this.host.markLoaded('sceneApplied'));
    } catch (e) {
      console.error('[Viewer] failed to load bundle', e);
      this.notifyService.error('Could not load this illustration.');
      requestAnimationFrame(() => this.host.markLoaded('sceneApplied'));
    }
    this.host.markLoaded('illustration');
  }

  async publishIllustration(): Promise<void> {
    if (!this.persist.illustration?.id || this.isPublishing) return;
    this.isPublishing = true;
    this.host.closeContextMenu();
    try {
      const sm = this.shapeManager;
      if (!sm?.packProject) throw new Error('packProject not available');
      const bundle: Blob = await sm.packProject();
      await new Promise<void>((resolve, reject) => {
        this.illustrationService.publishIllustration(
          this.persist.illustration!.id!,
          bundle,
          this.host.doc.illustrationTitle || this.persist.illustration!.name
        ).subscribe({
          next: (res: any) => {
            const updated = res?.resultObject ?? res;
            if (updated?.isPublic !== undefined) {
              this.persist.illustration!.isPublic = updated.isPublic;
              this.persist.illustration!.publishedVersion = updated.publishedVersion;
              this.persist.illustration!.publishedAt = updated.publishedAt;
            }
            const uid = this.persist.illustration!.uuid ?? updated?.uuid ?? '';
            const origin = window.location.origin;
            this.publishShareViewUrl = `${origin}/view/${uid}`;
            this.publishShareEmbedCode =
              `<script src="${origin}/salsa-viewer.js"><\/script>\n` +
              `<salsa-viewer src="${this.publishShareViewUrl}"></salsa-viewer>`;
            this.showPublishShareDialog = true;
            resolve();
          },
          error: (err: any) => reject(err),
        });
      });
    } catch (e: any) {
      this.notifyService.error(e?.message?.includes('packProject') ? 'Could not pack illustration for publishing.' : 'Publish failed. Please try again.');
    } finally {
      this.isPublishing = false;
    }
  }

  unpublishIllustration(): void {
    if (!this.persist.illustration?.id) return;
    this.illustrationService.unpublishIllustration(this.persist.illustration.id).subscribe({
      next: () => {
        this.persist.illustration!.isPublic = false;
        this.notifyService.success('Illustration is now private.');
      },
      error: () => this.notifyService.error('Unpublish failed.')
    });
    this.host.closeContextMenu();
  }

  closePublishShareDialog(): void {
    this.showPublishShareDialog = false;
  }

  copyPublishUrl(): void {
    void navigator.clipboard.writeText(this.publishShareViewUrl).then(() => {
      this.notifyService.success('Link copied!');
    });
  }

  copyEmbedCode(): void {
    void navigator.clipboard.writeText(this.publishShareEmbedCode).then(() => {
      this.notifyService.success('Embed code copied!');
    });
  }

  frogmarksSaving = false;

  frogmarksRestoreModal: {
    currentThumbnailUrl: string;
    currentDate: string;
    fileThumbnailUrl: string;
    fileDate: string;
  } | null = null;

  _pendingRestoreFile: File | null = null;

  _pendingRestoreFileUuid: string | null = null;

  async frogmarksSave(): Promise<void> {
    if (this.frogmarksSaving) return;
    this.frogmarksSaving = true;
    try {
      const sm = this.shapeManager;

      const { default: JSZip } = await import('jszip');
      const salsaBlob: Blob = await sm.packProject();
      const zip = await JSZip.loadAsync(salsaBlob);

      zip.file('frogmarks-state.json', JSON.stringify({
        formatVersion: 1,
        packedAt: new Date().toISOString(),
        name: this.persist.illustration?.name ?? 'Untitled',
        uuid: this.persist.illustrationUid,
        illustrationId: this.persist.illustration?.id ?? null,
        teamId: this.persist.illustration?.teamId ?? null,
        deviceName: localStorage.getItem('frogmarks-device-name') ?? null,
      }, null, 2));

      try {
        const thumbBlob = await this.shapeManager.captureThumbnailBlob(300);
        if (thumbBlob) zip.file('thumbnail.png', thumbBlob);
      } catch { /* non-fatal */ }

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const safeName = (this.persist.illustration?.name ?? 'untitled').replace(/[^a-z0-9_\-]/gi, '_');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.frogmarks`;
      a.click();
      URL.revokeObjectURL(url);
      this.host.doc.startExportReminder();
    } catch (e) {
      console.error('[frogmarksSave]', e);
      this.notifyService.error('Could not save project. Please try again.');
    } finally {
      this.frogmarksSaving = false;
    }
  }

  async frogmarksLoad(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (!file) return;
    try {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      const frogmarksRaw = await zip.file('frogmarks-state.json')?.async('string');
      const meta = frogmarksRaw ? JSON.parse(frogmarksRaw) : null;

      if (meta?.formatVersion > 1)
        throw new Error('This .frogmarks file requires a newer version of Frogmarks.');

      const fileUuid: string | null = meta?.uuid ?? null;
      const fileName: string = meta?.name ?? file.name;

      if (fileUuid && this.persist.illustrationUid && fileUuid !== this.persist.illustrationUid) {
        // Different illustration — simple confirm
        const ok = window.confirm(
          `"${fileName}" is from a different illustration.\n\nThis will replace the current content of "${this.persist.illustration?.name ?? 'this illustration'}". Continue?`
        );
        if (!ok) return;
        await this._doFrogmarksRestore(file, fileUuid);
      } else {
        // Same illustration (or no UUID in file) — show thumbnail comparison modal
        const thumbEntry = zip.file('thumbnail.png');
        const fileThumbBlob = thumbEntry ? await thumbEntry.async('blob') : null;
        const fileThumbnailUrl = fileThumbBlob ? URL.createObjectURL(fileThumbBlob) : '';
        const fileDate = meta?.packedAt
          ? new Date(meta.packedAt).toLocaleString()
          : 'Unknown date';

        const currentThumbBlob = await this.shapeManager.captureThumbnailBlob(300).catch(() => null);
        const currentThumbnailUrl = currentThumbBlob ? URL.createObjectURL(currentThumbBlob) : '';
        const currentDate = new Date().toLocaleString();

        this._pendingRestoreFile = file;
        this._pendingRestoreFileUuid = fileUuid;
        this.frogmarksRestoreModal = { currentThumbnailUrl, currentDate, fileThumbnailUrl, fileDate };
      }
    } catch (e) {
      console.error('[frogmarksLoad]', e);
      this.notifyService.error('Could not load project. The file may be corrupted or from a newer version of Frogmarks.');
    }
  }

  async confirmFrogmarksRestore(): Promise<void> {
    const file = this._pendingRestoreFile;
    const uuid = this._pendingRestoreFileUuid;
    this._closeFrogmarksRestoreModal();
    if (file) await this._doFrogmarksRestore(file, uuid);
  }

  cancelFrogmarksRestore(): void {
    this._closeFrogmarksRestoreModal();
  }

  _closeFrogmarksRestoreModal(): void {
    if (this.frogmarksRestoreModal) {
      URL.revokeObjectURL(this.frogmarksRestoreModal.currentThumbnailUrl);
      URL.revokeObjectURL(this.frogmarksRestoreModal.fileThumbnailUrl);
    }
    this.frogmarksRestoreModal = null;
    this._pendingRestoreFile = null;
    this._pendingRestoreFileUuid = null;
  }

  async _doFrogmarksRestore(file: File, fileUuid: string | null): Promise<void> {
    try {
      const sm = this.shapeManager;
      this.animationService.beginBulkRestore();
      await sm.unpackProject(file).finally(() => this.animationService.endBulkRestore());
      if (fileUuid && this.persist.illustrationUid && fileUuid !== this.persist.illustrationUid) {
        sm.setCurrentDocId(this.persist.illustrationUid, this.persist.illustration?.name);
        // (saveNow was a phantom — saveDocument is the real flush)
        await sm.persist?.saveDocument();
      }
      this.persist.noCloudEmptyState = false;
      this.animationService.refreshTimeline();
      this.host.scene3dRefreshMeshes();
      // Bring the editor in line with what was unpacked (raster layers, per-layer dither and the 3D panel mirrors
      // used to keep showing the previous content)
      this.host.refreshRasterLayers();
      this.fx._syncLayerDitherConfigsFromEngine();
      this.s3._syncScene3dPS1FromEngine();
      this.s3._syncEnvironmentStyleFromEngine();
      this.anim.syncPlayerFromEngine();
      // Everything restored must reach the cloud copy too (not just layers dirty since load), then save
      if (this.persist.syncMode === 0) this.persist.forceFullUpload(); else this.persist._invalidateUploadedLayers();
      this.persist.sceneChanged$.next('__restore_' + Date.now());
      this.persist._checkSaveBlocked();
      if (!this.persist.saveBlockedReason) this.notifyService.success('Project loaded successfully.');
    } catch (e) {
      console.error('[frogmarksLoad]', e);
      this.persist._checkSaveBlocked();
      this.notifyService.error('Could not load project. The file may be corrupted or from a newer version of Frogmarks.');
    }
  }
}
