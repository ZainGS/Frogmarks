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

  /** Per-document write chain: writes to one file run one at a time, in call order (a quick flush and a full save used
   *  to write the same file concurrently). */
  private _chains = new Map<string, Promise<unknown>>();
  /** Highest snapshot sequence written per document — an older snapshot that finishes building late is dropped. */
  private _lastSeq = new Map<string, number>();

  /**
   * Write metadata to OPFS. Strip transient SAS pixel URLs — only metadata is cached. (The scene graph is the caller's
   * choice: the editor leaves it out when the engine saves its own document on every change — perf audit B6.)
   * @param seq  Optional snapshot sequence, taken BEFORE the state was built; a write older than one already written
   *             for this document is skipped (counts as success).
   * @returns true when the file was written (or skipped as stale), false on failure.
   */
  write(docId: string, state: IllustrationStateDto, seq?: number): Promise<boolean> {
    const prev = this._chains.get(docId) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(() => this._write(docId, state, seq));
    this._chains.set(docId, next);
    void next.finally(() => { if (this._chains.get(docId) === next) this._chains.delete(docId); });
    return next;
  }

  private async _write(docId: string, state: IllustrationStateDto, seq?: number): Promise<boolean> {
    if (seq !== undefined) {
      if (seq < (this._lastSeq.get(docId) ?? -1)) return true;   // a newer snapshot is already on disk
      this._lastSeq.set(docId, seq);
    }
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
      return true;
    } catch (e) {
      console.warn('[OpfsMeta] write failed', e);
      return false;
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
