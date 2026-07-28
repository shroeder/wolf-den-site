-- Presence zones: a member's live presence is either in the plaza or inside the tavern, so each walkable scene
-- shows only the people actually there. Existing rows default to the plaza.
ALTER TABLE mkt_town_presence ADD COLUMN IF NOT EXISTS zone TEXT NOT NULL DEFAULT 'plaza';
CREATE INDEX IF NOT EXISTS idx_town_presence_zone ON mkt_town_presence (zone, updated_at DESC);
