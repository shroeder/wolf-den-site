-- Track who is ACTUALLY on the Town page (vs merely online elsewhere on the site) + how long they've been here.
-- town_seen_at is bumped on every Town poll (getTownState); town_since marks when the current in-town session
-- began (reset after a >90s gap). Powers the "in town vs around" delineation and the 3-minute hangout buff.
ALTER TABLE mkt_town_presence ADD COLUMN IF NOT EXISTS town_seen_at TIMESTAMPTZ;
ALTER TABLE mkt_town_presence ADD COLUMN IF NOT EXISTS town_since   TIMESTAMPTZ;
