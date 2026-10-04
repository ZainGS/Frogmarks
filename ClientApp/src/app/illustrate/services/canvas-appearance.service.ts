import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { RasterBrushService } from 'app/shared/services/raster/raster-brush.service';
import { CanvasGrainType, CanvasGrainOption, CANVAS_GRAIN_OPTIONS } from 'app/boards/models/brush-preset.model';

import { parseAnyColor } from '../utils/color-utils';
/** Exactly the editor state the 2D canvas appearance uses. */
export type CanvasAppearanceHost = Pick<IllustrationComponent, 'shapeManager' |
  '_markStateDirty' | 'bgColorPickerRef' 
>;

/**
 * 2D canvas appearance: background + dot colours (picker, hex inputs), paper grain, and the canvas grid overlay.
 * Persistence reads / writes these. Component-scoped (provided by IllustrationComponent). Bodies moved verbatim from
 * illustration.component (refactor-plan 2.9H).
 */
@Injectable()
export class CanvasAppearanceService {
  private host!: CanvasAppearanceHost;
  constructor(private rasterBrushService: RasterBrushService) {}
  bind(host: CanvasAppearanceHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  // Background / Dot / Shape color pickers
  showBgColorPicker = false;
  bgColor = '#fff';
  bgHexInputDraft: string = this.bgColor.replace('#', '');
  dotColor = '#fff';
  dotHexInputDraft: string = this.dotColor.replace('#', '');

  // Paper grain (global canvas paper material)
  paperGrainType: CanvasGrainType = 'none';
  paperGrainScale = 1.0;
  paperGrainStrength = 0.3;
  paperGrainOptions: CanvasGrainOption[] = CANVAS_GRAIN_OPTIONS;

  // Canvas Grid
  canvasGridVisible = true;
  canvasGridCells = 64;
  canvasGridOpacity = 0.15;
  canvasGridColor: [number, number, number] = [128/255, 128/255, 128/255];

  get canvasGridColorHex(): string {
    const [r, g, b] = this.canvasGridColor;
    return '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  getBackgroundColor() { this.bgColor = this.shapeManager.getBackgroundColor(); this.bgHexInputDraft = this.bgColor; }

  getDotColor() { this.dotColor = this.shapeManager.getDotColor(); this.dotHexInputDraft = this.dotColor; }

  onPaperGrainTypeChange(type: CanvasGrainType): void {
    this.paperGrainType = type;
    this.applyPaperGrain();
  }

  onPaperGrainScaleChange(v: number): void {
    this.paperGrainScale = +v;
    this.applyPaperGrain();
  }

  onPaperGrainStrengthChange(v: number): void {
    this.paperGrainStrength = +v;
    this.applyPaperGrain();
  }

  applyPaperGrain(): void {
    this.rasterBrushService.setPaperGrain({
      type: this.paperGrainType,
      scale: this.paperGrainScale,
      strength: this.paperGrainStrength,
    });
    this.host._markStateDirty();
  }

  loadCanvasGrid(): void {
    const sm = this.shapeManager;
    this.canvasGridVisible = sm.canvasGridVisible ?? true;
    this.canvasGridCells   = sm.canvasGridCells ?? 64;
    this.canvasGridOpacity = sm.canvasGridOpacity ?? 0.15;
    this.canvasGridColor   = sm.canvasGridColor ? [...sm.canvasGridColor] as [number, number, number] : [128/255, 128/255, 128/255];
  }

  applyCanvasGrid(): void {
    const sm = this.shapeManager;
    if (!sm) return;
    sm.canvasGridVisible = this.canvasGridVisible;
    sm.canvasGridCells   = this.canvasGridCells;
    sm.canvasGridOpacity = this.canvasGridOpacity;
    sm.canvasGridColor   = [...this.canvasGridColor];
  }

  onCanvasGridOpacityChange(val: string): void {
    this.canvasGridOpacity = +val / 100;
    this.applyCanvasGrid();
  }

  onCanvasGridColorChange(hex: string): void {
    this.canvasGridColor = [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
    this.applyCanvasGrid();
  }

  openBgColorPicker() {
    if (!this.showBgColorPicker) {
      setTimeout(() => {
        this.showBgColorPicker = true;
        setTimeout(() => this.host.bgColorPickerRef?.setColor(this.bgColor.startsWith('#') ? this.bgColor : '#' + this.bgColor));
      }, 0);
    } else this.showBgColorPicker = false;
  }

  onBgHexInputChange(v: string) { this.bgHexInputDraft = v; }

  onHexInputEnter(event: Event) { (event.target as HTMLInputElement).blur(); }

  onBgHexInputBlur() {
    const raw = this.bgHexInputDraft.trim();
    const hex = '#' + raw;
    const isValid = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex);
    if (isValid) { this.bgColor = hex; this.bgHexInputDraft = raw; this.onBgColorSelected(hex); }
    else this.bgHexInputDraft = this.bgColor.replace('#', '');
  }

  // ---- color appliers ----
  onBgColorSelected(color: string) {
    this.bgColor = color;
    this.bgHexInputDraft = color.replace('#', '');
    const { r, g, b, a } = parseAnyColor(color);
    this.shapeManager?.setBackgroundColor(r / 255, g / 255, b / 255, a);
    this.host._markStateDirty();
  }

  onDotColorSelected(color: string) {
    this.dotColor = color;
    this.dotHexInputDraft = color.replace('#', '');
    const { r, g, b, a } = parseAnyColor(color);
    this.shapeManager?.setDotColor(r / 255, g / 255, b / 255, a);
    this.host._markStateDirty();
  }

  handleBgColorPickerClick(event: MouseEvent) {
    const picker = document.querySelector('app-color-picker');
    const square = document.querySelector('.left-panel-bg-square');
    if (this.showBgColorPicker && picker && !picker.contains(event.target as Node) && square && !square.contains(event.target as Node)) {
      this.showBgColorPicker = false;
    }
  }
}
