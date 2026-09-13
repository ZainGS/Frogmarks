# Frogmarks — Load Time Optimization Spec

## Status Legend
- ✅ Done
- 🔄 In progress
- ⬜ Pending
- ⚠️ Deferred (needs more planning / testing)

---

## Phase 1 — Quick Wins (no runtime risk)

### 1. Delete editor backup files from assets ✅
**Impact:** −8.3 MB from every production build  
**Files:** `src/assets/stamps/*.png~` (7 files)  
Aseprite backup files were included in the `src/assets` glob and copied into the build output verbatim.

---

### 2. Fix `index.html` — doctype, preconnect, render-blocking fonts ✅
**Impact:** Faster first paint; eliminates quirks-mode risk  
**Changes:**
- Move the Material Icons `<link>` inside `<head>` (was above `<!DOCTYPE html>`)
- Add `<link rel="preconnect">` hints for `fonts.googleapis.com` and `fonts.gstatic.com`
- Add `display=swap` to Material Icons request to prevent render blocking

---

### 3. Tighten `angular.json` build budgets ✅
**Impact:** CI/CD will now catch bundle size regressions  
**Before:** 5 MB warning / 6 MB error (catches nothing)  
**After:** 2 MB warning / 3 MB error (realistic ceiling for a WebGPU app)

---

### 4. Clean up `package.json` dead dependencies ✅
**Removed from `dependencies`:**
- `jquery` — not imported anywhere in source (~90 KB)
- `popper.js` v1 — Bootstrap 5 bundles Popper v2; v1 is unused (~20 KB)

**Moved from `dependencies` → `devDependencies`:**
- `run-script-os` — only used in npm scripts, not runtime code
- `node` — should be an `engines` field, not a dependency

---

## Phase 2 — Dynamic Imports (removes heavy libs from initial bundle)

### 5. Dynamic `import('jszip')` — illustration.component.ts ✅ Done
**Impact:** −230 KB from initial bundle  
JSZip is only used in save/load handlers (both `async`). Replace static import with `const { default: JSZip } = await import('jszip')` inside each handler.

**Usage sites:**
- Line 11887: `JSZip.loadAsync(salsaBlob)` — inside async load handler
- Line 11926: `JSZip.loadAsync(file)` — inside async import handler

---

### 6. Dynamic `import('jszip')` — frog-file.service.ts ✅
**Impact:** Removes JSZip from root chunk (service is `providedIn: 'root'`)  
**Usage sites:** Lines 96, 180 — both inside async methods

---

### 7. Dynamic `import('jszip')` — frogui-skin.service.ts ✅
**Impact:** Same as above  
**Usage sites:** Lines 334–335, 410, 471 — async methods; line 555 uses `JSZip` as a type (keep `import type`)

---

### 8. Dynamic `import('jszip')` — dashboard.component.ts ✅
**Impact:** Removes JSZip from dashboard chunk  
**Usage sites:** Lines 2439 (type), 2455 (runtime) — inside async method

---

### 9. Dynamic `import('jszip')` — animation-export.component.ts ✅
**Impact:** Consistent with existing `gifenc` dynamic import pattern (line 251)  
**Usage site:** Line 127 — inside async export method

---

## Phase 3 — Asset Optimization

### 10. Convert stamp PNGs to WebP ⬜
**Impact:** ~18 MB → ~4–5 MB (60–80% reduction on lossless WebP)  
**Files:** `src/assets/stamps/` — 15 PNG files (7 root stamps + 8 icecream variants)  
**Steps:**
1. Run `cwebp -lossless` or `sharp` on each PNG
2. Update any stamp-picker code that hardcodes `.png` extensions
3. Add WebP fallback for Safari < 14 if needed (likely not needed — all target browsers support WebP)

**Note:** These assets are loaded on-demand when the stamp picker opens, not on initial page load. Converting to WebP still reduces bandwidth on first stamp panel open.

---

## Phase 4 — Architectural Changes (plan before executing)

### 11. Lazy-load routes ⚠️
**Impact:** Largest single change — removes Salsa WebGPU engine, IllustrationComponent, BoardComponent, PackageEditorComponent from the initial bundle  
**Current state:** Zero lazy loading; all routes eager in `app.module.ts`  
**Approach:** Convert each heavy route group to a standalone component or feature module, use `loadComponent`/`loadChildren` in the router  
**Routes to lazy-load:**
- `illustration/:id`, `illustration/local/:id`, `view/:id` → `IllustrationComponent` (pulls entire Salsa engine)
- `board/:id` → `BoardComponent`
- `packaging/:id`, `packaging/local/:id` → `PackageEditorComponent`
- `docs` → `DocsComponent`

**Risk:** High — requires converting NgModule declarations to standalone or creating feature modules. Needs full smoke-test after.

---

### 12. Migrate to esbuild builder ⚠️
**Impact:** ~5–10× faster builds; smaller output bundles  
**Current:** `@angular-devkit/build-angular:browser` (Webpack)  
**Target:** `@angular-devkit/build-angular:application` (esbuild, Angular 17 default)  
**Steps:**
1. Change builder in `angular.json`
2. Move `polyfills` from `angular.json` options to `tsconfig.app.json`
3. Rename `main` → `browser` in build options
4. Remove `ngcc` postinstall step from `package.json` (not needed with esbuild/Ivy)
5. Drop `vendorChunk` / `buildOptimizer` options (esbuild handles these natively)
6. Verify `@zaings/salsa` (local file dep) builds correctly under esbuild

**Risk:** Medium — verify Salsa local dep and any CommonJS deps still build cleanly.

---

### 13. Replace `oidc-client` with `oidc-client-ts` ✅
**Impact:** Removes CommonJS-only package; `oidc-client-ts` is the maintained ESM successor  
**Note:** The code was already calling `signinCallback()`/`signoutCallback()` — oidc-client-ts method names — while depending on v1, meaning auth was silently broken. This was a bug fix, not just a cleanup.  
**Files changed:** `package.json`, `src/api-authorization/authorize.service.ts`  
**Action required:** Run `npm install` to swap the package.

---

### 14. Remove dead `MsalModule` ✅
**Impact:** Removes `@azure/msal-angular` + `@azure/msal-browser` (~150 KB combined)  
**Finding:** MSAL was fully dead — `MsalModule` imported with no `.forRoot()`, providers commented out, all service usages either commented out or dead imports. Never actually provided or injected anywhere at runtime.  
**Files changed:** `package.json`, `app.module.ts`, `api.service.ts`, `auth.service.ts`, `board.service.ts`, deleted `src/app/core/msal.config.ts`  
**Also removed:** `dashboard-old` duplicate route (same component as `dashboard`).

---

## Notes

- `gifenc` is already dynamically imported correctly in `animation-export.component.ts` line 251 — good reference pattern for JSZip changes.
- `mp4-muxer` is also used in `animation-export.component.ts` — check whether it is dynamically imported or static.
- `strictTemplates: false` in `tsconfig.json` prevents the compiler from catching template binding inefficiencies. Consider enabling incrementally.
- IBL env map images cannot be serialized — user must re-upload after reload. Considered for future: store env map blob alongside the illustration save file.
