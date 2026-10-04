import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { CharacterPanelComponent } from './character-panel.component';
import { HAIR_PARAM_DEFAULTS } from '../../utils/character-randomizer';

const HAIR_FRINGE_STYLES: { value: string; label: string }[] = [
  { value: 'straight', label: 'Straight' }, { value: 'swept', label: 'Side-swept' }, { value: 'parted', label: 'Parted' },
  { value: 'choppy', label: 'Choppy' }, { value: 'none', label: 'None (slicked back)' },
];
const HAIR_STYLE_FALLBACK: { name: string; label: string }[] = [];
const HAIR_TAIL_FORMS: { value: string; label: string }[] = [
  { value: 'bundle', label: 'Bundle of locks' }, { value: 'braid', label: 'Braid' }, { value: 'drill', label: 'Drill curl' },
];
const HAIR_TAIL_STYLES: { value: string; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'pony', label: 'Ponytail' }, { value: 'twin', label: 'Twintails' }, { value: 'pig', label: 'Low twin' },
];

/** What CharHairService reads / writes on the panel. */
export type CharHairHost = Pick<CharacterPanelComponent,
  'shapeManager' | 'scene3dEditCharBodyId'
>;

/**
 * Character hair: params + style presets, mode switch, vary / bake / remove. (The per-mode control table and its helpers stay in character-panel.component.ts: Salsa's hair-control-modes test reads them from there.)
 * Panel-scoped (provided by CharacterPanelComponent, bound in its constructor). Bodies moved verbatim from
 * character-panel.component (audit Phase 5.5).
 */
@Injectable()
export class CharHairService implements OnDestroy {
  private host!: CharHairHost;
  bind(host: CharHairHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    clearTimeout(this._hairParamTimer);
  }

  // Hair
  scene3dHairParams: any = null;

  private _hairParamTimer: any = null;

  scene3dBakeHair(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.bakeHairToPart3D(id, 'Hair');
  }

  scene3dInitHair(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    const existing = sm.getHairParams3D(id);
    const base = sm.getDefaultHairParams3D() ?? {};
    // New hair = an anime lock style when the engine has them (hair-styles.md); older engines keep the classic defaults.
    const styled = existing ? null : sm.getHairStylePreset3D('long-straight', Math.floor(Math.random() * 10000));
    this.scene3dHairParams = existing ?? styled ?? { ...base, ...HAIR_PARAM_DEFAULTS };
    sm.setHairParams3D(id, this.scene3dHairParams);
    this._refreshHairStyles();
  }

  /** Cached for *ngFor: [{ name, label }] from sm.getHairStyles3D() (a plain field, refreshed by _refreshHairStyles()
   *  when a character / its hair is loaded, so change detection never rebuilds the array). */
  scene3dHairStyles: { name: string; label: string }[] = HAIR_STYLE_FALLBACK;

  _refreshHairStyles(): void {
    const list = this.shapeManager?.getHairStyles3D();
    if (Array.isArray(list) && list.length) this.scene3dHairStyles = list;
  }

  readonly hairFringeStyles = HAIR_FRINGE_STYLES;

  readonly hairTailStyles = HAIR_TAIL_STYLES;

  readonly hairTailForms = HAIR_TAIL_FORMS;

  /** Load a style preset onto the edited body's hair (keeps its colours) and re-sync the sliders. */
  scene3dApplyHairStyle(name: string): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id || !name) return;
    const ok = sm?.applyHairStyle3D(id, name, true);
    if (!ok) return;
    const p = sm?.getHairParams3D(id);
    if (p) this.scene3dHairParams = p;
  }

  /** Re-roll the per-lock variation (same style). */
  scene3dVaryHairStyle(): void {
    if (!this.scene3dHairParams) return;
    this.scene3dHairParams = { ...this.scene3dHairParams, lockSeed: Math.floor(Math.random() * 10000) };
    this.scene3dHairParamChanged();
  }

  scene3dSetHairMode(mode: 'chunky' | 'cards' | 'locks'): void {
    if (!this.scene3dHairParams) return;
    if (mode === 'locks' && this.scene3dHairParams.hairMode !== 'locks') {
      this.scene3dApplyHairStyle(this.scene3dHairParams.hairStyle || 'long-straight');
      return;
    }
    this.scene3dHairParams = { ...this.scene3dHairParams, hairMode: mode, ...(mode === 'cards' ? { cardifyCap: true } : {}) };
    this.scene3dHairParamChanged();
  }

  scene3dHairParamChanged(): void {
    clearTimeout(this._hairParamTimer);
    this._hairParamTimer = setTimeout(() => {
      const sm = this.shapeManager;
      const id = this.host.scene3dEditCharBodyId;
      if (!id || !this.scene3dHairParams) return;
      sm.setHairParams3D(id, this.scene3dHairParams);
    }, 10);
  }

  scene3dRemoveHair(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.removeHair3D(id);
    this.scene3dHairParams = null;
  }
}
