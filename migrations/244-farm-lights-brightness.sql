-- Player lighting + brightness, as an extension of the decoration system (a for-everyone farm feature).
-- Any placed decoration can carry a configurable LIGHT (real additive glow, not a wash overlay) and its own
-- BRIGHTNESS, plus a per-farm global sprite brightness. No overlays are used to achieve either.
ALTER TABLE mkt_deco_placement ADD COLUMN IF NOT EXISTS light_on        BOOLEAN NOT NULL DEFAULT FALSE;   -- emit a light?
ALTER TABLE mkt_deco_placement ADD COLUMN IF NOT EXISTS light_color     TEXT;                              -- hex; NULL = use the deco's default warm glow
ALTER TABLE mkt_deco_placement ADD COLUMN IF NOT EXISTS light_intensity REAL NOT NULL DEFAULT 0.7;         -- 0..1 brightness of the glow
ALTER TABLE mkt_deco_placement ADD COLUMN IF NOT EXISTS light_radius    REAL NOT NULL DEFAULT 70;          -- glow radius in px (falloff)
ALTER TABLE mkt_deco_placement ADD COLUMN IF NOT EXISTS brightness      REAL NOT NULL DEFAULT 1.0;         -- per-sprite brightness multiplier

-- Per-farm global sprite brightness (applied as a real filter on the sprites themselves, never an overlay).
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS sprite_brightness REAL NOT NULL DEFAULT 1.0;
