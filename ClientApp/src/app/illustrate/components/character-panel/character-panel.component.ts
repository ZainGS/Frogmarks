import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { CharLookService } from './char-look.service';
import { CharFaceService } from './char-face.service';
import { CharHairService } from './char-hair.service';
import { CharClothingService } from './char-clothing.service';
import { CharCharmsService } from './char-charms.service';
import { NavStack, SubNav, scrollPanelToTop } from '../../utils/sub-nav';

/** Used when the engine predates sm.getHairStyles3D (the picker then simply does nothing). */

/** The hair build a control belongs to: Salsa generateHair routes 'locks' (= "Styled", hair-locks.ts buildLockHair) and
 *  'cards'; anything else (absent, 'chunky', unknown) is the chunky build. */
export type HairControlMode = 'cards' | 'chunky' | 'locks';
export function hairControlModeOf(hairMode: unknown): HairControlMode {
  const m = String(hairMode ?? '').toLowerCase().trim();
  return m === 'locks' || m === 'cards' ? m : 'chunky';
}
const HC_ALL: readonly HairControlMode[] = ['cards', 'chunky', 'locks'];
const HC_LEGACY: readonly HairControlMode[] = ['cards', 'chunky'];
const HC_LOCKS: readonly HairControlMode[] = ['locks'];
const HC_CARDS: readonly HairControlMode[] = ['cards'];
const HC_CHUNKY: readonly HairControlMode[] = ['chunky'];
/**
 * Which hair modes each HairParams key actually affects (audited against Salsa hair-generator.ts generateHair /
 * hair-locks.ts buildLockHair / scene3d-character.ts hair material + gradient texture, 2026-10-04). The 'locks' build
 * returns before every legacy component (cap, bangs, spikes, buzz, scalp length + curl, front drape, card tails) and
 * reads only its own lock params plus hairlineFront, crownRound, sideLock*, tail style/height/length/thickness/spread/
 * curl/taper, bunStyle/bunSize and facial hair; colours / gradient / sheen are material-side and apply to every mode.
 * Pure (no Angular) so a unit test can import it.
 */
