-- ── WHAT THE DAILY CAP HELD BACK, OWED TO TOMORROW ──────────────────────────────────────────────────────
-- Eric D, in #bugs: "any candy we get from the gachapon after our daily 250 limit is hit is not carrying
-- over to the next day like the text says it will."
--
-- The capsule screen says, in as many words, "that's your 250 candy for today, so this one keeps until
-- tomorrow's allowance" — and nothing kept it. grantCandy trimmed the payout to zero and the remainder was
-- gone, after a ticket had been spent on it. This is where the remainder lives now; candy.js settles it out
-- of the next day's room. Bounded at one day's cap in code (MAX_OWED_CANDY) so it stays a deferral rather
-- than becoming a second faucet.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS candy_owed INTEGER NOT NULL DEFAULT 0;
