-- Add consignor notification preference for nightly sales reports
ALTER TABLE consignors
ADD COLUMN IF NOT EXISTS nightly_reports_enabled BOOLEAN NOT NULL DEFAULT TRUE;
