-- Distinguish the big daily MANUAL swing from passive AUTO-attack ticks. Manual hits gate the daily
-- limit + the hit-count badges; damage badges + tickets count both. Existing hits were all manual.
ALTER TABLE boss_hit ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS idx_boss_hit_boss_created ON boss_hit (boss_id, created_at);
CREATE INDEX IF NOT EXISTS idx_boss_hit_buyer_kind ON boss_hit (buyer_id, kind);
