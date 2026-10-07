import type ShapeManager from '@zaings/salsa/shape-manager';
import { meshEditTools } from '../components/illustration/editor-keymap';

/**
 * Edit Mesh operations shared by both layouts (UI review 2026-10-07 §4): the classic overlay panel
 * (<app-mesh-edit-panel>, Experimental › Classic Edit Mesh panel) and the mode chrome (op pill, radial menu, props
 * panel). Plain functions on the engine: (sm, meshId, …). Engine APIs newer than the Salsa dist Frogmarks type-checks
 * against are feature-detected, with the older per-face fallbacks where one exists.
 */

export interface MeshModifier {
  type: 'mirror' | 'subdivision' | 'displace';
  enabled: boolean;
  index: number;
  axis?: 'x' | 'y' | 'z';
  iterations?: number;
  strength?: number;
  frequency?: number;
  octaves?: number;
  seed?: number;
  direction?: 'x' | 'y' | 'z' | 'normal';
}

export interface DisplaceParams {
  strength: number;
  frequency: number;
  octaves: number;
  seed: number;
  direction: 'x' | 'y' | 'z' | 'normal';
}

export type ProportionalFalloff = 'smooth' | 'linear' | 'sharp';

/** Salsa region ops newer than the dist Frogmarks type-checks against (UI review 2026-10-07): feature-detected. */
export interface RegionOpsApi {
  extrudeRegion3D?(meshId: string, faces: Iterable<number> | null, distance: number): boolean;
  insetRegion3D?(meshId: string, faces: Iterable<number> | null, amount: number, depth?: number): boolean;
  subdivideFaces3D?(meshId: string, faces: Iterable<number> | null, levels?: number): boolean;
  fillHoles3D?(meshId: string): number;
  bridgeLoops3D?(meshId: string, verts: Iterable<number> | null): boolean;
  loopCuts3D?(meshId: string, halfEdgeIdx: number, count?: number, position?: number): boolean;
}

/** The selection of the mesh being edited, as arrays (empty when there is none). */
export interface MeshEditSelectionLists { vertices: number[]; edges: number[]; faces: number[] }

const regionOps = (sm: unknown): RegionOpsApi => (sm ?? {}) as RegionOpsApi;

export function editSelection(sm: ShapeManager | null | undefined, meshId: string | null | undefined): MeshEditSelectionLists {
  if (!sm || !meshId) return { vertices: [], edges: [], faces: [] };
  const sel = sm.getEditSelection3D(meshId) as { vertices?: Set<number>; edges?: Set<number>; faces?: Set<number> } | null;
  return {
    vertices: sel?.vertices ? [...sel.vertices] : [],
    edges: sel?.edges ? [...sel.edges] : [],
    faces: sel?.faces ? [...sel.faces] : [],
  };
}

/** Has the newer region ops (one undo step for the whole selection). */
export const hasRegionOps = (sm: unknown): boolean => typeof regionOps(sm).extrudeRegion3D === 'function';

/** Extrude: connected selected faces move as ONE region (one ring of walls, a welded top) and stay selected, ready
 *  for the next extrude / G. Older Salsa: each face on its own (the selection is cleared). */
export function extrudeFaces(sm: ShapeManager, meshId: string, faces: number[], distance: number): boolean {
  if (!faces.length) return false;
  const r = regionOps(sm);
  if (typeof r.extrudeRegion3D === 'function') return r.extrudeRegion3D(meshId, new Set(faces), distance);
  for (const fi of faces) sm.extrudeEditFace3D(meshId, fi, distance);
  sm.clearEditSelection3D(meshId);
  return true;
}

/** Inset: one border around each connected group of selected faces (the inner faces stay selected). `depth` moves
 *  the inner faces along their normal (a newer Salsa; ignored by the per-face fallback). */
export function insetFaces(sm: ShapeManager, meshId: string, faces: number[], amount: number, depth = 0): boolean {
  if (!faces.length) return false;
  const r = regionOps(sm);
  if (typeof r.insetRegion3D === 'function') {
    return depth ? r.insetRegion3D(meshId, new Set(faces), amount, depth) : r.insetRegion3D(meshId, new Set(faces), amount);
  }
  for (const fi of faces) sm.insetEditFace3D(meshId, fi, amount);
  sm.clearEditSelection3D(meshId);
  return true;
}

