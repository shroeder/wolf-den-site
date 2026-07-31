-- The stockade fixture and its occupant are ONE image, not a sprite composited over a prop.
--
-- Pinning a hero sprite into an empty stockade's holes never reads as "locked in" — it reads as a face pasted
-- on a fence, because the arms don't go through, nothing is foreshortened, and the lighting doesn't match. So
-- the occupant is drawn INTO the stockade as a single piece, from their own hero sprite, when they're placed.
--
-- Cached per occupant rather than regenerated: it costs an image call, and the picture only changes when the
-- person in the stockade changes.
ALTER TABLE mkt_stockade ADD COLUMN IF NOT EXISTS occupant_art_url TEXT;
ALTER TABLE mkt_stockade ADD COLUMN IF NOT EXISTS occupant_art_at TIMESTAMPTZ;
