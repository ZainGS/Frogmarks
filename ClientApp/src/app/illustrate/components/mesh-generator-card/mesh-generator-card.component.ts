import { Component, DoCheck, Input, NgZone, OnDestroy } from '@angular/core';
import type { MeshEditPropsHost } from '../mesh-edit-props/mesh-edit-props.component';
import {
  CREATURE_SPECIES, MESH_GEN_TITLES, METABALL_SHAPES, MeshGenState, MetaballBlob,
  applyMeshGenerator, bakeMeshGenerator, meshGeneratorApplies, readMeshGenerator,
} from '../../utils/mesh-generator';

/**
 * Edit Mesh › Modifiers, the first card: the mesh's Add Mesh generator settings (Cylinder / Circle / Polygon /
 * Revolve / Tube / Metaballs / Creature), applied live — at most one regenerate per frame while a slider moves, ONE
 * undo step per drag / field edit / button. Bake keeps the shape and drops the settings (undoable). The card goes away
 * by itself once the mesh is edited by hand (the engine bakes the settings then; undoing that edit brings them back).
 */
@Component({
  selector: 'app-mesh-generator-card',
  templateUrl: './mesh-generator-card.component.html',
  styleUrls: ['./mesh-generator-card.component.scss'],
})
export class MeshGeneratorCardComponent implements DoCheck, OnDestroy {
  @Input() ed!: MeshEditPropsHost;

  gen: MeshGenState | null = null;
  readonly TITLES = MESH_GEN_TITLES;
  readonly SPECIES = CREATURE_SPECIES;
  readonly BLOB_SHAPES = METABALL_SHAPES;

  private _id: string | null = null;
  private _applies = false;
  /** The engine's params as last read / committed (undo / redo change them under the card). */
  private _sig = '';
  /** A field is being changed (live steps not committed yet): the card's values lead the engine's. */
  private _editing = false;
  private _raf = 0;
  /** This circle was loaded with a height > 0 (an older circle): its Height slider stays while the mesh is selected. */
  private _circleHeight = false;

  constructor(private ngZone: NgZone) {}

  /** Circles are flat now (a single n-gon, no Height); only an older circle saved with a height offers the slider. */
  get showCircleHeight(): boolean { return this._circleHeight; }

  private get sm() { return this.ed?.shapeManager; }
  get meshId(): string | null { return this.ed?.editorState.scene3dSelectedMeshId ?? null; }
  get p(): Record<string, any> { return this.gen?.params ?? {}; }

  /** Follow the engine: another mesh, the settings stopped / started applying (a hand edit, its undo, Bake), or an
   *  undo / redo changed them. */
  ngDoCheck(): void {
    const id = this.meshId;
    const applies = meshGeneratorApplies(this.sm, id);
    if (id !== this._id || applies !== this._applies) {
      if (id !== this._id) { this._land(); this._circleHeight = false; }
      this._id = id;
      this._applies = applies;
      this.load();
      return;
    }
    if (applies && !this._editing && this._engineSig() !== this._sig) this.load();
  }

  load(): void {
    this.gen = this._applies ? readMeshGenerator(this.sm, this._id) : null;
    if (this.gen?.type === 'circle' && Number(this.gen.params['height']) > 0) this._circleHeight = true;
    this._sig = this.gen ? JSON.stringify(this.gen.params) : '';
  }

  // ── Changes ─────────────────────────────────────────────────────

  /** A live step (a slider moving, a field typed into): regenerate on the next frame, no undo step yet. */
  live(): void {
    if (!this.gen || !this._id) return;
    this._begin();
    if (this._raf) return;
    this.ngZone.runOutsideAngular(() => {
      this._raf = requestAnimationFrame(() => { this._raf = 0; this._apply(false); });
    });
  }

  /** The change is done (slider released, field left, a button): ONE undo step for it. */
  commit(): void {
    if (!this.gen || !this._id) return;
    this._begin();
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this._apply(true);
  }

  num(key: string, v: unknown, done = false): void {
    const n = +(v as number);
    if (!Number.isFinite(n)) return;
    this.p[key] = n;
    done ? this.commit() : this.live();
  }

  setPoint(list: number[][], i: number, k: number, v: unknown): void {
    const n = +(v as number);
    if (!Number.isFinite(n) || !list[i]) return;
    list[i][k] = n;
    this.live();
  }

  // Cylinder
  cone(): void { this.p['radiusTop'] = 0; this.commit(); }
  straight(): void { this.p['radiusTop'] = this.p['radius']; this.commit(); }

  // Revolve profile
  addProfilePoint(): void {
    const pr: number[][] = this.p['profile'];
    const last = pr[pr.length - 1] ?? [0.3, 0];
    pr.push([last[0], +(last[1] + 0.2).toFixed(3)]);
    this.commit();
  }
  removeProfilePoint(i: number): void {
    const pr: number[][] = this.p['profile'];
    if (pr.length <= 2) return;
    pr.splice(i, 1);
    this.commit();
  }