/** Delete the faces (one undo step on a dist with deleteFaces3D; else highest index first, no index shifting). */
export function deleteFaces(sm: ShapeManager, meshId: string, faces: number[]): void {
  if (!faces.length) return;
  if (typeof sm.deleteFaces3D === 'function') sm.deleteFaces3D(meshId, new Set(faces));
  else for (const fi of [...faces].sort((a, b) => b - a)) sm.deleteEditFace3D(meshId, fi);
  sm.clearEditSelection3D(meshId);
}

export function flipFaces(sm: ShapeManager, meshId: string, faces: number[]): void {
  if (!faces.length) return;
  sm.flipFaces3D(meshId, new Set(faces));
  sm.clearEditSelection3D(meshId);
}

/** Subdivide every selected face at once (shared midpoints: a selected grid stays a grid; one undo step). Older
 *  Salsa: one by one, highest index first (each subdivide removes its face, so lower indices stay valid). */
export function subdivideFaces(sm: ShapeManager, meshId: string, faces: number[]): void {
  if (!faces.length) return;
  const r = regionOps(sm);
  if (typeof r.subdivideFaces3D === 'function') { r.subdivideFaces3D(meshId, new Set(faces)); sm.clearEditSelection3D(meshId); return; }
  for (const fi of [...faces].sort((a, b) => b - a)) sm.subdivideFace3D(meshId, fi);
  sm.clearEditSelection3D(meshId);
}

export function separateFaces(sm: ShapeManager, meshId: string, faces: number[]): void {
  if (!faces.length) return;
  sm.separateFaces3D(meshId, new Set(faces));
  sm.clearEditSelection3D(meshId);
}

/** Merge by Distance: how many vertices were merged (null = the engine didn't say). */
export function mergeByDistance(sm: ShapeManager, meshId: string, threshold: number): number | null {
  const removed = sm.mergeByDistance3D(meshId, threshold);
  return typeof removed === 'number' ? removed : null;
}

/** Fill Holes: EVERY hole (or, with vertices / edges selected on holes, just those) in one undo step. Older Salsa:
 *  the first hole, again and again until none is left. Returns how many were filled. */
export function fillHoles(sm: ShapeManager, meshId: string): number {
  const r = regionOps(sm);
  if (typeof r.fillHoles3D === 'function') return r.fillHoles3D(meshId);
  let filled = 0;
  for (let guard = 0; guard < 256; guard++) {
    const em = sm.getMesh3D(meshId)?.editMesh;
    const boundaryIdx = em ? (em.halfEdges as Array<{ twin: number }>).findIndex(he => he.twin === -1) : -1;
    if (boundaryIdx === -1 || !sm.fillHole3D(meshId, boundaryIdx)) break;
    filled++;
  }
  return filled;
}

/** Bridge Loops is possible: ≥ 4 vertices selected (or, on a newer Salsa, ≥ 4 edges — their ends). */
export function canBridge(sm: unknown, sel: MeshEditSelectionLists): boolean {
  return sel.vertices.length >= 4 || (typeof regionOps(sm).bridgeLoops3D === 'function' && sel.edges.length >= 4);
}

/** Bridge the two loops the selection forms, whatever order they were picked in (the engine orders them by their
 *  edges). Older Salsa: the selection split in half by pick order. */
export function bridgeLoops(sm: ShapeManager, meshId: string, sel: MeshEditSelectionLists): boolean {
  if (!canBridge(sm, sel)) return false;
  const r = regionOps(sm);
  if (typeof r.bridgeLoops3D === 'function') return r.bridgeLoops3D(meshId, null);
  const half = Math.floor(sel.vertices.length / 2);
  const loopA = sel.vertices.slice(0, half), loopB = sel.vertices.slice(half);
  if (loopA.length !== loopB.length) return false;
  sm.bridgeEdgeLoops3D(meshId, loopA, loopB);
  sm.clearEditSelection3D(meshId);
  return true;
}

/** Merge the selected vertices into one (the lowest index; each weld is its own undo step). Welds go highest index
 *  first: a weld removes the higher vertex and shifts only the indices above it, so the rest stay valid. */
export function mergeVertices(sm: ShapeManager, meshId: string, verts: number[]): boolean {
  if (verts.length < 2) return false;
  const sorted = [...new Set(verts)].sort((a, b) => a - b);
  const keep = sorted[0];
  let ok = false;
  for (const v of sorted.slice(1).reverse()) ok = sm.weldEditVertices3D(meshId, keep, v) || ok;
  sm.clearEditSelection3D(meshId);
  return ok;
}

