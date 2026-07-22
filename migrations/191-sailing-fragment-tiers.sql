-- Fragments now come in TIERS, one per chest tier (wooden…primordial). 10 of a tier forge that tier's chest.
-- Which tier a dug shard is depends on the voyage DURATION you chose (longer = better), capped for now at gold.
-- fragments_json holds the per-tier counts { "wooden": 12, "iron": 3, ... }; voyage_quality remembers the
-- chosen duration for the in-progress trip so dig resolution knows how good the shards should roll.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fragments_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS voyage_quality TEXT;

-- Carry any existing generic fragments over as the base (wooden) tier.
UPDATE mkt_sailing
   SET fragments_json = jsonb_build_object('wooden', fragments)
 WHERE COALESCE(fragments, 0) > 0
   AND (fragments_json IS NULL OR fragments_json = '{}'::jsonb);
