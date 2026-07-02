-- Vendor specialties: curated tags (Pokémon Sealed, MTG Commander, High-End Singles, ...) so vendors
-- differentiate and buyers can filter the directory by what a vendor is known for.

ALTER TABLE mkt_vendor ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT '{}';
