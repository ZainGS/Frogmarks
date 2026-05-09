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

  /** Delete cached metadata (e.g. on illustration delete). */
  async delete(docId: string): Promise<void> {
    try {
      const dir = await this.getDir();
      await (dir as any).removeEntry(this.key(docId));
    } catch { /* not found — ignore */ }
  }
}
