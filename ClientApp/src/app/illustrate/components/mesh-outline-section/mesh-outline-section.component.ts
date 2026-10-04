import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { hexToRgba01 } from '../../utils/color-utils';

/** Mesh inspector: Outline (colour / pattern / width / boil / glow / merge / sprite shape) + outline rings. Extracted from illustration.component (refactor-plan 2.9D). */
@Component({
  selector: 'app-mesh-outline-section',
  templateUrl: './mesh-outline-section.component.html',
  styleUrls: ['./mesh-outline-section.component.scss'],
})
export class MeshOutlineSectionComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Input() scene3dSelectedIsSprite: boolean = false;
  @Output() dirty = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId']) this.load();
  }

  /** Re-read the section from the engine (the editor calls this on a same-id re-select). */
  load(id: string | null = this.meshId): void {
    if (id) this._syncOutlineFromMesh(id);
  }

  // -- Per-object outline (persistent; separate from the hover outline)
  scene3dOutlineEnabled = false;

  scene3dOutlineColorHex = '#000000';

  scene3dOutlineAlpha = 1;

  scene3dOutlinePatternMode = 0;

  scene3dOutlinePatternColorHex = '#33e5ff';

  scene3dOutlineWidth = 0.03;

  scene3dOutlineFreq = 20;

  scene3dOutlineSpeed = 0;

  scene3dOutlineGlow = 1;

  scene3dOutlineMerge = false;

  scene3dOutlineWobble = 0;

  scene3dOutlineBoilFps = 10;

  scene3dOutlineWobbleFreq = 10;

  /** Sprites only: outline follows the picture, the square, or a solid filled card. */
  scene3dOutlineSpriteShape: 'image' | 'square' | 'card' = 'image';

  _outlineStyleFromControls(): any {
    const c = hexToRgba01(this.scene3dOutlineColorHex);
    const p = hexToRgba01(this.scene3dOutlinePatternColorHex);
    return {
      color: [c[0], c[1], c[2], this.scene3dOutlineAlpha],
      patternColor: [p[0], p[1], p[2]],
      patternMode: +this.scene3dOutlinePatternMode,
      width: this.scene3dOutlineWidth,
      freq: this.scene3dOutlineFreq,
      speed: this.scene3dOutlineSpeed,
      glow: this.scene3dOutlineGlow,
      merge: this.scene3dOutlineMerge,
      wobble: this.scene3dOutlineWobble,
      boilFps: this.scene3dOutlineBoilFps,
      wobbleFreq: this.scene3dOutlineWobbleFreq,
      // Engine ignores spriteShape on non-sprites; only send it where it means something
      ...(this.scene3dSelectedIsSprite ? { spriteShape: this.scene3dOutlineSpriteShape } : {}),
    };
  }

  scene3dOutlineToggle(): void {
    const id = this.meshId;
    if (!id) return;
    const sm = this.shapeManager;
    if (this.scene3dOutlineEnabled) sm.setMeshOutline3D(id, this._outlineStyleFromControls());
    else sm.clearMeshOutline3D(id);
    this.dirty.emit();
  }

  scene3dOutlineChanged(): void {
    if (!this.meshId || !this.scene3dOutlineEnabled) return;
    this.shapeManager.setMeshOutline3D(this.meshId, this._outlineStyleFromControls());
    this.dirty.emit();
  }

  // -- Outline rings (stacked outside the main outline, inner → outer)
  scene3dOutlineRings: { colorHex: string; alpha: number; width: number }[] = [];

  scene3dOutlineAddRing(): void {
    this.scene3dOutlineRings = [...this.scene3dOutlineRings, { colorHex: '#ffffff', alpha: 1, width: 0.02 }];
    this.scene3dOutlineRingsChanged();
  }

  scene3dOutlineRemoveRing(i: number): void {
    this.scene3dOutlineRings = this.scene3dOutlineRings.filter((_, idx) => idx !== i);
    this.scene3dOutlineRingsChanged();
  }

  scene3dOutlineRingsChanged(): void {
    const id = this.meshId;
    if (!id) return;
    const rings = this.scene3dOutlineRings.map(r => {
      const c = hexToRgba01(r.colorHex);
      return { color: [c[0], c[1], c[2], r.alpha] as [number, number, number, number], width: r.width };
    });
    this.shapeManager.setMeshOutlineRings3D(id, rings);
    this.dirty.emit();
  }

  _syncOutlineFromMesh(id: string): void {
    const toHex = (v: number[]) => '#' + v.slice(0, 3).map((n: number) => Math.round((n ?? 0) * 255).toString(16).padStart(2, '0')).join('');
    this.scene3dOutlineRings = (this.shapeManager.getMeshOutlineRings3D(id) ?? []).map(r => ({
      colorHex: r.color ? toHex(r.color as number[]) : '#ffffff',
      alpha: r.color?.[3] ?? 1,
      width: r.width ?? 0.02,
    }));
    const s = this.shapeManager.getMeshOutline3D(id);
    this.scene3dOutlineEnabled = !!s;
    if (!s) return;
    const hex = (v: number[]) => '#' + v.slice(0, 3).map((n: number) => Math.round((n ?? 0) * 255).toString(16).padStart(2, '0')).join('');
    if (s.color) { this.scene3dOutlineColorHex = hex(s.color); this.scene3dOutlineAlpha = s.color[3] ?? 1; }
    if (s.patternColor) this.scene3dOutlinePatternColorHex = hex(s.patternColor);
    this.scene3dOutlinePatternMode = s.patternMode ?? 0;
    this.scene3dOutlineWidth = s.width ?? 0.03;
    this.scene3dOutlineFreq = s.freq ?? 20;
    this.scene3dOutlineSpeed = s.speed ?? 0;
    this.scene3dOutlineGlow = s.glow ?? 1;
    this.scene3dOutlineMerge = s.merge ?? false;
    this.scene3dOutlineWobble = s.wobble ?? 0;
    this.scene3dOutlineBoilFps = s.boilFps ?? 10;
    this.scene3dOutlineWobbleFreq = s.wobbleFreq ?? 10;
    this.scene3dOutlineSpriteShape = s.spriteShape ?? 'image';
  }
}
