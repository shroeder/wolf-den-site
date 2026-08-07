-- WHERE THE CANNONS SIT, AS DATA YOU CAN EDIT FROM A PHONE.
--
-- Gun positions started life as a hand-authored table in gun-ports.js filled by a dev-only lab on localhost.
-- That table is still empty, so all twenty-six hulls (fifteen fleet ships + eleven boat forms) are drawing
-- their battery from a generic even spread — which is exactly why guns float instead of sitting on a rail.
--
-- Placing twenty-six hulls by eye off contact sheets is the wrong job for the person who cannot see the phone.
-- So the lab becomes owner-reachable on the live site and writes here, and the game reads here first.
-- gun-ports.js stays the fallback and the place settled values get promoted to, so a wiped table degrades to
-- the spread rather than to a gunless deck.
--
-- Keyed by ART id, not by ship: `fleet_manowar`, or `boat:5` for a player boat form. One row per hull, and
-- the whole battery lives in one jsonb array — placements are read as a set and written as a set.
CREATE TABLE IF NOT EXISTS mkt_gun_port (
    art         TEXT PRIMARY KEY,
    ports       JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_by  UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
