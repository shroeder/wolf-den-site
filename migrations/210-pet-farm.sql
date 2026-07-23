-- The Farm: your owned pets roam a little pasture. On your OWN farm you can pet each pet once a day for a
-- small XP bump. petted_day records the last store-local day a pet was petted (the once/day gate).
ALTER TABLE mkt_pet_level ADD COLUMN IF NOT EXISTS petted_day DATE;
