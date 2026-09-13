import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-uv-editor-panel',
  templateUrl: './uv-editor-panel.component.html',
  styleUrls: ['./uv-editor-panel.component.scss'],
})
export class UvEditorPanelComponent implements OnChanges, OnDestroy {
  @Input() shapeManager: any = null;
  @Input() meshId: string | null = null;
  @Input() session: any = null;
  @Input() uvRenderer: any = null;

  @Output() closeRequest     = new EventEmitter<void>();
  @Output() redrawRequested  = new EventEmitter<void>();
  @Output() showUVPaneChange = new EventEmitter<boolean>();
  @Output() stampToolChange  = new EventEmitter<{active: boolean; size: number; rotationRad: number}>();

  private get sm(): any { return this.shapeManager; }

  // ── Display ────────────────────────────────────────────────────
  showWireframe = true;
  showIslands   = true;
  showUVPane    = false;

  // ── Export ─────────────────────────────────────────────────────
  exportSize = 1024;

  // ── Section collapse state ─────────────────────────────────────
  displayCollapsed = false;
  exportCollapsed  = true;

  // ── Tool mode: brush vs. stamp (Mode B decals) ─────────────────
  activeTool: 'brush' | 'stamp' = 'brush';
  stampSize        = 0.25;
  stampRotationDeg = 0;

  // ── GARP bridge (Bridge 2: UV Paint → Skins) ───────────────────
  garpTarget: { poolId: string; slot: string; poolName: string } | null = null;
  garpSkinName = '';
  garpSaving   = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['session'] && this.session) {
      this.showWireframe = this.session.showWireframe ?? true;
      this.showIslands   = this.session.showIslands   ?? true;
    }
    // Auto-start painting the moment the renderer is ready — no button needed
    if (changes['uvRenderer'] && this.uvRenderer && this.meshId && this.shapeManager) {
      this.sm?.enterUVPaintMode3D?.(this.meshId, this.showUVPane ? this.uvRenderer : null);
    }
    // Refresh GARP target whenever the painted mesh changes
    if (changes['meshId'] || changes['shapeManager']) {
      this.garpTarget = (this.meshId && this.sm) ? this.sm.garpPaintTargetOf3D?.(this.meshId) ?? null : null;
      if (!this.garpTarget) this.garpSkinName = '';
      // Reset stamp tool on mesh change — new mesh always starts in brush mode
      if (changes['meshId'] && this.activeTool === 'stamp') {
        this.activeTool = 'brush';
        this.stampToolChange.emit({ active: false, size: this.stampSize, rotationRad: 0 });
      }
    }
  }

  ngOnDestroy(): void {
    this.sm?.exitUVPaintMode3D?.();
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

  // ── Unwrap ─────────────────────────────────────────────────────

  unwrap(): void {
    this.sm?.autoUnwrap3D?.(this.meshId);
    this._redraw();
  }

  // ── UV Pane toggle ─────────────────────────────────────────────

  toggleUVPane(): void {
    this.showUVPane = !this.showUVPane;
    this.showUVPaneChange.emit(this.showUVPane);
    // Re-enter with/without renderer so Salsa adjusts immediately
    this.sm?.exitUVPaintMode3D?.();
    this.sm?.enterUVPaintMode3D?.(this.meshId, this.showUVPane ? this.uvRenderer : null);
  }

  // ── Export ─────────────────────────────────────────────────────

  exportLayout(): void {
    const canvas: HTMLCanvasElement | null = this.sm?.exportUVLayout3D?.(this.meshId, this.exportSize, this.exportSize) ?? null;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'uv-layout.png';
    a.click();
  }

  // ── GARP save / cancel ─────────────────────────────────────────

  async garpSave(): Promise<void> {
    if (!this.garpTarget || !this.meshId || this.garpSaving) return;
    const name = this.garpSkinName.trim();
    if (!name) return;
    const pool = this.sm?.garp?.listPools?.()?.find((p: any) => p.id === this.garpTarget!.poolId);
    const existingNames: string[] = (Array.isArray(pool?.skins) ? pool.skins : []).map((s: any) => s.name as string);
    if (existingNames.includes(name)) {
      if (!confirm(`A skin named "${name}" already exists. Overwrite?`)) return;
    }
    this.garpSaving = true;
    try {
      const errs: string[] = await this.sm?.saveMeshAsGarpSkin3D?.(this.meshId, name) ?? [];
      if (errs.length) console.warn('[GARP] saveMeshAsGarpSkin3D warnings:', errs);
      this.garpTarget = null;
      this.garpSkinName = '';
      this.close();
    } finally {
      this.garpSaving = false;
    }
  }

  garpCancel(): void {
    this.sm?.cancelGarpPaint3D?.();
    this.garpTarget = null;
    this.garpSkinName = '';
    this.close();
  }

  // ── Stamp tool (Mode B decals) ─────────────────────────────────

  setTool(tool: 'brush' | 'stamp'): void {
    if (this.activeTool === tool) return;
    this.activeTool = tool;
    if (tool === 'stamp') {
      this.sm?.exitUVPaintMode3D?.();
    } else {
      this.sm?.enterUVPaintMode3D?.(this.meshId, this.showUVPane ? this.uvRenderer : null);
    }
    this._emitStamp();
  }

  updateStampParams(): void {
    if (this.activeTool === 'stamp') this._emitStamp();
  }

  private _emitStamp(): void {
    this.stampToolChange.emit({
      active:      this.activeTool === 'stamp',
      size:        this.stampSize,
      rotationRad: this.stampRotationDeg * Math.PI / 180,
    });
  }

  // ── Private helpers ────────────────────────────────────────────

  private _redraw(): void { this.redrawRequested.emit(); }

  close(): void {
    // Deactivate stamp before closing so illustration component can clean up
    if (this.activeTool === 'stamp') {
      this.activeTool = 'brush';
      this.stampToolChange.emit({ active: false, size: this.stampSize, rotationRad: 0 });
    }
    this.closeRequest.emit();
  }
}
