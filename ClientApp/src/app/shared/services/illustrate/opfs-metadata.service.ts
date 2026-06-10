import { Injectable } from '@angular/core';
import { IllustrationStateDto } from './illustration.service';

const FROGMARKS_DIR = 'frogmarks';

@Injectable({ providedIn: 'root' })
export class OpfsMetadataService {

  private async getDir(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(FROGMARKS_DIR, { create: true });
  }

  private key(docId: string): string {
    return `ill-${docId}-meta.json`;
  }

  /** Write metadata to OPFS. Strip transient SAS pixel URLs — only metadata is cached. */
  async write(docId: string, state: IllustrationStateDto): Promise<void> {
    try {
      const toStore: IllustrationStateDto = {
        ...state,
        layers: state.layers.map(l => ({
          ...l,
          pixelDataUrl: null,
          cels: l.cels.map(c => ({ ...c, pixelDataUrl: null })),
        })),
      };
      const dir = await this.getDir();
      const fh = await dir.getFileHandle(this.key(docId), { create: true });
      const writable = await (fh as any).createWritable();
      await writable.write(JSON.stringify(toStore));
      await writable.close();
    } catch (e) {
      console.warn('[OpfsMeta] write failed', e);
    }
  }

  /** Read cached metadata from OPFS. Returns null if not found or parse fails. */
  async read(docId: string): Promise<IllustrationStateDto | null> {
    try {
      const dir = await this.getDir();
      const fh = await dir.getFileHandle(this.key(docId));
      const file = await (fh as any).getFile();
      const text = await file.text();
      return JSON.parse(text) as IllustrationStateDto;
    } catch {
      return null;
    }
  }

  /** Walk a directory recursively and return the total byte count of all files inside. */
  private async _dirSize(dir: FileSystemDirectoryHandle): Promise<number> {
    let total = 0;
    for await (const [, handle] of (dir as any).entries()) {
      if (handle.kind === 'file') {
        const f = await (handle as FileSystemFileHandle).getFile();
        total += f.size;
      } else if (handle.kind === 'directory') {
        total += await this._dirSize(handle as FileSystemDirectoryHandle);
      }
    }
    return total;
  }

  /**
   * Return the total bytes Salsa has written for a scene to OPFS.
   * @param salsaKey  The subdirectory name inside `salsa-documents/`
   *                  ('local-{uuid}' for local-only, `illustration.id` for no-cloud/cloud).
   */
  async getSceneSizeBytes(salsaKey: string): Promise<number> {
    try {
      const root = await navigator.storage.getDirectory();
      const salsaDir = await root.getDirectoryHandle('salsa-documents');
      const projDir  = await salsaDir.getDirectoryHandle(salsaKey);
      return await this._dirSize(projDir);
    } catch {
      return 0;
    }
  }

  /** Delete cached metadata (e.g. on illustration delete). */
  async delete(docId: string): Promise<void> {
    try {
      const dir = await this.getDir();
      await (dir as any).removeEntry(this.key(docId));
    } catch { /* not found — ignore */ }
  }
}
