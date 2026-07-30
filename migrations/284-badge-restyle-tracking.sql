-- Track which badge sprites have been regenerated in the HOUSE art style (see src/lib/marketplace/art-style.js).
-- Badges were the worst style drift: the old prompt asked for a "Flat 2D badge emblem" and produced literal
-- two-colour vector icons sitting next to fully shaded gear and pets. Restyling is done in resumable batches, so
-- the run needs a marker of what's already been redone.
ALTER TABLE mkt_badge_sprite ADD COLUMN IF NOT EXISTS restyled_at TIMESTAMPTZ;
