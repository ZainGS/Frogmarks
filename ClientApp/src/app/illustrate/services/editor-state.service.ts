import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

/** (none — state only). */
export type EditorStateHost = Pick<IllustrationComponent, 'shapeManager'>;

/**
 * Editor state shared across the editor, its services and its panels (audit Phase 5.1): the 3D mesh list and
 * selection (id / ids / type / group / name), the 2D raster layers and layer selection, and the camera / view mode
 * (projection, FOV, target × camera, whether the 3D panel is up). Plain state with no dependencies, so any editor-scoped
 * service can inject it (no host Pick, no injection cycle). Behaviour that changes the selection stays with its owners
 * (the editor's scene3dSelectMesh, the outliner, …). Component-scoped (provided by IllustrationComponent).
 */
@Injectable()
export class EditorStateService implements OnDestroy {
  private host!: EditorStateHost;
  constructor() {}
  bind(host: EditorStateHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
  }

  selectedLayerIds: Set<string> = new Set();

  /** 3D Play mode is running: it owns the keyboard, so child panels (timeline, layers) skip their hotkeys. */
  playing = false;

  public selectedNode: any | null = null;

  /** Whether the 3D scene entry is currently selected in the layer panel */
  scene3dPanelVisible = false;

  scene3dCameraMode: 'perspective' | 'orthographic' = 'perspective';

  scene3dIllustrationProjection: 'perspective' | 'orthographic' = 'orthographic';

  scene3dFOV = 60;

  // View mode: target × cameraMode (driven by engine events — see applyViewUI3D)
  scene3dViewTarget: 'illustration' | 'scene' = 'illustration';

  scene3dViewCameraMode: 'ortho2D' | 'perspective2D' | 'free3D' = 'ortho2D';

  scene3dSelectedIsGroup = false;

  scene3dSelectedMeshType = '';

  // Mesh list from engine
  scene3dMeshes: Array<any> = [];

  // Selected mesh
  scene3dSelectedMeshId: string | null = null;

  scene3dSelectedMeshName = '';

  // Multi-select for boolean CSG
  scene3dSelectedMeshIds = new Set<string>();

  // Raster layers from ShapeManager (renderer)
  public rasterLayers: Array<any> = [];

  public selectedRasterLayerId: string | null = null;
}
