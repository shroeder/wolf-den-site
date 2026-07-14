-- First-class user profiles: name, a unique public @handle (alias), and an avatar. Plus a curated
-- badge system (admin-assigned) so the owner/staff can be marked. Levels/XP come in a later phase.

ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS alias TEXT;             -- display form of the handle
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS alias_normalized TEXT;  -- lowercased, for uniqueness
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- One handle per user. Partial index so accounts without a handle yet don't collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_buyer_alias
    ON mkt_buyer (alias_normalized)
    WHERE alias_normalized IS NOT NULL;

-- Badge definitions (reserved / admin-assigned for now: owner, site admin, staff).
CREATE TABLE IF NOT EXISTS mkt_badge (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    icon TEXT,                                  -- emoji marker
    color TEXT,                                 -- hex for the pill background
    admin_only BOOLEAN NOT NULL DEFAULT TRUE,   -- TRUE = only the site admin can grant it
    sort_order INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which users hold which badges.
CREATE TABLE IF NOT EXISTS mkt_user_badge (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    badge_slug TEXT NOT NULL REFERENCES mkt_badge(slug) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, badge_slug)
);
CREATE INDEX IF NOT EXISTS idx_mkt_user_badge_buyer ON mkt_user_badge (buyer_id);

INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, sort_order) VALUES
    ('owner',      'Wolf Den Owner',     'Owner of The Wolf Den',                  '🐺', '#c8a24a', TRUE, 1),
    ('site_admin', 'Site Administrator', 'Runs the Wolf Den site & marketplace',   '🛡️', '#4a90d9', TRUE, 2),
    ('staff',      'Wolf Den Staff',     'Wolf Den team member',                   '⭐', '#7a5cff', TRUE, 3)
ON CONFLICT (slug) DO NOTHING;

-- Auto-award the owner + site-admin badges to the account behind The Wolf Den storefront (Luke), so the
-- feature is visibly live from day one. Matches the house-vendor convention used elsewhere.
INSERT INTO mkt_user_badge (buyer_id, badge_slug)
SELECT v.account_id, b.slug
FROM mkt_vendor v
CROSS JOIN (VALUES ('owner'), ('site_admin')) AS b(slug)
WHERE v.display_name ILIKE '%wolf den%' AND v.account_id IS NOT NULL
ON CONFLICT DO NOTHING;
