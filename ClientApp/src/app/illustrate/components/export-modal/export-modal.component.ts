import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { ProjectFileService } from '../../services/project-file.service';
import { IllustrationPersistenceService } from '../../services/illustration-persistence.service';

/** Export dialog (image / .frogcart scene / .frogmarks workfile). Created by *ngIf, so each open starts fresh.
 *  Extracted from illustration.component (refactor-plan 2.9F). The PNG snapshot is the editor's (it owns the
 *  canvas view), so the image tab asks for it through `exportImageRequested`. */
@Component({
  selector: 'app-export-modal',
  templateUrl: './export-modal.component.html',
  styleUrls: ['./export-modal.component.scss'],
})
export class ExportModalComponent implements OnInit {
  @Input() shapeManager: ShapeManager = null;
  @Input() docTitle: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() exportImageRequested = new EventEmitter<void>();

  tab: 'image' | 'scene' | 'workfile' = 'image';

  constructor(public files: ProjectFileService, private persist: IllustrationPersistenceService) {}

  ngOnInit(): void {
    this.files.exportCartTitle = this.docTitle ?? this.persist.illustration?.name ?? 'Untitled';
    this.files.exportCartAuthor = '';
    this.files.exportCartDescription = '';
    this.files.exportCartBusy = false;
    this.refreshExportCartSounds();
  }

  /** Sound assets the scene uses — listed so the user sees what the .frogcart will bundle. */
  refreshExportCartSounds(): void {
    const sounds: { assetId: string }[] = (this.shapeManager.listUISounds() ?? []).map((a: any) => typeof a === 'string' ? { assetId: a } : a);
    this.files.exportCartSounds = sounds.map((s: any) => s.assetId ?? s);
  }

  exportImage(): void {
    this.exportImageRequested.emit();
    this.close.emit();
  }

  async exportWorkfile(): Promise<void> {
    await this.files.exportFrogFile();
    this.close.emit();
  }
}