  // Tube path
  addPathPoint(): void {
    const path: number[][] = this.p['path'], radii: number[] = this.p['radii'];
    const last = path[path.length - 1] ?? [0, 0, 0];
    path.push([last[0], +(last[1] + 0.2).toFixed(3), last[2]]);
    while (radii.length < path.length - 1) radii.push(radii[radii.length - 1] ?? 0.1);
    radii.length = path.length - 1;
    radii.push(radii[radii.length - 1] ?? 0.1);
    this.commit();
  }
  removePathPoint(i: number): void {
    const path: number[][] = this.p['path'], radii: number[] = this.p['radii'];
    if (path.length <= 2) return;
    path.splice(i, 1);
    if (radii.length > i) radii.splice(i, 1);
    this.commit();
  }
  radiusAt(i: number): number {
    const radii: number[] = this.p['radii'] ?? [];
    return radii[i] ?? radii[radii.length - 1] ?? 0.1;
  }
  setRadius(i: number, v: unknown): void {
    const n = +(v as number);
    if (!Number.isFinite(n)) return;
    const radii: number[] = this.p['radii'];
    while (radii.length <= i) radii.push(radii[radii.length - 1] ?? 0.1);
    radii[i] = n;
    this.live();
  }

  // Metaballs
  get blobs(): MetaballBlob[] { return this.p['blobs'] ?? []; }
  addBlob(): void {
    this.blobs.push({ shape: 'sphere', a: [0, 0, 0], b: [0, 0.3, 0], radius: 0.2, blend: 0.3 });
    this.commit();
  }
  removeBlob(i: number): void {
    if (this.blobs.length <= 1) return;
    this.blobs.splice(i, 1);
    this.commit();
  }
  setBlobShape(b: MetaballBlob, shape: MetaballBlob['shape']): void {
    b.shape = shape;
    if (shape === 'capsule' && !b.b) b.b = [b.a[0], b.a[1] + 0.3, b.a[2]];
    this.commit();
  }
  setBlobVec(b: MetaballBlob, key: 'a' | 'b', k: number, v: unknown): void {
    const n = +(v as number);
    if (!Number.isFinite(n)) return;
    (b[key] ??= [0, 0, 0])[k] = n;
    this.live();
  }
  setBlobNum(b: MetaballBlob, key: 'radius' | 'blend', v: unknown): void {
    const n = +(v as number);
    if (!Number.isFinite(n)) return;
    b[key] = n;
    this.live();
  }
  setFlag(target: Record<string, any>, key: string, on: boolean): void { target[key] = on; this.commit(); }

  // Creature
  setSpecies(s: string): void { this.p['species'] = s; this.commit(); }
  randomSeed(): void { this.p['seed'] = Math.floor(Math.random() * 99999); this.commit(); }

  /** Bake: keep the shape, drop the settings (one undo step). */
  bake(): void {
    const id = this._id;
    if (!id) return;
    this._land();
    this._endPreview();
    if (bakeMeshGenerator(this.sm, id)) this.ed.scene3dMarkDirty();
    this.ngDoCheck();
  }

  trackIndex(i: number): number { return i; }

  ngOnDestroy(): void { this._land(); }

  // ── Private ─────────────────────────────────────────────────────

  private _begin(): void {
    if (this._editing) return;
    this._editing = true;
    this._endPreview();
  }

  /** A running Edit Mesh tool preview / Mirror "tap a face" ends first (its revert would undo the wrong step). */
  private _endPreview(): void {
    const me = this.ed?.meshEdit as unknown as { cancelPreview?(): boolean; cancelMirrorFacePick?(): boolean } | undefined;
    me?.cancelMirrorFacePick?.();
    me?.cancelPreview?.();
  }

  private _apply(commit: boolean): void {
    const id = this._id;
    if (!id || !this.gen) return;
    const ok = applyMeshGenerator(this.sm, id, this.gen.params, commit);
    this.ngZone.run(() => {
      if (commit) {
        this._editing = false;
        if (ok) this.ed.scene3dMarkDirty();
        this._applies = meshGeneratorApplies(this.sm, id);
        this.load();   // the engine's clamped values
      } else if (!ok) {
        this._editing = false;
        this._applies = false;
        this.load();
      }
    });
  }

  /** An uncommitted change lands as its undo step (the mesh is about to change / the card goes away). */
  private _land(): void {
    if (!this._editing) return;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this._apply(true);
  }

  private _engineSig(): string {
    const g = readMeshGenerator(this.sm, this._id);
    return g ? JSON.stringify(g.params) : '';
  }
}
