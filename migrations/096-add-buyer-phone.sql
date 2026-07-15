-- A phone number on the marketplace account, so a cashier can look the member up in Square at the
-- register (Square customer search is phone-first). Stored normalized (E.164 when we can). Pushed onto
-- the linked Square customer when saved.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS phone TEXT;
