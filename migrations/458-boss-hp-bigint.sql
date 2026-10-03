-- ── A BOSS NO LONGER FITS IN 32 BITS ──────────────────────────────────────────────────────────────────────
-- Luke: "Boss hp needs to be 10x, current and future."
--
-- The live boss was 665,137,000. Ten times that is 6,651,370,000, and boss_event.hp and .max_hp were INTEGER,
-- which stops at 2,147,483,647. The scaling attempt failed outright with "integer out of range" — which is the
-- good version of this bug, because the bad version is the one that lands later and silently.
--
-- ⚠️ THE SUMS OVERFLOW BEFORE THE COLUMNS DO, AND THAT IS THE PART THAT WOULD HAVE SHIPPED. Four queries read
-- SUM(h.damage)::int for a PER-MEMBER total — the hero chips, the boss leaderboard, the admin panel and the
-- reward payout. One member taking a third of a 6.65-billion boss is 2.2 billion, past the cast, and the
-- failure would be a 500 on the boss screen midway through a fight rather than anything that looks like this
-- change. Those casts are widened to ::bigint in the same commit.
--
-- boss_hit.damage goes with them even though the biggest single strike on record is 3,404,998 and nothing is
-- near the limit: the pack's damage doubles about every four and a half days (see packGrowthPerDay), the
-- table is only ~445k rows, and leaving one 32-bit column in a chain that now holds billions is leaving the
-- same landmine for whoever is here in a year.
--
-- Guarded rather than bare so it is safe to re-run and safe to apply by hand before the deploy carries it —
-- ALTER ... TYPE rewrites the table every time it runs, and this one ran against production ahead of the push
-- so the live boss could be scaled the same day.

DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'boss_event' AND column_name = 'max_hp') <> 'bigint' THEN
        ALTER TABLE boss_event ALTER COLUMN max_hp TYPE BIGINT;
    END IF;

    IF (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'boss_event' AND column_name = 'hp') <> 'bigint' THEN
        ALTER TABLE boss_event ALTER COLUMN hp TYPE BIGINT;
    END IF;

    IF (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'boss_hit' AND column_name = 'damage') <> 'bigint' THEN
        ALTER TABLE boss_hit ALTER COLUMN damage TYPE BIGINT;
    END IF;
END $$;
