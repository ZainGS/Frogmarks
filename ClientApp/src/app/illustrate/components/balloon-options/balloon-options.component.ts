import { Component, ElementRef, Input, NgZone, OnDestroy, ViewChild } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { fxColorToHex, fxHexToColor, hexToRgba01Obj, rgba01ObjToHex } from '../../utils/color-utils';
import { TailSide, BalloonStyle, WritingMode, BALLOON_STYLE_OPTIONS, DEFAULT_BALLOON_OPTIONS } from 'app/illustrate/models/speech-balloon.model';
import { TextEffectType, TextEffectEntry, TextEffectPreset, TEXT_EFFECT_TYPE_OPTIONS, TEXT_EFFECT_PRESETS, createEffectEntry, createDefaultParams, textEffectGlowColor, engineTextEffectParams, setTextEffectParam, BalloonPreset, BALLOON_PRESETS } from 'app/illustrate/models/text-effect.model';

/** Engine calls newer than the Salsa dist this host may be built against (feature-detected). */
interface BalloonEngineExtras {
  /** Salsa 2026-10-09: capture → effects → read back into a 2D canvas, freeing every GPU texture it made. */
  previewEffectedTextToCanvas?(canvas: HTMLCanvasElement, textConfig: unknown, effects: unknown): Promise<boolean>;
}

/** Speech-balloon tool options (style, tail, text, colours, presets) and the text-effects stamp (chain, preview,
 *  animation). Always mounted — the settings survive tool switches; the content shows while [active].
 *  Extracted from illustration.component (refactor-plan 2.10d). */
