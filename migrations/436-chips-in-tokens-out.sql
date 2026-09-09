-- ── THE FLOOR SPLITS INTO FUEL AND PRIZES ────────────────────────────────────────────────────────────────────
-- Luke: "I think that chips are used to play. and then you earn A different currency to spend... You buy
-- chips, you earn tokens by winning, that way chips always goes down, and gold is spent to sink into chips."
--
-- ⚠️ WHY THIS EXISTS, WHICH IS A PROBLEM THE PREVIOUS DESIGN COULD NOT SOLVE. Chips were both the fuel and
-- the prize: you staked them and you won them back, and the same balance bought pets at the Counter. So the
-- machines' return rate WAS the prize faucet, and the two could never be tuned apart. Pushing the floor to
-- 121% so that half of all buy-ins survive (see TARGET_RTP in casino-slot5.js) therefore also meant an
-- unbounded Counter: every spin +EV, a balance with no ceiling, and the only limit on what somebody could
-- take off the shelf being how long they were willing to sit there.
--
-- Measured on the live ledger the day this was written, and it was already open before anybody pushed it:
--     chips minted from outside      212,000   (61,000 bought with gold + 151,000 free daily)
--     chips spent at the Counter     915,770
-- Four and a bit times as much purchasing power came out as went in.
--
-- Two currencies fixes it structurally rather than by tuning:
--     gold  →  chips  (spent, gone)  →  a spin  →  TOKENS  →  the Counter
-- Chips only ever go down, so the token faucet is bounded by chips, and chips are bounded by gold. There is
-- no cap anywhere and none is needed; the bound is the shape of the loop. And the machines' generosity is
-- now free to be whatever makes the room fun, because what it inflates is fuel.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS tokens BIGINT NOT NULL DEFAULT 0;

-- ── AND WHERE EVERY ONE OF THEM CAME FROM ────────────────────────────────────────────────────────────────────
-- Same shape as mkt_chip_event and for the same reason it gives: a balance column cannot answer "which spin
-- did that", and the day somebody has more tokens than they should that is the only useful question.
-- Append-only. `delta` is positive when won at a machine and negative when spent at the Counter.
CREATE TABLE IF NOT EXISTS mkt_token_event (
    id            BIGSERIAL PRIMARY KEY,
    buyer_id      UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    delta         BIGINT NOT NULL,
    balance_after BIGINT,
    -- What did it: "slot5", "casino_bingo_win", "casino_blackjack_win", "casino_keno_win", "store".
    reason        TEXT NOT NULL,
    -- The machine id, or the store item id — whatever makes the row answerable on its own.
    ref           TEXT,
    meta          JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mkt_token_event_buyer_idx ON mkt_token_event (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mkt_token_event_day_idx ON mkt_token_event (created_at DESC) WHERE delta > 0;

-- ── ⚠️ NOBODY LOSES A CHIP THEY ALREADY WON ──────────────────────────────────────────────────────────────────
-- Every chip on the site right now was won or bought under the old rules, where a chip WAS a prize. The
-- moment the Counter starts asking for tokens, those balances are stranded — somebody who ground out 80,000
-- chips for a pet last week would open the shelf and be told they have nothing.
--
-- So the balance is COPIED, not moved: tokens are seeded from chips and the chips are left where they are.
-- It hands everybody their winnings in the new currency and their fuel in the old one, which is the generous
-- reading and the only one that cannot take something away from somebody who is not here to ask.
--
-- It is deliberately NOT `chips = 0`. A member's chips are what they play WITH now, and zeroing them would
-- close the floor to everybody who had not bought in this week — on the same day the floor was rebuilt to be
-- worth playing.
UPDATE mkt_buyer SET tokens = chips WHERE chips > 0 AND tokens = 0;

-- Guarded so a re-run cannot write the row twice. Migrations run once, but a ledger is the thing an
-- argument about somebody's balance gets settled from and it costs one NOT EXISTS to make that true.
INSERT INTO mkt_token_event (buyer_id, delta, balance_after, reason, meta)
SELECT b.id, b.chips, b.chips, 'carried_over',
       jsonb_build_object('note', 'chips won under the one-currency floor, carried into tokens')
  FROM mkt_buyer b
 WHERE b.chips > 0
   AND NOT EXISTS (SELECT 1 FROM mkt_token_event e
                    WHERE e.buyer_id = b.id AND e.reason = 'carried_over');
