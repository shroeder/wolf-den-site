-- ── THE SEAMLESS JOURNEY ─────────────────────────────────────────────────────────────────────────────────────
-- An expedition used to START with a chart already in your pocket: you had beaten a fleet ship on a different
-- screen at some earlier time, a row appeared in mkt_ship_chart, and the expedition spent it. Luke's shape for
-- the prototype puts the whole thing on one unbroken track — set sail, hunt a ship, take her captain, take his
-- bearings, make the island — so the journey now begins BEFORE the chart exists.
--
-- That needs one thing the table does not already hold: who you are hunting and who you took off her. Every
-- other number was already here (seed, grade, island are resolved up front and were always NOT NULL, so a row
-- can be opened at the new 'hunt' phase without a single column becoming nullable).
--
-- ⚠️ ONE JSONB COLUMN, NOT SIX. The captain, the quarry and the run's encounter schedule are all read
-- together, written together, and never queried BY. Six columns would be six migrations the next time the
-- journey grows a beat, on a table that is read once per poll of one screen.
--
-- ⚠️ AND THE DAILY ALLOWANCE IS NOT A COLUMN. `opened_at` is already stamped on every row, so "how many did I
-- start today" is a COUNT with a date predicate. A counter column would be a second source for a number the
-- table already holds, and the kind that goes wrong the first time a row is deleted.
ALTER TABLE mkt_ship_expedition
    ADD COLUMN IF NOT EXISTS journey JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The phase column is free text with no CHECK, deliberately (449 says so), so the new beats — hunt, spoils,
-- bearings, course, landing — need no schema change at all. This comment is the only record that they exist:
--
--   hunt      out looking for a sail; the quarry is in `journey`
--   spoils    she is taken; the beat that says what her captain gave up and why it matters
--   bearings  the glass is up; three bearings to take (replaces the old 'plot')
--   course    the chart is solved; the beat that says where you are going and what is there
--   run       the sail to the island, with encounters you can see coming
--   landing   coming alongside; the boat docks and you step off
--   ashore    the walk
--
-- Counting a member's sailings for the day. The partial index on open rows cannot serve this because it is
-- deliberately partial; this one is over the whole table, newest first, which is also what the history read
-- wants.
CREATE INDEX IF NOT EXISTS mkt_ship_expedition_day
    ON mkt_ship_expedition (buyer_id, opened_at DESC);
