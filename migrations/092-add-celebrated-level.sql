-- Track the highest level a user has already seen the level-up celebration for, so the animation plays
-- exactly once per level — server-side, so it's the same across every device and never on plain login.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS celebrated_level INTEGER NOT NULL DEFAULT 1;

-- Backfill existing accounts to their CURRENT level so past progress doesn't retroactively celebrate;
-- only genuinely new level-ups fire from here on. (Level curve: floor((1 + sqrt(1 + xp/12.5)) / 2).)
UPDATE mkt_buyer
   SET celebrated_level = GREATEST(1, floor((1 + sqrt(1 + (xp::float8 / 12.5))) / 2)::int)
 WHERE xp > 0;
