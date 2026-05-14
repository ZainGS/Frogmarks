import { Injectable } from '@angular/core';
import { ProfileService } from '../auth/profile.service';
import { OpfsMetadataService } from './opfs-metadata.service';

export type LocalSyncStatus =
  | 'local-only'           // never uploaded — no cloud record
  | 'syncing'              // upload in progress
  | 'cloud-record-created' // cloud DB record exists, binary pack not yet uploaded
  | 'cloud-metadata-only'  // backfilled from cloud — metadata only, no local OPFS pack
  | 'synced'               // cloud record + full binary pack uploaded
  | 'sync-paused'          // had cloud record but session expired / auth lost
  | 'sync-error'           // last upload attempt failed
  | 'conflict';            // OPFS and cloud both have changes since last sync

export interface LocalIllustration {
  uuid: string;
  name: string;
  syncMode: 2;
  createdAt: number;    // epoch ms
  updatedAt: number;    // epoch ms
  documentAspect?: number;
  isFavorite?: boolean;
  isArchived?: boolean;
  thumbnailDataUrl?: string;
  type: 'illustration';

  // v2 fields — stamped on create, back-filled during migration for existing records
  syncStatus: LocalSyncStatus;
  localLibraryId: string;
  cloudOwnerUserId?: string;
  cloudIllustrationId?: number;
  lastSyncedAt?: number; // epoch ms

  // Cloud thumbnail URL (set during backfill; local thumbnailDataUrl takes precedence)
  thumbnailUrl?: string;
}

const DB_NAME = 'frogmarks-local';
const DB_VERSION = 2;
const STORE = 'illustrations';

@Injectable({ providedIn: 'root' })
export class LocalIllustrationService {
  private _db: IDBDatabase | null = null;

  constructor(private _profileService: ProfileService, private _opfsMeta: OpfsMetadataService) {}

  private async _open(): Promise<IDBDatabase> {
    if (this._db) return this._db;
    const libraryId = this._profileService.getLocalLibraryId();
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = (e.target as IDBOpenDBRequest).transaction!;
        const oldVersion = e.oldVersion;

        if (oldVersion === 0) {
          // Fresh install — create store with all current indexes
          const store = db.createObjectStore(STORE, { keyPath: 'uuid' });
          store.createIndex('updatedAt', 'updatedAt');
          store.createIndex('name', 'name');
          store.createIndex('syncStatus', 'syncStatus', { unique: false });
          store.createIndex('cloudOwnerUserId', 'cloudOwnerUserId', { unique: false });
        } else if (oldVersion < 2) {
          // v1 → v2: add sync-status indexes and back-fill existing records
          const store = tx.objectStore(STORE);
          store.createIndex('syncStatus', 'syncStatus', { unique: false });
          store.createIndex('cloudOwnerUserId', 'cloudOwnerUserId', { unique: false });
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = (ce) => {
            const cursor = (ce.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              const record = cursor.value;
              if (!record.syncStatus) record.syncStatus = 'local-only';
              if (!record.localLibraryId) record.localLibraryId = libraryId;
              cursor.update(record);
              cursor.continue();
            }
          };
        }
      };
      req.onsuccess = (e) => {
        this._db = (e.target as IDBOpenDBRequest).result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  private _tx(mode: IDBTransactionMode): Promise<[IDBObjectStore, IDBTransaction]> {
    return this._open().then(db => {
      const tx = db.transaction(STORE, mode);
      return [tx.objectStore(STORE), tx];
    });
  }

  async create(name: string, documentAspect?: number): Promise<LocalIllustration> {
    const record: LocalIllustration = {
      uuid: crypto.randomUUID(),
      name,
      syncMode: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      documentAspect,
      isFavorite: false,
      isArchived: false,
      type: 'illustration',
      syncStatus: 'local-only',
      localLibraryId: this._profileService.getLocalLibraryId(),
    };
    const [store] = await this._tx('readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return record;
  }

  async getByUuid(uuid: string): Promise<LocalIllustration | null> {
    const [store] = await this._tx('readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(uuid);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(includeArchived = false): Promise<LocalIllustration[]> {
    const [store] = await this._tx('readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        let items: LocalIllustration[] = req.result ?? [];
        if (!includeArchived) items = items.filter(i => !i.isArchived);
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async update(partial: Partial<LocalIllustration> & { uuid: string }): Promise<LocalIllustration> {
    const existing = await this.getByUuid(partial.uuid);
    if (!existing) throw new Error(`Local illustration ${partial.uuid} not found`);
    const updated: LocalIllustration = { ...existing, ...partial, updatedAt: Date.now() };
    const [store] = await this._tx('readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = store.put(updated);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return updated;
  }

  async updateSyncStatus(
    uuid: string,
    status: LocalSyncStatus,
    cloudIllustrationId?: number,
    cloudOwnerUserId?: string
  ): Promise<void> {
    const patch: Partial<LocalIllustration> & { uuid: string } = { uuid, syncStatus: status };
    if (cloudIllustrationId !== undefined) patch.cloudIllustrationId = cloudIllustrationId;
    if (cloudOwnerUserId !== undefined) patch.cloudOwnerUserId = cloudOwnerUserId;
    if (status === 'synced') patch.lastSyncedAt = Date.now();
    await this.update(patch);
  }

  async rename(uuid: string, name: string): Promise<void> {
    await this.update({ uuid, name });
  }

  async updateThumbnail(uuid: string, dataUrl: string): Promise<void> {
    await this.update({ uuid, thumbnailDataUrl: dataUrl });
  }

  async delete(uuid: string): Promise<void> {
    // 1. IndexedDB metadata
    const [store] = await this._tx('readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(uuid);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // 2. OPFS state JSON (frogmarks/ill-local-{uuid}-meta.json)
    await this._opfsMeta.delete('local-' + uuid);

    // 3. Salsa raster pixel data (salsa-documents/local-{uuid}/)
    try {
      const root = await navigator.storage.getDirectory();
      const salsaDir = await root.getDirectoryHandle('salsa-documents');
      await (salsaDir as any).removeEntry('local-' + uuid, { recursive: true });
    } catch { /* not found — ignore */ }
  }

  async archive(uuid: string, isArchived: boolean): Promise<void> {
    await this.update({ uuid, isArchived });
  }

  async favorite(uuid: string, isFavorite: boolean): Promise<void> {
    await this.update({ uuid, isFavorite });
  }

  /** Creates a metadata-only local record from a cloud illustration (backfill). */
  async createFromCloudMetadata(record: LocalIllustration): Promise<LocalIllustration> {
    const [store] = await this._tx('readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return record;
  }

  /** Returns local records that have a given cloudIllustrationId. */
  async getByCloudId(cloudId: number): Promise<LocalIllustration | null> {
    const all = await this.getAll(true);
    return all.find(i => i.cloudIllustrationId === cloudId) ?? null;
  }
}
