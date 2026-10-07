-- ── THE GROVE — MAP ONE'S TABLES ─────────────────────────────────────────────────────────────────────────
-- The node map's first map. See docs/node-map-design.md for the whole vision.
--
-- Five tables, each holding one idea:
--
--   mkt_grove_player    where you are on the map, and your bag/bank ceilings
--   mkt_grove_zone      per-zone kill progress, which is what unlocks the next node
--   mkt_grove_item      the backpack and the bank, one row per part per location
--   mkt_grove_seen      ⚠️ every part you have EVER SEEN — this is what unlocks recipes
--   mkt_grove_emblem    how many of each emblem you have, and which three are equipped
--
-- ⚠️ mkt_grove_seen EXISTS BECAUSE DISCOVERY IS NOT POSSESSION. Luke: "If you get the first item and discard
-- it or bank it, then find the second part. The recipe unlocks, so its just based on discovery." Deriving
-- unlocks from the backpack would re-lock a recipe the moment you dropped a root, and with sixteen slots
-- things get dropped constantly. So seeing is recorded separately and permanently, and nothing ever deletes
-- from this table.

CREATE TABLE IF NOT EXISTS mkt_grove_player (
    buyer_id        uuid PRIMARY KEY,
    map_id          text        NOT NULL DEFAULT 'grove',
    -- The deepest zone unlocked. Zone 1 is always open.
    unlocked_n      int         NOT NULL DEFAULT 1,
    -- Luke: "16 unique slots to start" and "a bank ... up to 64 slots". Expansions raise these.
    pack_slots      int         NOT NULL DEFAULT 16,
    bank_slots      int         NOT NULL DEFAULT 16,
    -- Which expansion recipes have been consumed, so each stays strictly one-time.
    packs_built     text[]      NOT NULL DEFAULT '{}',
    banks_built     text[]      NOT NULL DEFAULT '{}',
    -- The live session seed. The client plays from it; settle re-rolls against it.
    seed            bigint,
    seed_zone       text,
    seed_at         timestamptz,
    -- ⚠️ THE KILL CEILING'S ANCHOR. A settle is bounded by how long the session has been open against the
    -- zone's population and respawn — without a server-side start time the client could claim any elapsed.
    kills_settled   int         NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT NOW(),
    updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mkt_grove_zone (
    buyer_id        uuid        NOT NULL,
    zone_id         text        NOT NULL,
    kills           int         NOT NULL DEFAULT 0,
    boss_done       boolean     NOT NULL DEFAULT FALSE,
    first_clear_at  timestamptz,
    PRIMARY KEY (buyer_id, zone_id)
);

-- One row per part per place. `place` is 'pack' or 'bank'; a part held in both is two rows, which is what
-- makes "unique slots" countable — a slot is a ROW, not a quantity.
CREATE TABLE IF NOT EXISTS mkt_grove_item (
    buyer_id        uuid        NOT NULL,
    place           text        NOT NULL,
    part_id         text        NOT NULL,
    qty             int         NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, place, part_id)
);

-- ⚠️ APPEND ONLY. Nothing deletes from here, ever. See the note at the top.
CREATE TABLE IF NOT EXISTS mkt_grove_seen (
    buyer_id        uuid        NOT NULL,
    part_id         text        NOT NULL,
    first_at        timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, part_id)
);

CREATE TABLE IF NOT EXISTS mkt_grove_emblem (
    buyer_id        uuid        NOT NULL,
    emblem_id       text        NOT NULL,
    count           int         NOT NULL DEFAULT 0,
    -- NULL when unequipped; 0,1,2 are the three slots open now. Three more exist and stay locked.
    slot            int,
    PRIMARY KEY (buyer_id, emblem_id)
);

-- A player only ever equips three, so a partial unique index is the honest shape: it lets many NULLs and
-- refuses two emblems in the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS mkt_grove_emblem_slot
    ON mkt_grove_emblem (buyer_id, slot) WHERE slot IS NOT NULL;

CREATE INDEX IF NOT EXISTS mkt_grove_item_buyer ON mkt_grove_item (buyer_id, place);
CREATE INDEX IF NOT EXISTS mkt_grove_zone_buyer ON mkt_grove_zone (buyer_id);
