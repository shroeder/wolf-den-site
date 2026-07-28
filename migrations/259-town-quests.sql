-- Daily Town quests (from the Quartermaster NPC): per-member progress on town-specific bounties.
CREATE TABLE IF NOT EXISTS mkt_town_quest (
    buyer_id UUID NOT NULL,
    day      DATE NOT NULL,
    key      TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    claimed  BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (buyer_id, day, key)
);
