# Vendor Marketplace — Plan & Rollout Tracker

> **Status (2026-06-29): LIVE & PUBLIC.** Phases 0–3 built, deployed, and verified on prod.
> Linked from the main site nav ("Marketplace") + in the sitemap; buyer pages public, admin/
> portal/onboard gated + noindex. Demo vendor (Capital City Cards) kept live as a placeholder
> until real vendors are onboarded. This doc is the single source of truth — keep it updated.

## The concept

A curated marketplace connecting card-show **vendors** (sealed product + singles) with **buyers**.
Vendors are hand-vetted by Luke and onboarded by invite; buyers are open and free. Buyers browse
all vendors' inventory in one searchable place, see who's nearby, and contact a vendor by email to
arrange an in-person deal. **No payments or messaging on-platform** — the platform is discovery +
introduction; the deal is settled off-platform, the way Luke already does over Facebook today.

Why this is mostly assembly, not a new build: the wolf den site already has the DB (Neon),
auth (`shop-auth-*`, `admin-app-users`), email (Resend), the TCG catalog/resolver
(`tcg-catalog`, `tcg-stock`), and a multi-tenant concept (`store-tenancy`, migrations 027/028).

## It's two things

1. **The marketplace** — its own web portal (its own product/identity; same repo, own route group,
   liftable to its own domain later). Vendor inventory + public browse/search + contact.
2. **Connectors** — integration hooks that surface marketplace inventory inside existing surfaces.
   First connector: **wolf den store search** (search "Prismatic Evolutions" on the store site →
   also see marketplace vendor inventory). Later: **email**.

> Keeping it in **one repo + one DB** is what makes connectors nearly free: the store site reads the
> `mkt_` tables directly instead of calling a cross-service API. This is the reason NOT to split it
> into a separate repo for now.

## Decisions (locked 2026-06-29)

- **Vendors = gated side.** Luke vets them, sends an emailed onboarding invite link; they self-sign-up
  from that link, enter a **physical address** (for buyer location/distance), and upload inventory.
- **Admin control.** Luke can see every vendor + their inventory and remove a vendor. Web admin first;
  phone admin (via the existing admin app) later.
- **Buyers = open & free.** No accounts, no barrier. Website first; free buyer **phone app** later.
- **Geography matters.** Vendor address captured at onboarding; buyers browse/filter by location
  ("near me", state/metro granularity is enough to start).
- **Catalog = sealed + singles** from day one. Vendor sets the price on every listing, so the platform
  never computes value — this sidesteps the open per-condition pricing problem entirely.
- **Entry differs by kind:** sealed = pick from a controlled list (seeded from `tcg_catalog`) + qty +
  price; singles = CSV import (TCGplayer export format) matched to the catalog via the resolver.
- **Contact = email** via Resend. Button → email to vendor with listing context + buyer reply-to →
  logged. Reuse `request-security.js` / throttle so it isn't a spam vector.
- **Freshness = manual delete** by vendor in v1. (See Parked.)

## Placement / conventions

