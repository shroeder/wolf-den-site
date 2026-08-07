-- ── PET LEVELLING SLOWED 5x, WITHOUT MOVING ANYONE ──────────────────────────────────────────────────────────
-- The ramp was far off its intent: a mythic pet was meant to be about a month of consistent play, and the
-- first member to max a legendary did it in seven and a half days. pet-level.js now uses thresholds exactly 5x
-- the old ones.
--
-- Because every threshold scaled by the same factor, multiplying each pet's stored XP by 5 keeps BOTH the
-- level and the exact percentage of progress toward the next one — xp >= T is equivalent to 5xp >= 5T, and
-- (xp − T[L]) / (T[L+1] − T[L]) is unchanged when numerator and denominator are both scaled. A pet at Lv3 with
-- 40% of the way to Lv4 is still Lv3 with 40%. Nobody loses a level, which would have been catastrophic for
-- people who spent weeks getting there.
--
-- GUARDED so it cannot run twice: a second pass would grant 25x and hand everyone a maxed menagerie. The
-- marker is checked and written in the same statement block.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mkt_setting WHERE key = 'pet_xp_5x_applied') THEN
        UPDATE mkt_pet_level SET xp = xp * 5;
        INSERT INTO mkt_setting (key, value) VALUES ('pet_xp_5x_applied', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SSZ'));
    END IF;
END $$;
