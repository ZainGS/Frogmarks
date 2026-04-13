import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import JSZip from 'jszip';
import ShapeManager from '@zaings/salsa/shape-manager';
import { RasterAnimationService, OnionSkinConfig, LoopMode, CelInfo } from '../raster/raster-animation.service';
import {
  IllustrationStateDto,
  AnimationStateDto,
  LayerStateDto,
  DitherConfigDto,
} from './illustration.service';

// ── Constants ──────────────────────────────────────────────────

const FROG_FILE_EXTENSION = '.frog';
const FROG_MIME = 'application/octet-stream';
const MANIFEST_FILE = 'manifest.json';
const SCENE_FILE = 'scene.json';
const THUMBNAIL_FILE = 'thumbnail.webp';
const LAYERS_DIR = 'layers';

// ── Helper types ───────────────────────────────────────────────

export interface FrogManifest {
  version: number;
  name: string;
  createdAt: string;
  animation: AnimationStateDto | null;
  layers: LayerStateDto[];
  ditherConfig?: DitherConfigDto | null;
}

export interface FrogImportResult {
  manifest: FrogManifest;
  sceneGraph: string;
  thumbnail: Blob | null;
  ditherConfig?: DitherConfigDto | null;
  layerPixelData: Array<{
    layerId: string;
    celId?: string;
    name: string;
    imageDataUrl: string;
    blendMode: string;
    opacity: number;
    visible: boolean;
    locked: boolean;
    clipped: boolean;
    lockTransparency: boolean;
  }>;
}

// ── Service ────────────────────────────────────────────────────

// Lookup for numeric blend mode values returned by the Salsa engine.
// If the engine returns a string, it passes through unchanged.
const BLEND_MODE_NAMES: string[] = [
  'normal', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
  'hue', 'saturation', 'color', 'luminosity',
];

function normalizeBlendMode(value: any): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return BLEND_MODE_NAMES[value] ?? 'normal';
  return 'normal';
}

@Injectable({ providedIn: 'root' })
export class FrogFileService {

  /** When set, the illustration editor will consume this on load instead of fetching from the server. */
  pendingImport: FrogImportResult | null = null;

  private get sm(): ShapeManager | null {
    return ShapeManager.getInstance?.() ?? null;
  }

  constructor(
    private animationService: RasterAnimationService
  ) {}

  // ════════════════════════════════════════════════════════════
  //  EXPORT — Build a .frog zip and trigger download
  // ════════════════════════════════════════════════════════════

  async exportFrogFile(
    illustrationName: string,
    canvas: HTMLCanvasElement | null,
  ): Promise<void> {
    const sm = this.sm as any;
    if (!sm) throw new Error('ShapeManager not available');

    console.log('[FrogFile] starting export…');
    const zip = new JSZip();

    // ── 1. Gather state (reusable helper) ──
    const { state, sceneGraph } = await this.buildStatePayload(illustrationName);

    // ── 2. Scene graph as separate file (keeps manifest small) ──
    zip.file(SCENE_FILE, sceneGraph);

    // ── 3. Manifest (metadata only, no pixel data) ──
    const manifest: FrogManifest = {
      version: state.version,
      name: illustrationName || 'Untitled',
      createdAt: new Date().toISOString(),
      animation: state.animation,
      layers: state.layers,
      ditherConfig: state.ditherConfig ?? null,
    };
    zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

    // ── 4. Thumbnail ──
    try {
      const thumbBlob = await sm.captureThumbnailBlob?.(512);
      if (thumbBlob) zip.file(THUMBNAIL_FILE, thumbBlob);
    } catch (e) {
      console.warn('[FrogFile] thumbnail capture failed', e);
    }

    // ── 5. Pixel data per layer / cel ──
    const layersFolder = zip.folder(LAYERS_DIR)!;

    for (const layer of state.layers) {
      if (layer.animated && layer.cels.length > 0) {
        const layerFolder = layersFolder.folder(layer.layerId)!;
        for (const cel of layer.cels) {
          const blob = await this.getCelBlob(layer.layerId, cel.celId);
          if (blob) {
            layerFolder.file(`${cel.celId}.webp`, blob);
          }
        }
      } else {
        // Static layer — single image
        const blob = await this.getLayerBlob(layer.layerId);
        if (blob) {
          layersFolder.file(`${layer.layerId}.webp`, blob);
        }
      }
    }

    // ── 6. Generate zip and trigger download ──
    console.log('[FrogFile] compressing…');
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeName = (illustrationName || 'Untitled').replace(/[^a-zA-Z0-9_\- ]/g, '');
    this.downloadBlob(zipBlob, `${safeName}${FROG_FILE_EXTENSION}`);
    console.log('[FrogFile] export complete');
  }

