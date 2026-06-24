-- Track which arrivals have been broadcast to the Discord #new-arrivals channel, independent of
-- the per-subscriber email digest cursor. NULL = not yet posted (or suppressed). A partial index
-- keeps the "what still needs posting" lookup cheap as the arrivals table grows.
ALTER TABLE product_alert_arrivals
    ADD COLUMN IF NOT EXISTS discord_posted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_product_alert_arrivals_discord_unposted
    ON product_alert_arrivals(created_at)
    WHERE discord_posted_at IS NULL;
