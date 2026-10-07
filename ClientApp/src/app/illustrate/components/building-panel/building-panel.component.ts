import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { colorToHex, hexToRgba01Obj } from '../../utils/color-utils';
import { SubNav, scrollPanelToTop } from '../../utils/sub-nav';

/**
 * Edit Building panel: category/archetype/seed, massing, facade, storefront, Japan details, greenery,
 * colours, scale, frame, delete, save-to-library. Also edits a building inside a Block (blockId + index): then the
 * actions are that ONE building's (Remove from block) — the whole-block Delete / Scale / Frame / Save stay in the
 * Block panel. ~100 controls, so a menu of groups (utils/sub-nav.ts) opens one group at a time, like Edit Character.
 * Extracted from illustration.component (refactor-plan Phase 2.4b). The editor owns which building is being
 * edited, the block-building flow and deletion; the panel owns the params.
 */
@Component({
  selector: 'app-building-panel',
  templateUrl: './building-panel.component.html',
  styleUrls: ['./building-panel.component.scss'],
})
export class BuildingPanelComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() buildingId: string | null = null;
  /** Set when editing one building inside a Block (with blockBuildingIndex). */
  @Input() blockId: string | null = null;
  @Input() blockBuildingIndex: number | null = null;
  @Input() open = false;
  @Output() deleteBuilding = new EventEmitter<void>();
  /** "Back to block" clicked while editing a block building (also after Remove from block). */
  @Output() backToBlock = new EventEmitter<void>();
  /** A param / scale changed or a block building was removed — the editor marks the document for autosave. */
  @Output() dirty = new EventEmitter<void>();

  /** Drill-down: null = the menu of groups, else the open group ('style', 'massing', …). */
  readonly nav = new SubNav(() => scrollPanelToTop(this.el.nativeElement));
  /** Which destructive action is asking first. */
  confirming: 'delete' | 'remove' | null = null;

  constructor(private el: ElementRef<HTMLElement>) {}

  scene3dBuildingArchetypes: string[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    const relevant = ['open', 'buildingId', 'blockId', 'blockBuildingIndex'].some(k => changes[k]);
    if (relevant) this.confirming = null;
    // Another building (or a block building) starts at the menu
    if (['buildingId', 'blockId', 'blockBuildingIndex'].some(k => changes[k] && !changes[k].firstChange)) this.nav.reset();
    if (relevant && this.open && this.buildingId) this._initBuildingParams();
  }

  // Japan details (Salsa city-quality B4–B9, 2026-09-29) — BuildingParams booleans, synced from the engine.
  readonly buildingJpFlags: { key: string; label: string; title: string }[] = [
    { key: 'windowSash', label: 'Sliding sash', title: 'Wide, low aluminium sash windows with a meeting rail' },
    { key: 'windowSills', label: 'Window sills', title: 'A small sill under each upper-floor street window (default on)' },
    { key: 'shopInterior', label: 'Lit shop interior', title: 'Shelves, posters and fluorescent light behind the shop glass' },
    { key: 'fascia', label: 'Konbini fascia', title: 'Lit full-width stripe band with a logo over the shopfront' },
    { key: 'lanterns', label: 'Lanterns', title: 'Red paper lanterns either side of the entrance' },
    { key: 'menuBoard', label: 'Menu board', title: 'Standing menu board beside the entrance' },
    { key: 'signStack', label: 'Vertical signs', title: 'A lit sign panel per floor up the facade' },
    { key: 'floorSigns', label: 'Floor signs', title: 'A tenant sign under every upper floor' },
    { key: 'openCorridor', label: 'Open corridor', title: 'Walkway along each upper floor with a door per flat' },
    { key: 'outsideStair', label: 'Outside stair', title: 'External steel stair' },
    { key: 'acUnits', label: 'AC units', title: 'Condensers with pipe runs' },
    { key: 'utilities', label: 'Utilities', title: 'Meters, conduit, drain pipes, kitchen vents' },
    { key: 'laundry', label: 'Laundry', title: 'Laundry poles with washing' },
    { key: 'roofAerial', label: 'TV aerial', title: 'Rooftop TV aerial' },
    { key: 'solarHeater', label: 'Solar heater', title: 'Rooftop solar water heater' },
  ];
  buildingJp: Record<string, boolean> = {};
  buildingShutterBays = 0;
  buildingBalconyStyle: 'rail' | 'panel' = 'rail';
  // Typology
  buildingCategory = 'office';
  buildingArchetype = '';
  buildingSeed = 1;
  // Massing
  buildingFloors = 6;
  buildingWidth = 12;
  buildingDepth = 10;
  buildingFloorHeight = 3.2;
  buildingGroundFloorHeight = 4.5;
  buildingCornerStyle: 'sharp' | 'chamfer' | 'round' = 'sharp';
  buildingCornerAmount = 0.5;
  buildingSetbacks = false;
  buildingSetbackInset = 2.0;
  buildingPodium = false;
  buildingPodiumFloors = 2;
  // Facade
  buildingWindowStyle: 'grid' | 'punched' | 'ribbon' | 'curtain' = 'grid';
  buildingBayWidth = 3.0;
  buildingMaterial: 'concrete' | 'brick' | 'plaster' | 'tile' | 'glass' | 'timber' | 'metal' | 'siding' | 'panel' = 'concrete';
  buildingPilasters = false;
  buildingQuoins = false;
  buildingQuoinStyle: 'alternating' | 'block' = 'alternating';
  buildingCornice = true;
  buildingMullions = false;
  buildingGlassTransparent = false;
  // Ground / storefront
  buildingStorefront = false;
  buildingShopBays = 3;
  buildingStallriser = true;
  buildingTransom = true;
  buildingShutter = false;
  buildingAwning = false;
  buildingAwningStyle: 'flat' | 'sloped' | 'dome' = 'sloped';
  buildingAwningStripe = false;
  buildingNoren = false;
  buildingRecessedEntry = false;
  buildingRollerDoors = false;
  buildingCanopy = false;
  buildingLattice = false;
  buildingDoorStyle: 'flush' | 'panel' | 'glazed' | 'double' | 'sliding' = 'panel';
  // Features
  buildingBalconies = false;
  buildingJulietBalconies = false;
  buildingJulietColor = '#2a2a2a';
  buildingJulietScroll = 0;
  buildingWindowTrim = false;
  buildingWindowTrimColor = '#c8c0b0';
  buildingLedges = true;
  buildingFireEscape = false;
  buildingDownpipes = true;
  buildingWallUnits = false;
  // Roof
  buildingRoofStyle: 'flat' | 'parapet' | 'hip' | 'gable' | 'mansard' | 'sawtooth' | 'tiled-hip' = 'parapet';
  buildingRoofPitch = 0.5;
  buildingDeepEaves = false;
  buildingRoofClutter = true;
  buildingRoofPenthouse = false;
  buildingRoofRailing = true;
  buildingRoofGarden = false;
  buildingRoofDishes = false;
  buildingRoofVents = false;
  buildingHelipad = false;
  buildingCrown: 'none' | 'spire' | 'mech' | 'blade' = 'none';
  // Signage
  buildingSignage = false;
  buildingBladeSign = false;
  buildingWrapSign = false;
  buildingRooftopSign = false;
  buildingLedScreen = false;
  buildingNeon = false;
  // Color
  buildingBaseColor = '#c8bfae';
  buildingTrimColor = '#8a8a8a';
  buildingRoofColor = '#555555';
  buildingGlassColor = '#4a8fc4';
  buildingAccentColor = '#c4623a';
  buildingSignColor = '#ff4444';
  buildingStorefrontColor = '#5a7a8a';
  buildingAwningColor = '#c43a3a';
  buildingDoorColor = '#4a3a2a';
  buildingDoorFrameColor = '#8a7a6a';
  buildingDoorHandleColor = '#8a8a6a';
  buildingRenderStyle: 'default' | 'cel' | 'cel-hd' | 'sketch' | 'ink' | 'gouraud' = 'default';
  buildingNightWindows = 0.4;
  // Greenery (attached)
  buildingBaseHedge = false;
  buildingVines = false;
  buildingWindowBoxes = false;
  buildingBasePlanters = false;
  buildingGreeneryColor = '#4a7a35';
  buildingBloomColor = '#e05050';
  // Scale
  buildingUnitsPerMetre = 0.1;
  buildingScaleInfo: { scale: number; metersPerUnit: number; realHeightM: number; displayHeightUnits: number; realWidthM: number; realDepthM: number } | null = null;

  private _initBuildingParams(): void {
    const sm = this.shapeManager;
    const id = this.buildingId;
    if (!id) return;
    const p = this.blockBuildingIndex !== null
      ? sm.getBlockBuildingParams3D(id, this.blockBuildingIndex)
      : sm.getBuildingParams3D(id);
    if (!p) return;
    if (p.category != null)           this.buildingCategory          = p.category;
    if (p.archetype != null)          this.buildingArchetype         = p.archetype;
    if (p.seed != null)               this.buildingSeed              = p.seed;
    if (p.floors != null)             this.buildingFloors            = p.floors;
    if (p.width != null)              this.buildingWidth             = p.width;
    if (p.depth != null)              this.buildingDepth             = p.depth;
    if (p.floorHeight != null)        this.buildingFloorHeight       = p.floorHeight;
    if (p.groundFloorHeight != null)  this.buildingGroundFloorHeight = p.groundFloorHeight;
    if (p.cornerStyle != null)        this.buildingCornerStyle       = p.cornerStyle;
    if (p.cornerAmount != null)       this.buildingCornerAmount      = p.cornerAmount;
    if (p.setbacks != null)           this.buildingSetbacks          = p.setbacks as any;
    if (p.setbackInset != null)       this.buildingSetbackInset      = p.setbackInset;
    if (p.podium != null)             this.buildingPodium            = p.podium;
    if (p.podiumFloors != null)       this.buildingPodiumFloors      = p.podiumFloors;
    if (p.windowStyle != null)        this.buildingWindowStyle       = p.windowStyle;
    if (p.bayWidth != null)           this.buildingBayWidth          = p.bayWidth;
    if (p.material != null)           this.buildingMaterial          = p.material;
    if (p.pilasters != null)          this.buildingPilasters         = p.pilasters;
    if (p.quoins != null)             this.buildingQuoins            = p.quoins;
    if (p.quoinStyle != null)         this.buildingQuoinStyle        = p.quoinStyle;
    if (p.cornice != null)            this.buildingCornice           = p.cornice;
    if (p.mullions != null)           this.buildingMullions          = p.mullions;
    if (p.glassTransparent != null)   this.buildingGlassTransparent  = p.glassTransparent;
    if (p.storefront != null)         this.buildingStorefront        = p.storefront;
    if (p.shopBays != null)           this.buildingShopBays          = p.shopBays;
    if (p.stallriser != null)         this.buildingStallriser        = p.stallriser;
    if (p.transom != null)            this.buildingTransom           = p.transom;
    if (p.shutter != null)            this.buildingShutter           = p.shutter;
    if (p.awning != null)             this.buildingAwning            = p.awning;
    if (p.awningStyle != null)        this.buildingAwningStyle       = p.awningStyle;
    if (p.awningStripe != null)       this.buildingAwningStripe      = p.awningStripe;
    if (p.noren != null)              this.buildingNoren             = p.noren;
    if (p.recessedEntry != null)      this.buildingRecessedEntry     = p.recessedEntry;
    if (p.rollerDoors != null)        this.buildingRollerDoors       = p.rollerDoors;
    if (p.canopy != null)             this.buildingCanopy            = p.canopy;
    if (p.lattice != null)            this.buildingLattice           = p.lattice;
    if (p.doorStyle != null)          this.buildingDoorStyle         = p.doorStyle as any;
    if (p.balconies != null)          this.buildingBalconies         = p.balconies;
    if (p.julietBalconies != null)    this.buildingJulietBalconies   = p.julietBalconies;
    if (p.julietScroll != null)       this.buildingJulietScroll      = p.julietScroll;
    if (p.windowTrim != null)         this.buildingWindowTrim        = p.windowTrim;
    if (p.ledges != null)             this.buildingLedges            = p.ledges;
    if (p.fireEscape != null)         this.buildingFireEscape        = p.fireEscape;
    if (p.downpipes != null)          this.buildingDownpipes         = p.downpipes;
    if (p.wallUnits != null)          this.buildingWallUnits         = p.wallUnits;
    if (p.roofStyle != null)          this.buildingRoofStyle         = p.roofStyle;
    if (p.roofPitch != null)          this.buildingRoofPitch         = p.roofPitch;
    if (p.deepEaves != null)          this.buildingDeepEaves         = p.deepEaves;
    if (p.roofClutter != null)        this.buildingRoofClutter       = p.roofClutter;
    if (p.roofPenthouse != null)      this.buildingRoofPenthouse     = p.roofPenthouse;
    if (p.roofRailing != null)        this.buildingRoofRailing       = p.roofRailing;
    if (p.roofGarden != null)         this.buildingRoofGarden        = p.roofGarden;
    if (p.roofDishes != null)         this.buildingRoofDishes        = p.roofDishes;
    if (p.roofVents != null)          this.buildingRoofVents         = p.roofVents;
    if (p.helipad != null)            this.buildingHelipad           = p.helipad;
    if (p.crown != null)              this.buildingCrown             = p.crown;
    if (p.signage != null)            this.buildingSignage           = p.signage;
    if (p.bladeSign != null)          this.buildingBladeSign         = p.bladeSign;
    if (p.wrapSign != null)           this.buildingWrapSign          = p.wrapSign;
    if (p.rooftopSign != null)        this.buildingRooftopSign       = p.rooftopSign;
    if (p.ledScreen != null)          this.buildingLedScreen         = p.ledScreen;
    if (p.neon != null)               this.buildingNeon              = p.neon;
    const col = (v: unknown) => colorToHex(v);
    if (p.baseColor != null)          this.buildingBaseColor         = col(p.baseColor);
    if (p.trimColor != null)          this.buildingTrimColor         = col(p.trimColor);
    if (p.roofColor != null)          this.buildingRoofColor         = col(p.roofColor);
    if (p.glassColor != null)         this.buildingGlassColor        = col(p.glassColor);
    if (p.accentColor != null)        this.buildingAccentColor       = col(p.accentColor);
    if (p.signColor != null)          this.buildingSignColor         = col(p.signColor);
    if (p.storefrontColor != null)    this.buildingStorefrontColor   = col(p.storefrontColor);
    if (p.awningColor != null)        this.buildingAwningColor       = col(p.awningColor);
    if (p.doorColor != null)          this.buildingDoorColor         = col(p.doorColor);
    if (p.doorFrameColor != null)     this.buildingDoorFrameColor    = col(p.doorFrameColor);
    if (p.doorHandleColor != null)    this.buildingDoorHandleColor   = col(p.doorHandleColor);
    if (p.julietColor != null)        this.buildingJulietColor       = col(p.julietColor);
    if (p.windowTrimColor != null)    this.buildingWindowTrimColor   = col(p.windowTrimColor);
    if (p.renderStyle != null)        this.buildingRenderStyle       = p.renderStyle;
    if (p.nightWindows != null)       this.buildingNightWindows      = p.nightWindows;
    if (p.baseHedge != null)          this.buildingBaseHedge         = p.baseHedge;
    if (p.vines != null)              this.buildingVines             = p.vines;
    if (p.windowBoxes != null)        this.buildingWindowBoxes       = p.windowBoxes;
    if (p.basePlanters != null)       this.buildingBasePlanters      = p.basePlanters;
    if (p.greeneryColor != null)      this.buildingGreeneryColor     = col(p.greeneryColor);
    if (p.bloomColor != null)         this.buildingBloomColor        = col(p.bloomColor);
    { const pp = p as unknown as Record<string, unknown>; const jp: Record<string, boolean> = {};
      for (const f of this.buildingJpFlags) jp[f.key] = !!pp[f.key];
      this.buildingJp = jp;
      if (typeof pp['shutterBays'] === 'number') this.buildingShutterBays = pp['shutterBays'] as number;
      if (pp['balconyStyle'] === 'rail' || pp['balconyStyle'] === 'panel') this.buildingBalconyStyle = pp['balconyStyle'] as 'rail' | 'panel'; }
    this.scene3dBuildingArchetypes = sm.buildingArchetypeNames3D() ?? [];
    this._refreshBuildingScaleInfo();
  }

  scene3dApplyBuildingParam(field: string, value: unknown): void {
    const v = (field.endsWith('Color') && typeof value === 'string')
      ? (() => { const c = hexToRgba01Obj(value); return [c.r, c.g, c.b]; })()
      : value;
    const sm = this.shapeManager;
    if (this.blockBuildingIndex !== null && this.blockId) {
      sm.setBlockBuildingParams3D(this.blockId, this.blockBuildingIndex, { [field]: v });
      this.dirty.emit();
      return;
    }
    const id = this.buildingId;
    if (!id) return;
    sm.setBuildingParams3D(id, { [field]: v });
    this.dirty.emit();
  }

  /** Back: a group goes back to the menu; the menu of a block building goes back to the Block panel. */
  back(): void {
    if (this.nav.id) this.nav.close();
    else if (this.blockBuildingIndex !== null) this.backToBlock.emit();
  }

  /** Remove from block (confirmed): only this building — the block and its other buildings stay. */
  scene3dRemoveFromBlock(): void {
    const blockId = this.blockId, index = this.blockBuildingIndex;
    if (!blockId || index === null) return;
    this.shapeManager.removeBlockBuilding3D(blockId, index);
    this.dirty.emit();
    this.backToBlock.emit();
  }

  scene3dRandomizeBuildingSeed(): void {
    this.buildingSeed = ((Math.random() * 9999) | 0) + 1;
    this.scene3dApplyBuildingParam('seed', this.buildingSeed);
  }

  async scene3dBuildingPromoteToLibrary(): Promise<void> {
    const id = this.buildingId;
    if (!id || this.blockBuildingIndex !== null) return;   // buildingId is the BLOCK's id there
    const sm = this.shapeManager;
    await sm.promoteCreatorToLibrary3D(id, { name: 'Building', tags: ['building'] });
  }

  private _refreshBuildingScaleInfo(): void {
    const id = this.buildingId;
    if (!id) return;
    this.buildingScaleInfo = this.shapeManager.getBuildingScaleInfo3D(id) ?? null;
    if (this.buildingScaleInfo) this.buildingUnitsPerMetre = this.buildingScaleInfo.scale;
  }

  scene3dApplyBuildingScale(): void {
    const id = this.buildingId;
    if (!id || this.blockBuildingIndex !== null) return;   // the block's scale is the Block panel's
    this.shapeManager.setBuildingScale3D(id, this.buildingUnitsPerMetre);
    this._refreshBuildingScaleInfo();
    this.dirty.emit();
  }

  scene3dFrameBuilding(): void {
    const id = this.buildingId;
    if (!id || this.blockBuildingIndex !== null) return;
    this.shapeManager.frameBuilding3D(id);
  }
}
