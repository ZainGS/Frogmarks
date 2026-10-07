import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { ShapeType } from '../../shared/enums/shape-type';
import { ArrowheadStyle, ARROWHEAD_OPTIONS } from 'app/boards/models/brush-preset.model';

/** The engine's preset polygon kinds. */
type PolygonPreset = Parameters<ShapeManager['createPresetPolygon']>[4];

/** Exactly the editor state the 2D drawing options use. */
export type DrawingOptionsHost = Pick<IllustrationComponent, 'shapeManager' |
  'setActiveTool'
>;

/**
 * 2D drawing options: pen / secondary / shape / text / highlight colours with their palettes and the recent colours,
 * pattern, stroke width, raster brush size + colour, stamps, arrowheads, shape type, polygon sides + presets, and the
 * SDF text defaults pushed to the engine at boot. Component-scoped (provided by IllustrationComponent). Bodies moved
 * verbatim from illustration.component (refactor-plan 2.9H).
 */
@Injectable()
export class DrawingOptionsService {
  private host!: DrawingOptionsHost;
  constructor() {}
  bind(host: DrawingOptionsHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  selectedPenColor = '#9B59B6';
  secondaryPenColor = '#000000';
  selectedShapeColor = '#FFFFFF';
  selectedTextColor = '#FFFFFF';
  selectedHighlightColor = '#DAB6FC';
  selectedPattern = 'assets/patterns/leaves.svg';
  selectedStamp = 'assets/stamps/star.webp';
  selectedStampColor = '#FFFFFF';
  selectedStampSize = 0.10;

  stampPalette: string[] = [
    'assets/stamps/star.webp',
    'assets/stamps/heart.webp',
    'assets/stamps/check.webp',
    'assets/stamps/arrow.webp',
    'assets/stamps/circle.webp',
    'assets/stamps/x.webp',
    'assets/stamps/thumbs_up.webp',
    'assets/stamps/icecream/icecream_strawberry.webp'
  ];

  iceCreamStamps: string[] = [
    'assets/stamps/icecream/icecream_chocolate.webp',
    'assets/stamps/icecream/icecream_chocolate2.webp',
    'assets/stamps/icecream/icecream_matcha.webp',
    'assets/stamps/icecream/icecream_matcha2.webp',
    'assets/stamps/icecream/icecream_strawberry.webp',
    'assets/stamps/icecream/icecream_strawberry2.webp',
    'assets/stamps/icecream/icecream_vanilla.webp',
    'assets/stamps/icecream/icecream_vanilla2.webp'
  ];

  getRandomIceCreamStamp(): string {
    return this.iceCreamStamps[Math.floor(Math.random() * this.iceCreamStamps.length)];
  }

  setStamp(stamp: string) {
    if (stamp.startsWith('assets/stamps/icecream')) {
      const randomIceCream = this.getRandomIceCreamStamp();
      this.selectedStamp = randomIceCream;
      this.shapeManager.setStampTexture(randomIceCream);
      this.stampPalette[7] = this.selectedStamp;
    } else {
      this.selectedStamp = stamp;
      this.shapeManager.setStampTexture(stamp);
    }
  }

  setStampColor(color: string) { this.selectedStampColor = color; this.shapeManager.setStampColor(color); }

  setStampSize(size: number) { this.selectedStampSize = size; this.shapeManager.setStampSize(size); }

  strokeWidth = 2;
  selectedShapeType: ShapeType | null = null;
  activeShapeKind: 'circle' | 'square' | 'triangle' | 'polygon' = 'circle';

  selectShapeType(kind: 'circle' | 'square' | 'triangle' | 'polygon'): void {
    this.activeShapeKind = kind;
    this.host.setActiveTool('shape:' + kind);
  }

  shapeColor = '#fff';
  shapeHexInputDraft: string = 'ffffff';

  // SDF text props
  selectedSDFTextColor = '#FFFFFF';
  selectedSDFTextOutlineColor = '#000000';
  selectedSDFTextFontSize = 120;
  selectedSDFTextFont = 'Arial';
  selectedSDFTextThreshold = 0.485;
  selectedSDFTextSmoothing = 1;
  selectedSDFTextOutlineWidth = 0;

  // Arrowhead defaults for new lines
  arrowheadStart: ArrowheadStyle = 'none';
  arrowheadEnd: ArrowheadStyle = 'triangle';
  arrowheadSize = 6;
  arrowheadOptions = ARROWHEAD_OPTIONS;

  // Polygon tool
  defaultPolygonSides = 6;
  polygonPresets: PolygonPreset[] = [];

  onPolygonSidesChange(sides: number): void {
    this.defaultPolygonSides = +sides;
    this.shapeManager.defaultPolygonSides = this.defaultPolygonSides;
  }

  placePresetPolygon(preset: string): void {
    this.shapeManager.createPresetPolygon(0, 0, 0.5, 0.5, preset as any, { r: 0, g: 0, b: 0, a: 1 }, 1);
  }

  loadPolygonPresets(): void {
    this.polygonPresets = ShapeManager.PolygonPresets || [];
  }

  readonly _polygonPresetLabels: Record<string, string> = {
    arrowRight: 'Arrow Right',
    speechBubble: 'Speech Bubble',
    star5: '5-Sided Star',
    star6: '6-Sided Star',
    parallelogram: 'Parallelogram',
    trapezoid: 'Trapezoid',
    chevron: 'Chevron',
    cross: 'Cross',
  };

  polygonPresetLabel(preset: string): string {
    return this._polygonPresetLabels[preset] ?? preset;
  }

  availableFonts = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Comic Sans MS'];

  onArrowheadStartChange(style: ArrowheadStyle): void {
    this.arrowheadStart = style;
    this.shapeManager.setDefaultArrowheads(this.arrowheadStart, this.arrowheadEnd);
  }

  onArrowheadEndChange(style: ArrowheadStyle): void {
    this.arrowheadEnd = style;
    this.shapeManager.setDefaultArrowheads(this.arrowheadStart, this.arrowheadEnd);
  }

  onArrowheadSizeChange(v: number): void {
    this.arrowheadSize = +v;
  }

  // Pen/Highlight/Pattern
  readonly _defaultPenPalette = ['#000000','#E74C3C','#F39C12','#ffff00','#2ECC71','#3498DB','#9B59B6','#FFFFFF'];
  penColorPalette: string[] = [...this._defaultPenPalette];
  highlightColorPalette: string[] = ['#A8A8A8','#FFADAD','#FFD6A5','#FDFFB6','#CAFFBF','#a0fdff','#DAB6FC','#FFFFFF'];

  highlightColorMapping: Map<string, string> = new Map([
    ['#A8A8A8', '#828282'],
    ['#FFADAD', '#ff80dd'],
    ['#FFD6A5', '#FFB766'],
    ['#FDFFB6', '#03ff9e'],
    ['#CAFFBF', '#8EEA87'],
    ['#a0fdff', '#59faff'],
    ['#DAB6FC', '#B48CF9'],
    ['#FFFFFF', '#FFFFFF']
  ]);

  patternPalette: string[] = [
    'assets/patterns/webp/checker.webp',
    'assets/patterns/webp/flowers.webp',
    'assets/patterns/webp/leaves.webp',
    'assets/patterns/webp/plaid.webp',
    'assets/patterns/webp/plaid-2.webp',
    'assets/patterns/webp/polka.webp',
    'assets/patterns/webp/caution-tape.webp',
    'assets/patterns/webp/plants.webp'
  ];

  // SDF setters
  setSDFTextColor(color: string) { this.selectedSDFTextColor = color; this.shapeManager.setSDFTextColor(color); }

  setSDFTextOutlineColor(color: string) { this.selectedSDFTextOutlineColor = color; this.shapeManager.setSDFTextOutlineColor(color); }

  setSDFTextFontSize(size: number) { this.selectedSDFTextFontSize = size; this.shapeManager.setSDFTextFontSize(size); }

  setSDFTextFont(font: string) { this.selectedSDFTextFont = font; this.shapeManager.setSDFTextFont(font); }

  setSDFTextThreshold(threshold: number) { this.selectedSDFTextThreshold = threshold; this.shapeManager.setSDFTextThreshold(threshold); }

  setSDFTextSmoothing(smoothing: number) { this.selectedSDFTextSmoothing = smoothing; this.shapeManager.setSDFTextSmoothing(smoothing); }

  setSDFTextOutlineWidth(width: number) { this.selectedSDFTextOutlineWidth = width; this.shapeManager.setSDFTextOutlineWidth(width); }

  setStrokeWidth(w: number) { this.strokeWidth = w; this.shapeManager.setRasterBrushSize(w); }

  setPenColor(c: string) {
    this.selectedPenColor = c;

    // update raster brush for illustrations — and the vector stroke, as picking on the colour picker does
    this.rasterBrushColor = c;
    this.shapeManager.setRasterBrushColor(c);
    this.shapeManager.setStrokeColor(c);
    this.syncLineColor();
  }

  /** Arrows / lines and the shape tools draw in the pen colour (arrows were a fixed grey; a shape tool only took the
   *  colour when it was picked). setLineColor is newer than some Salsa dists: skipped there. */
  syncLineColor(): void {
    const sm = this.shapeManager as unknown as { setLineColor?(c: string): void; setShapeColor?(c: string): void } | undefined;
    if (typeof sm?.setLineColor === 'function') sm.setLineColor(this.selectedPenColor);
    sm?.setShapeColor?.(this.selectedPenColor);
  }

  swapColors(): void {
    const prev = this.selectedPenColor;
    this.setPenColor(this.secondaryPenColor);
    this.secondaryPenColor = prev;
  }

  resetToDefaultColors(): void {
    this.secondaryPenColor = '#ffffff';
    this.setPenColor('#000000');
  }

  /** <app-persistent-color-picker> picked a colour (ring / square drag, hex input). */
  onPersistentColorPicked(hex: string): void {
    this.selectedPenColor = hex;
    this.rasterBrushColor = hex;
    this.shapeManager?.setRasterBrushColor(hex);
    this.shapeManager?.setStrokeColor(hex);
    this.syncLineColor();
  }

  setShapeColor(c: string) { this.selectedShapeColor = c; this.shapeManager.setShapeColor(c); }

  setTextColor(c: string) { this.selectedTextColor = c; this.shapeManager.setTextColor(c); }

  setHighlightColor(c: string) { this.selectedHighlightColor = c; const mapped = this.highlightColorMapping.get(c) ?? c; this.shapeManager.setHighlightColor(mapped); }

  setPattern(p: string) { this.selectedPattern = p; this.shapeManager.setPattern(this.selectedPattern); }

  // Raster is the default drawing path for illustrations
  rasterBrushSize = 16; // px (UI-friendly)

  rasterBrushColor = '#74fc88';

  setRasterBrushSize(size: number) {
    this.rasterBrushSize = size;
    this.shapeManager?.setRasterBrushSize(size);
  }

  setRasterBrushColor(color: string) {
    this.rasterBrushColor = color;
    this.shapeManager?.setRasterBrushColor(color);
  }

  recentColors: string[] = [];

  addRecentColor(color: string): void {
    this.recentColors = [color, ...this.recentColors.filter(c => c !== color)].slice(0, 8);
  }
}
