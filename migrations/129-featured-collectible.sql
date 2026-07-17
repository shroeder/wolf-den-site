-- The one collectible a member chooses to feature on their profile card + public profile.
-- Stores the collectible id (see src/lib/marketplace/collectibles.js); NULL = none featured.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS featured_collectible TEXT;
