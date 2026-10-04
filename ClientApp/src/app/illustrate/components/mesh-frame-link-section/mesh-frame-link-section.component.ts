import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/** Mesh / group inspector: Frame Link Animation (type, axis, amplitude, frames per cycle, phase, stagger; scroll seconds for ribbons; per-group buckets). Extracted from illustration.component (refactor-plan 2.9D). */
@Component({
  selector: 'app-mesh-frame-link-section',
  templateUrl: './mesh-frame-link-section.component.html',
  styleUrls: ['./mesh-frame-link-section.component.scss'],
})
export class MeshFrameLinkSectionComponent implements OnChanges {
  @Input() shapeManager: ShapeManager = null;
  @Input() meshId: string | null = null;
  @Input() scene3dSelectedIsGroup: boolean = false;
  @Input() scene3dHierarchy: any[] = [];
  @Input() scene3dAllGroupBuckets: Record<string, string[][]> = {};
  @Output() dirty = new EventEmitter<void>();
  @Output() scene3dAllGroupBucketsChange = new EventEmitter<Record<string, string[][]>>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meshId']) this.load();
  }

  /** Re-read the section from the engine (the editor calls this on a same-id re-select). */
  load(id: string | null = this.meshId): void {
    if (id) this._syncFrameLinkFromMesh(id);
  }

  // Frame-link animation (procedural per-mesh animation)
  scene3dFrameLinkEnabled = false;

  scene3dFrameLinkType: 'bounce' | 'sway' | 'spin' | 'pulse' | 'shake' | 'scroll' = 'bounce';

  scene3dFrameLinkAxis: 'x' | 'y' | 'z' = 'y';

  scene3dFrameLinkAmplitude = 0.15;

  scene3dFrameLinkFramesPerCycle = 24;

  scene3dFrameLinkPhase = 0;

  scene3dFrameLinkStagger = 0;

  scene3dBucketSelections: string[] = []; // per-bucket dropdown selection (transient)

  /** Frame-link fields from the mesh, or — for a group — from its first child, plus the group's bucket rows. */
  _syncFrameLinkFromMesh(id: string): void {
    const sm2 = this.shapeManager;
    if (sm2.scene3d?.getMesh(id)) {
      // Load frame-link config from mesh if available
      const fl = sm2.getFrameLinkAnimation3D(id);
      if (fl) {
        this.scene3dFrameLinkEnabled = fl.enabled ?? false;
        this.scene3dFrameLinkType = (fl.type as any) ?? 'bounce';
        this.scene3dFrameLinkAxis = fl.axis ?? 'y';
        this.scene3dFrameLinkAmplitude = fl.amplitude ?? 0.15;
        this.scene3dFrameLinkFramesPerCycle = fl.framesPerCycle ?? 24;
        this.scene3dFrameLinkPhase = fl.phase ?? 0;
      } else {
        this.scene3dFrameLinkEnabled = false;
        this.scene3dFrameLinkPhase = 0;
        // Ribbons default to Scroll (UV) so the setting is ready to enable immediately
        const isRibbonMesh = !!sm2.getRibbonData3D(id);
        this.scene3dFrameLinkType = isRibbonMesh ? 'scroll' : 'bounce';
        this.scene3dFrameLinkAxis = isRibbonMesh ? 'x' : 'y';
        this.scene3dFrameLinkAmplitude = isRibbonMesh ? 1.0 : 0.15;
        this.scene3dFrameLinkFramesPerCycle = isRibbonMesh ? 240 : 24;
      }
      this.scene3dFrameLinkStagger = 0;
      this.scene3dBucketSelections = [];
    } else if (sm2.scene3d?.getMeshGroup(id)) {
      // Load FLA from the first child as representative values for the group panel
      const groupNode = this.scene3dHierarchy.find((n: any) => n.id === id);
      const firstChildId: string | undefined = groupNode?.children?.[0]?.id;
      const fl = firstChildId ? sm2.getFrameLinkAnimation3D(firstChildId) : null;
      if (fl) {
        this.scene3dFrameLinkEnabled = fl.enabled ?? false;
        this.scene3dFrameLinkType = (fl.type as any) ?? 'bounce';
        this.scene3dFrameLinkAxis = fl.axis ?? 'y';
        this.scene3dFrameLinkAmplitude = fl.amplitude ?? 0.15;
        this.scene3dFrameLinkFramesPerCycle = fl.framesPerCycle ?? 24;
        this.scene3dFrameLinkPhase = fl.phase ?? 0;
      } else {
        this.scene3dFrameLinkEnabled = false;
        this.scene3dFrameLinkType = 'bounce';
        this.scene3dFrameLinkAxis = 'y';
        this.scene3dFrameLinkAmplitude = 0.15;
        this.scene3dFrameLinkFramesPerCycle = 24;
        this.scene3dFrameLinkPhase = 0;
      }
      this.scene3dFrameLinkStagger = 0;
      // Restore bucket selections array sized to stored buckets for this group
      const storedBuckets = this.scene3dAllGroupBuckets[id] ?? [];
      this.scene3dBucketSelections = storedBuckets.map(() => '');
    }
  }

  scene3dGetScrollSecondsPerLoop(): number {
    const fps = this.shapeManager.getAnimationPlayer3D()?.fps ?? 24;
    return this.scene3dFrameLinkFramesPerCycle / fps;
  }

  scene3dSetScrollSecondsPerLoop(seconds: number): void {
    const fps = this.shapeManager.getAnimationPlayer3D()?.fps ?? 24;
    this.scene3dFrameLinkFramesPerCycle = Math.max(1, Math.round(seconds * fps));
    this.scene3dApplyFrameLink();
  }

  scene3dApplyFrameLink(): void {
    const id = this.meshId;
    if (!id) return;
    const sm = this.shapeManager;
    const baseConfig = {
      enabled: this.scene3dFrameLinkEnabled,
      type: this.scene3dFrameLinkType,
      axis: this.scene3dFrameLinkAxis,
      amplitude: this.scene3dFrameLinkAmplitude,
      framesPerCycle: this.scene3dFrameLinkFramesPerCycle,
      phase: this.scene3dFrameLinkPhase,
    };
    if (this.scene3dSelectedIsGroup) {
      const freshHierarchy: any[] = sm.getScene3DHierarchy() ?? [];
      const groupNode = freshHierarchy.find((n: any) => n.id === id);
      const children: any[] = groupNode?.children ?? [];

      const buckets = this.scene3dAllGroupBuckets[id] ?? [];
      const bucketed = new Set(buckets.flat());
      const unbucketed = children.filter((c: any) => !bucketed.has(c.id));

      // Stagger units: each bucket counts as one unit, each unbucketed child counts as one unit
      const units: string[][] = [
        ...buckets,
        ...unbucketed.map((c: any) => [c.id as string]),
      ];
      const totalUnits = units.length || 1;

      units.forEach((unitIds, i) => {
        const unitPhase = this.scene3dFrameLinkPhase + (i / totalUnits) * this.scene3dFrameLinkStagger;
        unitIds.forEach(childId => {
          sm.setFrameLinkAnimation3D(childId, { ...baseConfig, phase: unitPhase });
        });
      });
    } else {
      sm.setFrameLinkAnimation3D(id, baseConfig);
    }
    this.dirty.emit();
  }

  scene3dGetCurrentBuckets(): string[][] {
    return this.scene3dAllGroupBuckets[this.meshId!] ?? [];
  }

  scene3dGetAvailableChildren(): Array<{ id: string; name: string }> {
    const id = this.meshId;
    if (!id) return [];
    const bucketed = new Set((this.scene3dAllGroupBuckets[id] ?? []).flat());
    const groupNode = this.scene3dHierarchy.find((n: any) => n.id === id);
    return (groupNode?.children ?? [])
      .filter((c: any) => !bucketed.has(c.id))
      .map((c: any) => ({ id: c.id as string, name: (c.name ?? c.id) as string }));
  }

  scene3dGetChildName(childId: string): string {
    const groupNode = this.scene3dHierarchy.find((n: any) => n.id === this.meshId);
    return groupNode?.children?.find((c: any) => c.id === childId)?.name ?? childId;
  }

  scene3dAddBucket(): void {
    const id = this.meshId;
    if (!id) return;
    const existing = this.scene3dAllGroupBuckets[id] ?? [];
    this.scene3dAllGroupBuckets = { ...this.scene3dAllGroupBuckets, [id]: [...existing, []] };
    this.scene3dAllGroupBucketsChange.emit(this.scene3dAllGroupBuckets);
    this.scene3dBucketSelections = [...this.scene3dBucketSelections, ''];
  }

  scene3dRemoveBucket(bi: number): void {
    const id = this.meshId;
    if (!id) return;
    const buckets = [...(this.scene3dAllGroupBuckets[id] ?? [])];
    buckets.splice(bi, 1);
    this.scene3dAllGroupBuckets = { ...this.scene3dAllGroupBuckets, [id]: buckets };
    this.scene3dAllGroupBucketsChange.emit(this.scene3dAllGroupBuckets);
    const sels = [...this.scene3dBucketSelections];
    sels.splice(bi, 1);
    this.scene3dBucketSelections = sels;
    this.scene3dApplyFrameLink();
  }

  scene3dAddChildToBucket(bi: number): void {
    const id = this.meshId;
    if (!id) return;
    const childId = this.scene3dBucketSelections[bi];
    if (!childId) return;
    const buckets = (this.scene3dAllGroupBuckets[id] ?? []).map(b => [...b]);
    if (!buckets[bi]) buckets[bi] = [];
    buckets[bi].push(childId);
    this.scene3dAllGroupBuckets = { ...this.scene3dAllGroupBuckets, [id]: buckets };
    this.scene3dAllGroupBucketsChange.emit(this.scene3dAllGroupBuckets);
    const sels = [...this.scene3dBucketSelections];
    sels[bi] = '';
    this.scene3dBucketSelections = sels;
    this.scene3dApplyFrameLink();
  }

  scene3dRemoveChildFromBucket(bi: number, childId: string): void {
    const id = this.meshId;
    if (!id) return;
    const buckets = (this.scene3dAllGroupBuckets[id] ?? []).map(b => [...b]);
    buckets[bi] = buckets[bi].filter(c => c !== childId);
    this.scene3dAllGroupBuckets = { ...this.scene3dAllGroupBuckets, [id]: buckets };
    this.scene3dAllGroupBucketsChange.emit(this.scene3dAllGroupBuckets);
    this.scene3dApplyFrameLink();
  }
}
