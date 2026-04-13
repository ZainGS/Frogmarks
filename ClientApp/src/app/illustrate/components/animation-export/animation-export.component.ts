import { Component, Output, EventEmitter } from '@angular/core';

export type ExportFormat = 'gif' | 'mp4' | 'sprite-sheet' | 'png-sequence' | 'gif-sticker';

@Component({
  selector: 'app-animation-export',
  standalone: false,
  templateUrl: './animation-export.component.html',
  styleUrl: './animation-export.component.scss',
})
export class AnimationExportComponent {
  @Output() close = new EventEmitter<void>();

  format: ExportFormat = 'gif';
  rangeStart = 1;
  rangeEnd = 24;
  scale: '0.5x' | '1x' | '2x' = '1x';
  spriteColumns = 8;
  bgTransparent = true;
  bgColor = '#000000';
  quality = 80;
  isExporting = false;

  formatOptions: { value: ExportFormat; label: string; tooltip: string }[] = [
    { value: 'gif', label: 'Animated GIF', tooltip: 'Export as an animated GIF. Good for sharing on social media, Discord, and messaging apps.' },
    { value: 'mp4', label: 'MP4 Video', tooltip: 'Export as a video file. Best quality and smallest file size.' },
    { value: 'sprite-sheet', label: 'Sprite Sheet', tooltip: 'Export all frames in a single image grid. Used for game development and spritesheets.' },
    { value: 'png-sequence', label: 'PNG Sequence', tooltip: 'Export every frame as a separate PNG. Standard for professional animation pipelines.' },
    { value: 'gif-sticker', label: 'GIF Sticker', tooltip: 'Export as a transparent animated sticker. Perfect for messaging apps and stream overlays.' },
  ];

  scaleOptions = ['0.5x', '1x', '2x'];

  onClose(): void {
    this.close.emit();
  }

  async onExport(): Promise<void> {
    this.isExporting = true;
    // Delegate to animation exporter (Salsa provides AnimationExporter)
    try {
      // This is a placeholder — the actual export logic uses Salsa's AnimationExporter
      console.log('Exporting:', {
        format: this.format,
        rangeStart: this.rangeStart,
        rangeEnd: this.rangeEnd,
        scale: this.scale,
        spriteColumns: this.spriteColumns,
        bgTransparent: this.bgTransparent,
        bgColor: this.bgColor,
        quality: this.quality,
      });
      // TODO: Wire to AnimationExporter from @zaings/salsa
    } finally {
      this.isExporting = false;
    }
  }
}
