-- Track whether a member has been push-notified that their voyage arrived (so the cron pushes exactly once).
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS arrival_notified BOOLEAN NOT NULL DEFAULT FALSE;
