# Frogmarks architecture audit — 2026-10-04

Read-only audit of the whole repo (ASP.NET Core backend + Angular `ClientApp`), done from a snapshot taken
2026-10-04 ~02:45. **Findings come from reading the code, not running it.** Verify each one before fixing it;
line numbers may have drifted. Items marked *verified* were re-checked by hand. Paths are relative to the repo
root (`Frogmarks/`) unless they start with `src/` (= `ClientApp/src/`) or `illustrate/` (= `ClientApp/src/app/illustrate/`).

**Never print, log or commit secret values while working on this.**

---

## How to work through this

- Go phase by phase, in order. Phase 1 before anything else.
- Every step leaves the backend and the client building and working (`dotnet build`, `npm run check`, `ng build`).
- Ask the user before deleting anything that might be planned work (e.g. the SignalR / WebSocket code), and before
  changing how login works for real users.
- Update this file as items are done (strike them through or move them to a "Done" section with the date).

---

## Done

**Phase 1 — 2026-10-04.** All items verified (1.2, 1.9 and 1.10 were wider than listed — notes below). Site not
deployed yet (owner confirmed), so stored refresh tokens were not invalidated. Backend builds; client `npm run check`
passes except the pre-existing `sm-types` casts from in-progress feature work.

- **1.1** `UserController`: `[Authorize]`; returns `{ Id, UserName, Email }`, never `ApplicationUser`. `[JsonIgnore]` on
  `AuditLog.CreatedBy/ModifiedBy`, `TeamUser.ApplicationUser` and `ApplicationUser.RefreshToken(ExpiryTime)`, so no
  response can serialize a user record (also covers **1.8**'s leak; entity → DTO cleanup itself is still open).
- **1.2** `Services/ResourceAccessService` (owner = `CreatedById`, or a member of the item's team, or a collaborator —
  the owner's choice). Guards the top of all 32 board / illustration methods that take an id / uid (NotFound otherwise),
  filters `GetAll*` and `Search*`, and Duplicate requires membership of `targetTeamId`. Explore (both) disabled — returns
  an empty list until designed (public feed should filter `IsPublic`, `[AllowAnonymous]`). Mass assignment: Update /
  Favorite keep the stored `TeamId`, `PermissionsId`, `IsPublic`; DTO → entity maps ignore `Collaborators` (Favorite was
  also silently moving items into the current team). Rows with neither `CreatedById` nor `TeamId` are now unreachable.
- **1.3** `TeamController` / `TeamUserController` `[Authorize]`; teams-by-user only for yourself; get / update / delete
  team and every TeamUser action require membership; list / search return only your teams; TeamUser responses are
  `TeamUserDto`. Client `ApiService` helpers send `withCredentials` (cross-origin cookie auth).
- **1.4** `AuthoringController`: `[Authorize]`, per-user rate limit (`authoring`: 120 / hour), `max_tokens` capped at
  32000 server-side, `[DisableRequestSizeLimit]` removed. (System prompt / tools still come from the client.)
- **1.5** CSPRNG re-auth code; `/validate` rejects `reauth:` tokens; magic links single-use; 5 wrong re-auth codes
  discard the live code; per-IP rate limit (`auth`: 20 / 5 min) on `EmailController` and `auth/login`; tokens no longer
  logged.
- **1.6** `ErrorService` recursion fixed (it also sat under every `BaseController.HandleErrorActionResult`).
- **1.7** `generate-token` → 404 outside Development; password-login cookies now `Secure` (with `SameSite=None` they
  were being dropped).
- **1.9** `Utilities/BlobNames` validates ids and pixel formats on every blob path built from client input;
  `LocalBlobStorageProvider` refuses paths outside its root.
- **1.10** Storage is charged / credited to the illustration's owner, not the caller.

**Phase 1 follow-ups — 2026-10-04.**
- `UserController` (and its `CreateUserRequest`) deleted — the client never called it.
- **CSRF:** cookie-authenticated `/api` requests with an unsafe method must carry `X-Requested-With` (middleware in
  `Program.cs`, after the rate limiter); the client's `AuthInterceptor` adds it to API-bound requests only (absolute
  `apiUri` or relative `/api`), and the one raw `fetch` that posts to the API (`authoring-panel`) sets it itself. CORS
  origins come from `Cors:AllowedOrigins` (default: the local dev server), credentials allowed for those only.
- **Magic-link URL** from `Frontend:BaseUrl` (default `https://localhost:44452`), token URL-escaped.
- **Email tokens hashed:** stored as HMAC-SHA256 keyed from `JwtSettings:SecretKey` (re-auth codes as
  `reauth:` + HMAC(email:code), so the attempt limit still finds them). Tokens issued before this change stop working
  (they live 15 minutes).
- **Deploy checklist:** set `Frontend:BaseUrl` and `Cors:AllowedOrigins` for each environment.
- Explore / legacy dashboard: left as is on purpose — the shell UI doesn't use them (owner, 2026-10-04).
- **Parked (design decision, before any public launch):** consolidate authentication. Today: ASP.NET Identity +
  Duende IdentityServer (deprecated ApiAuthorization) + a cookie scheme + the custom `JwtMiddleware` (signature-only
  validation, no issuer / audience). For an SPA talking to its own API, Identity with cookies only is the usual choice.

**Still open from Phase 1:** JwtMiddleware skips issuer / audience validation and the auth stack mixes Identity,
IdentityServer, a cookie scheme and the custom middleware (1.7 — pick one path); `SameSite=None` everywhere (CSRF now guarded by the header check);
one email-token row per email shared by magic link and re-auth; quota read-modify-write race and uncharged paths (state-save removals, duplicate, publish bundles); entities
still returned from several endpoints (1.8); 

Verification notes beyond the audit: list-all endpoints returned every row; mass assignment through Create / Update /
Favorite; Duplicate accepted any `targetTeamId`; `BoardPermissions` / `TeamPermissions` exist but are never enforced;
State save removes layers / cels without deleting blobs or crediting quota.

**Phase 2 — 2026-10-04** (owner is testing local / OPFS only for now; cloud items are build-verified, not run):
- **2.2** Every Frogmarks write path respects Salsa's save block (`_isSaveBlocked()`): full save, OPFS quick flush,
  thumbnail. Changes stay dirty; "keep what loaded" clears the block and saves at once. (Pixel autosave is Salsa's own
  and already blocked.)
- **2.3** Document switches: loads run one at a time and a superseded one is skipped (`_queueDocumentLoad`); each first
  `flushPendingSave()`s the previous document (running save, change in the 2 s debounce, Salsa pixel save). Leaving
  the editor: `canDeactivate` flushes (capped at 5 s). A save captures its document once instead of re-reading
  `this.illustration` after awaits; the cloud load path is awaited. Tab close warns while a change is pending.
- **2.4** `OpfsMetadataService.write` is serialized per document, sequence-stamped (an older snapshot finishing late
  can't overwrite a newer one) and returns success; a failed local-only save shows a notice (max once a minute).
- **2.1** Confirmed and fixed (wider than listed): `Scene3dGlobalSettings` stored as raw JSON (all ~80 keys round-trip;
  legacy PascalCase keys normalized on load), and `[JsonExtensionData]` keeps every other top-level field the server
  doesn't model — `scene3dGroups`, `scene3dFrameLinkBuckets`, `packaging` were also being dropped.
- **2.5** Optimistic concurrency without a migration: `Revision` in ExtendedStateJson, `baseRevision` on save → 409 when
  someone else saved in between; the client tracks the revision (load, save, OPFS cache) and pauses cloud saves with a
  notice on 409. `PUT {id}/state` now returns real status codes (it answered 200 to failures, so they counted as saved)
  and no longer echoes the whole state. Favorite no longer throws for users in 2+ teams.
- Not done: **2.6** board saves (Boards is legacy — left), **2.7** save-format version bump (OPFS meta parse already
  falls back to null).

**Phase 3 — 2026-10-04.** `npm run check` all green.
- **3.1** The 26 (+1 re-added) untyped ShapeManager calls are typed. Guard widened: engine sub-manager handles
  (`scene3dManager` / `scene3d` / `worldManager`) typed `any`, `(sm.world as any)` / `(sm.scene3d as any)` casts, and
  `$any(shapeManager)` in templates. Typing what it then found: cloth-builder (`scene3dManager: any`, 19 optional calls)
  — **Cancel in create mode left the preview cloth mesh in the scene** (`removeNode` never existed → `deleteMesh`),
  a dead `getNode` / renderer branch, an ignored 5th `addClothStitch` argument (`side` never reached the engine); world
  panel (10 `world as any` casts, all real methods); 8 `$any(shapeManager)` template bindings (none needed).
- **3.2** CI runs a production `ng build` after `npm run check` (separate step — kept out of `check` for speed). It
  passes, but the initial bundle is **9.49 MB** against an 8 MB warning / **10 MB error** budget → Phase 4.1 is close
  to blocking CI.
- **3.3** The 21 boilerplate specs (none ran) are deleted. New specs (22, headless Chrome, `npm run test:ci`, CI step):
  persistence (save block, single-flight queue, `flushPendingSave`, a save keeps writing the document it started on,
  local-failure notice), `OpfsMetadataService` (per-document order, stale snapshot skipped, failure reported, pixel URLs
  stripped), keymap `dispatchKey` + real tables, CSRF header only to the API. Mutation-checked: undoing the save-block
  and captured-document fixes fails 4 of them. Not yet: frog-file round trip, backend tests (no test project).

**Phase 4.1 — 2026-10-04.** The Illustrate editor is lazy-loaded: `illustrate/illustrate.module.ts` (57 components,
routes `local/:id` + `:id`, the flush-on-leave guard) is mounted at `/illustration` and `/view` (`/view` passes
`data.viewer`, inherited by the child) — URLs unchanged. Components the editor shares with the eager app (colour picker,
Boards brush options / curve editor / raster layers / selection toolbar) moved to `shared/shared-ui.module.ts`.
Production initial bundle **9.49 MB → 7.26 MB** (under the 8 MB warning); the editor is a 2.22 MB lazy chunk. The rest
of the initial bundle is mostly Salsa (5.6 MB), which the shell landing page uses. Not done: lazy Boards / dashboard /
player (owner: legacy / not in use), tighter budgets.

**Phase 5 — 2026-10-04.** `npm run check` green apart from the other session's in-progress casts (below); 24 specs.
- **5.1** `illustrate/services/editor-state.service.ts` owns the shared editor state: 3D selection (ids, meshes, type /
  group / name), raster layers + selection, selected node, camera mode / FOV / projection / view target, 3D panel
  visibility, Play mode. Consumers inject it instead of reaching through Picks. `clearMeshSelection()` is the one way to
  drop the mesh selection; the five ad-hoc clears (decal, procedural panels, delete paths) left the per-mesh flags stale
  and the engine selecting a deleted node. The three hidden host cycles (doc↔persist, doc↔files, character↔uv) go
  through the host on purpose, and `check:di-cycles` guards the injection graph. ARCHITECTURE.md updated (bind in
  `ngOnInit`, state / host rules). Plain fields, not signals — the editor isn't OnPush yet.
- **5.2** `animationEnabled` is a getter / `setAnimationEnabled()` over the engine — one store. Not done: the OPFS /
  server paths still re-apply the 3D-settings snapshot over Salsa's restore (needs a load test, which is cloud-side).
- **5.3** `?.()` "older Salsa" guards removed from the typed panels (ui-system, character, scene-view-bar, randomizer,
  engine-status). Not done: world-panel's guards, `SALSA_API_VERSION` (an edit to Salsa's `shape-manager.ts` while Salsa's agent is
  active — coordinate first), façade methods for `.scene3d` reach-throughs, `animation-export` guards (other session).
- **5.4** UI-system preview rAF and the grease-pencil 250ms poll run outside the zone (GP re-enters only when the plane
  changes). Not done: armature-panel timers (other session active there), OnPush.
- **5.5** Not done — character-panel / armature are being edited by the other session; splitting them now would collide.
- **5.6** The Keyboard Shortcuts dialog is generated from the keymap (`group` + `help` on each binding,
  `cheatsheetColumns()`); every old row is covered and the corrupted Zoom-out key label is gone. Timeline section stays
  static (the timeline's own keys). `window.__frogmarksPlaying` → `editorState.playing` (timeline injects it; the shared
  raster-layers panel takes `[hotkeysSuspended]`). Keymap handlers that call async methods now `void` them.
- Open: `check:sm-types` flags 7 new `(sm as any)` casts in character-panel (hair) and scene-view-bar (landing dust /
  idle variety) from the other session's current work. The methods exist on ShapeManager — drop the casts when done.

**Phase 6 — 2026-10-04.** Backend builds, `npm run check` green apart from the other session's casts, 24 specs,
production build passes (initial **7.26 → 7.18 MB**).
- Dead SSR gone: `server` target, `build:ssr`, `app.server.module.ts`, `@angular/platform-server`.
- Unused packages uninstalled: `three`, `@types/three`, `@splinetool/runtime` (the dashboard loads the Spline viewer
  from a CDN), `@types/jasminewd2`, `oidc-client-ts`.
- Stray files deleted: `patch_3d.js` / `.py`, `assets/images/*.png~`, the `ClientApp/%APPDATA%` dev-cert folder.
- Client oidc module (`src/api-authorization`) removed: real sign-in is the cookie flow, so its `<app-login-menu>` never
  saw a user and rendered nothing. `OidcConfigurationController` (`/_configuration`, only the oidc client called it) and
  its dev-proxy entry removed. **Kept:** `AddIdentityServer().AddApiAuthorization` — `ApplicationDbContext` implements
  `IPersistedGrantDbContext`, so removing it needs a migration; that belongs to the parked auth consolidation.
- `WeatherForecast*` / `TestController` deleted.
- `ApiService.handleError` no longer redirects to `/unauthorized` on 401 (no such route and no `**` route, so the
  navigation just failed); matches the interceptor's design — refresh, else drop to local mode, sign in from the header.
- **SignalR / `/ws` removed** (user approved): `SignalR/`, `WebSockets/`, `BatchService` in Board/IllustrationService,
  the Program.cs registrations (BoardHub, AddSignalR + the required connection string, UseWebSockets, MapHub, `/ws`)
  and the `Microsoft.Azure.SignalR` / `Microsoft.AspNetCore.WebSockets` packages. The `AzureSignalR` section in
  appsettings is now unused (delete it; retire the Azure resource / key). Why: no client
  connects; the hub broadcasts to everyone with no auth; `/ws` throws (`IWebSocketService` unregistered); `BoardHub` is
  resolved as a plain singleton so `Clients` is null and every update broadcast throws in an unawaited task; startup
  fails without an Azure SignalR secret. Real collaboration would need auth + per-document groups — a rewrite anyway.
- **Not done — docs merge.** `ClientApp/docs` (feature / refactor notes, `docs-for-salsa/` for Salsa's agent),
  `ClientApp/documentation` (README, features, reference, backlog) and `Frogmarks/documentation` (this audit). Paths are
  referenced from `eslint.config.mjs`, `check-shapemanager-types.mjs` and `salsa-tracker.md`; do it when the other agents
  are idle, updating those references.
- Still open from the list above: HTTP-layer consolidation, backend ops items, CSS theme.

**Client cleanup — 2026-10-04 (owner: local-first; backend / cloud refactor deferred to a future cloud pass).**
- Editor: dead injections `router`, `authService`, `frogFileService`, `opfsMetadataService` removed. The GP panel's
  `drawSettingsChange` output, `GpDrawSettings`, `_emitSettings` and the editor's no-op handler removed (nothing listened).
- `RasterTextService._enableRasterText` unsubscribes the previous engine listener (re-selecting the tool leaked one).
- Authoring panel posts to the configured API base with `credentials: 'include'` (it used a page-relative URL and
  would lose the auth cookie on a separate API origin). `ApiService.post` no longer logs every URL.
- Silent local catches now warn: rename, the local index update after a save, the thumbnail update. The rest of the
  empty catches are deliberate (chain continuation, clipboard) or in the legacy dashboard.
- Raw `fetch()` reviewed: the rest are blob / SAS / asset downloads — correct to bypass the API interceptor.
- `environment*.ts`: unused `apiUrl` removed (URLs live in `src/core/app.config.ts`).
- World panel: today's `this.shapeManager.world as any` casts and their `?.()` "older Salsa" guards removed — all
  typed against the real WorldManager except `roofEquipment` (in Salsa source, not yet in its dist: narrow cast, noted).
  `check:sm-types` now also catches `= sm.world as any` / `= sm.scene3d as any`.
- Orphans: `click-stop-propagation` directive deleted (never declared or used). `home-legacy` is also undeclared /
  unreachable — left for the owner (legacy screens are kept on purpose).
- Deferred: Bootstrap vs Material (both used across dozens of templates — a visual change that needs eyes on the UI);
  retro theme → CSS variables (same); OnPush (needs browser testing).

**Phase 5.5 — character / armature split, 2026-10-04.** `npm run check` fully green (first time today), 24 specs, prod
build passes.
- **character-panel** 1,525 → 519 TS lines, template 3,010 → 206. Five panel-scoped services (`char-look`, `char-face`,
  `char-hair`, `char-clothing`, `char-charms`; bodies verbatim, each owns its timers in `ngOnDestroy` — the face-kit
  debounce timer was never cleared before). Six section components under `sections/` (body, face, eyes, hair,
  clothing for all four slots, charms); the menu stays in the panel. The Salsa-tested hair control table + `hairShow()`
  stay in the panel file (Salsa's `hair-control-modes.test.ts` reads it by path).
- **armature-panel** 1,404 → 214 TS lines: `arm-rig`, `arm-binding`, `arm-anim`, `arm-library`, `arm-spring`. Dead
  numeric-bone-entry members removed (`addBoneNumeric`, `applyMove`, `applyTailOffset`, `newJoint*`, `wpJointIdx`).
  Phase 5.4 done here: the 200ms over-idle poll and the 12fps global-library preview run outside the zone (the preview
  refreshes only the panel); preview timers are now cleared on close (they outlived the panel). Template kept whole
  (912 lines, stacked sections; splitting would duplicate its 12KB stylesheet per section).
- All remaining ShapeManager casts removed (hair / clothing / hide-body, Play landing dust / idle variety,
  `roofEquipment`) — Salsa's 12:27 dist has them.
- `check:templates` now scans nested component folders and checks `svc.member` on constructor-injected classes; it
  caught two extraction mistakes during this work (unprefixed template refs, multi-field declaration lines).
- Cost: the editor chunk +~90KB raw / ~2KB gzip (the shared control styles imported by each section component).

**Mobile — 2026-10-06.** Touch-first devices (`pointer: coarse`) drop the backdrop blurs over the editor canvas (one
list in `styles.scss`). The editor's window scroll / resize and the layers panel's resize listeners run outside the
zone and re-enter only to close an open menu (Android URL bars fire resizes constantly). OnPush for the heavy panels:
planned in `onpush-plan.md` (not started). Salsa-side suggestion: SSAO / SSR off in the mobile GPU tier.

## Phase 1 — Backend security (do first)

Severity assumes the site is reachable on the internet. Ask the user whether it is deployed; it changes urgency, not the fix.

There is **no default authorization policy**: `Program.cs:147` is a bare `AddAuthorization()`, the default-policy
block at `Program.cs:150-158` is commented out, and `[Authorize]` on `Controllers/BaseController.cs:13` is commented
out. So any controller without its own `[Authorize]` is fully anonymous. *(verified)*

1. **Account takeover via `UserController`** *(verified)* — no `[Authorize]`. `GET /api/user/email?email=`
   (`Controllers/UserController.cs:23-39`) returns the raw `ApplicationUser` from `UserService.GetUserByEmailAsync`
   (`Services/UserService.cs:16-18`), which includes `PasswordHash`, `SecurityStamp`, `RefreshToken`,
   `RefreshTokenExpiryTime` (`Models/ApplicationUser.cs:19-20`). The refresh token can be replayed against
   `POST /api/auth/refresh-token` (`Controllers/AuthController.cs:~74`) to get a session. `POST /api/user`
   (`UserController.cs:49`) creates accounts anonymously.
   → Remove or lock the controller; never return identity entities; invalidate all stored refresh tokens after fixing.
2. **No per-resource authorization (IDOR) on boards and illustrations.** Service methods load by id/uid with no
   owner / team / collaborator check, e.g. `Services/BoardService.cs:64, 132, 214, 238, 264, 312`, and the same
   pattern throughout `Services/IllustrationService.cs` (get, update, save/load state, delete, duplicate, rename,
   uploads, publish/unpublish, delete cel). Search/explore return everyone's items: `teamId <= 0 || …`
   (`BoardService.cs:343`, `IllustrationService.cs:380`). `PublishIllustration` (`IllustrationService.cs:~1491`) lets
   any logged-in user publish anyone's illustration.
   → One `IAccessService.CanRead/CanEdit(userId, resourceId)` backed by team membership + collaborators, called from
   every board/illustration method; scope search/explore to the user's teams; publish requires edit rights.
3. **Team endpoints anonymous** *(verified)* — `Controllers/TeamController.cs`, `TeamUserController.cs` have no
   `[Authorize]` (and the base class's is commented out): list/create/update/delete teams, add any user to any team,
   `GET /api/Team/User/{userId}` creates teams for arbitrary ids. `TeamUserService` returns raw `TeamUser` entities;
   with `UseLazyLoadingProxies` (`Program.cs:43`) serialization likely pulls in `ApplicationUser` (hash + tokens).
4. **Anonymous Anthropic proxy** *(verified)* — `Controllers/AuthoringController.cs:8` `[AllowAnonymous]`,
   `:23` `[DisableRequestSizeLimit]`; caller controls `system` (:43), tools, messages and `maxTokens` (:64-71, raised to
   ≥16000 in one branch). Anthropic error bodies are passed back.
   → Require auth, fix the system prompt and tool list server-side, cap tokens, add a per-user rate limit.
5. **Brute-forceable login codes** — `Services/EmailService.cs:196` 6-digit code from `Random.Shared` (not
   cryptographic) *(verified)*; no attempt limit, no rate limiting anywhere. `/api/email/validate` matches any stored
   token (`EmailService.cs:~122`) without an email, so `reauth:NNNNNN` guesses are tested against every user at once,
   and it auto-creates users. Magic-link tokens aren't deleted after use (replayable for 15 min); invalid tokens are
   logged in full (~:125).
   → `RandomNumberGenerator`, per-email attempt limits, delete on use, `/validate` rejects `reauth:` tokens,
   `AddRateLimiter` on auth endpoints.
6. **Server crash on any logged exception** *(verified)* — `Services/ErrorService.cs:63`:
   `GetUserStackTraceLines` calls itself unconditionally → `StackOverflowException`, which kills the process.
   Called from `ErrorService.cs:27`. Probably meant to split `fullStackTrace` into lines.
7. **Other auth issues**
   - `GET /api/auth/generate-token` signs tokens for anyone.
   - Custom `JwtMiddleware` sets `context.User` itself with `ValidateIssuer/Audience = false`; mixed with Identity,
     Duende IdentityServer 6.0.4 (ApiAuthorization package is deprecated) and a cookie default scheme. Pick one path.
   - Cookies are `SameSite=None` (`Program.cs:76, 120`) with no antiforgery → CSRF on multipart/body-less POSTs
     (`/publish`, `/thumbnails`, `/unpublish`, `/logout`). Password-login cookies lack `Secure`
     (`AuthController.cs:~52, ~60`). Prefer `SameSite=Lax` for a same-origin SPA.
8. **Entities returned from the API** — `GetAllBoards`/`GetAllIllustrations` return entity lists; create/update/
   delete/favorite return `ResultModel<Board|Illustration>`; `AuditLog.CreatedBy/ModifiedBy` are `ApplicationUser`
   (lazy-loaded). `BoardDto` inherits `AuditLog`. → DTOs only, turn off lazy loading.
9. **Path traversal in blob names** — user-controlled `format` (query) → `{id}/{celId}.{ext}`
   (`IllustrationService.cs:~1335, ~1396`), `boardUid` → `{boardUid}.png` (`BoardService.cs:~543`);
   `LocalBlobStorageProvider.GetFilePath` (:26) is a plain `Path.Combine`. No content-type/signature checks on uploads.
   → Whitelist `format`, validate ids (GUID/regex), canonical-path check in the local provider.
10. **Quota bypass** — upload/delete charge or credit the *caller*, not the owner (`IllustrationService.cs:~356, ~1448`);
    read-modify-write increment can race.

**Secrets:** `appsettings.json` / `appsettings.Development.json` contain live keys (Anthropic, Azure Communication
Services, Azure SignalR, JWT signing key, and a commented-out blob AccountKey). Both files are gitignored
(`.gitignore:234-235`). Check `git log --all -- appsettings.json appsettings.Development.json`; if they were ever
committed, rotate everything. Either way move them to user-secrets (dev) and Key Vault / app settings (prod).

## Phase 2 — Data-loss bugs

1. **3D look settings likely dropped on cloud save** *(verified: fields missing)* — client sends ~48 keys
   (`illustrate/services/illustration-persistence.service.ts:187-240`); `Scene3dGlobalSettingsDto`
   (`Models/Dtos/Illustration/IllustrationStateDto.cs:138`) lacks ~30 (bloom*, ssao*, shadowStrength, fog*,
   colorGrade*, vignette*, film*, snap*, grid*). No `[JsonExtensionData]` → System.Text.Json discards them.
   → Confirm with a save→reload test first. Then add the fields, or store the settings as a raw `JsonElement`.
2. **Saves ignore Salsa's save block** — after a partial restore Salsa blocks its own persistence
   (`getSaveBlockedReason()`), but `saveIllustrationV2` (persistence:269), `_quickFlushOpfsMeta` (:107) and
   `uploadPixelData` (:391) never check it → a half-loaded scene can overwrite the good server copy while the banner
   says autosave is paused.
3. **Document switching not race-safe** — route subscription uses `subscribe`, not `switchMap`
   (`illustrate/components/illustration/illustration.component.ts:~1505`); async `initForIllustration` can't be
   cancelled; an in-flight save re-reads `this.illustration` after awaits (persistence:372-377, 392-394) → can write
   document A's data/aspect onto B. A save waiting in the 2s `auditTime` window is dropped on switch/destroy
   (component:~1524, ~2552). `onBeforeUnload` (:245) only checks dirty meshes; no `CanDeactivate` guard anywhere.
   → `switchMap` or a generation token; capture illustration+id once per save; flush on switch/destroy; add a guard.
4. **OPFS metadata writes unserialized, fire-and-forget** — `void` at persistence:117, 295, 382;
   `opfs-metadata.service.ts:19-37`. Quick flush and full save can write the same file concurrently; failures only
   hit the console. → Per-key promise chain, await in save path, surface failures.
5. **Last-write-wins on the server** — no RowVersion/concurrency token anywhere; `SavedAt` comes from the client
   (~:815); save deletes layers/cels missing from the payload → a stale tab silently wipes newer work.
   `TeamUsers.SingleOrDefaultAsync(by user)` (`BoardService.cs:276`, `IllustrationService.cs:293`) throws once a user
   is in 2+ teams. → RowVersion + 409 on conflict; map `ResultType` to HTTP status (39 actions return 200 on failure).
6. **Board saves fail silently** — `src/app/boards/components/board/board.component.ts:880-888` sends the whole scene
   graph every second (`auditTime(1000)`), `.subscribe()` with no error path.
7. **Save format versioning** — `version: 2` stamped (`frog-file.service.ts:336`), load only checks `>= 2`
   (persistence:550); "v3 per-mesh" format is detected by field presence; OPFS metadata `JSON.parse` unchecked
   (`opfs-metadata.service.ts:46`); no migration step. → Bump the version for the per-mesh format and branch on it.

## Phase 3 — Get CI green and honest

1. **`check:sm-types` currently fails** *(verified)* — 26 untyped ShapeManager calls: `ui-system-panel.component.ts`
   (15), `character-panel.component.ts` (7), `scene-view-bar.component.ts` (2), `illustrate/utils/character-randomizer.ts`
   (2). It's `prebuild`, so `npm run build` fails. Type the UI-kit / hair / character-scale methods; don't re-add files
   to the allowlist. Also: `cloth-builder.component.ts:114` takes `@Input() scene3dManager: any` with 29 `?.(` calls,
   which slips past the guard (it matches by variable name) → widen the guard to any engine handle typed `any`.
2. **CI never runs `ng build`** — add `ng build --configuration production` to `npm run check` and the workflow.
   `check:templates` only scans `illustrate/components`; e.g. `SignInComponent` is routed but neither declared nor
   standalone.
3. **Tests are dead** — 21 specs, all CLI boilerplate; `dashboard.component.spec.ts` puts a non-standalone component in
   `imports:`; none provide HttpClient/Material. Delete them; add real tests where data can be lost: persistence
   save/load, `frog-file` round-trip, the DTO round-trip from Phase 2.1, `api.service`/interceptor with
   `HttpTestingController`. Run headless in CI.

## Phase 4 — Load time and the next god component

1. **No lazy loading** — `src/app/app.module.ts` declares ~90 components, one eager `forRoot` (≈ lines 211-229).
   Landing route `''` is `StudioComponent`, which imports Salsa (`studio.component.ts:5-6`); 72 files import Salsa.
   Budgets 8MB/10MB (`angular.json:44-47`) can't catch growth (`load-optimizations.md` claims 2/3MB — wrong).
   → `loadComponent`/`loadChildren` for illustration, board, package, player, dashboard; keep Salsa out of the
   initial chunk; budgets ~2-3MB warn / 5MB error.
2. **Dashboard is now the god component** — `src/app/shared/components/dashboard/dashboard.component.ts` 2,683 lines,
   ~142 methods, 19 injections, 87KB SCSS. Covers layouts, FLIP animations, drag-drop, context menus,
   rename/archive/delete, sync/backup, re-auth, skin builder, local-AI settings, player cart, storage quota, dev panel.
   → Split like the editor: view (grid/masonry/list), item menu, sync/backup service, settings panels, player drop zone.

## Phase 5 — Deeper architecture

1. **Host-Pick pattern has outgrown itself** — 23 consumers, 177 Pick entries over 100 editor members, ~30 field writes
   through Picks (e.g. selection cleared ad hoc in `decal.service.ts:157,167`, `procedural-panels.service.ts:69,97`,
   bypassing `_resetMeshSelectionFlags`); 7 private members made public for Picks; hidden injection cycles through the
   host (persist → `host.applyFrogImport` → files → persist) that `check:di-cycles` can't see. 7 services already use a
   cleaner closure-interface host (`layer-effects.service.ts:18`). ARCHITECTURE.md says `bind` happens in the
   constructor; it's in `ngOnInit` (:1445).
   → `EditorStateService` (signals or BehaviorSubjects) owning selection, `scene3dMeshes`, `animationEnabled`,
   camera mode/FOV; Picks become `Readonly` or closure interfaces; update ARCHITECTURE.md.
2. **Duplicated state** — `animationEnabled` written to component and `RasterAnimationService` in 5 places
   (component:200, 2601; project-file:162; persistence:833, 917). The 3D-settings double store (refactor-plan §3) is
   fixed only for local docs; OPFS (:649) and server (:744) paths still re-apply the 107-field snapshot over Salsa's restore.
3. **Version the Salsa contract** — Salsa is `file:` linked at `0.0.1`, no changelog; Frogmarks has 52 `?.(` engine
   calls and "absent on an older Salsa dist → no-op" guards (`world-panel.component.ts:664-784`, `ui-system-panel`).
   → Salsa exports `SALSA_API_VERSION`; check once at boot; remove the per-call guards. Add façade methods for the most
   used `.scene3d` (65) / `.shell` (12) reach-throughs and flag them in the guard.
4. **Change detection** — 0/57 components OnPush, 0 signals. In-zone timers re-check the whole app incl. the 1,927-line
   editor template: UI preview rAF loop (`ui-system-panel:491-499`), 250ms poll (`grease-pencil-panel:128`), 200ms poll
   + 12fps timer (`armature-panel:734, 1384`). → run them outside the zone; then OnPush leaf-first.
5. **Mini god-panels** — character-panel (128 fields, 89 methods; template 2,921 lines with 230 sliders, 126
   multi-statement handlers, 223 inline styles), armature (135/125), world (180 fields), timeline (81/90).
   → Tab sub-components; generate sliders from data tables.
6. **Keyboard** — keymap plus timeline `document:keydown` (`animation-timeline:1010`), 4 editor HostListeners, global
   `window.__frogmarksPlaying` (component:~1975); cheatsheet HTML duplicates keymap text.

## Phase 6 — Cleanup

- Remove unused deps: `three`, `@types/three`, `@splinetool/runtime` (no imports in src), `@angular/platform-server`,
  `@types/jasminewd2`.
- Dead SSR: `app.server.module.ts`, `server` target / `build:ssr` (point at a missing `tsconfig.server.json`).
- Half-dead auth: unused `AuthorizeGuard`, commented `AuthorizeInterceptor` (`app.module.ts:233`), oidc
  `api-authorization` module still mounted via `<app-login-menu>` (`nav-menu.component.html:53`) — confirm which flow
  is real.
- HTTP layer: `ApiService` helpers used 4 times vs 60 direct `this.http` calls, 25 `Observable<any>`; `handleError`
  routes to a nonexistent `/unauthorized` and special-cases `'/api/whatever'` (`api.service.ts:78-84`); 7 raw `fetch()`
  bypass the interceptor; `authoring-panel.component.ts:97` posts to a client-relative URL; 13 empty
  `catch(() => {})`; no global `ErrorHandler`. `environment*.ts apiUrl` is unused (real config in `core/app.config.ts`).
- Backend real-time (ask the user before removing): `/ws` resolves an unregistered `IWebSocketService` (throws);
  `BoardHub` has no `[Authorize]` / groups and lets anyone broadcast; `BatchService` calls the hub unawaited
  (`BoardService.cs:225`); the client uses neither. Startup still *requires* the SignalR connection string
  (`Program.cs:199`).
- Backend ops: `Database.Migrate()` at startup (`Program.cs:251`), no health checks / prod `UseExceptionHandler`,
  Kestrel's 30MB default body limit makes the 100MB publish limit unreachable, mesh blobs + published bundles orphaned
  on delete, `JwtMiddleware` logs every anonymous request at Information, `WeatherForecast*` / `TestController`
  template code, `net7.0` is end-of-life → net8+. Split `IllustrationService` (1,618 lines): CRUD, state, blobs+quota,
  publishing.
- Client: dead constructor injections in the editor (`router`, `authService`, `opfsMetadataService`, `frogFileService`);
  `rt._enableRasterText` (raster-text:37) overwrites its subscription; `onGpDrawSettingsChange` no-op.
- CSS: `retro-chrome-theme.scss` 82KB / 1,096 `!important` → CSS variables; Bootstrap + Material both global — pick one.
- Stray files: `ClientApp/patch_3d.js` / `.py` (target strings no longer exist), the `ClientApp/%APPDATA%` folder,
  `*.png~` backups in assets.
- Docs: merge `docs/` and `documentation/`; move `salsa-tracker.md` / `BUGS.md` / plans to `docs/planning/`; give tracker
  items ids; fix stale `documentation/reference/01-illustration-editor.md`, `load-optimizations.md` §11/§12, `BUGS.md`
  line refs; rewrite `ClientApp/README.md`.

## What's good (keep doing this)

- Editor decomposition: 28 component-scoped services, typed outputs (`OutlinerAction`, `AddMeshAction`), keymap as
  data, ARCHITECTURE.md. Longest editor method 98 lines (was 489).
- Engine subscriptions set up in one place and torn down symmetrically; hot paths outside the zone.
- Clean Salsa boundary: all 80 imports via the three public entry points.
- Save pipeline is more careful than average (single-flight + one-deep queue, per-layer dirty snapshot, failed uploads
  stay dirty, OPFS-vs-server freshness check).
- Backend reads are efficient where it counts (`AsNoTracking`, projections, parallel SAS generation), magic-link and
  refresh tokens use a CSPRNG, Swagger/migrations endpoint dev-only.
- CI builds Salsa and runs tsc + ESLint + three custom guards; focused lint ruleset with a small suppression baseline.
