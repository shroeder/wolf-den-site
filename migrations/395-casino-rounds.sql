-- ── ONE DRAW, EVERYBODY'S TICKETS ────────────────────────────────────────────────────────────────────────────
-- Keno and roulette become shared: everyone playing in the same window is playing the same ten balls, the same
-- pocket. Bingo already does this, and needed neither of these tables — but bingo can resolve a card the
-- instant it is bought, because the CARD IS SERVER-CHOSEN. You cannot pick it.
--
-- Keno and roulette are the opposite: you choose. So a draw that resolved instantly would mean seeing the ten
-- balls on your first ticket and then buying a second ticket, in the same round, with those exact numbers.
-- That is not a rounding error, it is an unlimited payout.
--
-- So the outcome of a round CANNOT EXIST until the round is over:
--   mkt_casino_round  one row per (game, round), written by whoever asks first AFTER it closes. Everybody
--                     else reads that row, so the whole floor sees one draw — and nobody, including the
--                     server, knows it while bets are still open.
--   mkt_casino_bet    a bet waiting for its round, and the record of what it paid.
--
-- The alternative — deriving the draw from the round number with a secret salt — would be guessable by anyone
-- who ever saw the source, and "the algorithm is private" is not a thing to bet a gold economy on.
CREATE TABLE IF NOT EXISTS mkt_casino_round (
    game        TEXT NOT NULL,
    round       BIGINT NOT NULL,
    outcome     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (game, round)
);

CREATE TABLE IF NOT EXISTS mkt_casino_bet (
    id          BIGSERIAL PRIMARY KEY,
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    game        TEXT NOT NULL,
    round       BIGINT NOT NULL,
    stake       INTEGER NOT NULL,
    choice      JSONB NOT NULL,
    -- 'open' until its round closes and it is scored. Anything else is a finished bet kept for the record.
    status      TEXT NOT NULL DEFAULT 'open',
    won         INTEGER NOT NULL DEFAULT 0,
    detail      JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at  TIMESTAMPTZ
);

-- Finding a member's unsettled bets is the hot path: it runs on every request to the room.
CREATE INDEX IF NOT EXISTS mkt_casino_bet_open ON mkt_casino_bet (buyer_id, status) WHERE status = 'open';
-- And "who else is in this round", which is the whole reason the games are shared.
CREATE INDEX IF NOT EXISTS mkt_casino_bet_round ON mkt_casino_bet (game, round);
