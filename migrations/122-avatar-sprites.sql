-- Per-member AI "sprite": a 2D game-art character generated from their built avatar.
-- avatar_updated_at bumps whenever the member changes their avatar; the job/backfill regenerates any
-- sprite whose source avatar changed since it was last drawn (avatar_updated_at > avatar_sprite_at).
ALTER TABLE mkt_buyer
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_sprite_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_sprite_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_sprite_prompt TEXT;

-- Seed: every existing built avatar counts as "changed now" so the first backfill/job picks them all up.
UPDATE mkt_buyer SET avatar_updated_at = NOW() WHERE avatar_config IS NOT NULL AND avatar_updated_at IS NULL;
