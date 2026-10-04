-- ── TREASURE MAPS STACK NOW ──────────────────────────────────────────────────────────────────────────────────
-- Sunflower Jinxx, 4 October: "Lucky Lures stack and bank digs. The Treasure maps for the gold merchant do
-- not. I used 3 yesterday. The sail I ended yesterday had the gold merchant, the one today did not."
--
-- She is right, and it is the same fault the lures had — see mig400, which fixed dig_lure and left this column
-- alone. `force_merchant` is a BOOLEAN, so applying a second map while one is already pending writes TRUE over
-- TRUE and the second charge stops existing. Three maps bought one merchant.
--
-- A count fixes both halves exactly as it did for the lures: a use banks one, a landing spends one, and the
-- shelf can say how many are waiting.
--
-- The three members holding a pending map keep it (TRUE -> 1). The ones that were overwritten before this are
-- being paid back separately and precisely rather than guessed at: every map use is a `use_consumable` row in
-- mkt_activity_event and every landing leaves a dig or a merchant row, so a use with another use and no
-- landing between them is a loss with a timestamp on it. 26 of them, 7 members. That is a refund, not an
-- estimate, which is the difference between this and the paragraph mig400 had to write.
ALTER TABLE mkt_sailing ALTER COLUMN force_merchant DROP DEFAULT;
ALTER TABLE mkt_sailing ALTER COLUMN force_merchant TYPE INT USING (CASE WHEN force_merchant THEN 1 ELSE 0 END);
ALTER TABLE mkt_sailing ALTER COLUMN force_merchant SET DEFAULT 0;
