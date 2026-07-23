-- AI-generated badge art (one small sprite per badge slug), mirroring mkt_item_sprite. Additive: renderers
-- fall back to the badge's emoji when no sprite exists, so this can be back-filled gradually.
CREATE TABLE IF NOT EXISTS mkt_badge_sprite (
    slug       TEXT PRIMARY KEY REFERENCES mkt_badge(slug) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    prompt     TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
