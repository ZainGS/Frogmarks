import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ConfigurationService } from '../api/configuration.service';
import { NotifyService } from '../notify/notify.service';
import { Illustration } from 'app/illustrate/models/illustration.model';

// ── V2 State DTOs ──────────────────────────────────────────────

export interface OnionSkinDto {
  enabled: boolean;
  framesBefore: number;
  framesAfter: number;
  opacity: number;
  tintBefore: [number, number, number];
  tintAfter: [number, number, number];
}

export interface AnimationStateDto {
  enabled: boolean;
  frameCount: number;
  fps: number;
  loopMode: 'none' | 'loop' | 'ping-pong';
  playRangeStart: number;
  playRangeEnd: number;
  onionSkin: OnionSkinDto | null;
}

export interface CelStateDto {
  celId: string;
  frame: number;
  duration: number;
  isKey: boolean;
  celType: 'key' | 'inbetween';
  pixelDataUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface LayerStateDto {
  layerId: string;
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  blendMode: string;
  opacity: number;
  clipped: boolean;
  lockTransparency: boolean;
  animated: boolean;
  cels: CelStateDto[];
  pixelDataUrl?: string | null;
  ditherConfig?: DitherConfigDto | null;
  frameLinkAnimation?: FrameLinkAnimationDto | null;
}

export interface FrameLinkAnimationDto {
  enabled: boolean;
  type: string;
  amplitude: number;
  frequency: number;
  speed: number;
  direction: number;
  phase: number;
  loopMode: string;
  rippleCenterX: number;
  rippleCenterY: number;
  noiseOctaves: number;
  noiseLacunarity: number;
  noisePersistence: number;
  shakeSeed: number;
  displaceX: boolean;
  displaceY: boolean;
}

export interface DitherConfigDto {
  enabled: boolean;
  algorithm: string;
  colorLevels: number;
  bayerLevel: number;
  halftoneAngle: number;
  halftoneFrequency: number;
  strength: number;
  patternScale: number;
  perChannel: boolean;
  colorMode: string;
  foregroundColor: [number, number, number, number];
  backgroundColor: [number, number, number, number];
  invertPattern: boolean;
  duotoneBias: number;
  tintOpacity: number;
}

export interface IllustrationStateDto {
  version: number;
  sceneGraph: string | null;
  animation: AnimationStateDto | null;
  layers: LayerStateDto[];
  savedAt?: number;  // epoch ms — used for OPFS-vs-backend freshness comparison
  ditherConfig?: DitherConfigDto | null;
  documentSize?: { w: number; h: number } | null;
  scene3dNodesGzip?: string | null;       // legacy gzip+base64 — only present on old saves
  textureLibrary3dGzip?: string | null;   // legacy gzip+base64 — only present on old saves
  meshIds?: string[] | null;             // per-mesh blob IDs (v3+)
  meshSasUrls?: Record<string, string> | null;  // load response only — read SAS URLs per mesh
  texLibSasUrl?: string | null;           // load response only — read SAS URL for texture library
  bgColor?: string | null;
  dotColor?: string | null;
  paperGrain?: { type: string; scale: number; strength: number } | null;
  scene3dGlobalSettings?: {
    // Camera
    cameraMode?: string;
    illustrationProjection?: string;
    fov?: number;
    // Shadows
    shadowsEnabled?: boolean;
    shadowMapSize?: number;
    shadowExtent?: number;
    shadowBias?: number;
    // Lighting
    lightDirX?: number; lightDirY?: number; lightDirZ?: number; lightIntensity?: number;
    ambientR?: number; ambientG?: number; ambientB?: number; ambientIntensity?: number;
    // PS1 renderer
    ps1Jitter?: number; ps1Snap?: number; ps1Affine?: number; ps1ColorDepth?: number;
    // Frustum / animation player
    frustumCulling?: boolean;
    animSyncWithTimeline?: boolean;
    animStartFrame?: number;
    animEndFrame?: number;
    animFps?: number;
    animLoop?: boolean;
  } | null;
}

export interface CelStatusItem {
  exists: boolean;
  hash: string | null;
}

export interface IllustrationPublishViewDto {
  bundleUrl: string;
  name: string;
  publishedAt: string | null;
  publishedVersion: number;
}

export interface StorageQuotaDto {
  usedBytes: number;
  quotaBytes: number;
  isPro: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class IllustrationService extends ApiService {

  private readonly base = `${this.apiUrl}/api/illustration`;

  constructor(
    http: HttpClient,
    configService: ConfigurationService,
    router: Router,
    notify: NotifyService
  ) {
    super(http, configService, router, notify);
  }

  // ---- Illustrations CRUD ----

  createIllustration(newIllustration: Illustration): Observable<Illustration> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<Illustration>(`${this.base}`, JSON.stringify(newIllustration), {
      headers,
      withCredentials: true
    });
  }

