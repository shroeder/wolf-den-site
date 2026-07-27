-- Custom farm backgrounds become a LIBRARY: a member keeps every background they generate and equips one at a
-- time (or none → the default weather scenes). Replaces the single farm_bg_url + farm_bg_on flag.
CREATE TABLE IF NOT EXISTS mkt_farm_bg (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL,
    url        TEXT NOT NULL,
    prompt     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mkt_farm_bg_buyer_idx ON mkt_farm_bg (buyer_id, created_at DESC);

-- Which library background is equipped (NULL = default scenes). Draft prompt lets the accepted bg keep its name.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_bg_active_id    BIGINT;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_bg_draft_prompt TEXT;

-- Backfill each member's existing single background into the library, and equip it if it was currently on.
INSERT INTO mkt_farm_bg (buyer_id, url)
SELECT id, farm_bg_url FROM mkt_buyer WHERE farm_bg_url IS NOT NULL AND farm_bg_url <> '';

UPDATE mkt_buyer b
   SET farm_bg_active_id = fb.id
  FROM mkt_farm_bg fb
 WHERE fb.buyer_id = b.id
   AND fb.url = b.farm_bg_url
   AND COALESCE(b.farm_bg_on, TRUE) = TRUE;