  // ════════════════════════════════════════════════════════════
  //  IMPORT — Read a .frog zip and restore into the engine
  // ════════════════════════════════════════════════════════════

  /** Opens a file picker, reads the selected .frog file, and returns the parsed state + pixel data.
   *  The caller (illustration component) is responsible for applying it to the engine. */
  async importFrogFile(): Promise<FrogImportResult> {
    const file = await this.pickFile(FROG_FILE_EXTENSION);
    if (!file) throw new Error('No file selected');
    return this.parseFrogFile(file);
  }

  /** Parse an already-selected .frog File into an import result. */
  async parseFrogFile(file: File): Promise<FrogImportResult> {

    console.log('[FrogFile] reading', file.name);
    const zip = await JSZip.loadAsync(file);

    // ── 1. Read manifest ──
    const manifestStr = await zip.file(MANIFEST_FILE)?.async('string');
    if (!manifestStr) throw new Error('Invalid .frog file: missing manifest.json');
    const manifest: FrogManifest = JSON.parse(manifestStr);

    // ── 2. Read scene graph ──
    const sceneGraph = await zip.file(SCENE_FILE)?.async('string') ?? '';

    // ── 3. Read thumbnail ──
    let thumbnail: Blob | null = null;
    const thumbEntry = zip.file(THUMBNAIL_FILE);
    if (thumbEntry) {
      const thumbData = await thumbEntry.async('blob');
      thumbnail = new Blob([thumbData], { type: 'image/webp' });
    }

    // ── 4. Read pixel data ──
    const layerPixelData: Array<{
      layerId: string;
      celId?: string;
      name: string;
      imageDataUrl: string;
      blendMode: string;
      opacity: number;
      visible: boolean;
      locked: boolean;
      clipped: boolean;
      lockTransparency: boolean;
    }> = [];

    for (const layer of manifest.layers) {
      if (layer.animated && layer.cels.length > 0) {
        for (const cel of layer.cels) {
          const path = `${LAYERS_DIR}/${layer.layerId}/${cel.celId}.webp`;
          const entry = zip.file(path);
          if (entry) {
            const blob = await entry.async('blob');
            const dataUrl = await this.blobToDataUrl(new Blob([blob], { type: 'image/webp' }));
            layerPixelData.push({
              layerId: layer.layerId,
              celId: cel.celId,
              name: layer.name,
              imageDataUrl: dataUrl,
              blendMode: layer.blendMode,
              opacity: layer.opacity,
              visible: layer.visible,
              locked: layer.locked,
              clipped: layer.clipped,
              lockTransparency: layer.lockTransparency,
            });
          }
        }
      } else {
        const path = `${LAYERS_DIR}/${layer.layerId}.webp`;
        const entry = zip.file(path);
        if (entry) {
          const blob = await entry.async('blob');
          const dataUrl = await this.blobToDataUrl(new Blob([blob], { type: 'image/webp' }));
          layerPixelData.push({
            layerId: layer.layerId,
            name: layer.name,
            imageDataUrl: dataUrl,
            blendMode: layer.blendMode,
            opacity: layer.opacity,
            visible: layer.visible,
            locked: layer.locked,
            clipped: layer.clipped,
            lockTransparency: layer.lockTransparency,
          });
        }
      }
    }

    console.log(`[FrogFile] import parsed: ${manifest.layers.length} layers, ${layerPixelData.length} pixel entries`);
    return { manifest, sceneGraph, thumbnail, layerPixelData, ditherConfig: manifest.ditherConfig ?? null };
  }

  // ════════════════════════════════════════════════════════════
  //  SHARED — Build the state payload (used by export AND v2 cloud save)
  // ════════════════════════════════════════════════════════════