export const HAIR_CONTROL_MODES: Readonly<Record<string, readonly HairControlMode[]>> = {
  hairStyle: HC_ALL,
  // Styled (locks) only
  fringeStyle: HC_LOCKS, fringeHeight: HC_LOCKS, fringeCount: HC_LOCKS, fringeSide: HC_LOCKS,
  hairLength: HC_LOCKS, sideLength: HC_LOCKS, lockCount: HC_LOCKS, lockWidth: HC_LOCKS, lockThickness: HC_LOCKS,
  lockVolume: HC_LOCKS, lockTaper: HC_LOCKS, lockFlick: HC_LOCKS, lockJitter: HC_LOCKS, lockLayers: HC_LOCKS,
  lockSeed: HC_LOCKS, ahoge: HC_LOCKS, gather: HC_LOCKS, tailLocks: HC_LOCKS,
  tailForm: HC_LOCKS, drillTurns: HC_LOCKS, lockCurl: HC_LOCKS, lockCurlType: HC_LOCKS, lockCurlFreq: HC_LOCKS,
  lockSpike: HC_LOCKS, hairPoof: HC_LOCKS,
  // Shared by every mode
  crownRound: HC_ALL, hairlineFront: HC_ALL,
  bunStyle: HC_ALL, bunSize: HC_ALL,
  facialHair: HC_ALL, beardLength: HC_ALL, beardDensity: HC_ALL,
  sideLock: HC_ALL, sideLockLength: HC_ALL, sideLockWidth: HC_ALL, sideLockCount: HC_ALL,
  tailStyle: HC_ALL, tailHeight: HC_ALL, tailSpread: HC_ALL, tailLength: HC_ALL, tailThickness: HC_ALL,
  tailTaper: HC_ALL, tailCurl: HC_ALL,
  rootColor: HC_ALL, tipColor: HC_ALL, gradient: HC_ALL, tipFade: HC_ALL, sheen: HC_ALL, sheenBand: HC_ALL,
  // Chunky + Cards (the legacy build)
  verticalOffset: HC_LEGACY, capThickness: HC_LEGACY, backLength: HC_LEGACY, capSweep: HC_LEGACY,
  spikeCap: HC_LEGACY, spikePattern: HC_LEGACY, spikeLength: HC_LEGACY, spikeJitter: HC_LEGACY,
  buzzCut: HC_LEGACY, sideCut: HC_LEGACY,
  scalpLength: HC_LEGACY, lengthFront: HC_LEGACY, lengthSide: HC_LEGACY, lengthBack: HC_LEGACY, scalpBluntness: HC_LEGACY,
  curlType: HC_LEGACY, curlAmount: HC_LEGACY, curlFreq: HC_LEGACY, curlPhaseJitter: HC_LEGACY, layering: HC_LEGACY, chop: HC_LEGACY,
  partingStyle: HC_LEGACY, partingPosition: HC_LEGACY, partingWidth: HC_LEGACY, bangCount: HC_LEGACY, bangLength: HC_LEGACY,
  bangCurve: HC_LEGACY, bangPointiness: HC_LEGACY, bangOffset: HC_LEGACY,
  tailStartTaper: HC_LEGACY, tailTip: HC_CHUNKY,   // card tails have no tip cap
  frontDrape: HC_LEGACY, frontDrapeSide: HC_LEGACY, frontDrapeOrigin: HC_LEGACY, frontDrapeLength: HC_LEGACY,
  frontDrapeWaveX: HC_LEGACY, frontDrapeWaveZ: HC_LEGACY, frontDrapeStrays: HC_LEGACY, frontDrapeStrayX: HC_LEGACY, frontDrapeStrayZ: HC_LEGACY,
  chunkiness: HC_LEGACY, volume: HC_LEGACY,
  // Cards only
  cardWidth: HC_CARDS, cardsPerClump: HC_CARDS, cardSegments: HC_CARDS, strandDensity: HC_CARDS, alphaCutoff: HC_CARDS,
  cardifyCap: HC_CARDS, capLayers: HC_CARDS, cardDetail: HC_CARDS,
};
/** True when the hair control for `key` has an effect in `hairMode`. Unknown keys stay visible. */
export function hairControlVisible(key: string, hairMode: unknown): boolean {
  const modes = HAIR_CONTROL_MODES[key];
  return !modes || modes.includes(hairControlModeOf(hairMode));
}
/** Styled hair that is GATHERED (gather on + a tail or bun to tie into): Salsa then builds the pulled-back locks
 *  instead of the loose crown, so the loose-crown keys below do nothing. Mirrors Salsa hair-control-modes.ts
 *  (hairGatheredOf / HAIR_GATHERED_INERT; its test compares this copy). */
export function hairGatheredOf(p: { hairMode?: unknown; gather?: unknown; tailStyle?: unknown; bunStyle?: unknown } | null | undefined): boolean {
  if (!p || hairControlModeOf(p.hairMode) !== 'locks' || p.gather !== true) return false;
  const t = String(p.tailStyle ?? 'none').toLowerCase(), b = String(p.bunStyle ?? 'none').toLowerCase();
  return t !== 'none' || b !== 'none';
}
/** COPY of Salsa hair-control-modes.ts (HAIR_GATHERED_INERT, HAIR_BUZZ_INERT, hairControlVisibleFor — its test compares
 *  them with this file; keep them identical).
 *  Styled-hair keys that only shape the LOOSE crown locks — inert while the hair is gathered (hairGatheredOf).
 *  hairLength / sideLength then only rescale the uv.v reference (vRef), not one vertex position. lockJitter is the
 *  exception: the Choppy fringe reads it too (hairControlVisibleFor). */
export const HAIR_GATHERED_INERT: readonly string[] = ['hairLength', 'sideLength', 'lockFlick', 'lockJitter', 'lockLayers', 'lockSpike'];

/** Chunky / Cards keys a BUZZ cut skips: generateHair then builds only the buzz cap (+ facial hair). */
export const HAIR_BUZZ_INERT: readonly string[] = [
  'verticalOffset', 'backLength', 'spikeCap', 'spikePattern', 'spikeLength', 'spikeJitter',
  'scalpLength', 'lengthFront', 'lengthSide', 'lengthBack', 'scalpBluntness',
  'curlType', 'curlAmount', 'curlFreq', 'curlPhaseJitter', 'layering', 'chop',
  'partingStyle', 'partingPosition', 'partingWidth', 'bangCount', 'bangLength', 'bangCurve', 'bangPointiness', 'bangOffset',
  'sideLock', 'sideLockLength', 'sideLockWidth', 'sideLockCount',
  'tailStyle', 'tailHeight', 'tailSpread', 'tailLength', 'tailThickness', 'tailTaper', 'tailStartTaper', 'tailCurl', 'tailTip',
  'frontDrape', 'frontDrapeSide', 'frontDrapeOrigin', 'frontDrapeLength', 'frontDrapeWaveX', 'frontDrapeWaveZ',
  'frontDrapeStrays', 'frontDrapeStrayX', 'frontDrapeStrayZ', 'bunStyle', 'bunSize',
  'cardWidth', 'cardsPerClump', 'cardSegments', 'cardifyCap', 'capLayers', 'cardDetail',
];

