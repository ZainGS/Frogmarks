import type { FrogImportResult } from '../../services/illustrate/frog-file.service';
import { readFrogmarksPackage, uniqueProjectName, type FrogmarksPackageInfo } from '../../services/illustrate/frogmarks-package';
import type { LocalIllustration } from '../../services/illustrate/local-illustration.service';
import { setPendingProjectImport } from '../../services/illustrate/pending-project-import';

/** What the Shell's Settings › Import .frogmarks… needs (StudioComponent passes the real services). */
export interface ShellProjectImportDeps {
  /** Every local project's name (archived ones too): the import gets a name none of them has. */
  listNames(): Promise<string[]>;
  create(name: string, documentAspect?: number): Promise<LocalIllustration>;
  /** An older .frog file: parse it (FrogFileService.parseFrogFile) … */
  parseFrog(file: File): Promise<FrogImportResult>;
  /** … and leave it for the editor (FrogFileService.pendingImport). */
  setFrogPending(result: FrogImportResult): void;
  /** Tests only. */
  read?: (file: File) => Promise<FrogmarksPackageInfo>;
}

/**
 * Validate a picked file and create the NEW local illustration it becomes (never an existing one; the name comes from
 * the file, made unique). The content is not unpacked here — only an open editor can (frogmarks-package.ts) — it is
 * handed to the editor that opens the returned document next (pending-project-import.ts, or the .frog pending import).
 * Throws FrogmarksPackageError (with the message to show) for a file that is not a project or is too new; nothing is
 * created then.
 */
export async function prepareShellProjectImport(file: File, deps: ShellProjectImportDeps): Promise<LocalIllustration> {
  const info = await (deps.read ?? readFrogmarksPackage)(file);
  const frog = info.kind === 'frog' ? await deps.parseFrog(file) : null;
  const name = uniqueProjectName(info.name, await deps.listNames());
  const item = await deps.create(name, info.documentAspect);
  if (frog) {
    // applyFrogImport titles the document from the manifest: give it the unique name
    deps.setFrogPending({ ...frog, manifest: { ...frog.manifest, name } });
  } else {
    setPendingProjectImport({ uuid: item.uuid, file, editorState: info.state?.editorState ?? null });
  }
  return item;
}
