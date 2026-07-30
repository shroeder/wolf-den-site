-- Boss raids become: passive DPS while you STAND IN THE SQUARE + a Forge-style timing strike for burst damage.
--
-- last_passive_at is per fighter, per event: passive damage accrues from it on each town poll, so a member who
-- is present earns damage continuously without needing a cron (a 15-minute cron is far too coarse for a fight
-- that should last 5-10 minutes).
ALTER TABLE mkt_town_event_hit ADD COLUMN IF NOT EXISTS last_passive_at TIMESTAMPTZ;

-- Split the tally so the end-of-raid recap can itemise "you hit for X, your crew's siege added Y".
ALTER TABLE mkt_town_event_hit ADD COLUMN IF NOT EXISTS passive_damage INTEGER NOT NULL DEFAULT 0;

-- Reward columns already exist (rewarded, reward_gold); add the rest so the recap can show exactly what each
-- fighter walked away with instead of a bare gold number.
ALTER TABLE mkt_town_event_hit ADD COLUMN IF NOT EXISTS reward_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_town_event_hit ADD COLUMN IF NOT EXISTS reward_chest TEXT;
