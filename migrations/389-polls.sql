-- ── ASKING THE DEN A DESIGN QUESTION ─────────────────────────────────────────────────────────────────────────
-- The member survey (mkt_survey_response, migration 327) answers one fixed shape: favourite system, least
-- favourite, one wish. It has two rounds of data in it and that shape is worth keeping.
--
-- This is the other kind of question. "Should arena skills be active, asynchronous, or both?" and "should a
-- fight be decided by your gear or by your decisions?" are multiple-choice, they change every time, and there
-- will be more of them — so the QUESTIONS live in code (see polls.js) and only the answers live here.
--
-- One row per member per question, overwritten on re-answer: an opinion, not an event log — the same call the
-- survey made and for the same reason. The poll id and question id are plain text so a new poll needs no
-- migration at all; this table is written once and never again.
CREATE TABLE IF NOT EXISTS mkt_poll_response (
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    poll_id     TEXT NOT NULL,
    question_id TEXT NOT NULL,
    choice      TEXT NOT NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, poll_id, question_id)
);

-- "Who still needs asking" runs on every page load for every signed-in member, so it gets the index rather
-- than a sequential scan that grows with every poll ever run.
CREATE INDEX IF NOT EXISTS idx_poll_response_poll ON mkt_poll_response (poll_id, question_id, choice);
