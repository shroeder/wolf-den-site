-- ── ONE RUN PER MEMBER, AND IT SURVIVES A LOCKED PHONE ───────────────────────────────────────────────────────
-- The card fight has been a single screen with no memory: refresh it and you get a different fight. A RUN is
-- eight of them with the health and the deck carried between, which is the whole game — and a run that dies
-- when a phone locks itself in a pocket is a run nobody will ever finish. So it is a row.
--
-- ONE ROW PER BUYER, overwritten. There is no history here on purpose: a finished run leaves nothing worth
-- keeping while the thing pays nothing, and the day it does pay, what gets written is a ledger entry rather
-- than a heap of dead runs. `state` is the whole run as JSON — stop, health, deck, the offers on the table —
-- because every field in it is read and written together, always, by one screen.
CREATE TABLE IF NOT EXISTS mkt_cards_run (
    buyer_id   UUID PRIMARY KEY REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    state      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE mkt_cards_run IS
    'The card game run in progress for one member (owner-gated prototype). Overwritten in place; pays nothing.';
