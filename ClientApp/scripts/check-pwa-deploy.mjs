#!/usr/bin/env node
// Checks a deployed (or locally served) production build for what the service worker needs:
//   node scripts/check-pwa-deploy.mjs https://frogmarks.com
// - ngsw.json is served as JSON (not the SPA's index.html) and every file in its hashTable is served byte-identical
//   (a CDN feature that rewrites HTML — analytics / "Rocket Loader" / e-mail obfuscation injection — breaks the
//   index.html hash, and the worker then refuses to install the version: no offline, no updates);
// - index.html, ngsw.json, the worker scripts and the manifest are sent with a revalidating Cache-Control;
// - the manifest has the right type, and a deep link (no file extension) gets the SPA page.
// Exit code 1 when something is wrong. Docs: salsa/docs/ui/pwa.md.
import { createHash } from 'node:crypto';

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) { console.error('usage: node scripts/check-pwa-deploy.mjs <site url>'); process.exit(2); }

let problems = 0;
const bad = (msg) => { problems++; console.log(`  FAIL  ${msg}`); };
const ok = (msg) => console.log(`  ok    ${msg}`);
const get = (path) => fetch(base + path, { cache: 'no-store', redirect: 'follow' });
const revalidates = (cc) => /no-cache|no-store|max-age=0/.test(cc || '');

console.log(`PWA deploy check: ${base}`);

for (const path of ['/', '/index.html', '/ngsw.json', '/ngsw-worker.js', '/safety-worker.js', '/manifest.webmanifest']) {
  const res = await get(path);
  const cc = res.headers.get('cache-control');
  if (res.status !== 200) bad(`${path}: HTTP ${res.status}`);
  else if (!revalidates(cc)) bad(`${path}: Cache-Control "${cc ?? '(none)'}" (want no-cache: src/_headers)`);
  else ok(`${path}: ${res.status}, Cache-Control "${cc}"`);
}

const manifestRes = await get('/manifest.webmanifest');
const mType = manifestRes.headers.get('content-type') || '';
if (!/manifest\+json|application\/json/.test(mType)) bad(`manifest Content-Type "${mType}"`);
else ok(`manifest Content-Type "${mType}"`);

const ngswRes = await get('/ngsw.json');
let ngsw = null;
try { ngsw = JSON.parse(await ngswRes.text()); } catch { bad('ngsw.json is not JSON (the SPA fallback served index.html for it?)'); }
if (ngsw) {
  ok(`ngsw.json: appData ${JSON.stringify(ngsw.appData)}, ${Object.keys(ngsw.hashTable || {}).length} hashed files`);
  let mismatched = 0;
  for (const [url, hash] of Object.entries(ngsw.hashTable || {})) {
    const res = await get(url);
    const body = Buffer.from(await res.arrayBuffer());
    const got = createHash('sha1').update(body).digest('hex');
    if (res.status !== 200 || got !== hash) { mismatched++; bad(`${url}: ${res.status !== 200 ? 'HTTP ' + res.status : 'content differs from the build (hash mismatch)'}`); }
  }
  if (!mismatched) ok('every hashed file is served exactly as built');
}

const deep = await get('/illustration/local/00000000-0000-0000-0000-000000000000');
const deepHtml = deep.status === 200 ? await deep.text() : '';
if (!deepHtml.includes('<app-root')) bad(`deep link: HTTP ${deep.status}, not the app page (SPA fallback missing)`);
else ok('deep link serves the app page (SPA fallback)');

const missing = await get('/definitely-not-a-file-' + Date.now() + '.json');
if (missing.status === 200 && (await missing.text()).includes('<app-root')) {
  console.log('  note  a missing *.json returns index.html (200): harmless while ngsw.json exists, but a deploy without it would not unregister the worker');
}

console.log(problems ? `\n${problems} problem(s)` : '\nall good');
process.exit(problems ? 1 : 0);
