import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { CharacterPanelComponent } from './character-panel.component';

/** What CharClothingService reads / writes on the panel. */
export type CharClothingHost = Pick<CharacterPanelComponent,
  'shapeManager' | 'dirty' | 'scene3dEditCharBodyId'
>;

/**
 * Character clothing: top / bottom / shoes / socks + undershirt / underpants params and presets, patterns, erase style, skirt swing, hide-body, bake / remove.
 * Panel-scoped (provided by CharacterPanelComponent, bound in its constructor). Bodies moved verbatim from
 * character-panel.component (audit Phase 5.5).
 */
@Injectable()
export class CharClothingService implements OnDestroy {
  private host!: CharClothingHost;
  bind(host: CharClothingHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    clearTimeout(this._clothingParamTopTimer);
    clearTimeout(this._clothingParamBottomTimer);
    clearTimeout(this._clothingParamShoesTimer);
    clearTimeout(this._clothingParamSocksTimer);
    clearTimeout(this._clothingParamUndershirtTimer);
    clearTimeout(this._clothingParamUnderpantsTimer);
  }

  scene3dEraseStyle: 'burn' | 'clean' | 'cutout' = 'burn';

  scene3dTopParams: any = null;

  scene3dBottomParams: any = null;

  scene3dShoeParams: any = null;

  scene3dSockParams: any = null;

  scene3dClothingPattern: Record<string, { mode: string; colorHex: string; freq: number; angleDeg: number; scale: number }> = {};

  scene3dTopPresets: string[] = [];

  scene3dBottomPresets: string[] = [];

  scene3dShoePresets: string[] = [];

  scene3dSockPresets: string[] = [];

  scene3dTopPresetName = '';

  scene3dBottomPresetName = '';

  scene3dShoePresetName = '';

  scene3dSockPresetName = '';

  private _clothingParamTopTimer: any = null;

  private _clothingParamBottomTimer: any = null;

  private _clothingParamShoesTimer: any = null;

  private _clothingParamSocksTimer: any = null;

  private _clothingParamUndershirtTimer: any = null;

  private _clothingParamUnderpantsTimer: any = null;

  scene3dUndershirtParams: any = null;

  scene3dUnderpantsParams: any = null;

  scene3dUndershirtPresets: string[] = [];

  scene3dUnderpantsPresets: string[] = [];

  scene3dUndershirtPresetName = '';

  scene3dUnderpantsPresetName = '';

  scene3dTopTab: 'top' | 'undershirt' = 'top';

  scene3dBottomTab: 'bottom' | 'underpants' = 'bottom';

  /** The pattern controls of one clothing slot from its current params (pattern lives in params.pattern). */
  _syncClothingPatternFromParams(slot: string): void {
    const p = this._getClothingParamsBySlot(slot)?.pattern;
    if (p?.mode) {
      this.scene3dClothingPattern[slot] = {
        mode: p.mode,
        colorHex: typeof p.secondaryColor === 'string' ? p.secondaryColor : '#333333',
        freq: p.freq ?? 10,
        angleDeg: Math.round((p.angle ?? 0) * 180 / Math.PI),
        scale: p.scale ?? 0.5,
      };
    } else {
      this.scene3dClothingPattern[slot] = { mode: '', colorHex: '#333333', freq: 10, angleDeg: 0, scale: 0.5 };
    }
  }

  readonly scene3dPatternPresets = ['Pinstripe', 'Stripes', 'Diagonal', 'Polka Dots', 'Micro Dots', 'Argyle', 'Harlequin', 'Checkerboard', 'Gingham', 'Grid', 'Graph'];

  private _getClothingParamsBySlot(slot: string): any {
    if (slot === 'top') return this.scene3dTopParams;
    if (slot === 'bottom') return this.scene3dBottomParams;
    if (slot === 'shoes') return this.scene3dShoeParams;
    if (slot === 'socks') return this.scene3dSockParams;
    if (slot === 'undershirt') return this.scene3dUndershirtParams;
    if (slot === 'underpants') return this.scene3dUnderpantsParams;
    return null;
  }

  scene3dApplyPatternPreset(slot: string, presetName: string): void {
    if (!presetName) return;
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    const params = this._getClothingParamsBySlot(slot);
    if (!params) return;
    const preset = sm.clothingPatternPreset3D(presetName);
    if (!preset) return;
    params.pattern = preset;
    this.scene3dClothingPattern[slot] = {
      mode: preset.mode ?? '',
      colorHex: typeof preset.secondaryColor === 'string' ? preset.secondaryColor : '#333333',
      freq: preset.freq ?? 10,
      angleDeg: Math.round((preset.angle ?? 0) * 180 / Math.PI),
      scale: preset.scale ?? 0.5,
    };
    this.scene3dClothingParamChanged(slot as any);
    this.host.dirty.emit();
  }

