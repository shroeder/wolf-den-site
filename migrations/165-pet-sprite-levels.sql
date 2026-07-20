-- Per-LEVEL pet battle sprites: as a pet levels 1→5 its art gets cooler/more powerful. Lv1 stays in
-- mkt_pet_sprite (the base). Levels 2–5 live here (one shared image per pet+level, like the base). Render
-- picks the highest sprite at or below the member's pet level, falling back to the base.
CREATE TABLE IF NOT EXISTS mkt_pet_sprite_level (
    pet_id            TEXT NOT NULL,
    level             INT NOT NULL,
    url               TEXT,
    flip              BOOLEAN NOT NULL DEFAULT FALSE,
    facing_checked_at TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (pet_id, level)
);
