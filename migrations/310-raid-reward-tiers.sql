-- Raid completion rewards are now TIERED by contribution rather than flat, and the end-of-raid recap needs a
-- durable "I've seen this" marker.
--
-- recap_seen_at: the recap was only ever dismissed into a useRef, so every remount inside the 10-minute recap
-- window (a refresh, or simply walking back into the Town) popped it again with no way to make it stop.
-- reward_tier: which band the fighter earned, so the recap can name it instead of just showing a number.
ALTER TABLE mkt_town_event_hit ADD COLUMN IF NOT EXISTS recap_seen_at TIMESTAMPTZ;
ALTER TABLE mkt_town_event_hit ADD COLUMN IF NOT EXISTS reward_tier TEXT;