  scene3dApplyClothingPattern(slot: string): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    const p = this.scene3dClothingPattern[slot];
    if (!p) return;
    const params = this._getClothingParamsBySlot(slot);
    if (!params) return;
    if (!p.mode) {
      params.pattern = undefined;
    } else {
      params.pattern = {
        mode: p.mode,
        secondaryColor: p.colorHex,
        freq: p.freq,
        angle: p.angleDeg * Math.PI / 180,
        scale: p.scale,
        spacing: 0,
      };
    }
    this.scene3dClothingParamChanged(slot as any);
    this.host.dirty.emit();
  }

  scene3dInitClothing(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants'): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    if (slot === 'top') {
      this.scene3dTopPresets = sm.getClothingPresetNames3D('top') ?? [];
      const existing = sm.getClothingParams3D(id, 'top');
      this.scene3dTopParams = existing ?? { ...(sm.getDefaultClothingParams3D('top') ?? { slot: 'top' }), hemHeight: 0.65, gradient: true, trimWidth: 0.50, baseColor: '#419041', trimColor: '#315e31' };
      sm.setClothingParams3D(id, this.scene3dTopParams);
    } else if (slot === 'bottom') {
      this.scene3dBottomPresets = sm.getClothingPresetNames3D('bottom') ?? [];
      const existing = sm.getClothingParams3D(id, 'bottom');
      this.scene3dBottomParams = existing ?? { ...(sm.getDefaultClothingParams3D('bottom') ?? { slot: 'bottom' }), bottomStyle: 'pants', waistWidth: 0.32, waistHeight: 0.50, length: 1.00, gradient: true, trimWidth: 0.50, baseColor: '#404763', trimColor: '#030407' };
      sm.setClothingParams3D(id, this.scene3dBottomParams);
    } else if (slot === 'shoes') {
      this.scene3dShoePresets = sm.getClothingPresetNames3D('shoes') ?? [];
      const existing = sm.getClothingParams3D(id, 'shoes');
      this.scene3dShoeParams = existing ?? (sm.getDefaultClothingParams3D('shoes') ?? { slot: 'shoes' });
      sm.setClothingParams3D(id, this.scene3dShoeParams);
    } else if (slot === 'socks') {
      this.scene3dSockPresets = sm.getClothingPresetNames3D('socks') ?? [];
      const existing = sm.getClothingParams3D(id, 'socks');
      this.scene3dSockParams = existing ?? (sm.getDefaultClothingParams3D('socks') ?? { slot: 'socks' });
      sm.setClothingParams3D(id, this.scene3dSockParams);
    } else if (slot === 'undershirt') {
      this.scene3dUndershirtPresets = sm.getClothingPresetNames3D('undershirt') ?? [];
      const existing = sm.getClothingParams3D(id, 'undershirt');
      this.scene3dUndershirtParams = existing ?? (sm.getDefaultClothingParams3D('undershirt') ?? { slot: 'undershirt' });
      sm.setClothingParams3D(id, this.scene3dUndershirtParams);
      const p = this.scene3dUndershirtParams?.pattern;
      this.scene3dClothingPattern['undershirt'] = p?.mode
        ? { mode: p.mode, colorHex: typeof p.secondaryColor === 'string' ? p.secondaryColor : '#f5e6d3', freq: p.freq ?? 12, angleDeg: Math.round((p.angle ?? 0) * 180 / Math.PI), scale: p.scale ?? 0.4 }
        : { mode: '', colorHex: '#f5e6d3', freq: 12, angleDeg: 0, scale: 0.4 };
    } else {
      this.scene3dUnderpantsPresets = sm.getClothingPresetNames3D('underpants') ?? [];
      const existing = sm.getClothingParams3D(id, 'underpants');
      this.scene3dUnderpantsParams = existing ?? (sm.getDefaultClothingParams3D('underpants') ?? { slot: 'underpants' });
      sm.setClothingParams3D(id, this.scene3dUnderpantsParams);
      const p = this.scene3dUnderpantsParams?.pattern;
      this.scene3dClothingPattern['underpants'] = p?.mode
        ? { mode: p.mode, colorHex: typeof p.secondaryColor === 'string' ? p.secondaryColor : '#f5e6d3', freq: p.freq ?? 8, angleDeg: Math.round((p.angle ?? 0) * 180 / Math.PI), scale: p.scale ?? 0.5 }
        : { mode: '', colorHex: '#f5e6d3', freq: 8, angleDeg: 0, scale: 0.5 };
    }
  }

  scene3dClothingParamChanged(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants'): void {
    if (slot === 'top') {
      clearTimeout(this._clothingParamTopTimer);
      this._clothingParamTopTimer = setTimeout(() => {
        const sm = this.shapeManager;
        const id = this.host.scene3dEditCharBodyId;
        if (!id || !this.scene3dTopParams) return;
        sm.setClothingParams3D(id, this.scene3dTopParams);
      }, 10);
    } else if (slot === 'bottom') {
      clearTimeout(this._clothingParamBottomTimer);
      this._clothingParamBottomTimer = setTimeout(() => {
        const sm = this.shapeManager;
        const id = this.host.scene3dEditCharBodyId;
        if (!id || !this.scene3dBottomParams) return;
        sm.setClothingParams3D(id, this.scene3dBottomParams);
      }, 10);
    } else if (slot === 'shoes') {
      clearTimeout(this._clothingParamShoesTimer);
      this._clothingParamShoesTimer = setTimeout(() => {
        const sm = this.shapeManager;
        const id = this.host.scene3dEditCharBodyId;
        if (!id || !this.scene3dShoeParams) return;
        sm.setClothingParams3D(id, this.scene3dShoeParams);
      }, 10);
    } else if (slot === 'socks') {
      clearTimeout(this._clothingParamSocksTimer);
      this._clothingParamSocksTimer = setTimeout(() => {
        const sm = this.shapeManager;
        const id = this.host.scene3dEditCharBodyId;
        if (!id || !this.scene3dSockParams) return;
        sm.setClothingParams3D(id, this.scene3dSockParams);
      }, 10);
    } else if (slot === 'undershirt') {
      clearTimeout(this._clothingParamUndershirtTimer);
      this._clothingParamUndershirtTimer = setTimeout(() => {
        const sm = this.shapeManager;
        const id = this.host.scene3dEditCharBodyId;
        if (!id || !this.scene3dUndershirtParams) return;
        sm.setClothingParams3D(id, this.scene3dUndershirtParams);
      }, 10);
    } else {
      clearTimeout(this._clothingParamUnderpantsTimer);
      this._clothingParamUnderpantsTimer = setTimeout(() => {
        const sm = this.shapeManager;
        const id = this.host.scene3dEditCharBodyId;
        if (!id || !this.scene3dUnderpantsParams) return;
        sm.setClothingParams3D(id, this.scene3dUnderpantsParams);
      }, 10);
    }
  }

  /** Body-hiding mask on/off (Salsa getHideBodyUnderClothes3D / setHideBodyUnderClothes3D; persisted per garment). */
  scene3dHideBody = true;

  scene3dSetHideBody(on: boolean): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dHideBody = on;
    this.shapeManager.setHideBodyUnderClothes3D(id, on);
    // Keep the panel's own copies in step — a later slider change sends the whole params object back.
    for (const p of [this.scene3dTopParams, this.scene3dBottomParams, this.scene3dShoeParams, this.scene3dSockParams, this.scene3dUndershirtParams, this.scene3dUnderpantsParams]) {
      if (!p) continue;
      if (on) delete p.hideBody; else p.hideBody = false;
    }
    this.host.dirty.emit();
  }

  /** Skirt hem swing amount (Play): 0 off · 1 default · 1.5 (BottomParams.hemSwing). */
  get scene3dSkirtSwing(): number { return this.scene3dBottomParams?.hemSwing ?? 1; }

  scene3dSetSkirtSwing(v: number): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id || !this.scene3dBottomParams) return;
    this.scene3dBottomParams.hemSwing = v;
    this.shapeManager.setSkirtSwing3D(id, v);   // runtime only — no garment rebuild
    this.host.dirty.emit();
  }

  scene3dApplyClothingPreset(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants', name: string): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id || !name) return;
    const p = sm.getClothingPreset3D(slot, name);
    if (!p) return;
    if (slot === 'top') this.scene3dTopParams = p;
    else if (slot === 'bottom') this.scene3dBottomParams = p;
    else if (slot === 'shoes') this.scene3dShoeParams = p;
    else if (slot === 'socks') this.scene3dSockParams = p;
    else if (slot === 'undershirt') this.scene3dUndershirtParams = p;
    else this.scene3dUnderpantsParams = p;
    sm.setClothingParams3D(id, p);
    this._syncClothingPatternFromParams(slot);   // the pattern controls kept the previous garment's values
    this.host.dirty.emit();                            // (a preset change was never saved on its own)
  }

  scene3dRemoveClothing(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants'): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.removeClothing3D(id, slot);
    if (slot === 'top') this.scene3dTopParams = null;
    else if (slot === 'bottom') this.scene3dBottomParams = null;
    else if (slot === 'shoes') this.scene3dShoeParams = null;
    else if (slot === 'socks') this.scene3dSockParams = null;
    else if (slot === 'undershirt') this.scene3dUndershirtParams = null;
    else this.scene3dUnderpantsParams = null;
  }

  scene3dBakeClothing(slot: 'top' | 'bottom' | 'shoes' | 'socks' | 'undershirt' | 'underpants'): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    const label = slot === 'top' ? 'Top 1' : slot === 'bottom' ? 'Bottom 1' : slot === 'shoes' ? 'Shoes 1' : slot === 'undershirt' ? 'Undershirt 1' : slot === 'underpants' ? 'Underpants 1' : 'Socks 1';
    sm.bakeClothingToPart3D(id, slot, label);
  }

  scene3dSetEraseStyle(style: 'burn' | 'clean' | 'cutout'): void {
    this.scene3dEraseStyle = style;
    this.shapeManager.setGarmentEraseStyle3D(style);
  }
}
