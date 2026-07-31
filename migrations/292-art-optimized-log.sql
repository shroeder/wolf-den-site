-- Every sprite was stored as the raw 1024x1024 PNG OpenAI returns — 1.5-2.4 MB each — and drawn at 48-148 px.
-- 1.94 GB of art was being served to phones to paint thumbnails, which made Blob Data Transfer the single
-- largest line on the Vercel bill and made the game slow to load on mobile.
--
-- scripts/optimize-art.mjs re-encodes each image at 3x the largest size it is ever rendered at (more pixels
-- than a phone can display) and uploads it as WebP alongside the original. This table records old -> new so
-- the swap can be reverted wholesale, and so the superseded originals can be deleted later once the live
-- result has been eyeballed. Deleting a row here does not affect the site — the live URL lives on the
-- owning table.
CREATE TABLE IF NOT EXISTS mkt_art_optimized (
    id           BIGSERIAL PRIMARY KEY,
    src_table    TEXT        NOT NULL,
    src_column   TEXT        NOT NULL,
    old_url      TEXT        NOT NULL,
    new_url      TEXT        NOT NULL,
    old_bytes    BIGINT,
    new_bytes    BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per original, so a re-run can't double-record the same swap.
CREATE UNIQUE INDEX IF NOT EXISTS idx_art_optimized_old ON mkt_art_optimized (old_url);
