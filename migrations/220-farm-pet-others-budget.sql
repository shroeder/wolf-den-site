-- Split the farm petting budget: petting your OWN pets and petting OTHER members' pets now have SEPARATE
-- daily allowances (3 each) instead of one shared pool. This column tracks today's "others" pettings; the
-- existing pet_farm_used now counts only your OWN pets. Both reset together via pet_farm_day.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pet_farm_used_others INT NOT NULL DEFAULT 0;
