import { Component, EventEmitter, Input, Output } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** Bucket types taken from the engine's signatures so they track Salsa. */
type AdvertBucket = Parameters<ShapeManager['addSignageImage3D']>[0];   // includes 'auto' (engine picks the sign)
type ShopBucket = Parameters<ShapeManager['addShopImage3D']>[0];
import { NotifyService } from 'app/shared/services/notify/notify.service';

/**
 * Skins panel: GARP skin variants, vending can designs, city adverts and shop windows.
 * Extracted from illustration.component (refactor-plan Phase 2.1). The parent owns visibility,
 * the UV Editor, city regeneration and the saved can-design list; this panel asks for them via outputs.
 */
@Component({
  selector: 'app-skins-panel',
  templateUrl: './skins-panel.component.html',
  styleUrls: ['./skins-panel.component.scss'],
})
export class SkinsPanelComponent {
  @Input() shapeManager: ShapeManager = null;

  /** Refresh pools/adverts/shops each time the panel is opened. */
  @Input() set open(v: boolean) {
    if (v && !this._open && this.shapeManager) this.refresh();
    this._open = v;
  }
  private _open = false;

  /** Vending can designs per skin — persisted by the parent with the document. */
  @Input() canDesigns: Record<string, string[]> = {};
  @Output() canDesignsChange = new EventEmitter<Record<string, string[]>>();

  @Output() dirty = new EventEmitter<void>();
  /** A GARP slot paint preview was spawned — parent selects it and opens the UV Editor. */
  @Output() paintStart = new EventEmitter<string>();
  /** Paint finished or was cancelled — parent closes the UV Editor. */
  @Output() paintEnd = new EventEmitter<void>();
  @Output() regenerateCity = new EventEmitter<void>();

  constructor(private notifyService: NotifyService) {}

  refresh(): void {
    this._refreshGarpPools();
    this.advertsRefresh();
    this.shopRefresh();
  }

  /** The parent closed the UV Editor: discard an in-progress GARP paint preview (cancelGarpPaint3D is idempotent). */
  handleUvEditorClosed(): void {
    if (!this.garpPaintMeshId) return;
    this.shapeManager.cancelGarpPaint3D();
    this.garpPaintMeshId = null;
    this.garpPaintSlot = null;
    this.garpPaintSkinName = '';
  }

  garpPools: Array<{ id: string; name: string; slots: Array<{ name: string; live: boolean }>; skins: Array<{ name: string }> }> = [];
  garpActivePoolId = '';
  garpNewSkinName = '';
  garpSlotSources: Record<string, string> = {};
  garpSaving = false;
  garpSlotRegionsCache: Record<string, Array<{ label: string; u0: number; v0: number; u1: number; v1: number }>> = {};
  garpPaintMeshId: string | null = null;
  garpPaintSlot: string | null = null;
  garpPaintSkinName = '';
  garpCanSkin = '';
  garpCanPacking = false;
  readonly GARP_VENDING_POOL = 'salsa/vending';
  readonly GARP_MAX_CANS = 8;


