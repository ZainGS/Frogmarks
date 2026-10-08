import { Component, EventEmitter, Input, OnDestroy, OnInit, Optional, Output } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { ProjectFileService } from '../../services/project-file.service';
import { IllustrationPersistenceService } from '../../services/illustration-persistence.service';
import { OverlayManagerService } from '../../../shared/services/overlay/overlay-manager.service';

export type ExportImageBackground = 'canvas' | 'transparent';
export type ExportImageFormat = 'png' | 'jpeg';

/** Output size of an image export: the document's own pixel size (Salsa caps at maxSize; we pass the document's long
 *  side so nothing is scaled down). Null = infinite canvas (the view is captured as it is). */
export function exportImageSize(doc: { w: number; h: number } | null | undefined): { w: number; h: number; maxSize: number } | null {
  if (!doc?.w || !doc?.h) return null;
  return { w: Math.round(doc.w), h: Math.round(doc.h), maxSize: Math.max(1, Math.round(Math.max(doc.w, doc.h))) };
}

/** A file name from the document title (no path characters), with the format's extension. */
export function exportImageFileName(title: string | null | undefined, format: ExportImageFormat, transparent: boolean): string {
  const base = (title ?? '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'frogmarks';
  return `${base}${transparent ? ' (transparent)' : ''}.${format === 'jpeg' ? 'jpg' : 'png'}`;
}

/** Export dialog (image / .frogcart scene / .frogmarks workfile). Created by *ngIf, so each open starts fresh.
 *  Extracted from illustration.component (refactor-plan 2.9F). Esc closes it (OverlayManagerService). The image tab
 *  captures the artboard through the engine: on the canvas background (PNG / JPEG, 3D included) or transparent
 *  (PNG, 2D + ephemera); `exportImageRequested` (the editor's view snapshot) is the fallback when that fails. */
@Component({
  selector: 'app-export-modal',
  templateUrl: './export-modal.component.html',
  styleUrls: ['./export-modal.component.scss'],
})
export class ExportModalComponent implements OnInit, OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  @Input() docTitle: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() exportImageRequested = new EventEmitter<void>();

  tab: 'image' | 'scene' | 'workfile' = 'image';

  /** Image options (UI review §3 item 13). Scale is not offered: Salsa reads the image back from the on-screen frame,
   *  so 2× / 4× would only enlarge screen pixels, not render more detail. */
  imageBackground: ExportImageBackground = 'canvas';
  imageFormat: ExportImageFormat = 'png';
  imageBusy = false;
  imageError = '';

  private _unregisterOverlay: (() => void) | null = null;

  constructor(public files: ProjectFileService, private persist: IllustrationPersistenceService,
              @Optional() private overlays?: OverlayManagerService) {}

  ngOnInit(): void {
    this.files.exportCartTitle = this.docTitle ?? this.persist.illustration?.name ?? 'Untitled';
    this.files.exportCartAuthor = '';
    this.files.exportCartDescription = '';
    this.files.exportCartBusy = false;
    this.refreshExportCartSounds();
    // A modal: Esc closes it; its backdrop handles outside taps. Opening it closes any open menu.
    this._unregisterOverlay = this.overlays?.register({ id: 'export-modal', isOpen: () => true, close: () => this.close.emit() }) ?? null;
  }

  ngOnDestroy(): void { this._unregisterOverlay?.(); this._unregisterOverlay = null; }

  /** Sound assets the scene uses — listed so the user sees what the .frogcart will bundle. */
  refreshExportCartSounds(): void {
    const sounds: { assetId: string }[] = (this.shapeManager?.listUISounds() ?? []).map((a: any) => typeof a === 'string' ? { assetId: a } : a);
    this.files.exportCartSounds = sounds.map((s: any) => s.assetId ?? s);
  }

  setImageBackground(bg: ExportImageBackground): void {
    this.imageBackground = bg;
    if (bg === 'transparent') this.imageFormat = 'png';   // JPEG has no transparency
  }

  /** "1920 × 1080 px" — what the export writes (document size), or a note for the infinite canvas. */
  get imageSizeLabel(): string {
    const s = exportImageSize(this.shapeManager?.getDocumentSize?.());
    return s ? `${s.w} × ${s.h} px` : 'The whole view: this document has no canvas size (Edit › Resize Canvas… sets one).';
  }

  /** The document has a pixel size. Without one Salsa can only capture the whole view, opaque — so no Transparent. */
  get hasDocSize(): boolean { return !!exportImageSize(this.shapeManager?.getDocumentSize?.()); }

  async exportImage(): Promise<void> {
    if (this.imageBusy) return;
    const sm = this.shapeManager;
    if (!sm) { this.exportImageRequested.emit(); this.close.emit(); return; }
    this.imageBusy = true;
    this.imageError = '';
    const transparent = this.imageBackground === 'transparent';
    const format: ExportImageFormat = transparent ? 'png' : this.imageFormat;
    try {
      const size = exportImageSize(sm.getDocumentSize?.());
      const maxSize = size?.maxSize ?? 2048;
      const blob = transparent ? await sm.exportIllustrationTransparentPNG(maxSize) : await this._captureOnCanvas(sm, format, maxSize);
      if (!blob) throw new Error('the engine returned no image');
      downloadBlob(blob, exportImageFileName(this.docTitle ?? this.persist.illustration?.name, format, transparent));
      this.close.emit();
    } catch (e) {
      console.warn('[export] image export failed', e);
      this.imageError = 'The image could not be exported. Try again, or use File › Export as PNG.';
    } finally {
      this.imageBusy = false;
    }
  }

  /** The artboard on its canvas background: frame the artboard (a zoomed-in view would crop it), capture, then put the
   *  user's view back — the same steps Salsa's transparent export takes. */
  private async _captureOnCanvas(sm: ShapeManager, format: ExportImageFormat, maxSize: number): Promise<Blob> {
    const is = sm.interactionService;
    const docSize = sm.getDocumentSize?.();
    if (!is || !docSize) return sm.captureDocumentBoundsToBlob(format, maxSize);
    const prevPan = { ...is.getPanOffset() };   // the live object: copy it
    const prevZoom = is.getZoomFactor();
    sm.fitArtboard();
    try {
      return await sm.captureDocumentBoundsToBlob(format, maxSize);
    } finally {
      is.setPanOffset(prevPan.x, prevPan.y);
      is.setZoom(prevZoom);
      sm.scheduleRender();
    }
  }

  /** The full project file (File › Save .frogmarks… — the whole document: layers, vectors, 3D, Grease Pencil …). It
   *  used to write the older 2D-only .frog file under a ".frogmarks" label. */
  async exportWorkfile(): Promise<void> {
    if (this.files.frogmarksSaving) return;
    await this.files.frogmarksSave();
    this.close.emit();
  }
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
