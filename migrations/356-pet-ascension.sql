-- ── PET ENSHRINEMENT (2026-08-10) ────────────────────────────────────────────────────────────────────────────
-- Pets go to level 6, and a level-6 pet can be ENSHRINED with a Lightstone or a Darkstone, which makes its
-- active ability permanent — it works whether the pet is equipped or not. See pet-stones.js for why.

-- What stones a member is holding. One row per member per kind; the count is the whole state.
CREATE TABLE IF NOT EXISTS mkt_pet_stone (
    buyer_id   UUID NOT NULL,
    stone      TEXT NOT NULL,               -- 'light' | 'dark'
    count      INT  NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, stone)
);

-- Which pets a member has enshrined, and with which stone. ONE ROW PER PET, and the primary key enforces the
-- thing the whole feature rests on: a pet is enshrined once, with one stone, permanently. There is deliberately
-- no "re-stone it" path — the choice between breadth and depth is only a choice if it sticks.
CREATE TABLE IF NOT EXISTS mkt_pet_enshrined (
    buyer_id     UUID NOT NULL,
    pet_id       TEXT NOT NULL,
    stone        TEXT NOT NULL,             -- 'light' | 'dark'
    enshrined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, pet_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_pet_enshrined_buyer ON mkt_pet_enshrined (buyer_id);

-- ── LEVEL-6 ART COMES IN TWO ─────────────────────────────────────────────────────────────────────────────────
-- Every other level has one sprite per pet, so (pet_id, level) was a fine key. Level 6 has TWO — a radiant one
-- and an umbral one — because which stone you spent has to be visible on the animal for the rest of its life.
-- `variant` is '' for levels 1-5, so every existing row keeps working untouched.
ALTER TABLE mkt_pet_sprite_level ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT '';
ALTER TABLE mkt_pet_sprite_level DROP CONSTRAINT IF EXISTS mkt_pet_sprite_level_pkey;
ALTER TABLE mkt_pet_sprite_level ADD PRIMARY KEY (pet_id, level, variant);
