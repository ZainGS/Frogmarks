import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** Mesh inspector: HTML Texture (live HTML rendered onto the mesh: size, background, quality). Extracted from illustration.component (refactor-plan 2.9D). */
@Component({
  selector: 'app-mesh-html-texture-section',
  templateUrl: './mesh-html-texture-section.component.html',
  styleUrls: ['./mesh-html-texture-section.component.scss'],
})
export class MeshHtmlTextureSectionComponent implements OnChanges, OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Input() scene3dIsRibbon: boolean = false;
  @Input() scene3dRibbonUvTileCount: number = 1;
  @Output() dirty = new EventEmitter<void>();
  @Output() texLibDirty = new EventEmitter<void>();
  @Output() ribbonUvTileCountChange = new EventEmitter<number>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId']) this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this._scene3dHtmlDebounce);
  }

  /** Re-read the section from the engine (the editor calls this on a same-id re-select). */
  load(id: string | null = this.meshId): void {
    if (id) this._syncHtmlTextureFromMesh(id);
  }

  // HTML texture
  scene3dHtmlEnabled = false;

  scene3dHtmlContent = '';

  scene3dHtmlTexWidth = 512;

  scene3dHtmlTexHeight = 128;

  scene3dHtmlTexBg = '#000000';

  scene3dHtmlTexBgTransparent = true;

  scene3dHtmlTexQuality: 64 | 128 | 256 = 128;  // targetHeight (px) for ribbon auto-sizing

  get scene3dEffectiveTexBg(): string {
    return this.scene3dHtmlTexBgTransparent ? '' : this.scene3dHtmlTexBg;
  }

  _scene3dHtmlDebounce: any;

  /** HTML-texture state of the mesh (the source itself can't be read back from the engine). */
  _syncHtmlTextureFromMesh(id: string): void {
    this.scene3dHtmlEnabled = this.shapeManager.hasHtmlTexture3D(id) ?? false;
    // NOTE: no engine getter exists to read back the HTML source (getHtmlTexture3D
    // was a phantom API — the content field always came back empty on re-select).
    // TODO: ask Salsa for a getHtmlTexture3D counterpart to setHtmlTexture3D.
    this.scene3dHtmlContent = '';
  }

  async scene3dApplyHtmlTexture(): Promise<void> {
    if (!this.meshId) return;
    const sm = this.shapeManager;
    if (this.scene3dHtmlEnabled) {
      await sm.updateHtmlTexture3D(this.meshId, this.scene3dHtmlContent, { backgroundColor: this.scene3dEffectiveTexBg, stretchToFit: true });
    } else {
      let w = this.scene3dHtmlTexWidth;
      let h = this.scene3dHtmlTexHeight;
      if (this.scene3dIsRibbon) {
        const computed = sm.computeRibbonTextureSize3D(
          this.meshId, this.scene3dHtmlTexQuality
        ) ?? { width: 512, height: 128, fontSize: 128 };
        w = computed.width;
        h = computed.height;
        this.scene3dHtmlTexWidth = w;
        this.scene3dHtmlTexHeight = h;
        // fontSize is ignored — stretchToFit overrides it
      }
      await sm.setHtmlTexture3D(
        this.meshId,
        this.scene3dHtmlContent,
        w, h,
        { backgroundColor: this.scene3dEffectiveTexBg, stretchToFit: true },
      );
      this.scene3dHtmlEnabled = true;
    }
    this.texLibDirty.emit();
  }

  scene3dOnHtmlContentChange(): void {
    clearTimeout(this._scene3dHtmlDebounce);
    if (!this.scene3dHtmlEnabled) return;
    this._scene3dHtmlDebounce = setTimeout(() => {
      const sm = this.shapeManager;
      void sm.updateHtmlTexture3D(this.meshId, this.scene3dHtmlContent, { backgroundColor: this.scene3dEffectiveTexBg, stretchToFit: true });
      this.texLibDirty.emit();
    }, 300);
  }

  async scene3dSetHtmlTexQuality(quality: 64 | 128 | 256): Promise<void> {
    this.scene3dHtmlTexQuality = quality;
    if (!this.scene3dHtmlEnabled || !this.meshId) return;
    const sm = this.shapeManager;
    sm.removeHtmlTexture3D(this.meshId);
    this.scene3dHtmlEnabled = false;
    await this.scene3dApplyHtmlTexture();
    this.texLibDirty.emit();
  }

  scene3dRemoveHtmlTexture(): void {
    if (!this.meshId) return;
    this.shapeManager.removeHtmlTexture3D(this.meshId);
    this.scene3dHtmlEnabled = false;
    this.scene3dHtmlContent = '';
    this.texLibDirty.emit();
  }

  get scene3dHtmlPlaceholder(): string {
    return this.scene3dIsRibbon
      ? `<div style="font:bold 1px sans-serif;color:white;letter-spacing:0.1em">★ HELLO 3D ★ &nbsp;&nbsp; ★ HELLO 3D ★ &nbsp;&nbsp;</div>`
      : `<div style="font:bold 1px sans-serif;color:white">Hello 3D!</div>`;
  }
}
