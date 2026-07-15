-- Custom profile borders: a cosmetic avatar frame a member equips, unlocked by level. Purely
-- decorative (status flex), stored as a border id; 'none'/NULL = no frame. See src/lib/marketplace/borders.js.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS equipped_border TEXT;
