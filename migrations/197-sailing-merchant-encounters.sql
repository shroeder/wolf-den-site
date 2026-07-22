-- Track how many times a player has encountered the Gold Merchant, so the exclusive elephant pet unlocks on
-- the 10th encounter (instead of being tied to a "perfect" coin-catch run, which was too easy).
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS merchant_encounters INTEGER NOT NULL DEFAULT 0;
