import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** The live cloth sim's wind clock: 1/60 s per rendered frame (Salsa WIND_ZONE_FRAMES_PER_SECOND). The inspector
 *  shows a wind zone's pulse Period in those frames and its Phase as a 0–1 fraction of the cycle; the engine reads
 *  pulsePeriod in seconds and pulsePhase in radians. */
export const WIND_ZONE_FPS = 60;
const TAU = 2 * Math.PI;

/**
 * Cloth section of the mesh inspector: grid / sim info, re-simulate, live cloth, wind frame-link, wind zones.
 * Extracted from illustration.component (refactor-plan 2.7b). Shown by the editor only for a selected cloth mesh.
 */
@Component({
  selector: 'app-cloth-inspector',
  templateUrl: './cloth-inspector.component.html',
  styleUrls: ['./cloth-inspector.component.scss'],
})
export class ClothInspectorComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Output() dirty = new EventEmitter<void>();
  /** "Edit Cloth…" — the editor owns the cloth builder. */
  @Output() editCloth = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId']) this.load();
  }

  /** Read the cloth config, live / wind frame-link state and wind zones of a cloth mesh. */
  load(id: string | null = this.meshId): void {
    if (!id) return;
    const s3d = this.shapeManager.scene3d;
    if (!s3d) return;
    const mesh = s3d.getMesh(id);
    this.windZoneSelectedIdx = null;
    const cfg = s3d.getClothConfig(id);
    this.clothInfoGrid = cfg?.grid ?? null;
    this.clothInfoSim = (mesh as any)?.simState ?? null;
    const geomResult = s3d.getClothGeometryResult(id);
    this.clothInfoVertexCount = geomResult?.vertexCount ?? null;
    this.clothInfoTriCount = geomResult ? Math.floor((geomResult.geometry?.indices?.length ?? 0) / 3) : null;
    // Live config
    this.clothLiveEnabled = (mesh as any)?.liveConfig?.enabled ?? false;
    // Wind frame link
    const sm2 = this.shapeManager;
    const windAnim = sm2.getFrameLinkAnimation3D(id);
    if (windAnim?.type === 'wind') {
      this.clothWindEnabled = windAnim.enabled ?? false;
      this.clothWindAxis = windAnim.axis ?? 'x';
      this.clothWindAmplitude = windAnim.amplitude ?? 3.0;
      this.clothWindFramesPerCycle = windAnim.framesPerCycle ?? 48;
      this.clothWindPhase = windAnim.phase ?? 0;
    } else {
      this.clothWindEnabled = false;
      this.clothWindAxis = 'x';
      this.clothWindAmplitude = 3.0;
      this.clothWindFramesPerCycle = 48;
      this.clothWindPhase = 0;
    }
    // Load wind zones (per-mesh in the engine)
    try {
      this.windZones = [...(s3d.getWindZones(id) ?? [])];
    } catch { this.windZones = []; }

  }

  clothInfoGrid: any = null;

  clothInfoSim: any = null;

  clothInfoVertexCount: number | null = null;

  clothInfoTriCount: number | null = null;

  clothLiveEnabled = false;

  clothWindEnabled = false;

  clothWindAxis: 'x' | 'y' | 'z' = 'x';

  clothWindAmplitude = 3.0;

  clothWindFramesPerCycle = 48;

  clothWindPhase = 0;

  windZones: any[] = [];

  windZoneSelectedIdx: number | null = null;

  windZoneShape: 'sphere' | 'box' = 'sphere';

  windZoneCenter: [number, number, number] = [0, 0, 0];

  windZoneRadius = 1.0;

  windZoneBoxMin: [number, number, number] = [-0.5, -0.5, -0.5];

  windZoneBoxMax: [number, number, number] = [0.5, 0.5, 0.5];

  windZoneWindX = 0; windZoneWindY = 5; windZoneWindZ = 0;

  /** 'none' = the same strength everywhere in the zone, 'linear' = fades to 0 at the edge (the engine's options). */
  windZoneFalloff: 'none' | 'linear' = 'none';

  windZonePulseEnabled = false;

  windZonePulsePeriod = 60;

  windZonePulsePhase = 0;

  async scene3dReSimulateCloth(): Promise<void> {
    const id = this.meshId;
    if (!id) return;
    const sm = this.shapeManager;
    const s3d = sm.scene3d;
    if (!s3d) return;
    const cfg = s3d.getClothConfig(id);
    if (!cfg) return;
    const node = s3d.getMesh(id) as any;
    const mode: 'hang' | 'drape' = (node?.simState?.simulationMode !== 'none' ? node?.simState?.simulationMode : 'hang') ?? 'hang';
    try {
      const positions: Float32Array = await s3d.simulateCloth(cfg.grid, cfg.physics, mode);
      s3d.updateClothMeshPose(id, positions, mode);
      this.dirty.emit();
    } catch (e) {
      console.warn('[Cloth] Re-simulate failed', e);
    }
  }

  async setLiveCloth(enabled: boolean): Promise<void> {
    const id = this.meshId;
    if (!id) return;
    const s3d = this.shapeManager.scene3d;
    if (!s3d) return;
    if (enabled) {
      s3d.enableLiveCloth(id);
      this.clothLiveEnabled = true;
    } else {
      await s3d.disableLiveCloth(id, true);
      this.clothLiveEnabled = false;
      if (this.clothWindEnabled) {
        this.clothWindEnabled = false;
        this.applyWindAnimation();
      }
    }
    this.dirty.emit();
  }

  applyWindAnimation(): void {
    const id = this.meshId;
    if (!id) return;
    this.shapeManager.setFrameLinkAnimation3D(id, {
      enabled: this.clothWindEnabled,
      type: 'wind',
      axis: this.clothWindAxis,
      amplitude: this.clothWindAmplitude,
      framesPerCycle: this.clothWindFramesPerCycle,
      phase: this.clothWindPhase,
    });
    this.dirty.emit();
  }

  private _loadWindZones(): void {
    const s3d = this.shapeManager.scene3d;
    const meshId = this.meshId;
    if (!meshId) { this.windZones = []; return; }
    try { this.windZones = [...(s3d?.getWindZones(meshId) ?? [])]; } catch { this.windZones = []; }
  }

  private _buildWindZonePayload(): any {
    const zone: any = {
      shape: this.windZoneShape,
      center: [...this.windZoneCenter] as [number,number,number],
      windVec: [this.windZoneWindX, this.windZoneWindY, this.windZoneWindZ] as [number,number,number],
      falloff: this.windZoneFalloff,
    };
    if (this.windZoneShape === 'sphere') zone.radius = this.windZoneRadius;
    else zone.halfExtents = [
      (this.windZoneBoxMax[0] - this.windZoneBoxMin[0]) / 2,
      (this.windZoneBoxMax[1] - this.windZoneBoxMin[1]) / 2,
      (this.windZoneBoxMax[2] - this.windZoneBoxMin[2]) / 2,
    ];
    // flat engine fields (seconds / radians); off = period 0 (the engine's "constant") so an update clears it
    const frames = Math.max(1, Number(this.windZonePulsePeriod) || 0);
    zone.pulsePeriod = this.windZonePulseEnabled ? frames / WIND_ZONE_FPS : 0;
    zone.pulsePhase = this.windZonePulseEnabled ? (Number(this.windZonePulsePhase) || 0) * TAU : 0;
    zone.pulse = undefined;   // (older saves' nested pulse — never read by the engine)
    return zone;
  }

  private _loadWindZoneFields(zone: any): void {
    this.windZoneShape = zone.shape ?? 'sphere';
    this.windZoneCenter = [...(zone.center ?? [0, 0, 0])] as [number,number,number];
    this.windZoneRadius = zone.radius ?? 1.0;
    const he = zone.halfExtents ?? [0.5, 0.5, 0.5];
    const c = zone.center ?? [0, 0, 0];
    this.windZoneBoxMin = [c[0]-he[0], c[1]-he[1], c[2]-he[2]];
    this.windZoneBoxMax = [c[0]+he[0], c[1]+he[1], c[2]+he[2]];
    this.windZoneWindX = zone.windVec?.[0] ?? 0;
    this.windZoneWindY = zone.windVec?.[1] ?? 5;
    this.windZoneWindZ = zone.windVec?.[2] ?? 0;
    // (an older save's number never reached the engine: the zone was uniform)
    this.windZoneFalloff = zone.falloff === 'linear' ? 'linear' : 'none';
    if (typeof zone.pulsePeriod === 'number') {
      this.windZonePulseEnabled = zone.pulsePeriod > 0;
      this.windZonePulsePeriod = zone.pulsePeriod > 0 ? Math.round(zone.pulsePeriod * WIND_ZONE_FPS * 100) / 100 : 60;
      this.windZonePulsePhase = zone.pulsePeriod > 0 ? wrap01((zone.pulsePhase ?? 0) / TAU) : 0;
    } else {
      // an older save: the nested pulse in frames / cycle fraction (the engine maps it the same way)
      this.windZonePulseEnabled = !!zone.pulse && (zone.pulse.period ?? 0) > 0;
      this.windZonePulsePeriod = zone.pulse?.period ?? 60;
      this.windZonePulsePhase = zone.pulse?.phase ?? 0;
    }
  }

  addWindZone(): void {
    const s3d = this.shapeManager.scene3d;
    if (!s3d) return;
    const sm = this.shapeManager;
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    this.windZoneCenter = [...center] as [number,number,number];
    const zone = this._buildWindZonePayload();
    try {
      const id = this.meshId ? s3d.addWindZone(this.meshId, zone) : null;
      this._loadWindZones();
      const idx = this.windZones.findIndex((z: any) => z.id === id);
      this.windZoneSelectedIdx = idx >= 0 ? idx : this.windZones.length - 1;
    } catch (e) { console.warn('[WindZone] add failed', e); }
    this.dirty.emit();
  }

  removeWindZone(idx: number): void {
    const s3d = this.shapeManager.scene3d;
    const zone = this.windZones[idx];
    if (!zone || !s3d) return;
    try { if (this.meshId) s3d.removeWindZone(this.meshId, zone.id); } catch { /* ignore */ }
    this._loadWindZones();
    if (this.windZoneSelectedIdx === idx) this.windZoneSelectedIdx = null;
    else if (this.windZoneSelectedIdx !== null && this.windZoneSelectedIdx > idx) this.windZoneSelectedIdx--;
    this.dirty.emit();
  }

  selectWindZone(idx: number): void {
    this.windZoneSelectedIdx = idx;
    const zone = this.windZones[idx];
    if (zone) this._loadWindZoneFields(zone);
  }

  updateSelectedWindZone(): void {
    if (this.windZoneSelectedIdx === null) return;
    const s3d = this.shapeManager.scene3d;
    const zone = this.windZones[this.windZoneSelectedIdx];
    if (!zone || !s3d) return;
    try {
      if (this.meshId) s3d.updateWindZone(this.meshId, zone.id, this._buildWindZonePayload());
      this._loadWindZones();
    } catch (e) { console.warn('[WindZone] update failed', e); }
    this.dirty.emit();
  }

  clearAllWindZones(): void {
    const s3d = this.shapeManager.scene3d;
    if (!s3d) return;
    try { if (this.meshId) s3d.clearWindZones(this.meshId); } catch { /* ignore */ }
    this.windZones = [];
    this.windZoneSelectedIdx = null;
    this.dirty.emit();
  }
}

/** x into [0, 1) (a phase in cycles). */
function wrap01(x: number): number {
  const r = x - Math.floor(x);
  return Number.isFinite(r) ? Math.round(r * 100) / 100 : 0;
}
