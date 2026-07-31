-- Extend the generation ledger to cover EVERY OpenAI call, not just image draws.
--
-- Images are ~91% of the bill, but the remaining ~$7.43/month of text and vision was completely invisible:
-- the facing-detection pass that runs on every sprite, the prompt-refiner behind member Creations, the product
-- matcher, the card-scanner reads. "Perfect visibility" means those show up too, priced from the token counts
-- OpenAI returns rather than guessed at.
ALTER TABLE mkt_ai_generation ADD COLUMN IF NOT EXISTS kind       TEXT   NOT NULL DEFAULT 'image'; -- image | text
ALTER TABLE mkt_ai_generation ADD COLUMN IF NOT EXISTS tokens_in  BIGINT;
ALTER TABLE mkt_ai_generation ADD COLUMN IF NOT EXISTS tokens_out BIGINT;

-- Text calls have no stored artefact, so they cannot key on url the way images do. The unique index on url
-- would collapse every one of them into a single row if url stayed NULL for all of them — Postgres allows
-- repeated NULLs, so they don't collide, but nothing distinguishes them either. Ordering by time is enough.
CREATE INDEX IF NOT EXISTS idx_ai_gen_kind ON mkt_ai_generation (kind, created_at DESC);
