import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/**
 * Edit Block panel: stats, buildings list (edit / remove), add building, scale, block look, delete.
 * Extracted from illustration.component (refactor-plan Phase 2.4c). The editor owns which block is being
 * edited, the switch into editing one of its buildings, and deletion.
 */
@Component({
  selector: 'app-block-panel',
  templateUrl: './block-panel.component.html',
  styleUrls: ['./block-panel.component.scss'],
})
export class BlockPanelComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() blockId: string | null = null;
  @Input() open = false;
  /** Index of the block building currently open in the Building panel (null when none). */
  @Input() blockBuildingIndex: number | null = null;
  @Input() scene3dBuildingArchetypes: string[] = [];
  @Output() dirty = new EventEmitter<void>();
  /** Edit clicked on a building row — the editor switches to the Building panel for it. */
  @Output() editBuilding = new EventEmitter<number>();
  /** The building being edited was removed — the editor leaves block-building edit. */
  @Output() exitBuildingEdit = new EventEmitter<void>();
  @Output() deleteBlock = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['blockId'] || changes['open']) this.confirming = null;
    if (changes['blockId'] && !this.blockId) { this.blockStats = null; this.blockBuildingList = []; this.blockBuildingIndices = []; return; }
    if ((changes['open'] || changes['blockId']) && this.open && this.blockId) this._refreshBlockStats();
  }

  blockStats: { buildings: number; distinctInstancedGeometries: number; totalInstances: number } | null = null;
  blockBuildingList: { index: number; archetype: string; category?: string; placement: { x: number; z: number; ry: number } }[] = [];
  blockBuildingIndices: number[] = [];
  blockScale = 0.1;
  blockAddArchetype = 'brick-townhouse';
  blockAddX = 0;
  blockAddZ = 0;
  /** Rotation of the building to add, in degrees (the engine takes radians). */
  blockAddRyDeg = 0;
  /** Which destructive action is asking first: a building row's ✕ (its index) or 'block' (Delete block). */
  confirming: number | 'block' | null = null;
  /** One block's look (every building in it) — overrides the Environment style for that block. */
  blockStyleRender = '';
  blockStyleToon = false;
  blockStyleRim = false;

  private _refreshBlockStats(): void {
    const id = this.blockId;
    if (!id) return;
    this.blockStats = this.shapeManager.getBlockStats3D(id) ?? null;
    this._syncBlockStyleFromEngine();
    this._refreshBlockBuildingList();
  }

  private _refreshBlockBuildingList(): void {
    const id = this.blockId;
    if (!id) return;
    const list = this.shapeManager.getBlockBuildings3D(id) ?? [];
    this.blockBuildingList = list;
    this.blockBuildingIndices = list.map((_: any, i: number) => i);
  }

  async scene3dAddBuildingToBlock(): Promise<void> {
    const id = this.blockId;
    if (!id) return;
    this.shapeManager.addBuildingToBlock3D(id,
      { archetype: this.blockAddArchetype },
      { x: this.blockAddX, z: this.blockAddZ, ry: (+this.blockAddRyDeg || 0) * Math.PI / 180 }
    );
    this._refreshBlockStats();
    this.dirty.emit();
  }

  async scene3dRemoveBuildingFromBlock(index: number): Promise<void> {
    const id = this.blockId;
    if (!id) return;
    if (this.blockBuildingIndex === index) this.exitBuildingEdit.emit();
    this.shapeManager.removeBlockBuilding3D(id, index);
    this._refreshBlockStats();
    this.dirty.emit();
  }

  scene3dApplyBlockScale(): void {
    const id = this.blockId;
    if (!id) return;
    this.shapeManager.setBlockScale3D(id, this.blockScale);
    this.dirty.emit();
  }

  scene3dSetBlockStyleRender(style: string): void {
    const id = this.blockId;
    if (!id) return;
    this.blockStyleRender = style;
    this.shapeManager.setBlockStyle3D(id, { renderStyle: (style || null) as any });
    this.dirty.emit();
  }

  scene3dSetBlockStyleFlag(field: 'toonShadow' | 'rimLight', on: boolean): void {
    const id = this.blockId;
    if (!id) return;
    if (field === 'toonShadow') this.blockStyleToon = on; else this.blockStyleRim = on;
    this.shapeManager.setBlockStyle3D(id, { [field]: on ? true : null });
    this.dirty.emit();
  }

  private _syncBlockStyleFromEngine(): void {
    const id = this.blockId;
    const bs = id ? this.shapeManager.getBlockStyle3D(id) : null;
    this.blockStyleRender = bs?.renderStyle ?? '';
    this.blockStyleToon = !!bs?.toonShadow;
    this.blockStyleRim = !!bs?.rimLight;
  }
}
