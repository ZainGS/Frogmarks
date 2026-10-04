import { Injectable } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state image / model import uses. */
export type MediaImportHost = Pick<IllustrationComponent, 'shapeManager' |
  '_instanceGroupRegister' | 'canvas' | 'imageFileInput' | 'imageFileInputLayer' | 'refreshRasterLayers' |
  'scene3dMarkTexLibDirty' | 'scene3dRefreshMeshes' | 'scene3dSelectMesh' | 'selectRasterLayer'
>;

/**
 * Importing media: images as a new layer or into the current one (file picker, clipboard paste, drag-and-drop) and
 * 3D models (.glb / .gltf / .obj, dropped or picked, auto-scaled to the illustration). Component-scoped (provided by
 * IllustrationComponent). Bodies moved verbatim from illustration.component (refactor-plan 2.9H).
 */
@Injectable()
export class MediaImportService {
  private host!: MediaImportHost;
  constructor(private editorState: EditorStateService) {}
  bind(host: MediaImportHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  /** Triggered from Edit menu → Import Image as Layer */
  importImageAsNewLayer(): void {
    this.host.imageFileInput?.nativeElement?.click();
  }

  /** Triggered from Edit menu → Import Image to Layer */
  importImageToCurrentLayer(): void {
    this.host.imageFileInputLayer?.nativeElement?.click();
  }

  /** Hidden <input type="file"> change → import as new layer */
  async onImageFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const sm = this.shapeManager;
    const layerId = await sm.importImageAsNewLayer(file, file.name.replace(/\.[^.]+$/, ''));
    if (layerId) {
      this.host.selectRasterLayer(layerId);
      this.host.refreshRasterLayers();
    }
    // Reset so re-selecting the same file still triggers change
    (event.target as HTMLInputElement).value = '';
  }

  /** Hidden <input type="file"> change → import into current layer */
  async onImageFileSelectedToLayer(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const sm = this.shapeManager;
    await sm.importImageToCurrentLayer(file);
    (event.target as HTMLInputElement).value = '';
  }

  /** Paste event handler — imports clipboard image into current layer */
  handlePasteImage(e: ClipboardEvent): void {
    // Don't intercept paste when typing in an input
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (this.shapeManager.isInputActive()) return;

    const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
    if (!item) return;

    const file = item.getAsFile();
    if (!file) return;

    e.preventDefault();
    void this.shapeManager.importImageToCurrentLayer(file);
  }

  /** Paste image from clipboard — triggered from Edit menu */
  async pasteImageFromClipboard(): Promise<void> {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          await this.shapeManager.importImageToCurrentLayer(blob);
          return;
        }
      }
    } catch (err) {
      console.warn('[ImageImport] Clipboard read failed:', err);
    }
  }

  /** Canvas dragover — allow drop */
  onCanvasDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.some(t => t === 'Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  /** Canvas drop — import 3D models (.glb/.gltf/.obj) or images when appropriate */
  async onCanvasDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);

    if (this.editorState.scene3dPanelVisible) {
      const modelFile = files.find(f => /\.(glb|gltf|obj)$/i.test(f.name));
      if (modelFile) {
        await this.scene3dImportModelFile(modelFile);
        return;
      }
    }

    // image → new raster layer
    const imageFile = files.find(f => f.type.startsWith('image/'));
    if (!imageFile) return;
    const sm = this.shapeManager;
    const layerId = await sm.importImageAsNewLayer(imageFile, imageFile.name.replace(/\.[^.]+$/, ''));
    if (layerId) {
      this.host.selectRasterLayer(layerId);
      this.host.refreshRasterLayers();
    }
  }

  async scene3dImportModelFile(file: File): Promise<void> {
    const sm = this.shapeManager;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'glb' || ext === 'gltf') {
      const meshes: any[] = await sm.importGltfFile3D(0, 0, 0, file) ?? [];
      if (meshes.length) {
        this.host._instanceGroupRegister(crypto.randomUUID(), meshes.map((m: any) => m.id ?? m.nodeId));
        this._scene3dAutoScale(meshes);
        this.host.scene3dRefreshMeshes();
        this.host.scene3dSelectMesh(meshes[0].id ?? meshes[0].nodeId);
        this.host.scene3dMarkTexLibDirty(); // GLTF may embed textures into the library
      }
    } else if (ext === 'obj') {
      const mesh = await sm.importObjFile3D(0, 0, 0, file);
      if (mesh) {
        this.host._instanceGroupRegister(crypto.randomUUID(), [mesh.id]);
        this._scene3dAutoScale([mesh]);
        this.host.scene3dRefreshMeshes();
        this.host.scene3dSelectMesh(mesh.id);
        this.host.scene3dMarkTexLibDirty();
      }
    }
  }

  /** Auto-scale imported meshes if they are tiny relative to the canvas (GLTF uses metres, canvas uses pixels). */
  _scene3dAutoScale(meshes: any[]): void {
    if (!meshes.length) return;
    const sm = this.shapeManager;
    const canvasSize = this.host.canvas?.width ?? 800;
    for (const mesh of meshes) {
      const bbox = mesh.calculateBoundingBox?.() ?? mesh.boundingBox;
      if (!bbox) continue;
      const modelSize = Math.max(bbox.width ?? 0, bbox.height ?? 0, bbox.depth ?? 0, 0.001);
      if (modelSize < canvasSize * 0.05) {
        const scale = (canvasSize * 0.3) / modelSize;
        sm.scene3d?.setScale(mesh.id, scale, scale, scale);
      }
    }
  }

  async scene3dImportModelFromPicker(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await this.scene3dImportModelFile(file);
    (event.target as HTMLInputElement).value = '';
  }
}
