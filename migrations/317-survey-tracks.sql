-- SURVEYING becomes the third tab, with its own upgrade tracks and its own tool ladder.
--
-- The Lantern moves out of the mining tracks and into the survey tracks, where it always belonged: it buys
-- test-strikes and tilts which seams surface, both of which are about FINDING rock rather than breaking it.
-- Its column stays put (lantern_level) so nobody's levels are lost in the move.
--
--   lantern  more test-strikes, and richer seams surface  (existing column)
--   assay    a reading sometimes names the ore outright   (new)
--   face     a wider rock face — more candidate spots     (new)
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS assay_level INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS face_level  INT NOT NULL DEFAULT 0;
