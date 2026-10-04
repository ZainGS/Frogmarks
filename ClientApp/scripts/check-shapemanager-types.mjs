// Guard: keep Frogmarks' calls into Salsa's ShapeManager type-checked.
//
// A cast like `(this.shapeManager as any).foo()` or a handle typed `sm: any` hides renamed/removed engine
// methods from the compiler — they then fail silently at runtime (see docs/refactor-plan.md, Phase 1).
// This fails the build if such a pattern appears in a file that isn't on the migration allowlist below.
// When you migrate a file, REMOVE it from the allowlist so it stays clean.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('../src/app/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Every file is migrated (2026-10-02). Keep this empty; fix new violations instead of listing them.
const ALLOWLIST = new Set([]);

const PATTERNS = [
  { re: /\(\s*(?:this\.)?(?:shapeManager|sm|_sm)\s+as\s+any\s*\)/, why: 'cast of the ShapeManager handle to any' },
  { re: /=\s*(?:this\.)?shapeManager\s+as\s+any\b/, why: 'ShapeManager handle assigned through an any cast' },
  { re: /\b(?:shapeManager|_?sm\w*)\s*[!?]?\s*:\s*any\b/, why: 'ShapeManager handle typed as any' },
  { re: /get\s+sm\s*\(\s*\)\s*:\s*any\b/, why: 'sm getter typed as any' },
  // Engine sub-managers handed around separately (audit 2026-10-04, Phase 3.1: cloth-builder took `scene3dManager: any`
  // and made 19 unchecked calls — two to methods that never existed).
  { re: /\b(?:scene3dManager|scene3d|worldManager)\s*[!?]?\s*:\s*any\b/, why: 'engine sub-manager handle typed as any' },
  { re: /\(\s*(?:this\.)?(?:shapeManager|sm)\s*\??\.\s*(?:scene3d|world)\s+as\s+any\s*\)/, why: 'cast of an engine sub-manager to any' },
  { re: /=\s*(?:this\.)?(?:shapeManager|sm)\s*\??\.\s*(?:scene3d|world)\s+as\s+any/, why: 'engine sub-manager assigned through an any cast' },
];
// Templates: binding the engine through $any(...) hides the same mistakes from the template type-check.
const TEMPLATE_PATTERNS = [
  { re: /\$any\(\s*(?:this\.)?shapeManager\b/, why: '$any() around the ShapeManager handle in a template' },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if ((p.endsWith('.ts') && !p.endsWith('.spec.ts')) || p.endsWith('.html')) yield p;
  }
}

const problems = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (ALLOWLIST.has(rel)) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');          // ignore trailing / whole-line comments
    for (const { re, why } of (file.endsWith('.html') ? TEMPLATE_PATTERNS : PATTERNS)) {
      if (re.test(code)) { problems.push(`${rel}:${i + 1}  ${why}\n    ${line.trim()}`); break; }
    }
  });
}

if (problems.length) {
  console.error(`\n✗ ShapeManager type guard: ${problems.length} untyped engine call site(s).\n`);
  console.error(problems.join('\n'));
  console.error('\nCall ShapeManager through its real type so engine renames break at compile time.');
  console.error('If an argument type is too loose, cast the ARGUMENT (`x as any`), never the manager.\n');
  process.exit(1);
}
console.log('✓ ShapeManager type guard: no untyped engine calls outside the migration allowlist.');
