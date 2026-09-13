# Frogmarks – Architecture Review & Prioritised Improvement List

> Reviewed against the Angular 17 + ASP.NET Core SPA codebase as of the current branch (`main`).
> Primary directories examined:
> - Angular client: `ClientApp/src/`
> - ASP.NET Core backend: `Frogmarks/` (Controllers/, Services/, Program.cs)

---

## Table of Contents

1. [Angular Architecture](#1-angular-architecture)
2. [State Management](#2-state-management)
3. [Testing](#3-testing)
4. [Backend – ASP.NET Core](#4-backend--aspnet-core)
5. [Performance](#5-performance)
6. [Code Quality & Tech Debt](#6-code-quality--tech-debt)
7. [Security](#7-security)
8. [Missing Infrastructure](#8-missing-infrastructure)
9. [Prioritised Work List](#9-prioritised-work-list)

---

## 1. Angular Architecture

### 1.1 Builder configuration

`angular.json` uses `@angular-devkit/build-angular:application` — the modern esbuild-based application builder introduced in Angular 17. This is correct and optimal; no action needed there.

The `serve` target still uses `@angular-devkit/build-angular:dev-server`, which pairs correctly with the `application` builder.

### 1.2 Eager loading — everything in one module

Every component in the application is declared in `AppModule` (`src/app/app.module.ts`) and every route is registered with a direct component reference:

```typescript
RouterModule.forRoot([
  { path: '', component: StudioComponent, pathMatch: 'full' },
  { path: 'illustration/:id', component: IllustrationComponent },
  { path: 'board/:id', component: BoardComponent },
  // …12 more routes, all eager
])
```

There is no `loadComponent` or `loadChildren` anywhere. The result is that the 12,258-line `IllustrationComponent`, the `BoardComponent` (1,659 lines), and all 20+ panel components are bundled and parsed on every page load, including the marketing landing page at `/`.

Candidates for lazy-loading that would give immediate wins:
- `IllustrationComponent` and all illustrate-specific panel components (largest win)
- `BoardComponent` + board-specific components
- `PackageEditorComponent`
- `DocsComponent`

### 1.3 Bundle budgets

`angular.json` production budgets:

```json
{ "type": "initial", "maximumWarning": "8mb", "maximumError": "10mb" }
```

8 MB for an initial bundle is not a budget — it is an absence of a budget. A healthy Angular application with a Salsa WebGPU engine is unlikely to come in under 2 MB, but a 10 MB ceiling still leaves room for years of unchecked growth before the build errors. A more useful target is `maximumWarning: "3mb", maximumError: "5mb"` with the understanding that lazy-splitting the illustration route will bring the initial chunk down substantially.

### 1.4 TypeScript strictness

`tsconfig.json` does not include a top-level `"strict": true`. The relevant flags that are missing or explicitly disabled:

| Flag | State |
|---|---|
| `strict` | not set (defaults to false) |
| `noImplicitAny` | not set |
| `strictNullChecks` | not set |
| `strictTemplates` (`angularCompilerOptions`) | **explicitly `false`** |
| `strictInjectionParameters` | true |
| `strictInputAccessModifiers` | true |

The absence of `strictTemplates: true` is the most impactful gap: it means template type errors — wrong property names, incorrect pipe arguments, binding to non-existent inputs — are not caught at compile time. Given the 12,258-line component and its equally large template, this has likely been suppressing real bugs for a long time.

`skipLibCheck: true` is set, which is acceptable given the Salsa package ships `.d.ts` files.

**Note:** The inline `// ✅ FIX:` comment in `tsconfig.json` at line 9 is a non-standard annotation in a JSON file. While `tsc` accepts JSONC, it is confusing to leave in a config file.

### 1.5 IllustrationComponent — size and concerns

**Line count: 12,258**

`src/app/illustrate/components/illustration/illustration.component.ts`

This is the dominant architectural problem in the client. The file handles, conservatively:

| Concern | Evidence |
|---|---|
| WebGPU bootstrap & Salsa lifecycle | `startWebGPURendering`, `reinitializeWebGPURendering`, `afterRendererBoot` (line ~8199) |
| Scene graph subscriptions (3D scene, raster layers, cel frame) | `_sceneGraphChangedSub`, `_rasterLayersSub`, `_currentFrameSub` (lines 132–136) |
| Tool mode state (flood fill, magic wand, brush, arrowhead, dither, speech balloon…) | 60+ boolean/enum properties for tool config across lines 230–500 |
| Animation timeline & playback | `animationEnabled`, `toggleAnimationMode`, `animationService` calls |
| Auto-save & thumbnail management | `autoSaveSubscription`, `thumbnailSaveSubscription`, `lastSavedJSON`, `_saveRunning`, `_saveQueued` |
| Keyboard shortcuts (~30 hotkeys) | `handleHotkeys`, multiple `@HostListener` blocks |
| UI visibility state (menus, panels, drawer opens) | 40+ boolean flags like `showEditMenu`, `scene3dPanelVisible`, `showBrushCursor` |
| 3D viewport (character, cloth, IK, pose library, spring/jiggle) | `scene3dSelectedMeshId`, `scene3dEditCharPanelOpen`, `scene3dEditCharBodyId`, etc. |
| SDF text, live text, speech balloons | `selectedSDFTextColor`, `liveTextIsEditing`, `liveTextNodeId` |
| UV editor integration | `uvCanvasRef` |
| Package designer dieline | `pkgDiePaneRef`, `pkgDieGuideRef` |

`ngOnInit` runs ~178 lines (lines 8007–8185) and is effectively a second constructor that registers multiple global event listeners on `document` and `window`.

`ngOnDestroy` is 62 lines (lines 11675–11737) and does clean up subscriptions and event listeners thoroughly — the cleanup story is among the better parts of this file.

The 162 occurrences of `as any` (confirmed via `grep -c ": any"`) are almost entirely casts against the Salsa `ShapeManager` and `WorldManager`, because the public API of those objects is accessed via optional chaining on `as any` casts rather than a typed adapter layer.

### 1.6 Standalone components

No components in the app are declared as standalone. `standalone: false` is explicit on `IllustrationComponent`. Moving to standalone components is a prerequisite for route-level lazy loading with `loadComponent`.

---

## 2. State Management

### 2.1 Pattern in use: services-as-state with BehaviorSubject

There is no NgRx or Angular Signals. The services under `src/app/shared/services/raster/` use a clean `BehaviorSubject` + `Observable` pattern:

- `RasterAnimationService` (398 lines) — animation frame, playback, loop mode, onion skin
- `RasterBrushService` — brush settings
- `RasterSelectionService` — selection state
- `RasterAutoSaveService` — auto-save intervals and save state

This is an acceptable architecture for a solo project. The pattern is consistent within the raster services.

### 2.2 State leakage into IllustrationComponent

Despite the raster services, a large amount of state that belongs in services lives as component-level fields on `IllustrationComponent`. Examples:
- All 3D scene state (selected mesh, transform mode, viewport gizmo position)
- All tool config (fill tolerance, wand mode, stamp color, dither config)
- SDF text settings
- Speech balloon defaults
- Auto-save interval selection

This makes it impossible to unit-test any of that logic and makes the component hard to re-use or split.

### 2.3 Subscription lifecycle

The component uses manual `Subscription` fields. Most are cleaned up in `ngOnDestroy`, but the pattern is fragile:

- `selectionChangedSubscription` and `selectionToolSubscription` are declared with `!` (non-null assertion, lines 326–327). If `ngOnDestroy` fires before they are assigned (e.g., if an error occurs in `ngOnInit` before assignment), calling `.unsubscribe()` on them would throw.
- `rasterStrokeSubscription` (line 350) is an optional (`?`) — it IS cleaned up in `initForIllustration` (line 8034) but NOT in `ngOnDestroy`. If the component is destroyed without re-navigating through `initForIllustration`, this subscription leaks.

The modern alternative is `takeUntilDestroyed(this.destroyRef)` piped inside each subscription, which eliminates the manual field pattern entirely.

---

## 3. Testing

### 3.1 Spec file inventory (21 files)

| File | Tests present | Assessment |
|---|---|---|
| `illustration.component.spec.ts` | 1 ("should create") | Broken: tries to import non-standalone component via `imports:[]` |
| `api.service.spec.ts` | 1 ("should be created") | Skeleton only |
| `auth.service.spec.ts` | 1 ("should be created") | Skeleton only |
| `board.service.spec.ts` | 1 ("should be created") | Skeleton only |
| `navbar.service.spec.ts` | 1 ("should be created") | Skeleton only |
| `notify.service.spec.ts` | 1 ("should be created") | Skeleton only |
| `board.component.spec.ts` | 1 ("should create") | Skeleton only |
| `dashboard.component.spec.ts` | 1 ("should create") | Skeleton only |
| `signin.component.spec.ts` | 1 ("should create") | Skeleton only |
| `check-your-email.component.spec.ts` | 1 ("should create") | Skeleton only |
| `invite-modal.component.spec.ts` | 1 ("should create") | Skeleton only |
| `upgrade-modal.component.spec.ts` | 1 ("should create") | Skeleton only |
| `color-picker.component.spec.ts` | 1 ("should create") | Skeleton only |
| `explore-feed.component.spec.ts` | 1 ("should create") | Skeleton only |
| `authorize.guard.spec.ts` | unknown | Auto-generated |
| `authorize.interceptor.spec.ts` | unknown | Auto-generated |
| `authorize.service.spec.ts` | unknown | Auto-generated |
| `api-authorization.module.spec.ts` | unknown | Auto-generated |
| `login-menu.component.spec.ts` | unknown | Auto-generated |
| `login.component.spec.ts` | unknown | Auto-generated |
| `logout.component.spec.ts` | unknown | Auto-generated |

**Effective test coverage: approximately 0%** of real application logic. Every spec is an auto-generated "should create" test that will fail or trivially pass without exercising any functionality.

### 3.2 Services with zero test coverage

All of the following services have no spec file:
- `IllustrationService` (501 lines, complex HTTP + state logic)
- `LocalIllustrationService` (IndexedDB operations)
- `RasterAnimationService` (398 lines, core animation state machine)
- `RasterBrushService`
- `RasterAutoSaveService`
- `FrogFileService` (file import/export)
- `OpfsMetadataService` (OPFS I/O)
- `ProfileService`
- `SyncStatusService`
- `LocalInferenceService`
- `ThemeService`, `FrogUiSkinService`, `SkinInspectorService`
- `TeamService`

### 3.3 Test runner

Karma + Jasmine (configured in `karma.conf.cjs`). Coverage is configured for HTML output but **no coverage threshold** is set, so `ng test` will pass with 0% coverage. No CI integration was observed.

There is no Jest configuration; migration to Jest would give faster runs and better IDE integration, but it is optional.

---

## 4. Backend – ASP.NET Core

### 4.1 Controller thinness

`IllustrationController`, `BoardController`, `TeamController`, and `TeamUserController` are all thin — they delegate directly to injected services and have consistent error handling via `BaseController.HandleErrorActionResult`. No business logic lives in the controllers. This is correct.

`TestController` (`Controllers/TestController.cs`) is a scaffolded MVC controller with empty action bodies and is never called; it should be deleted.

`WeatherForecastController` is the "Hello World" scaffold from `dotnet new`. It has `[Authorize]` applied but serves no application purpose and should be deleted.

### 4.2 Service interfaces and DI

All significant services have interfaces (`IUserService`, `ITeamService`, `ITeamUserService`, `IIllustrationService`, `IBoardService`, `IEmailService`, `IErrorService`). Scoped lifetime is used correctly for DB-touching services.

`BatchService` (`Program.cs` line 176) is registered without an interface — it's injected by concrete type. Fine for now but inconsistent.

Exception catch blocks across multiple controllers and services contain the comment `// Log the exception (ex)` but do not call any logger. Application Insights is configured (`builder.Services.AddApplicationInsightsTelemetry()`) but is not receiving exception telemetry because the exceptions are swallowed in catch blocks and replaced with `StatusCode(500, "...")`.

### 4.3 Authorization gaps — controllers missing `[Authorize]`

| Controller | `[Authorize]`? | Endpoints exposed |
|---|---|---|
| `IllustrationController` | ✓ Yes | — |
| `BoardController` | ✓ Yes | — |
| `WeatherForecastController` | ✓ Yes (dead code) | — |
| `AuthController` | — None at class level | Login, refresh token, generate-token |
| `AuthoringController` | **`[AllowAnonymous]` on class** | POST /api/authoring → Anthropic API |
| `TeamController` | **Missing** | Full team CRUD |
| `TeamUserController` | **Missing** | Full team-user CRUD |
| `UserController` | **Missing** | GET by email, POST create user |
| `EmailController` | All methods `[AllowAnonymous]` | Sign-in email, validation, re-auth |

`TeamController`, `TeamUserController`, and `UserController` have no authorization at all. Any unauthenticated caller can enumerate teams, users, and team memberships.

### 4.4 Database strategy

EF Core Code-First with SQL Server. 13+ migrations are present in `Migrations/`. Migrations are auto-applied on startup:

```csharp
// Program.cs, lines 248-252
using (var scope = app.Services.CreateScope()) {
    var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    dbContext.Database.Migrate();
}
```

Auto-migrating in production is risky: a failed migration during a rolling deploy can corrupt the database. The standard safer approach is to run migrations as a separate step in the deploy pipeline before the new app version starts.

`UseLazyLoadingProxies()` is enabled (Program.cs line 43). This convenience can silently cause N+1 queries for any navigation property access that happens inside a loop or after the initial query. Eager loading (`Include()`) should be preferred in services where data shape is known.

No raw SQL was observed — all data access appears to go through EF Core.

---

## 5. Performance

### 5.1 Initial bundle

Because every component is eager and there are no lazy routes, the initial bundle contains:
- `IllustrationComponent` (12,258 lines) and all 10+ illustrate panels
- `BoardComponent` (1,659 lines) and all board components
- All Angular Material modules declared in `AppModule`
- `@zaings/salsa` (WebGPU engine)
- Bootstrap CSS

The bundle budget ceiling of 10 MB means the build will not warn until the app is already extremely heavy.

### 5.2 Zone.js interaction with Salsa

`IllustrationComponent.initForIllustration` correctly uses `NgZone.runOutsideAngular` for the Salsa WebGPU bootstrap and event listeners (`document.addEventListener('mousemove', …)`). This is good — it prevents Salsa's high-frequency canvas events from triggering Angular change detection on every pointer move.

### 5.3 Potential subscription leak in ngOnDestroy

`rasterStrokeSubscription` (line 350) is assigned inside `initForIllustration` (line 8413) and unsubscribed there on re-navigation (line 8034), but it is NOT unsubscribed in `ngOnDestroy`. If the component is destroyed while `rasterStrokeSubscription` is active, the subscription is leaked.

### 5.4 Repeated setTimeout patterns

`ngOnDestroy` clears 12+ individual `setTimeout` and `setInterval` handles (lines 11704–11718). Each one is a separate component-level field. This is sprawling but functional. Consolidating timer management into a single timer registry or using RxJS `timer`/`interval` with `takeUntil` would simplify cleanup.

### 5.5 `console.log` in production

123 `console.log/warn/error` calls across `src/app/`. The build does not strip them (no `drop_console` equivalent in esbuild config). In production this is noise and a minor performance cost on the render thread.

---

## 6. Code Quality & Tech Debt

### 6.1 `any` type usage

| Location | Count |
|---|---|
| `illustration.component.ts` | **162** `as any` or `: any` |
| `src/app/shared/services/` | 28 |

The casts in `illustration.component.ts` are almost all of the form `(this.shapeManager as any).someMethod?.()`. The Salsa package exposes `ShapeManager` with a typed public API, but features added to Salsa that haven't yet been surfaced in the published types are accessed by casting to `any`. A thin typed wrapper interface — even a local `interface SalsaExtended extends ShapeManager { ... }` — would eliminate most of these casts and provide autocomplete.

### 6.2 Template strictness disabled

`strictTemplates: false` in `tsconfig.json` means the Angular compiler does not check property bindings, event bindings, or pipe arguments against component types. This is a major loss of compile-time safety in a codebase that already uses `any` heavily.

### 6.3 Dead code

- `dashboard-old` route (line 122, `app.module.ts`) — points to `DashboardComponent`, same as `dashboard`. Never navigated to from the app itself.
- `AuthorizeInterceptor` commented out in `app.module.ts` line 137: `//useClass: AuthorizeInterceptor, multi: true` — `AuthorizeGuard` is also imported (line 25) but **applied to zero routes**. Both the IdentityServer guard and interceptor appear to be vestiges of an earlier auth strategy.
- Commented-out thumbnail GET endpoints in `IllustrationController.cs` (lines 255–285) — two full action methods, commented out with full XML doc.
- Commented-out JWT Bearer auth block in `Program.cs` (lines 107–136).
- `TestController.cs` — scaffold MVC controller (CRUD templates), never used.
- `WeatherForecastController.cs` — default dotnet template, never used.

### 6.4 Magic strings

Tool names, blend modes, and panel identifiers are plain string literals scattered across `illustration.component.ts` template bindings and methods. For example, `controlPanelActiveTool === 'balloon'`, `controlPanelActiveTool === 'live-text'`, `controlPanelActiveTool === 'fill'` appear in multiple places (lines 8131–8141). An enum or const object would prevent typos and enable refactoring.

### 6.5 Spec file bug

`illustration.component.spec.ts` (line 11) attempts to import `IllustrationComponent` via `imports: [IllustrationComponent]`, but the component has `standalone: false`. This test will fail to compile with a meaningful error and has never been run successfully.

---

## 7. Security

### 7.1 CRITICAL: AuthoringController fully anonymous

**File:** `Controllers/AuthoringController.cs`, line 8

```csharp
[AllowAnonymous]
[Route("api/authoring")]
[ApiController]
public class AuthoringController : ControllerBase
```

`POST /api/authoring` proxies directly to the Anthropic Claude API using a server-side API key. The endpoint:
- Requires no authentication
- Accepts arbitrary `maxTokens`, `messages`, and `tools` bodies
- Sets a 5-minute HTTP timeout
- Has no rate limiting

Any person who can reach the server can make unlimited calls to `claude-opus-4-8` at the owner's cost. Even a modest traffic spike or intentional abuse could result in a very large bill.

**Fix:** Add `[Authorize]` at the class level and optionally enforce a per-user rate limit. The two `[AllowAnonymous]` endpoints on `IllustrationController` (public view/bundle) show the correct pattern for intentionally public routes on an otherwise authorized controller.

### 7.2 HIGH: Three controllers missing [Authorize]

- `TeamController` — full team CRUD (create, read, update, delete teams)
- `TeamUserController` — full team-user CRUD
- `UserController` — GET user by email (user enumeration), POST create user

All three controllers have no class-level `[Authorize]` attribute and no per-action authorization. The absence of authentication means unauthenticated requests reach the service and database layers.

### 7.3 HIGH: Cookie `Secure` flag missing on login

`AuthController.cs`, lines 49–55 (login action):

```csharp
var accessTokenCookieOptions = new CookieOptions {
    HttpOnly = true,
    //Secure = true, // Set to true in production to use HTTPS
    SameSite = SameSiteMode.None,
    Expires = DateTime.UtcNow.AddMinutes(15)
};
```

`Secure = true` is commented out. `SameSiteMode.None` without `Secure = true` on the cookie means the browser may send the auth cookie over plain HTTP connections. The refresh token endpoint (line 99) correctly sets `Secure = true`; the login endpoint must match.

### 7.4 MEDIUM: Open user enumeration

`UserController` `GET /api/user/email?email=x@example.com` (line 24) returns `200 OK` with a user record or `404 Not Found`. With no auth, this is a complete user enumeration API. Adding `[Authorize]` (see 7.2) addresses this.

### 7.5 MEDIUM: Public token generation endpoint

`AuthController` `GET /api/auth/generate-token` (line 121) generates a JWT for the hardcoded username `"exampleuser"`. This appears to be a Swagger testing helper that was never removed. It has no `[Authorize]` annotation and is accessible to the public.

### 7.6 LOW: CORS restricted to localhost in policy but applied in production

`Program.cs` (lines 234–243): The CORS policy `AllowAngularApp` whitelists `http://localhost:44452` and `https://localhost:44452`. This policy is applied in both development and production blocks (line 259 and 274). In production, requests from the actual domain will fail CORS checks because the origin won't match `localhost`. The production origin(s) should be added to the CORS policy, or the policy should be environment-split more carefully.

### 7.7 LOW: Identity email confirmation disabled

`Program.cs` line 48: `options.SignIn.RequireConfirmedAccount = false`. Users can sign in with any email address without verifying they own it. This is acceptable in early development but should be revisited before production.

### 7.8 LOW: Lazy loading proxies and unauthenticated data access

With `UseLazyLoadingProxies()` enabled, any navigation property accessed on an entity from the unguarded controllers will silently issue additional queries to the database. Combined with the missing authorization, this means unauthenticated requests can trigger unrestricted database reads.

---

## 8. Missing Infrastructure

### 8.1 No global Angular error handler

Angular's `ErrorHandler` interface is not overridden. Uncaught exceptions in component lifecycle hooks, observables, and event handlers are swallowed by Angular's default handler (which only logs to the console). There is no mechanism to capture these errors and send them to Application Insights or any other monitoring service.

A global `ErrorHandler` plus an HTTP interceptor for API errors would give visibility into production failures without requiring every component to implement its own catch logic.

### 8.2 No client-side structured logging

The 123 `console.log/warn/error` calls across the app are development-time debugging that is not correlated, not indexed, and not retained. There is no client-side logging pipeline (e.g., Application Insights JavaScript SDK) connected to the Azure Application Insights resource that the backend already uses.

### 8.3 No Angular route guards applied

`AuthorizeGuard` is imported in `AppModule` but wired to zero routes. Every route — including `dashboard`, `illustration/:id`, `board/:id` — is accessible without authentication at the Angular router level. The backend enforces authentication on `IllustrationController` and `BoardController`, so data is protected server-side, but the Angular app will render the full editor shell for a non-authenticated user before the first API call fails. This creates a confusing UX and unnecessary resource loading.

### 8.4 Auto-migration on startup (production risk)

As noted in section 4.4, `dbContext.Database.Migrate()` runs on every application startup. In a hosted deployment, this runs on each new instance start during a rolling deploy. A migration that takes more than a few seconds, or that fails halfway through, can leave the database in a partially-migrated state while old instances continue serving requests.

---

## 9. Prioritised Work List

Items are ordered by impact. Severity and effort estimates are for a solo developer working with an AI collaborator.

---

### Priority 1 — Security (act before any public exposure)

| # | Finding | Severity | Effort | Files |
|---|---|---|---|---|
| S1 | Add `[Authorize]` to `AuthoringController` to prevent anonymous Anthropic API calls | **Critical** | Small | `Controllers/AuthoringController.cs` |
| S2 | Add `[Authorize]` to `TeamController`, `TeamUserController`, `UserController` | **High** | Small | Three controller files |
| S3 | Uncomment `Secure = true` on login access token cookie | **High** | Small | `Controllers/AuthController.cs`, lines 49–55 |
| S4 | Delete or protect `GET /api/auth/generate-token` | **Medium** | Small | `Controllers/AuthController.cs`, line 121 |

---

### Priority 2 — Angular architecture (stability and maintainability)

| # | Finding | Severity | Effort | Files |
|---|---|---|---|---|
| A1 | Wire `AuthorizeGuard` (or `canActivate` with `AuthService`) to protected routes in `AppModule` | **High** | Small | `src/app/app.module.ts` |
| A2 | Enable `strictTemplates: true` and fix resulting template errors | **High** | Medium | `tsconfig.json`, illustration and board templates |
| A3 | Introduce lazy-loaded feature modules (or standalone components with `loadComponent`) for the illustration route and board route | **High** | Large | `src/app/app.module.ts`, `IllustrationComponent`, `BoardComponent`, panel components |
| A4 | Fix broken `IllustrationComponent` spec (module vs standalone import mismatch) | **Medium** | Small | `src/app/illustrate/components/illustration/illustration.component.spec.ts` |
| A5 | Tighten bundle budgets: `maximumWarning: 3mb, maximumError: 5mb` (after lazy-splitting) | **Medium** | Small | `angular.json` |
| A6 | Enable TypeScript `strict: true` (implies `strictNullChecks`, `noImplicitAny`) — expect a large number of errors to surface | **Medium** | Large | `tsconfig.json` |

---

### Priority 3 — IllustrationComponent decomposition (long-term)

| # | Finding | Severity | Effort | Files |
|---|---|---|---|---|
| I1 | Extract a typed `SalsaAdapter` interface/service wrapping `ShapeManager` and `WorldManager` to eliminate 162+ `as any` casts | **High** | Medium | New service; `illustration.component.ts` throughout |
| I2 | Extract 3D scene state (selected mesh, transform mode, gizmo) into `Scene3dStateService` | **High** | Large | `illustration.component.ts`, lines 160–800+ |
| I3 | Extract tool config (fill, wand, dither, balloon, SDF text) into `ToolStateService` | **High** | Large | `illustration.component.ts` |
| I4 | Move `rasterStrokeSubscription` cleanup into `ngOnDestroy` (current leak) | **Medium** | Small | `illustration.component.ts`, line 350 / `ngOnDestroy` line 11675 |
| I5 | Replace `!` assertion subscriptions (`selectionChangedSubscription!`) with `takeUntilDestroyed` | **Medium** | Medium | `illustration.component.ts`, lines 326–327 |
| I6 | Replace tool-name magic strings with a typed enum (`ControlPanelTool`) | **Low** | Small | `illustration.component.ts`, `illustration.component.html` |

---

### Priority 4 — Testing

| # | Finding | Severity | Effort | Files |
|---|---|---|---|---|
| T1 | Write service-level unit tests for `RasterAnimationService` — pure state logic, no DOM dependency | **Medium** | Medium | `src/app/shared/services/raster/raster-animation.service.spec.ts` |
| T2 | Write tests for `IllustrationService` HTTP methods using `HttpClientTestingModule` | **Medium** | Medium | New spec file |
| T3 | Write tests for `LocalIllustrationService` using an in-memory IndexedDB mock (`fake-indexeddb`) | **Medium** | Medium | New spec file |
| T4 | Add a coverage threshold to `karma.conf.cjs` (e.g., `statements: 30`) to prevent regression | **Low** | Small | `karma.conf.cjs` |
| T5 | Write `AuthorizeGuard` unit test — mock `AuthorizeService.isAuthenticated()` returning false | **Low** | Small | `src/api-authorization/authorize.guard.spec.ts` |

---

### Priority 5 — Backend quality

| # | Finding | Severity | Effort | Files |
|---|---|---|---|---|
| B1 | Delete `TestController.cs` and `WeatherForecastController.cs` (scaffold dead code) | **Low** | Small | Both files |
| B2 | Replace `// Log the exception (ex)` comment stubs with actual `ILogger<T>` calls | **Medium** | Medium | `Controllers/UserController.cs`, service files |
| B3 | Move EF migrations out of app startup; run as a deployment step | **Medium** | Medium | `Program.cs` lines 248–252, CI/CD pipeline |
| B4 | Audit `UseLazyLoadingProxies()` usage — replace with explicit `Include()` in hot query paths | **Low** | Medium | `Program.cs` line 43, all service `GetAll*` methods |
| B5 | Register `BatchService` via an `IBatchService` interface for consistency | **Low** | Small | `Program.cs` line 176, new interface file |

---

### Priority 6 — Infrastructure & observability

| # | Finding | Severity | Effort | Files |
|---|---|---|---|---|
| O1 | Add a global Angular `ErrorHandler` that forwards uncaught errors to Application Insights (JS SDK) | **Medium** | Medium | New `GlobalErrorHandler` service, `AppModule` |
| O2 | Add an HTTP interceptor for API error responses (4xx/5xx) that shows a consistent toast and optionally logs | **Medium** | Small | `src/app/shared/interceptors/` |
| O3 | Add the Application Insights JavaScript SDK to the Angular app (currently only the backend has it) | **Medium** | Small | `src/index.html` or new service |
| O4 | Wire `AuthorizeGuard` guard to production CORS origin list | **Low** | Small | `Program.cs` CORS policy |
| O5 | Remove commented-out code blocks (old JWT auth block in Program.cs, old interceptor registration, thumbnail endpoints) | **Low** | Small | `Program.cs`, `AppModule`, `IllustrationController.cs` |
| O6 | Strip or guard `console.log` calls in production builds (esbuild `--drop:console` option or Angular `build-optimizer`) | **Low** | Small | `angular.json` production configuration |

---

*End of review.*
