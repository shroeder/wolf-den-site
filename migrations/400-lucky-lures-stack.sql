-- ── LUCKY LURES STACK NOW ────────────────────────────────────────────────────────────────────────────────────
-- Luke: "we have way too many lucky lures... it'd be cool if you could make them stack, and it told you how
-- many stacks you have."
--
-- `dig_lure` was a BOOLEAN, which is why they pile up. Using a second one while one is already pending set TRUE
-- over TRUE and the charge was gone — so the only safe way to hold them was not to use them, and the Den is
-- sitting on 187 across 23 members while spending about 34 a day. A count fixes both halves: a use banks one,
-- a dig spends one, and the shelf can say how many are waiting.
--
-- The ten members currently holding a pending charge keep it (TRUE -> 1). Nobody is owed the ones that were
-- overwritten before this: there is no record of them, and inventing a number to hand back would be a guess
-- dressed as a correction.
ALTER TABLE mkt_sailing ALTER COLUMN dig_lure DROP DEFAULT;
ALTER TABLE mkt_sailing ALTER COLUMN dig_lure TYPE INT USING (CASE WHEN dig_lure THEN 1 ELSE 0 END);
ALTER TABLE mkt_sailing ALTER COLUMN dig_lure SET DEFAULT 0;
