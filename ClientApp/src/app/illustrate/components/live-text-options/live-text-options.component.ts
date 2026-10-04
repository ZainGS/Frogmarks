import { Component, Input } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { fxColorToHex, fxHexToColor, hexToRgba01Obj, rgba01ObjToHex } from '../../utils/color-utils';
import { TextEffectType, TextEffectEntry, TextEffectPreset, TEXT_EFFECT_TYPE_OPTIONS, createEffectEntry, createDefaultParams, ShaderSnippet, SHADER_SNIPPETS } from 'app/illustrate/models/text-effect.model';

/** Live Text tool options (font, layout, colours, background, effect chain, flatten) and the custom text shader.
 *  Always mounted — the settings survive tool switches; the content shows while [active]. The editor calls
 *  activate() / deactivate() from setActiveTool, beginEditAt() on double-click, endLiveTextEditing() on Esc.
 *  Extracted from illustration.component (refactor-plan 2.10e). */
@Component({
  selector: 'app-live-text-options',
  templateUrl: './live-text-options.component.html',
  styleUrls: ['./live-text-options.component.scss'],
})
export class LiveTextOptionsComponent {
  @Input() shapeManager: ShapeManager = null;
  @Input() active = false;
  @Input() availableFonts: string[] = [];
  readonly textEffectTypeOptions = TEXT_EFFECT_TYPE_OPTIONS;
  fxColorToHex(color: number[] | undefined | null): string { return fxColorToHex(color); }
  fxHexToColor(hex: string, existingAlpha = 1): [number, number, number, number] { return fxHexToColor(hex, existingAlpha); }

  /** The tool became active: rect-drag creates a live text node, a click on one edits it. */
  activate(): void {
    this.hasHtmlInCanvas = !!this.shapeManager.isHtmlInCanvasAvailable();
    this.shapeManager.setRectDrawCallback((rect: any, clientX: number, clientY: number) => {
      const sm = this.shapeManager;
      if (this.liveTextIsEditing) {
        this.endLiveTextEditing();
        return;
      }
      const DRAG_MIN = 0.02;
      const isClick = rect.w < DRAG_MIN && rect.h < DRAG_MIN;
      if (isClick) {
        const selectedIds = this._getSelectedShapeIds();
        const hitNodeId = selectedIds.length === 1 ? selectedIds[0] : null;
        const hitNode = hitNodeId ? sm.getLiveTextNode(hitNodeId) : null;
        if (hitNode) {
          this.liveTextNodeId = hitNodeId;
          this._syncLiveTextSidebar(hitNodeId!);
          sm.enterLiveTextEditingAt(hitNodeId, clientX, clientY);
          this.liveTextIsEditing = true;
          return;
        }
      }
      const node = isClick
        ? sm.createLiveText(rect.x + rect.w / 2, rect.y + rect.h / 2, this._buildLiveTextOptions())
        : sm.createLiveTextInRect(rect, this._buildLiveTextOptions());
      if (node) {
        this.liveTextNodeId = node.id;
        sm.enterLiveTextEditingAt(this.liveTextNodeId, clientX, clientY);
        this.liveTextIsEditing = true;
      }
    });
  }

  /** The tool was left. */
  deactivate(): void {
    this.shapeManager.setRectDrawCallback(null);
    if (this.liveTextIsEditing) this.endLiveTextEditing();
  }

  /** Start editing an existing live text node at a screen point (double-click on the canvas). */
  beginEditAt(nodeId: string, clientX: number, clientY: number): void {
    this.liveTextNodeId = nodeId;
    this._syncLiveTextSidebar(nodeId);
    this.shapeManager.enterLiveTextEditingAt(nodeId, clientX, clientY);
    this.liveTextIsEditing = true;
  }

  private _getSelectedShapeIds(): string[] {
    const is = this.shapeManager.interactionService;
    if (is?.selectedNodes?.size) {
      return Array.from(is.selectedNodes).map((n: any) => n.id ?? n.getId?.()).filter(Boolean);
    }
    return this.shapeManager.getSelectedShapeIds() ?? [];
  }

  liveTextNodeId: string | null = null;

  liveTextText: string = '';

  liveTextFont: string = 'Arial';

  liveTextFontSize: number = 48;

  liveTextBold: boolean = false;

  liveTextItalic: boolean = false;

  liveTextWritingMode: 'horizontal-tb' | 'vertical-rl' = 'horizontal-tb';

  liveTextColor: string = '#ffffff';

  liveTextMaxWidth: number = 0;

  liveTextPadding: number = 16;

  liveTextArcAngle: number = 0;

  liveTextEffectChain: TextEffectEntry[] = [];

  liveTextIsEditing: boolean = false;

  liveTextAlign: 'left' | 'center' | 'right' = 'left';

  liveTextBgColor: string = '#ffffff';

