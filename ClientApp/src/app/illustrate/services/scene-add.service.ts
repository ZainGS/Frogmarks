import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { SceneAnimationService } from './scene-animation.service';
import { SceneOutlinerService } from './scene-outliner.service';
import { CHAR_BODY_DEFAULTS, EYE_PARAM_DEFAULTS, HAIR_PARAM_DEFAULTS, randomizeCharacterInputs } from '../utils/character-randomizer';

import { CharacterEditService } from './character-edit.service';
import { EditorStateService } from './editor-state.service';
import { EngineStatusService } from './engine-status.service';
import { DEFAULT_PARTICLE_PRESET, NEW_PARTICLE_EMITTER_NAME, particlePresetConfig } from '../utils/particle-config';
import { DrawPlane, POLYGON_DEFAULT_HEIGHT, V3, meshGenDefaults, outlineToPolygon, rayToPlane, viewDrawPlane } from '../utils/mesh-generator';
import { newClothDefaults } from '../components/cloth-builder/cloth-builder.component';

/** Exactly the editor state the add-mesh actions read and write (mesh list refresh, selection, dirty, leaving the other
 *  3D modes before the Polygon outline). The hierarchy and node-kind sets come from SceneOutlinerService. */
export type SceneAddHost = Pick<IllustrationComponent, 'shapeManager' |
  '_suppressLayerTreeRebuild' | '_exitAllScene3dModes' |
  'scene3dMarkDirty' | 'scene3dRefreshKeyframeTracks' | 'scene3dRefreshMeshes' | 'scene3dSelectMesh' |
  'scene3dShowAddMeshMenu'
>;

/** The procedural character's body proportions for an instant add (its Character panel edits them afterwards). */
const CHAR_BODY_SHAPE = { height: 0.5, legLength: 1.0, limbThick: 0.85, torsoThick: 0.9, torsoLength: 1.0, headSize: 1.25 };

/** A Polygon… outline being drawn: world points on its draw plane (+ the point under the pointer). The plane goes
 *  through the view centre and faces the view best (from above: the ground; a front view: upright); it follows the
 *  camera until the first point, then stays. */
export interface PolygonDrawState { center: V3; plane: DrawPlane | null; pts: V3[]; hover: V3 | null }

/** Screen distance (CSS px) for a tap to count as the first point (closes the outline) / a tap vs a drag. */
const POLY_CLOSE_PX = 14;
const POLY_TAP_SLOP_PX = 8;

/**
 * Add-Mesh menu actions — every entry adds at once with default settings, at the view centre, selected, the document
 * dirty: primitives (cube / sphere / …), the parametric ones (cylinder, circle, revolve, tube, metaballs, creature —
 * their settings are the first card of Edit Mesh's Modifiers), cloth, particles and the procedural character.
 * Polygon… instead starts drawing its outline on the viewport (tap points; tap the first point, double-tap or Enter
 * to finish; Esc / another tool cancels). Component-scoped (provided by IllustrationComponent).
 */
@Injectable()
export class SceneAddService implements OnDestroy {
  private host!: SceneAddHost;
  constructor(private editorState: EditorStateService, private character: CharacterEditService, private anim: SceneAnimationService,
              private outliner: SceneOutlinerService, private engineStatus: EngineStatusService) {}
  bind(host: SceneAddHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    this.polyDraw = null;
  }

  private _center(): [number, number, number] {
    return this.shapeManager.getIllustrationCenter3D() ?? [0, 0, 0];
  }

  /** A new mesh is in: the outliner, the animation player, the selection (its sections), the save. */
  private _added(id: string | null | undefined): void {
    this.host.scene3dShowAddMeshMenu = false;
    if (!id) return;
    this.host.scene3dRefreshMeshes();
    this.anim.scene3dEnsureAnimationPlayer();
    this.host.scene3dSelectMesh(id);
    this.host.scene3dMarkDirty();
  }

  scene3dAddMesh(primitive: string): void {
    const sm = this.shapeManager;
    const s3d = sm.scene3d;
    if (!s3d) return;

    // Place new meshes at the visible illustration center instead of world origin.
    const [cx, cy, cz] = this._center();

    let mesh: any;
    switch (primitive) {
      case 'box':      mesh = s3d.createBox(cx, cy, cz); break;
      case 'sphere':   mesh = s3d.createSphere(cx, cy, cz); break;
      case 'plane':    mesh = s3d.createPlane(cx, cy, cz); break;
      case 'torus':    mesh = s3d.createTorus(cx, cy, cz); break;
      case 'sprite':   mesh = sm.createSprite3D(cx, cy, cz, 1, 1); break;
      default: return;
    }
    this._added(mesh?.id);
  }

