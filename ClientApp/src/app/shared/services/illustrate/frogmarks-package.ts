import type { IllustrationStateDto } from './illustration.service';

/**
 * The .frogmarks project file, as Frogmarks writes and reads it (one place for the editor's File › Save / Open
 * .frogmarks, the Export modal and the Shell's Settings › Import .frogmarks…).
 *
 * A .frogmarks file is a ZIP: Salsa's project package (ShapeManager.packProject — salsa
 * src/services/persistence/project-package.ts: manifest.json { formatVersion, document }, scene.json, scene3d.json,
 * layers/*.bin, cels/*.bin, models3d/*.glb, meshTextures/*.png, bakedParts/*.glb, textures3d.json, …) plus two
 * Frogmarks entries added on top:
 *   frogmarks-state.json — FrogmarksStateFile below (name, ids, and the editor-owned settings Salsa does not store)
 *   thumbnail.png        — a small preview
 * Only the engine can unpack the package (ShapeManager.unpackProject), and only an open editor can: the editor starts
 * every document from a blank engine document and owns the panels / autosave that follow a restore. So the Shell only
 * reads the two small JSON entries here (validate + name), and hands the file to the editor (pending-project-import.ts).
 */

export const FROGMARKS_STATE_FILE = 'frogmarks-state.json';
export const FROGMARKS_THUMBNAIL_FILE = 'thumbnail.png';
/** frogmarks-state.json format. v1 + the optional `editorState` (2026-10-08) is still v1: older builds ignore it. */
export const FROGMARKS_STATE_VERSION = 1;
/** The newest Salsa package format this build reads (salsa project-package.ts PACKAGE_FORMAT_VERSION — not exported
 *  by the dist, keep in step). Salsa refuses a newer one itself; this only lets the Shell say so before it creates a
 *  document. */
export const SALSA_PACKAGE_VERSION = 2;

/** Editor-owned document settings (the local metadata save minus the scene graph, which the package already holds). */
export type FrogmarksEditorState = Omit<IllustrationStateDto, 'sceneGraph'> & { sceneGraph?: null };

export interface FrogmarksStateFile {
  formatVersion: number;
  packedAt: string;
  name: string;
  uuid: string | null;
  illustrationId: number | null;
  teamId: number | null;
  deviceName: string | null;
  /** Absent on files saved before 2026-10-08 (those restore what the engine holds only). */
  editorState?: FrogmarksEditorState | null;
}

/** What a picked file turned out to be. 'frog' = the older 2D .frog workfile (FrogFileService). */
export interface FrogmarksPackageInfo {
  kind: 'frogmarks' | 'frog';
  /** The project's name (from the file; not made unique yet). */
  name: string;
  /** frogmarks-state.json (null when the package has none, or for a .frog). */
  state: FrogmarksStateFile | null;
  /** The Salsa package format version (0 for a .frog). */
  packageVersion: number;
  /** Width / height of the bounded document, when the file says. */
  documentAspect?: number;
  /** thumbnail.png, only when asked for. */
  thumbnail: Blob | null;
}

/** A file that can't be imported, with the message to show the user. */
export class FrogmarksPackageError extends Error {
  constructor(readonly reason: 'not-a-project' | 'newer', message: string) {
    super(message);
    this.name = 'FrogmarksPackageError';
  }
}

export const NOT_A_PROJECT_MESSAGE = "That file isn't a Frogmarks project.";
export const NEWER_VERSION_MESSAGE = 'This project was saved by a newer version of Frogmarks. Update Frogmarks to open it.';

type ZipLike = { file(name: string): { async(type: 'string' | 'blob'): Promise<any> } | null };

/**
 * Read and validate a .frogmarks (or legacy .frog) file without unpacking it: only the small JSON entries (and the
 * thumbnail when asked) are inflated. Throws FrogmarksPackageError for a file that is not a project or is newer than
 * this build.
 */
