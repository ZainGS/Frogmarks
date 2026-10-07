/**
 * Salsa's ShapeManager is one engine for the whole page: it outlives every route. A 3D camera mode or 3D edit mode the
 * illustration editor left on therefore carried into the NEXT screen (mobile-parity 7.3c): after a free3D illustration,
 * a board's canvas got the orbit controller (it re-attaches to whatever canvas is live) and the 2D wheel / drag / pinch
 * were blocked (cameraOwnsView), the 3D workspace backdrop replaced the board's background, Play kept running and Edit
 * Mesh kept suppressing box-select. Every host that boots the engine for its own screen calls this first (board,
 * package editor, cart player, illustration editor), and the illustration editor calls it when it is left.
 */

/** The engine calls this needs. All optional: it compiles (and runs) against a Salsa build without some of them. */
interface EngineViewApi {
  /** Salsa's one-call reset (salsa src/services/shape-manager.ts resetTo2DEditingView). */
  resetTo2DEditingView?(): void;
  // Older Salsa build: the same reset from the per-mode APIs.
  isPlaying3D?: boolean;
  exitPlayMode3D?(): void;
  exitUIPlayerMode?(): void;
  isMeshEditMode3D?: boolean;
  detachMeshEditPointerHandlers?(): void;
  exitMeshEditMode3D?(): void;
  isUVPaintActive3D?(meshId?: string): boolean;
  closeAllUVEditors3D?(): void;
  exitUVPaintMode3D?(): void;
  exitCreatorStage3D?(): void;
  exitCDDesigner3D?(): void;
  getBoneOverlaySkeletonId3D?(): string | null;
  showBoneOverlay3D?(skeletonId: string | null): void;
  disableTransformControls3D?(): void;
  setHoveredMesh3D?(id: string | null): void;
  getViewState3D?(): { target?: string; cameraMode?: string } | null;
  setTarget3D?(target: 'illustration' | 'scene'): void;
  setCameraMode3D?(mode: 'ortho2D' | 'perspective2D' | 'free3D'): void;
  scene3d?: { exitMeshOrbit3D?(): void } | null;
  interactionService?: { cameraOwnsView?: boolean } | null;
}

/** Put the engine back into the plain 2D editing view: no Play, no 3D edit mode, no orbit / nav gizmo, illustration ×
 *  ortho2D, 2D pan / zoom owned by the 2D view. Document content is not touched and nothing is saved. Never throws. */
export function resetEngineTo2DView(engine: unknown): void {
  const sm = engine as EngineViewApi | null | undefined;
  if (!sm) return;
  if (typeof sm.resetTo2DEditingView === 'function') {
    try { sm.resetTo2DEditingView(); return; } catch (e) { console.warn('[engine] resetTo2DEditingView failed — falling back to the per-mode exits', e); }
  }
  legacyResetTo2DView(sm);
}

/** The fallback for a Salsa build without resetTo2DEditingView (exported for the spec). */
export function legacyResetTo2DView(sm: EngineViewApi): void {
  const step = (what: string, fn: () => void): void => {
    try { fn(); } catch (e) { console.warn('[engine] 2D view reset: ' + what + ' failed', e); }
  };
  step('Play', () => { if (sm.isPlaying3D) sm.exitPlayMode3D?.(); });
  step('UI player', () => sm.exitUIPlayerMode?.());
  step('Edit Mesh', () => { sm.detachMeshEditPointerHandlers?.(); if (sm.isMeshEditMode3D) sm.exitMeshEditMode3D?.(); });
  step('UV editor', () => {
    if (typeof sm.closeAllUVEditors3D === 'function') sm.closeAllUVEditors3D();
    else if (sm.isUVPaintActive3D?.()) sm.exitUVPaintMode3D?.();
  });
  step('creator stage', () => sm.exitCreatorStage3D?.());
  step('CD designer', () => sm.exitCDDesigner3D?.());
  step('armature overlay', () => { if (sm.getBoneOverlaySkeletonId3D?.() != null) sm.showBoneOverlay3D?.(null); });
  step('mesh orbit', () => sm.scene3d?.exitMeshOrbit3D?.());
  step('3D pointer', () => { sm.disableTransformControls3D?.(); sm.setHoveredMesh3D?.(null); });
  step('view mode', () => {
    const v = sm.getViewState3D?.() ?? null;
    if (v?.target && v.target !== 'illustration') sm.setTarget3D?.('illustration');
    if (v?.cameraMode && v.cameraMode !== 'ortho2D') sm.setCameraMode3D?.('ortho2D');   // releases orbit + nav gizmo
  });
  // The 2D gestures are gated on this flag: whatever claimed it, the 2D view owns pan / zoom from here on.
  step('camera ownership', () => { if (sm.interactionService) sm.interactionService.cameraOwnsView = false; });
}
