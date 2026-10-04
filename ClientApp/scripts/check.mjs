#!/usr/bin/env node
// `npm run check`: every automated check for the Frogmarks client in one command, the same thing CI runs.
// (Mirrors salsa/scripts/check.mjs; see salsa/docs/dev/checks-and-ci.md.) Deliberately no `ng build`.
//
//   sanity     scripts/check-source-sanity.mjs: 0-byte files, BOM, mixed line endings, mojibake
//   typecheck  tsc -p tsconfig.app.json --noEmit (types Salsa from its built dist via @zaings/salsa)
//   lint       ESLint + angular-eslint (type-aware unless --fast)
//   sm-types   scripts/check-shapemanager-types.mjs: no `(shapeManager as any)` style casts
//   templates  scripts/check-template-members.mjs: template identifiers exist on their component
//   di-cycles  scripts/check-service-cycles.mjs: no injection cycles among the editor's component-scoped services
//
// Flags:  --fast       lint without type info (pre-commit use)
//         --steps=a,b  run only these steps
//         --bail       stop at the first failing step (default: run everything, then summarise)
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const bail = args.includes('--bail');
const stepsArg = args.find((a) => a.startsWith('--steps='));
const only = stepsArg ? new Set(stepsArg.slice('--steps='.length).split(',')) : null;

const steps = [
  { name: 'sanity', cmd: ['scripts/check-source-sanity.mjs'] },
  { name: 'typecheck', cmd: ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.app.json', '--noEmit'] },
  {
    // --quiet: errors only (`npm run lint` shows warnings). --pass-on-unpruned-suppressions: fixing a baselined
    // error (or --fast skipping a type-aware one) must not fail the run.
    name: 'lint', cmd: ['node_modules/eslint/bin/eslint.js', '.', '--quiet', '--pass-on-unpruned-suppressions'],
    env: fast ? { LINT_NO_TYPES: '1' } : {},
  },
  { name: 'sm-types', cmd: ['scripts/check-shapemanager-types.mjs'] },
  { name: 'templates', cmd: ['scripts/check-template-members.mjs'] },
  { name: 'di-cycles', cmd: ['scripts/check-service-cycles.mjs'] },
];

const results = [];
for (const step of steps) {
  if (only && !only.has(step.name)) continue;
  console.log(`\n=== ${step.name} ${'='.repeat(Math.max(0, 70 - step.name.length))}`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, step.cmd, { stdio: 'inherit', env: { ...process.env, ...(step.env || {}) } });
  const ok = r.status === 0;
  results.push({ name: step.name, ok, secs: ((Date.now() - t0) / 1000).toFixed(1) });
  if (!ok && bail) break;
}

console.log('\n=== summary ' + '='.repeat(62));
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(10)} ${r.secs}s`);
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\ncheck: ${failed.length} step(s) failed: ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
console.log('\ncheck: all passed');