  getIllustrationById(id: number): Observable<Illustration> {
    return this.http.get<Illustration>(`${this.base}/${id}`, { withCredentials: true });
  }

  getIllustrationByUid(uid: string): Observable<Illustration> {
    return this.http.get<Illustration>(`${this.base}/GetIllustrationByUid/${uid}`, { withCredentials: true });
  }

  getAllIllustrations(): Observable<Illustration[]> {
    return this.http.get<Illustration[]>(`${this.base}`, { withCredentials: true });
  }

  searchIllustrations(
    filterQuery: string = '',
    sortBy: string = 'name',
    sortDirection: string = 'desc',
    pageIndex: number = 0,
    pageSize: number = 24
  ): Observable<any> {
    const params = new HttpParams()
      .set('filterQuery', filterQuery)
      .set('sortBy', sortBy)
      .set('sortDirection', sortDirection)
      .set('pageIndex', pageIndex.toString())
      .set('pageSize', pageSize.toString());

    const cachedThumbnailIllustrationIds = new Set(
      localStorage.getItem('cachedThumbnailIllustrationIds')?.split(',') || []
    );

    return this.http.get<any>(
      `${this.base}/search?cachedThumbnailIllustrationIds=${Array.from(cachedThumbnailIllustrationIds).join(',')}`,
      { params, withCredentials: true }
    );
  }

  getIllustrationsByTeamId(
    id: number,
    name: string = '',
    favorites: boolean = false,
    isArchived: boolean = false,
    sortBy: string = 'name',
    sortDirection: string = 'desc',
    pageIndex: number = 0,
    pageSize: number = 24
  ): Observable<Illustration[]> {

    const params = new HttpParams()
      .set('teamId', id.toString())
      .set('name', name)
      .set('favorites', favorites)
      .set('isArchived', isArchived)
      .set('sortBy', sortBy)
      .set('sortDirection', sortDirection)
      .set('pageIndex', pageIndex.toString())
      .set('pageSize', pageSize.toString());

    // Load cached thumbnails (Illustration Id => { url, timestamp })
    const cachedThumbnails = JSON.parse(localStorage.getItem('cachedIllustrationThumbnails') || '{}');

    // Filter out expired thumbnails
    const now = Date.now();
    const expirationTime = 0.083 * 60 * 60 * 1000; // ~5 minutes
    const validThumbnails = Object.keys(cachedThumbnails).reduce((acc, illustrationId) => {
      const { url, timestamp } = cachedThumbnails[illustrationId] || {};
      if (url && timestamp && now - timestamp <= expirationTime) {
        acc[illustrationId] = { url, timestamp };
      }
      return acc;
    }, {} as Record<string, { url: string; timestamp: number }>);

    // Extract valid Illustration IDs
    const cachedThumbnailIllustrationIds = Object.keys(validThumbnails);

    return this.http
      .get<any>(`${this.base}/search?cachedThumbnailIllustrationIds=${cachedThumbnailIllustrationIds.join(',')}`, {
        params,
        withCredentials: true
      })
      .pipe(
        tap((res: any) => {
          // Merge new thumbnails into cache if needed
          const updatedCache = { ...validThumbnails };
          ((res.resultObject ?? []) as Illustration[]).forEach((illustration: Illustration) => {
            if ((illustration as any).thumbnailUrl && !updatedCache[(illustration as any).id]) {
              updatedCache[(illustration as any).id] = {
                url: (illustration as any).thumbnailUrl,
                timestamp: Date.now()
              };
            }
            (illustration as any).thumbnailUrl = updatedCache[(illustration as any).id]?.url;
          });
          // Save updated cache
          localStorage.setItem('cachedIllustrationThumbnails', JSON.stringify(updatedCache));
        })
      );
  }

