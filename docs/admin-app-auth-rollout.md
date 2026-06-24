# Admin App Multi-User Auth & Permissions — Rollout Tracker

Goal: turn the `accounting_app` Android app from a single-user (owner) local app into a
multi-user app that store staff can log into with email + password, with permissions
enforced **server-side** (not just hidden in the UI).

Decisions (locked in 2026-06-24):
- **Enforcement:** real server-side enforcement. The phone must NOT hold master secrets.
- **Login:** email + password.
- **Permissions:** roles (Owner / Manager / Staff) + per-person overrides.
- **Management UI:** owner-only screen inside the Android app.

This doc is the single source of truth for what's done and what's left. Keep it updated as
phases land — the lock-down work in Phase 2 is the part most likely to be forgotten, and it
is the part that actually makes permissions real.

---

## Phase 0 — Backend auth + permission backbone (wolf den site)  — IN PROGRESS

New, separate user system from `consignors` and `shop_customer_accounts`.

- [x] Migration `023-add-admin-app-users.sql` (`admin_app_users`, `admin_app_user_permissions`, `admin_app_sessions`)
- [x] `src/lib/admin-app/permissions.js` — permission catalog, role defaults, effective-permission resolver
- [x] `src/lib/admin-app/users.js` — create / list / get / update / authenticate / set password
- [x] `src/lib/admin-app/session.js` — DB-backed, **revocable** session tokens
- [x] `src/lib/admin-app/auth.js` — request auth + `requirePermission` helper for route handlers
- [x] `src/lib/admin-app/throttle.js` — login brute-force throttle (reuses upstash, in-memory fallback)
- [x] API: `POST /api/admin-app/auth/login`, `POST /api/admin-app/auth/logout`, `GET /api/admin-app/auth/me`, `POST /api/admin-app/auth/change-password`
- [x] API: `GET/POST /api/admin-app/users`, `GET/PATCH/DELETE /api/admin-app/users/[id]` (owner-only)
- [ ] **Seed the first owner account** (run `node scripts/seed-admin-app-owner.js` after migrate)
- [ ] Run `npm run db:migrate` against the database
- [ ] Manual smoke test of login → me → users CRUD

## Phase 1 — Android: login, session, gating, staff management  — MOSTLY DONE

New `com.wolfdenledger.auth` package + `com.wolfdenledger.ui.auth` screens. Compiles &
assembles (`./gradlew assembleDebug`). Not yet installed to the phone — run `./gradlew installDebug`.

- [x] Login screen gating `LedgerApp` (via `AppShell` on `AuthState`)
- [x] `AuthRepository` + `SessionStore`: token in **EncryptedSharedPreferences** (`androidx.security:security-crypto`)
- [x] Cache effective permissions; gate drawer items + `NavHost` start destination by permission
- [x] 401 → drop session (auth/staff clients + `bootstrap`); change-password-on-first-login flow (`must_change_password`)
- [x] Owner-only **Staff** screen (add / edit role / toggle per-person perms / deactivate / reset pw)
- [x] **Swapped consignment/mystery/events clients + endpoints from `ADMIN_API_KEY` to the session token.**
      Server: new `requireAdminAccess(request, permissionKey, logger)` in `src/lib/admin/admin-auth.js` accepts a
      staff session (checks `consignors.manage` / `events.manage` / `mystery.manage`) and falls back to the legacy
      `ADMIN_API_KEY` for older app builds; applied across all 19 `/api/admin/{consignors,events,mystery-bags}` routes.
      Android: the three clients now take `tokenProvider` + `onUnauthorized`, send the session token (no more
      `x-admin-key`), and drop the session on 401. The app no longer sends `ADMIN_API_KEY` at all (the
      `BuildConfig.ADMIN_API_KEY` field is now dead and can be removed once the legacy fallback is retired).
- [ ] (defense-in-depth, optional) gate individual `NavHost` route *content*, not just the drawer

### Phase 1 files (Android)
- `auth/Permissions.kt` (catalog mirror), `AuthModels.kt`, `SessionStore.kt`, `AuthApiClient.kt`,
  `AuthRepository.kt`, `StaffApiClient.kt`
- `ui/auth/AppShell.kt`, `LoginScreen.kt`, `ChangePasswordScreen.kt`, `StaffManagementScreen.kt`
- edits: `MainActivity.kt` (build `AuthRepository`/`StaffApiClient`, render `AppShell`),
  `ui/LedgerApp.kt` (permission-filtered drawer, Staff item, Sign out, staff route, permitted start),
  `app/build.gradle.kts` (security-crypto dep)

## Phase 2 — Lock down the direct integrations (THE REAL TEETH)  — IN PROGRESS

Approach (chosen): **scoped pass-through proxy**. Backend route `/api/admin-app/proxy/<svc>/[...path]`
holds the secret, checks staff session + an allowlisted path→permission rule (`src/lib/admin-app/proxy.js`),
then forwards. Android side: `UpstreamProxyInterceptor` rewrites any request to those hosts → the proxy and
swaps in the session token. ⚠️ Anything NOT yet proxied still has its secret in the APK.

