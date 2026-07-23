-- One-shot sailing consumable flags: guarantee a merchant / encounter on the next voyage, or boost the next dig.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS force_merchant BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS force_encounter BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS dig_lure BOOLEAN NOT NULL DEFAULT FALSE;
