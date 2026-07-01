-- Structured card picks for the sell flow. The unified /sell-cards form now lets sellers pick exact
-- cards from the TCG catalog (name/set/number/market price), stored here as JSON alongside the
-- human-readable `items` summary. Enables richer vendor-board display + future catalog matching.

ALTER TABLE sell_inquiry ADD COLUMN IF NOT EXISTS items_json JSONB;
ALTER TABLE sell_offer   ADD COLUMN IF NOT EXISTS items_json JSONB;
