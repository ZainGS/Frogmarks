import { FROGMARKS_STATE_FILE } from '../../services/illustrate/frogmarks-package';

/**
 * The Shell's Import tile takes .frogmarks projects and .frogcart carts through one picker (Salsa
 * ShellUIManager.setImportHandler). Each picked file is told apart by its CONTENT, the extension only deciding a zip
 * that says neither:
 *
 *   .frogcart  — a ZIP with manifest.json + scene.salsa (the project package inside it; salsa frogcart.ts packFrogcart)
 *   .frogmarks — a ZIP whose manifest.json has the Salsa `document` (+ frogmarks-state.json; frogmarks-package.ts)
 *   .frog      — the older 2D workfile: a ZIP whose manifest.json has `layers` at the top
 *
 * A project opens as a new local illustration (shell-project-import.ts); a cart goes back to the Shell, which installs
 * it as a new cart tile. Anything else is reported and creates nothing.
 */
export type ShellImportKind = 'project' | 'cart' | 'unknown';

export const NOT_IMPORTABLE_MESSAGE = "That file isn't a Frogmarks project or FrogCart.";
export const ONE_PROJECT_MESSAGE = 'Only one project can be imported at a time.';

type ZipLike = { file(name: string): { async(type: 'string'): Promise<string> } | null };

/** What a picked file is, read from its zip entries (only manifest.json is inflated). */
export async function detectShellImportKind(file: Blob & { name?: string }): Promise<ShellImportKind> {
  let zip: ZipLike;
  try {
    const { default: JSZip } = await import('jszip');
    zip = await JSZip.loadAsync(file);
  } catch {
    return 'unknown';   // not a zip: whatever its name says, there is nothing to import
  }
  let manifest: any = null;
  try {
    const text = await zip.file('manifest.json')?.async('string');
    manifest = text == null ? null : JSON.parse(text);
  } catch { manifest = null; }
  const hasManifest = !!manifest && typeof manifest === 'object';
  // A cart first: its scene.salsa is itself a project package, but the outer manifest is the cart's.
  if (hasManifest && zip.file('scene.salsa')) return 'cart';
  if (hasManifest && ((manifest.document && typeof manifest.document === 'object') || Array.isArray(manifest.layers))) return 'project';
  if (zip.file(FROGMARKS_STATE_FILE)) return 'project';
  // A zip that says neither: the extension decides (the project import then gives its own exact message).
  const ext = /\.([a-z0-9]+)$/i.exec(file.name ?? '')?.[1]?.toLowerCase();
  if (ext === 'frogmarks' || ext === 'frog') return 'project';
  if (ext === 'frogcart' && hasManifest) return 'cart';
  return 'unknown';
}

/** Where each picked file goes. */
export interface ShellImportPlan {
  /** Installed by the Shell as new cart tiles. */
  carts: File[];
  /** Opened as a new local illustration (one per pick: opening it leaves the Shell). */
  project: File | null;
  /** Further project files in the same pick (not imported). */
  extraProjects: File[];
  unknown: File[];
}

export async function planShellImport(
  files: File[],
  detect: (file: File) => Promise<ShellImportKind> = detectShellImportKind,
): Promise<ShellImportPlan> {
  const plan: ShellImportPlan = { carts: [], project: null, extraProjects: [], unknown: [] };
  for (const file of files) {
    const kind = await detect(file).catch((): ShellImportKind => 'unknown');
    if (kind === 'cart') plan.carts.push(file);
    else if (kind === 'project') { if (plan.project) plan.extraProjects.push(file); else plan.project = file; }
    else plan.unknown.push(file);
  }
  return plan;
}

/** The error toast for a pick (null = nothing went wrong). */
export function shellImportProblem(plan: ShellImportPlan, picked: number): string | null {
  if (plan.unknown.length) {
    if (picked === 1) return NOT_IMPORTABLE_MESSAGE;
    return plan.unknown.length === 1
      ? `"${plan.unknown[0].name}" isn't a Frogmarks project or FrogCart.`
      : `${plan.unknown.length} files aren't Frogmarks projects or FrogCarts.`;
  }
  return plan.extraProjects.length ? ONE_PROJECT_MESSAGE : null;
}
