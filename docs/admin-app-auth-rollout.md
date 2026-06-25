# Admin App Multi-User Auth & Permissions — Rollout Tracker

> **2026-06-24 update — Multi-tenant SaaS pivot is BUILT (untested on device).** The app is now
> a multi-tenant product: owners self-sign-up in-app (creating their store), and each store
> connects its own Square/Plaid. Migrations 027/028 + `src/lib/admin-app/{crypto,integrations,
> square-oauth,store-status}.js`, `/api/admin-app/signup`, `/api/admin-app/integrations/**`, and
> Android `CreateStoreScreen`/`StoreIntegrationsScreen`/`IntegrationsApiClient`. Compiles + the
> site `npm run build` passes. See the **Multi-tenant SaaS** section at the bottom for the new
> env vars + the Square OAuth app you must register.

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

---

# Multi-tenant SaaS pivot (built 2026-06-24)

Turns the admin app into a product resold to other game stores. Decisions: **global-unique email**
(login stays email+password), **admin app only** (public storefront stays the flagship), **all phases
built in one push**, per-tenant **Square OAuth** + **Plaid item token** (encrypted in DB), OpenAI stays
a global vendor key, flagship keeps working via env fallback.

### What was built
- **A — Tenancy:** `migrations/027-add-store-tenancy.sql` (`stores` table; `store_id` on
  `admin_app_users` + `admin_app_sessions`; flagship `wolf-den` backfill). `db.tx()` helper.
  `users.js`/`session.js` + login/users routes scoped by `store_id`. Seed script assigns flagship store.
- **B — Per-tenant creds:** `migrations/028-add-store-integrations.sql`; `crypto.js` (AES-256-GCM,
  `INTEGRATION_ENCRYPTION_KEY`); `integrations.js`; `proxy.js` `applyAuth` is async and resolves the
  store's Square/Plaid creds (env fallback for flagship Square).
- **C — Square OAuth:** `square-oauth.js` + `/api/admin-app/integrations/square/{connect,callback,status}`
  (HMAC-signed state, code exchange, location fetch, refresh).
- **D — Plaid per-store:** `/api/admin-app/integrations/plaid/{link-token,exchange,status}`; token stored
  server-side; proxy injects it.
- **E — Self-signup:** `/api/admin-app/signup` (atomic store+owner+session, 14-day trial, IP throttle);
  `store-status.js` (trial gate STUB — always allows for now); `/auth/me` returns `store`.
- **Android:** `auth/IntegrationsApiClient.kt`; `ui/auth/CreateStoreScreen.kt` +
  `StoreIntegrationsScreen.kt`; signup in `AuthRepository`/`AuthApiClient`; `AppShell`/`LoginScreen`
  "Create your store" path; Plaid link/exchange moved to the integrations endpoints (`markConnected()`
  marker; real token server-side). Drawer gains owner-only "Store & Integrations".

### YOU must do (before it's usable)
- **Register ONE Square OAuth app** (Square Developer dashboard, production): redirect
  `https://wolfdengamingmn.com/api/admin-app/integrations/square/callback`; scopes: merchant profile read,
  items R/W, inventory R/W, orders read, payments read, gift cards read.
- **Add Vercel env vars:** `INTEGRATION_ENCRYPTION_KEY` (32 bytes hex/base64 — **back it up; losing it
  orphans all stored creds**), `SQUARE_OAUTH_CLIENT_ID`, `SQUARE_OAUTH_CLIENT_SECRET`,
  `SQUARE_OAUTH_REDIRECT_URL`. Keep `PLAID_*`, `OPENAI_API_KEY` (vendor-global), `SQUARE_ACCESS_TOKEN`
  (flagship fallback).
- **Deploy** (runs migrations 027/028). The flagship store + your existing owner are backfilled.

### Remaining / deferred
- Trial/subscription **enforcement** is stubbed (`assertStoreActive` always allows) — flip on with billing later.
- Square **multi-location** merchants: MVP auto-picks the first active location.
- OAuth **state** is TTL+HMAC bound but not single-use (replay mitigated by Square's one-time code).
- Encryption-key **rotation** has no story yet.
- Plaid **disconnect** clears the local marker only (server row remains) — add a server disconnect later.
- **None of the Android multi-tenant flows are device-tested** — sign up a store, connect Square + bank, run a scan/banking fetch on the phone.
