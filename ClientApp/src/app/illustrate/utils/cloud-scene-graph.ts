/**
 * The scene graph a CLOUD save sends the server (mobile-parity 7.3c: the server used to ignore it, so a cloud-only
 * document opened on another device lost its vector shapes).
 *
 * Only the vector (2D) part: every 3D mesh already goes up as its own blob (uploadMeshBlob) and is restored from those
 * (restoreScene3DNodes). Restoring 3D nodes from the scene graph as well would duplicate groups / emitters and leave
 * placeholder nodes for skinned meshes. Also without the inline texture library (its own blob). This keeps the request
 * small: it used to carry the whole document scene graph — skinned geometry and base64 textures included — for nothing.
 *
 * Mirrors Salsa src/services/persistence/vector-scene-json.ts: a top-level node is 3D when its type contains "3D"
 * (3DMesh, 3DMeshGroup incl. procedural / decal / packaging markers, 3DArrayGroup, 3DClothMesh, ParticleEmitter3D,
 * GpObject3D, SkinnedMesh3D, Skeleton3D).
 */

/** The Salsa API used when the dist has it (typed here: Frogmarks types Salsa from its built dist). */
type VectorSceneApi = { getSceneGraphJSON2D?: () => string };

/** True for a top-level scene-graph JSON node that belongs to the 3D scene. */
export function isSceneNodeJSON3D(node: unknown): boolean {
  const type = (node as { type?: unknown } | null)?.type;
  return typeof type === 'string' && type.includes('3D');
}

/**
 * The vector part of a scene graph JSON string: the root's 3D children and the top-level `textureLibrary` removed.
 * Returns the input unchanged when there is nothing to remove, null when it is empty or not a scene graph.
 */
export function toVectorSceneGraphJSON(json: string | null | undefined): string | null {
  if (!json) return null;
  let parsed: any;
  try { parsed = JSON.parse(json); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || !parsed.root || typeof parsed.root !== 'object') return null;
  const children: unknown[] = Array.isArray(parsed.root.children) ? parsed.root.children : [];
  const kept = children.filter(c => !isSceneNodeJSON3D(c));
  const hasTexLib = Object.prototype.hasOwnProperty.call(parsed, 'textureLibrary');
  if (kept.length === children.length && !hasTexLib) return json;
  const { textureLibrary: _drop, ...rest } = parsed;
  return JSON.stringify({ ...rest, root: { ...parsed.root, children: kept } });
}

/**
 * What a cloud save sends as `sceneGraph`: Salsa's own 2D export (`sm.getSceneGraphJSON2D`, serializes the 2D nodes
 * only) when the dist has it, else `fullJson` (getSceneGraphJSON) filtered here.
 */
export function cloudSceneGraphJSON(sm: unknown, fullJson: string | null | undefined): string | null {
  const api = sm as VectorSceneApi | null;
  if (typeof api?.getSceneGraphJSON2D === 'function') {
    try { return api.getSceneGraphJSON2D(); } catch (e) { console.warn('[cloud] getSceneGraphJSON2D failed — filtering the full scene graph', e); }
  }
  return toVectorSceneGraphJSON(fullJson);
}