  /** Add Mesh › Particles…: a particle emitter at once (the default preset, at the view centre like the other adds),
   *  selected so its Particle Config section shows. */
  scene3dAddParticles(): void {
    const sm = this.shapeManager;
    if (!sm?.scene3d || typeof sm.addParticleEmitter3D !== 'function') return;
    const [cx, cy, cz] = sm.getIllustrationCenter3D() ?? [0, 0, 0];
    const id = sm.addParticleEmitter3D(cx, cy, cz, particlePresetConfig(DEFAULT_PARTICLE_PRESET) as any);
    if (!id) return;
    const node = sm.getParticleEmitter3D(id);
    if (node) node.name = NEW_PARTICLE_EMITTER_NAME;
    this.host.scene3dRefreshMeshes();
    this.host.scene3dSelectMesh(id);
    this.host.scene3dMarkDirty();
  }

  // ── Parametric meshes: instant add with the defaults (Edit Mesh › Modifiers › the type's card edits them) ──

  scene3dAddCylinder(): void {
    const p = meshGenDefaults('cylinder');
    const [cx, cy, cz] = this._center();
    this._added(this.shapeManager.createCylinder3D(cx, cy, cz, p['radius'], p['height'], p['segments'], undefined, p['radiusTop'])?.id);
  }

  scene3dAddCircle(): void {
    const p = meshGenDefaults('circle');
    const [cx, cy, cz] = this._center();
    this._added(this.shapeManager.addCircleMesh3D(cx, cy, cz, p['radius'], p['segments'], p['height'])?.id);
  }

  scene3dAddRevolve(): void {
    const p = meshGenDefaults('revolve');
    const [cx, cy, cz] = this._center();
    this._added(this.shapeManager.createRevolve3D(cx, cy, cz, p['profile'], p['segments'])?.id);
  }

  scene3dAddTube(): void {
    const p = meshGenDefaults('tube');
    const [cx, cy, cz] = this._center();
    this._added(this.shapeManager.createTube3D(cx, cy, cz, p['path'], p['radii'], p['segments'])?.id);
  }

  scene3dAddMetaball(): void {
    const p = meshGenDefaults('metaball');
    const [cx, cy, cz] = this._center();
    this._added(this.shapeManager.createMetaballMesh3D(cx, cy, cz, p['blobs'], p['resolution'], undefined, p['decimate'])?.id);
  }

  scene3dAddCreature(): void {
    const { resolution, ...params } = meshGenDefaults('creature');
    const [cx, cy, cz] = this._center();
    this._added(this.shapeManager.createCreature3D(params as any, cx, cy, cz, resolution)?.id);
  }

  /** Add Mesh › Cloth…: a cloth with the builder's starting grid at once (its Cloth section's Edit Cloth… opens the
   *  builder on it). */
  scene3dAddCloth(): void {
    const s3d = this.shapeManager.scene3d;
    if (!s3d) return;
    const { grid, physics } = newClothDefaults();
    const [cx, cy, cz] = this._center();
    this._added(s3d.createClothMesh(cx, cy, cz, grid as any, physics as any, undefined, 'Cloth')?.id);
  }

  // ── Polygon…: draw the outline on the viewport ─────────────────────────────

  /** The outline being drawn (null = not drawing). */
  polyDraw: PolygonDrawState | null = null;
  private _polyDown: { id: number; x: number; y: number } | null = null;

  /** Add Mesh › Polygon…: straight into drawing its outline (on the plane through the view centre facing the view). */
  scene3dStartPolygonDraw(): void {
    this.host.scene3dShowAddMeshMenu = false;
    if (!this.shapeManager?.scene3d) return;
    this.host._exitAllScene3dModes();
    this.polyDraw = { center: this._center(), plane: null, pts: [], hover: null };
    this._polyDown = null;
  }

  scene3dCancelPolygonDraw(): void {
    this.polyDraw = null;
    this._polyDown = null;
  }

  /** Done: the shape from the outline (fewer than 3 usable points: nothing; the drawing goes on). */
  scene3dFinishPolygonDraw(): void {
    const d = this.polyDraw;
    if (!d) return;
    const poly = d.plane ? outlineToPolygon(d.pts, d.plane) : null;
    if (!poly) return;
    this.scene3dCancelPolygonDraw();
    const sm = this.shapeManager;
    const [x, y, z] = poly.center;
    const mesh = sm.addPolygonMesh3D(x, y, z, poly.points, POLYGON_DEFAULT_HEIGHT);
    // Stand the outline's frame on the draw plane (the engine builds it on the ground, extruded up); the rotation is
    // the object's, so the generator settings keep it
    const [rx, ry, rz] = poly.rotation;
    if (mesh?.id && (rx || ry || rz)) sm.scene3d?.setRotation(mesh.id, rx, ry, rz);
    this._added(mesh?.id);
  }

