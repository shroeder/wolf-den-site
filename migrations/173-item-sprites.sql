-- AI-generated art per gear item. One row per item id → its sprite Blob URL. Items still carry a
-- react-icons glyph as a fallback; when a sprite exists we render the image instead. Generated once,
-- directly via OpenAI (no cron) — static assets, so no regeneration schedule.
CREATE TABLE IF NOT EXISTS mkt_item_sprite (
    item_id    TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    prompt     TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
