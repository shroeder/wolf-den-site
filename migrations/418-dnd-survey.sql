-- ── A TABLE FOR ONE POST'S WORTH OF ANSWERS ──────────────────────────────────────────────────────────────────
-- The shop wants to run D&D and does not yet know what shape it should be: campaign or one-shot, which night,
-- how often, how long. That is six questions asked once of whoever answers a Facebook post, so the audience is
-- almost entirely people with no account here — no login, no member row, nothing to hang the answers off.
--
-- Hence a flat table of its own rather than columns on mkt_buyer (which is where game_interests lives, and is
-- exactly why that one cannot answer this: it can only hear from members).
--
-- `days` and `times` are arrays because a person free on Tuesday AND Thursday is the single most useful thing
-- a scheduler can learn, and forcing one pick throws that away. Everything is stored as a stable slug, never
-- as the label the page shows, so the wording on the page can be reworded without orphaning the answers.
CREATE TABLE IF NOT EXISTS dnd_survey (
    id             BIGSERIAL PRIMARY KEY,
    name           TEXT,
    contact        TEXT,
    experience     TEXT NOT NULL,
    format         TEXT NOT NULL,
    days           TEXT[] NOT NULL DEFAULT '{}',
    times          TEXT[] NOT NULL DEFAULT '{}',
    frequency      TEXT NOT NULL,
    session_length TEXT NOT NULL,
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dnd_survey_created_idx ON dnd_survey (created_at DESC);

COMMENT ON TABLE dnd_survey IS
    'Public D&D interest survey (/dnd). One row per submitted form; respondents are mostly non-members, so there is deliberately no buyer_id. Answers are slugs defined in src/lib/dnd-survey.js.';
