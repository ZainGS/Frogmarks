import type ShapeManager from '@zaings/salsa/shape-manager';

/**
 * Add Mesh › Cylinder… / Circle… / Polygon… / Revolve… / Tube… / Metaballs… / Creature…: the default settings an
 * instant add uses, and the read / write of a mesh's generator settings (Salsa getMeshGenerator3D /
 * setMeshGenerator3D / bakeMeshGenerator3D — kept on the mesh and saved with it; Edit Mesh's Modifiers card edits
 * them). The engine drops them once the mesh's geometry changed outside them (an undo of that change brings them
 * back). An engine build without those calls has no settings: every call here is guarded and then reports none.
 */

export type MeshGenType = 'cylinder' | 'circle' | 'polygon' | 'revolve' | 'tube' | 'metaball' | 'creature';

export interface MeshGenState { type: MeshGenType; params: Record<string, any> }

export type MetaballShape = 'sphere' | 'capsule' | 'ellipsoid' | 'box' | 'torus';
export interface MetaballBlob {
  shape: MetaballShape;
  a: [number, number, number];
  b?: [number, number, number];
  radius: number;
  blend: number;
  subtract?: boolean;
}

/** The card title for each type. */
export const MESH_GEN_TITLES: Record<MeshGenType, string> = {
  cylinder: 'Cylinder', circle: 'Circle', polygon: 'Polygon', revolve: 'Revolve',
  tube: 'Tube', metaball: 'Metaballs', creature: 'Creature',
};

export const CREATURE_SPECIES = ['dog', 'cat', 'horse', 'lizard', 'bird', 'generic'] as const;
export const METABALL_SHAPES: MetaballShape[] = ['sphere', 'capsule', 'ellipsoid', 'box', 'torus'];

/** The instant-add defaults (the old quick forms' starting values). Fresh copies — callers may mutate them. */
export function meshGenDefaults(type: Exclude<MeshGenType, 'polygon'>): Record<string, any> {
  switch (type) {
    case 'cylinder': return { radius: 0.3, radiusTop: 0.3, height: 0.8, segments: 12 };
    // flat, like Blender's Circle: ONE n-gon face (an older circle's height > 0 still loads + regenerates as saved)
    case 'circle':   return { radius: 0.5, segments: 16, height: 0 };
    case 'revolve':  return { profile: [[0.3, -0.4], [0.4, 0], [0.3, 0.4]], segments: 16 };
    case 'tube':     return { path: [[0, -0.4, 0], [0, 0, 0], [0, 0.4, 0]], radii: [0.1, 0.15, 0.1], segments: 8 };
    case 'metaball': return {
      blobs: [
        { shape: 'sphere', a: [-0.2, 0, 0], b: [0, 0.3, 0], radius: 0.3, blend: 0.3 },
        { shape: 'sphere', a: [0.2, 0, 0], b: [0, 0.3, 0], radius: 0.25, blend: 0.3 },
      ] as MetaballBlob[],
      resolution: 32, decimate: 1,
    };
    case 'creature': return {
      species: 'dog', seed: 42, resolution: 32,
      bodyLength: 1.0, bodyRadius: 0.3, legCount: 4, legLength: 0.5, neckLength: 0.3, headSize: 0.4,
      tailLength: 0.4, tailCurl: 0.3, earSize: 0.2, blend: 0.3, eyes: true, decimate: 0.4,
    };
  }
}

/** Polygon… outline extrusion height. */
export const POLYGON_DEFAULT_HEIGHT = 0.2;

// ── Generator settings: read / write ────────────────────────────────────────

type GenApi = {
  getMeshGenerator3D?(id: string): MeshGenState | null;
  setMeshGenerator3D?(id: string, params: Record<string, unknown>, opts?: { commit?: boolean }): boolean;
  bakeMeshGenerator3D?(id: string): boolean;
  getMesh3D?(id: string): { generatorApplies?: boolean } | null;
};
const api = (sm: ShapeManager | null | undefined): GenApi | null => (sm ? sm as unknown as GenApi : null);

/** The engine keeps generator settings (a newer Salsa). */
export function engineHasMeshGenerators(sm: ShapeManager | null | undefined): boolean {
  const a = api(sm);
  return typeof a?.getMeshGenerator3D === 'function' && typeof a?.setMeshGenerator3D === 'function';
}

/** Cheap check (no copy): the mesh has settings that still apply. */
export function meshGeneratorApplies(sm: ShapeManager | null | undefined, id: string | null | undefined): boolean {
  if (!id || !engineHasMeshGenerators(sm)) return false;
  const flag = api(sm)!.getMesh3D?.(id)?.generatorApplies;
  return typeof flag === 'boolean' ? flag : !!api(sm)!.getMeshGenerator3D!(id);
}

