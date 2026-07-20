-- Sprite facing correction: instead of re-storing a mirrored image (unreliable), store a `flip` flag set by
-- an AI read-pass (or hand-toggled by the owner) and mirror the sprite at RENDER time. facing_checked_at
-- marks which sprites the detection pass has already looked at.
ALTER TABLE mkt_pet_sprite ADD COLUMN IF NOT EXISTS flip BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mkt_pet_sprite ADD COLUMN IF NOT EXISTS facing_checked_at TIMESTAMPTZ;

ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS avatar_sprite_flip BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS avatar_facing_checked_at TIMESTAMPTZ;
