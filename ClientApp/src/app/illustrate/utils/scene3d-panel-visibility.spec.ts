import {
  cameraPanelState, isPbrStyle, materialControlVisibility, textureControlVisibility, viewModeForProjection,
} from './scene3d-panel-visibility';

// Audit docs/reviews/ui-dead-controls-2026-10-09.md §2 — controls shown where they do nothing / hidden where they work.

describe('scene3d-panel-visibility › Mesh Material', () => {
  const base = { metalness: 0, matte: false, mirror: false, ssrOn: false };

  it('Metalness / Matte / True mirror only in Default (PBR)', () => {
    for (const style of ['cel', 'cel-hd', 'sketch', 'ink', 'gouraud', 'unlit']) {
      const v = materialControlVisibility(style, { ...base, metalness: 1, ssrOn: true });
      expect(v.metalness).withContext(style).toBe(false);
      expect(v.matte).withContext(style).toBe(false);
      expect(v.mirror).withContext(style).toBe(false);
    }
    const pbr = materialControlVisibility('default', { ...base, metalness: 1 });
    expect(pbr.metalness).toBe(true);
    expect(pbr.matte).toBe(true);
    expect(pbr.mirror).toBe(true);
    expect(isPbrStyle(undefined)).toBe(true);   // no style = Default
  });

  it('Matte shows where it blocks reflections: metal, SSR on, or a True mirror (also at metalness <= 0.05)', () => {
    expect(materialControlVisibility('default', base).matte).toBe(false);                        // nothing to block
    expect(materialControlVisibility('default', { ...base, metalness: 0.2 }).matte).toBe(true);
    expect(materialControlVisibility('default', { ...base, ssrOn: true }).matte).toBe(true);    // smooth dielectric + SSR
    expect(materialControlVisibility('default', { ...base, mirror: true }).matte).toBe(true);
    expect(materialControlVisibility('default', { ...base, matte: true }).matte).toBe(true);    // stays to be undone
  });

  it('True mirror hides while Matte is on (a matte mirror is no mirror) — never both hidden', () => {
    const v = materialControlVisibility('default', { ...base, matte: true, mirror: true });
    expect(v.mirror).toBe(false);
    expect(v.matte).toBe(true);
  });

  it('Roughness: full in PBR, point-light glint in Cel / Cel-HD / Ink, hidden in Sketch / Gouraud / Unlit', () => {
    expect(materialControlVisibility('default', base).roughness).toBe('show');
    for (const s of ['cel', 'cel-hd', 'ink']) expect(materialControlVisibility(s, base).roughness).withContext(s).toBe('glint');
    for (const s of ['sketch', 'gouraud', 'unlit']) expect(materialControlVisibility(s, base).roughness).withContext(s).toBe('hide');
  });
});

describe('scene3d-panel-visibility › Mesh Texture', () => {
  it('Tiling / Offset show with ANY map (a normal map alone uses them)', () => {
    expect(textureControlVisibility('default', { diffuse: false, normalMap: false, triplanar: false }).tiling).toBe(false);
    expect(textureControlVisibility('default', { diffuse: false, normalMap: true, triplanar: false }).tiling).toBe(true);
    expect(textureControlVisibility('default', { diffuse: true, normalMap: false, triplanar: false }).tiling).toBe(true);
  });

  it('Triplanar diffuse uses only Tiling X: Y hidden without a normal map, hinted with one', () => {
    const noNm = textureControlVisibility('default', { diffuse: true, normalMap: false, triplanar: true });
    expect(noNm.tilingY).toBe(false);
    expect(noNm.tilingYNormalOnly).toBe(false);
    const nm = textureControlVisibility('default', { diffuse: true, normalMap: true, triplanar: true });
    expect(nm.tilingY).toBe(true);
    expect(nm.tilingYNormalOnly).toBe(true);
    expect(textureControlVisibility('default', { diffuse: false, normalMap: true, triplanar: true }).triplanar).toBe(false);
  });

  it('the per-pixel badge is wrong for Gouraud / Unlit (the normal map is ignored there)', () => {
    const o = { diffuse: false, normalMap: true, triplanar: false };
    expect(textureControlVisibility('gouraud', o).normalMapLive).toBe(false);
    expect(textureControlVisibility('unlit', o).normalMapLive).toBe(false);
    for (const s of ['default', 'cel', 'cel-hd', 'sketch', 'ink']) expect(textureControlVisibility(s, o).normalMapLive).withContext(s).toBe(true);
  });
});

describe('scene3d-panel-visibility › Camera panel', () => {
  const deg = (d: number) => d * Math.PI / 180;

  it('reflects the real camera: FOV whenever perspective (2D Persp and 3D Free), hidden in 2D Ortho', () => {
    const ortho = cameraPanelState('ortho2D', { mode: 'orthographic', fov: deg(45) });
    expect(ortho.projection).toBe('orthographic');
    expect(ortho.showFov).toBe(false);
    expect(ortho.showProjection).toBe(true);
    const persp = cameraPanelState('perspective2D', { mode: 'perspective', fov: deg(50) });
    expect(persp.showFov).toBe(true);
    expect(persp.fovDeg).toBe(50);
    const free = cameraPanelState('free3D', { mode: 'perspective', fov: deg(70) });
    expect(free.showFov).toBe(true);
    expect(free.fovDeg).toBe(70);
  });

  it('Projection is hidden in 3D Free (orbit is always perspective) and maps to the view-bar modes', () => {
    expect(cameraPanelState('free3D', null).showProjection).toBe(false);
    expect(cameraPanelState('free3D', null).projection).toBe('perspective');
    expect(viewModeForProjection('orthographic')).toBe('ortho2D');
    expect(viewModeForProjection('perspective')).toBe('perspective2D');
  });

  it('falls back to the view mode without a camera; unknown FOV = null', () => {
    expect(cameraPanelState('perspective2D', null).projection).toBe('perspective');
    expect(cameraPanelState('ortho2D', undefined).projection).toBe('orthographic');
    expect(cameraPanelState('perspective2D', { mode: 'perspective' }).fovDeg).toBeNull();
  });
});
