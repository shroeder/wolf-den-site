-- Every AI image we generate, one row, with what it cost and who caused it.
--
-- The AI Costs screen could previously only answer "how much" — it read OpenAI's org-level totals and then
-- ESTIMATED the per-feature split by counting blobs under each path prefix. That can't tell you which sprite,
-- when, at what quality, whether it was part of a batch run, or which member spent a Creation token on it.
-- With image generation at ~91% of a $122/month OpenAI bill, that's the whole question.
--
-- Cost is recorded per row at generation time from the tier actually requested, so the ledger stays truthful
-- even when prices or defaults change later. cost_basis says whether a row was measured at the time
-- ('measured') or reconstructed after the fact from what we know about existing art ('estimated') — those must
-- never be silently mixed.
CREATE TABLE IF NOT EXISTS mkt_ai_generation (
    id           BIGSERIAL PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- what was asked for
    model        TEXT        NOT NULL DEFAULT 'gpt-image-1',
    size         TEXT,                       -- '1024x1024', '1536x1024', …
    quality      TEXT,                       -- low | medium | high
    edit         BOOLEAN     NOT NULL DEFAULT FALSE,  -- an edit/outpaint pass rather than a fresh draw

    -- what it was for
    source       TEXT,                       -- blob path prefix, e.g. 'marketplace/pet'
    label        TEXT,                       -- human line: 'Pet sprite — Flamingo lv4'
    subject      TEXT,                       -- the id it depicts: 'flamingo', 'fish_perch', item id …
    prompt       TEXT,

    -- how it came to be generated
    origin       TEXT        NOT NULL DEFAULT 'unknown', -- batch | creation | member | cron | admin | backfill
    batch_id     TEXT,                       -- groups one run of a generator script
    batch_label  TEXT,                       -- 'gen-fish-sprites'
    buyer_id     UUID,                       -- WHO, when a member caused it (Creation tokens, avatar redraws)
    buyer_label  TEXT,                       -- @handle snapshot, so history survives a rename

    -- outcome
    ok           BOOLEAN     NOT NULL DEFAULT TRUE,
    error        TEXT,                       -- refusal / API error text when ok = false
    url          TEXT,
    bytes        BIGINT,

    cost_usd     NUMERIC(10, 5),
    cost_basis   TEXT        NOT NULL DEFAULT 'measured'  -- measured | estimated
);

CREATE INDEX IF NOT EXISTS idx_ai_gen_created  ON mkt_ai_generation (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gen_batch    ON mkt_ai_generation (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_gen_buyer    ON mkt_ai_generation (buyer_id) WHERE buyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_gen_origin   ON mkt_ai_generation (origin, created_at DESC);
-- Backfill is keyed on the stored URL so a re-run can't duplicate a row for art already accounted for.
--
-- NOT a partial index. `ON CONFLICT (url)` cannot infer a partial unique index unless the statement repeats its
-- predicate, and Postgres raises "no unique or exclusion constraint matching the ON CONFLICT specification"
-- instead of just inserting — which would have made EVERY ledger write fail silently inside its best-effort
-- catch. Postgres already allows many NULLs in a plain unique index, so refusals (which have no url) still fit.
DROP INDEX IF EXISTS idx_ai_gen_url;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_gen_url ON mkt_ai_generation (url);
