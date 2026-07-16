-- Email notification prefs (toggleable in the profile) + a last-seen stamp so we only email when the
-- member is offline (not sitting in the app). Default ON so members hear about DMs/requests they'd miss.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS notify_email_dm BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS notify_email_friend BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
