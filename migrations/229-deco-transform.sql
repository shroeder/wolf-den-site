-- Placed decorations can be resized + rotated (plots cannot). scale = 1.0 default (0.4–2.5), rot = degrees.
ALTER TABLE mkt_deco_placement ADD COLUMN IF NOT EXISTS scale NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE mkt_deco_placement ADD COLUMN IF NOT EXISTS rot INTEGER NOT NULL DEFAULT 0;
