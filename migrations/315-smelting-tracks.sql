-- SMELTING becomes its own half of the Mine, with its own upgrade tracks and its own furnace that visibly
-- improves as you invest in it (the boat/kettle trick — every purchase changes the thing you look at).
--
-- Mining had four tracks and smelting had none, which made the smelt a button rather than a system. These
-- three each buy a different KIND of smelt rather than just "more":
--   bellows  — a hotter burn sometimes yields an extra part
--   crucible — a bigger pot needs less ore per part
--   flux     — a purer melt sometimes lifts a part a whole tier
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS bellows_level  INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS crucible_level INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS flux_level     INT NOT NULL DEFAULT 0;
