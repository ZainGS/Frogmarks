import { Component, Input, OnDestroy } from '@angular/core';

export interface ParticleEmitterRecord {
  id: string;
  name: string;
  visible: boolean;
  isRenaming: boolean;
  nameDraft: string;
  // Position (from node)
  posX: number; posY: number; posZ: number;
  // Emission
  emitRate: number;
  maxParticles: number;
  loop: boolean;
  dirX: number; dirY: number; dirZ: number;
  spreadDeg: number;
  // Lifetime & Speed
  lifetimeMin: number; lifetimeMax: number;
  speedMin: number; speedMax: number;
  // Size
  startSizeMin: number; startSizeMax: number;
  endSizeMin: number; endSizeMax: number;
  // Color
  startColorHex: string; startAlpha: number;
  endColorHex: string;   endAlpha: number;
  // Physics
  gravX: number; gravY: number; gravZ: number;
  turbulence: number;
  // Texture
  textureIndex: number;
  animTextures: string[];
  animFrameTime: number;
  useFlipbook: boolean;
  addFrameDraft: string;
}

const PRESET_SEEDS: Record<string, Partial<ParticleEmitterRecord>> = {
  dust: {
    name: 'Dust', emitRate: 20, maxParticles: 150, spreadDeg: 180, loop: true,
    lifetimeMin: 3, lifetimeMax: 6, speedMin: 0.05, speedMax: 0.2,
    startSizeMin: 0.05, startSizeMax: 0.15, endSizeMin: 0, endSizeMax: 0,
    startColorHex: '#c8a96e', startAlpha: 0.8, endColorHex: '#c8a96e', endAlpha: 0,
    gravX: 0, gravY: -0.05, gravZ: 0, turbulence: 0.3, dirX: 0, dirY: 1, dirZ: 0,
  },
  sparks: {
    name: 'Sparks', emitRate: 60, maxParticles: 200, spreadDeg: 20, loop: true,
    lifetimeMin: 0.3, lifetimeMax: 0.8, speedMin: 1.5, speedMax: 4.0,
    startSizeMin: 0.02, startSizeMax: 0.06, endSizeMin: 0, endSizeMax: 0,
    startColorHex: '#ff8800', startAlpha: 1, endColorHex: '#ff2200', endAlpha: 0,
    gravX: 0, gravY: -2.0, gravZ: 0, turbulence: 0.1, dirX: 0, dirY: 1, dirZ: 0,
  },
  snow: {
    name: 'Snow', emitRate: 15, maxParticles: 300, spreadDeg: 160, loop: true,
    lifetimeMin: 6, lifetimeMax: 12, speedMin: 0.1, speedMax: 0.3,
    startSizeMin: 0.08, startSizeMax: 0.2, endSizeMin: 0.04, endSizeMax: 0.1,
    startColorHex: '#ffffff', startAlpha: 0.9, endColorHex: '#ffffff', endAlpha: 0,
    gravX: 0, gravY: -0.1, gravZ: 0, turbulence: 0.05, dirX: 0, dirY: -1, dirZ: 0,
  },
  magic: {
    name: 'Magic', emitRate: 40, maxParticles: 200, spreadDeg: 180, loop: true,
    lifetimeMin: 1.5, lifetimeMax: 3, speedMin: 0.3, speedMax: 1.0,
    startSizeMin: 0.05, startSizeMax: 0.15, endSizeMin: 0, endSizeMax: 0,
    startColorHex: '#9b59b6', startAlpha: 1, endColorHex: '#7b3fa6', endAlpha: 0,
    gravX: 0, gravY: 0.1, gravZ: 0, turbulence: 0.4, dirX: 0, dirY: 1, dirZ: 0,
  },
};

