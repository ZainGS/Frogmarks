import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** Mesh inspector: Behavior (per-mesh script: source, enable, snippets, error). Extracted from illustration.component (refactor-plan 2.9D). */
@Component({
  selector: 'app-mesh-behavior-section',
  templateUrl: './mesh-behavior-section.component.html',
  styleUrls: ['./mesh-behavior-section.component.scss'],
})
export class MeshBehaviorSectionComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Output() dirty = new EventEmitter<void>();
  @Output() scriptIdsChanged = new EventEmitter<void>();
  @Output() openApiRef = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId']) this.load();
  }

  /** Re-read the section from the engine (the editor calls this on a same-id re-select). */
  load(id: string | null = this.meshId): void {
    if (id) this._syncScriptFromMesh(id);
  }

  // -- Script behavior (code editor) for selected mesh
  scene3dScriptSource = '';

  scene3dScriptEnabled = false;

  scene3dScriptError: { message: string; line?: number } | null = null;

  scene3dScriptSnippets: { name: string; description: string; source: string }[] = [];

  _scriptSaveTimer: any = null;

  _syncScriptFromMesh(id: string): void {
    const sm = this.shapeManager;
    const b = sm.getScriptBehavior3D(id);
    this.scene3dScriptSource = b?.source ?? '';
    this.scene3dScriptEnabled = b?.enabled ?? false;
    this.scene3dScriptError = null;
    if (!this.scene3dScriptSnippets.length) {
      this.scene3dScriptSnippets = sm.getScriptSnippets3D() ?? [];
    }
  }

  scene3dScriptSourceChanged(): void {
    clearTimeout(this._scriptSaveTimer);
    this._scriptSaveTimer = setTimeout(() => {
      const id = this.meshId;
      if (!id) return;
      const sm = this.shapeManager;
      const src = this.scene3dScriptSource;
      if (!src.trim()) { sm.removeScriptBehavior3D(id); this.scene3dScriptError = null; this.scriptIdsChanged.emit(); return; }
      sm.setScriptBehavior3D(id, src, { enabled: this.scene3dScriptEnabled });
      const v = sm.validateScript3D(src);
      this.scene3dScriptError = v && !v.ok ? (v.error ?? { message: 'Invalid script' }) : null;
      this.scriptIdsChanged.emit();
      this.dirty.emit();
    }, 500);
  }

  scene3dScriptEnabledChanged(): void {
    const id = this.meshId;
    if (!id) return;
    const sm = this.shapeManager;
    if (!sm.getScriptBehavior3D(id)) {
      if (!this.scene3dScriptSource.trim()) return;
      sm.setScriptBehavior3D(id, this.scene3dScriptSource, { enabled: this.scene3dScriptEnabled });
    } else {
      sm.setScriptEnabled3D(id, this.scene3dScriptEnabled);
    }
    this.scriptIdsChanged.emit();
    this.dirty.emit();
  }

  scene3dScriptInsertSnippet(source: string): void {
    if (!source) return;
    this.scene3dScriptSource = source;
    this.scene3dScriptEnabled = true;
    const id = this.meshId;
    if (id) {
      this.shapeManager.setScriptBehavior3D(id, source, { enabled: true });
      this.scene3dScriptError = null;
      this.scriptIdsChanged.emit();
      this.dirty.emit();
    }
  }

  scene3dScriptTab(ev: Event): void {
    ev.preventDefault();
    const ta = ev.target as HTMLTextAreaElement;
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + 2;
    this.scene3dScriptSource = ta.value;
    this.scene3dScriptSourceChanged();
  }
}
