/**
 * Dev instrumentation shared by the Shell (StudioComponent) and the editor: User Timing marks for the
 * "Create → editor" path, the `?shellperf` / `?shellskip=` flags, and a timeline printout.
 * (Salsa docs/ui/shell-ui.md "Performance HUD + debug toggles"; the Shell's own marks + HUD live in Salsa.)
 *
 * Marks, in order: create:click → dialog-closed → doc-created → nav-start → chunk-loaded → editor:ctor →
 * reinit-done → blank-done → doc-loaded → editor:first-frame. (`chunk-loaded` comes earlier when the editor chunk
 * was preloaded.) Marks are always written (a handful per navigation); the console printout needs `?shellperf`.
 */

/** The create → editor marks, in the order they normally fire. */
export const CREATE_MARKS = [
  'create:click', 'dialog-closed', 'doc-created', 'nav-start', 'chunk-loaded', 'editor:ctor',
  'reinit-done', 'blank-done', 'doc-loaded', 'editor:first-frame',
] as const;

/** A User Timing mark. Never throws. */
export function perfMark(name: string): void {
  try { performance.mark(name); } catch { /* unsupported */ }
}

export interface ShellPerfFlags {
  /** `?shellperf`: the Salsa Shell HUD is up; print the create timeline + long tasks here too. */
  perf: boolean;
  /** `?shellskip=…` names (lower-case). The host reads `warmup` (no pipeline warm-up at all, for an A/B). */
  skip: ReadonlySet<string>;
}

/** Parse the flags from a query string (same syntax as Salsa's parseShellDebug). Pure. */
export function parseShellPerfFlags(search: string | null | undefined, base?: ShellPerfFlags): ShellPerfFlags {
  const skip = new Set<string>(base?.skip ?? []);
  let perf = base?.perf ?? false;
  if (search) {
    try {
      const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      if (p.has('shellperf') && p.get('shellperf') !== '0' && p.get('shellperf') !== 'false') perf = true;
      for (const raw of (p.get('shellskip') ?? '').split(',')) {
        const k = raw.trim().toLowerCase();
        if (k) skip.add(k);
      }
    } catch { /* malformed */ }
  }
  return { perf, skip };
}

let _flags: ShellPerfFlags | null = null;
/** The flags of this page load: the URL the page was LOADED with (the router drops query params on later
 *  navigations) plus localStorage 'salsa.shellperf' (same syntax, survives reloads). */
export function shellPerfFlags(): ShellPerfFlags {
  if (_flags) return _flags;
  let f: ShellPerfFlags = { perf: false, skip: new Set() };
  try { f = parseShellPerfFlags(localStorage.getItem('salsa.shellperf'), f); } catch { /* storage blocked */ }
  try { f = parseShellPerfFlags(window.location.search, f); } catch { /* no window */ }
  return _flags = f;
}

/** ms from each create mark to the next one that exists (latest occurrence of each). Pure given the entries. */
export function createTimeline(latest: (name: string) => number | null): { step: string; atMs: number; deltaMs: number }[] {
  const t0 = latest('create:click');
  if (t0 === null) return [];
  const rows: { step: string; atMs: number; deltaMs: number }[] = [];
  let prev = t0;
  for (const name of CREATE_MARKS) {
    const t = latest(name);
    if (t === null || t < t0) continue;   // not reached, or left over from before this click (a preloaded chunk)
    rows.push({ step: name, atMs: Math.round(t - t0), deltaMs: Math.round(t - prev) });
    prev = t;
  }
  return rows;
}

/** With `?shellperf`: print the create → editor timeline once the editor has drawn. */
export function logCreateTimeline(): void {
  if (!shellPerfFlags().perf) return;
  try {
    const latest = (name: string) => {
      const e = performance.getEntriesByName(name, 'mark');
      return e.length ? e[e.length - 1].startTime : null;
    };
    const rows = createTimeline(latest);
    if (!rows.length) return;
    console.log('[perf] create → editor: ' + rows.map(r => `${r.step} +${r.deltaMs}`).join('  ') + `  (total ${rows[rows.length - 1].atMs} ms)`);
    console.table(rows);
  } catch { /* ignore */ }
}