@Component({
  selector: 'app-balloon-options',
  templateUrl: './balloon-options.component.html',
  styleUrls: ['./balloon-options.component.scss'],
})
export class BalloonOptionsComponent implements OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  @Input() active = false;
  @Input() availableFonts: string[] = [];
  constructor(private ngZone: NgZone) {}
  readonly textEffectTypeOptions = TEXT_EFFECT_TYPE_OPTIONS;
  fxColorToHex(color: number[] | undefined | null): string { return fxColorToHex(color); }
  fxHexToColor(hex: string, existingAlpha = 1): [number, number, number, number] { return fxHexToColor(hex, existingAlpha); }

  ngOnDestroy(): void {
    this.textEffectAnimating = false;
    if (this._textEffectAnimFrame != null) { cancelAnimationFrame(this._textEffectAnimFrame); this._textEffectAnimFrame = null; }
  }

  @ViewChild('fxPreviewCanvas') fxPreviewCanvas?: ElementRef<HTMLCanvasElement>;
  /** The preview canvas shows once a frame has been drawn into it. */
  textEffectPreviewShown = false;
  private _previewBusy = false;
  private _previewAgain = false;

  balloonStyleOptions = BALLOON_STYLE_OPTIONS;

  balloonStyle: BalloonStyle = DEFAULT_BALLOON_OPTIONS.style;

  balloonWritingMode: WritingMode = DEFAULT_BALLOON_OPTIONS.writingMode;

  balloonTailSide: TailSide = DEFAULT_BALLOON_OPTIONS.tailSide;

  balloonTailPosition: number = DEFAULT_BALLOON_OPTIONS.tailPosition;

  balloonShowTail: boolean = DEFAULT_BALLOON_OPTIONS.showTail;

  balloonFontFamily: string = DEFAULT_BALLOON_OPTIONS.fontFamily;

  balloonFontSize: number = DEFAULT_BALLOON_OPTIONS.fontSize;

  balloonMaxWidth: number = DEFAULT_BALLOON_OPTIONS.maxWidth;

  balloonTextColor: string = '#000000';

  balloonFillColor: string = '#ffffff';

  balloonStrokeColor: string = '#000000';

  textEffectPresets = TEXT_EFFECT_PRESETS;

  textEffectChain: TextEffectEntry[] = [];

  textEffectText: string = 'KABOOM!';

  textEffectFont: string = 'Impact';

  textEffectFontSize: number = 96;

  textEffectBold: boolean = true;

  textEffectItalic: boolean = false;

  textEffectColor: string = '#ffffff';

  textEffectPadding: number = 24;

  textEffectAnimating: boolean = false;

  private _textEffectAnimFrame: number | null = null;

  balloonPresets = BALLOON_PRESETS;

  balloonStrokeWidth: number = 2;

  balloonTailLength: number = 0.15;

  onBalloonStyleChange(style: BalloonStyle): void {
    this.balloonStyle = style;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      this.shapeManager.setSpeechBalloonStyle(sel[0], style);
    }
  }

  onBalloonWritingModeChange(mode: WritingMode): void {
    this.balloonWritingMode = mode;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      this.shapeManager.setSpeechBalloonWritingMode(sel[0], mode);
    }
  }

  onBalloonTailSideChange(side: TailSide): void {
    this.balloonTailSide = side;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      this.shapeManager.setSpeechBalloonTail(sel[0], side, this.balloonTailPosition, this.balloonTailLength);
    }
  }

  onBalloonTailPositionChange(pos: number): void {
    this.balloonTailPosition = +pos;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      this.shapeManager.setSpeechBalloonTail(sel[0], this.balloonTailSide, this.balloonTailPosition, this.balloonTailLength);
    }
  }

  onBalloonShowTailChange(show: boolean): void {
    this.balloonShowTail = show;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      const balloon = this.shapeManager.getSpeechBalloon(sel[0]);
      balloon?.setShowTail?.(show);
    }
  }

  onBalloonFontSizeChange(size: number): void {
    this.balloonFontSize = +size;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      const balloon = this.shapeManager.getSpeechBalloon(sel[0]);
      balloon?.setFontSize?.(+size);
    }
  }

  onBalloonMaxWidthChange(width: number): void {
    this.balloonMaxWidth = +width;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      const balloon = this.shapeManager.getSpeechBalloon(sel[0]);
      balloon?.setMaxWidth?.(+width);
    }
  }

  onBalloonFontFamilyChange(font: string): void {
    this.balloonFontFamily = font;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      const balloon = this.shapeManager.getSpeechBalloon(sel[0]);
      balloon?.setFont?.(font);
    }
  }

  onBalloonTextColorChange(hex: string): void {
    this.balloonTextColor = hex;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      const balloon = this.shapeManager.getSpeechBalloon(sel[0]);
      balloon?.setTextColor?.(hexToRgba01Obj(hex));
    }
  }

  onBalloonFillColorChange(hex: string): void {
    this.balloonFillColor = hex;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      const balloon = this.shapeManager.getSpeechBalloon(sel[0]);
      balloon?.setFillColor?.(hexToRgba01Obj(hex));
    }
  }

  onBalloonStrokeColorChange(hex: string): void {
    this.balloonStrokeColor = hex;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      const balloon = this.shapeManager.getSpeechBalloon(sel[0]);
      balloon?.setStrokeColor?.(hexToRgba01Obj(hex));
    }
  }

  /** Populate the balloon sidebar from an existing selected balloon's state. */
  _syncBalloonSidebar(nodeId: string): void {
    const balloon = this.shapeManager.getSpeechBalloon(nodeId);
    if (!balloon) return;
    // Style
    if (balloon.balloonStyle) this.balloonStyle = balloon.balloonStyle;
    // Writing mode
    if (balloon.writingMode) this.balloonWritingMode = balloon.writingMode;
    // Tail
    if (balloon.tailSide) this.balloonTailSide = balloon.tailSide;
    if (balloon.tailPosition != null) this.balloonTailPosition = balloon.tailPosition;
    if (balloon.showTail != null) this.balloonShowTail = balloon.showTail;
    if (balloon.tailLength != null) this.balloonTailLength = balloon.tailLength;
    // Font
    if (balloon.textNode?.font) this.balloonFontFamily = balloon.textNode.font;
    if (balloon.textNode?.fontSize) this.balloonFontSize = balloon.textNode.fontSize;
    // Max width
    if (balloon.maxWidth != null) this.balloonMaxWidth = balloon.maxWidth;
    // Stroke width
    if (balloon.balloonStrokeWidth != null) this.balloonStrokeWidth = balloon.balloonStrokeWidth;
    // Colors
    if (balloon.balloonFillColor) this.balloonFillColor = rgba01ObjToHex(balloon.balloonFillColor);
    if (balloon.balloonStrokeColor) this.balloonStrokeColor = rgba01ObjToHex(balloon.balloonStrokeColor);
    if (balloon.textNode?.fillColor) this.balloonTextColor = rgba01ObjToHex(balloon.textNode.fillColor);
  }

  /** Called on canvas click when balloon tool is active */
  placeBalloon(worldX: number, worldY: number): void {
    const sm = this.shapeManager;
    if (!sm.createSpeechBalloon) return;
    const balloon = sm.createSpeechBalloon(worldX, worldY, {
      text: '',
      style: this.balloonStyle,
      writingMode: this.balloonWritingMode,
      tailSide: this.balloonTailSide,
      tailPosition: this.balloonTailPosition,
      tailLength: this.balloonTailLength,
      showTail: this.balloonShowTail,
      font: this.balloonFontFamily,
      fontSize: this.balloonFontSize,
      maxWidth: this.balloonMaxWidth,
      strokeWidth: this.balloonStrokeWidth,
      textColor: hexToRgba01Obj(this.balloonTextColor),
      fillColor: hexToRgba01Obj(this.balloonFillColor),
      strokeColor: hexToRgba01Obj(this.balloonStrokeColor),
    });
    // Enter edit mode so the user can start typing immediately
    if (balloon) {
      const textNode = balloon.getTextNode?.();
      if (textNode?.beginTyping) textNode.beginTyping();
    }
  }

  cycleBalloonTailSide(): void {
    const sides: TailSide[] = ['bottom', 'right', 'top', 'left'];
    const idx = sides.indexOf(this.balloonTailSide);
    this.onBalloonTailSideChange(sides[(idx + 1) % sides.length]);
  }

  addTextEffect(type?: TextEffectType): void {
    const entry = createEffectEntry(type ?? 'outline');
    this.textEffectChain = [...this.textEffectChain, entry];
  }

  removeTextEffect(id: number): void {
    this.textEffectChain = this.textEffectChain.filter(e => e.id !== id);
  }

  moveTextEffect(id: number, direction: -1 | 1): void {
    const idx = this.textEffectChain.findIndex(e => e.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= this.textEffectChain.length) return;
    const chain = [...this.textEffectChain];
    [chain[idx], chain[target]] = [chain[target], chain[idx]];
    this.textEffectChain = chain;
  }

  onTextEffectTypeChange(entry: TextEffectEntry, type: TextEffectType): void {
    entry.type = type;
    entry.params = createDefaultParams(type);
    this.textEffectChain = [...this.textEffectChain];
  }

  onTextEffectParamChange(entry: TextEffectEntry, key: string, value: any): void {
    setTextEffectParam(entry, key, value);
    if (this.textEffectPreviewShown && !this.textEffectAnimating) this.previewTextEffect();   // keep the preview current
  }

  /** The glow swatch's colour (`color`, or the legacy `glowColor` of an older chain). */
  glowColorOf(entry: TextEffectEntry): number[] | undefined { return textEffectGlowColor(entry.params); }

  applyTextEffectPreset(preset: TextEffectPreset): void {
    let nextId = Date.now();
    this.textEffectChain = preset.effects.map(e => ({
      id: nextId++,
      type: e.type,
      params: { ...e.params },
    }));
  }

  /** Build the Salsa TextEffectConfig[] from the UI chain. */
  _buildEffectChain(): { type: string; params: Record<string, any> }[] {
    return this.textEffectChain.map(e => ({ type: e.type, params: engineTextEffectParams(e.type, e.params) }));
  }

  /** Build the Salsa TextCaptureConfig from the UI fields. */
  _buildTextCaptureConfig(): any {
    const h = this.textEffectColor.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return {
      text: this.textEffectText,
      font: this.textEffectFont,
      fontSize: this.textEffectFontSize,
      color: [r, g, b, 1] as [number, number, number, number],
      bold: this.textEffectBold,
      italic: this.textEffectItalic,
      padding: this.textEffectPadding,
    };
  }

  /**
   * Preview: capture + effects → the panel's preview canvas (non-destructive). This used to call createEffectedText
   * and drop the texture — nothing showed it and nothing freed it, one GPU texture per ▶ frame (audit 2026-10-09).
   * The engine's preview call frees its textures; an older Salsa without it gets no preview (and no leak).
   * One render in flight at a time: a call while busy re-renders once when it lands (the ▶ loop just skips frames).
   */
  previewTextEffect(): void {
    const sm = this.shapeManager as unknown as BalloonEngineExtras | null;
    const canvas = this.fxPreviewCanvas?.nativeElement;
    if (typeof sm?.previewEffectedTextToCanvas !== 'function' || !canvas) return;
    if (this._previewBusy) { this._previewAgain = true; return; }
    this._previewBusy = true;
    this._previewAgain = false;
    sm.previewEffectedTextToCanvas(canvas, this._buildTextCaptureConfig(), this._buildEffectChain())
      .then(ok => { if (ok && !this.textEffectPreviewShown) this.ngZone.run(() => { this.textEffectPreviewShown = true; }); })
      .catch(() => { /* preview only — a failed frame is skipped */ })
      .finally(() => {
        this._previewBusy = false;
        if (this._previewAgain && !this.textEffectAnimating) this.previewTextEffect();
      });
  }

  /** Stamp the effected text onto the active raster layer at the viewport center. */
  async stampTextEffect(): Promise<void> {
    const sm = this.shapeManager;
    if (!sm.stampEffectedText) return;
    // Default to center of the canvas texture
    const canvasSize = sm.rasterLayerManager?.getCanvasSize() ?? { w: 1920, h: 1080 };
    const capture = this._buildTextCaptureConfig();
    // Estimate text size to center more accurately
    const estW = Math.min(capture.fontSize * capture.text.length * 0.6, canvasSize.w * 0.8);
    const estH = capture.fontSize * 1.4;
    const destX = Math.round((canvasSize.w - estW) / 2);
    const destY = Math.round((canvasSize.h - estH) / 2);
    await sm.stampEffectedText(destX, destY, capture, this._buildEffectChain() as any);
  }

  /** Toggle animated effects (wave/glitch time param). */
  toggleTextEffectAnimation(): void {
    this.textEffectAnimating = !this.textEffectAnimating;
    if (this.textEffectAnimating) {
      const animate = (t: number) => {
        if (!this.textEffectAnimating) return;
        for (const entry of this.textEffectChain) {
          if (entry.type === 'wave' || entry.type === 'glitch') {
            entry.params['time'] = t * 0.001;
          }
        }
        this.previewTextEffect();
        this._textEffectAnimFrame = requestAnimationFrame(animate);
      };
      // Engine preview only — outside Angular, so the animation no longer runs change detection every frame
      this.ngZone.runOutsideAngular(() => { this._textEffectAnimFrame = requestAnimationFrame(animate); });
    } else {
      if (this._textEffectAnimFrame != null) {
        cancelAnimationFrame(this._textEffectAnimFrame);
        this._textEffectAnimFrame = null;
      }
    }
  }

  applyBalloonPreset(preset: BalloonPreset): void {
    this.balloonStyle = preset.style as any;
    this.balloonTailSide = preset.tailSide as any;
    this.balloonTailPosition = preset.tailPosition;
    this.balloonShowTail = preset.showTail;
    if (preset.fontSize != null) this.balloonFontSize = preset.fontSize;
    if (preset.strokeWidth != null) this.balloonStrokeWidth = preset.strokeWidth;
    if (preset.fillColor != null) this.balloonFillColor = preset.fillColor;
    // Apply to selected balloon if one exists
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      this.onBalloonStyleChange(this.balloonStyle);
      this.onBalloonTailSideChange(this.balloonTailSide);
      this.onBalloonShowTailChange(this.balloonShowTail);
      this.onBalloonFontSizeChange(this.balloonFontSize);
      this.onBalloonFillColorChange(this.balloonFillColor);
    }
  }

  onBalloonStrokeWidthChange(width: number): void {
    this.balloonStrokeWidth = +width;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      const balloon = this.shapeManager.getSpeechBalloon(sel[0]);
      if (balloon) balloon.balloonStrokeWidth = +width;
    }
  }

  onBalloonTailLengthChange(length: number): void {
    this.balloonTailLength = +length;
    const sel = this.shapeManager.getSelectedShapeIds();
    if (sel?.length === 1) {
      const balloon = this.shapeManager.getSpeechBalloon(sel[0]);
      balloon?.setTailLength?.(+length);
    }
  }
}
