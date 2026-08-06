-- ── ONE OF EACH, ONCE A DAY, FROM THE GOLD MERCHANT ──────────────────────────────────────────────────────────
-- His stock is deliberately cheap (two-thirds off) because meeting him is rare. With no purchase limit, the
-- two facts fight each other: one lucky landing let you buy the same discounted ware over and over until your
-- gold ran out, which is not a rare event, it is a vending machine.
--
-- A day-stamped list of what you have bought from him today. Cleared lazily on read when the stamp is stale,
-- the same way every other daily budget in the game works (petting, ratings, raids, waves) — no cron, no
-- midnight job, and it costs one column.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS merchant_buy_day  date;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS merchant_bought   jsonb NOT NULL DEFAULT '[]'::jsonb;
