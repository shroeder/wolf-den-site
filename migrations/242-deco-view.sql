-- Farm decorations now belong to a specific VIEW (the farm split into Garden / Outside / Inside).
-- Existing placements default to 'outside' (the old single pasture).
ALTER TABLE mkt_deco_placement ADD COLUMN IF NOT EXISTS view TEXT NOT NULL DEFAULT 'outside';
