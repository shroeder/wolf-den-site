-- Pet passive income. "Earner" pets (their xp_gain / gold_find affinity, previously dead stats that nothing
-- read) now generate real XP + gold for the player over time. Lazily settled on game reads (no cron), so we
-- only need a per-buyer "last settled" timestamp; income accrues since then, capped offline.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pet_income_at TIMESTAMPTZ;
