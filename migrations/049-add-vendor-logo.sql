-- Vendor logo: uploaded during the public application, carried onto the vendor on approval, and
-- editable anytime from the vendor portal. Stored as a public Vercel Blob URL.

ALTER TABLE mkt_vendor ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE mkt_vendor_application ADD COLUMN IF NOT EXISTS logo_url TEXT;
