-- What KIND of thing a chat message is, so an automated milestone can be told apart from a person talking.
--
-- The Arbiter is one voice doing two jobs. It writes the hand-authored triage posts members actually want —
-- "here are the six things you reported and what each of them was" — and it also fires the automated Long Road
-- milestones, one per world-first rung. Sunflower Jinxx, in the plaza: "Are we able to turn off the auto
-- messages for the road rungs?" Luke is keeping the announcements, so the answer is a switch rather than a
-- deletion — and a switch needs something to switch on.
--
-- NULL means a human typed it, which is every message written before this and every message a member sends.
-- Only the automated posts carry a kind, so nothing needs backfilling and the default stays "show it".
ALTER TABLE mkt_town_chat ADD COLUMN IF NOT EXISTS kind TEXT;

-- The chat reads the last N messages constantly and will now filter on this for muted members.
CREATE INDEX IF NOT EXISTS mkt_town_chat_kind_idx ON mkt_town_chat (kind) WHERE kind IS NOT NULL;
