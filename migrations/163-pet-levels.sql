-- Pet leveling: the member's EQUIPPED pet gains XP (a share of the member's XP + a passive trickle over
-- time) and levels 1→5, each level scaling its passive bonus. Level is derived from xp (not stored).
-- last_tick_at is the lazy-accrual clock for the time-based trickle (only advanced while the pet is equipped;
-- no cron). One row per (member, pet) so progress persists across equip swaps.
CREATE TABLE IF NOT EXISTS mkt_pet_level (
    buyer_id     TEXT NOT NULL,
    pet_id       TEXT NOT NULL,
    xp           INT NOT NULL DEFAULT 0,
    last_tick_at TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, pet_id)
);