/** The params hairControlVisibleFor reads (a panel passes its HairParams; absent = the generator defaults). */
export type HairControlParams = { [key: string]: unknown };

/** hairControlVisible + the in-mode conditions (gathered hair, buzz cut, bang count, fringe shape, spikes, tails /
 *  front drape / cardified cap, facial hair). Use this when the full params are at hand. Every rule mirrors a
 *  generateHair / buildLockHair gate; hair-control-modes.test.ts verifies them by perturbing each key per scenario. */
export function hairControlVisibleFor(key: string, p: HairControlParams): boolean {
  if (!hairControlVisible(key, p.hairMode)) return false;
  const mode = hairControlModeOf(p.hairMode);
  const str = (v: unknown, d: string): string => String(v ?? d).toLowerCase().trim();
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const tails = str(p.tailStyle, 'none') !== 'none';
  if (str(p.facialHair, 'none') === 'none' && (key === 'beardLength' || key === 'beardDensity')) return false;
  if (mode === 'locks') {
    const fringe = str(p.fringeStyle, 'choppy');
    if (HAIR_GATHERED_INERT.includes(key) && hairGatheredOf(p)) return key === 'lockJitter' && fringe === 'choppy';
    if (key === 'fringeHeight') return fringe !== 'none';
    if (key === 'fringeSide') return fringe === 'swept' || fringe === 'parted';
    if (key === 'lockFlick') return num(p.lockSpike, 0) <= 0.01;            // spiky crown locks never flick
    const form = str(p.tailForm, 'bundle');
    if (key === 'tailTaper') return tails && form !== 'drill';            // the drill curl has its own taper
    if (key === 'tailLocks') return tails && form === 'bundle';
    if (key === 'drillTurns') return tails && form === 'drill';
    if (key.startsWith('tail') && key !== 'tailStyle') return tails;
    return true;
  }
  // Chunky / Cards (the legacy build)
  if (p.buzzCut === true) return !HAIR_BUZZ_INERT.includes(key);
  const bangs = Math.round(num(p.bangCount, 6)) > 0;
  const spiky = p.spikeCap === true;
  const drape = num(p.frontDrape, 0) > 0;
  const cardCap = p.cardifyCap === true && !spiky;                          // the spike cap replaces the card cap
  if (key === 'frontDrapeStrayX' || key === 'frontDrapeStrayZ') return drape && num(p.frontDrapeStrays, 0) >= 0.5;
  if (key.startsWith('frontDrape') && key !== 'frontDrape') return drape;
  switch (key) {
    case 'partingPosition': case 'partingWidth': return bangs && str(p.partingStyle, 'parted') !== 'fringe';
    case 'partingStyle': case 'bangLength': case 'bangCurve': case 'bangPointiness': case 'bangOffset':
    case 'verticalOffset': return bangs;                                   // verticalOffset only lifts the bang hairline
    case 'tailThickness': return tails || drape || spiky;                 // the drape + the spike tufts size from it
    case 'tailTaper': case 'tailTip': return tails || drape;
    case 'cardWidth': case 'cardsPerClump': case 'cardSegments': return tails || drape;   // card tails / drape only
    case 'cardDetail': return tails || drape || cardCap;
    case 'cardifyCap': return !spiky;
    case 'capLayers': return cardCap;
  }
  if (key.startsWith('tail') && key !== 'tailStyle') return tails;
  return true;
}

/** What scene3dGenerateCharacter created — mirrored into the panel controls (no engine calls). */
export interface CharacterGenerated {
  bodyId: string; hairParams: any; eyeParams: any; topParams: any; bottomParams: any; skinTone: string;
}

/**
 * Edit Character panel: face / eyes / gaze, body + skin shading, hair, clothing slots + patterns, charms,
 * motion, part textures, preset import/export. Extracted from illustration.component (refactor-plan 2.5b).
 * The editor owns which body is edited, the toolbar toggle (+ hair simulation), idle, eye-draw mode,
 * clothing paint and sketch paper; this panel asks for those through its outputs.
 */
