-- MEMBER SURVEY — which systems people actually like.
--
-- The Den has a lot of systems now (boss, farm, sailing, fishing, kitchen, forge, wheel, town, mine, auction,
-- trading) and no way to tell which of them anyone enjoys. Telemetry says what gets USED, which is not the same
-- question: a system can be used daily because it pays well and still be the one people would drop first.
--
-- One row per member, overwritten if they answer again — this is an opinion, not an event log, and the current
-- opinion is the useful one. `favorite` and `least` are system keys (see survey.js SYSTEMS); `wish` is a short
-- free-text answer and is deliberately capped in the API rather than the schema so the limit can move.
-- buyer_id is UUID. mkt_buyer.id is a uuid, not a bigint — the first cut of this migration guessed BIGINT and
-- Postgres rejected the foreign key outright ("cannot be implemented"), which failed the Vercel build. Local
-- `next build` has no DATABASE_URL and does not run migrations, so it passed here and broke there: a schema
-- change is only ever really verified against the actual column types.
CREATE TABLE IF NOT EXISTS mkt_survey_response (
    buyer_id    UUID PRIMARY KEY REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    favorite    TEXT,
    least       TEXT,
    wish        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The only two reads this table gets are "tally the favorites" and "tally the least-liked".
CREATE INDEX IF NOT EXISTS idx_survey_favorite ON mkt_survey_response (favorite);
CREATE INDEX IF NOT EXISTS idx_survey_least ON mkt_survey_response (least);
