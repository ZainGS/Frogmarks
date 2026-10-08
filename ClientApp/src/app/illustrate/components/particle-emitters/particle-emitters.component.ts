import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import {
  PARTICLE_PRESET_NAMES, PARTICLE_PRESET_SEEDS, ParticleEmitterRecord, ParticlePresetName,
  buildParticleConfig, particleRecordFromEmitter,
} from '../../utils/particle-config';

/** Right panel › Particle Config: every setting of the selected particle emitter (Add Mesh › Particles… adds one;
 *  the outliner / viewport icon selects it). Reads the emitter's live config, writes changes straight back. */
@Component({
  selector: 'app-particle-emitters',
  templateUrl: './particle-emitters.component.html',
  styleUrls: ['./particle-emitters.component.scss'],
})
export class ParticleEmittersComponent implements OnChanges, OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  @Input() emitterId: string | null = null;
  /** A setting changed (the editor marks the document dirty). */
  @Output() dirty = new EventEmitter<void>();

  rec: ParticleEmitterRecord | null = null;

  readonly DIRECTION_PRESETS = [
    { label: 'Up',      dir: [0,  1,  0] },
    { label: 'Down',    dir: [0, -1,  0] },
    { label: 'Forward', dir: [0,  0, -1] },
    { label: 'Back',    dir: [0,  0,  1] },
  ];
  readonly PRESET_NAMES = PARTICLE_PRESET_NAMES;

  private _cfgDebounce: any = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['emitterId'] || changes['shapeManager']) this.load();
  }

  /** Re-read the emitter (selection changed, undo, document load). */
  load(): void {
    if (this._cfgDebounce && this.rec) this._flush(this.rec);   // a change still waiting lands on ITS emitter
    const id = this.emitterId;
    const node = id ? this.shapeManager?.getParticleEmitter3D?.(id) ?? null : null;
    this.rec = id && node ? particleRecordFromEmitter(id, node) : null;
  }

  /** The gizmo moved the emitter: follow its position (the settings stay as edited). */
  syncPosition(): void {
    const rec = this.rec;
    const node = rec ? this.shapeManager?.getParticleEmitter3D?.(rec.id) : null;
    if (!rec || !node) return;
    rec.posX = +(+node.x).toFixed(4); rec.posY = +(+node.y).toFixed(4); rec.posZ = +(+node.z).toFixed(4);
  }

  // ── Config change handlers ───────────────────────────────────────

  onConfigChange(rec: ParticleEmitterRecord): void {
    clearTimeout(this._cfgDebounce);
    this._cfgDebounce = setTimeout(() => this._flush(rec), 50);
  }

  onPositionChange(rec: ParticleEmitterRecord): void {
    const node = this.shapeManager?.getParticleEmitter3D(rec.id);
    if (!node) return;
    node.setXYZ?.(+rec.posX || 0, +rec.posY || 0, +rec.posZ || 0);
    this.shapeManager?.scheduleRender();
    this.dirty.emit();
  }

  onDirectionChange(rec: ParticleEmitterRecord): void {
    const len = Math.sqrt(rec.dirX ** 2 + rec.dirY ** 2 + rec.dirZ ** 2) || 1;
    rec.dirX = +(rec.dirX / len).toFixed(4);
    rec.dirY = +(rec.dirY / len).toFixed(4);
    rec.dirZ = +(rec.dirZ / len).toFixed(4);
    this.onConfigChange(rec);
  }

  applyDirectionPreset(rec: ParticleEmitterRecord, dir: number[]): void {
    rec.dirX = dir[0]; rec.dirY = dir[1]; rec.dirZ = dir[2];
    this.onConfigChange(rec);
  }

  isDirection(rec: ParticleEmitterRecord, dir: number[]): boolean {
    return rec.dirX === dir[0] && rec.dirY === dir[1] && rec.dirZ === dir[2];
  }

  clampLifetimeMax(rec: ParticleEmitterRecord): void {
    if (rec.lifetimeMax < rec.lifetimeMin) rec.lifetimeMax = rec.lifetimeMin;
    this.onConfigChange(rec);
  }

  clampSpeedMax(rec: ParticleEmitterRecord): void {
    if (rec.speedMax < rec.speedMin) rec.speedMax = rec.speedMin;
    this.onConfigChange(rec);
  }

  // ── Flipbook actions ─────────────────────────────────────────────

  addFlipbookFrame(rec: ParticleEmitterRecord): void {
    const id = rec.addFrameDraft.trim();
    if (!id) return;
    rec.animTextures = [...rec.animTextures, id];
    rec.addFrameDraft = '';
    this.onConfigChange(rec);
  }

  removeFlipbookFrame(rec: ParticleEmitterRecord, index: number): void {
    rec.animTextures = rec.animTextures.filter((_, i) => i !== index);
    this.onConfigChange(rec);
  }

  // ── Presets ──────────────────────────────────────────────────────

  applyPreset(rec: ParticleEmitterRecord, preset: ParticlePresetName): void {
    const seed = PARTICLE_PRESET_SEEDS[preset];
    if (!seed) return;
    const id = rec.id;
    Object.assign(rec, seed);
    rec.id = id; // keep id (a seed is a Partial record, so it must never replace the id)
    this._flush(rec);
  }

  // ── Private ──────────────────────────────────────────────────────

  private _flush(rec: ParticleEmitterRecord): void {
    clearTimeout(this._cfgDebounce);
    this._cfgDebounce = null;
    if (!this.shapeManager?.getParticleEmitter3D?.(rec.id)) return;
    this.shapeManager.setParticleEmitterConfig3D(rec.id, buildParticleConfig(rec));
    this.dirty.emit();
  }

  ngOnDestroy(): void {
    // A change still waiting on the debounce lands (deselecting right after a drag kept the old value).
    if (this._cfgDebounce && this.rec) this._flush(this.rec);
  }
}