  liveTextBgAlpha: number = 0;

  hasHtmlInCanvas: boolean = false;

  shaderSnippets = SHADER_SNIPPETS;

  customShaderCode: string = '';

  customShaderAdvanced: boolean = false;

  customShaderStatus: string = '';

  customShaderStatusType: 'success' | 'error' | '' = '';

  customShaderParamA: number = 0;

  customShaderParamB: number = 0;

  customShaderParamC: number = 0;

  customShaderParamD: number = 0;

  customShaderParamCount: number = 1;

  /** Place a LiveTextNode at the given world position. */
  placeLiveText(worldX: number, worldY: number): void {
    const sm = this.shapeManager;
    if (!sm.createLiveText) return;
    const node = sm.createLiveText(worldX, worldY, this._buildLiveTextOptions());
    if (node) {
      this.liveTextNodeId = node.id;
      sm.beginLiveTextEditing(this.liveTextNodeId);
      this.liveTextIsEditing = true;
    }
  }

  _buildLiveTextOptions(): Record<string, any> {
    const h = this.liveTextColor.replace('#', '');
    return {
      text: '',
      font: this.liveTextFont,
      fontSize: this.liveTextFontSize,
      color: {
        r: parseInt(h.substring(0, 2), 16) / 255,
        g: parseInt(h.substring(2, 4), 16) / 255,
        b: parseInt(h.substring(4, 6), 16) / 255,
        a: 1,
      },
      bold: this.liveTextBold,
      italic: this.liveTextItalic,
      writingMode: this.liveTextWritingMode,
      padding: this.liveTextPadding,
      align: this.liveTextAlign,
      arcAngle: this.liveTextArcAngle,
      backgroundColor: this._liveTextBgRgba(),
      effects: this._buildLiveTextEffects(),
    };
  }

