import { Component, Input, Output, EventEmitter, ChangeDetectorRef, OnChanges } from '@angular/core';
import JSZip from 'jszip';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { AnimationFrameSource } from '../../models/animation-frame-source';

export type ExportFormat = 'gif' | 'mp4' | 'sprite-sheet' | 'png-sequence' | 'gif-sticker';

@Component({
  selector: 'app-animation-export',
  standalone: false,
  templateUrl: './animation-export.component.html',
  styleUrl: './animation-export.component.scss',
})
export class AnimationExportComponent implements OnChanges {
  @Input() shapeManager!: AnimationFrameSource;
  @Input() frameCount = 24;
  @Input() fps = 12;
  @Output() close = new EventEmitter<void>();

  format: ExportFormat = 'gif';
  rangeStart = 1;
  rangeEnd = 24;
  scale: '0.5x' | '1x' | '2x' = '1x';
  spriteColumns = 8;
  bgTransparent = true;
  bgColor = '#ffffff';
  quality = 80;
  isExporting = false;
  exportProgress = 0;
  exportStatusText = '';

  formatOptions: { value: ExportFormat; label: string; tooltip: string }[] = [
    { value: 'gif',          label: 'Animated GIF',   tooltip: 'Export as an animated GIF. Good for sharing on social media, Discord, and messaging apps.' },
    { value: 'mp4',          label: 'MP4 Video',       tooltip: 'Export as a video file. Best quality and smallest file size. Requires Chrome/Edge.' },
    { value: 'sprite-sheet', label: 'Sprite Sheet',    tooltip: 'Export all frames in a single image grid. Used for game development and spritesheets.' },
    { value: 'png-sequence', label: 'PNG Sequence',    tooltip: 'Export every frame as a separate PNG inside a ZIP. Standard for professional animation pipelines.' },
    { value: 'gif-sticker',  label: 'GIF Sticker',     tooltip: 'Export as a transparent animated sticker. Perfect for messaging apps and stream overlays.' },
  ];

