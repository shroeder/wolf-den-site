-- Granular per-kind, per-channel notification preferences, plus the win-back digest's send clock.
--
-- Keys are "<channel>:<kind>" — e.g. push:dm, email:friend, email:digest. Absent key = ON, so members keep
-- getting everything by default and we only ever store explicit opt-OUTs. That also means adding a new
-- notification kind never needs a backfill.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS notify_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Last time the "here's what you missed" recap went out, so the digest can hard-cap itself to one per week
-- per member no matter how often the cron runs.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS digest_last_sent_at TIMESTAMPTZ;

-- Carry the two legacy booleans into the new map so nobody's existing opt-out is silently reset. Only FALSE
-- values matter — TRUE is already the default.
UPDATE mkt_buyer
   SET notify_prefs = notify_prefs
       || CASE WHEN notify_email_dm     IS FALSE THEN '{"email:dm":false}'::jsonb     ELSE '{}'::jsonb END
       || CASE WHEN notify_email_friend IS FALSE THEN '{"email:friend":false}'::jsonb ELSE '{}'::jsonb END
 WHERE notify_email_dm IS FALSE OR notify_email_friend IS FALSE;

-- Finding "who is due a digest" scans by this column every run.
CREATE INDEX IF NOT EXISTS idx_buyer_digest_sent ON mkt_buyer (digest_last_sent_at);