function makeRecord(id: string, preset?: string): ParticleEmitterRecord {
  const base: ParticleEmitterRecord = {
    id, name: 'Particle Emitter', visible: true, isRenaming: false, nameDraft: '',
    posX: 0, posY: 0, posZ: 0,
    emitRate: 30, maxParticles: 200, loop: true,
    dirX: 0, dirY: 1, dirZ: 0, spreadDeg: 0,
    lifetimeMin: 1, lifetimeMax: 2, speedMin: 0.3, speedMax: 0.8,
    startSizeMin: 0.05, startSizeMax: 0.15, endSizeMin: 0, endSizeMax: 0,
    startColorHex: '#ffffff', startAlpha: 1, endColorHex: '#ffffff', endAlpha: 0,
    gravX: 0, gravY: -0.3, gravZ: 0, turbulence: 0,
    textureIndex: 0, animTextures: [], animFrameTime: 0.1, useFlipbook: false,
    addFrameDraft: '',
  };
  if (preset && PRESET_SEEDS[preset]) return { ...base, ...PRESET_SEEDS[preset], id };
  return base;
}

@Component({
  selector: 'app-particle-emitters',
  templateUrl: './particle-emitters.component.html',
  styleUrls: ['./particle-emitters.component.scss'],
})
export class ParticleEmittersComponent implements OnDestroy {
  @Input() shapeManager: any = null;

  emitters: ParticleEmitterRecord[] = [];
  editingId: string | null = null;
  showPresetPicker = false;
  showResetMenu = false;

  // Bloom — scene-level
  bloomEnabled = false;
  bloomThreshold = 0.5;
  bloomIntensity = 1.2;

  readonly DIRECTION_PRESETS = [
    { label: 'Up',      dir: [0,  1,  0] },
    { label: 'Down',    dir: [0, -1,  0] },
    { label: 'Forward', dir: [0,  0, -1] },
    { label: 'Outward', dir: [0,  0,  1] },
  ];
  readonly PRESET_NAMES = ['dust', 'sparks', 'snow', 'magic'];

  private _cfgDebounce: any = null;

  // ── Helpers ─────────────────────────────────────────────────────

  get editingRecord(): ParticleEmitterRecord | null {
    return this.emitters.find(e => e.id === this.editingId) ?? null;
  }

  dotColor(rec: ParticleEmitterRecord): string {
    return rec.startColorHex;
  }

  // ── List actions ─────────────────────────────────────────────────

  addEmitter(preset?: string): void {
    this.showPresetPicker = false;
    const sm = this.shapeManager;
    if (!sm?.addParticleEmitter3D) return;
    const id: string = sm.addParticleEmitter3D(0, 0, 0, {}, preset ?? undefined);
    if (!id) return;
    const rec = makeRecord(id, preset);
    this.emitters.push(rec);
    this.editingId = id;
    this._flush(rec);
  }

  deleteEmitter(id: string, event: Event): void {
    event.stopPropagation();
    this.shapeManager?.removeParticleEmitter3D?.(id);
    this.emitters = this.emitters.filter(e => e.id !== id);
    if (this.editingId === id) this.editingId = null;
  }

  toggleVisibility(rec: ParticleEmitterRecord, event: Event): void {
    event.stopPropagation();
    const node = this.shapeManager?.getParticleEmitter3D?.(rec.id);
    if (node) {
      rec.visible = !rec.visible;
      node.visible = rec.visible;
      this.shapeManager?.scheduleRender?.();
    }
  }

  startRename(rec: ParticleEmitterRecord, event: Event): void {
    event.stopPropagation();
    rec.nameDraft = rec.name;
    rec.isRenaming = true;
  }

  commitRename(rec: ParticleEmitterRecord): void {
    rec.isRenaming = false;
    if (rec.nameDraft.trim()) {
      rec.name = rec.nameDraft.trim();
      const node = this.shapeManager?.getParticleEmitter3D?.(rec.id);
      if (node) node.name = rec.name;
    }
  }

  openEdit(id: string): void {
    this.editingId = id;
    this.showResetMenu = false;
  }

  closeEdit(): void {
    this.editingId = null;
    this.showResetMenu = false;
  }

  // ── Config change handlers ───────────────────────────────────────

  onConfigChange(rec: ParticleEmitterRecord): void {
    clearTimeout(this._cfgDebounce);
    this._cfgDebounce = setTimeout(() => this._flush(rec), 50);
  }

