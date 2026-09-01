-- ── THE FLOOR TAKES CHIPS NOW ────────────────────────────────────────────────────────────────────────────────
-- Luke: "lets make it so you can buy chips and make it so everything takes chips to play. maybe 1 to 1 coins
-- buy chips. and each day you can claim 1000 chips for free."
--
-- One column. `chips_day` is the store-local date of the last free thousand, and the claim is spent by a
-- conditional UPDATE against it — the same guard the Loot Pig's box uses, so two tabs cannot both take it.
--
-- NULL means never claimed, which is what every existing member wants to be: everybody has one waiting the
-- first time they walk in after this ships.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS chips_day date;
