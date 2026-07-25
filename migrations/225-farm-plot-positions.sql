-- Per-buyer custom plot positions for the farm scene. A jsonb map of slot index -> {x, y} (percent of the
-- pasture field). Empty/missing = fall back to the default tidy cluster on the left of the field.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_plot_pos jsonb NOT NULL DEFAULT '{}'::jsonb;
