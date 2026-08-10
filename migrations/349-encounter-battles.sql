-- ENCOUNTERS BECOME FIGHTS, AND A VOYAGE CAN MEET MORE THAN ONE.
--
-- Two changes to how a voyage carries them.
--
-- 1. MARKS, PLURAL. There was one `encounter_at`: a single timestamp at the halfway point, rolled once at
--    departure. A voyage now carries up to three independently-rolled marks, so a bad trip can go wrong more
--    than once. Stored as a JSON array of { at (ISO), enc (id), done (bool) } rather than three columns,
--    because the count is a design number and should not be a migration.
--
-- 2. THE VOYAGE STOPS. An encounter used to resolve itself lazily whenever you next looked, which is why it
--    could be a modal and nothing else. It is a battle now, and the ship cannot be sailing while it is being
--    boarded — `encounter_paused_at` records when the clock stopped so `returns_at` can be pushed forward by
--    exactly the time you took to deal with it.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS encounter_marks jsonb;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS encounter_paused_at timestamptz;
-- Which mark the open battle belongs to, so finishing it clears the right one.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS encounter_active text;
-- Lifetime tally of encounters actually FOUGHT (won or lost), for the chase badges.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS encounters_fought integer NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS encounters_won integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS mkt_sailing_enc_paused_idx ON mkt_sailing (encounter_paused_at)
    WHERE encounter_paused_at IS NOT NULL;
