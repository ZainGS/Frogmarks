/**
 * Which 3D inspector controls are LIVE for the current state (audit docs/reviews/ui-dead-controls-2026-10-09.md §2).
 * Pure functions so the rules are unit-tested; the templates only ask these. Engine facts they encode (Salsa
 * mesh3d-fs-template.ts):
 *  - Metalness, Matte, True mirror and SSAO are read only in the Default (PBR) arm.
 *  - Roughness: PBR uses it fully; Cel / Cel-HD / Ink only for the point-light glint; Sketch / Gouraud / Unlit never.
 *  - Matte (bit 25) blocks the environment specular, which runs for metals (> 0.05), for smooth surfaces with SSR on,
 *    and for a True mirror (bit 26); a matte mirror is no mirror.
 *  - A normal map is ignored by Gouraud (per-vertex) and Unlit; it is sampled with the UV tiling / offset.
 *  - Triplanar diffuse uses only Tiling X (one world frequency) + the offset; Tiling Y then only reaches the normal map.
 */

/** Mesh render style as the panels name it ('default' = PBR). Unknown / missing = default. */
export type PanelRenderStyle = 'default' | 'cel' | 'cel-hd' | 'sketch' | 'ink' | 'gouraud' | 'unlit' | string;

export const isPbrStyle = (style: PanelRenderStyle | null | undefined): boolean => !style || style === 'default';

export interface MaterialControlVisibility {
  /** 'show' = full effect, 'glint' = point-light glint only (show with a hint), 'hide' = dead. */
  roughness: 'show' | 'glint' | 'hide';
  metalness: boolean;
  matte: boolean;
  mirror: boolean;
}

export function materialControlVisibility(
  style: PanelRenderStyle | null | undefined,
  o: { metalness: number; matte: boolean; mirror: boolean; ssrOn: boolean },
): MaterialControlVisibility {
  const pbr = isPbrStyle(style);
  const roughness: MaterialControlVisibility['roughness'] =
    pbr ? 'show' : (style === 'cel' || style === 'cel-hd' || style === 'ink') ? 'glint' : 'hide';
  return {
    roughness,
    metalness: pbr,
    // Matte works wherever the environment specular would run (metal, SSR, mirror); kept while ON so it can be undone.
    matte: pbr && (o.metalness > 0.05 || o.ssrOn || o.mirror || o.matte),
    mirror: pbr && !o.matte,
  };
}

export interface TextureControlVisibility {
  /** Tiling + Offset rows (both maps sample with them). */
  tiling: boolean;
  /** Tiling Y input (dead for a triplanar diffuse unless a normal map uses it). */
  tilingY: boolean;
  /** Tiling Y reaches only the normal map (triplanar diffuse + normal map): show a hint. */
  tilingYNormalOnly: boolean;
  /** Triplanar toggle (diffuse only). */
  triplanar: boolean;
  /** The normal map does something in this style (else a "no effect" hint replaces the per-pixel badge). */
  normalMapLive: boolean;
}

export function textureControlVisibility(
  style: PanelRenderStyle | null | undefined,
  o: { diffuse: boolean; normalMap: boolean; triplanar: boolean },
): TextureControlVisibility {
  const anyMap = o.diffuse || o.normalMap;
  const triDiffuse = o.diffuse && o.triplanar;
  return {
    tiling: anyMap,
    tilingY: anyMap && (!triDiffuse || o.normalMap),
    tilingYNormalOnly: triDiffuse && o.normalMap,
    triplanar: o.diffuse,
    normalMapLive: style !== 'gouraud' && style !== 'unlit',
  };
}

export type ViewCameraMode = 'ortho2D' | 'perspective2D' | 'free3D' | string;

export interface CameraPanelState {
  /** Ortho / Persp buttons (they drive the view-bar mode); hidden in 3D Free, whose orbit is always perspective. */
  showProjection: boolean;
  projection: 'orthographic' | 'perspective';
  /** FOV whenever the camera is perspective (2D Persp and 3D Free). */
  showFov: boolean;
  /** The camera's FOV in whole degrees (null = unknown, keep the stored value). */
  fovDeg: number | null;
}

/** The Camera panel from the REAL camera + view mode (the view bar owns the projection; the panel mirrors it). */
export function cameraPanelState(
  viewCameraMode: ViewCameraMode | null | undefined,
  cam: { mode?: string; fov?: number } | null | undefined,
): CameraPanelState {
  const free = viewCameraMode === 'free3D';
  const derived: CameraPanelState['projection'] = free || viewCameraMode === 'perspective2D' ? 'perspective' : 'orthographic';
  const projection: CameraPanelState['projection'] =
    cam?.mode === 'orthographic' || cam?.mode === 'perspective' ? cam.mode : derived;
  const fov = cam?.fov;
  return {
    showProjection: !free,
    projection,
    showFov: projection === 'perspective',
    fovDeg: typeof fov === 'number' && isFinite(fov) && fov > 0 ? Math.round(fov * 180 / Math.PI) : null,
  };
}

/** The view-bar camera mode a Projection button picks (2D modes only). */
export const viewModeForProjection = (p: 'orthographic' | 'perspective'): 'ortho2D' | 'perspective2D' =>
  p === 'orthographic' ? 'ortho2D' : 'perspective2D';
