-- Sealed products carry a UPC in TCGplayer/tcgcsv extendedData. Storing it lets vendors scan a
-- barcode to find the catalog item. Populated by the daily catalog sync.

ALTER TABLE tcg_cards ADD COLUMN IF NOT EXISTS upc TEXT;

-- Match ignoring leading zeros (UPC-A vs EAN-13 padding), so index the normalized form.
CREATE INDEX IF NOT EXISTS idx_tcg_cards_upc ON tcg_cards (ltrim(upc, '0')) WHERE upc IS NOT NULL;
