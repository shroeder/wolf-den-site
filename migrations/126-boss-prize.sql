-- The weekly boss's raffle PRIZE — a Square catalog item picked in the admin app; its image shows on the
-- boss page so members see what they're earning tickets toward.
ALTER TABLE boss_event
  ADD COLUMN IF NOT EXISTS prize_name TEXT,
  ADD COLUMN IF NOT EXISTS prize_image_url TEXT,
  ADD COLUMN IF NOT EXISTS prize_square_id TEXT;
