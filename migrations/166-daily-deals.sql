-- "Today's Deals" — a rotating discounted shop that changes daily. The rotation itself is DETERMINISTIC
-- from the date (no cron, no stored offers), so everyone sees the same deals and they flip at midnight CT.
-- This table only records who has claimed which deal on which day, to enforce the one-per-deal-per-day limit.
CREATE TABLE IF NOT EXISTS mkt_daily_deal_purchase (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    day        DATE NOT NULL,
    item_id    TEXT NOT NULL,
    kind       TEXT NOT NULL,
    price      INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, day, item_id)
);