  // ── Adverts (Salsa polish round 3 T2): user images on the city's signs, by sign shape ────────────────────────────
  advertBuckets: { bucket: AdvertBucket; label: string; recommendedPx: string; count: number }[] = [];
  advertImages: { id: string; bucket: string; lit: boolean; aspect: number; name?: string; dataUrl: string }[] = [];
  advertShare = 1;
  advertBusy = false;
  advertError = '';
  advertsRefresh(): void {
    const sm = this.shapeManager;
    this.advertBuckets = (sm?.signageBuckets3D() ?? []).map((b: any) => ({
      bucket: b.bucket, label: b.label ?? b.bucket, count: b.count ?? 0,
      recommendedPx: Array.isArray(b.recommendedPx) ? `${b.recommendedPx[0]}x${b.recommendedPx[1]}` : String(b.recommendedPx ?? ''),
    }));
    this.advertImages = sm?.listSignageImages3D() ?? [];
    this.advertShare = sm?.getSignageShare3D() ?? 1;
  }
  advertImagesIn(bucket: string) { return this.advertImages.filter(i => i.bucket === bucket); }
  advertThumbW(bucket: string): number { return bucket === 'portrait' ? 22 : bucket === 'square' ? 40 : bucket === 'fascia' ? 96 : 64; }
  advertThumbH(bucket: string): number { return bucket === 'portrait' ? 66 : bucket === 'square' ? 40 : bucket === 'fascia' ? 18 : 36; }
  async advertAdd(bucket: AdvertBucket, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    this.advertBusy = true; this.advertError = '';
    const errs: string[] = [];
    try {
      // ONE batched call: one pack, one atlas rebuild, one city regen (per-file adds regenerated the city N times).
      const urls = await Promise.all(files.map(f => new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); })));
      const sm = this.shapeManager;
      const outs: any[] = sm.addSignageImages3D
        ? await sm.addSignageImages3D(urls.map((u, k) => ({ bucket, source: u, opts: { name: files[k].name } })))
        : await Promise.all(urls.map((u, k) => sm.addSignageImage3D(bucket, u, { name: files[k].name, regen: k === urls.length - 1 })));
      outs.forEach((out, k) => { if (out?.errors?.length) errs.push(`${files[k].name}: ${out.errors.join(', ')}`); });
    } finally {
      this.advertBusy = false;
      this.advertError = errs.join(' · ');
      this.advertsRefresh();
      this.dirty.emit();
    }
  }
  async advertRemove(id: string): Promise<void> {
    this.advertBusy = true;
    try { await this.shapeManager.removeSignageImage3D(id); } finally { this.advertBusy = false; this.advertsRefresh(); this.dirty.emit(); }
  }
  advertToggleLit(id: string, lit: boolean): void {
    this.shapeManager.setSignageImageLit3D(id, lit);
    this.advertsRefresh(); this.dirty.emit();
  }
  advertSetShare(v: number): void {
    this.advertShare = v;
    this.shapeManager.setSignageShare3D(v);
    this.dirty.emit();
  }
  async advertClear(): Promise<void> {
    this.advertBusy = true;
    try { await this.shapeManager.clearSignage3D(); } finally { this.advertBusy = false; this.advertsRefresh(); this.dirty.emit(); }
  }

  // ── Shop windows (Salsa persona polish C4) ──
  shopBuckets: { bucket: ShopBucket; label: string; recommendedPx: string }[] = [];
  shopImages: { id: string; bucket: string; lit: boolean; name?: string; dataUrl: string }[] = [];
  shopShare = 1;
  shopBusy = false;
  shopError = '';
  shopRefresh(): void {
    const sm = this.shapeManager;
    this.shopBuckets = (sm?.shopImageBuckets3D() ?? []).map((b: any) => ({
      bucket: b.bucket, label: b.label ?? b.bucket,
      recommendedPx: Array.isArray(b.recommendedPx) ? `${b.recommendedPx[0]}x${b.recommendedPx[1]}` : String(b.recommendedPx ?? ''),
    }));
    this.shopImages = sm?.listShopImages3D() ?? [];
    this.shopShare = sm?.getShopImageShare3D() ?? 1;
  }
  shopImagesIn(bucket: string) { return this.shopImages.filter(i => i.bucket === bucket); }
  async shopAdd(bucket: ShopBucket, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    this.shopBusy = true; this.shopError = '';
    const errs: string[] = [];
    try {
      for (let k = 0; k < files.length; k++) {
        const url = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(files[k]); });
        const out = await this.shapeManager.addShopImage3D(bucket, url, { name: files[k].name, regen: k === files.length - 1 });
        if (out?.errors?.length) errs.push(`${files[k].name}: ${out.errors.join(', ')}`);
      }
    } finally { this.shopBusy = false; this.shopError = errs.join(' · '); this.shopRefresh(); this.dirty.emit(); }
  }
  async shopRemove(id: string): Promise<void> {
    this.shopBusy = true;
    try { await this.shapeManager.removeShopImage3D(id); } finally { this.shopBusy = false; this.shopRefresh(); this.dirty.emit(); }
  }
  shopToggleLit(id: string, lit: boolean): void { this.shapeManager.setShopImageLit3D(id, lit); this.shopRefresh(); this.dirty.emit(); }
  shopSetShare(v: number): void { this.shopShare = v; this.shapeManager.setShopImageShare3D(v); this.dirty.emit(); }
  async shopClear(): Promise<void> {
    this.shopBusy = true;
    try { await this.shapeManager.clearShopImages3D(); } finally { this.shopBusy = false; this.shopRefresh(); this.dirty.emit(); }
  }

  private _refreshGarpPools(): void {
    const sm = this.shapeManager;
    const rawPools: any[] = sm.garp?.listPools() ?? [];
    this.garpPools = rawPools.map((p: any) => {
      // listPools() returns skins as a count (number); getPool() may return the full skin list
      const full = sm.garp?.getPool(p.id);
      const skinsRaw = Array.isArray(full?.skins) ? full.skins
                     : Array.isArray(p.skins)      ? p.skins
                     : [];
      return { ...p, skins: skinsRaw };
    });
    if (this.garpPools.length > 0 && !this.garpPools.find((p: any) => p.id === this.garpActivePoolId)) {
      this.garpActivePoolId = this.garpPools[0].id;
    }
    const vend = this.garpPools.find(p => p.id === this.GARP_VENDING_POOL);
    const skinNames = (vend?.skins ?? []).map(s => s.name);
    if (!skinNames.includes(this.garpCanSkin)) this.garpCanSkin = skinNames[0] ?? '';
  }

  get garpActivePool(): { id: string; name: string; slots: Array<{ name: string; live: boolean }>; skins: Array<{ name: string }> } | null {
    return this.garpPools.find(p => p.id === this.garpActivePoolId) ?? null;
  }

  get garpCanSave(): boolean {
    return !!this.garpNewSkinName.trim() && !this.garpSaving && Object.keys(this.garpSlotSources).length > 0;
  }

  async garpUploadSlotImage(slotName: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.garpSlotSources = { ...this.garpSlotSources, [slotName]: reader.result as string };
    };
    reader.readAsDataURL(file);
  }

  async garpUseCanvas(slotName: string): Promise<void> {
    const sm = this.shapeManager;
    const dataUrl: string | null = await sm.exportActiveLayerDataUrl() ?? null;
    if (!dataUrl) { console.warn('[GARP] exportActiveLayerDataUrl: no active raster layer'); return; }
    this.garpSlotSources = { ...this.garpSlotSources, [slotName]: dataUrl };
  }

  garpGetSlotRegions(slotName: string): Array<{ label: string; u0: number; v0: number; u1: number; v1: number }> {
    const key = `${this.garpActivePoolId}:${slotName}`;
    if (!this.garpSlotRegionsCache[key]) {
      const sm = this.shapeManager;
      this.garpSlotRegionsCache[key] = sm.garpSlotRegions3D(this.garpActivePoolId, slotName) ?? [];
    }
    return this.garpSlotRegionsCache[key];
  }

  garpStartPaint(slotName: string): void {
    const sm = this.shapeManager;
    const meshId: string | null = sm.paintGarpSlot3D(this.garpActivePoolId, slotName) ?? null;
    if (!meshId) return;
    this.garpPaintMeshId = meshId;
    this.garpPaintSlot = slotName;
    this.garpPaintSkinName = '';
    // Parent selects the preview mesh + opens the UV Editor so the user can see what they're painting
    this.paintStart.emit(meshId);
  }

  async garpSaveFromPaint(): Promise<void> {
    if (!this.garpPaintMeshId || this.garpSaving) return;
    const name = this.garpPaintSkinName.trim();
    if (!name) return;
    const pool = this.garpActivePool;
    const existingNames = (Array.isArray(pool?.skins) ? pool.skins : []).map((s: any) => s.name as string);
    if (existingNames.includes(name)) {
      if (!confirm(`A skin named "${name}" already exists. Overwrite?`)) return;
    }
    this.garpSaving = true;
    try {
      const sm = this.shapeManager;
      const errs: string[] = await sm.saveMeshAsGarpSkin3D(this.garpPaintMeshId, name) ?? [];
      if (errs.length) console.warn('[GARP] saveMeshAsGarpSkin3D warnings:', errs);
      this.garpPaintMeshId = null;
      this.garpPaintSlot = null;
      this.garpPaintSkinName = '';
      this.paintEnd.emit();
      this._refreshGarpPools();
      this.dirty.emit();
    } finally {
      this.garpSaving = false;
    }
  }

  garpCancelPaint(): void {
    this.shapeManager.cancelGarpPaint3D();
    this.garpPaintMeshId = null;
    this.garpPaintSlot = null;
    this.garpPaintSkinName = '';
    this.paintEnd.emit();
  }

  async garpSaveSkin(): Promise<void> {
    const name = this.garpNewSkinName.trim();
    if (!name || !this.garpActivePoolId || this.garpSaving) return;
    const pool = this.garpActivePool;
    if (!pool) return;

    const slots: Record<string, { kind: 'image'; dataUrl: string }> = {};
    for (const slot of pool.slots) {
      const src = this.garpSlotSources[slot.name];
      if (src) slots[slot.name] = { kind: 'image', dataUrl: src };
    }
    if (Object.keys(slots).length === 0) return;

    const existingNames = (Array.isArray(pool.skins) ? pool.skins : []).map((s: any) => s.name as string);
    if (existingNames.includes(name)) {
      if (!confirm(`A skin named "${name}" already exists. Overwrite?`)) return;
    }

    this.garpSaving = true;
    try {
      const sm = this.shapeManager;
      const errs: string[] = await sm.addGarpSkin3D(this.garpActivePoolId, name, slots) ?? [];
      if (errs.length) console.warn('[GARP] addGarpSkin3D warnings:', errs);
      this.garpNewSkinName = '';
      this.garpSlotSources = {};
      this._refreshGarpPools();
      this.dirty.emit();
    } finally {
      this.garpSaving = false;
    }
  }

  async garpDeleteSkin(poolId: string, skinName: string): Promise<void> {
    if (!confirm(`Delete skin "${skinName}"?`)) return;
    const sm = this.shapeManager;
    await sm.removeGarpSkin3D(poolId, skinName);
    this._refreshGarpPools();
    this.dirty.emit();
  }

  get garpCanList(): string[] { return this.canDesigns[this.garpCanSkin] ?? []; }

  /** Salsa stretches each design to a 128x256 cell, so storing at that size loses nothing and keeps the doc small. */
  private _garpFitToCell(dataUrl: string): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 256;
        c.getContext('2d')!.drawImage(img, 0, 0, 128, 256);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async garpAddCanDesigns(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length || !this.garpCanSkin) return;
    const room = this.GARP_MAX_CANS - this.garpCanList.length;
    const urls: string[] = [];
    for (const f of files.slice(0, Math.max(0, room))) {
      const raw = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); });
      urls.push(await this._garpFitToCell(raw));
    }
    if (files.length > room) this.notifyService.error(`A skin holds at most ${this.GARP_MAX_CANS} can designs.`);
    await this._garpSetCans([...this.garpCanList, ...urls]);
  }

  async garpRemoveCanDesign(i: number): Promise<void> {
    await this._garpSetCans(this.garpCanList.filter((_, idx) => idx !== i));
  }

  async garpMoveCanDesign(i: number, dir: -1 | 1): Promise<void> {
    const list = [...this.garpCanList];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await this._garpSetCans(list);
  }

  private async _garpSetCans(list: string[]): Promise<void> {
    const skin = this.garpCanSkin;
    if (!skin) return;
    this.canDesigns = { ...this.canDesigns, [skin]: list };
    this.canDesignsChange.emit(this.canDesigns);
    this.dirty.emit();
    // Engine needs 1-8 images; an emptied list keeps the last packed sheet until new designs are added
    if (!list.length) return;
    this.garpCanPacking = true;
    try {
      const errs = await this.shapeManager.packVendingCanLabels3D(skin, list) ?? [];
      if (errs.length) console.warn('[GARP] packVendingCanLabels3D:', errs);
    } finally {
      this.garpCanPacking = false;
    }
  }

  garpDownloadCanTemplate(): void {
    const url = this.shapeManager.vendingLabelTemplate3D();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'can-label-template.png';
    a.click();
  }

  garpRegenerateCity(): void {
    this.regenerateCity.emit();
  }
}
