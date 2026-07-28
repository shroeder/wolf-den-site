-- The Tavern: per-member state for the dice game (press-your-luck) + the daily pint.
CREATE TABLE IF NOT EXISTS mkt_tavern (
    buyer_id       UUID PRIMARY KEY,
    dice_pot       INTEGER NOT NULL DEFAULT 0,
    dice_rolls     INTEGER NOT NULL DEFAULT 0,
    dice_active    BOOLEAN NOT NULL DEFAULT FALSE,
    last_drink_day DATE,
    drinks         INTEGER NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