  _liveTextBgRgba(): { r: number; g: number; b: number; a: number } | null {
    if (this.liveTextBgAlpha === 0) return null;
    const h = this.liveTextBgColor.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255,
      a: this.liveTextBgAlpha,
    };
  }

  onLiveTextBgChange(): void {
    const sm = this.shapeManager;
    if (!this.liveTextNodeId || !sm.setLiveTextStyle) return;
    sm.setLiveTextStyle(this.liveTextNodeId, { backgroundColor: this._liveTextBgRgba() });
  }

  onLiveTextAlignChange(align: 'left' | 'center' | 'right'): void {
    this.liveTextAlign = align;
    const sm = this.shapeManager;
    if (!this.liveTextNodeId || !sm.setLiveTextStyle) return;
    sm.setLiveTextStyle(this.liveTextNodeId, { align });
  }

  _buildLiveTextEffects(): { type: string; params: Record<string, any> }[] {
    return this.liveTextEffectChain.map(e => ({ type: e.type, params: { ...e.params } }));
  }

  onLiveTextStyleChange(field: string, value: any): void {
    const sm = this.shapeManager;
    if (!this.liveTextNodeId || !sm.setLiveTextStyle) return;
    if (field === 'color') {
      sm.setLiveTextStyle(this.liveTextNodeId, { color: hexToRgba01Obj(value) });
    } else {
      sm.setLiveTextStyle(this.liveTextNodeId, { [field]: value });
    }
  }

  endLiveTextEditing(): void {
    const sm = this.shapeManager;
    if (this.liveTextNodeId && sm.endLiveTextEditing) {
      sm.endLiveTextEditing(this.liveTextNodeId);
    }
    this.liveTextIsEditing = false;
  }

  async flattenLiveText(): Promise<void> {
    const sm = this.shapeManager;
    if (!this.liveTextNodeId || !sm.flattenLiveText) return;
    const success = await sm.flattenLiveText(this.liveTextNodeId);
    if (success) {
      this.liveTextNodeId = null;
      this.liveTextIsEditing = false;
    }
  }

  // Live text effect chain management
  addLiveTextEffect(type?: TextEffectType): void {
    const entry = createEffectEntry(type ?? 'outline');
    this.liveTextEffectChain = [...this.liveTextEffectChain, entry];
    this._pushLiveTextEffects();
  }

  removeLiveTextEffect(id: number): void {
    this.liveTextEffectChain = this.liveTextEffectChain.filter(e => e.id !== id);
    this._pushLiveTextEffects();
  }

  moveLiveTextEffect(id: number, direction: -1 | 1): void {
    const idx = this.liveTextEffectChain.findIndex(e => e.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= this.liveTextEffectChain.length) return;
    const chain = [...this.liveTextEffectChain];
    [chain[idx], chain[target]] = [chain[target], chain[idx]];
    this.liveTextEffectChain = chain;
    this._pushLiveTextEffects();
  }

  onLiveTextEffectTypeChange(entry: TextEffectEntry, type: TextEffectType): void {
    entry.type = type;
    entry.params = createDefaultParams(type);
    this.liveTextEffectChain = [...this.liveTextEffectChain];
    this._pushLiveTextEffects();
  }

  onLiveTextEffectParamChange(entry: TextEffectEntry, key: string, value: any): void {
    entry.params[key] = value;
    this._pushLiveTextEffects();
  }

  applyLiveTextEffectPreset(preset: TextEffectPreset): void {
    let nextId = Date.now();
    this.liveTextEffectChain = preset.effects.map(e => ({
      id: nextId++,
      type: e.type,
      params: { ...e.params },
    }));
    this._pushLiveTextEffects();
  }

  _pushLiveTextEffects(): void {
    const sm = this.shapeManager;
    if (this.liveTextNodeId && sm.setLiveTextEffects) {
      sm.setLiveTextEffects(this.liveTextNodeId, this._buildLiveTextEffects() as any);
    }
  }

  /** Populate sidebar from a selected LiveTextNode. */
  _syncLiveTextSidebar(nodeId: string): void {
    const sm = this.shapeManager;
    const node = sm.getLiveTextNode(nodeId);
    if (!node) return;
    this.liveTextNodeId = nodeId;
    this.liveTextFont = node.font ?? 'Arial';
    this.liveTextFontSize = node.fontSize ?? 48;
    this.liveTextBold = node.bold ?? false;
    this.liveTextItalic = node.italic ?? false;
    this.liveTextWritingMode = node.writingMode ?? 'horizontal-tb';
    this.liveTextPadding = node.padding ?? 16;
    this.liveTextAlign = node.align ?? 'left';
    this.liveTextArcAngle = node.arcAngle ?? 0;
    if (node.textColor) this.liveTextColor = rgba01ObjToHex(node.textColor);
    if (node.maxWidth != null) this.liveTextMaxWidth = node.maxWidth;
    if (node.backgroundColor) {
      this.liveTextBgColor = rgba01ObjToHex(node.backgroundColor);
      this.liveTextBgAlpha = node.backgroundColor.a ?? 0;
    } else {
      this.liveTextBgColor = '#ffffff';
      this.liveTextBgAlpha = 0;
    }
    // Sync effects
    const effects = node.effects;
    if (effects?.length) {
      let nextId = Date.now();
      this.liveTextEffectChain = effects.map((e: any) => ({
        id: nextId++,
        type: e.type,
        params: { ...e.params },
      }));
    } else {
      this.liveTextEffectChain = [];
    }
  }

  async validateCustomShader(): Promise<void> {
    const sm = this.shapeManager;
    if (!sm.validateCustomShader) return;
    const result = await sm.validateCustomShader(this.customShaderCode, this.customShaderAdvanced);
    if (result.success) {
      this.customShaderStatus = 'Compiled successfully';
      this.customShaderStatusType = 'success';
    } else {
      this.customShaderStatus = (result.errors ?? ['Unknown error']).join('\n');
      this.customShaderStatusType = 'error';
    }
  }

  async applyCustomShader(): Promise<void> {
    const sm = this.shapeManager;
    if (!this.liveTextNodeId || !sm.setCustomShader) return;
    const params: [number, number, number, number] = [
      this.customShaderParamA, this.customShaderParamB,
      this.customShaderParamC, this.customShaderParamD,
    ];
    const result = await sm.setCustomShader(
      this.liveTextNodeId, this.customShaderCode, this.customShaderAdvanced, params,
    );
    if (result.success) {
      this.customShaderStatus = 'Shader applied';
      this.customShaderStatusType = 'success';
    } else {
      this.customShaderStatus = (result.errors ?? ['Unknown error']).join('\n');
      this.customShaderStatusType = 'error';
    }
  }

  removeCustomShader(): void {
    const sm = this.shapeManager;
    if (this.liveTextNodeId && sm.removeCustomShader) {
      sm.removeCustomShader(this.liveTextNodeId);
    }
    this.customShaderStatus = '';
    this.customShaderStatusType = '';
    this.customShaderParamA = 0;
    this.customShaderParamB = 0;
    this.customShaderParamC = 0;
    this.customShaderParamD = 0;
    this.customShaderParamCount = 1;
  }

  onCustomShaderParamChange(): void {
    const sm = this.shapeManager;
    if (!this.liveTextNodeId || !sm.setCustomShaderParams) return;
    sm.setCustomShaderParams(this.liveTextNodeId, [
      this.customShaderParamA, this.customShaderParamB,
      this.customShaderParamC, this.customShaderParamD,
    ]);
  }

  loadShaderSnippet(snippet: ShaderSnippet): void {
    this.customShaderCode = snippet.code;
    this.customShaderAdvanced = false;
    [this.customShaderParamA, this.customShaderParamB,
     this.customShaderParamC, this.customShaderParamD] = snippet.params;
  }
}
