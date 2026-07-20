-- Per-member "you were there when the boss fell" celebration: EVERY participant sees the defeat celebration
-- once (not just whoever landed the final blow). Stores the last boss id a member has already celebrated;
-- the watcher shows the celebration for any recently-defeated boss they fought whose id doesn't match.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS boss_celebrated_id UUID;