  async buildStatePayload(name?: string): Promise<{
    state: IllustrationStateDto;
    sceneGraph: string;
  }> {
    const sm = this.sm as any;
    const sceneGraph: string = sm?.getSceneGraphJSON?.() ?? '{}';

    const engineLayers: any[] = sm?.getRasterLayers?.() ?? [];
    const timelineLayers = await firstValueFrom(this.animationService.timelineLayers$);
    const animEnabled = await firstValueFrom(this.animationService.animationEnabled$);
    const frameCount = await firstValueFrom(this.animationService.frameCount$);
    const fps = await firstValueFrom(this.animationService.fps$);
    const loopMode = await firstValueFrom(this.animationService.loopMode$);
    const playRangeStart = await firstValueFrom(this.animationService.playRangeStart$);
    const playRangeEnd = await firstValueFrom(this.animationService.playRangeEnd$);
    const onionSkin = await firstValueFrom(this.animationService.onionSkin$);

    const layers: LayerStateDto[] = engineLayers.map((el: any, idx: number) => {
      const tlLayer = timelineLayers.find((tl: any) => tl.id === el.id);
      // Read per-layer dither config from engine (if API exists)
      let layerDither: DitherConfigDto | null = null;
      try {
        const raw = sm?.getLayerDitherConfig?.(el.id);
        if (raw && raw.enabled !== undefined) layerDither = raw as DitherConfigDto;
      } catch { /* API may not exist yet */ }
      // Read per-layer frame link animation from engine (if API exists)
      let frameLinkAnim: any = null;
      try {
        const raw = sm?.getLayerFrameLinkAnimation?.(el.id);
        if (raw && raw.enabled !== undefined) frameLinkAnim = raw;
      } catch { /* API may not exist yet */ }
      return {
        layerId: el.id,
        name: el.name ?? `Layer ${idx + 1}`,
        order: idx,
        visible: el.visible ?? true,
        locked: el.locked ?? false,
        blendMode: normalizeBlendMode(el.blendMode),
        opacity: el.opacity ?? 1.0,
        clipped: el.clipped ?? false,
        lockTransparency: el.lockTransparency ?? false,
        animated: tlLayer?.animated ?? false,
        cels: (tlLayer?.cels ?? []).map((c: CelInfo) => ({
          celId: c.id,
          frame: c.frame,
          duration: c.duration,
          isKey: c.isKey,
          celType: String(c.celType ?? (c.isKey ? 'key' : 'inbetween')),
        })),
        ditherConfig: layerDither,
        frameLinkAnimation: frameLinkAnim,
      } as LayerStateDto;
    });

    const animation: AnimationStateDto = {
      enabled: animEnabled,
      frameCount,
      fps,
      loopMode,
      playRangeStart,
      playRangeEnd,
      onionSkin: {
        enabled: onionSkin.enabled,
        framesBefore: onionSkin.framesBefore,
        framesAfter: onionSkin.framesAfter,
        opacity: onionSkin.opacity,
        tintBefore: onionSkin.tintBefore,
        tintAfter: onionSkin.tintAfter,
      }
    };

    const state: IllustrationStateDto = {
      version: 2,
      sceneGraph,
      animation,
      layers,
      savedAt: Date.now()
    };

    return { state, sceneGraph };
  }

  // ════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════

  private async getCelBlob(layerId: string, celId: string): Promise<Blob | null> {
    const sm = this.sm as any;
    try {
      if (sm?.getCelPixelDataBlob) {
        return await sm.getCelPixelDataBlob(layerId, celId, 'image/webp');
      }
      if (sm?.exportRasterLayerToBlob) {
        return await sm.exportRasterLayerToBlob(layerId, 'image/webp');
      }
    } catch (e) {
      console.warn(`[FrogFile] getCelBlob failed for ${celId}`, e);
    }
    return null;
  }

  private async getLayerBlob(layerId: string): Promise<Blob | null> {
    const sm = this.sm as any;
    try {
      if (sm?.exportRasterLayerToBlob) {
        return await sm.exportRasterLayerToBlob(layerId, 'image/webp');
      }
      console.warn(`[FrogFile] exportRasterLayerToBlob not available for ${layerId}`);
    } catch (e) {
      console.warn(`[FrogFile] getLayerBlob failed for ${layerId}`, e);
    }
    return null;
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  private pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const file = input.files?.[0] ?? null;
        document.body.removeChild(input);
        resolve(file);
      });
      input.addEventListener('cancel', () => {
        document.body.removeChild(input);
        resolve(null);
      });
      document.body.appendChild(input);
      input.click();
    });
  }
}
