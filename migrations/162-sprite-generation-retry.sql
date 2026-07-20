-- Resilient sprite generation: track attempts/errors per member so a repeatedly-failing avatar backs off
-- (stops after MAX_SPRITE_ATTEMPTS) instead of blocking the batch or retrying forever, and surfaces the
-- error to the admin screen. Reset to 0 on a successful draw OR whenever the member changes their avatar
-- appearance / equipped gear (a real change earns a fresh retry budget).
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS avatar_sprite_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS avatar_sprite_error TEXT;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS avatar_sprite_attempt_at TIMESTAMPTZ;
