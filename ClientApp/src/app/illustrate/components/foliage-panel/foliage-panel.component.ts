import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { colorToHex, hexToRgba01Obj } from '../../utils/color-utils';

/**
 * Edit Foliage panel: type, seed, shape, blades/branches/flowers/ivy params, colours, delete, save-to-library.
 * Extracted from illustration.component (refactor-plan Phase 2.4a). The editor owns selection (which foliage
 * is being edited, whether the panel is open) and deletion; the panel owns the params.
 */
@Component({
  selector: 'app-foliage-panel',
  templateUrl: './foliage-panel.component.html',
  styleUrls: ['./foliage-panel.component.scss'],
})
export class FoliagePanelComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() foliageId: string | null = null;
  @Input() open = false;
  /** Delete clicked — the editor removes it and clears selection. */
  @Output() delete = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    // Load params whenever the panel opens or starts editing a different foliage object
    if ((changes['open'] || changes['foliageId']) && this.open && this.foliageId) this._initFoliageParams();
  }

  foliageType = 'bush';
  foliageSeed = 1;
  foliageSize = 2.0;
  foliageWidth = 3.0;
  foliageDensity = 0.8;
  foliageRender: 'chunky' | 'card' = 'chunky';
  foliageCelShade = false;
  foliageBloom = false;
  foliagePotMaterial: 'terracotta' | 'ceramic' | 'metal' | 'wood' | 'stone' = 'terracotta';
  foliageColor = '#4a7a35';
  foliageTipColor = '#7ab84a';
  foliageBloomColor = '#e05050';
  foliagePotColor = '#c8703a';
  foliageTrunkColor = '#6b4a2a';
  // Blade params (grass-tuft / tall-grass only) — 0.5 = archetype default
  bladeCurve = 0.5;
  bladeTwist = 0.5;
  bladeFold  = 0.5;
  bladeLod   = 0;
  // Woody params (bush / shrub / hedge / small-tree only — P4 branch primitive)
  branchLevels    = 2;
  branchGnarl     = 0.5;
  branchUpBias    = 0.5;
  foliageStemCount = 1;
  canopyIrregular = 0.5;
  leafGaps        = 0.3;
  hedgeSprigs     = 3;
  branchLod       = 0;
  // Vessel params (potted / planter / window-box only — P4v arrangement)
  foliageSpill      = 0.5;
  foliagePlantCount = 2;
  foliageSoilColor  = '#6b4a2a';
  foliagePlantLod   = 0;
  // Climber params (ivy / vine only — P3 runner primitive)
  ivyMode: 'area' | 'path' = 'area';
  ivyAreaWidth    = 3.0;
  ivyAreaHeight   = 2.4;
  ivyLeafDensity  = 0.5;
  ivyCoverage     = 0.7;
  ivyGrowthBias   = 0.3;
  ivyWander       = 0.35;
  ivyStemColor    = '#8a7060';
  ivyRunnerLod    = 0;
  // Flower params (daisy / rapeseed / lavender / flower-bed only)
  foliageBloomStart      = 0.5;
  foliageBloomScaleCurve = 0.5;
  foliagePetalPitch      = 0.55;
  foliagePetalShape: 'rounded' | 'pointed' | 'notched' | 'strap' = 'rounded';
  foliageBranches        = 0;
  foliageFlowerLod       = 0;
  foliagePetalColor      = '#ffffff';
  foliageCenterColor     = '#f5c000';

  private _initFoliageParams(): void {
    const sm = this.shapeManager;
    const id = this.foliageId;
    if (!id) return;
    const p = sm.getFoliageParams3D(id);
    if (!p) return;
    const col = (v: unknown) => colorToHex(v);
    if (p.type != null)         this.foliageType         = p.type;
    if (p.seed != null)         this.foliageSeed         = p.seed;
    if (p.size != null)         this.foliageSize         = p.size;
    if (p.width != null)        this.foliageWidth        = p.width;
    if (p.density != null)      this.foliageDensity      = p.density;
    if (p.render != null)       this.foliageRender       = p.render;
    if (p.celShade != null)     this.foliageCelShade     = p.celShade;
    if (p.bloom != null)        this.foliageBloom        = p.bloom;
    if (p.potMaterial != null)  this.foliagePotMaterial  = p.potMaterial;
    if (p.foliageColor != null) this.foliageColor        = col(p.foliageColor);
    if (p.tipColor != null)     this.foliageTipColor     = col(p.tipColor);
    if (p.bloomColor != null)   this.foliageBloomColor   = col(p.bloomColor);
    if (p.potColor != null)     this.foliagePotColor     = col(p.potColor);
    if (p.trunkColor != null)   this.foliageTrunkColor   = col(p.trunkColor);
    if (p.bladeCurve != null)       this.bladeCurve           = p.bladeCurve;
    if (p.bladeTwist != null)       this.bladeTwist           = p.bladeTwist;
    if (p.bladeFold  != null)       this.bladeFold            = p.bladeFold;
    if (p.bladeLod   != null)       this.bladeLod             = p.bladeLod;
    if (p.bloomStart != null)       this.foliageBloomStart      = p.bloomStart;
    if (p.bloomScaleCurve != null)  this.foliageBloomScaleCurve = p.bloomScaleCurve;
    if (p.petalPitch != null)       this.foliagePetalPitch      = p.petalPitch;
    if (p.petalShape != null)       this.foliagePetalShape      = p.petalShape as any;
    if (p.branches != null)         this.foliageBranches        = p.branches;
    if (p.flowerLod != null)        this.foliageFlowerLod       = p.flowerLod;
    if (p.petalColor != null)       this.foliagePetalColor      = col(p.petalColor);
    if (p.centerColor != null)      this.foliageCenterColor     = col(p.centerColor);
    if (p.branchLevels != null)     this.branchLevels           = p.branchLevels;
    if (p.branchGnarl != null)      this.branchGnarl            = p.branchGnarl;
    if (p.branchUpBias != null)     this.branchUpBias           = p.branchUpBias;
    if (p.stemCount != null)        this.foliageStemCount       = p.stemCount;
    if (p.canopyIrregular != null)  this.canopyIrregular        = p.canopyIrregular;
    if (p.leafGaps != null)         this.leafGaps               = p.leafGaps;
    if (p.hedgeSprigs != null)      this.hedgeSprigs            = p.hedgeSprigs;
    if (p.branchLod != null)        this.branchLod              = p.branchLod;
    if (p.spill != null)            this.foliageSpill           = p.spill;
    if (p.plantCount != null)       this.foliagePlantCount      = p.plantCount;
    if (p.soilColor != null)        this.foliageSoilColor       = col(p.soilColor);
    if (p.plantLod != null)         this.foliagePlantLod        = p.plantLod;
    if (p.ivyMode != null)          this.ivyMode                = p.ivyMode;
    if (p.areaWidth != null)        this.ivyAreaWidth           = p.areaWidth;
    if (p.areaHeight != null)       this.ivyAreaHeight          = p.areaHeight;
    if (p.leafDensity != null)      this.ivyLeafDensity         = p.leafDensity;
    if (p.coverage != null)         this.ivyCoverage            = p.coverage;
    if (p.growthBias != null)       this.ivyGrowthBias          = p.growthBias;
    if (p.wander != null)           this.ivyWander              = p.wander;
    if (p.stemColor != null)        this.ivyStemColor           = col(p.stemColor);
    if (p.runnerLod != null)        this.ivyRunnerLod           = p.runnerLod;
  }

  scene3dApplyFoliageParam(field: string, value: unknown): void {
    const id = this.foliageId;
    if (!id) return;
    const v = (field.endsWith('Color') && typeof value === 'string')
      ? (() => { const c = hexToRgba01Obj(value); return [c.r, c.g, c.b]; })()
      : value;
    this.shapeManager.setFoliageParams3D(id, { [field]: v });
  }

  scene3dRandomizeFoliageSeed(): void {
    this.foliageSeed = ((Math.random() * 9999) | 0) + 1;
    this.scene3dApplyFoliageParam('seed', this.foliageSeed);
  }

  async scene3dFoliagePromoteToLibrary(): Promise<void> {
    const id = this.foliageId;
    if (!id) return;
    const sm = this.shapeManager;
    const name = `Foliage (${this.foliageType || 'bush'})`;
    await sm.promoteCreatorToLibrary3D(id, { name, tags: ['foliage', this.foliageType].filter(Boolean) });
  }
}
