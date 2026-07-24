-- Custom (player-made) decorations. A member spends a "creation credit" (granted when they load $5+ of store
-- credit) to design their own decoration: describe it → the art pipeline draws 3 options → up to 2 refine
-- attempts (3 generations total) → they pick one. Personal-only + never tradeable. Finalized customs are granted
-- into mkt_deco_owned as deco_id 'custom:<id>' and their sprite stored in mkt_deco_sprite under the same id.
CREATE TABLE IF NOT EXISTS mkt_custom_deco (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    prompt     TEXT NOT NULL,
    attempts   INT NOT NULL DEFAULT 0,          -- generations used (max 3: initial + 2 refines)
    options    JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ url, attempt }]
    chosen_url TEXT,
    status     TEXT NOT NULL DEFAULT 'drafting', -- drafting | final | abandoned
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_deco_buyer ON mkt_custom_deco (buyer_id, status);

-- Creation credits (1 granted per $5 of store credit loaded; owner can grant for testing).
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS custom_deco_credits INT NOT NULL DEFAULT 0;
