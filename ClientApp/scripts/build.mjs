#!/usr/bin/env node
// `npm run build`: `ng build`, then stamp the build info behind the version label (src/app/app-version.ts) into the
// built index.html as <meta> tags:
//   fm-build-time       now, ISO
//   fm-salsa-version    node_modules/@zaings/salsa/package.json "version" (the dist exports no version constant)
//   fm-salsa-dist-time  mtime of the Salsa dist bundle this build bundled
// index.html is never content-hashed, so the stamp always matches the bundles it loads (Angular 17's CLI has no
// `--define` flag, and editing a hashed chunk after the build would keep its old file name).
// Production builds also emit the service worker (ngsw.json): its index.html hash is refreshed after the stamp.
// Extra arguments go to `ng build`, e.g. `npm run build -- --configuration production` (what Frogmarks.csproj runs).
// `ng serve` / `npm start` have no stamp; the label then says "dev build".
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const r = spawnSync(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build', ...args], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);

// Output folder: angular.json "outputPath" (dist) unless --output-path was passed; the application builder writes
// the page to <out>/browser/index.html.
let outDir = 'dist';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output-path' && args[i + 1]) outDir = args[i + 1];
  else if (args[i].startsWith('--output-path=')) outDir = args[i].slice('--output-path='.length);
}
const indexPath = [join(outDir, 'browser', 'index.html'), join(outDir, 'index.html')].find((p) => existsSync(p));
if (!indexPath) {
  console.warn(`build: no index.html under ${outDir}; version label will say "dev build"`);
  process.exit(0);
}

let salsaVersion = '', salsaDistTime = '';
try { salsaVersion = JSON.parse(readFileSync('node_modules/@zaings/salsa/package.json', 'utf8')).version ?? ''; } catch { /* not installed */ }
try { salsaDistTime = statSync('node_modules/@zaings/salsa/dist/main.es.js').mtime.toISOString(); } catch { /* no dist */ }
const buildTime = new Date().toISOString();

const esc = (s) => String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
const metas = [
  ['fm-build-time', buildTime],
  ['fm-salsa-version', salsaVersion],
  ['fm-salsa-dist-time', salsaDistTime],
].map(([n, v]) => `<meta name="${n}" content="${esc(v)}">`).join('');

let html = readFileSync(indexPath, 'utf8').replace(/<meta name="fm-[a-z-]+" content="[^"]*">/g, '');
if (!html.includes('</head>')) { console.warn(`build: ${indexPath} has no </head>; not stamped`); process.exit(0); }
html = html.replace('</head>', `${metas}</head>`);
writeFileSync(indexPath, html);
console.log(`build: stamped ${indexPath}: built ${buildTime}, Salsa ${salsaVersion || '?'} (dist ${salsaDistTime || '?'})`);

// Service worker (production builds, angular.json "serviceWorker"): ngsw.json was generated BEFORE the stamp above,
// so its SHA-1 of /index.html no longer matches the file. The worker checks every prefetched file against that table
// and would refuse to install the version (and serve nothing offline). Re-hash index.html, and put APP_VERSION + the
// build time in appData: the update prompt reads them from the VERSION_READY event ("New version: v0.02").
const ngswPath = join(dirname(indexPath), 'ngsw.json');
if (existsSync(ngswPath)) {
  let appVersion = '';
  try { appVersion = /export const APP_VERSION = '([^']+)'/.exec(readFileSync('src/app/app-version.ts', 'utf8'))?.[1] ?? ''; } catch { /* unreadable */ }
  const ngsw = JSON.parse(readFileSync(ngswPath, 'utf8'));
  ngsw.hashTable = ngsw.hashTable ?? {};
  ngsw.hashTable['/index.html'] = createHash('sha1').update(Buffer.from(html, 'utf8')).digest('hex');
  ngsw.appData = { ...(ngsw.appData ?? {}), version: appVersion, buildTime };
  writeFileSync(ngswPath, JSON.stringify(ngsw, null, 2));
  console.log(`build: ngsw.json re-hashed /index.html, appData v${appVersion || '?'}`);
}
