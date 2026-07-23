-- Coin (gold) ledger. Until now player gold lived ONLY as the running integer mkt_buyer.gold with no
-- history — every earn/spend was a blind `gold = gold ± n`. This append-only ledger records where a
-- player's coins come from and go to (raids, spins, boss, quests, upgrades, cooldown-skips, purchases,
-- trades), mirroring the mkt_store_credit_event / mkt_xp_event pattern so the admin app can show a real
-- coin statement. balance_after is captured when the mutating query already RETURNs the new balance;
-- it's nullable for the few paths that don't, and the read side can fall back to a running SUM.
CREATE TABLE IF NOT EXISTS mkt_coin_event (
    id            BIGSERIAL PRIMARY KEY,
    buyer_id      UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    delta         INT NOT NULL,           -- + earned, - spent
    balance_after INT,                    -- running balance snapshot after this event (nullable)
    reason        TEXT NOT NULL,          -- category key: raid_win | spin_prize | boss_reward | quest_reward |
                                          -- badge_reward | chest_reward | checkin | bounty | giveaway | sell_gear |
                                          -- xp_accrual | coin_purchase | admin_grant | buy_gear | buy_pet |
                                          -- buy_badge | buy_cosmetic | buy_consumable | buy_daily_deal |
                                          -- upgrade | cooldown_skip | buy_digs | buy_spin | merchant_buy |
                                          -- happy_hour | trade | raid_loss
    ref           TEXT,                   -- related entity id (item id, offer id, tool id, etc.)
    meta          JSONB,                  -- freeform context (name, kind, level, outcome, ...)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coin_event_buyer ON mkt_coin_event(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_event_reason ON mkt_coin_event(reason);
