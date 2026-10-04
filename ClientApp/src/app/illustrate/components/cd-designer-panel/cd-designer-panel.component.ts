import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** The engine's CD view type ('complete' or one editable piece) — derived so it tracks Salsa. */
type CDComponent = Parameters<ShapeManager['setCDActiveComponent3D']>[0];

/**
 * CD jewel-case designer: component view, case style, open scrub, art upload, print export.
 * Extracted from illustration.component (refactor-plan Phase 2.2a). The parent owns whether the designer is
 * active, the kit root id and the case-style default for new kits; Done is handed back via (exit).
 */
@Component({
  selector: 'app-cd-designer-panel',
  templateUrl: './cd-designer-panel.component.html',
  styleUrls: ['./cd-designer-panel.component.scss'],
})
export class CdDesignerPanelComponent {
  @Input() shapeManager: ShapeManager = null;
  /** Document title, used to name the exported PDF. */
  @Input() title = '';
  /** Case style (clear vs black tray) — also the default for the next kit, so the parent keeps it. */
  @Input() trayClear = false;
  @Output() trayClearChange = new EventEmitter<boolean>();
  @Output() exit = new EventEmitter<void>();

  /** A new kit resets the view to the complete case, closed, flaps flat. */
  @Input() set kitRootId(id: string | null) {
    if (id !== this._kitRootId) { this.cdActiveComponent = 'complete'; this.cdScrub = 0; this.cdTrayCardFold = 0; }
    this._kitRootId = id;
  }
  get kitRootId(): string | null { return this._kitRootId; }
  private _kitRootId: string | null = null;

  // The wrapper (.cd-designer-panel) is a flex column; the host takes that role for the panel content.
  @HostBinding('style.display') readonly hostDisplay = 'flex';
  @HostBinding('style.flex-direction') readonly hostDirection = 'column';

  cdActiveComponent: CDComponent = 'complete';
  cdScrub = 0;
  cdTrayCardFold = 0;

  cdSetTrayClear(clear: boolean): void {
    this.trayClear = clear;
    this.trayClearChange.emit(clear);
    if (!this.kitRootId) return;
    this.shapeManager.setCDTrayClear3D(this.kitRootId, clear);
  }

  cdSetComponent(c: CDComponent): void {
    this.shapeManager.setCDActiveComponent3D(c);
  }

  cdSetScrub(t: number): void {
    if (!this.kitRootId) return;
    this.shapeManager.setCDKitScrub3D(this.kitRootId, t);
  }

  cdSetTrayCardFold(fold: number): void {
    if (!this.kitRootId) return;
    this.shapeManager.setCDTrayCardFold3D(this.kitRootId, fold);
  }

  async cdUploadArt(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.kitRootId || this.cdActiveComponent === 'complete') return;
    await this.shapeManager.setCDPieceArt3D(this.kitRootId, this.cdActiveComponent, file);
  }

  cdOnDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file || !this.kitRootId || this.cdActiveComponent === 'complete') return;
    void this.shapeManager.setCDPieceArt3D(this.kitRootId, this.cdActiveComponent, file);
  }

  async cdExportPrintPDF(): Promise<void> {
    if (!this.kitRootId) return;
    const pdf: Blob | null =
      await this.shapeManager.exportCDKitPrintPDF3D(this.kitRootId, {
        title: this.title ?? '',
      }) ?? null;
    if (!pdf) return;
    const url = URL.createObjectURL(pdf);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.title ?? 'cd-print'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async cdExportPrintSet(): Promise<void> {
    if (!this.kitRootId) return;
    const set: { piece: string; blob: Blob; widthMm: number; heightMm: number; dpi: number }[] =
      await this.shapeManager.exportCDKitPrintSet3D(this.kitRootId) ?? [];
    for (const item of set) {
      const url = URL.createObjectURL(item.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cd-${item.piece}-${item.dpi}dpi.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }
}
