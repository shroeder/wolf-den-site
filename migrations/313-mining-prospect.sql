-- Mining drops the walk-around. Instead of steering a hero across a cave to reach a seam, you PROSPECT: one
-- button surfaces a random live node and that becomes the seam you're working. The position columns on
-- mkt_mining stay (harmless, and cheap to leave) but nothing reads them any more.
--
-- Server-assigned on purpose. If the client picked, a miner would simply take the Emberheart every time and
-- the tier weights would stop meaning anything — what you get to swing at has to be the game's choice.
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS current_node_id BIGINT REFERENCES mkt_ore_node(id) ON DELETE SET NULL;