/** Loop cut through a half-edge: `count` cuts at `position` on a newer Salsa (loopCuts3D), else one cut at `position`. */
export function loopCutAt(sm: ShapeManager, meshId: string, halfEdge: number, count: number, position: number): boolean {
  const r = regionOps(sm);
  if (typeof r.loopCuts3D === 'function') return r.loopCuts3D(meshId, halfEdge, count, position);
  return sm.loopCut3D(meshId, halfEdge, position);
}

export const hasMultiLoopCut = (sm: unknown): boolean => typeof regionOps(sm).loopCuts3D === 'function';

// ── Shading (feature-detected) ──────────────────────────────────────────────────────────────────────────────────

export const hasShading = (sm: unknown): boolean => typeof meshEditTools(sm).setFacesSmooth3D === 'function';
export const hasSharp = (sm: unknown): boolean => typeof meshEditTools(sm).setSharpEdges3D === 'function';

/** Shade the faces smooth / flat — every face when none is given (one undo step). */
export function shadeFaces(sm: ShapeManager, meshId: string, faces: number[], smooth: boolean): boolean {
  const t = meshEditTools(sm);
  if (typeof t.setFacesSmooth3D !== 'function') return false;
  return t.setFacesSmooth3D(meshId, faces.length ? new Set(faces) : null, smooth);
}

/** Mark / clear the edges sharp (drawn cyan; one undo step). */
export function markSharpEdges(sm: ShapeManager, meshId: string, edges: number[], sharp: boolean): boolean {
  const t = meshEditTools(sm);
  if (typeof t.setSharpEdges3D !== 'function' || edges.length === 0) return false;
  return t.setSharpEdges3D(meshId, edges, sharp);
}

// ── Proportional edit ───────────────────────────────────────────────────────────────────────────────────────────

export function setProportional(sm: ShapeManager, meshId: string | null, on: boolean, radius: number, falloff: ProportionalFalloff): void {
  sm.setProportionalEdit3D(meshId, on, radius, falloff);
}

// ── Modifiers ───────────────────────────────────────────────────────────────────────────────────────────────────

export function readModifiers(sm: ShapeManager | null | undefined, meshId: string | null | undefined): MeshModifier[] {
  if (!sm || !meshId) return [];
  const raw = (sm.getModifiers3D(meshId) ?? []) as Array<Partial<MeshModifier> & { type: MeshModifier['type']; enabled: boolean }>;
  return raw.map((m, i) => ({
    type: m.type, enabled: m.enabled, index: i, axis: m.axis, iterations: m.iterations, strength: m.strength,
    frequency: m.frequency, octaves: m.octaves, seed: m.seed, direction: m.direction,
  }));
}

/** A modifier's name as the panels show it ("Mirror X", "Subdivision ×2", "Displace"). */
export function modifierLabel(m: Pick<MeshModifier, 'type' | 'axis' | 'iterations'>): string {
  if (m.type === 'mirror') return `Mirror ${(m.axis ?? 'x').toUpperCase()}`;
  if (m.type === 'subdivision') return `Subdivision ×${m.iterations ?? 1}`;
  return 'Displace';
}

/** Triangles in the mesh's current geometry (0 = none / unknown). */
export function triangleCount(sm: ShapeManager | null | undefined, meshId: string | null | undefined): number {
  const geom = meshId ? sm?.getMesh3D(meshId)?.geometry : null;
  return geom ? Math.round(geom.indices.length / 3) : 0;
}

/** Decimate (destructive, undoable): keep `ratio` of the triangles. Returns the triangle count after. */
export function decimate(sm: ShapeManager, meshId: string, ratio: number): number {
  sm.simplifyMesh3D(meshId, ratio);
  return triangleCount(sm, meshId);
}

// ── Typed indices (Experimental › Developer buttons; the chrome acts on the selection instead) ──────────────────

/** A typed element index: 0 is valid; '' / junk is not. */
export function parseIndex(text: unknown): number | null {
  if (text === '' || text === null || text === undefined) return null;
  const n = parseInt(String(text), 10);
  return Number.isNaN(n) || n < 0 ? null : n;
}

export function hexToRgb(hex: string): [number, number, number] {
  if (!hex || hex.length < 7) return [1, 0, 0];
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}
