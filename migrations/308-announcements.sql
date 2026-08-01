-- Launch announcements: a one-time card a member sees the next time they open the game.
--
-- Built because the Kitchen went public and there was no way to TELL anyone. A feature nobody knows shipped is
-- a feature nobody uses, and the Den's members do not read release notes — they open the app.
--
-- Deliberately a table rather than hardcoded copy: announcing the next thing should not need a deploy.
CREATE TABLE IF NOT EXISTS mkt_announcement (
    key         TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    emoji       TEXT,
    art_url     TEXT,
    cta_label   TEXT,
    cta_href    TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    -- Members who joined AFTER an announcement went out have never known the old state, so telling them the
    -- Kitchen "just opened" is noise. Anyone created after this timestamp is treated as having seen it.
    starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mkt_announcement_seen (
    buyer_id    UUID NOT NULL,
    key         TEXT NOT NULL,
    seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, key)
);

CREATE INDEX IF NOT EXISTS idx_mkt_announcement_active ON mkt_announcement (active, created_at DESC);

-- The Kitchen launch.
INSERT INTO mkt_announcement (key, title, body, emoji, cta_label, cta_href)
VALUES (
    'kitchen_open_2026_08',
    'The Kitchen is open',
    'Cook what you farm and what you land. Time the five steps, and the better you cook the better the reward — gold, chests, seeds, forge parts, even pets. 64 recipes to find, and they turn up everywhere: chests, digs, the forge, the barkeep, a rare deal. Your pantry is already stocked with whatever you have grown and caught.',
    '🍳',
    'Open the Kitchen',
    '/marketplace/cooking'
)
ON CONFLICT (key) DO NOTHING;
