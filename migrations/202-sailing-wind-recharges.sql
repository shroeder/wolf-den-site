-- Track how many EXTRA tailwinds were bought this voyage so the recharge cost can escalate (like dig refills).
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS wind_recharges INTEGER NOT NULL DEFAULT 0;