  onPositionChange(rec: ParticleEmitterRecord): void {
    const node = this.shapeManager?.getParticleEmitter3D?.(rec.id);
    node?.setPosition3D?.(rec.posX, rec.posY, rec.posZ);
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

  // ── Bloom ────────────────────────────────────────────────────────

  toggleBloom(): void {
    this.bloomEnabled = !this.bloomEnabled;
    if (this.bloomEnabled) {
      this.shapeManager?.enableBloom3D?.(this.bloomThreshold, this.bloomIntensity);
    } else {
      this.shapeManager?.disableBloom3D?.();
    }
  }

  onBloomThresholdChange(): void {
    if (this.bloomEnabled) this.shapeManager?.setBloomThreshold3D?.(this.bloomThreshold);
  }

  onBloomIntensityChange(): void {
    if (this.bloomEnabled) this.shapeManager?.setBloomIntensity3D?.(this.bloomIntensity);
  }

  // ── Action bar ───────────────────────────────────────────────────

  resetToPreset(rec: ParticleEmitterRecord, preset: string): void {
    this.showResetMenu = false;
    const seed = PRESET_SEEDS[preset];
    if (!seed) return;
    Object.assign(rec, seed);
    rec.id = rec.id; // keep id
    this._flush(rec);
  }

  duplicateEmitter(rec: ParticleEmitterRecord): void {
    const sm = this.shapeManager;
    if (!sm?.addParticleEmitter3D) return;
    const id: string = sm.addParticleEmitter3D(rec.posX + 0.5, rec.posY, rec.posZ, this._buildConfig(rec));
    if (!id) return;
    const dupe: ParticleEmitterRecord = {
      ...rec,
      id,
      name: rec.name + ' Copy',
      isRenaming: false,
      nameDraft: '',
      addFrameDraft: '',
      animTextures: [...rec.animTextures],
    };
    this.emitters.push(dupe);
    this.editingId = id;
  }

  deleteEditingEmitter(rec: ParticleEmitterRecord): void {
    this.shapeManager?.removeParticleEmitter3D?.(rec.id);
    this.emitters = this.emitters.filter(e => e.id !== rec.id);
    this.editingId = null;
  }

  // ── Private ──────────────────────────────────────────────────────

  private _flush(rec: ParticleEmitterRecord): void {
    this.shapeManager?.setParticleEmitterConfig3D?.(rec.id, this._buildConfig(rec));
  }

  private _buildConfig(rec: ParticleEmitterRecord): Record<string, unknown> {
    const [sr, sg, sb] = this._hexNorm(rec.startColorHex);
    const [er, eg, eb] = this._hexNorm(rec.endColorHex);
    const len = Math.sqrt(rec.dirX ** 2 + rec.dirY ** 2 + rec.dirZ ** 2) || 1;
    const cfg: Record<string, unknown> = {
      emitRate:     rec.emitRate,
      maxParticles: Math.max(1, rec.maxParticles),
      loop:         rec.loop,
      direction:    [rec.dirX / len, rec.dirY / len, rec.dirZ / len],
      spread:       rec.spreadDeg * (Math.PI / 180),
      lifetime:     [rec.lifetimeMin, Math.max(rec.lifetimeMin, rec.lifetimeMax)],
      speed:        [rec.speedMin, Math.max(rec.speedMin, rec.speedMax)],
      startSize:    [rec.startSizeMin, rec.startSizeMax],
      endSize:      [rec.endSizeMin, rec.endSizeMax],
      startColor:   { r: sr, g: sg, b: sb, a: rec.startAlpha },
      endColor:     { r: er, g: eg, b: eb, a: rec.endAlpha },
      gravity:      [rec.gravX, rec.gravY, rec.gravZ],
      turbulence:   rec.turbulence,
    };
    if (rec.useFlipbook && rec.animTextures.length > 0) {
      cfg['animTextures']  = [...rec.animTextures];
      cfg['animFrameTime'] = rec.animFrameTime;
    } else {
      cfg['textureIndex'] = rec.textureIndex;
      cfg['animTextures'] = [];
    }
    return cfg;
  }

  private _hexNorm(hex: string): [number, number, number] {
    if (!hex || hex.length < 7) return [1, 1, 1];
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  }

  ngOnDestroy(): void {
    clearTimeout(this._cfgDebounce);
  }
}
