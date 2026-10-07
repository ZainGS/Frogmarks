import { Injectable, NgZone, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { CharacterPanelComponent } from './character-panel.component';
import { hexToRgba01 } from '../../utils/color-utils';

/** What CharLookService reads / writes on the panel. */
export type CharLookHost = Pick<CharacterPanelComponent,
  'shapeManager' | 'dirty' | 'scene3dEditCharBodyId' | 'sketchPaperSynced'
>;

/**
 * Character look: body shape, scale + fit, skin tone + shading (soft light / ramp), render style, toon shadows + rim light, matte, retro colour, outlines, squash & stretch, leg idle, face normals.
 * Panel-scoped (provided by CharacterPanelComponent, bound in its constructor). Bodies moved verbatim from
 * character-panel.component (audit Phase 5.5).
 */
@Injectable()
export class CharLookService implements OnDestroy {
  private host!: CharLookHost;
  constructor(private zone: NgZone) {}
  bind(host: CharLookHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    clearTimeout(this._bodyParamTimer);
  }

  // Body shape + skin tone (live editing of existing character)
  scene3dBodyParams: any = null;

  scene3dSkinTone = '#f5c5a3';

  private _bodyParamTimer: any = null;

  charRenderStyle = 'cel';

  scene3dCharRimLight = false;

  scene3dSquashStretchEnabled = false;

  scene3dSquashStretchIntensity = 0.25;

  scene3dLegIdleMode: 'fk' | 'ik' | 'none' = 'fk';

  scene3dApplySquashStretch(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.setSquashStretch3D(id, {
      enabled:   this.scene3dSquashStretchEnabled,
      intensity: this.scene3dSquashStretchIntensity,
    });
  }

  scene3dSetLegIdleMode(mode: 'fk' | 'ik' | 'none'): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dLegIdleMode = mode;
    sm.setLegIdleMode3D(id, mode);
  }

  // -- Skin shading (soft lighting + toon ramp; ramp look is scene-global)
  scene3dSoftLightOn = false;

  scene3dSoftLightStrength = 0.6;

  scene3dSkinMode: 'classic' | 'ramp' = 'classic';

  scene3dRampBands = 2;

  scene3dRampSoftness = 0.08;

  scene3dRampShadowFloor = 0.4;

  scene3dRampShadowTintHex = '#d1a8ad';

  scene3dSoftLightToggle(): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.shapeManager.setMeshSoftLighting3D(id, this.scene3dSoftLightOn);
    this.host.dirty.emit();
  }

  scene3dSoftLightStrengthChanged(): void {
    this.shapeManager.setSoftLightingStrength3D(this.scene3dSoftLightStrength);
    this.host.dirty.emit();
  }

  scene3dSkinModeChanged(): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.shapeManager.setSkinShadingMode3D(id, this.scene3dSkinMode);
    this.host.dirty.emit();
  }

  scene3dRampSettingsChanged(): void {
    const t = hexToRgba01(this.scene3dRampShadowTintHex);
    this.shapeManager.setSkinRampSettings3D({
      bands: this.scene3dRampBands,
      softness: this.scene3dRampSoftness,
      shadowFloor: this.scene3dRampShadowFloor,
      shadowTint: [t[0], t[1], t[2]],
    });
    this.host.dirty.emit();
  }

  // -- Joint blending (skinning method) — whole character switches together
  scene3dSkinningMethod: 'linear' | 'dualQuat' = 'linear';

  scene3dSkinningMethodChanged(): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.shapeManager.setSkinningMethod3D(id, this.scene3dSkinningMethod);
    this.host.dirty.emit();
  }

  _syncSkinShading(id: string): void {
    const sm = this.shapeManager;
    this.scene3dSkinningMethod = sm.getSkinningMethod3D(id) ?? 'linear';
    // Style dropdown + Retro colour ← the character's actual state (2026-09-29: the dropdown was never read back, so
    // it always showed its 'cel' default whatever style the character really had after a reload).
    this.charRenderStyle = sm.getRenderStyle3D(id) ?? this.charRenderStyle;
    this.charRetroColor = !!sm.getMeshRetroColor3D(id);
    this._syncToonAndRim(id);
    this.host.sketchPaperSynced.emit(sm.getSketchPaper3D() ?? 0.75);   // the editor owns sketch paper (render-look slider too)
    // No facade getter for the per-mesh flag — read it off the material
    this.scene3dSoftLightOn = !!(sm.getNodeById(id) as any)?.material?.softLighting;
    this.scene3dSkinMode = sm.getSkinShadingMode3D(id) ?? 'classic';
    this.scene3dSoftLightStrength = sm.getSoftLightingStrength3D() ?? 0.6;
    const r = sm.getSkinRampSettings3D();
    if (r) {
      this.scene3dRampBands = r.bands ?? 2;
      this.scene3dRampSoftness = r.softness ?? 0.08;
      this.scene3dRampShadowFloor = r.shadowFloor ?? 0.4;
      if (r.shadowTint) {
        this.scene3dRampShadowTintHex = '#' + r.shadowTint.slice(0, 3)
          .map((n: number) => Math.round((n ?? 0) * 255).toString(16).padStart(2, '0')).join('');
      }
    }
  }

  // -- Character SCALE (Salsa 2026-10-04): one uniform scale on the whole character (body, clothes, hair, face, charms) —
  // no regeneration, feet stay on the ground, saved with the document. The Height slider above re-makes the body instead.
  scene3dCharScale = 1;

  scene3dCharHeightM = 0;

  scene3dCharSceneMpu: number | null = null;   // non-null = a city exists (Fit to city enabled)

  _syncCharScale(id: string): void {
    const s = this.shapeManager.getCharacterScale3D(id);
    if (!s) return;
    this.scene3dCharScale = Math.round(s.scale * 1000) / 1000;
    this.scene3dCharHeightM = Math.round(s.heightMetres * 100) / 100;
    this.scene3dCharSceneMpu = s.sceneMetresPerUnit ?? null;
  }

  /** _syncCharScale, entering the zone only when a bound readout changes (callers outside the zone). */
  private _syncCharScaleIfChanged(id: string): void {
    const s = this.shapeManager.getCharacterScale3D(id);
    if (!s) return;
    const scale = Math.round(s.scale * 1000) / 1000;
    const heightM = Math.round(s.heightMetres * 100) / 100;
    const mpu = s.sceneMetresPerUnit ?? null;
    if (scale === this.scene3dCharScale && heightM === this.scene3dCharHeightM && mpu === this.scene3dCharSceneMpu) return;
    this.zone.run(() => this._syncCharScale(id));
  }

  scene3dCharScaleChanged(v: number | null): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id || v == null || !(v > 0)) return;
    if (this.shapeManager.setCharacterScale3D(id, v)) { this._syncCharScale(id); this.host.dirty.emit(); }
  }

  scene3dCharHeightChanged(m: number | null): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id || m == null || !(m > 0)) return;
    if (this.shapeManager.setCharacterHeight3D(id, m) != null) { this._syncCharScale(id); this.host.dirty.emit(); }
  }

  scene3dFitCharToCity(): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    if (this.shapeManager.fitCharacterToScene3D(id) != null) { this._syncCharScale(id); this.host.dirty.emit(); }
  }

  scene3dBodyParamChanged(): void {
    clearTimeout(this._bodyParamTimer);
    // H7: the debounce (and the promise after it) run OUTSIDE the zone; they enter it only when the scale / metre
    // readout actually changed (the Height slider), not on every other body slider tick.
    this._bodyParamTimer = this.zone.runOutsideAngular(() => setTimeout(() => {
      const sm = this.shapeManager;
      const id = this.host.scene3dEditCharBodyId;
      if (!id || !this.scene3dBodyParams) return;
      void Promise.resolve(sm.setBodyParams3D(id, this.scene3dBodyParams)).then(() => this._syncCharScaleIfChanged(id));   // the metre readout follows the Height slider
    }, 10));
  }

  scene3dSkinToneChanged(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.setSkinTone3D(id, this.scene3dSkinTone);
  }

  scene3dSetCharRimLight(on: boolean): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.setCharacterRimLight3D(id, on);
    this.host.dirty.emit();
  }

  // -- Visual-polish item 10 (2026-10-03): matte skin + cloth (per character) and outlines in Play (scene-wide).
  //    The anime face shading slider writes scene3dBodyParams.faceNormals (a body param → scene3dBodyParamChanged).
  scene3dCharMatte = false;

  scene3dPlayOutlines = true;

  scene3dSetCharMatte(on: boolean): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.shapeManager.setCharacterMatte3D(id, on);
    this.host.dirty.emit();
  }

  scene3dSetPlayOutlines(on: boolean): void {
    this.shapeManager.setPlayCharacterOutlines3D(on);
    this.host.dirty.emit();
  }

  scene3dFaceNormalsChanged(v: number): void {
    if (!this.scene3dBodyParams) return;
    this.scene3dBodyParams.faceNormals = +v;
    this.scene3dBodyParamChanged();
    this.host.dirty.emit();
  }

  // -- Toon shadows (per character on/off; the look is scene-global, Cel / Cel-HD only)
  scene3dCharToonShadows = false;

  scene3dToonBands = 2;

  scene3dToonSoftness = 0.05;

  scene3dToonShadowValue = 0.62;

  scene3dToonSaturation = 0.25;

  scene3dToonTintHex = '#bdadf5';

  // -- Rim light look (scene-global). Strength 0 = the original built-in rim.
  scene3dRimStrength = 0;

  scene3dRimWidth = 0.25;

  scene3dRimHardness = 0.85;

  scene3dRimColorHex = '#80e6ff';

  scene3dSetCharToonShadows(on: boolean): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.shapeManager.setCharacterToonShadows3D(id, on);
    this.host.dirty.emit();
  }

  scene3dToonShadowsChanged(): void {
    const t = hexToRgba01(this.scene3dToonTintHex);
    this.shapeManager.setToonShadows3D({
      bands: this.scene3dToonBands,
      softness: this.scene3dToonSoftness,
      shadowValue: this.scene3dToonShadowValue,
      saturation: this.scene3dToonSaturation,
      shadowTint: [t[0], t[1], t[2]],
    });
    this.host.dirty.emit();
  }

  scene3dRimLookChanged(): void {
    const c = hexToRgba01(this.scene3dRimColorHex);
    this.shapeManager.setRimLight3D({
      strength: this.scene3dRimStrength,
      width: this.scene3dRimWidth,
      hardness: this.scene3dRimHardness,
      color: [c[0], c[1], c[2]],
    });
    this.host.dirty.emit();
  }

  private _syncToonAndRim(bodyId: string): void {
    const sm = this.shapeManager;
    const toHex = (v: number[]) => '#' + v.slice(0, 3).map(n => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0')).join('');
    // Per-character state has no facade getter — read the body's material flags
    const mat = (sm.getNodeById(bodyId) as any)?.material;
    this.scene3dCharToonShadows = !!mat?.toonShadow;
    this.scene3dCharRimLight = !!mat?.rimEnabled;
    this.scene3dCharMatte = !!sm.getCharacterMatte3D(bodyId);
    this.scene3dPlayOutlines = sm.getPlayCharacterOutlines3D() ?? true;
    const t = sm.getToonShadows3D();
    if (t) {
      this.scene3dToonBands = t.bands; this.scene3dToonSoftness = t.softness;
      this.scene3dToonShadowValue = t.shadowValue; this.scene3dToonSaturation = t.saturation;
      this.scene3dToonTintHex = toHex(t.shadowTint);
    }
    const r = sm.getRimLight3D();
    if (r) {
      this.scene3dRimStrength = r.strength; this.scene3dRimWidth = r.width;
      this.scene3dRimHardness = r.hardness; this.scene3dRimColorHex = toHex(r.color);
    }
  }

  /** Per-character Retro colour (Salsa material bit 31): gets the colour depth + dither when the scope is 'optIn'. */
  charRetroColor = false;

  scene3dSetCharRetroColor(on: boolean): void {
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.charRetroColor = on;
    this.shapeManager.setCharacterRetroColor3D(id, on);
    this.host.dirty.emit();
  }

  scene3dSetCharRenderStyle(style: string): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.charRenderStyle = style;
    sm.setCharacterRenderStyle3D(id, style as any);
    this.host.dirty.emit();
  }

  scene3dSetRenderStyleAll(style: string): void {
    this.shapeManager.setRenderStyleAll3D(style as any);
    this.host.dirty.emit();
  }
}
