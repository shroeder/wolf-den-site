-- The one-time "turn on notifications (and here's gold for it)" re-engagement email.
--
-- This is a deliberate BULK send to members push can't reach, so it must be impossible to send twice: the
-- stamp is what makes the job idempotent no matter how many times the admin route is hit.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS push_winback_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_buyer_push_winback ON mkt_buyer (push_winback_sent_at);
