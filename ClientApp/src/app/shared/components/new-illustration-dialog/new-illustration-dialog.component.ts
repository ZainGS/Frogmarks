import { Component, Inject, Optional } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface NewIllustrationDialogData {
  importMode?: boolean;
  defaultName?: string;
  isLoggedIn?: boolean;
}

@Component({
  selector: 'app-new-illustration-dialog',
  templateUrl: './new-illustration-dialog.component.html',
  styleUrls: ['./new-illustration-dialog.component.scss']
})
export class NewIllustrationDialogComponent {

  presets: { label: string; w: number; h: number }[] = [
    { label: 'Square',              w: 1080, h: 1080 },
    { label: 'Instagram Post',      w: 1080, h: 1080 },
    { label: 'Instagram Story',     w: 1080, h: 1920 },
    { label: 'Twitter / X Post',    w: 1200, h:  675 },
    { label: 'A4 Print (300 dpi)',  w: 2480, h: 3508 },
    { label: '4K',                  w: 3840, h: 2160 },
    { label: 'HD 1080p',            w: 1920, h: 1080 },
    { label: 'Custom',              w:    0, h:    0 },
  ];

  selectedPreset = 'HD 1080p';
  docW = 1920;
  docH = 1080;
  aspectLocked = true;
  bounded = true;
  unit = 'px';
  syncMode = 2; // 0=CloudSync, 1=NoCloud, 2=LocalOnly

  private _lockedRatio = this.docW / this.docH;

  sizeWarning = false;
  previewAspect = this.docW / this.docH;

  importMode = false;
  importName = '';
  isLoggedIn = true;

  constructor(
    private dialogRef: MatDialogRef<NewIllustrationDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) data?: NewIllustrationDialogData,
  ) {
    if (data?.importMode) {
      this.importMode = true;
      this.importName = data.defaultName ?? 'Imported Illustration';
    }
    if (data?.isLoggedIn === false) {
      this.isLoggedIn = false;
      this.syncMode = 2;
    }
  }

  onPresetChange(label: string): void {
    this.selectedPreset = label;
    if (label === 'Custom') {
      return;
    }
    const preset = this.presets.find(p => p.label === label);
    if (!preset) return;
    this.docW = preset.w;
    this.docH = preset.h;
    this._lockedRatio = this.docW / this.docH;
    this.updatePreviewAndWarning();
  }

  onWidthChange(val: number): void {
    val = Math.min(8192, Math.max(1, val));
    this.docW = val;
    if (this.aspectLocked) {
      this.docH = Math.round(val / this._lockedRatio);
    }
    this.selectedPreset = 'Custom';
    this.updatePreviewAndWarning();
  }

  onHeightChange(val: number): void {
    val = Math.min(8192, Math.max(1, val));
    this.docH = val;
    if (this.aspectLocked) {
      this.docW = Math.round(val * this._lockedRatio);
    }
    this.selectedPreset = 'Custom';
    this.updatePreviewAndWarning();
  }

  toggleAspectLock(): void {
    this.aspectLocked = !this.aspectLocked;
    if (this.aspectLocked) {
      this._lockedRatio = this.docW / this.docH;
    }
  }

  setOrientation(o: 'portrait' | 'landscape' | 'square'): void {
    const w = this.docW;
    const h = this.docH;
    if (o === 'portrait') {
      this.docW = Math.min(w, h);
      this.docH = Math.max(w, h);
    } else if (o === 'landscape') {
      this.docW = Math.max(w, h);
      this.docH = Math.min(w, h);
    } else {
      const side = Math.max(w, h);
      this.docW = side;
      this.docH = side;
    }
    this.selectedPreset = 'Custom';
    this.updatePreviewAndWarning();
  }

  getOrientation(): 'portrait' | 'landscape' | 'square' {
    if (this.docW === this.docH) return 'square';
    return this.docW > this.docH ? 'landscape' : 'portrait';
  }

  get aspectLabel(): string {
    const gcd = this.gcd(this.docW, this.docH);
    const rw = this.docW / gcd;
    const rh = this.docH / gcd;
    return `${rw} : ${rh}`;
  }

  getPreviewStyle(): { width: string; height: string } {
    const MAX = 72;
    const aspect = this.docW / this.docH;
    if (aspect >= 1) {
      return { width: MAX + 'px', height: Math.round(MAX / aspect) + 'px' };
    } else {
      return { width: Math.round(MAX * aspect) + 'px', height: MAX + 'px' };
    }
  }

  create(): void {
    if (this.importMode) {
      this.dialogRef.close({ name: this.importName, syncMode: this.syncMode });
      return;
    }
    if (!this.bounded) {
      this.dialogRef.close({ name: 'Untitled Illustration', docW: null, docH: null, bounded: false, syncMode: this.syncMode });
    } else {
      this.dialogRef.close({ name: 'Untitled Illustration', docW: this.docW, docH: this.docH, bounded: true, syncMode: this.syncMode });
    }
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  private updatePreviewAndWarning(): void {
    this.previewAspect = this.docW / this.docH;
    this.sizeWarning = this.docW > 4096 || this.docH > 4096;
  }

  private gcd(a: number, b: number): number {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b !== 0) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a || 1;
  }
}