@Component({
  selector: 'app-character-panel',
  templateUrl: './character-panel.component.html',
  styleUrls: ['./character-panel.component.scss'],
  providers: [CharLookService, CharFaceService, CharHairService, CharClothingService, CharCharmsService],
})
export class CharacterPanelComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() open = false;
  @Input() scene3dEditCharBodyId: string | null = null;
  @Input() generated: CharacterGenerated | null = null;
  @Input() scene3dRetroColorScope: 'all' | 'optIn' = 'all';
  @Input() scene3dSketchPaper = 0.75;
  @Input() scene3dIdleEnabled = false;
  @Input() scene3dClothingPaintActive: 'top' | 'bottom' | 'shoes' | 'socks' | null = null;
  @Input() eyeDrawMode = false;
  @Input() eyeDrawExprId: string | null = null;
  @Output() dirty = new EventEmitter<void>();
  @Output() texLibDirty = new EventEmitter<void>();
  /** The panel's sketch-paper slider moved. */
  @Output() sketchPaperEdited = new EventEmitter<number>();
  // Read-backs below are emitted while the panel loads (inside change detection) — async so the editor's
  // bindings are not changed mid-check.
  @Output() sketchPaperSynced = new EventEmitter<number>(true);
  @Output() idleEnabledChange = new EventEmitter<boolean>(true);
  @Output() faceExpressionsChange = new EventEmitter<Array<{ id: string; name: string; isBlink?: boolean }>>(true);
  @Output() drawEyes = new EventEmitter<string>();
  @Output() exitEyeDraw = new EventEmitter<void>();
  @Output() toggleClothingPaint = new EventEmitter<'top' | 'bottom' | 'shoes' | 'socks'>();

  constructor(public look: CharLookService, public face: CharFaceService, public hair: CharHairService, public clothing: CharClothingService, public charms: CharCharmsService,
              private el: ElementRef<HTMLElement>) {
    look.bind(this); face.bind(this); hair.bind(this); clothing.bind(this); charms.bind(this);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const idCh = changes['scene3dEditCharBodyId'];
    if (idCh && !idCh.firstChange) this.charSection = 'menu';
    if ((changes['open'] || idCh) && this.open && this.scene3dEditCharBodyId) {
      this.face._refreshFaceExpressions();
      this.scene3dInitBodyParams();
    }
    if (changes['generated'] && this.generated) {
      const { bodyId, ...p } = this.generated;
      this._syncCharEquipState(bodyId, p);
    }
  }

  private _charSection: 'menu' | 'body' | 'face' | 'hair' | 'top' | 'bottom' | 'shoes' | 'socks' | 'charms' = 'menu';

  get charSection() { return this._charSection; }

  set charSection(v: 'menu' | 'body' | 'face' | 'hair' | 'top' | 'bottom' | 'shoes' | 'socks' | 'charms') {
    if (this._charSection === 'charms' && v !== 'charms') {
      this.charms.scene3dEndPlacePick();
      this.charms._hideCharmPreview();
    }
    this._charSection = v;
    this.nav.reset();
    if (v === 'face') this.face.scene3dInitFaceKit();
  }

  // ── Drill-down inside a section (utils/sub-nav.ts): sub = a group of the section (Face › Brows / Face › Eyes),
  //    sub2 / sub3 = deeper views (Face › Eyes › Happy › Iris). Back steps up one level at a time. ──
  readonly nav = new NavStack(3, () => scrollPanelToTop(this.el.nativeElement));
  get sub(): SubNav { return this.nav.levels[0]; }
  get sub2(): SubNav { return this.nav.levels[1]; }
  get sub3(): SubNav { return this.nav.levels[2]; }

  charBack(): void {
    if (!this.nav.back()) this.charSection = 'menu';
  }

  // ── Face kit (Salsa face-features.ts: brows / mouth / nose / hair shadow / blush + expressions) ──

  charPartTextureSet: Record<string, boolean> = { body: false, eyes: false, hair: false, top: false, bottom: false, shoes: false, socks: false };

  private _syncCharEquipState(bodyId: string, p: {
    hairParams: any; eyeParams: any;
    topParams: any; bottomParams: any; skinTone: string;
  }): void {
    const sm = this.shapeManager;

    // Eyes — createFullCharacter3D created the 'Neutral' expression; just read it back
    this.face._refreshFaceExpressions();
    const firstExpr = this.face.scene3dFaceExpressions[0];
    if (firstExpr) {
      this.face.scene3dEyeModeMap[firstExpr.id]  = 'procedural';
      this.face.scene3dEyeParamsMap[firstExpr.id] = p.eyeParams;
    }

    // Hair / clothing
    this.hair.scene3dHairParams    = p.hairParams;
    this.hair._refreshHairStyles();
    this.clothing.scene3dTopPresets    = sm.getClothingPresetNames3D('top')    ?? [];
    this.clothing.scene3dTopParams     = p.topParams;
    this.clothing.scene3dBottomPresets = sm.getClothingPresetNames3D('bottom') ?? [];
    this.clothing.scene3dBottomParams  = p.bottomParams;
    this.clothing.scene3dShoePresets   = sm.getClothingPresetNames3D('shoes')  ?? [];
    this.clothing.scene3dShoeParams    = sm.getClothingParams3D(bodyId, 'shoes') ?? null;
    this.clothing.scene3dSockPresets   = sm.getClothingPresetNames3D('socks')  ?? [];
    this.clothing.scene3dSockParams    = sm.getClothingParams3D(bodyId, 'socks') ?? null;

    // Body shape + skin tone
    this.look.scene3dBodyParams = sm.getBodyParams3D(bodyId) ?? {
      height: 0.50, legLength: 1.00, limbThick: 0.85, torsoThick: 0.90, torsoLength: 1.00, headSize: 1.25,
      bust: 1, waist: 0.90, hipWidth: 1, hipFront: 0.75, shoulderWidth: 1, buttSize: 1,
    };
    this.look.scene3dSkinTone   = p.skinTone;

    this.look.charRenderStyle = 'cel';   // the engine write (setCharacterRenderStyle3D) happens in the editor's generate
  }

  scene3dInitBodyParams(): void {
    const sm = this.shapeManager;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    this.look.scene3dBodyParams = sm.getBodyParams3D(id) ?? {
      height: 0.50, legLength: 1.00, limbThick: 0.85, torsoThick: 0.90, torsoLength: 1.00, headSize: 1.25,
      bust: 1, waist: 0.90, hipWidth: 1, hipFront: 0.75, shoulderWidth: 1, buttSize: 1,
    };
    const tone = sm.getSkinTone3D(id);
    if (tone) this.look.scene3dSkinTone = tone;
    this.look._syncSkinShading(id);
    this.look._syncCharScale(id);
    // Sync clothing + hair so the editor shows existing state after save/reload
    const hair = sm.getHairParams3D(id);
    if (hair) this.hair.scene3dHairParams = hair;
    this.hair._refreshHairStyles();
    this.clothing.scene3dTopPresets    = sm.getClothingPresetNames3D('top')    ?? [];
    this.clothing.scene3dBottomPresets = sm.getClothingPresetNames3D('bottom') ?? [];
    this.clothing.scene3dShoePresets   = sm.getClothingPresetNames3D('shoes')  ?? [];
    // (socks / undershirt / underpants lists were only loaded when that slot was first initialised, so their preset
    // rows stayed hidden after a reload)
    this.clothing.scene3dSockPresets        = sm.getClothingPresetNames3D('socks')      ?? [];
    this.clothing.scene3dUndershirtPresets  = sm.getClothingPresetNames3D('undershirt') ?? [];
    this.clothing.scene3dUnderpantsPresets  = sm.getClothingPresetNames3D('underpants') ?? [];
    this.clothing.scene3dTopParams         = sm.getClothingParams3D(id, 'top')         ?? null;
    this.clothing.scene3dBottomParams      = sm.getClothingParams3D(id, 'bottom')      ?? null;
    this.clothing.scene3dShoeParams        = sm.getClothingParams3D(id, 'shoes')       ?? null;
    this.clothing.scene3dSockParams        = sm.getClothingParams3D(id, 'socks')       ?? null;
    this.clothing.scene3dUndershirtParams  = sm.getClothingParams3D(id, 'undershirt')  ?? null;
    this.clothing.scene3dUnderpantsParams  = sm.getClothingParams3D(id, 'underpants')  ?? null;
    this.clothing.scene3dHideBody = sm.getHideBodyUnderClothes3D(id) ?? true;   // clothing fit round 2
    // Load existing patterns from params.pattern (persists through rebuilds)
    for (const slot of ['top', 'bottom', 'shoes', 'socks', 'undershirt', 'underpants']) this.clothing._syncClothingPatternFromParams(slot);
    this.charms.scene3dRefreshAttachments();
    // Default idle on so the character breathes in the standing preview
    if (!this.scene3dIdleEnabled) {
      this.idleEnabledChange.emit(true);
      sm.setIdleAnimation3D(id, true);
    }
    this.look.scene3dLegIdleMode = sm.getLegIdleMode3D(id) ?? 'fk';
  }

  scene3dInstallDefaultAnimations(): void {
    const sm = this.shapeManager;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    sm.installDefaultAnimations3D(id);
  }

  // ── Hair STYLE picker (Salsa hair-locks.ts, 2026-10-04): anime lock styles (hairMode 'locks') ──
  /** The hair build the current params route to ('locks' = Styled, 'cards', else 'chunky'). */
  get hairControlMode(): HairControlMode {
    return hairControlModeOf(this.hair.scene3dHairParams?.hairMode);
  }
  /** Styled + Gathered into a tail / bun (the loose-crown controls are hidden). */
  get hairGathered(): boolean {
    return hairGatheredOf(this.hair.scene3dHairParams);
  }
  /** Template helper: does the hair control `key` affect the current hair mode (HAIR_CONTROL_MODES)? */
  hairShow(key: string): boolean {
    return hairControlVisibleFor(key, this.hair.scene3dHairParams ?? {});
  }
  /** The hair Highlight band (flags2 bit 7) is drawn only by the Cel / Cel-HD shading (mesh3d-fs-template hairBandOn). */
  get hairBandStyleOk(): boolean {
    const st = this.look.charRenderStyle;
    return st === 'cel' || st === 'cel-hd';
  }
  /** Chunky / Cards buzz cut: generateHair then builds only the buzz cap + facial hair (bangs, side locks, tails,
   *  front drape, scalp length, buns and spikes are all skipped). Styled (locks) ignores buzzCut. */
  get hairBuzzOn(): boolean {
    const p = this.hair.scene3dHairParams;
    return !!p && p.buzzCut === true && hairControlModeOf(p.hairMode) !== 'locks';
  }

  // ── Clothing fit round 2 (Salsa 2026-10-04): Hide body under clothes + Skirt swing ──

  scene3dExportCharacterPreset(): void {
    const sm = this.shapeManager;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    const json = sm.exportCharacter3D(id);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'character-preset.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async scene3dImportCharacterPreset(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const sm = this.shapeManager;
    const id = this.scene3dEditCharBodyId;
    if (!id) return;
    await sm.importCharacter3D(id, text);
    // Sync all UI panels from the freshly imported params (body, skin, hair, every clothing slot, patterns, charms)
    this.face._refreshFaceExpressions();
    this.scene3dInitBodyParams();
    (event.target as HTMLInputElement).value = '';
    this.dirty.emit();   // an imported preset was never saved on its own
  }

  private _charPartMeshId(part: string): string | null {
    const sm = this.shapeManager;
    const id = this.scene3dEditCharBodyId;
    if (!id) return null;
    switch (part) {
      case 'body':   return id;
      case 'hair':   return sm.getHairMeshId3D(id) ?? null;
      case 'top':    return sm.getClothingMeshId3D(id, 'top') ?? null;
      case 'bottom': return sm.getClothingMeshId3D(id, 'bottom') ?? null;
      case 'shoes':  return sm.getClothingMeshId3D(id, 'shoes') ?? null;
      case 'socks':  return sm.getClothingMeshId3D(id, 'socks') ?? null;
      case 'eyes':   return sm.getEyesMeshId3D(id) ?? null;
      default:       return null;
    }
  }

  async scene3dUploadCharPartTexture(part: string, event: Event): Promise<void> {
    const meshId = this._charPartMeshId(part);
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!meshId || !file) return;
    const bitmap = await createImageBitmap(file);
    await this.shapeManager.setPartTexture3D(meshId, bitmap);
    this.charPartTextureSet[part] = true;
    this.texLibDirty.emit();
    (event.target as HTMLInputElement).value = '';
  }

  scene3dClearCharPartTexture(part: string): void {
    const meshId = this._charPartMeshId(part);
    if (!meshId) return;
    this.shapeManager.clearPartTexture3D(meshId);
    this.charPartTextureSet[part] = false;
    this.texLibDirty.emit();
  }
}
