-- Sailing "your boat is docked — you forgot to sail" reminder. When a voyage+dig cycle finishes the boat goes
-- idle (departed_at NULL); if it sits idle a while we web-push the owner so they don't forget to send it out
-- again. idle_notified_at rate-limits the nudge (at most ~once/day while idle); it's cleared when a new voyage
-- departs so the next idle stretch can remind again.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS idle_notified_at TIMESTAMPTZ;