⚠️⚠️ **NONE of the Android Phase-2 changes are behavior-tested** — they compile (`assembleDebug`) but have
not been run on the phone. Must `./gradlew installDebug` and exercise scan / labels / banking before trusting.

- [x] **Square** proxy — backend route + interceptor wired; `SQUARE_ACCESS_TOKEN` removed from the APK.
      Square service uses one injected client, so all its calls route through the proxy.
- [x] **OpenAI** proxy — backend route + Android wiring DONE. The shared proxied `OkHttpClient` is threaded
      through `OpenAiEntryInterpreter`, `AiRealizedCogsService`, `TcgPlayerResearchService`,
      `TcgCsvCatalogSyncService`, and `AiChatOrchestrator` (via the ViewModel factory); the resolver inherits
      its parent's client at both internal construction sites. AI services now take a `"proxied"` placeholder
      key. `OPENAI_API_KEY` removed from the APK. (The 3 `OpenAiProduct*` classes are dead code — unreferenced.)
- [x] **Plaid** proxy — backend route + interceptor wired; `PLAID_CLIENT_ID`/`PLAID_SECRET` removed from APK.
- [x] **Verified** the built debug `BuildConfig` has empty `SQUARE_ACCESS_TOKEN` / `OPENAI_API_KEY` /
      `PLAID_CLIENT_ID` / `PLAID_SECRET`. `SQUARE_APPLICATION_ID` (public) remains.
- [ ] **Retire `ADMIN_API_KEY` (still a real secret in the APK).** It's no longer sent for auth, but: (a) ~7
      `BuildConfig.ADMIN_API_KEY.isBlank()` feature gates in `LedgerViewModel` still read it, and (b) the server
      `requireAdminAccess` legacy fallback still accepts it for old builds. Migrate the gates to session/permission
      checks, retire the server fallback once all phones are updated, then blank it in `build.gradle.kts`.
- [DEFERRED] **Google Sheets / ledger — owner-only for now (decided 2026-06-24).** No proxy built; ledger
      features keep using the on-device Google account. Implication: a Manager has `ledger.*`/`cash.view` by
      role default, but only a device signed into the owner's Google account actually has the sheet — so
      ledger/cash/COGS/reports remain effectively owner-only until a Sheets proxy is built. Fine for now;
      revisit (service account or owner refresh-token proxy) when staff need ledger access.
- [ ] Confirm a fresh APK contains NO secrets at all (after `ADMIN_API_KEY` retired).

### Backend env vars to add on Vercel for the proxies
`SQUARE_ACCESS_TOKEN` already set. **Add:** `OPENAI_API_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`,
`PLAID_ENV` (default `production`). See `.env.example`.

### Phase 2 files
- backend: `src/lib/admin-app/proxy.js`, `src/app/api/admin-app/proxy/{square,openai,plaid}/[...path]/route.js`
- android: `auth/UpstreamProxyInterceptor.kt`; edits to `MainActivity.kt` (shared proxied client),
  `square/SquareTransactionsService` + `plaid/PlaidTransactionsService` (placeholder secret + injected client via ctor),
  `app/build.gradle.kts` (stopped baking Square/Plaid secrets)

---

## Permission catalog (Phase 0 starting cut — refine freely)

| Key                 | Feature area                          | Owner | Manager | Staff |
|---------------------|---------------------------------------|:-----:|:-------:|:-----:|
| `ledger.view`       | View ledger, cash, invested           |  ✓    |   ✓     |       |
| `ledger.edit`       | Add/edit/delete ledger entries        |  ✓    |   ✓     |       |
| `cash.view`         | Cash on hand / invested               |  ✓    |   ✓     |       |
| `trades.view`       | Trade ledger                          |  ✓    |   ✓     |       |
| `trades.edit`       | Record trade-ins / payouts            |  ✓    |   ✓     |       |
| `cogs.view`         | Realized COGS / margins               |  ✓    |   ✓     |       |
| `cogs.edit`         | COGS entry                            |  ✓    |   ✓     |       |
| `inventory.scan`    | Scan card → Square upsert             |  ✓    |   ✓     |  ✓    |
| `labels.print`      | Print Square labels                   |  ✓    |   ✓     |  ✓    |
| `mystery.manage`    | Mystery pack admin                    |  ✓    |   ✓     |       |
| `mystery.report`    | Mystery pack sold report              |  ✓    |   ✓     |  ✓    |
| `events.manage`     | Event signups                         |  ✓    |   ✓     |       |
| `consignors.manage` | Consignor list / payouts              |  ✓    |   ✓     |       |
| `reports.view`      | Business reports                      |  ✓    |   ✓     |       |
| `banking.view`      | Plaid bank transactions               |  ✓    |   ✓     |       |
| `ai.use`            | AI chat / research                    |  ✓    |   ✓     |       |
| `remediations.run`  | Data-integrity fixes                  |  ✓    |         |       |
| `staff.manage`      | Manage staff accounts (this system)   |  ✓    |         |       |

Owner always has every permission regardless of overrides.
