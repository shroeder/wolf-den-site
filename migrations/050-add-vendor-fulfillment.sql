-- Vendor fulfillment options for the storefront trust strip: whether they ship and/or offer local
-- pickup. Local marketplace, so pickup defaults on and shipping off (vendors opt in to shipping).

ALTER TABLE mkt_vendor ADD COLUMN IF NOT EXISTS ships BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mkt_vendor ADD COLUMN IF NOT EXISTS local_pickup BOOLEAN NOT NULL DEFAULT TRUE;