  scaleOptions = ['0.5x', '1x', '2x'];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    // Sync rangeEnd whenever frameCount changes (e.g. first open)
    if (!this.isExporting) {
      this.rangeEnd = this.frameCount;
    }
  }

  onClose(): void {
    this.close.emit();
  }

  async onExport(): Promise<void> {
    if (!this.shapeManager) { alert('Canvas not ready.'); return; }
    this.isExporting = true;
    this.exportProgress = 0;
    this.exportStatusText = 'Preparing…';
    this.cdr.markForCheck();
    try {
      const scaleMap: Record<string, number> = { '0.5x': 0.5, '1x': 1.0, '2x': 2.0 };
      const scaleFactor = scaleMap[this.scale] ?? 1.0;
      switch (this.format) {
        case 'png-sequence': await this._exportPngSequence(scaleFactor); break;
        case 'sprite-sheet': await this._exportSpriteSheet(scaleFactor); break;
        case 'mp4':          await this._exportMp4(scaleFactor); break;
        case 'gif':
        case 'gif-sticker':  await this._exportGif(scaleFactor, this.format === 'gif-sticker'); break;
      }
      this.exportStatusText = 'Done!';
    } catch (err) {
      console.error('[AnimationExport] Export failed:', err);
      this.exportStatusText = 'Export failed — see console.';
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
      setTimeout(() => { this.exportStatusText = ''; this.cdr.markForCheck(); }, 2000);
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private _getFrameRange(): number[] {
    const start = Math.max(1, this.rangeStart);
    const end   = Math.min(this.frameCount, Math.max(start, this.rangeEnd));
    const frames: number[] = [];
    for (let f = start; f <= end; f++) frames.push(f);
    return frames;
  }

  private _setProgress(done: number, total: number, label?: string): void {
    this.exportProgress = done / total;
    if (label) this.exportStatusText = label;
    this.cdr.markForCheck();
  }

  /** Capture frame f from Salsa, scale if needed, return ImageBitmap. */
  private async _captureFrame(frame: number, scaleFactor: number): Promise<ImageBitmap> {
    this.shapeManager.setCurrentFrame(frame);
    // captureDocumentBoundsToBlob calls waitForFrameSettled() internally
    const blob: Blob = await this.shapeManager.captureDocumentBoundsToBlob('png', 8192);
    const img = await createImageBitmap(blob);
    if (scaleFactor === 1.0) return img;
    const w = Math.max(1, Math.round(img.width  * scaleFactor));
    const h = Math.max(1, Math.round(img.height * scaleFactor));
    const canvas = new OffscreenCanvas(w, h);
    (canvas.getContext('2d') as OffscreenCanvasRenderingContext2D).drawImage(img, 0, 0, w, h);
    img.close();
    return createImageBitmap(canvas);
  }

  private _downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── PNG Sequence ──────────────────────────────────────────

  private async _exportPngSequence(scale: number): Promise<void> {
    const savedFrame = this.shapeManager.getCurrentFrame?.() ?? 1;
    const frames = this._getFrameRange();
    const zip = new JSZip();

    for (let i = 0; i < frames.length; i++) {
      this._setProgress(i, frames.length, `Capturing frame ${i + 1} / ${frames.length}…`);
      const img = await this._captureFrame(frames[i], scale);
      const canvas = new OffscreenCanvas(img.width, img.height);
      (canvas.getContext('2d') as OffscreenCanvasRenderingContext2D).drawImage(img, 0, 0);
      img.close();
      const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
      zip.file(`frame_${String(frames[i]).padStart(4, '0')}.png`, pngBlob);
    }

    this.shapeManager.setCurrentFrame(savedFrame);
    this._setProgress(1, 1, 'Compressing ZIP…');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    this._downloadBlob(zipBlob, 'animation_frames.zip');
  }

  // ── Sprite Sheet ──────────────────────────────────────────

  private async _exportSpriteSheet(scale: number): Promise<void> {
    const savedFrame = this.shapeManager.getCurrentFrame?.() ?? 1;
    const frames = this._getFrameRange();
    const bitmaps: ImageBitmap[] = [];

    for (let i = 0; i < frames.length; i++) {
      this._setProgress(i, frames.length, `Capturing frame ${i + 1} / ${frames.length}…`);
      bitmaps.push(await this._captureFrame(frames[i], scale));
    }
    this.shapeManager.setCurrentFrame(savedFrame);

    this._setProgress(0.95, 1, 'Compositing…');
    const fw   = bitmaps[0].width;
    const fh   = bitmaps[0].height;
    const cols = Math.min(this.spriteColumns, bitmaps.length);
    const rows = Math.ceil(bitmaps.length / cols);
    const canvas = new OffscreenCanvas(fw * cols, fh * rows);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

    if (!this.bgTransparent) {
      ctx.fillStyle = this.bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    bitmaps.forEach((img, idx) => {
      ctx.drawImage(img, (idx % cols) * fw, Math.floor(idx / cols) * fh);
      img.close();
    });

    this._setProgress(1, 1, 'Encoding PNG…');
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    this._downloadBlob(blob, 'sprite_sheet.png');
  }

  // ── MP4 via WebCodecs ─────────────────────────────────────

  private async _exportMp4(scale: number): Promise<void> {
    if (typeof (globalThis as any).VideoEncoder === 'undefined') {
      alert('MP4 export requires WebCodecs support (Chrome 94+ or Edge 94+).');
      return;
    }

    const savedFrame = this.shapeManager.getCurrentFrame?.() ?? 1;
    const frames = this._getFrameRange();

    // Determine output dimensions from first frame
    this._setProgress(0, frames.length, 'Reading first frame…');
    const firstImg = await this._captureFrame(frames[0], scale);
    const rawW = firstImg.width;
    const rawH = firstImg.height;
    firstImg.close();
    // H.264 requires even dimensions
    const w = rawW % 2 ? rawW - 1 : rawW;
    const h = rawH % 2 ? rawH - 1 : rawH;

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: w, height: h, frameRate: this.fps },
      fastStart: 'in-memory',
    });

    const VideoEncoder = (globalThis as any).VideoEncoder;
    const VideoFrame   = (globalThis as any).VideoFrame;

    const encoder = new VideoEncoder({
      output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
      error:  (e: any) => { throw e; },
    });
    encoder.configure({
      codec:     'avc1.4d0034',
      width:      w,
      height:     h,
      bitrate:    this.quality * 80_000,
      framerate:  this.fps,
    });

    const offscreen = new OffscreenCanvas(w, h);
    const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const frameDuration = 1_000_000 / this.fps; // microseconds

    for (let i = 0; i < frames.length; i++) {
      this._setProgress(i, frames.length, `Encoding frame ${i + 1} / ${frames.length}…`);
      const img = await this._captureFrame(frames[i], scale);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      img.close();

      const vf = new VideoFrame(offscreen, { timestamp: Math.round(i * frameDuration) });
      encoder.encode(vf, { keyFrame: i === 0 || i % 30 === 0 });
      vf.close();
    }

    this._setProgress(1, 1, 'Finalising…');
    await encoder.flush();
    muxer.finalize();
    this.shapeManager.setCurrentFrame(savedFrame);

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    this._downloadBlob(blob, 'animation.mp4');
  }

  // ── GIF / GIF Sticker ─────────────────────────────────────

  private async _exportGif(scale: number, stickerMode: boolean): Promise<void> {
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc') as any;
    const savedFrame = this.shapeManager.getCurrentFrame?.() ?? 1;
    const frames = this._getFrameRange();
    const delayMs = Math.round(1000 / this.fps);
    const isTransparent = stickerMode || this.bgTransparent;

    // Determine dimensions from first frame
    this._setProgress(0, frames.length, 'Reading first frame…');
    const firstImg = await this._captureFrame(frames[0], scale);
    const w = firstImg.width;
    const h = firstImg.height;
    firstImg.close();

    const gif = GIFEncoder();
    const offscreen = new OffscreenCanvas(w, h);
    const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;

    for (let i = 0; i < frames.length; i++) {
      this._setProgress(i, frames.length, `Encoding frame ${i + 1} / ${frames.length}…`);
      ctx.clearRect(0, 0, w, h);
      if (!isTransparent) {
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(0, 0, w, h);
      }
      const img = await this._captureFrame(frames[i], scale);
      ctx.drawImage(img, 0, 0);
      img.close();

      const imageData = ctx.getImageData(0, 0, w, h);
      const palette   = quantize(imageData.data, 256, { format: 'rgba4444' });
      const index     = applyPalette(imageData.data, palette, 'rgba4444');
      gif.writeFrame(index, w, h, {
        palette,
        delay: delayMs,
        transparent: isTransparent,
        disposal: 2,
      });
    }

    gif.finish();
    this.shapeManager.setCurrentFrame(savedFrame);
    const bytes: Uint8Array = gif.bytes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = new Blob([bytes as any], { type: 'image/gif' });
    this._downloadBlob(blob, stickerMode ? 'sticker.gif' : 'animation.gif');
  }
}
