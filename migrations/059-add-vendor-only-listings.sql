-- Hidden Inventory: a listing marked vendor_only is hidden from the public buyer marketplace and
-- visible only to other vendors (dealer network + swaps). Great for wholesale / overstock.

ALTER TABLE mkt_listing ADD COLUMN IF NOT EXISTS vendor_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_mkt_listing_vendor_only ON mkt_listing (vendor_only) WHERE vendor_only = TRUE;
