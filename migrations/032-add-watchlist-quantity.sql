-- Shoppers can want more than one copy of the same card (playsets, multiples for a deck, etc.).
-- Track a per-item quantity on the watchlist rather than allowing duplicate rows: the
-- (watcher_id, card_id) row stays unique and carries how many copies are wanted. Existing rows
-- default to 1, which matches the prior implicit "one of each" behavior.
ALTER TABLE card_watchlist_items
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

ALTER TABLE card_watchlist_items
    DROP CONSTRAINT IF EXISTS card_watchlist_items_quantity_check;

ALTER TABLE card_watchlist_items
    ADD CONSTRAINT card_watchlist_items_quantity_check CHECK (quantity >= 1);
