-- THE STOCKADE — a public fixture in the town plaza holding a member who was caught cheating.
--
-- Passers-by can shame them or throw rotten fruit a few times a day for XP (and a little coin for the fruit).
-- The occupant carries the Mark of Shame: a locked primary badge they cannot unset, and a real passive debuff.
--
-- Design notes that matter:
--   · Occupancy is a ROW, not a flag on mkt_buyer, so the whole thing is reversible by deleting one row and the
--     history of who was in it and why survives a release.
--   · `released_at` rather than DELETE on release — "was in the stockade on these dates for this reason" is the
--     part you actually want to keep.
--   · Per-visitor daily counters are keyed on the DAY so they reset naturally; no cron, nothing to sweep.
CREATE TABLE IF NOT EXISTS mkt_stockade (
    buyer_id    UUID PRIMARY KEY,
    reason      TEXT NOT NULL DEFAULT 'Exploited a bug for personal gain',
    placed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    placed_by   UUID,
    released_at TIMESTAMPTZ,
    shame_count INTEGER NOT NULL DEFAULT 0,
    fruit_count INTEGER NOT NULL DEFAULT 0
);

-- Only one occupant can be serving at a time; a released row keeps the record without blocking the next one.
CREATE UNIQUE INDEX IF NOT EXISTS mkt_stockade_active_one
    ON mkt_stockade ((released_at IS NULL)) WHERE released_at IS NULL;

-- Who did what to whom, today. The PK is the rate limit: 3 shames + 3 fruit per visitor per occupant per day.
CREATE TABLE IF NOT EXISTS mkt_stockade_action (
    buyer_id  UUID NOT NULL,
    target_id UUID NOT NULL,
    day       DATE NOT NULL,
    kind      TEXT NOT NULL,
    count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, target_id, day, kind)
);

-- A badge the holder cannot take off. Every other badge is a choice; this one is the point.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS locked_badge TEXT;

-- The Mark itself. drop_only + admin_only so it can never be earned, bought or auto-awarded by a rule.
INSERT INTO mkt_badge (slug, label, description, icon, color, sort_order, admin_only, drop_only, secret)
VALUES ('mark_of_shame', 'Mark of Shame', 'Caught exploiting. −10% XP, −10% coin, −10% boss damage.',
        '⛓️', '#8a2b2b', 999, TRUE, TRUE, FALSE)
ON CONFLICT (slug) DO UPDATE
    SET label = EXCLUDED.label, description = EXCLUDED.description, icon = EXCLUDED.icon, color = EXCLUDED.color;