- Public portal routes: `src/app/(market)/…`
- Vendor portal routes (auth'd): under `(portal)` or `(market)/vendor/…`
- API: `src/app/api/marketplace/…`
- Logic: `src/lib/marketplace/…`
- Tables: all prefixed `mkt_`
- Migrations: next number is `034-add-marketplace.sql` (auto-runs on deploy)

## Data model (v1)

- `mkt_vendor` — name, contact_email, **address** (+ lat/lng or geocoded region), status
  (`invited`/`active`/`removed`), invite token, created/updated
- `mkt_listing` — vendor_id, kind (`sealed`|`single`), `tcg_catalog` ref, set/number, condition
  (singles only), **price** (vendor-set), quantity, status (`active`/`deleted`), created/updated
- `mkt_contact_request` — listing_id, vendor_id, buyer name/email, message, created (logs each send)
- (auth reuses existing patterns; vendor login is a thin layer over `shop-auth-*` / `admin-app` style)

## Phases

### Phase 0 — Schema + seed  — IN PROGRESS
- [x] Migration `034-add-marketplace.sql` (`mkt_vendor`, `mkt_vendor_session`, `mkt_listing`, `mkt_contact_request`)
- [x] `src/lib/marketplace/vendors.js` — create / invite / accept / authenticate / status + queries
- [x] `src/lib/marketplace/listings.js` — create / update / soft-delete / vendor list / public search
- [x] `scripts/seed-marketplace.js` — one real vendor + a few **sealed** listings (best-effort catalog match)
- [ ] Deploy so migration 034 runs on Vercel, then run the seed script against the DB

### Phase 1 — Public browse + contact (prove the loop)  — IN PROGRESS

Search is **catalog-centric**: query `tcg_cards` (daily tcgcsv source of truth) restricted to
products in stock among active vendors; the product page shows every vendor's offer. Two buyer
modes: **search** (typeahead) and **browse** (vendors by location, map-centric).

Backend (done):
- [x] `src/lib/marketplace/search.js` — `autocompleteInStock`, `searchCatalogInStock`,
      `getProductWithOffers`, `listVendorsForBrowse`
- [x] `src/lib/marketplace/email.js` — vendor contact email via Resend (reply-to = buyer)
- [x] `src/lib/marketplace/contact.js` — log `mkt_contact_request` + send (persist-before-send)
- [x] API: `GET /api/marketplace/autocomplete`, `GET /api/marketplace/search`, `POST /api/marketplace/contact`

UI (lives under `(public)/marketplace/…` for now so it inherits site nav/footer; liftable later):
- [x] `marketplace/page.js` + `MarketplaceSearchClient` — search mode (in-stock only, game/kind filters)
- [x] `marketplace/product/[id]/page.js` + `MarketplaceOffers` — item + vendor offers (cheapest first) + inline contact form
- [x] `marketplace/vendors` + `MarketplaceBrowseClient` — browse mode: **Leaflet + OpenStreetMap** map
      (plain Leaflet, vector markers, no API key) + vendor list + "find near me" (browser geolocation)
- [x] `marketplace/vendor/[id]` — vendor storefront (their active listings, linking to product pages)
- [x] `leaflet` dependency added; `mkt-*` CSS in globals.css; `npm run build` passes
- [x] **Verified live against prod data** (seed + queries): search, offers, contact, map marker all working
- Note: real vendor geocoding (address → lat/lng) moves to Phase 2 onboarding; seed uses fixed coords.

### Phase 2 — Vendor applications + web admin portal  — BUILT (untested on prod until deploy)

Decided 2026-06-29: vendors apply via a public form; Luke approves from a **hidden web admin
portal** (so he can do vendor admin from the website when his phone app build is stale, not just
from the Android app). **Admin login reuses the existing `admin_app_users` owner account** — same
email+password as the phone app, one identity across phone + web.

- [x] Migration `035`: `mkt_vendor_application` (business/contact/email/phone/location, sells, links, notes, status)
- [x] Public `/marketplace/apply` form + `MarketplaceApplyClient` → insert application + best-effort email Luke
- [x] Added `marketplace.manage` permission to the admin-app catalog (owner gets it free)
- [x] **Web session layer** (`admin-app/web-session.js`): httpOnly-cookie wrapper over the existing
      (bearer) `admin_app_sessions` — same revocable token system, browser-friendly. Login/logout routes.
- [x] `/marketplace/admin` (cookie-gated by `marketplace.manage`): review applications → **Approve**
      (creates `mkt_vendor` + `createVendorInvite` + emails the accept link, also shows it inline) / **Reject**
- [x] Admin: list all vendors + status badges; suspend / reactivate / remove; link to inventory
- [x] Lint + `npm run build` pass
- Optional: set `MARKETPLACE_ADMIN_EMAIL` in Vercel env to get application-notification emails.
- Note: the invite **accept page** (`/marketplace/onboard?token=`) the emails link to is Phase 3.

### Phase 3 — Vendor self-onboard + inventory upload  — DONE
- [x] `/marketplace/onboard?token=` + `MarketplaceOnboardClient` → `acceptVendorInvite` (set password +
      address), geocode address → lat/lng via Nominatim (`geocode.js`), auto-login to portal
- [x] Vendor web session (`vendor-session.js`): cookie over `mkt_vendor_session`; login/logout routes
- [x] `/marketplace/portal` + `VendorLoginClient` + `VendorPortalClient`: add / edit price+qty / delete listings
- [x] Sealed + singles: catalog typeahead picker (`searchCatalog` + `/vendor/catalog-search`); condition for singles
- [x] **Singles CSV import** (`csv-import.js` + `VendorImportClient`): TCGplayer export → match by
      TCGplayer Id (= `tcg_cards.id`) → preview (catalog / snapshot / skip-with-reason) → bulk create.
      `/vendor/import/preview` + `/vendor/import/commit`. Verified against prod data.
- [x] Lint + `npm run build` pass (no new migration — reuses existing tables)

### Phase 4 — Connectors  — IN PROGRESS
- [x] Store-search connector: shop search (`ShopInventoryClient`) debounce-fetches
      `/api/marketplace/search`; renders an "Also available from local vendors" outlet section
      BELOW our own results. Our stock is always primary; the outlet hides any product we already
      stock (dedup by scanned-single `TCG-<id>` SKU vs catalog id), so it only fills gaps.
- [ ] Email connector (TBD shape)

### Later / Parked
- [ ] Buyer phone app (free)
- [ ] Phone admin for vendor management (existing admin app)
- [ ] Freshness automation: Square inventory sync for vendors on Square; "still available?" ping
      reminders. Blocked on not having on-platform messaging — premised on manual vendor action for now.
- [ ] Vendor-uploaded photos (matters most for single-card condition)
- [ ] **Sold / transaction tracking → monetization.** No `sold`/pending state in v1 (vendors just
      delete). Later, capturing what actually sells is the likely path to monetizing the app — design
      the sold-state + transaction record then, not now.

## Phase 5+ — "Local inventory search engine" (planned 2026-06-30)

Reframe: this is a **local inventory search engine for collectibles**, not just a vendor list. The
flywheel: more vendors → more inventory → more Google traffic → more buyers → more sales → more
vendors. Supply is the real bottleneck — features help, but Luke seeds real vendors (his FB contacts).

### Phase 5 — Demand engine — DONE
- [x] `mkt_want` (migration 037): buyer "notify me when an approved vendor lists this product".
- [x] Buyer capture: "Notify me" on zero-offer product pages + on search dead-ends (public
      `/api/marketplace/catalog-search` finds the product even when nobody stocks it).
- [x] Edge-triggered email when a vendor lists a wanted product (hook in `createListing`; covers
      single-add + CSV import). `sendWantAvailableEmail`.
- [x] Vendor **"most wanted" board** in the portal (`listMostWanted` — demand counts = shopping list).

### Phase 6 — Vendor reputation (objective only) — DONE
- [x] Storefront trust strip: ✓ Verified vendor · member since · # active listings · updated X ago
      (`getVendorStorefront` returns verified/memberSince/listingCount/lastListedAt). Offers link the
      checkmarked vendor name to their storefront.
- Deferred (need data we don't capture): completed sales, avg response time — unlock with Phase 7.

### Phase 7 — Sold tracking — DONE
- [x] `mkt_sale` snapshot table (migration 038); `markListingSold` (tx: listing → status='sold' +
      mkt_sale row); `POST /api/marketplace/vendor/listings/[id]/sold`.
- [x] Vendor portal "Mark sold" button per listing; vendor sees own completed-sales tally in hero.
- [x] Completed-sales count added to storefront trust strip (`getVendorStorefront.salesCount`).
- First real transaction data captured → seeds the sales-data monetization idea (revisit for pricing).

### Vendor lead funnel (contact → sale) — DONE
- Closes the loop on buyer contact: a request now moves new → responded → sold/closed.
- [x] Migration 039: `mkt_contact_request` gains status/responded_at/updated_at; `mkt_sale` gains
      `contact_request_id` (attributes a sale back to the lead).
- [x] `contact.js`: `listVendorContactRequests`, `getVendorRequestStats`, `setContactRequestStatus`
      (marking 'sold' runs `markListingSold` with attribution). `GET /requests`, `PATCH /requests/[id]`.
- [x] Portal "Inbound requests" panel (Mark replied / sold / closed; sold/closed collapse to history);
      hero shows "N leads (M sold)".
- [x] Storefront trust strip gains close-rate + typical-response-time — COMPUTED always, RENDERED only
      at ≥3 leads so a brand-new vendor never shows "0%". Unlocks the Phase 6 deferred signals.
- Comms decision (deliberate): NO in-app messaging at this stage — email relay stays the channel; the
  physical "meet at The Wolf Den" close is the moat. Revisit messaging only at real deal-flow volume.
- Follow-up (not built): mirror new leads to a channel Luke watches (Discord/phone) for fast response.

### Local positioning (ongoing, copy/SEO)
- Lean on the in-person angle ("search local vendors, inspect in person, meet at The Wolf Den");
  target local product searches; builds on the shop SEO work (product pages + sitemap + feed).

## Catalog coverage (tcgcsv sync)

The daily `tcg-catalog-sync` cron was Pokémon + Magic only. Widened 2026-06-29 to **all ~56 TCG/CCG
categories** tcgcsv carries (non-card categories — supplies, Funko, miniatures, Warhammer, comics —
excluded) via the registry: **`src/lib/tcg-games.js`** (`TCG_GAMES` = categoryId + slug + label).
It's the single source of truth — the sync (`catalog-sync.js` `discoverGroups`) selects categories
from it, and the game filters (marketplace search, vendor portal) render from it via
`GET /api/marketplace/games` (`listAvailableGames` = distinct games present in `tcg_sets`). Add/remove
a row in `TCG_GAMES` to change coverage. Current 12: magic, pokemon, yugioh, lorcana, one-piece,
flesh-and-blood, digimon, star-wars-unlimited, dragon-ball-fusion, gundam, union-arena, riftbound.

New games are discovered when the ingest queue rebuilds — either when tcgcsv publishes a new daily
snapshot, or by resetting `tcg_ingest_state.source_last_updated`. Initial seed of the added games
spans a few daily cron runs. Looking For (`LookingForClient`) still hardcodes pokemon/magic toggles —
extend it to the registry later if desired.

## Open questions / risks

- **Public wholesale pricing.** Buyers are open, so vendors' ~80%-of-market asks are publicly visible,
  which could undercut their own card-show retail. Vendors may resist. Watch this with the first few
  vendors; mitigations if it bites: gate prices behind contact, or per-vendor "hide price" option.
- **Stale listings** without messaging/auto-sync — the classic marketplace trust killer. v1 leans
  entirely on vendor discipline (manual delete). Revisit if it erodes buyer trust.
- **Singles CSV variance** — vendors may export from different tools/formats; resolver match rate and a
  manual review/fix step will need attention.
