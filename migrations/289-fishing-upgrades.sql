-- Fishing had no progression to buy. Angling — the only fishing stat — comes purely from gear and badges, so
-- there was nothing to work toward and nothing to spend gold on. The Rail station could show your numbers but
-- had nothing on sale.
--
-- Four tracks, matching the shape of the boat and excavation tracks (level per column, priced by the shared
-- upgradeCost curve):
--
--   line   +1 cast a day per level                    — more fishing
--   lure   tilts the roll toward rarer species        — better fishing
--   net    more casts come up treasure instead of fish — different fishing
--   gaff   raises the floor on a bad reel             — safer fishing
ALTER TABLE mkt_sailing
    ADD COLUMN IF NOT EXISTS fish_line_level  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fish_lure_level  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fish_net_level   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fish_gaff_level  INTEGER NOT NULL DEFAULT 0;
