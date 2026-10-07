import { Injectable, NgZone, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { SceneAnimationService } from './scene-animation.service';
import { SceneOutlinerService } from './scene-outliner.service';
import { CHAR_BODY_DEFAULTS, EYE_PARAM_DEFAULTS, HAIR_PARAM_DEFAULTS, randomizeCharacterInputs } from '../utils/character-randomizer';

import { CharacterEditService } from './character-edit.service';
import { EditorStateService } from './editor-state.service';
/** Exactly the editor state the add-mesh actions read and write (mesh list refresh, selection, dirty). The hierarchy and
 *  node-kind sets come from SceneOutlinerService. */
export type SceneAddHost = Pick<IllustrationComponent, 'shapeManager' |
  '_suppressLayerTreeRebuild' |
  'scene3dMarkDirty' | 'scene3dRefreshKeyframeTracks' | 'scene3dRefreshMeshes' | 'scene3dSelectMesh' |
  'scene3dShowAddMeshMenu'
>;

/**
 * Add-Mesh menu actions and their quick-forms: primitives (cube / sphere / … , polygon, circle, cylinder / cone,
 * revolve, tube, metaball), creature, and the procedural character (preview + generate). Component-scoped (provided by
 * IllustrationComponent). Bodies moved verbatim from illustration.component (refactor-plan 2.9E).
 */
@Injectable()
export class SceneAddService implements OnDestroy {
  private host!: SceneAddHost;
  constructor(private editorState: EditorStateService, private character: CharacterEditService, private anim: SceneAnimationService, private outliner: SceneOutlinerService, private ngZone: NgZone) {}
  bind(host: SceneAddHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    clearTimeout(this._charPreviewTimer);
  }

  // Polygon / circle / character creation forms
  scene3dShowPolygonForm = false;

  scene3dShowCircleForm = false;

  scene3dShowCharacterForm = false;

  scene3dCharHeight = 0.5;

  scene3dCharLegLength = 1.0;

  scene3dCharLimbThick = 0.85;

  scene3dCharTorsoThick = 0.9;

  scene3dCharTorsoLength = 1.0;

  scene3dCharHeadSize = 1.25;

  scene3dCharBiasBodyId: string | null = null;

  _charPreviewTimer: any = null;

  scene3dPolygonSides = 6;

  scene3dPolygonRadius = 0.5;

  scene3dPolygonHeight = 0.2;

  scene3dCircleRadius = 0.5;

  scene3dCircleSegments = 16;

  scene3dCircleHeight = 0.2;

  // Cylinder / cone / frustum form
  scene3dShowCylinderForm = false;

  scene3dCylinderRadius = 0.3;

  scene3dCylinderHeight = 0.8;

  scene3dCylinderRadiusTop = 0.3;

  scene3dCylinderSegments = 12;

  // Revolve / lathe form
  scene3dShowRevolveForm = false;

  scene3dRevolveProfile: [number, number][] = [[0.3, -0.4], [0.4, 0], [0.3, 0.4]];

  scene3dRevolveSegments = 16;

  // Tube / loft form
  scene3dShowTubeForm = false;

  scene3dTubePath: [number, number, number][] = [[0, -0.4, 0], [0, 0, 0], [0, 0.4, 0]];

  scene3dTubeRadii: number[] = [0.1, 0.15, 0.1];

  scene3dTubeSegments = 8;

  // Metaballs form
  scene3dShowMetaballForm = false;

  scene3dMetaballBlobs: Array<{
    shape: 'sphere' | 'capsule' | 'ellipsoid' | 'box' | 'torus';
    ax: number; ay: number; az: number;
    bx: number; by: number; bz: number;
    radius: number; blend: number; subtract: boolean;
  }> = [
    { shape: 'sphere', ax: -0.2, ay: 0, az: 0, bx: 0, by: 0.3, bz: 0, radius: 0.3, blend: 0.3, subtract: false },
    { shape: 'sphere', ax:  0.2, ay: 0, az: 0, bx: 0, by: 0.3, bz: 0, radius: 0.25, blend: 0.3, subtract: false },
  ];

  scene3dMetaballResolution = 32;

  scene3dMetaballDecimate = 1.0;

  // Creature form
  scene3dShowCreatureForm = false;

  scene3dCreatureSpecies = 'dog';

  scene3dCreatureParams = {
    bodyLength: 1.0, bodyRadius: 0.3,
    legCount: 4,     legLength: 0.5,
    neckLength: 0.3, headSize: 0.4,
    tailLength: 0.4, tailCurl: 0.3,
    earSize: 0.2,    blend: 0.3,
    roughness: 0.0,  eyes: true,
    rigged: false,   decimate: 0.4,
  };

  scene3dCreatureSeed = 42;

  scene3dCreatureResolution = 32;

  scene3dAddMesh(primitive: string): void {
    const sm = this.shapeManager;
    const s3d = sm.scene3d;
    if (!s3d) return;

    // Place new meshes at the visible illustration center instead of world origin.
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const [cx, cy, cz] = center;

    let mesh: any;
    switch (primitive) {
      case 'box':      mesh = s3d.createBox(cx, cy, cz); break;
      case 'sphere':   mesh = s3d.createSphere(cx, cy, cz); break;
      case 'plane':    mesh = s3d.createPlane(cx, cy, cz); break;
      case 'cylinder': mesh = s3d.createCylinder(cx, cy, cz); break;
      case 'torus':    mesh = s3d.createTorus(cx, cy, cz); break;
      case 'sprite':   mesh = sm.createSprite3D(cx, cy, cz, 1, 1); break;
      default: return;
    }
    this.host.scene3dRefreshMeshes();
    this.anim.scene3dEnsureAnimationPlayer();
    if (mesh) {
      this.host.scene3dSelectMesh(mesh.id);
    }
  }

  scene3dAddPolygon(): void {
    const sm = this.shapeManager;
    const n = Math.max(3, Math.floor(this.scene3dPolygonSides));
    const r = this.scene3dPolygonRadius;
    const points: [number, number][] = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const mesh = sm.addPolygonMesh3D(center[0], center[1], center[2], points, this.scene3dPolygonHeight);
    if (mesh) {
      this.host.scene3dRefreshMeshes();
      this.anim.scene3dEnsureAnimationPlayer();
      this.host.scene3dSelectMesh(mesh.id);
    }
    this.scene3dShowPolygonForm = false;
    this.host.scene3dShowAddMeshMenu = false;
  }

  scene3dAddCircle(): void {
    const sm = this.shapeManager;
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const mesh = sm.addCircleMesh3D(
      center[0], center[1], center[2],
      this.scene3dCircleRadius,
      Math.max(3, Math.floor(this.scene3dCircleSegments)),
      this.scene3dCircleHeight,
    );
    if (mesh) {
      this.host.scene3dRefreshMeshes();
      this.anim.scene3dEnsureAnimationPlayer();
      this.host.scene3dSelectMesh(mesh.id);
    }
    this.scene3dShowCircleForm = false;
    this.host.scene3dShowAddMeshMenu = false;
  }

  scene3dAddCylinder(): void {
    const sm = this.shapeManager;
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    // NOTE: engine createCylinder has no radiusTop param — the "Radius top" control
    // was silently ignored. TODO: ask Salsa for a cone/frustum radiusTop option.
    const mesh = sm.scene3d?.createCylinder(
      cx, cy, cz,
      this.scene3dCylinderRadius,
      this.scene3dCylinderHeight,
      this.scene3dCylinderSegments,
    );
    if (mesh) {
      this.host.scene3dRefreshMeshes();
      this.anim.scene3dEnsureAnimationPlayer();
      this.host.scene3dSelectMesh(mesh.id);
    }
    this.scene3dShowCylinderForm = false;
    this.host.scene3dShowAddMeshMenu = false;
  }

  scene3dRevolveAddPoint(): void {
    const last = this.scene3dRevolveProfile[this.scene3dRevolveProfile.length - 1];
    this.scene3dRevolveProfile = [...this.scene3dRevolveProfile, [last[0], last[1] + 0.2]];
  }

  scene3dRevolveRemovePoint(i: number): void {
    if (this.scene3dRevolveProfile.length <= 2) return;
    this.scene3dRevolveProfile = this.scene3dRevolveProfile.filter((_, idx) => idx !== i);
  }

  scene3dAddRevolve(): void {
    const sm = this.shapeManager;
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    const mesh = sm.createRevolve3D(cx, cy, cz, this.scene3dRevolveProfile, this.scene3dRevolveSegments);
    if (mesh) {
      this.host.scene3dRefreshMeshes();
      this.anim.scene3dEnsureAnimationPlayer();
      this.host.scene3dSelectMesh(mesh.id);
    }
    this.scene3dShowRevolveForm = false;
    this.host.scene3dShowAddMeshMenu = false;
  }

  scene3dTubeAddPoint(): void {
    const last = this.scene3dTubePath[this.scene3dTubePath.length - 1];
    this.scene3dTubePath = [...this.scene3dTubePath, [last[0], last[1] + 0.2, last[2]]];
    this.scene3dTubeRadii = [...this.scene3dTubeRadii, this.scene3dTubeRadii[this.scene3dTubeRadii.length - 1]];
  }

  scene3dTubeRemovePoint(i: number): void {
    if (this.scene3dTubePath.length <= 2) return;
    this.scene3dTubePath = this.scene3dTubePath.filter((_, idx) => idx !== i);
    this.scene3dTubeRadii = this.scene3dTubeRadii.filter((_, idx) => idx !== i);
  }

  scene3dAddTube(): void {
    const sm = this.shapeManager;
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    const mesh = sm.createTube3D(cx, cy, cz, this.scene3dTubePath, this.scene3dTubeRadii, this.scene3dTubeSegments);
    if (mesh) {
      this.host.scene3dRefreshMeshes();
      this.anim.scene3dEnsureAnimationPlayer();
      this.host.scene3dSelectMesh(mesh.id);
    }
    this.scene3dShowTubeForm = false;
    this.host.scene3dShowAddMeshMenu = false;
  }

  scene3dMetaballAddBlob(): void {
    this.scene3dMetaballBlobs = [...this.scene3dMetaballBlobs, {
      shape: 'sphere', ax: 0, ay: 0, az: 0, bx: 0, by: 0.3, bz: 0,
      radius: 0.2, blend: 0.3, subtract: false,
    }];
  }

  scene3dMetaballRemoveBlob(i: number): void {
    if (this.scene3dMetaballBlobs.length <= 1) return;
    this.scene3dMetaballBlobs = this.scene3dMetaballBlobs.filter((_, idx) => idx !== i);
  }

  scene3dAddMetaball(): void {
    const sm = this.shapeManager;
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    const blobs = this.scene3dMetaballBlobs.map(b => ({
      shape: b.shape,
      a: [b.ax, b.ay, b.az] as [number, number, number],
      b: [b.bx, b.by, b.bz] as [number, number, number],
      radius: b.radius,
      blend: b.blend,
      subtract: b.subtract,
    }));
    const mesh = sm.createMetaballMesh3D(cx, cy, cz, blobs, this.scene3dMetaballResolution, undefined, this.scene3dMetaballDecimate);
    if (mesh) {
      this.host.scene3dRefreshMeshes();
      this.anim.scene3dEnsureAnimationPlayer();
      this.host.scene3dSelectMesh(mesh.id);
    }
    this.scene3dShowMetaballForm = false;
    this.host.scene3dShowAddMeshMenu = false;
  }

  scene3dRandomizeCreature(): void {
    this.scene3dCreatureSeed = Math.floor(Math.random() * 99999);
  }

  scene3dAddCreature(): void {
    const sm = this.shapeManager;
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const [cx, cy, cz] = center;
    const params = {
      ...this.scene3dCreatureParams,
      species: this.scene3dCreatureSpecies,
      seed: this.scene3dCreatureSeed,
    };
    const mesh = sm.createCreature3D(params as any, cx, cy, cz, this.scene3dCreatureResolution);
    if (mesh) {
      this.host.scene3dRefreshMeshes();
      this.anim.scene3dEnsureAnimationPlayer();
      this.host.scene3dSelectMesh(mesh.id);
    }
    this.scene3dShowCreatureForm = false;
    this.host.scene3dShowAddMeshMenu = false;
  }

  scene3dOpenCharacterForm(): void {
    this.scene3dShowCharacterForm = !this.scene3dShowCharacterForm;
    this.scene3dShowPolygonForm = false;
    this.scene3dShowCircleForm = false;
    if (this.scene3dShowCharacterForm) {
      this._fireCharPreview();
    } else {
      this.shapeManager.clearProceduralBodyPreview3D();
    }
  }

  /** Slider input → preview, debounced (it re-generated the preview body on every slider tick; the timer was cleared
   *  by cancel / generate but never set). */
  scene3dPreviewCharacter(): void {
    clearTimeout(this._charPreviewTimer);
    // H7: outside the zone — the preview is engine-only, and an in-zone timer ran an app change detection per tick
    this._charPreviewTimer = this.ngZone.runOutsideAngular(() => setTimeout(() => this._fireCharPreview(), 60));
  }

  _fireCharPreview(): void {
    void this.shapeManager.previewProceduralBody3D({
      height:      this.scene3dCharHeight,
      legLength:   this.scene3dCharLegLength,
      limbThick:   this.scene3dCharLimbThick,
      torsoThick:  this.scene3dCharTorsoThick,
      torsoLength: this.scene3dCharTorsoLength,
      headSize:    this.scene3dCharHeadSize,
    });
  }

  scene3dCancelCharacter(): void {
    clearTimeout(this._charPreviewTimer);
    this.shapeManager.clearProceduralBodyPreview3D();
    this.scene3dShowCharacterForm = false;
    this.host.scene3dShowAddMeshMenu = false;
  }

  async scene3dGenerateCharacter(): Promise<void> {
    clearTimeout(this._charPreviewTimer);
    const sm = this.shapeManager;
    const rnd = randomizeCharacterInputs(this.shapeManager, this.scene3dCharBiasBodyId);

    // Build all part params up front so we can pass them as one atomic call
    const hairParams = {
      ...(sm.getDefaultHairParams3D() ?? {}),
      ...HAIR_PARAM_DEFAULTS,
      ...rnd.hairOverride,
    };
    const eyeParams = {
      ...(sm.getDefaultEyeParams3D() ?? {}),
      ...EYE_PARAM_DEFAULTS,
      ...rnd.eyeOverride,
    };
    const topParams = {
      ...(sm.getDefaultClothingParams3D('top') ?? { slot: 'top' }),
      hemHeight: 0.65, gradient: true, trimWidth: 0.50,
      baseColor: CHAR_BODY_DEFAULTS.topColor,
      trimColor: CHAR_BODY_DEFAULTS.topTrim,
      ...rnd.topOverride,
    };
    const bottomParams = {
      ...(sm.getDefaultClothingParams3D('bottom') ?? { slot: 'bottom' }),
      bottomStyle: 'pants', waistWidth: 0.32, waistHeight: 0.50, length: 1.00, gradient: true, trimWidth: 0.50,
      baseColor: CHAR_BODY_DEFAULTS.bottomColor,
      trimColor: CHAR_BODY_DEFAULTS.bottomTrim,
      ...rnd.bottomOverride,
    };
    const shoesParams = {
      ...(sm.getDefaultClothingParams3D('shoes') ?? { slot: 'shoes' }),
      ...rnd.shoesOverride,
    };
    const socksParams = {
      ...(sm.getDefaultClothingParams3D('socks') ?? { slot: 'socks' }),
      ...rnd.socksOverride,
    };
    const center = sm.getIllustrationCenter3D() ?? [0, 0, 0];

    // Single salsa call → single scene-graph event (was ~9 separate calls)
    // Suppress 2D layer-tree rebuild during the call — 3D-only ops don't touch 2D layers
    this.host._suppressLayerTreeRebuild = true;
    let result: any;
    try {
      result = await sm.createFullCharacter3D({
        body: {
          height:      this.scene3dCharHeight,
          legLength:   this.scene3dCharLegLength,
          limbThick:   this.scene3dCharLimbThick,
          torsoThick:  this.scene3dCharTorsoThick,
          torsoLength: this.scene3dCharTorsoLength,
          headSize:    this.scene3dCharHeadSize,
          waist:       rnd.waist,
          hipFront:    rnd.hipFront,
        },
        position: center,
        eyes:     eyeParams as any,
        hair:     hairParams as any,
        top:      topParams as any,
        bottom:   bottomParams as any,
        shoes:    shoesParams,
        socks:    socksParams as any,
        skinTone: rnd.skinTone,
        rimLight: true,   // T6: random characters get rim light on
      });
    } finally {
      this.host._suppressLayerTreeRebuild = false;
    }

    // Incremental O(1) mesh list update using nodeIds returned by createFullCharacter3D
    if (result?.nodeIds?.length) {
      const newMeshes: any[] = [];
      for (const id of result.nodeIds as string[]) {
        const meshDesc = sm.getMesh3D(id);
        if (meshDesc) newMeshes.push(meshDesc);
      }
      this.editorState.scene3dMeshes = [...this.editorState.scene3dMeshes, ...newMeshes];
      // Push ONE grouped "Character" node, the same shape getScene3DHierarchy emits (id = the body, the overlay parts
      // as children). Pushing each part as a flat root row made the outliner show loose parts until the next full
      // refresh fused them into a Character row (and that row had no Player button).
      this.outliner.scene3dAddCharacterNode(result.meshId, result.nodeIds as string[]);
      this.host.scene3dRefreshKeyframeTracks();
    } else {
      this.host.scene3dRefreshMeshes();
    }
    this.anim.scene3dEnsureAnimationPlayer();
    if (result?.meshId) {
      this.host.scene3dSelectMesh(result.meshId);
      this.character.scene3dEditCharBodyId = result.meshId;
      void sm.playSpawnReveal3D(result.meshId);
      // Generated characters start cel-shaded; <app-character-panel> mirrors the generated params via [generated]
      sm.setCharacterRenderStyle3D(result.meshId, 'cel');
      this.character.scene3dCharGenerated = { bodyId: result.meshId, hairParams, eyeParams, topParams, bottomParams, skinTone: rnd.skinTone };
    }
    this.scene3dShowCharacterForm = false;
    this.host.scene3dShowAddMeshMenu = false;
    // Trigger autosave — character creation suppressed the normal onSceneGraphChanged path
    this.host.scene3dMarkDirty();
  }

  _scene3dCharBiasOptionsCache: Array<{ id: string; label: string }> | null = null;

  _scene3dCharBiasHierarchyRef: any[] | null = null;

  get scene3dCharBiasOptions(): Array<{ id: string; label: string }> {
    if (this._scene3dCharBiasOptionsCache && this._scene3dCharBiasHierarchyRef === this.outliner.scene3dHierarchy) {
      return this._scene3dCharBiasOptionsCache;
    }
    this._scene3dCharBiasHierarchyRef = this.outliner.scene3dHierarchy;
    const opts: Array<{ id: string; label: string }> = [];
    let idx = 1;
    for (const node of this.outliner.scene3dHierarchy) {
      if (this.outliner.scene3dCharacterBodyIds.has(node.id)) {
        opts.push({ id: node.id, label: `Character ${idx++}` });
      }
    }
    this._scene3dCharBiasOptionsCache = opts;
    return opts;
  }
}
