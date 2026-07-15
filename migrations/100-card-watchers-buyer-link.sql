-- Looking For restock alerts now require a marketplace account. Link a watcher to the mkt_buyer it
-- belongs to (the legacy shop_customer_accounts link via customer_id stays for old rows). The account's
-- email is already verified, so account-attached watchers skip the old double-opt-in.
ALTER TABLE card_watchers ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_card_watchers_buyer ON card_watchers (buyer_id);
