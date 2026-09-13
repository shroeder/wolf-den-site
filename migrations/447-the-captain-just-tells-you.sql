-- ── THE INTERROGATION IS GONE ────────────────────────────────────────────────────────────────────────────────
-- Luke: "Remove the whole interrogated mini game. It should just be a... you capture the captain, and he gives
-- you the treasure map."
--
-- So the puzzle's state has nothing left to hold. `disposition` was the answer, `tell` was the clue, `will` and
-- `nerve` were the two clocks, and `tried` was what you had already said to him. The captive row survives as
-- the chart's provenance — who gave it up, off which ship, at what star — and is written already ended.
--
-- Dropped rather than left NOT NULL and lied to: a column nothing writes is a column the next person writing an
-- INSERT has to guess a value for, and guessing is how a row ends up with a disposition it never had.
ALTER TABLE mkt_ship_captive DROP COLUMN IF EXISTS disposition;
ALTER TABLE mkt_ship_captive DROP COLUMN IF EXISTS tell;
ALTER TABLE mkt_ship_captive DROP COLUMN IF EXISTS will;
ALTER TABLE mkt_ship_captive DROP COLUMN IF EXISTS nerve;
ALTER TABLE mkt_ship_captive DROP COLUMN IF EXISTS tried;

-- Confessions were three-to-a-chart and stopped being written when one man became one chart. Nothing has read
-- this table since; it goes with the mechanic that filled it.
DROP TABLE IF EXISTS mkt_ship_confession;
