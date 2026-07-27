-- Custom farm background can now be UNEQUIPPED without losing it: farm_bg_on toggles whether the saved
-- farm_bg_url is currently shown. Removing sets it FALSE (keeps the URL); re-equipping sets it TRUE.
-- Existing members with a background stay equipped (default TRUE).
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_bg_on BOOLEAN NOT NULL DEFAULT TRUE;
