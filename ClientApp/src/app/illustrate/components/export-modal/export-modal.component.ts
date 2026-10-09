import { Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Optional, Output, ViewChild } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { ProjectFileService } from '../../services/project-file.service';
import { IllustrationPersistenceService } from '../../services/illustration-persistence.service';
import { OverlayManagerService } from '../../../shared/services/overlay/overlay-manager.service';
import {
  CART_DISC_FIT_DEFAULT, cartDiscEngine, decodeDiscImage, discArtHint, fallbackDiscSeed, pinchZoom,
  type CartDiscArtMode, type CartDiscPreviewLike,
  DISC_ZOOM_STEPS, discZoomFromSlider, discSliderFromZoom, discDrawRects,
} from './cart-disc-art';

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

  // ── Disc art (.frogcart): Pattern / Image / Snapshot + the live 3D disc preview ──
  readonly discModes: { id: CartDiscArtMode; label: string; title: string }[] = [
    { id: 'pattern', label: 'Pattern', title: 'The cart\'s own wavy pattern' },
    { id: 'image', label: 'Image', title: 'Print an image on the disc' },
    { id: 'snapshot', label: 'Snapshot', title: 'Print a capture of the artboard' },
  ];
  /** Edge (CSS px) of the round crop editor — measured (the square fills its grid column; ResizeObserver). */
  cropSize = 132;
  readonly discZoomSteps = DISC_ZOOM_STEPS;
  private _cropBox: HTMLElement | null = null;
  private _cropObserver: ResizeObserver | null = null;
  discArtBusy = false;
  /** The live 3D preview (null: an engine build without it, or the GPU is not ready). */
  private _preview: CartDiscPreviewLike | null = null;
  private _previewCanvas: HTMLCanvasElement | null = null;
  /** The decoded active source (its pixel size drives the crop maths + the 2D crop editor). */
  private _srcBitmap: ImageBitmap | null = null;
  private _srcBlob: Blob | null = null;
  private _cropCanvas: HTMLCanvasElement | null = null;
  private _pointers = new Map<number, { x: number; y: number }>();
  private _pinch: { d0: number; z0: number } | null = null;

  /** The live 3D disc canvas (in the Scene tab, so it comes and goes with the tab). */
  @ViewChild('discCanvas') set discCanvas(ref: ElementRef<HTMLCanvasElement> | undefined) {
    const el = ref?.nativeElement ?? null;
    if (el === this._previewCanvas) return;
    this._disposePreview();
    this._previewCanvas = el;
    if (!el) return;
    const make = () => cartDiscEngine(this.shapeManager).createCartDiscPreview?.(el, { pattern: { seed: this.files.exportCartPatternSeed }, fit: this.files.exportCartArtFit }) ?? null;
    // Its rAF loop runs outside Angular: a frame must not run change detection.
    try { this._preview = this.zone ? this.zone.runOutsideAngular(make) : make(); } catch { this._preview = null; }
    void this._syncPreviewArt();
  }

  /** The crop square: its size follows the layout (the grid column), so the canvas + guides + pan maths re-measure. */
  @ViewChild('cropBox') set cropBox(ref: ElementRef<HTMLElement> | undefined) {
    const el = ref?.nativeElement ?? null;
    if (el === this._cropBox) return;
    this._cropObserver?.disconnect(); this._cropObserver = null;
    this._cropBox = el;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0 && w !== this.cropSize) {
        const apply = () => { this.cropSize = w; this._drawCrop(); };
        if (this.zone) this.zone.run(apply); else apply();
      }
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') { this._cropObserver = new ResizeObserver(measure); this._cropObserver.observe(el); }
  }

  /** The round 2D crop editor (Image / Snapshot). */
  @ViewChild('cropCanvas') set cropCanvas(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this._cropCanvas = ref?.nativeElement ?? null;
    this._drawCrop();
  }

  /** The live disc preview is available (hides its frame when not). */
  get hasDiscPreview(): boolean { return !!this._preview; }
  /** The disc's idle spin can be stopped / played (the button in the preview's corner). */
  get canPauseDisc(): boolean { return typeof this._preview?.start === 'function' && typeof this._preview?.stop === 'function'; }
  get discAnimating(): boolean { return this._preview?.running !== false; }
  toggleDiscAnimation(): void {
    const p = this._preview;
    if (!p?.start || !p.stop) return;
    const run = () => (p.running === false ? p.start!() : p.stop!());
    if (this.zone) this.zone.runOutsideAngular(run); else run();   // its rAF loop must not run change detection
  }

  /** The preview can play the Shell's launch animation (a newer Salsa build). */
  get canPreviewLaunch(): boolean { return typeof this._preview?.playLaunchPreview === 'function'; }

  /** ▶ Preview launch: the disc plays what a tap on its Shell tile does (flick to the front, spin-up), then settles
   *  back to its idle whirl. Outside the zone: its frames must not run change detection. */
  previewLaunch(): void {
    const p = this._preview;
    if (!p?.playLaunchPreview) return;
    const run = () => p.playLaunchPreview!();
    if (this.zone) this.zone.runOutsideAngular(run); else run();
  }
  get discHint(): string { return discArtHint(this.files.exportCartArtMode, !!this.files.exportCartArtSource); }
  get discZoom(): number { return this.files.exportCartArtFit.zoom; }
  get discMaxZoom(): number { return Math.min(4, cartDiscEngine(this.shapeManager).cartDisc?.MAX_ZOOM ?? 4); }
  /** Below 1 = the image smaller than the disc (an older engine stops at 1: the slider's lower half does nothing). */
  get discMinZoom(): number { return Math.min(1, Math.max(0.25, cartDiscEngine(this.shapeManager).cartDisc?.MIN_ZOOM ?? 1)); }
  /** The zoom slider's position: the middle = 1 (the image covers the disc), up = bigger, down = smaller. */
  get discZoomSlider(): number { return discSliderFromZoom(this.discZoom, this.discMinZoom, this.discMaxZoom); }
  /** The guides of the round crop editor (outer cut, hole, clear hub ring), in its CSS px. */
  get discGuides(): { c: number; outer: number; hole: number; safe: number } {
    const g = cartDiscEngine(this.shapeManager).cartDisc?.guides(this.cropSize);
    const c = this.cropSize / 2;
    return { c, outer: c - 1, hole: g ? g.holeR : c * 0.125, safe: g ? g.safeR : c * 0.3 };
  }

  constructor(public files: ProjectFileService, private persist: IllustrationPersistenceService,
              @Optional() private overlays?: OverlayManagerService, @Optional() private zone?: NgZone) {}

  ngOnInit(): void {
    this.files.exportCartTitle = this.docTitle ?? this.persist.illustration?.name ?? 'Untitled';
    this.files.exportCartAuthor = '';
    this.files.exportCartDescription = '';
    this.files.exportCartBusy = false;
    this.files.resetExportCartArt?.(this.persist.illustration?.id != null ? String(this.persist.illustration.id) : null);
    this.refreshExportCartSounds();
    // A modal: Esc closes it; its backdrop handles outside taps. Opening it closes any open menu.
    this._unregisterOverlay = this.overlays?.register({ id: 'export-modal', isOpen: () => true, close: () => this.close.emit() }) ?? null;
  }

  ngOnDestroy(): void {
    this._unregisterOverlay?.(); this._unregisterOverlay = null;
    this._disposePreview();
    this._cropObserver?.disconnect(); this._cropObserver = null;
    this._srcBitmap?.close?.(); this._srcBitmap = null; this._srcBlob = null;
  }

  // ── Disc art ──

  async setDiscMode(mode: CartDiscArtMode): Promise<void> {
    this.files.exportCartArtMode = mode;
    this.files.exportCartArtError = '';
    if (mode === 'snapshot' && !this.files.exportCartArtSnapshot) await this.captureDiscSnapshot();
    await this._syncSource();
  }

  /** The shuffle button: another pattern for this cart. */
  shuffleDiscPattern(): void {
    const tools = cartDiscEngine(this.shapeManager).cartDisc;
    this.files.exportCartPatternSeed = tools?.randomSeed() ?? fallbackDiscSeed();
    this._preview?.setPattern(this.files.exportCartPatternSeed);
  }

  /** "Choose image…" picked a file. */
  async onDiscImagePicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';   // picking the same file again still fires
    if (!file) return;
    const bmp = await decodeDiscImage(file);
    if (!bmp) { this.files.exportCartArtError = 'That file is not an image this browser can open.'; return; }
    bmp.close?.();
    this.files.exportCartArtError = '';
    this.files.exportCartArtImage = file;
    this.files.exportCartArtMode = 'image';
    this.files.exportCartArtFit = { ...CART_DISC_FIT_DEFAULT };
    await this._syncSource();
  }

  /** Snapshot mode: capture the artboard (framed like the image export, the view put back after). */
  async captureDiscSnapshot(): Promise<void> {
    const sm = this.shapeManager;
    if (!sm || this.discArtBusy) return;
    this.discArtBusy = true;
    try {
      this.files.exportCartArtSnapshot = await this._captureOnCanvas(sm, 'png', 1024);
      this.files.exportCartArtFit = { ...CART_DISC_FIT_DEFAULT };
    } catch (e) {
      console.warn('[export] disc snapshot failed', e);
      this.files.exportCartArtError = 'The artboard could not be captured. Try again, or choose an image.';
    } finally {
      this.discArtBusy = false;
    }
  }

  /** Snapshot mode's "Recapture": a fresh capture of the artboard as it is now. */
  async recaptureDiscSnapshot(): Promise<void> {
    if (this.discArtBusy) return;
    this.files.exportCartArtSnapshot = null;
    await this.setDiscMode('snapshot');
  }

  onDiscZoomSlider(value: string | number): void {
    this.onDiscZoomInput(discZoomFromSlider(Number(value), this.discMinZoom, this.discMaxZoom));
  }

  onDiscZoomInput(value: string | number): void {
    const b = this._srcBitmap, tools = cartDiscEngine(this.shapeManager).cartDisc;
    const z = Number(value);
    if (!b || !Number.isFinite(z)) return;
    this._applyFit(tools ? tools.zoomTo(this.files.exportCartArtFit, b.width, b.height, z) : { ...this.files.exportCartArtFit, zoom: z });
  }

  onDiscWheel(ev: WheelEvent): void {
    if (!this._srcBitmap) return;
    ev.preventDefault();
    this.onDiscZoomInput(Math.min(this.discMaxZoom, Math.max(this.discMinZoom, this.discZoom * Math.exp(-ev.deltaY * 0.0015))));
  }

  onDiscPointerDown(ev: PointerEvent): void {
    if (!this._srcBitmap) return;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    this._pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    this._pinch = this._pointers.size === 2 ? { d0: this._pointerSpread(), z0: this.discZoom } : null;
  }

  onDiscPointerMove(ev: PointerEvent): void {
    const prev = this._pointers.get(ev.pointerId);
    const b = this._srcBitmap, tools = cartDiscEngine(this.shapeManager).cartDisc;
    if (!prev || !b || !tools) return;
    this._pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (this._pinch && this._pointers.size >= 2) {
      this.onDiscZoomInput(pinchZoom(this._pinch.z0, this._pinch.d0, this._pointerSpread(), this.discMaxZoom, this.discMinZoom));
      return;
    }
    const dx = (ev.clientX - prev.x) / this.cropSize, dy = (ev.clientY - prev.y) / this.cropSize;
    this._applyFit(tools.panBy(this.files.exportCartArtFit, b.width, b.height, dx, dy));
  }

  onDiscPointerUp(ev: PointerEvent): void {
    this._pointers.delete(ev.pointerId);
    if (this._pointers.size < 2) this._pinch = null;
  }

  private _pointerSpread(): number {
    const [a, b] = [...this._pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private _applyFit(fit: { zoom: number; panX: number; panY: number }): void {
    const tools = cartDiscEngine(this.shapeManager).cartDisc;
    this.files.exportCartArtFit = tools ? tools.clampFit(fit) : fit;
    this._preview?.setFit(this.files.exportCartArtFit);
    this._drawCrop();
  }

  /** Decode the active source (when it changed) and hand it to the preview + the crop editor. */
  private async _syncSource(): Promise<void> {
    const src = this.files.exportCartArtSource;
    if (src !== this._srcBlob) {
      this._srcBitmap?.close?.();
      this._srcBitmap = null;
      this._srcBlob = src;
      if (src) {
        const bmp = await decodeDiscImage(src);
        if (this._srcBlob !== src) { bmp?.close?.(); return; }   // superseded meanwhile
        this._srcBitmap = bmp;
      }
    }
    this._drawCrop();
    await this._syncPreviewArt();
  }

  private async _syncPreviewArt(): Promise<void> {
    const p = this._preview;
    if (!p) return;
    p.setPattern(this.files.exportCartPatternSeed);
    p.setFit(this.files.exportCartArtFit);
    await p.setArt(this.files.exportCartArtSource);
  }

  /** The round crop editor: the source cropped exactly as the disc will print it. */
  private _drawCrop(): void {
    const cv = this._cropCanvas, b = this._srcBitmap, tools = cartDiscEngine(this.shapeManager).cartDisc;
    if (!cv) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const px = Math.round(this.cropSize * dpr);
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, px, px);
    if (!b) return;
    const c = tools ? tools.cropRect(b.width, b.height, this.files.exportCartArtFit) : { sx: 0, sy: 0, sw: b.width, sh: b.height };
    ctx.save();
    ctx.beginPath(); ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2); ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    const d = discDrawRects(b.width, b.height, c, px, px);   // (zoomed out: the image is smaller than the disc)
    if (d) ctx.drawImage(b, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh);
    ctx.restore();
  }

  private _disposePreview(): void {
    try { this._preview?.dispose(); } catch { /* already gone */ }
    this._preview = null;
  }

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
