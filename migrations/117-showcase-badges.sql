-- Members SHOWCASE up to 3 badges on their card (their pick). NULL/empty = silently show their top few
-- by rank. The top-ranked of the showcase becomes the "folder tab" — no separate/explicit primary.
-- Replaces the single featured_badge_slug (added same session, unused) with an ordered slug array.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS showcase_badge_slugs TEXT[];
ALTER TABLE mkt_buyer DROP COLUMN IF EXISTS featured_badge_slug;
