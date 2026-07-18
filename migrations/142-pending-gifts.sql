-- Pending gift pop-ups. When an admin gifts a member (item / chest / gold), we record a row here so the
-- recipient gets a celebratory pop-up the next time they open the site — reliable even if browser push is
-- off or not configured. Cleared (seen_at set) once shown, so it never replays. Mirrors the level-up
-- celebration pattern.
CREATE TABLE IF NOT EXISTS mkt_pending_gift (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,                              -- item | chest | gold
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    icon       TEXT,                                       -- emoji shown big on the pop-up
    rarity     TEXT,                                       -- item rarity (drives the glow color), else null
    url        TEXT NOT NULL DEFAULT '/marketplace/equipment',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seen_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mkt_pending_gift_unseen ON mkt_pending_gift (buyer_id, created_at) WHERE seen_at IS NULL;
