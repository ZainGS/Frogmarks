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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['session'] && this.session) {
      this.showWireframe = this.session.showWireframe ?? true;
      this.showIslands   = this.session.showIslands   ?? true;
    }
    // Auto-start painting the moment the renderer is ready — no button needed
    if (changes['uvRenderer'] && this.uvRenderer && this.meshId && this.shapeManager) {
      this.sm?.enterUVPaintMode3D?.(this.meshId, this.showUVPane ? this.uvRenderer : null);
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

  // ── Private helpers ────────────────────────────────────────────

  private _redraw(): void { this.redrawRequested.emit(); }

  close(): void { this.closeRequest.emit(); }
}
