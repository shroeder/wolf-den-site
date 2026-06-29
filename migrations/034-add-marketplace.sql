-- Vendor marketplace. Hand-vetted vendors (sealed + singles) list inventory; open/free buyers
-- browse by location and contact a vendor by email to arrange an in-person deal. No payments or
-- messaging on-platform. Deliberately self-contained (`mkt_` prefix) and NOT tied to the
-- `stores` SaaS tenancy, so the module stays liftable to its own domain later.
-- Listings reference `tcg_cards(id)` (the TCGplayer product id) when matched, but also snapshot
-- their own display fields so a listing survives catalog churn / unmatched imports.
-- See docs/marketplace-plan.md.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

BEGIN;

-- A vetted vendor. Also IS the vendor's login account: invited by Luke, self-signs-up from the
-- emailed link (sets password), then uploads inventory. Only the token HASH is stored.
CREATE TABLE IF NOT EXISTS mkt_vendor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,            -- shown to buyers
    password_hash TEXT,                    -- null until the invite is accepted
    status TEXT NOT NULL DEFAULT 'invited',-- invited | active | suspended | removed

    -- Location (captured at onboarding) so buyers can browse "near me".
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    region TEXT,                           -- state / province
    postal_code TEXT,
    country TEXT NOT NULL DEFAULT 'US',
    location_label TEXT,                   -- display string, e.g. "Sacramento, CA"
    latitude NUMERIC(9, 6),                -- nullable; geocoded later for distance
    longitude NUMERIC(9, 6),

    -- Invite / onboarding.
    invite_token_hash TEXT UNIQUE,         -- sha256 of the emailed invite token
    invite_expires_at TIMESTAMPTZ,
    invited_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_vendor_email ON mkt_vendor (email_normalized);
CREATE INDEX IF NOT EXISTS idx_mkt_vendor_status ON mkt_vendor (status);
CREATE INDEX IF NOT EXISTS idx_mkt_vendor_region ON mkt_vendor (region);

-- DB-backed, revocable vendor sessions (mirrors admin_app_sessions). Raw token never stored.
CREATE TABLE IF NOT EXISTS mkt_vendor_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_label TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_vendor_session_vendor ON mkt_vendor_session (vendor_id);
CREATE INDEX IF NOT EXISTS idx_mkt_vendor_session_token ON mkt_vendor_session (token_hash);

-- One thing a vendor has for sale. Vendor sets the price (platform never computes value).
-- catalog_product_id links to tcg_cards when matched; display fields are snapshotted regardless.
CREATE TABLE IF NOT EXISTS mkt_listing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,                    -- sealed | single
    catalog_product_id BIGINT REFERENCES tcg_cards(id) ON DELETE SET NULL,
    game TEXT,                             -- pokemon | magic (denormalized for filtering)

    -- Snapshot display data (independent of catalog row).
    title TEXT NOT NULL,                   -- e.g. "Prismatic Evolutions Booster Box"
    set_name TEXT,
    card_number TEXT,                      -- singles
    image_url TEXT,
    condition TEXT,                        -- singles only: NM | LP | MP | HP | DMG (null for sealed)

    price NUMERIC(12, 2) NOT NULL,         -- vendor's asking price
    quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active', -- active | deleted

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mkt_listing_kind_chk CHECK (kind IN ('sealed', 'single')),
    CONSTRAINT mkt_listing_price_chk CHECK (price >= 0),
    CONSTRAINT mkt_listing_qty_chk CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_mkt_listing_vendor ON mkt_listing (vendor_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listing_catalog ON mkt_listing (catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listing_game_kind ON mkt_listing (game, kind);
CREATE INDEX IF NOT EXISTS idx_mkt_listing_status ON mkt_listing (status);
CREATE INDEX IF NOT EXISTS idx_mkt_listing_title_trgm ON mkt_listing USING GIN (lower(title) gin_trgm_ops);

-- Log of buyer -> vendor contact emails. Kept even if the listing is later deleted.
CREATE TABLE IF NOT EXISTS mkt_contact_request (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID REFERENCES mkt_listing(id) ON DELETE SET NULL,
    vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,
    buyer_name TEXT,
    buyer_email TEXT NOT NULL,
    message TEXT,
    sent_at TIMESTAMPTZ,                   -- set when the Resend email actually went out
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_contact_vendor ON mkt_contact_request (vendor_id);
CREATE INDEX IF NOT EXISTS idx_mkt_contact_listing ON mkt_contact_request (listing_id);
CREATE INDEX IF NOT EXISTS idx_mkt_contact_created ON mkt_contact_request (created_at);

COMMIT;
