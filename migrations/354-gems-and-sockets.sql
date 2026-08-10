-- GEMS, SOCKETS AND THE JEWELCUTTER.
--
-- The Den has gear you find, gear you forge and gear you buy, and no reason at all to keep a piece you already
-- like — the next drop either beats its numbers or it does not. A socket is that reason: the item stops being
-- a number you replace and becomes something you have put work into.
--
-- Definitions live in code (src/lib/marketplace/gems.js) like items, pets and badges. The database only tracks
-- WHAT YOU HOLD and WHAT IS SET INTO WHAT.

-- The gem bag. Stacked by id, because a gem is a consumable-shaped thing: two Chipped Rubies are two Chipped
-- Rubies, there is nothing to tell them apart.
CREATE TABLE IF NOT EXISTS mkt_gem (
    buyer_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    gem_id    TEXT NOT NULL,
    count     INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, gem_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_gem_buyer ON mkt_gem (buyer_id);

-- Sockets, and what is in them. Keyed the same way gear state already is — (buyer_id, item_id) — because that
-- is what an "instance" means here: one row per item def per member, exactly like mkt_item_enhance. `idx` is
-- the socket number so a second socket is a row rather than a migration.
CREATE TABLE IF NOT EXISTS mkt_item_socket (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id    TEXT NOT NULL,
    idx        INT  NOT NULL DEFAULT 0,
    gem_id     TEXT,                                  -- NULL = cut, empty, waiting
    cut_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    set_at     TIMESTAMPTZ,
    PRIMARY KEY (buyer_id, item_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_mkt_item_socket_buyer ON mkt_item_socket (buyer_id);

-- Where every gem came from and where it went. The Forge keeps a craft log for exactly this reason: when
-- somebody asks why their Flawless Emerald is gone, the answer should be a row rather than a shrug.
CREATE TABLE IF NOT EXISTS mkt_gem_event (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,                         -- drop | socket_cut | gem_set | gem_pulled | bought
    gem_id     TEXT,
    item_id    TEXT,
    meta       JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_gem_event_buyer ON mkt_gem_event (buyer_id, created_at DESC);
