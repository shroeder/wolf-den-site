-- Guard so the "crops ready" push fires once per crop, not every cron run.
ALTER TABLE mkt_farm_plot ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
