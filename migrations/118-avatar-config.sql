-- The member's built ("vanilla") avatar as a config of DiceBear avataaars options (skin, hair, face,
-- basic clothes). NULL = no built avatar (fall back to an uploaded photo, then initials). Validated
-- against the catalog in src/lib/marketplace/avatar-options.js on save. Cosmetic flair layers on top later.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS avatar_config JSONB;
