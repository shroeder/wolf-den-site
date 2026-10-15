-- ── THE BOSS SETS: WHAT MERITS ARE FOR ──────────────────────────────────────────────────────────────────────
-- Luke: "you can make boss armor that is a set in game. Depending on the boss difficulty determines the
-- rarity of the set."
--
-- ⚠️ THIS IS THE SINK FOR A CURRENCY THAT HAS BEEN RUNNING WITH A FAUCET AND NOTHING ELSE. Every boss has
-- paid merits since 479 and there has been nowhere to spend one. prove-grove-forge.mjs has printed "THE SETS
-- ARE THE ONLY SINK AND THEY MUST BE PRICED AGAINST THIS" at the end of every run since before the sets
-- existed. One-way currencies are the thing half the economy notes in this repo are about.
--
-- ⚠️ AND THEY ARE GROVE-LOCAL, NOT ENTRIES IN ITEMS. Putting fifteen pieces into the main item table would
-- drag in every landmine that lives there: the 260 __ascended twins that every EXCLUSIVE filter has to
-- restate, the four IIFEs that rewrite every stat at import, the marketplace, the forge, and the rarity
-- lookups that fall DOWNWARD past eternal. See [[ascended-twins-are-real-items]],
-- [[item-stats-are-generated-not-authored]], [[rarity-tables-stop-at-eternal]]. The Grove already owns a
-- worn-equipment system in mkt_grove_emblem and grove-kit.js already folds it into the Arena's stat pool,
-- so armour joins THAT rather than starting a third way to wear a thing.

-- One row per piece owned. The piece id carries its set and its slot ("legendary_head"), so the catalogue
-- stays the only place that knows what a piece IS -- the same reason mkt_grove_chest stores a tier and not
-- a payout.
CREATE TABLE IF NOT EXISTS mkt_grove_armour (
    buyer_id    uuid        NOT NULL,
    piece_id    text        NOT NULL,
    worn        boolean     NOT NULL DEFAULT false,
    made_at     timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, piece_id)
);

-- The two questions ever asked of this table: "what does this player own" (the armoury screen) and "what is
-- this player wearing" (grove-kit, on every zone entry). The partial index serves the second without paying
-- for the rows that answer only the first.
CREATE INDEX IF NOT EXISTS mkt_grove_armour_worn_idx
    ON mkt_grove_armour (buyer_id) WHERE worn;

-- ⚠️ ONE WORN PIECE PER SLOT, ENFORCED HERE RATHER THAN TRUSTED TO THE HANDLER. The slot is not a column --
-- it is the prefix of the piece id -- so the uniqueness is expressed on the derived value. Without this a
-- double tap on a slow connection wears two crowns and grove-kit sums both, which reads as a stat bug a long
-- way from the code that caused it. Same shape as every other claim in this game: let the database refuse it.
CREATE UNIQUE INDEX IF NOT EXISTS mkt_grove_armour_one_per_slot_idx
    ON mkt_grove_armour (buyer_id, split_part(piece_id, '_', 2)) WHERE worn;