  // Project filter (kept parity with previous helper)
  getIllustrationsByProjectId(id: number): Observable<Illustration[]> {
    return this.get<Illustration[]>(`illustration?projectid=${id}`);
  }

  updateIllustration(updatedIllustration: Illustration): Observable<Illustration> {
    return this.http.put<Illustration>(`${this.base}`, updatedIllustration, { withCredentials: true });
  }

  favoriteIllustration(favoritedIllustration: Illustration): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.put(`${this.base}/favorite`, favoritedIllustration, { headers, withCredentials: true });
  }

  deleteIllustration(id: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`, { withCredentials: true });
  }

  // ---- Persistence (scene graph) ----

  /** @deprecated Use saveState() for v2 saves */
  saveIllustration(id: number, sceneGraph: string): Observable<any> {
    const request = {
      illustrationId: id,
      sceneGraphData: sceneGraph // already a string
    };
    return this.http.post(`${this.base}/save`, request, { withCredentials: true });
  }

  /** @deprecated Use loadState() for v2 loads */
  loadIllustrationSceneGraph(id: number): Observable<string> {
    return this.http.get<string>(`${this.base}/load/${id}`, { withCredentials: true });
  }

  // ---- V2 State Save/Load ----

  saveState(id: number, state: IllustrationStateDto): Observable<any> {
    return this.http.put<any>(`${this.base}/${id}/state`, state, { withCredentials: true });
  }

  loadState(id: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${id}/state`, { withCredentials: true });
  }

  getStateSavedAt(id: number): Observable<{ savedAt: number }> {
    return this.http.get<{ savedAt: number }>(`${this.base}/${id}/state/savedAt`, { withCredentials: true });
  }

  uploadCelPixelData(illustrationId: number, celId: string, blob: Blob, width?: number, height?: number, format: string = 'webp'): Observable<any> {
    const formData = new FormData();
    formData.append('pixelData', blob, `${celId}.${format}`);
    let url = `${this.base}/${illustrationId}/cel/${celId}?format=${format}`;
    if (width != null) url += `&width=${width}`;
    if (height != null) url += `&height=${height}`;
    return this.http.put<any>(url, formData, { withCredentials: true });
  }

  uploadLayerPixelData(illustrationId: number, layerId: string, blob: Blob, width?: number, height?: number, format: string = 'webp'): Observable<any> {
    const formData = new FormData();
    formData.append('pixelData', blob, `${layerId}.${format}`);
    let url = `${this.base}/${illustrationId}/layer/${layerId}?format=${format}`;
    if (width != null) url += `&width=${width}`;
    if (height != null) url += `&height=${height}`;
    return this.http.put<any>(url, formData, { withCredentials: true });
  }

  uploadMeshBlob(illustrationId: number, meshId: string, blob: Blob): Observable<any> {
    const formData = new FormData();
    formData.append('meshData', blob, `${meshId}.gz`);
    return this.http.put<any>(`${this.base}/${illustrationId}/mesh/${meshId}`, formData, { withCredentials: true });
  }

  uploadTextureLibraryBlob(illustrationId: number, blob: Blob): Observable<any> {
    const formData = new FormData();
    formData.append('texLibData', blob, 'texture-library.gz');
    return this.http.put<any>(`${this.base}/${illustrationId}/texture-library`, formData, { withCredentials: true });
  }

  getMeshReadUrls(illustrationId: number, meshIds: string[]): Observable<any> {
    return this.http.get<any>(`${this.base}/${illustrationId}/mesh-read-urls?meshIds=${meshIds.join(',')}`, { withCredentials: true });
  }

  deleteCel(illustrationId: number, celId: string): Observable<any> {
    return this.http.delete<any>(`${this.base}/${illustrationId}/cel/${celId}`, { withCredentials: true });
  }

  getCelStatus(illustrationId: number, celIds: string[]): Observable<any> {
    return this.http.post<any>(`${this.base}/${illustrationId}/cel-status`, { celIds }, { withCredentials: true });
  }

  // ---- Thumbnails ----

  // Centralized helper to cache a thumbnail with an expiration timestamp
  cacheThumbnail(url: string, key: string): void {
    const cacheData = { url, timestamp: Date.now() };
    const cachedThumbnails = JSON.parse(localStorage.getItem('cachedIllustrationThumbnails') || '{}');
    cachedThumbnails[key] = cacheData;
    localStorage.setItem('cachedIllustrationThumbnails', JSON.stringify(cachedThumbnails));
  }

  uploadThumbnail(illustrationUid: string, blob: Blob, isCustom: boolean | null = null): Observable<void> {
    const formData = new FormData();
    formData.append('thumbnail', blob, `${illustrationUid}.png`);

    let url = `${this.base}/thumbnails/${illustrationUid}`;
    if (isCustom !== null) {
      url += `?isCustom=${isCustom}`;
    }

    return this.http.post<void>(url, formData, { withCredentials: true });
  }

  getThumbnail(illustrationUid: string): Observable<Blob> {
    // If your backend serves these under a different path, adjust here:
    return this.http.get(`${this.apiUrl}/thumbnails/${illustrationUid}`, { responseType: 'blob' as const });
  }

  setIsCustomThumbnail(illustrationId: number, isCustom: boolean): Observable<any> {
    return this.http.patch(
      `${this.base}/${illustrationId}`,
      { isCustomThumbnail: isCustom },
      { withCredentials: true }
    );
  }

  // ---- Utilities ----

  duplicateIllustration(
    sourceIllustrationId: number,
    payload: {
      name?: string;
      teamId?: number;
      copyThumbnail?: boolean;
    } = {}
  ): Observable<Illustration> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<Illustration>(
      `${this.base}/duplicate/${sourceIllustrationId}`,
      JSON.stringify(payload),
      { headers, withCredentials: true }
    );
  }

  renameIllustration(illustrationId: number, newName: string): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.put(
      `${this.base}/rename/${illustrationId}`,
      { newName },
      { headers, withCredentials: true }
    );
  }

  // ---- Templates (stub preserved for parity; flesh out whenever ready) ----
  getTemplates(): Observable<void> {
    return undefined as unknown as Observable<void>;
  }

  // ---- Publishing ----

  publishIllustration(illustrationId: number, bundle: Blob, publishedTitle?: string): Observable<Illustration> {
    const formData = new FormData();
    formData.append('bundle', bundle, 'project.frogmarks');
    if (publishedTitle) formData.append('publishedTitle', publishedTitle);
    return this.http.post<Illustration>(`${this.base}/${illustrationId}/publish`, formData, { withCredentials: true });
  }

  unpublishIllustration(illustrationId: number): Observable<any> {
    return this.http.post(`${this.base}/${illustrationId}/unpublish`, {}, { withCredentials: true });
  }

  getPublicView(uid: string): Observable<IllustrationPublishViewDto> {
    return this.http.get<IllustrationPublishViewDto>(`${this.base}/view/${uid}`);
  }

  getStorageQuota(): Observable<{ resultObject: StorageQuotaDto }> {
    return this.http.get<{ resultObject: StorageQuotaDto }>(`${this.base}/quota`, { withCredentials: true });
  }
}
