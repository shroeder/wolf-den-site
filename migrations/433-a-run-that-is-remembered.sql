-- ── A RUN THAT IS REMEMBERED ─────────────────────────────────────────────────────────────────────────────
-- The card game had a beginning and, as of last week, an end — and nothing in between was kept. You beat
-- three acts and the only trace was one sentence on the table: "you walked out of the last one." A run that
-- leaves no record is a run with nothing to beat, which is most of why there was no reason to play a second
-- one. Theirs keeps a score and a history, and that is what turns a finished climb into a thing you go back at.
--
-- One row per ENDED run, written once when it ends and never touched again. The live run stays where it is
-- (mkt_cards_run holds exactly one row per member and is rewritten constantly); this is the ledger beside it.
CREATE TABLE IF NOT EXISTS mkt_cards_result (
    id           BIGSERIAL PRIMARY KEY,
    buyer_id     UUID NOT NULL,
    ended_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- "won" or "dead". Nothing else ends a run.
    outcome      TEXT NOT NULL,
    -- How far: which act, and which stop within it. Both, because "act 2, stop 4" is the sentence a player
    -- says out loud and neither half means much alone.
    act          SMALLINT NOT NULL,
    stop         SMALLINT NOT NULL,
    score        INTEGER NOT NULL,
    -- What it was when it ended, for the line that describes it afterwards.
    hp           SMALLINT NOT NULL,
    hp_max       SMALLINT NOT NULL,
    deck_size    SMALLINT NOT NULL,
    -- The seed replays the whole run (see the note on newRun), and the deck and trinkets are what it BECAME.
    seed         BIGINT NOT NULL,
    deck         JSONB NOT NULL DEFAULT '[]'::jsonb,
    perks        JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- The two questions asked of this table: "my last few runs" and "my best". Both are per member and both want
-- the newest or highest first, which is one index each.
CREATE INDEX IF NOT EXISTS mkt_cards_result_recent ON mkt_cards_result (buyer_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS mkt_cards_result_best ON mkt_cards_result (buyer_id, score DESC);
