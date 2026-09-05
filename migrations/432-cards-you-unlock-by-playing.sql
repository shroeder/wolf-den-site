-- ── WHAT PLAYING THE CARD GAME EARNS YOU ─────────────────────────────────────────────────────────────────
-- Until now the only key to a card was a PET: own the animal, meet its card. That is the right spine for a
-- game built on a collection, and it has one hole in it — playing the game itself unlocked nothing. Luke:
-- "we need unlocks as you play, like new cards you get access to."
--
-- Spire does this with a counter it keeps between runs, and so does this: one row per member, counting the
-- things a run is made of. Which cards those counts open is a PURE FUNCTION in cards-kit (unlockedCards), not
-- a table of its own, so the ladder can be re-tuned in a commit rather than in a migration and no member can
-- end up holding a card the rules no longer believe in.
--
-- ⚠️ UUID, matching mkt_cards_run. The marketplace has both kinds of buyer_id column and joining across them
-- is "operator does not exist: uuid = text" — which db.query swallows into an empty result, so the failure
-- looks like a member who has simply never played.
--
-- COUNTS ONLY, no history. A finished run still leaves nothing behind while this pays nothing; what survives
-- it is these nine integers.
CREATE TABLE IF NOT EXISTS mkt_cards_progress (
    buyer_id   UUID PRIMARY KEY REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    rooms      INT NOT NULL DEFAULT 0,   -- rooms entered, all kinds
    fights     INT NOT NULL DEFAULT 0,   -- fights won
    elites     INT NOT NULL DEFAULT 0,   -- elites beaten
    bosses     INT NOT NULL DEFAULT 0,   -- boss fights won
    smiths     INT NOT NULL DEFAULT 0,   -- cards sharpened at a fire
    burns      INT NOT NULL DEFAULT 0,   -- cards paid out of the deck at a brazier
    buys       INT NOT NULL DEFAULT 0,   -- things bought from the merchant
    best_stop  INT NOT NULL DEFAULT 0,   -- deepest stop reached in any run
    runs       INT NOT NULL DEFAULT 0,   -- runs started
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE mkt_cards_progress IS
    'Lifetime card-game counters per member. Which cards they unlock is decided in code (cards-kit unlockedCards).';
