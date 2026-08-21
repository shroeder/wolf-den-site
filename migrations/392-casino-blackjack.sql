-- ── ONE TABLE FOR ONE TABLE ──────────────────────────────────────────────────────────────────────────────────
-- Blackjack is the first game on the casino floor that is not one round trip. A pull, a spin and a ticket all
-- resolve inside a single request, so their whole state is the response. A hand of blackjack is a
-- conversation — deal, hit, hit, stand — and every step of it has gold riding on it.
--
-- So the hand lives HERE and not in the client. `shoe` in particular: the moment the remaining deck is on the
-- player's screen, blackjack stops being a card game and becomes a lookup. The API only ever returns the
-- dealer's up card while a hand is open.
--
-- One open hand per member, enforced by the partial index below. Note the WHERE clause — this codebase has
-- already paid for a partial index whose ON CONFLICT forgot to restate it, and two weeks of writes went
-- quietly into a .catch(). Nothing here uses ON CONFLICT for exactly that reason: the deal path SELECTs the
-- open hand first and hands it back rather than trying to insert past it.
CREATE TABLE IF NOT EXISTS mkt_casino_hand (
    id           BIGSERIAL PRIMARY KEY,
    buyer_id     UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    stake        INTEGER NOT NULL,
    doubled      BOOLEAN NOT NULL DEFAULT FALSE,
    shoe         JSONB NOT NULL,
    player       JSONB NOT NULL,
    dealer       JSONB NOT NULL,
    -- 'open' while it is the player's turn; anything else is a finished hand kept for the record.
    status       TEXT NOT NULL DEFAULT 'open',
    outcome      TEXT,
    won          INTEGER NOT NULL DEFAULT 0,
    rake         INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS mkt_casino_hand_one_open
    ON mkt_casino_hand (buyer_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS mkt_casino_hand_recent
    ON mkt_casino_hand (buyer_id, created_at DESC);
