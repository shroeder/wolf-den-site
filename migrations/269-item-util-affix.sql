-- Rare "attunement" utility affix rolled onto gear by the Forge. One per item, upgradeable (level 1..5).
-- Helps a spin-off feature (farm / pet XP / plaza raids / sailing / forge). Rides with the item on trade/auction.
ALTER TABLE mkt_item_enhance ADD COLUMN IF NOT EXISTS util jsonb;
