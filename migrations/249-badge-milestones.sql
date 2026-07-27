-- Badge collection milestones: which count-thresholds (10/25/50/100/250/500) a member has already claimed
-- their gold + chest reward for. A jsonb array of the claimed counts, e.g. [10, 25].
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS badge_milestones_claimed JSONB NOT NULL DEFAULT '[]'::jsonb;
