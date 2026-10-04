// Guard: the Illustrate editor's component-scoped services must not inject each other in a cycle.
//
// They are all provided by IllustrationComponent; A injecting B while B injects A compiles fine and only fails at
// runtime (NG0200 "Circular dependency in DI") when the editor opens. When two services need each other, the lower one
// reaches the higher one through its editor host instead (`this.host.<var>.x` with '<var>' in its host Pick) — see
// src/app/illustrate/ARCHITECTURE.md. Usage: node scripts/check-service-cycles.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../src/app/illustrate/services/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const deps = new Map();
for (const f of readdirSync(DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
  const src = readFileSync(join(DIR, f), 'utf8');
  const cls = /export class (\w+)/.exec(src)?.[1];
  if (!cls) continue;
  const ctor = /constructor\(([^)]*)\)/.exec(src)?.[1] ?? '';
  deps.set(cls, [...ctor.matchAll(/:\s*(\w+Service)\b/g)].map(m => m[1]));
}

const cycles = new Set();
const visit = (node, path) => {
  for (const d of deps.get(node) ?? []) {
    if (!deps.has(d)) continue;                       // a root / shared service, not one of the editor's
    const i = path.indexOf(d);
    if (i >= 0) { cycles.add([...path.slice(i), d].join(' -> ')); continue; }
    visit(d, [...path, d]);
  }
};
for (const n of deps.keys()) visit(n, [n]);

if (cycles.size) {
  console.error('✗ Service injection cycles (fail at runtime with NG0200):\n  ' + [...cycles].join('\n  '));
  console.error('\nHave the lower-level service reach the other through its editor host instead of injecting it.');
  process.exit(1);
}
console.log(`✓ Service injection graph: ${deps.size} illustrate services, no cycles.`);
