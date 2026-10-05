-- ── THE CASINO BECOMES COIN IN, COIN OUT ─────────────────────────────────────────────────────────────────
-- Luke: "The casino will now just be pure coin in coin out... Unlocking things in the casino and vip is going
-- to be based on total amount of gold won lifetime at the casino... Also no more claiming 1k per day."
--
-- Three things, and the order matters because the second one depends on the first.

-- 1. THE LADDER'S CURRENCY. Lifetime gold won here, which only goes up and which nothing can spend down.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS casino_won BIGINT NOT NULL DEFAULT 0;

-- ⚠️ SEEDED FROM THE CHIPS ALREADY WON, BECAUSE THEY ARE THE SAME QUANTITY. A chip was minted at CHIP_RATE 1
-- per gold of a machine's own payout, so "chips won lifetime" IS "gold won lifetime" under the old name. Not
-- seeding it would mean the Den's best player — 241,512 won over two months — started the ladder on zero
-- alongside somebody who has never pulled a handle, which is the one outcome that would make the rework feel
-- like a punishment rather than a reward.
UPDATE mkt_buyer b SET casino_won = COALESCE(w.won, 0)
  FROM (SELECT buyer_id, SUM(GREATEST(delta, 0))::bigint AS won
          FROM mkt_chip_event
         WHERE delta > 0 AND reason IN ('casino_slot_win','slot5','casino_bingo_win','casino_blackjack_win','casino_keno_win')
         GROUP BY buyer_id) w
 WHERE b.id = w.buyer_id;

-- 2. THE STRANDED CHIPS. The shelf they were for is gone, so an unspent balance is a dead currency sitting in
-- 29 accounts — 137,861 of them, the largest 41,461. Converted to gold 1:1, because 1:1 is what they were
-- minted against. Writing them off would be taking back something somebody won; leaving them would be a
-- balance on screen that nothing in the game will ever accept.
--
-- ⚠️ THROUGH THE CASINO'S OWN LEDGER so the conversion is a row somebody can point at, not a silent UPDATE.
INSERT INTO mkt_chip_event (buyer_id, delta, balance_after, reason, meta)
SELECT id, chips, COALESCE(gold, 0) + chips, 'chips_converted',
       jsonb_build_object('chips', chips, 'rate', 1)
  FROM mkt_buyer WHERE COALESCE(chips, 0) > 0;
UPDATE mkt_buyer SET gold = COALESCE(gold, 0) + chips WHERE COALESCE(chips, 0) > 0;
UPDATE mkt_buyer SET chips = 0 WHERE COALESCE(chips, 0) <> 0;

-- 3. WHAT HAS BEEN CLAIMED OFF THE LADDER. One row per rung ever handed over, so the claim path can grant the
-- DIFFERENCE between what a lifetime total entitles somebody to and what they have already taken — which is
-- what makes an `every X` rung repeatable and a `once` rung not.
CREATE TABLE IF NOT EXISTS mkt_casino_claim (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    ref        TEXT NOT NULL,
    n          INT  NOT NULL DEFAULT 1,
    at_won     BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_casino_claim_buyer ON mkt_casino_claim (buyer_id, kind, ref);
