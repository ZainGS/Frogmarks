/**
 * Copy one of Salsa's saved documents (OPFS `salsa-documents/<docId>/`) to a new document id — the engine half of
 * "Duplicate Illustration". The copy is the document exactly as last SAVED (layers + cels, scene graph, 3D scene, GLB
 * models, painted textures, baked parts, texture library, ephemera, GARP, UI layers); the caller saves the open
 * document first. Its manifest is rewritten (docId, name, savedAt) LAST, the way Salsa itself commits a save, so an
 * interrupted copy has no manifest and simply loads as a new, empty document.
 *
 * The source is read under Salsa's per-document Web Lock (`salsa-doc:<docId>`, see salsa document-persistence.ts
 * withDocLock), so a save of the original can't interleave with the copy.
 */

const SALSA_ROOT = 'salsa-documents';
const MANIFEST = 'manifest.json';

/** OPFS directory handle with the async iterator Chrome ships (missing from older lib.dom typings). */
type IterableDir = FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };

async function copyDir(src: FileSystemDirectoryHandle, dst: FileSystemDirectoryHandle, skip: Set<string>): Promise<void> {
  for await (const [name, handle] of (src as IterableDir).entries()) {
    if (skip.has(name)) continue;
    if (handle.kind === 'directory') {
      await copyDir(handle as FileSystemDirectoryHandle, await dst.getDirectoryHandle(name, { create: true }), new Set());
    } else {
      const file = await (handle as FileSystemFileHandle).getFile();
      const out = await (await dst.getFileHandle(name, { create: true })).createWritable();
      await out.write(await file.arrayBuffer());
      await out.close();
    }
  }
}

async function withSharedDocLock<T>(docId: string, fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks?.request) return fn();
  return locks.request(`salsa-doc:${docId}`, { mode: 'shared' }, () => fn()) as Promise<T>;
}

/**
 * Copy `salsa-documents/<srcDocId>` to `salsa-documents/<dstDocId>` under the new name. Returns false (and leaves no
 * manifest at the destination) when the source has never been saved or the copy failed.
 */
export async function copySalsaDocument(srcDocId: string, dstDocId: string, name: string): Promise<boolean> {
  if (!srcDocId || !dstDocId || srcDocId === dstDocId) return false;
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return false;
  try {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(SALSA_ROOT, { create: true });
    return await withSharedDocLock(srcDocId, async () => {
      let src: FileSystemDirectoryHandle;
      try { src = await root.getDirectoryHandle(srcDocId); } catch { return false; }   // never saved
      let manifest: Record<string, unknown>;
      try { manifest = JSON.parse(await (await (await src.getFileHandle(MANIFEST)).getFile()).text()); } catch { return false; }
      // A leftover directory under the new id (none expected — the id is new) must not mix into the copy.
      try { await root.removeEntry(dstDocId, { recursive: true }); } catch { /* not there */ }
      const dst = await root.getDirectoryHandle(dstDocId, { create: true });
      await copyDir(src, dst, new Set([MANIFEST]));
      manifest = { ...manifest, docId: dstDocId, name, savedAt: new Date().toISOString() };
      const out = await (await dst.getFileHandle(MANIFEST, { create: true })).createWritable();
      await out.write(JSON.stringify(manifest));
      await out.close();
      return true;
    });
  } catch (e) {
    console.warn('[duplicate] copying the saved document failed', e);
    try {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(SALSA_ROOT);
      await root.removeEntry(dstDocId, { recursive: true });
    } catch { /* nothing to clean up */ }
    return false;
  }
}

/** The editor's OPFS metadata store (OpfsMetadataService) — just what a copy needs. */
export interface DocumentMetaStore {
  read(docKey: string): Promise<object | null>;
  write(docKey: string, meta: any): Promise<boolean>;
}

/**
 * Copy a whole saved document `srcKey` → `dstKey`: Salsa's document (every layer, the scene graph, the 3D scene,
 * textures …, see copySalsaDocument) AND the editor's OPFS metadata (settings, dither, 3D host state). The copy's
 * metadata drops the original's server revision (the copy is a different server record) and is marked not yet synced.
 * False when this device has no saved copy of the source (nothing was copied).
 */
export async function copySavedDocument(meta: DocumentMetaStore, srcKey: string, dstKey: string, name: string): Promise<boolean> {
  if (!srcKey || !dstKey || srcKey.endsWith('-')) return false;
  if (!await copySalsaDocument(srcKey, dstKey, name)) return false;
  const src = await meta.read(srcKey);
  if (src) {
    const copy = { ...src } as Record<string, unknown>;
    delete copy['revision'];
    delete copy['baseRevision'];
    copy['backendSynced'] = false;
    if (!await meta.write(dstKey, copy)) return false;
  }
  return true;
}
