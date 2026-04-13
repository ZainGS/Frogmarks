import {
  Component,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { RasterSelectionService } from '../../../shared/services/raster/raster-selection.service';
import { SelectionTool, SelectionInfo } from '../../models/brush-preset.model';

@Component({
  selector: 'app-selection-toolbar',
  standalone: false,
  templateUrl: './selection-toolbar.component.html',
  styleUrl: './selection-toolbar.component.scss',
})
export class SelectionToolbarComponent implements OnInit, OnDestroy {

  activeTool: SelectionTool = 'rect';
  feather = 0;
  info: SelectionInfo = {
    hasSelection: false,
    bounds: null,
    isTransforming: false,
    transform: null,
  };

  private subs: Subscription[] = [];

  constructor(public selectionService: RasterSelectionService) {}

  ngOnInit(): void {
    this.subs.push(
      this.selectionService.tool$.subscribe(t => (this.activeTool = t)),
      this.selectionService.feather$.subscribe(f => (this.feather = f)),
      this.selectionService.info$.subscribe(i => (this.info = i)),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ── Tool selection ────────────────────────────────────────────

  setTool(tool: SelectionTool): void {
    this.selectionService.setTool(tool);
  }

  onFeatherChange(event: Event): void {
    const val = +(event.target as HTMLInputElement).value;
    this.selectionService.setFeather(val);
  }

  // ── Selection actions ─────────────────────────────────────────

  selectAll(): void { this.selectionService.selectAll(); }
  deselect(): void { this.selectionService.deselectAll(); }
  invert(): void { this.selectionService.invertSelection(); }

  // ── Clipboard / delete ────────────────────────────────────────

  async cut(): Promise<void> { await this.selectionService.cut(); }
  async copy(): Promise<void> { await this.selectionService.copy(); }
  paste(): void { this.selectionService.paste(); }
  deleteSelection(): void { this.selectionService.deleteSelection(); }

  // ── Transform ─────────────────────────────────────────────────

  beginTransform(): void { this.selectionService.beginTransform(); }
  commitTransform(): void { this.selectionService.commitTransform(); }
  cancelTransform(): void { this.selectionService.cancelTransform(); }
}