export async function readFrogmarksPackage(file: Blob & { name?: string }, opts: { thumbnail?: boolean } = {}): Promise<FrogmarksPackageInfo> {
  let zip: ZipLike;
  try {
    const { default: JSZip } = await import('jszip');
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new FrogmarksPackageError('not-a-project', NOT_A_PROJECT_MESSAGE);
  }
  const json = async (name: string): Promise<any> => {
    const text = await zip.file(name)?.async('string');
    if (text == null) return null;
    try { return JSON.parse(text); } catch { throw new FrogmarksPackageError('not-a-project', NOT_A_PROJECT_MESSAGE); }
  };
  const manifest = await json('manifest.json');
  if (!manifest || typeof manifest !== 'object') throw new FrogmarksPackageError('not-a-project', NOT_A_PROJECT_MESSAGE);
  const fileBase = baseNameOf(file.name);

  // Legacy .frog: { version, name, layers[] } at the top (no Salsa `document`).
  if (!manifest.document && Array.isArray(manifest.layers)) {
    return {
      kind: 'frog', name: cleanName(manifest.name) ?? fileBase, state: null, packageVersion: 0,
      documentAspect: aspectOf(manifest.documentSize), thumbnail: null,
    };
  }

  const doc = manifest.document;
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.layers)) throw new FrogmarksPackageError('not-a-project', NOT_A_PROJECT_MESSAGE);
  const packageVersion = typeof manifest.formatVersion === 'number' ? manifest.formatVersion : 1;
  if (packageVersion > SALSA_PACKAGE_VERSION) throw new FrogmarksPackageError('newer', NEWER_VERSION_MESSAGE);

  const state = await json(FROGMARKS_STATE_FILE) as FrogmarksStateFile | null;
  if (state && typeof state.formatVersion === 'number' && state.formatVersion > FROGMARKS_STATE_VERSION) {
    throw new FrogmarksPackageError('newer', NEWER_VERSION_MESSAGE);
  }
  const thumbnail = opts.thumbnail ? ((await zip.file(FROGMARKS_THUMBNAIL_FILE)?.async('blob')) ?? null) : null;
  const engineName = cleanName(doc.name);
  return {
    kind: 'frogmarks',
    name: cleanName(state?.name) ?? (engineName && engineName !== 'Untitled' ? engineName : null) ?? fileBase,
    state: state && typeof state === 'object' ? state : null,
    packageVersion,
    documentAspect: aspectOf(doc.documentSize),
    thumbnail,
  };
}

/** frogmarks-state.json for a save. `editorState` drops its scene graph (the package holds it). */
export function buildFrogmarksStateFile(p: {
  name: string; uuid: string | null; illustrationId?: number | null; teamId?: number | null; deviceName?: string | null;
  editorState?: IllustrationStateDto | null; now?: Date;
}): FrogmarksStateFile {
  const editorState = p.editorState ? { ...p.editorState, sceneGraph: null } : null;
  return {
    formatVersion: FROGMARKS_STATE_VERSION,
    packedAt: (p.now ?? new Date()).toISOString(),
    name: p.name,
    uuid: p.uuid,
    illustrationId: p.illustrationId ?? null,
    teamId: p.teamId ?? null,
    deviceName: p.deviceName ?? null,
    ...(editorState ? { editorState } : {}),
  };
}

/** `name`, or `name (2)`, `name (3)` … — the first one no existing project has (case-insensitive). */
export function uniqueProjectName(name: string, existing: Iterable<string>): string {
  const taken = new Set([...existing].map(n => (n ?? '').trim().toLowerCase()));
  const base = (name ?? '').trim() || 'Untitled';
  if (!taken.has(base.toLowerCase())) return base;
  const root = base.replace(/\s\(\d+\)$/, '');
  for (let i = 2; ; i++) {
    const candidate = `${root} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** The file name without folder or extension ('Frog.frogmarks' → 'Frog'). */
function baseNameOf(fileName: string | undefined): string {
  const leaf = (fileName ?? '').split(/[\\/]/).pop() ?? '';
  return cleanName(leaf.replace(/\.(frogmarks|frog|zip)$/i, '').replace(/_/g, ' ')) ?? 'Imported project';
}

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, 200) : null;
}

function aspectOf(size: unknown): number | undefined {
  const s = size as { w?: number; h?: number } | null | undefined;
  return s && typeof s.w === 'number' && typeof s.h === 'number' && s.w > 0 && s.h > 0 ? s.w / s.h : undefined;
}
