-- Boss in-game reward items: multiple hand-picked items per boss, distributed to WEIGHTED-RANDOM
-- participants on the kill (top dealers get a modest edge, never guaranteed) — replaces the single
-- chase_item_id → top-DPS model. chase_item_id is kept for back-compat / fallback.
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS reward_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
