// Guard: every identifier an illustrate/ component template starts an expression with must exist on that component.
//
// The app builds with strictTemplates off, so Angular never type-checks event-handler bodies — `(click)="foo()"` on a
// component without `foo` compiles and throws only when clicked. This caught real bugs after members moved out of the
// editor into services / child views (docs/refactor-plan.md, 2.9F QA). Run it after moving template code.
//
// Heuristic, not a parser: members = class fields / methods / accessors / @Input / @Output / constructor parameter
// properties; template locals (#ref, let-x, *ngFor lets, `as` aliases) and globals are allowed. Strings are blanked
// and object-literal keys skipped. Nested component folders (e.g. character-panel/sections) are scanned too. One level
// deeper: `x.member` where x is a constructor-injected class reached through a relative import (a panel-scoped service,
// or the parent panel as `cp`) must exist on that class.
// Usage: node scripts/check-template-members.mjs [component-folder ...]
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';

const ROOT = new URL('../src/app/illustrate/components/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const GLOBALS = new Set(['$event', '$any', 'true', 'false', 'null', 'undefined', 'this', 'Math', 'JSON', 'Number', 'String',
  'Object', 'Array', 'let', 'of', 'as', 'index', 'first', 'last', 'even', 'odd', 'count', 'else', 'trackBy', 'typeof',
  'in', 'new', 'context']);
const PIPES = new Set(['number', 'titlecase', 'async', 'json', 'date', 'percent', 'uppercase', 'lowercase', 'slice',
  'keyvalue', 'currency']);

function classMembers(ts) {
  const body = ts.includes('export class') ? ts.slice(ts.indexOf('export class')) : ts;
  const members = new Set();
  const decl = /^ {2}(?:@\w+\([^)]*\)\s*)?(?:(?:private|public|protected|readonly|static|override|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*[!?]?\s*[(:=;<]/;
  for (const line of body.split(/\r?\n/)) {
    const m = decl.exec(line);
    if (m) members.add(m[1]);
    // several fields on one line:  a = 0; b = 0; c = 0;
    if (/^ {2}[A-Za-z_$]/.test(line)) {
      for (const x of line.matchAll(/;\s*(?:(?:private|public|protected|readonly)\s+)*([A-Za-z_$][\w$]*)\s*[!?]?\s*[:=]/g)) members.add(x[1]);
    }
  }
  for (const c of body.matchAll(/constructor\(([^)]*)\)/g)) {
    for (const p of c[1].matchAll(/(?:public|private|protected|readonly)\s+(\w+)\s*:/g)) members.add(p[1]);
  }
  return members;
}

function expressions(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const m of html.matchAll(/(?:\[[^\]]+\]|\([^)]+\)|\*ng\w+|\[\([^)]+\)\])="([^"]*)"/g)) out.push(m[1]);
  for (const m of html.matchAll(/\{\{([\s\S]*?)\}\}/g)) out.push(m[1]);
  return out;
}

function templateLocals(html) {
  const s = new Set();
  for (const re of [/#([A-Za-z_$][\w$]*)/g, /\blet\s+([A-Za-z_$][\w$]*)/g, /\bas\s+([A-Za-z_$][\w$]*)/g,
                    /\blet-([A-Za-z_$][\w$]*)/g, /;\s*(?:let\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?:index|first|last|even|odd)/g]) {
    for (const m of html.matchAll(re)) s.add(m[1]);
  }
  return s;
}

/** Every <name>.component.html with a sibling .ts under dir (recursive). */
function findComponents(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...findComponents(p));
    else if (f.endsWith('.component.html') && existsSync(p.replace(/\.html$/, '.ts'))) out.push(p.replace(/\.html$/, ''));
  }
  return out;
}

/** Constructor-injected `public x: Cls` whose class file is a relative import -> x -> that class's members. */
function injectedMembers(ts, tsPath) {
  const out = new Map();
  const imports = new Map();
  for (const m of ts.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']*)'/g)) {
    for (const n of m[1].split(',').map(x => x.trim()).filter(Boolean)) imports.set(n, m[2]);
  }
  for (const c of ts.matchAll(/constructor\(([^)]*)\)/g)) {
    for (const p of c[1].matchAll(/public\s+(\w+)\s*:\s*(\w+)/g)) {
      const spec = imports.get(p[2]);
      if (!spec) continue;
      const file = resolve(dirname(tsPath), spec + '.ts');
      if (existsSync(file)) out.set(p[1], classMembers(readFileSync(file, 'utf8')));
    }
  }
  return out;
}

const comps = findComponents(ROOT);
const wanted = process.argv.slice(2);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');
const folders = wanted.length ? comps.filter(c => wanted.some(w => rel(c).startsWith(w))) : comps;

let bad = 0;
for (const base of folders) {
  // "world-panel" for a top-level component, "character-panel/sections/char-hair-section.component" for a nested one
  const folder = basename(base) === basename(dirname(base)) + '.component' ? rel(dirname(base)) : rel(base);
  const ts = readFileSync(base + '.ts', 'utf8');
  const html = readFileSync(base + '.html', 'utf8');
  const members = classMembers(ts), locals = templateLocals(html), unknown = new Set();
  const injected = injectedMembers(ts, base + '.ts');
  for (const e of expressions(html)) {
    const e2 = e.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`/g, "''")
                .replace(/\|\s*(\w+)/g, (m, p) => (PIPES.has(p) ? '' : m));
    for (const m of e2.matchAll(/(?<![\w.$\])?])([A-Za-z_$][\w$]*)/g)) {
      const n = m[1];
      const after = e2.slice(m.index + n.length, m.index + n.length + 2);
      if (after.startsWith(':') && !after.startsWith('::') && /[{,]\s*$/.test(e2.slice(0, m.index))) continue;   // object key
      if (GLOBALS.has(n) || PIPES.has(n) || locals.has(n) || /^\d+$/.test(n)) continue;
      if (members.has(n)) {
        const sub = injected.get(n), dot = /^\s*\??\.\s*([A-Za-z_$][\w$]*)/.exec(e2.slice(m.index + n.length));
        if (sub && dot && !sub.has(dot[1])) unknown.add(`${n}.${dot[1]}`);
        continue;
      }
      unknown.add(n);
    }
  }
  if (unknown.size) { bad += unknown.size; console.error(`✗ ${folder}: not on the component -> ${[...unknown].sort().join(', ')}`); }
}
if (bad) {
  console.error(`\n${bad} template identifier(s) not found on their component (strictTemplates is off, so these fail at runtime).`);
  process.exit(1);
}
console.log(`✓ Template member check: ${folders.length} illustrate components, every template identifier resolves.`);