  /** Back one point (Backspace / the bar's Undo). */
  scene3dPolygonUndoPoint(): void {
    this.polyDraw?.pts.pop();
  }

  /** A plain left / first-finger press on the canvas while drawing: claimed (no pick / select); a tap adds the point
   *  on release, a drag stays a camera move. */
  polygonPointerDown(e: PointerEvent): boolean {
    if (!this.polyDraw) return false;
    this._polyDown = { id: e.pointerId, x: e.clientX, y: e.clientY };
    return true;
  }

  /** A second finger (pinch / two-finger orbit) or a cancelled pointer: the press is no tap. */
  polygonPointerAbort(): void { this._polyDown = null; }

  /** The rubber band follows the pointer (no change detection: the overlay redraws per frame). */
  polygonPointerMove(e: PointerEvent, canvas: HTMLCanvasElement): void {
    const d = this.polyDraw;
    if (!d) return;
    if (this._polyDown?.id === e.pointerId && Math.hypot(e.clientX - this._polyDown.x, e.clientY - this._polyDown.y) > POLY_TAP_SLOP_PX) {
      this._polyDown = null;   // a drag (orbit / pan): not a point
    }
    d.hover = this._worldAt(e.clientX, e.clientY, canvas, d);
  }

  /** A tap: a new point — or, on the first point (≥ 3 points) / the last one again (a double tap), the finish. */
  polygonPointerUp(e: PointerEvent, canvas: HTMLCanvasElement): boolean {
    const d = this.polyDraw, down = this._polyDown;
    if (!d) return false;
    this._polyDown = null;
    if (!down || down.id !== e.pointerId || Math.hypot(e.clientX - down.x, e.clientY - down.y) > POLY_TAP_SLOP_PX) return true;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (d.pts.length >= 3) {
      const near = (p: V3): boolean => {
        const s = this.shapeManager.projectWorldToScreen3D(p[0], p[1], p[2], rect.width, rect.height);
        return !!s && Math.hypot(s.x - sx, s.y - sy) <= POLY_CLOSE_PX;
      };
      if (near(d.pts[0]) || near(d.pts[d.pts.length - 1])) { this.scene3dFinishPolygonDraw(); return true; }
    }
    const w = this._worldAt(e.clientX, e.clientY, canvas, d);
    if (w) d.pts.push(w);
    return true;
  }

  /** The point on the draw plane under a client position (null when the view ray misses it). Before the first point the
   *  plane is re-chosen from the current view (it may have orbited). */
  private _worldAt(clientX: number, clientY: number, canvas: HTMLCanvasElement, d: PolygonDrawState): V3 | null {
    const sm = this.shapeManager;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ray = (sx: number, sy: number): [V3, V3] => {
      const a = sm.unprojectScreenToWorld3D(sx, sy, 0.5, rect.width, rect.height);
      const b = sm.unprojectScreenToWorld3D(sx, sy, 0.9, rect.width, rect.height);
      return [[a.x, a.y, a.z], [b.x, b.y, b.z]];
    };
    if (!d.plane || d.pts.length === 0) {
      const [a, b] = ray(rect.width / 2, rect.height / 2);
      d.plane = viewDrawPlane([b[0] - a[0], b[1] - a[1], b[2] - a[2]], d.center);
    }
    const [a, b] = ray(clientX - rect.left, clientY - rect.top);
    const hit = rayToPlane(a, b, d.plane);
    // Behind the camera (the plane is crossed by the ray's backward extension): not on the visible plane
    return hit && sm.projectWorldToScreen3D(hit[0], hit[1], hit[2], rect.width, rect.height) ? hit : null;
  }

  // ── Character…: a generated body at once (its Character panel follows the selection) ──

  scene3dAddCharacter(): Promise<void> {
    this.host.scene3dShowAddMeshMenu = false;
    return this.engineStatus.runBusy('Generating character', () => this.scene3dGenerateCharacter());
  }

  async scene3dGenerateCharacter(): Promise<void> {
    const sm = this.shapeManager;
    const rnd = randomizeCharacterInputs(this.shapeManager, null);

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
    const center = this._center();

    // Single salsa call → single scene-graph event (was ~9 separate calls)
    // Suppress 2D layer-tree rebuild during the call — 3D-only ops don't touch 2D layers
    this.host._suppressLayerTreeRebuild = true;
    let result: any;
    try {
      result = await sm.createFullCharacter3D({
        body: { ...CHAR_BODY_SHAPE, waist: rnd.waist, hipFront: rnd.hipFront },
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
    this.host.scene3dShowAddMeshMenu = false;
    // Trigger autosave — character creation suppressed the normal onSceneGraphChanged path
    this.host.scene3dMarkDirty();
  }
}
