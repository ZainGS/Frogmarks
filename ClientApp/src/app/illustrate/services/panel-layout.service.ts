import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { hexToRgba01Obj } from '../utils/color-utils';
import { PanelTemplate, PANEL_TEMPLATE_OPTIONS, PAGE_SIZE_PRESETS, DEFAULT_PANEL_LAYOUT_OPTIONS } from 'app/illustrate/models/panel-layout.model';

/** What PanelLayoutService needs from the editor that hosts it. */
export interface PanelLayoutHost {
  shapeManager(): ShapeManager;
}

/**
 * Comic panel layout: page size / template / gutter / bleed / border, Create, and the bleed + gutter guide overlay
 * state (read by the board-shell SVG and the Ctrl+\ / Ctrl+; hotkeys). Component-scoped (provided by
 * IllustrationComponent). Extracted from illustration.component (refactor-plan 2.10f).
 */
@Injectable()
export class PanelLayoutService {
  private host!: PanelLayoutHost;
  bind(host: PanelLayoutHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager(); }

  panelTemplateOptions = PANEL_TEMPLATE_OPTIONS;

  pageSizePresets = PAGE_SIZE_PRESETS;

  panelTemplate: PanelTemplate = DEFAULT_PANEL_LAYOUT_OPTIONS.template;

  panelPageSizeIndex: number = 0; // index into PAGE_SIZE_PRESETS

  panelGutterWidth: number = DEFAULT_PANEL_LAYOUT_OPTIONS.gutterWidth;

  panelBleedMargin: number = DEFAULT_PANEL_LAYOUT_OPTIONS.bleedMargin;

  panelBorderWidth: number = DEFAULT_PANEL_LAYOUT_OPTIONS.borderWidth;

  panelBorderColor: string = '#000000';

  panelBackgroundColor: string = '#ffffff';

  panelShowBleedGuides: boolean = DEFAULT_PANEL_LAYOUT_OPTIONS.showBleedGuides;

  panelShowGutterGuides: boolean = DEFAULT_PANEL_LAYOUT_OPTIONS.showGutterGuides;

  activePanelLayoutId: string | null = null;

  bleedGuideRect: { x: number; y: number; w: number; h: number } | null = null;

  gutterGuideLines: { horizontal: number[]; vertical: number[] } | null = null;

  onPanelTemplateChange(template: PanelTemplate): void {
    this.panelTemplate = template;
    if (this.activePanelLayoutId) {
      this.shapeManager.applyPanelTemplate(this.activePanelLayoutId, template);
    }
  }

  onPanelPageSizeChange(index: number): void {
    this.panelPageSizeIndex = +index;
  }

  onPanelGutterWidthChange(v: number): void {
    this.panelGutterWidth = +v;
    if (this.activePanelLayoutId) {
      this.shapeManager.setPanelGutter(this.activePanelLayoutId, this.panelGutterWidth);
      this._refreshPanelGuides();
    }
  }

  onPanelBleedMarginChange(v: number): void {
    this.panelBleedMargin = +v;
    if (this.activePanelLayoutId) {
      this.shapeManager.setPanelBleed(this.activePanelLayoutId, this.panelBleedMargin);
      this._refreshPanelGuides();
    }
  }

  onPanelBorderWidthChange(v: number): void {
    this.panelBorderWidth = +v;
  }

  onPanelShowBleedGuidesChange(show: boolean): void {
    this.panelShowBleedGuides = show;
    this._refreshPanelGuides();
  }

  onPanelShowGutterGuidesChange(show: boolean): void {
    this.panelShowGutterGuides = show;
    this._refreshPanelGuides();
  }

  /** Create a panel layout fitted to the illustration bounds */
  createPanelLayout(): void {
    const sm = this.shapeManager;
    // Prefer the illustration-aware API that auto-fits to the canvas bounds
    const useFit = typeof sm.createPanelLayoutForIllustration === 'function';
    let layout: any;
    if (useFit) {
      layout = sm.createPanelLayoutForIllustration({
        template: this.panelTemplate,
        gutterWidth: this.panelGutterWidth,
        bleedMargin: this.panelBleedMargin,
        borderWidth: this.panelBorderWidth,
        borderColor: hexToRgba01Obj(this.panelBorderColor),
        backgroundColor: hexToRgba01Obj(this.panelBackgroundColor),
      });
    } else if (sm.createPanelLayout) {
      // Fallback: manual positioning from page-size presets
      const ps = PAGE_SIZE_PRESETS[this.panelPageSizeIndex];
      layout = sm.createPanelLayout(0, 0, ps.width, ps.height, {
        template: this.panelTemplate,
        gutterWidth: this.panelGutterWidth,
        bleedMargin: this.panelBleedMargin,
        borderWidth: this.panelBorderWidth,
        borderColor: hexToRgba01Obj(this.panelBorderColor),
        backgroundColor: hexToRgba01Obj(this.panelBackgroundColor),
      });
    }
    this.activePanelLayoutId = layout?.getId?.() ?? null;
    this._refreshPanelGuides();
  }

  /** Refresh bleed/gutter guide geometry from the engine. */
  _refreshPanelGuides(): void {
    const sm = this.shapeManager;
    if (!this.activePanelLayoutId) {
      this.bleedGuideRect = null;
      this.gutterGuideLines = null;
      return;
    }
    if (this.panelShowBleedGuides && sm.getPanelBleedGuide) {
      this.bleedGuideRect = sm.getPanelBleedGuide(this.activePanelLayoutId) ?? null;
    } else {
      this.bleedGuideRect = null;
    }
    if (this.panelShowGutterGuides && sm.getPanelGutterGuides) {
      this.gutterGuideLines = sm.getPanelGutterGuides(this.activePanelLayoutId) ?? null;
    } else {
      this.gutterGuideLines = null;
    }
  }
}
