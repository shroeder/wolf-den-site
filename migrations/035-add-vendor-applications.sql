-- Vendor onboarding applications. A prospective vendor fills out the public /marketplace/apply
-- form; Luke reviews + approves/rejects from the web admin portal. Approving creates an mkt_vendor
-- and fires the invite-accept flow. See docs/marketplace-plan.md (Phase 2).

CREATE TABLE IF NOT EXISTS mkt_vendor_application (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    city TEXT,
    region TEXT,                                  -- state / province
    location_label TEXT,                          -- display string, e.g. "Sacramento, CA"
    sells TEXT,                                   -- what they sell (free text)
    links TEXT,                                   -- Facebook / store / other links
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',       -- pending | approved | rejected
    reviewed_at TIMESTAMPTZ,
    vendor_id UUID REFERENCES mkt_vendor(id) ON DELETE SET NULL,  -- set when approved
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_application_status ON mkt_vendor_application (status);
CREATE INDEX IF NOT EXISTS idx_mkt_application_created ON mkt_vendor_application (created_at DESC);