/** The mesh's generator settings (a copy), or null — none, or they no longer apply. */
export function readMeshGenerator(sm: ShapeManager | null | undefined, id: string | null | undefined): MeshGenState | null {
  if (!id || !engineHasMeshGenerators(sm)) return null;
  const g = api(sm)!.getMeshGenerator3D!(id);
  return g && g.type in MESH_GEN_TITLES ? { type: g.type, params: JSON.parse(JSON.stringify(g.params)) } : null;
}

/** Regenerate the mesh from `params`. `commit: false` = a live step of a drag (the commit after it is ONE undo step).
 *  False when the settings no longer apply. */
export function applyMeshGenerator(sm: ShapeManager | null | undefined, id: string, params: Record<string, any>, commit: boolean): boolean {
  if (!engineHasMeshGenerators(sm)) return false;
  return api(sm)!.setMeshGenerator3D!(id, JSON.parse(JSON.stringify(params)), { commit }) === true;
}

/** Bake: the mesh keeps its shape and the settings go away (one undo step). */
export function bakeMeshGenerator(sm: ShapeManager | null | undefined, id: string): boolean {
  const f = api(sm)?.bakeMeshGenerator3D;
  return typeof f === 'function' && f.call(sm, id) === true;
}

// ── Polygon… outline ────────────────────────────────────────────────────────

export type V3 = [number, number, number];
export type Axis = 0 | 1 | 2;
/** The drawing plane: perpendicular to world axis `axis`, through `value` on it; `sign` = the side the camera is on
 *  (the shape extrudes toward it). */
export interface DrawPlane { axis: Axis; sign: 1 | -1; value: number }

/** The axis-aligned plane that faces a view direction best (looking down → the ground plane; a front view → the
 *  upright plane facing it), through `through`. */
export function viewDrawPlane(dir: V3, through: V3): DrawPlane {
  const a = dir.map(Math.abs);
  const axis: Axis = a[1] >= a[0] && a[1] >= a[2] ? 1 : a[2] >= a[0] ? 2 : 0;
  return { axis, sign: dir[axis] > 0 ? -1 : 1, value: through[axis] };
}

/** Where the line through p0 → p1 crosses the plane (null when it runs along it). */
export function rayToPlane(p0: V3, p1: V3, plane: DrawPlane): V3 | null {
  const k = plane.axis, d = p1[k] - p0[k];
  if (Math.abs(d) < 1e-9) return null;
  const t = (plane.value - p0[k]) / d;
  return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t];
}

/** A drawn outline (world points on one draw plane) → the polygon mesh's centre, its [x, z] outline in the mesh's own
 *  frame (the engine extrudes along local +Y) and the rotation (radians) that stands that frame on the plane, facing
 *  the camera. Consecutive near-duplicates (a double tap) and a closing repeat of the first point are dropped; null
 *  when fewer than 3 points or no area remain. */
export function outlineToPolygon(world: V3[], plane: DrawPlane = { axis: 1, sign: 1, value: 0 }, eps = 1e-4):
    { center: V3; points: [number, number][]; rotation: V3 } | null {
  const dist = (p: V3, q: V3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const pts: V3[] = [];
  for (const p of world) if (!pts.length || dist(p, pts[pts.length - 1]) > eps) pts.push(p);
  if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) <= eps) pts.pop();
  if (pts.length < 3) return null;
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const center: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  center[plane.axis] = plane.value;
  const h = Math.PI / 2, s = plane.sign;
  // World offset on the plane → the mesh's local (x, z), and the rotation that maps local +Y onto the plane normal
  const frame: { map: (d: V3) => [number, number]; rotation: V3 } =
    plane.axis === 1 ? { map: d => [d[0], d[2]], rotation: [0, 0, 0] }
    : plane.axis === 2 ? { map: d => [d[0], s > 0 ? -d[1] : d[1]], rotation: [s * h, 0, 0] }
    : { map: d => [s > 0 ? -d[1] : d[1], d[2]], rotation: [0, 0, -s * h] };
  const points = pts.map(p => frame.map([p[0] - center[0], p[1] - center[1], p[2] - center[2]]));
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[(i + 1) % points.length];
    area += x0 * z1 - x1 * z0;
  }
  const span = Math.max(...[0, 1, 2].filter(k => k !== plane.axis).map(k => hi[k] - lo[k]));
  if (span <= eps || Math.abs(area) * 0.5 <= span * span * 1e-6) return null;
  return { center, points, rotation: frame.rotation };
}
