-- Per-plot specialization: each of a member's PERMANENT plots (by slot) carries its own upgrade attributes.
-- Plots are no longer transient — this row persists even when the crop row is harvested/cleared. One row per
-- (member, slot); `attrs` holds the level of each track (fertile/loam/nurture/greenhouse/ward).
CREATE TABLE IF NOT EXISTS mkt_farm_plot_upgrade (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    slot       INT  NOT NULL,
    attrs      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, slot)
);
