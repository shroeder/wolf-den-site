# Vendor Marketplace — Plan & Rollout Tracker

> **Status (2026-06-29): planning.** No code yet. This doc is the single source of truth for
> scope, decisions, and phases. Keep it updated as phases land.

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

### Phase 2 — Vendor applications + web admin portal  — NOT STARTED

Decided 2026-06-29: vendors apply via a public form; Luke approves from a **hidden web admin
portal** (so he can do vendor admin from the website when his phone app build is stale, not just
from the Android app). **Admin login reuses the existing `admin_app_users` owner account** — same
email+password as the phone app, one identity across phone + web.

- [ ] Migration `035`: `mkt_vendor_application` (business/contact/email/phone/location, what they
      sell, links e.g. Facebook, notes, status invited/approved/rejected)
- [ ] Public `/marketplace/apply` form → insert application + email Luke (Resend)
- [ ] Add `marketplace.manage` permission to the admin-app permission catalog (owner gets it free)
- [ ] **Web session layer**: thin httpOnly-cookie wrapper over the existing (bearer) `admin_app_sessions`
      so the same revocable token system works in a browser. Web login page → cookie.
- [ ] `/marketplace/admin` (login-gated): review applications → **Approve** (creates `mkt_vendor` +
      `createVendorInvite` → emails the accept-invite link already built) / **Reject**
- [ ] Admin: list all vendors + their inventory; suspend/remove; resend invite

### Phase 3 — Vendor self-onboard + inventory upload  — NOT STARTED
- [ ] Emailed invite link → `acceptVendorInvite` (set password + address; geocode address → lat/lng via Nominatim)
- [ ] Vendor portal (`mkt_vendor_session` login): add/edit/delete listings
- [ ] Sealed: pick from controlled catalog list + qty + price
- [ ] Singles: CSV import (TCGplayer export) → resolver match → review/confirm → create listings

### Phase 4 — Connectors  — NOT STARTED
- [ ] Store-search connector: wolf den store search also surfaces `mkt_` listings
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

## Open questions / risks

- **Public wholesale pricing.** Buyers are open, so vendors' ~80%-of-market asks are publicly visible,
  which could undercut their own card-show retail. Vendors may resist. Watch this with the first few
  vendors; mitigations if it bites: gate prices behind contact, or per-vendor "hide price" option.
- **Stale listings** without messaging/auto-sync — the classic marketplace trust killer. v1 leans
  entirely on vendor discipline (manual delete). Revisit if it erodes buyer trust.
- **Singles CSV variance** — vendors may export from different tools/formats; resolver match rate and a
  manual review/fix step will need attention.
