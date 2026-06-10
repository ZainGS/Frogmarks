import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

export interface UvPaintSettings {
  paintMode: boolean;
  color: string;
  radius: number;
}

@Component({
  selector: 'app-uv-editor-panel',
  templateUrl: './uv-editor-panel.component.html',
  styleUrls: ['./uv-editor-panel.component.scss'],
})
export class UvEditorPanelComponent implements OnChanges {
  @Input() shapeManager: any = null;
  @Input() meshId: string | null = null;
  @Input() session: any = null;
  @Input() layers: { id: string; name: string }[] = [];

  @Output() closeRequest        = new EventEmitter<void>();
  @Output() redrawRequested     = new EventEmitter<void>();
  @Output() paintSettingsChange = new EventEmitter<UvPaintSettings>();

  private get sm(): any { return this.shapeManager; }

  // ── Selection ──────────────────────────────────────────────────
  selectionMode: 'vertex' | 'edge' | 'face' = 'face';

  // ── Display ────────────────────────────────────────────────────
  showWireframe   = true;
  showIslands     = true;
  showStretch     = false;
  islandHoverMode = false;

  // ── Seams ──────────────────────────────────────────────────────
  seamAngle = 60;

  // ── Layout ─────────────────────────────────────────────────────
  packMargin = 0.002;

  // ── Transform ──────────────────────────────────────────────────
  moveU = 0; moveV = 0;
  scaleU = 1; scaleV = 1;
  rotateDeg = 0;

  // ── Weld ───────────────────────────────────────────────────────
  weldThreshold = 0.001;

  // ── Paint ──────────────────────────────────────────────────────
  paintMode   = false;
  brushColor  = '#ffffff';
  brushRadius = 8;

  // ── Live texture ───────────────────────────────────────────────
  linkedLayerId = '';

  // ── Export ─────────────────────────────────────────────────────
  exportSize = 1024;

  // ── Section collapse state ─────────────────────────────────────
  displayCollapsed   = false;
  seamsCollapsed     = false;
  unwrapCollapsed    = false;
  layoutCollapsed    = false;
  transformCollapsed = false;
  weldCollapsed      = false;
  pinCollapsed       = false;
  paintCollapsed     = false;
  liveTexCollapsed   = false;
  exportCollapsed    = true;

  private get _edges(): number[] {
    return this.sm?.getEditSelection3D?.(this.meshId)?.edges ?? [];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['session'] && this.session) {
      this.showWireframe   = this.session.showWireframe       ?? true;
      this.showIslands     = this.session.showIslands         ?? true;
      this.showStretch     = this.session.showStretchOverlay  ?? false;
      this.islandHoverMode = this.session.islandHoverMode     ?? false;
      const mode = this.session.selection?.mode;
      if (mode) this.selectionMode = mode;
    }
  }

  // ── Selection ──────────────────────────────────────────────────

  setSelectionMode(mode: 'vertex' | 'edge' | 'face'): void {
    this.selectionMode = mode;
    if (this.session) this.session.selection = { ...this.session.selection, mode };
    this._redraw();
  }

  // ── Display toggles ────────────────────────────────────────────

  toggleWireframe(): void {
    this.showWireframe = !this.showWireframe;
    if (this.session) this.session.showWireframe = this.showWireframe;
    this._redraw();
  }

  toggleIslands(): void {
    this.showIslands = !this.showIslands;
    if (this.session) this.session.showIslands = this.showIslands;
    this._redraw();
  }

  toggleStretch(): void {
    this.showStretch = !this.showStretch;
    if (this.session) this.session.showStretchOverlay = this.showStretch;
    this._redraw();
  }

  toggleIslandHoverMode(): void {
    this.islandHoverMode = !this.islandHoverMode;
    if (this.session) this.session.islandHoverMode = this.islandHoverMode;
    this._redraw();
  }

  // ── Seams ──────────────────────────────────────────────────────

  markSeam(): void    { this.sm?.markSeam3D?.(this.meshId, this._edges); this._redraw(); }
  clearSeam(): void   { this.sm?.clearSeam3D?.(this.meshId, this._edges); this._redraw(); }
  clearAllSeams(): void { this.sm?.clearAllSeams3D?.(this.meshId); this._redraw(); }
  suggestSeams(): void { this.sm?.suggestSeams3D?.(this.meshId, this.seamAngle); this._redraw(); }

  // ── Unwrap ─────────────────────────────────────────────────────

  unwrapSmart(): void   { this.sm?.smartProjectUVs3D?.(this.meshId); this._redraw(); }
  unwrapIslands(): void { this.sm?.unwrapUVIslands3D?.(this.meshId); this._redraw(); }
  followActive(): void  { this.sm?.followActiveQuadUVs3D?.(this.meshId); this._redraw(); }

  // ── Layout ─────────────────────────────────────────────────────

  packIslands(): void { this.sm?.packUVIslands3D?.(this.meshId, this.packMargin); this._redraw(); }

  // ── Transform ──────────────────────────────────────────────────

  move(): void   { this.sm?.moveSelectedUVs3D?.(this.meshId, this.moveU, this.moveV); this._redraw(); }
  scale(): void  { this.sm?.scaleSelectedUVs3D?.(this.meshId, this.scaleU, this.scaleV); this._redraw(); }
  rotate(): void { this.sm?.rotateSelectedUVs3D?.(this.meshId, this.rotateDeg * Math.PI / 180); this._redraw(); }
  mirror(axis: 'U' | 'V'): void { this.sm?.mirrorUVs3D?.(this.meshId, axis); this._redraw(); }

  // ── Weld / Split ───────────────────────────────────────────────

  weld(): void  { this.sm?.weldSelectedUVs3D?.(this.meshId, this.weldThreshold); this._redraw(); }
  split(): void { this.sm?.splitSelectedUVs3D?.(this.meshId); this._redraw(); }

  // ── Pin ────────────────────────────────────────────────────────

  pin(): void          { this.sm?.pinSelectedUVs3D?.(this.meshId); this._redraw(); }
  unpinSelected(): void { this.sm?.unpinSelectedUVs3D?.(this.meshId); this._redraw(); }
  unpinAll(): void     { this.sm?.unpinAllUVs3D?.(this.meshId); this._redraw(); }

  // ── UV Paint ───────────────────────────────────────────────────

  togglePaintMode(): void {
    this.paintMode = !this.paintMode;
    this._emitPaintSettings();
  }

  onPaintSettingChange(): void {
    this._emitPaintSettings();
  }

  // ── Live Texture ───────────────────────────────────────────────

  linkTexture(): void   { this.sm?.linkLiveTexture3D?.(this.meshId, this.linkedLayerId); }
  unlinkTexture(): void { this.sm?.unlinkLiveTexture3D?.(this.meshId); }

  // ── Export ─────────────────────────────────────────────────────

  exportLayout(): void {
    const canvas: HTMLCanvasElement | null = this.sm?.exportUVLayout3D?.(this.meshId, this.exportSize, this.exportSize) ?? null;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'uv-layout.png';
    a.click();
  }

  // ── Private helpers ────────────────────────────────────────────

  private _redraw(): void { this.redrawRequested.emit(); }

  private _emitPaintSettings(): void {
    this.paintSettingsChange.emit({ paintMode: this.paintMode, color: this.brushColor, radius: this.brushRadius });
  }

  close(): void { this.closeRequest.emit(); }
}
