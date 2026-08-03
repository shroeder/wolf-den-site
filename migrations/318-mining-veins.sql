-- VEINS, STREAKS and MOTHERLODES.
--
-- Until now a "wall" was five unrelated nodes plucked from a shared pool, which is why the survey could only
-- ever be counting: there was nothing spatial to reason about. A face is now GENERATED as a wall — spots laid
-- out in a scatter, with rich rock CLUSTERED into veins, so a deep reading tells you something about the marks
-- around it and following a vein is a real strategy.
--
-- read_streak counts consecutive best-reads. Getting the richest spot repeatedly escalates the bonus, so the
-- survey has a run to protect rather than a one-off reward.
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS read_streak INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS best_streak INT NOT NULL DEFAULT 0;

-- A node now remembers where it sat on the wall it was cut from, so the client renders the real layout
-- instead of a fixed decorative scatter.
ALTER TABLE mkt_ore_node ADD COLUMN IF NOT EXISTS face_x REAL;
ALTER TABLE mkt_ore_node ADD COLUMN IF NOT EXISTS face_y REAL;
